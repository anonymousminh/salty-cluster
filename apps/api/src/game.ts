import {
  DWELL_SECONDS,
  OPENING_CIRCLE,
  boothQuiz,
  checkinXp,
  computeBoothStats,
  getBoothSlot,
  shrinkCircle,
  worldToGeo,
  type Booth,
  type BoothStats,
  type CheckinRequest,
  type CheckinResponse,
  type Circle,
  type GameState,
  type GameStatus,
  type GameView,
  type JoinRequest,
  type Leaderboard,
  type LeaderboardEntry,
  type NotEligibleReason,
  type OrganizerBooth,
  type OrganizerStats,
  type Progress,
  type Session,
  type Vec2,
} from '@meetspace/venue';
import type { FastifyBaseLogger } from 'fastify';
import type { Es } from './es/client';
import { GAME_DOC_ID, IDX } from './es/indices';
import { allBoothsQuery, boothsInZoneQuery, leaderboardQuery, organizerStatsQuery, playerCheckinsQuery, visitsPerBoothQuery } from './es/queries';
import { HttpError, isEsStatus } from './lib/errors';
import { hashPlayerId, newPlayerId, safeEqual } from './lib/ids';
import { checkinsCounter, checkinsRejected, circleChanges, gauges, playersJoined, pointsHistogram, setSpanAttributes, withSpan } from './lib/telemetry';

type Json = Record<string, unknown>;
interface Hit<T> {
  _id: string;
  _source?: T;
}
interface SearchRes<T> {
  hits: { hits: Hit<T>[]; total?: { value: number } | number };
  aggregations?: Json;
}
interface StoredBooth {
  id: string;
  slot_id: string;
  company: string;
  color: string;
  tagline: string;
  hiring?: string[];
  tags?: string[];
  code?: string;
}
interface PlayerDoc {
  name: string;
  show_on_leaderboard: boolean;
}
interface RankBucket {
  key: string;
  doc_count: number;
  xp: { value: number };
  bonus_xp: { value: number };
  name: { hits: { hits: Hit<{ leaderboard_name: string }>[] } };
}

export function defaultGameState(): GameState {
  return { status: 'lobby', round: 1, circle: OPENING_CIRCLE, updatedAt: new Date().toISOString() };
}

const toBooth = (b: StoredBooth): Booth => ({
  id: b.id,
  slotId: b.slot_id,
  company: b.company,
  color: b.color,
  tagline: b.tagline,
  ...(b.hiring ? { hiring: b.hiring } : {}),
  ...(b.tags ? { tags: b.tags } : {}),
});

const notEligible = (reason: NotEligibleReason, message: string) => {
  checkinsRejected.add(1, { reason });
  setSpanAttributes({ 'checkin.rejected': reason });
  return new HttpError(422, 'not_eligible', message, reason);
};

export class GameService {
  constructor(
    private es: Es,
    private salt: string,
    private log: FastifyBaseLogger,
  ) {}

  private hash(sessionId: string) {
    return hashPlayerId(sessionId, this.salt);
  }

  // ---------- Game state (circle, rounds) ----------

  /**
   * Current game state. If a scheduled shrink is due, apply it first. Several API
   * replicas may notice at once, so the write uses optimistic concurrency
   * (if_seq_no / if_primary_term): exactly one wins, the others get 409 and re-read.
   */
  async getState(now: number = Date.now()): Promise<GameState> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const doc = await this.readState();
      if (!doc) return defaultGameState();
      const { state, seqNo, primaryTerm } = doc;
      if (state.status !== 'live' || !state.nextShrink || Date.parse(state.nextShrink.at) > now) return state;

      const { nextShrink: _done, ...rest } = state;
      const next: GameState = {
        ...rest,
        circle: shrinkCircle(state.circle, state.nextShrink.factor, state.nextShrink.target),
        round: state.round + 1,
        updatedAt: new Date(now).toISOString(),
      };
      try {
        await this.es.index({ index: IDX.game, id: GAME_DOC_ID, document: stateDoc(next), if_seq_no: seqNo, if_primary_term: primaryTerm, refresh: 'wait_for' });
        circleChanges.add(1, { kind: 'scheduled_shrink' });
        gauges.radiusM = next.circle.radius;
        this.log.info({ event: 'circle.shrunk', scheduled: true, from_m: state.circle.radius, to_m: next.circle.radius, round: next.round }, 'scheduled shrink applied');
        return next;
      } catch (err) {
        if (!isEsStatus(err, 409)) throw err; // another replica applied it: re-read
      }
    }
    return (await this.readState())?.state ?? defaultGameState();
  }

  private async readState(): Promise<{ state: GameState; seqNo?: number; primaryTerm?: number } | undefined> {
    try {
      const res = (await this.es.get({ index: IDX.game, id: GAME_DOC_ID })) as unknown as {
        _source?: { state: GameState };
        _seq_no?: number;
        _primary_term?: number;
      };
      return res._source?.state ? { state: res._source.state, seqNo: res._seq_no, primaryTerm: res._primary_term } : undefined;
    } catch (err) {
      if (isEsStatus(err, 404)) return undefined;
      throw err;
    }
  }

  private async saveState(state: GameState): Promise<GameState> {
    const next = { ...state, updatedAt: new Date().toISOString() };
    await this.es.index({ index: IDX.game, id: GAME_DOC_ID, document: stateDoc(next), refresh: 'wait_for' });
    gauges.radiusM = next.circle.radius;
    return next;
  }

  async view(): Promise<GameView> {
    const state = await this.getState();
    return { state, inZoneBoothIds: [...(await this.inZone(state.circle))] };
  }

  /** Booths inside the circle: a geo_distance query over booth geo_points. */
  private async inZone(circle: Circle): Promise<Set<string>> {
    const res = (await this.es.search({ index: IDX.booths, ...boothsInZoneQuery(circle) } as never)) as unknown as SearchRes<never>;
    const ids = new Set(res.hits.hits.map((h) => h._id));
    gauges.boothsInZone = ids.size;
    return ids;
  }

  // ---------- Booths ----------

  private async storedBooths(withSecrets = false): Promise<StoredBooth[]> {
    const res = (await this.es.search({ index: IDX.booths, ...allBoothsQuery(withSecrets) } as never)) as unknown as SearchRes<StoredBooth>;
    const booths = res.hits.hits.flatMap((h) => (h._source ? [{ ...h._source, id: h._source.id ?? h._id }] : []));
    gauges.boothsTotal = booths.length;
    return booths;
  }

  async booths(): Promise<Booth[]> {
    return (await this.storedBooths()).map(toBooth);
  }

  /** Visits per booth (terms aggregation) turned into underdog bonuses with the shared scoring rules. */
  async stats(boothIds?: string[]): Promise<BoothStats> {
    const ids = boothIds ?? (await this.storedBooths()).map((b) => b.id);
    const res = (await this.es.search({ index: IDX.checkins, ...visitsPerBoothQuery() } as never)) as unknown as SearchRes<never>;
    const buckets = (res.aggregations?.booths as { buckets?: { key: string; doc_count: number }[] } | undefined)?.buckets ?? [];
    const visits: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
    for (const b of buckets) if (b.key in visits) visits[b.key] = b.doc_count;
    return computeBoothStats(visits);
  }

  // ---------- Players ----------

  async join(req: JoinRequest): Promise<Session> {
    const sessionId = newPlayerId();
    await this.es.index({
      index: IDX.players,
      id: this.hash(sessionId),
      document: {
        name: req.name,
        role: req.role,
        looking_for: req.lookingFor ?? [],
        skills: req.skills ?? [],
        color: req.color,
        show_on_leaderboard: req.showOnLeaderboard ?? true,
        created_at: new Date().toISOString(),
      },
      refresh: 'wait_for',
    });
    playersJoined.add(1);
    this.log.info({ event: 'player.joined' }, 'player joined');
    return { sessionId, name: req.name };
  }

  private async player(sessionId: string): Promise<PlayerDoc> {
    try {
      const res = (await this.es.get({ index: IDX.players, id: this.hash(sessionId) })) as unknown as { _source?: PlayerDoc };
      if (res._source) return res._source;
    } catch (err) {
      if (!isEsStatus(err, 404)) throw err;
    }
    throw new HttpError(401, 'unknown_session', 'Join the game first.');
  }

  private async ranking(): Promise<RankBucket[]> {
    const res = (await this.es.search({ index: IDX.checkins, ...leaderboardQuery() } as never)) as unknown as SearchRes<never>;
    return (res.aggregations?.players as { buckets?: RankBucket[] } | undefined)?.buckets ?? [];
  }

  async leaderboard(limit = 10, sessionId?: string): Promise<Leaderboard> {
    const buckets = await this.ranking();
    const me = sessionId ? this.hash(sessionId) : undefined;
    const toEntry = (b: RankBucket, i: number): LeaderboardEntry => ({
      rank: i + 1,
      name: b.name.hits.hits[0]?._source?.leaderboard_name ?? 'Anonymous',
      xp: b.xp.value,
      booths: b.doc_count,
      bonusXp: b.bonus_xp.value,
      ...(b.key === me ? { isMe: true } : {}),
    });
    const entries = buckets.slice(0, limit).map(toEntry);
    const myIndex = me ? buckets.findIndex((b) => b.key === me) : -1;
    return { entries, ...(myIndex >= 0 ? { me: toEntry(buckets[myIndex]!, myIndex) } : {}) };
  }

  async progress(sessionId: string): Promise<Progress> {
    await this.player(sessionId);
    const me = this.hash(sessionId);
    const [res, buckets, booths] = await Promise.all([
      this.es.search({ index: IDX.checkins, ...playerCheckinsQuery(me) } as never) as unknown as Promise<SearchRes<{ booth_id: string }>>,
      this.ranking(),
      this.storedBooths(),
    ]);
    const rank = buckets.findIndex((b) => b.key === me);
    return {
      xp: (res.aggregations?.xp as { value?: number } | undefined)?.value ?? 0,
      rank: rank >= 0 ? rank + 1 : buckets.length + 1,
      visitedBoothIds: res.hits.hits.flatMap((h) => (h._source ? [h._source.booth_id] : [])),
      totalBooths: booths.length,
    };
  }

  // ---------- Check-in ----------

  async checkin(sessionId: string, boothId: string, req: CheckinRequest): Promise<CheckinResponse> {
    const state = await this.getState();
    if (state.status !== 'live') {
      throw notEligible('game_not_live', state.status === 'lobby' ? "The game hasn't started yet." : 'The game is over. Check the leaderboard!');
    }
    const player = await this.player(sessionId);
    const all = await this.storedBooths(true);
    const booth = all.find((b) => b.id === boothId);
    if (!booth) throw new HttpError(404, 'unknown_booth', 'This booth does not exist.');

    return withSpan('checkin.score', { 'booth.id': booth.id, 'game.round': state.round, 'checkin.method': req.code ? 'qr' : 'game' }, async () => {
      // Proof of presence: the physical booth's QR code, or time spent at the virtual kiosk.
      // TODO: verify dwell from server-side presence pings once the presence channel exists.
      if (req.code !== undefined) {
        if (!booth.code || !safeEqual(req.code, booth.code)) throw notEligible('bad_code', 'This code is not valid for this booth.');
      } else if ((req.dwellMs ?? 0) < DWELL_SECONDS * 1000) {
        throw notEligible('dwell_too_short', `Chat with the booth for ${DWELL_SECONDS} seconds first.`);
      }

      // Same quiz as the client: generated from the booth list in slot order.
      const quiz = boothQuiz(toBooth(booth), all.map(toBooth));
      if (req.quizAnswer !== quiz.answerIndex) throw notEligible('wrong_answer', 'Not quite. Listen to the pitch and try again.');

      const zone = await this.inZone(state.circle);
      if (!zone.has(booth.id)) throw notEligible('in_storm', 'This booth is in the storm. Head inside the circle!');

      const stats = await this.stats(all.map((b) => b.id));
      const visits = stats[booth.id]?.visits ?? 0;
      const avg = Object.values(stats).reduce((a, s) => a + s.visits, 0) / Math.max(1, Object.keys(stats).length);
      const { base, bonus, xp } = checkinXp({ visits, avgVisits: avg, inZone: true });
      setSpanAttributes({ 'checkin.xp': xp, 'checkin.bonus': bonus });

      const playerHash = this.hash(sessionId);
      const slot = getBoothSlot(booth.slot_id);
      try {
        await this.es.index({
          index: IDX.checkins,
          id: `${playerHash}:${booth.id}`,
          op_type: 'create',
          refresh: 'wait_for',
          document: {
            '@timestamp': new Date().toISOString(),
            player_id: playerHash,
            leaderboard_name: player.show_on_leaderboard && player.name.trim() ? player.name.trim() : 'Anonymous',
            booth_id: booth.id,
            ...(slot ? { location: worldToGeo(slot.anchor) } : {}),
            method: req.code !== undefined ? 'qr' : 'game',
            base,
            bonus,
            xp,
            round: state.round,
          },
        });
      } catch (err) {
        if (isEsStatus(err, 409)) {
          checkinsRejected.add(1, { reason: 'already_visited' });
          throw new HttpError(409, 'already_visited', 'You already collected XP at this booth.');
        }
        throw err;
      }

      checkinsCounter.add(1, { booth: booth.id, method: req.code !== undefined ? 'qr' : 'game', bonus: bonus > 0 });
      pointsHistogram.record(xp, { booth: booth.id });
      this.log.info({ event: 'checkin.accepted', booth: booth.id, xp, bonus }, 'check-in accepted');
      const totalXp = (await this.progress(sessionId)).xp;
      return { xpGained: xp, base, bonus, totalXp };
    });
  }

  // ---------- Organizer ----------

  async setCircle(circle: Circle): Promise<GameState> {
    const state = await this.getState();
    circleChanges.add(1, { kind: 'set' });
    this.log.info({ event: 'circle.set', radius_m: circle.radius }, 'circle set');
    return this.saveState({ ...state, circle });
  }

  async shrink(factor: number, target?: Vec2): Promise<GameState> {
    const { nextShrink: _cancelled, ...state } = await this.getState();
    const circle = shrinkCircle(state.circle, factor, target);
    circleChanges.add(1, { kind: 'shrink' });
    this.log.info({ event: 'circle.shrunk', from_m: state.circle.radius, to_m: circle.radius, round: state.round + 1 }, 'circle shrunk');
    return this.saveState({ ...state, circle, round: state.round + 1 });
  }

  async scheduleShrink(inSeconds: number, factor: number, target?: Vec2): Promise<GameState> {
    const state = await this.getState();
    const at = new Date(Date.now() + inSeconds * 1000).toISOString();
    this.log.info({ event: 'circle.shrink_scheduled', in_s: inSeconds, factor }, 'shrink scheduled');
    return this.saveState({ ...state, nextShrink: { at, factor, ...(target ? { target } : {}) } });
  }

  async cancelScheduledShrink(): Promise<GameState> {
    const { nextShrink: _cancelled, ...state } = await this.getState();
    return this.saveState(state);
  }

  async setStatus(status: GameStatus): Promise<GameState> {
    const state = await this.getState();
    this.log.info({ event: 'game.status', status }, `game is now ${status}`);
    return this.saveState({ ...state, status });
  }

  async organizerBooths(): Promise<OrganizerBooth[]> {
    const state = await this.getState();
    const [all, zone] = await Promise.all([this.storedBooths(true), this.inZone(state.circle)]);
    const stats = await this.stats(all.map((b) => b.id));
    return all.map((b) => ({
      id: b.id,
      company: b.company,
      slotId: b.slot_id,
      anchor: getBoothSlot(b.slot_id)?.anchor ?? [0, 0],
      code: b.code ?? '',
      visits: stats[b.id]?.visits ?? 0,
      bonus: stats[b.id]?.bonus ?? 0,
      inZone: zone.has(b.id),
    }));
  }

  async organizerStats(): Promise<OrganizerStats & Json> {
    const res = (await this.es.search({ index: IDX.checkins, ...organizerStatsQuery() } as never)) as unknown as SearchRes<never>;
    const a = res.aggregations ?? {};
    const total = typeof res.hits.total === 'number' ? res.hits.total : (res.hits.total?.value ?? 0);
    const xp = (a.xp as { value?: number } | undefined)?.value ?? 0;
    const bonus = (a.bonus as { value?: number } | undefined)?.value ?? 0;
    return {
      checkins: total,
      players: (a.players as { value?: number } | undefined)?.value ?? 0,
      totalXp: xp,
      bonusShare: xp ? bonus / xp : null,
      perMinute: ((a.per_minute as { buckets?: { key_as_string: string; doc_count: number }[] } | undefined)?.buckets ?? []).map((b) => ({ t: b.key_as_string, count: b.doc_count })),
      heatmap: ((a.heatmap as { buckets?: { key: string; doc_count: number }[] } | undefined)?.buckets ?? []).map((b) => ({ tile: b.key, count: b.doc_count })),
    };
  }

  /** Fresh game: delete every check-in and reset the circle. Players are kept. */
  async reset(): Promise<GameState> {
    await this.es.deleteByQuery({ index: IDX.checkins, query: { match_all: {} }, refresh: true, conflicts: 'proceed' });
    this.log.info({ event: 'game.reset' }, 'game reset');
    return this.saveState(defaultGameState());
  }
}

/** The state is stored as an opaque object; the circle is also indexed as a geo_point for dashboards. */
function stateDoc(state: GameState): Json {
  return { state, circle_geo: worldToGeo(state.circle.center), radius_m: state.circle.radius, updated_at: state.updatedAt };
}
