import { useEffect, useMemo, useState } from 'react';
import {
  BASE_XP,
  DWELL_SECONDS,
  QUIZ_RETRY_SECONDS,
  boothQuiz,
  careerFit,
  isBounty,
  type Booth,
  type BoothStat,
  type CareerProfile,
} from '@meetspace/venue';
import { useGame } from '../store';

interface Props {
  booth: Booth;
  allBooths: Booth[];
  stat?: BoothStat;
  visited: boolean;
  profile?: CareerProfile;
  onCheckIn: (boothId: string) => void;
  onClose: () => void;
}

/**
 * Talking to a booth: company pitch + hiring roles, a short "chat" timer (dwell), then a
 * one-tap question. Answering correctly checks you in for XP (underdog bonus included).
 */
export function BoothDialog({ booth, allBooths, stat, visited, profile, onCheckIn, onClose }: Props) {
  const dwell = useGame((s) => s.dwell[booth.id] ?? 0);
  const near = useGame((s) => s.nearBoothId === booth.id);
  const quiz = useMemo(() => boothQuiz(booth, allBooths), [booth, allBooths]);
  const [picked, setPicked] = useState<number | null>(null);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const fit = careerFit(profile, booth.hiring, booth.tags);
  const bonus = stat?.bonus ?? 0;
  const chatted = dwell >= DWELL_SECONDS;
  const waiting = retryAt > now;

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const answer = (i: number) => {
    if (!chatted || waiting) return;
    setPicked(i);
    if (i === quiz.answerIndex) {
      onCheckIn(booth.id);
    } else {
      setRetryAt(Date.now() + QUIZ_RETRY_SECONDS * 1000);
      window.setTimeout(() => setPicked(null), QUIZ_RETRY_SECONDS * 1000);
    }
  };

  return (
    <div className="hud-dialog" role="dialog" aria-label={`${booth.company} booth`} style={{ borderTopColor: booth.color }}>
      <button className="hud-dialog__close" onClick={onClose} aria-label="Close (Esc)">
        ×
      </button>
      <div className="hud-dialog__title">
        <span className="dot" style={{ background: booth.color }} />
        {booth.company}
      </div>
      <div className="hud-dialog__pitch">“{booth.tagline}”</div>
      {booth.hiring && booth.hiring.length > 0 && (
        <div className="hud-dialog__row">
          <span className="lbl">Hiring</span>
          {booth.hiring.map((h) => (
            <span key={h} className={`chip${fit.includes(h) ? ' fit' : ''}`}>
              {h}
            </span>
          ))}
        </div>
      )}
      {fit.length > 0 && <div className="hud-dialog__fit">✨ Career fit: {fit.join(', ')}</div>}

      {visited ? (
        <div className="hud-dialog__done">✓ Checked in. You already collected XP here.</div>
      ) : (
        <>
          <div className="hud-dialog__xp">
            Check-in reward: <b className={isBounty(stat) ? 'gold' : ''}>+{BASE_XP + bonus} XP</b>
            {bonus > 0 && <small> (incl. +{bonus} underdog bonus)</small>}
          </div>
          {!chatted ? (
            <div className="hud-dialog__chat">
              <div className="bar">
                <div style={{ width: `${Math.min(100, (dwell / DWELL_SECONDS) * 100)}%` }} />
              </div>
              {near ? `Chatting with the team… ${Math.ceil(DWELL_SECONDS - dwell)}s` : 'Walk back to the booth to keep chatting'}
            </div>
          ) : (
            <div className="hud-dialog__quiz">
              <div className="q">{quiz.question}</div>
              {quiz.options.map((o, i) => (
                <button
                  key={i}
                  className={picked === i ? (i === quiz.answerIndex ? 'right' : 'wrong') : ''}
                  onClick={() => answer(i)}
                  disabled={waiting}
                >
                  {o}
                </button>
              ))}
              {waiting && <div className="retry">Not quite. Listen to the pitch and try again in {Math.ceil((retryAt - now) / 1000)}s</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
