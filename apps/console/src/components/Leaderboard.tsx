import type { LeaderboardEntry } from '@meetspace/venue';

const MEDALS = ['🥇', '🥈', '🥉'];

export function Leaderboard({ entries }: { entries: LeaderboardEntry[] }) {
  if (!entries.length) return <p className="muted">No check-ins yet.</p>;
  return (
    <ol className="leaderboard">
      {entries.map((e) => (
        <li key={e.rank}>
          <span className="rank" aria-hidden="true">
            {MEDALS[e.rank - 1] ?? e.rank}
          </span>
          <span className="name">
            {e.name}
            {e.rank <= 3 && <span className="sr-only"> (rank {e.rank}, prize position)</span>}
          </span>
          <span className="points">{e.xp} XP</span>
          <span className="muted small">
            {e.booths} booths{e.bonusXp ? ` · ${e.bonusXp} underdog XP` : ''}
          </span>
        </li>
      ))}
    </ol>
  );
}
