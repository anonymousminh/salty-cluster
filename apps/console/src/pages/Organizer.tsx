import { useState, type FormEvent } from 'react';
import type { GameStatus, Vec2 } from '@meetspace/venue';
import { api } from '../api';
import { storage, usePoll } from '../hooks';
import { FloorMap } from '../components/FloorMap';
import { Qr } from '../components/Qr';
import { Countdown } from '../components/Countdown';
import { track } from '../telemetry';

const tokenStore = storage('meetspace.organizerToken');

export function Organizer() {
  const [token, setToken] = useState(() => tokenStore.get() ?? '');
  if (!token)
    return (
      <TokenGate
        onToken={(t) => {
          tokenStore.set(t);
          setToken(t);
        }}
      />
    );
  return (
    <Console
      token={token}
      onLogout={() => {
        tokenStore.remove();
        setToken('');
      }}
    />
  );
}

function TokenGate({ onToken }: { onToken: (t: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <form
      className="card narrow"
      onSubmit={(e) => {
        e.preventDefault();
        onToken(value.trim());
      }}
    >
      <h2>Organizer console</h2>
      <label htmlFor="org-token">Organizer token</label>
      <input id="org-token" type="password" value={value} onChange={(e) => setValue(e.target.value)} required autoComplete="current-password" />
      <button type="submit">Open console</button>
    </form>
  );
}

function Console({ token, onLogout }: { token: string; onLogout: () => void }) {
  const org = api.organizer(token);
  const game = usePoll(() => api.game(), 3000);
  const booths = usePoll(() => org.booths(), 5000, [token]);
  const stats = usePoll(() => org.stats(), 5000, [token]);
  const [picked, setPicked] = useState<Vec2>();
  const [radius, setRadius] = useState<number>();
  const [factor, setFactor] = useState(0.7);
  const [towardPick, setTowardPick] = useState(true);
  const [inMinutes, setInMinutes] = useState(5);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  if (booths.error && (booths.error as { status?: number }).status === 401) {
    return (
      <div className="card narrow">
        <p role="alert" className="error">
          That organizer token was rejected.
        </p>
        <button onClick={onLogout}>Try another token</button>
      </div>
    );
  }

  const state = game.data?.state;
  const run = async (label: string, fn: () => Promise<unknown>) => {
    setError(undefined);
    try {
      await fn();
      setMessage(label);
      track('organizer_action', { action: label });
      await Promise.all([game.refresh(), booths.refresh(), stats.refresh()]);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const preview = state && (picked || radius) ? { center: picked ?? state.circle.center, radius: radius ?? state.circle.radius } : undefined;
  const applyCircle = (e: FormEvent) => {
    e.preventDefault();
    if (preview)
      void run(`Circle set to ${Math.round(preview.radius)} m`, () => org.setCircle(preview)).then(() => {
        setPicked(undefined);
        setRadius(undefined);
      });
  };
  const target = towardPick ? picked : undefined;

  return (
    <div className="layout">
      <section className="main-col">
        <div className="card toolbar">
          <span>
            Status: <strong>{state?.status ?? '…'}</strong> · Round {state?.round ?? '…'}
          </span>
          {(['lobby', 'live', 'ended'] as GameStatus[]).map((s) => (
            <button key={s} disabled={state?.status === s} onClick={() => run(`Game is now ${s}`, () => org.setStatus(s))}>
              {s === 'live' ? '▶ Start' : s === 'ended' ? '■ End' : 'Lobby'}
            </button>
          ))}
          <button className="danger" onClick={() => confirm('Delete every check-in and reset the circle?') && run('Game reset', () => org.reset())}>
            Reset
          </button>
          <button className="link" onClick={onLogout}>
            Log out
          </button>
        </div>
        {state?.status === 'live' && state.nextShrink && <Countdown shrink={state.nextShrink} />}
        <p className="small muted">Click the map to pick a point: the new circle centre, or the target to shrink toward.</p>
        {game.data && booths.data && (
          <FloorMap
            booths={booths.data.map((b) => ({ ...b, inZone: game.data!.inZoneBoothIds.includes(b.id) }))}
            circle={game.data.state.circle}
            onPick={setPicked}
            picked={picked}
            preview={preview}
          />
        )}
        <div className="controls">
          <form className="card" onSubmit={applyCircle}>
            <h3>Move circle</h3>
            <label htmlFor="radius">Radius: {Math.round(radius ?? state?.circle.radius ?? 0)} m</label>
            <input id="radius" type="range" min={6} max={80} value={Math.round(radius ?? state?.circle.radius ?? 40)} onChange={(e) => setRadius(Number(e.target.value))} />
            <button type="submit" disabled={!preview}>
              Apply circle
            </button>
          </form>
          <div className="card">
            <h3>Shrink (next round)</h3>
            <label htmlFor="factor">Keep {Math.round(factor * 100)}% of the radius</label>
            <input id="factor" type="range" min={0.3} max={0.95} step={0.05} value={factor} onChange={(e) => setFactor(Number(e.target.value))} />
            <label className="option">
              <input type="checkbox" checked={towardPick} onChange={(e) => setTowardPick(e.target.checked)} disabled={!picked} /> Move toward the picked point
            </label>
            <div className="toolbar">
              <button onClick={() => run('Circle shrunk', () => org.shrink(factor, target)).then(() => setPicked(undefined))}>Shrink now</button>
            </div>
            <label htmlFor="in-minutes">Or schedule it in {inMinutes} min (players see a countdown)</label>
            <input id="in-minutes" type="range" min={1} max={30} value={inMinutes} onChange={(e) => setInMinutes(Number(e.target.value))} />
            <div className="toolbar">
              <button onClick={() => run(`Shrink scheduled in ${inMinutes} min`, () => org.scheduleShrink(inMinutes * 60, factor, target))}>Schedule shrink</button>
              {state?.nextShrink && (
                <button className="link" onClick={() => run('Scheduled shrink cancelled', () => org.cancelShrink())}>
                  Cancel scheduled shrink
                </button>
              )}
            </div>
          </div>
        </div>
        <div role="status" aria-live="polite">
          {message && <p className="muted">✓ {message}</p>}
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>

      <aside className="side-col">
        <section className="card">
          <h2>Live stats</h2>
          <dl className="stats">
            <dt>Check-ins</dt>
            <dd>{stats.data?.checkins ?? 0}</dd>
            <dt>Players scoring</dt>
            <dd>{stats.data?.players ?? 0}</dd>
            <dt>XP from underdog bonuses</dt>
            <dd>{stats.data?.bonusShare == null ? '–' : `${Math.round(stats.data.bonusShare * 100)}%`}</dd>
          </dl>
        </section>
        <section className="card">
          <h2>Booth traffic</h2>
          <table>
            <thead>
              <tr>
                <th scope="col">Booth</th>
                <th scope="col">Visits</th>
                <th scope="col">Zone</th>
                <th scope="col">Bonus</th>
              </tr>
            </thead>
            <tbody>
              {[...(booths.data ?? [])]
                .sort((a, b) => b.visits - a.visits)
                .map((b) => (
                  <tr key={b.id}>
                    <td>{b.company}</td>
                    <td>{b.visits}</td>
                    <td>{game.data?.inZoneBoothIds.includes(b.id) ? 'in' : 'storm'}</td>
                    <td>{b.bonus}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      </aside>

      <section className="card qr-sheet full">
        <div className="toolbar">
          <h2>Booth QR codes (for physical booths)</h2>
          <button onClick={() => window.print()}>Print</button>
        </div>
        <div className="qr-grid">
          {(booths.data ?? []).map((b) => {
            const url = `${window.location.origin}${window.location.pathname}#/checkin/${b.id}?code=${b.code}`;
            return (
              <figure key={b.id} className="qr">
                <Qr value={url} label={b.company} />
                <figcaption>
                  <strong>{b.company}</strong>
                  <br />
                  <code>{b.code}</code>
                </figcaption>
              </figure>
            );
          })}
        </div>
      </section>
    </div>
  );
}
