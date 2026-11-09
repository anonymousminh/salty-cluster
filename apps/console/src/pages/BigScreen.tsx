import { api } from '../api';
import { usePoll } from '../hooks';
import { FloorMap } from '../components/FloorMap';
import { Leaderboard } from '../components/Leaderboard';
import { Countdown } from '../components/Countdown';

/** For the screen next to the Keynote Stage (and the real one at the venue). */
export function BigScreen() {
  const game = usePoll(() => api.game(), 3000);
  const booths = usePoll(() => api.booths(), 60_000);
  const stats = usePoll(() => api.stats(), 5000);
  const board = usePoll(() => api.leaderboard(10), 3000);
  const entries = board.data?.entries ?? [];
  const zone = new Set(game.data?.inZoneBoothIds ?? []);
  const underdogHunter = [...entries].sort((a, b) => b.bonusXp - a.bonusXp)[0];

  return (
    <div className="screen">
      <header>
        <h1>MeetSpace Battle Royale</h1>
        {game.data && (
          <p className="big">
            Round {game.data.state.round} · {zone.size} booths in the zone · {game.data.state.status.toUpperCase()}
          </p>
        )}
        {game.data?.state.status === 'live' && game.data.state.nextShrink && <Countdown shrink={game.data.state.nextShrink} />}
      </header>
      <div className="layout">
        <section className="main-col">
          {game.data && booths.data && (
            <FloorMap
              booths={booths.data.map((b) => ({ ...b, visits: stats.data?.[b.id]?.visits, bonus: stats.data?.[b.id]?.bonus, inZone: zone.has(b.id) }))}
              circle={game.data.state.circle}
            />
          )}
        </section>
        <aside className="side-col">
          <div className="podium" aria-label="Top 3">
            {entries.slice(0, 3).map((e) => (
              <div key={e.rank} className={`step step-${e.rank}`}>
                <span className="medal" aria-hidden="true">
                  {['🥇', '🥈', '🥉'][e.rank - 1]}
                </span>
                <strong>{e.name}</strong>
                <span>{e.xp} XP</span>
              </div>
            ))}
          </div>
          {underdogHunter && underdogHunter.bonusXp > 0 && (
            <p className="card small">
              🔥 Underdog hunter: <strong>{underdogHunter.name}</strong> ({underdogHunter.bonusXp} bonus XP)
            </p>
          )}
          <Leaderboard entries={entries} />
        </aside>
      </div>
    </div>
  );
}
