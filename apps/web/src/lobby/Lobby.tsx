import { useEffect, useState, type FormEvent } from 'react';
import { BOOTH_SLOTS, MAX_BONUS, BASE_XP, DWELL_SECONDS } from '@meetspace/venue';
import { AVATAR_COLORS, LOOKING_FOR, type PlayerProfile } from './profile';
import { CharacterPreview } from './CharacterPreview';
import './lobby.css';

/**
 * Pre-conference lobby: everyone signs in here first (player card), sees who else is
 * joining, learns the booth quest rules, then enters the conference map.
 * Rendered over the venue scene, which slowly orbits behind it.
 */
export function Lobby({ initial, onEnter }: { initial: PlayerProfile; onEnter: (p: PlayerProfile) => void }) {
  const [p, setP] = useState<PlayerProfile>(initial);
  const [skillsText, setSkillsText] = useState(initial.skills.join(', '));
  const [joining, setJoining] = useState(false);
  const feed = useJoinFeed();

  const ready = p.name.trim().length > 0 && p.role.trim().length > 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready || joining) return;
    setJoining(true);
    const profile = { ...p, name: p.name.trim(), role: p.role.trim(), skills: splitList(skillsText) };
    // Real app: POST /events/:id/join → session; mocked with a short delay.
    window.setTimeout(() => onEnter(profile), 500);
  };

  const toggle = (item: string) =>
    setP((cur) => ({ ...cur, lookingFor: cur.lookingFor.includes(item) ? cur.lookingFor.filter((x) => x !== item) : [...cur.lookingFor, item] }));

  return (
    <div className="lobby">
      <header className="lobby-top">
        <div className="lobby-brand">
          MEET<span>SPACE</span>
        </div>
        <div className="lobby-event">Expo Park · virtual conference</div>
        <div className="lobby-live">
          <span className="pulse" /> {feed.count} in lobby
        </div>
      </header>

      <form className="lobby-card lobby-player" onSubmit={submit}>
        <h2>Create your player</h2>
        <label>
          Display name
          <input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="Alex" maxLength={24} autoFocus required />
        </label>
        <label>
          Role
          <input value={p.role} onChange={(e) => setP({ ...p, role: e.target.value })} placeholder="ML Engineer" maxLength={40} required />
        </label>
        <fieldset>
          <legend>Looking for</legend>
          <div className="lobby-chips">
            {LOOKING_FOR.map((item) => (
              <button type="button" key={item} className={p.lookingFor.includes(item) ? 'on' : ''} onClick={() => toggle(item)} aria-pressed={p.lookingFor.includes(item)}>
                {item}
              </button>
            ))}
          </div>
        </fieldset>
        <label>
          Skills <small>(comma separated)</small>
          <input value={skillsText} onChange={(e) => setSkillsText(e.target.value)} placeholder="Python, PyTorch, React" />
        </label>
        <CharacterPreview color={p.color} />
        <fieldset>
          <legend>Avatar color</legend>
          <div className="lobby-colors">
            {AVATAR_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className={p.color === c ? 'on' : ''}
                style={{ background: c }}
                onClick={() => setP({ ...p, color: c })}
                aria-label={`Avatar color ${c}`}
                aria-pressed={p.color === c}
              />
            ))}
          </div>
        </fieldset>
        <label className="lobby-check">
          <input type="checkbox" checked={p.showOnLeaderboard} onChange={(e) => setP({ ...p, showOnLeaderboard: e.target.checked })} />
          Show my name on the leaderboard <small>(otherwise "Anonymous")</small>
        </label>

        <button className="lobby-enter" type="submit" disabled={!ready || joining}>
          {joining ? 'Entering…' : 'Enter conference ▶'}
        </button>
      </form>

      <aside className="lobby-side">
        <div className="lobby-card lobby-rules">
          <h2>Today's quest</h2>
          <ol>
            <li>
              <b>Explore Expo Park</b>: walk with <kbd>WASD</kbd> (or the joystick), run with <kbd>Shift</kbd>, jump with <kbd>Space</kbd>.
            </li>
            <li>
              <b>Visit sponsor booths</b>: {BOOTH_SLOTS.length} companies on Expo Street and in the Careers Corner. Walk up, press <kbd>E</kbd>, chat
              for {DWELL_SECONDS}s and answer one quick question to earn <b>{BASE_XP} XP</b>.
            </li>
            <li>
              <b>Quiet booths pay more</b>: up to <b className="gold">+{MAX_BONUS} bonus XP</b>. Look for the gold beams.
            </li>
            <li>
              <b>Match & meet</b>: swipe on people, then follow the waypoint to a meetup point in the Networking Garden.
            </li>
          </ol>
        </div>
        <div className="lobby-card lobby-feed">
          <h2>Joining now</h2>
          <ul>
            {feed.items.map((j) => (
              <li key={j.id}>
                <span className="dot" style={{ background: j.color }} />
                <b>{j.name}</b> <span>{j.role}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function splitList(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

const FEED_NAMES = ['Priya', 'Marcus', 'Elena', 'Jun', 'Sofia', 'Diego', 'Aisha', 'Tom', 'Mei', 'Omar', 'Hana', 'Lucas', 'Grace', 'Ravi'];
const FEED_ROLES = ['Founder', 'ML Engineer', 'Designer', 'Recruiter', 'Student', 'Investor', 'PM', 'Data Scientist', 'Backend Engineer'];

/** Mock "who's joining" ticker (real app: SSE presence count + recent joins). */
function useJoinFeed() {
  const [count, setCount] = useState(312);
  const [items, setItems] = useState<{ id: number; name: string; role: string; color: string }[]>(() =>
    [0, 1, 2, 3].map((i) => ({ id: i, name: FEED_NAMES[i]!, role: FEED_ROLES[i]!, color: AVATAR_COLORS[i % AVATAR_COLORS.length]! })),
  );
  useEffect(() => {
    let n = 4;
    const t = window.setInterval(() => {
      n += 1;
      setCount((c) => c + 1 + (n % 3));
      setItems((cur) =>
        [{ id: n, name: FEED_NAMES[n % FEED_NAMES.length]!, role: FEED_ROLES[(n * 5) % FEED_ROLES.length]!, color: AVATAR_COLORS[n % AVATAR_COLORS.length]! }, ...cur].slice(0, 6),
      );
    }, 1600);
    return () => window.clearInterval(t);
  }, []);
  return { count, items };
}
