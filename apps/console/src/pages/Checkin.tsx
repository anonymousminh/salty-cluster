import { useState, type FormEvent } from 'react';
import { boothQuiz, type CheckinResponse, type Session } from '@meetspace/venue';
import { api, ApiError, loadSession, saveSession } from '../api';
import { usePoll } from '../hooks';
import { track } from '../telemetry';

/**
 * Physical booth check-in: the QR sticker at a real booth opens this page with the booth's code.
 * Same quiz as in the 3D game; the code replaces the "stay near the kiosk" dwell timer.
 */
export function Checkin({ boothId, code }: { boothId: string; code: string }) {
  const [session, setSession] = useState<Session | null>(loadSession);
  const booths = usePoll(() => api.booths(), 60_000);
  const game = usePoll(() => api.game(), 5000);
  const [answer, setAnswer] = useState<number>();
  const [result, setResult] = useState<CheckinResponse>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  if (!session) return <JoinInline onJoined={setSession} />;
  if (booths.error && !booths.data)
    return (
      <p role="alert" className="error narrow">
        Can't reach the game server. Retrying…
      </p>
    );
  if (!booths.data || !game.data)
    return (
      <p className="narrow" role="status">
        Loading booth…
      </p>
    );
  const booth = booths.data.find((b) => b.id === boothId);
  if (!booth)
    return (
      <p role="alert" className="error narrow">
        Unknown booth. Scan the QR code again.
      </p>
    );
  const quiz = boothQuiz(booth, booths.data);
  const inZone = game.data.inZoneBoothIds.includes(booth.id);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (answer === undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      const r = await api.checkinWithCode(session.sessionId, boothId, code, answer);
      setResult(r);
      track('checkin', { booth: boothId, method: 'qr', xp: r.xpGained });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        saveSession(null);
        setSession(null);
        return;
      }
      setError(err instanceof ApiError ? err.message : "Couldn't check in. Try again.");
      track('checkin_failed', { booth: boothId, reason: err instanceof ApiError ? (err.reason ?? err.code) : 'network' });
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div className="narrow">
        <section className="card result good" role="status">
          <h2>+{result.xpGained} XP</h2>
          <p>
            {result.bonus > 0 ? `Including a +${result.bonus} underdog bonus for visiting a quiet booth!` : 'Nice! Quiet booths pay an underdog bonus. Try one next.'}
          </p>
          <p className="muted">Total: {result.totalXp} XP</p>
          <a className="button" href="#/">
            Back
          </a>
        </section>
      </div>
    );
  }

  return (
    <div className="narrow">
      <section className="card" style={{ borderTop: `6px solid ${booth.color}` }}>
        <h2>{booth.company}</h2>
        <p>“{booth.tagline}”</p>
        {!inZone && (
          <p className="warning" role="alert">
            ⚠️ This booth is in the storm. Check-ins here earn no XP until the circle covers it.
          </p>
        )}
        <form onSubmit={submit}>
          <fieldset>
            <legend>{quiz.question}</legend>
            {quiz.options.map((opt, i) => (
              <label key={i} className="option">
                <input type="radio" name="answer" value={i} checked={answer === i} onChange={() => setAnswer(i)} /> {opt}
              </label>
            ))}
          </fieldset>
          <button type="submit" disabled={busy || answer === undefined}>
            {busy ? 'Checking in…' : 'Submit answer'}
          </button>
        </form>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}

function JoinInline({ onJoined }: { onJoined: (s: Session) => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const s = await api.join(name.trim());
      saveSession(s);
      onJoined(s);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <form className="card narrow" onSubmit={submit}>
      <h2>Join the battle</h2>
      <p className="muted">Pick a name for the leaderboard. You'll come straight back to this booth.</p>
      <label htmlFor="player-name">Display name</label>
      <input id="player-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} required autoComplete="nickname" />
      <button type="submit" disabled={!name.trim()}>
        Join
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </form>
  );
}
