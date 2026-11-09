import { useEffect, useState } from 'react';
import type { GameView } from '@meetspace/venue';

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Battle-royale status: round, booths in the safe zone, and a countdown to the next shrink.
 * The ticking clock is hidden from screen readers; they get a calm per-minute summary.
 */
export function ZoneBanner({ game }: { game: GameView }) {
  const [now, setNow] = useState(Date.now());
  const shrink = game.state.nextShrink;
  useEffect(() => {
    if (!shrink) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [shrink]);

  const { status, round } = game.state;
  if (status === 'lobby') return <div className="hud-zone">⏳ The battle starts soon. Explore Expo Park!</div>;
  if (status === 'ended') return <div className="hud-zone ended">🏁 Game over. Winners at the Keynote Stage!</div>;

  const left = shrink ? Date.parse(shrink.at) - now : 0;
  const minutes = Math.max(0, Math.ceil(left / 60_000));
  return (
    <div className={`hud-zone${shrink && left < 30_000 ? ' urgent' : ''}`}>
      <span>
        <b>Round {round}</b> · {game.inZoneBoothIds.length} booths in the zone
      </span>
      {shrink && (
        <>
          <span aria-hidden="true">
            {' '}
            · ⏱ shrinks in <b>{fmt(left)}</b>
          </span>
          <span className="sr-only">{left <= 0 ? 'The circle is shrinking now.' : `The circle shrinks in about ${minutes} minute${minutes === 1 ? '' : 's'}.`}</span>
        </>
      )}
    </div>
  );
}
