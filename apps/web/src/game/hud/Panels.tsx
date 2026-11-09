import { useEffect, useState } from 'react';
import {
  type Leaderboard,
  type Progress,
  type QuestEvent,
} from '@meetspace/venue';
import { useDemoStore } from '../demo/store';

export const XP_PER_LEVEL = 100;

/** XP, level, rank and booth progress along the bottom of the map. */
export function XpBar({ progress, compact }: { progress?: Progress; compact?: boolean }) {
  if (!progress) return null;
  const level = Math.floor(progress.xp / XP_PER_LEVEL) + 1;
  const inLevel = progress.xp % XP_PER_LEVEL;
  return (
    <div className={`hud-xp${compact ? ' compact' : ''}`}>
      <div className="hud-xp__lvl">LV {level}</div>
      <div className="hud-xp__bar" role="progressbar" aria-valuenow={inLevel} aria-valuemin={0} aria-valuemax={XP_PER_LEVEL}>
        <div className="hud-xp__fill" style={{ width: `${inLevel}%` }} />
        <span>
          {progress.xp} XP
        </span>
      </div>
      <div className="hud-xp__stat" title="Leaderboard rank">
        #{progress.rank}
      </div>
      <div className="hud-xp__stat" title="Booths visited">
        🏁 {progress.visitedBoothIds.length}/{progress.totalBooths}
      </div>
    </div>
  );
}

const TOAST_MS = 4500;

/** Short-lived notifications for quest events (booth visits, new leader). */
export function Toasts({ events }: { events: QuestEvent[] }) {
  const [now, setNow] = useState(() => Date.now());
  const live = events.filter((e) => now - e.at < TOAST_MS).slice(-3);
  useEffect(() => {
    if (live.length === 0) return;
    const t = window.setInterval(() => setNow(Date.now()), 400);
    return () => window.clearInterval(t);
  }, [live.length]);
  useEffect(() => setNow(Date.now()), [events]);

  return (
    <div className="hud-toasts" aria-live="polite">
      {live.map((e) =>
        e.type === 'booth.visited' ? (
          <div key={e.id} className={`hud-toast${e.bonus > 0 ? ' bonus' : ''}`}>
            <b>+{e.base + e.bonus} XP</b> {e.company}
            {e.bonus > 0 && <span className="hud-toast__tag">Underdog bonus +{e.bonus}</span>}
          </div>
        ) : (
          <div key={e.id} className="hud-toast leader">
            👑 New #1: <b>{e.name}</b>
          </div>
        ),
      )}
    </div>
  );
}

/** Collapsible top-10 with the attendee's own row and the "underdog hunter" tag. */
export function LeaderboardPanel({ leaderboard }: { leaderboard?: Leaderboard }) {
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 640);
  const demoStats = useDemoStore((s) => s.stats);
  if (!leaderboard) return null;
  
  // Enhance entries with demo data
  const enhancedEntries = leaderboard.entries.map((e) => {
    if (e.isMe) {
      return {
        ...e,
        demosCompleted: demoStats.demosCompleted,
        totalPoints: demoStats.totalPoints || e.xp,
      };
    }
    return e;
  });
  
  const enhancedMe = leaderboard.me ? {
    ...leaderboard.me,
    demosCompleted: demoStats.demosCompleted,
    totalPoints: demoStats.totalPoints || leaderboard.me.xp,
  } : undefined;
  
  const hunter = enhancedEntries.reduce<Leaderboard['entries'][number] | null>(
    (best, e) => (!best || e.bonusXp > best.bonusXp ? e : best),
    null,
  )?.name;
  const meInTop = enhancedEntries.some((e) => e.isMe);
  return (
    <div className={`hud-lb${open ? '' : ' closed'}`}>
      <button className="hud-lb__head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>Booth Quest · Leaderboard</span>
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ol className="hud-lb__list">
          {enhancedEntries.map((e) => (
            <Row key={e.rank} e={e} hunter={e.name === hunter && e.bonusXp > 0} />
          ))}
          {!meInTop && enhancedMe && (
            <>
              <li className="hud-lb__gap">⋯</li>
              <Row e={enhancedMe} hunter={false} />
            </>
          )}
        </ol>
      )}
    </div>
  );
}

function Row({ e, hunter }: { e: Leaderboard['entries'][number]; hunter: boolean }) {
  const totalPts = (e as any).totalPoints ?? e.xp;
  const demos = (e as any).demosCompleted;
  return (
    <li className={`hud-lb__row${e.isMe ? ' me' : ''}${e.rank <= 3 ? ` top${e.rank}` : ''}`}>
      <span className="rank">{e.rank}</span>
      <span className="name">
        {(e as any).avatar && <span style={{ marginRight: '4px' }}>{(e as any).avatar}</span>}
        {e.name}
        {hunter && <span className="hunter" title="Most underdog bonus XP">🔥 underdog hunter</span>}
      </span>
      <span className="booths" title="Booths visited">{e.booths}🏁{demos !== undefined ? `/${demos}🎯` : ''}</span>
      <span className="xp">{totalPts}</span>
    </li>
  );
}
