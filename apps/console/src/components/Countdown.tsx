import { useEffect, useState } from 'react';
import type { ScheduledShrink } from '@meetspace/venue';

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Ticking clock for sighted users; a calm once-a-minute summary for screen readers. */
export function Countdown({ shrink }: { shrink: ScheduledShrink }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Date.parse(shrink.at) - now;
  const minutes = Math.max(0, Math.ceil(left / 60_000));
  return (
    <p className={`countdown ${left <= 30_000 ? 'urgent' : ''}`}>
      <span aria-hidden="true">
        ⏱ Circle shrinks to {Math.round(shrink.factor * 100)}% in <strong>{fmt(left)}</strong>
      </span>
      <span className="sr-only">{left <= 0 ? 'The circle is shrinking now.' : `The circle shrinks in about ${minutes} minute${minutes === 1 ? '' : 's'}.`}</span>
    </p>
  );
}
