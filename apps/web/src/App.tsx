import { useEffect, useMemo, useRef, useState } from 'react';
import { boothFront, getBoothSlot, getSpot, isBounty, type Vec2 } from '@meetspace/venue';
import { GameCanvas } from './game/GameCanvas';
import { GameHud, resolveTarget } from './game/hud/GameHud';
import { formatTime, mockSuggest, useMockAvailability, type SpotSuggestion } from './game/mock';
import { useQuest } from './game/quest';
import { useRealtime } from './game/net/useRealtime';
import { useGame } from './game/store';
import { Lobby } from './lobby/Lobby';
import { EMPTY_PROFILE, loadProfile, saveProfile, toCareerProfile, type PlayerProfile } from './lobby/profile';
import './app.css';
import { DemoExperience } from './game/demo/DemoExperience';
import { DemoQuiz } from './game/demo/DemoQuiz';
import { useDemoStore } from './game/demo/store';
import { DemoProgressUI } from './game/demo/DemoProgressUI';
import { DemoAdminPanel } from './game/demo/DemoAdminPanel';

const demoParams = new URLSearchParams(window.location.search);
/** `?name=Sam&color=22d3ee` lets several demo windows join as different players. */
const demoColor = demoParams.get('color');
const DEMO_PROFILE: PlayerProfile = {
  name: (demoParams.get('name') ?? '').trim().slice(0, 24) || 'Alex',
  role: 'ML Engineer',
  lookingFor: ['Full-time job', 'Cofounder'],
  skills: ['Python', 'PyTorch', 'React'],
  color: demoColor && /^[0-9a-fA-F]{6}$/.test(demoColor) ? `#${demoColor}` : '#f472b6',
  showOnLeaderboard: true,
};

/**
 * MeetSpace: a virtual conference you play.
 * Lobby (sign up, character preview) → drop into Expo Park → walk to booths and meetups.
 *
 * Demo URLs: ?demo=enter (auto-join from the lobby), ?enter=1 (skip lobby),
 * ?demo=booth (skip lobby, stand at the nearest bounty booth and open it),
 * ?demo=match (skip lobby, get a match and a meetup waypoint), ?touch (on-screen controls).
 */
export function App() {
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const demo = query.get('demo');
  const skipLobby = query.has('enter') || demo === 'booth' || demo === 'match';

  const phase = useGame((s) => s.phase);
  const setPhase = useGame((s) => s.setPhase);
  const setWaypoint = useGame((s) => s.setWaypoint);
  const openBooth = useGame((s) => s.openBooth);
  const teleport = useGame((s) => s.teleport);
  const waypoint = useGame((s) => s.waypoint);
  const playerPos = useGame((s) => s.playerPos);
  const startDemo = useDemoStore((s) => s.startDemo);
  const toggleAdminPanel = useDemoStore((s) => s.toggleAdminPanel);

  const [profile, setProfile] = useState<PlayerProfile>(() => (skipLobby || demo === 'enter' ? DEMO_PROFILE : loadProfile() ?? EMPTY_PROFILE));
  const [welcome, setWelcome] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const quest = useQuest({ profile });
  const availability = useMockAvailability(6000);
  const [suggestions, setSuggestions] = useState<SpotSuggestion[]>([]);
  const [confirmed, setConfirmed] = useState(false);

  const enter = (p: PlayerProfile) => {
    saveProfile(p);
    setProfile(p);
    // Registers the player with the API (no-op offline). The game starts right away either way.
    void quest.join(p).catch(() => undefined);
    setPhase('playing');
    setWelcome(true);
    window.setTimeout(() => setWelcome(false), 6000);
  };

  const zone = quest.game ? new Set(quest.game.inZoneBoothIds) : null;
  const bounties = quest.booths
    .filter((b) => !quest.progress.visitedBoothIds.includes(b.id) && (!zone || zone.has(b.id)) && isBounty(quest.boothStats[b.id]))
    .map((b) => ({ b, at: getBoothSlot(b.slotId)?.anchor ?? ([0, 0] as Vec2) }))
    .sort((x, y) => Math.hypot(x.at[0] - playerPos[0], x.at[1] - playerPos[1]) - Math.hypot(y.at[0] - playerPos[0], y.at[1] - playerPos[1]))
    .map(({ b }) => b);

  const simulateMatch = () => {
    const next = mockSuggest(availability);
    setSuggestions(next);
    setConfirmed(false);
    if (next[0]) setWaypoint({ kind: 'spot', id: next[0].spotId });
  };

  const teleportToWaypoint = () => {
    const t = resolveTarget(waypoint, quest.booths);
    if (!t) return;
    const slot = t.kind === 'booth' ? getBoothSlot(quest.booths.find((b) => b.id === waypoint!.id)!.slotId) : undefined;
    teleport(slot ? boothFront(slot) : [t.at[0] + 1.6, t.at[1] + 1.6]);
  };

  // Demo modes.
  useEffect(() => {
    if (demo === 'enter') {
      const t = window.setTimeout(() => enter(DEMO_PROFILE), 2500);
      return () => window.clearTimeout(t);
    }
    if (!skipLobby) return;
    setPhase('playing');
    const t = window.setTimeout(() => {
      if (demo === 'match') simulateMatch();
    }, 1200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ?demo=booth: once real stats are in (API or offline), stand at the nearest bounty booth.
  const demoBoothDone = useRef(false);
  useEffect(() => {
    if (demo !== 'booth' || demoBoothDone.current || quest.mode === 'connecting') return;
    if (quest.mode === 'api' && (!quest.game || Object.keys(quest.boothStats).length === 0)) return;
    // Nearest bounty, else the best-paying unvisited booth inside the zone.
    const b =
      bounties[0] ??
      quest.booths
        .filter((x) => !quest.progress.visitedBoothIds.includes(x.id) && (!zone || zone.has(x.id)))
        .sort((x, y) => (quest.boothStats[y.id]?.bonus ?? 0) - (quest.boothStats[x.id]?.bonus ?? 0))[0];
    if (!b) return;
    demoBoothDone.current = true;
    setWaypoint({ kind: 'booth', id: b.id });
    teleport(boothFront(getBoothSlot(b.slotId)!));
    window.setTimeout(() => openBooth(b.id), 800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quest.mode, quest.boothStats, quest.game]);

  // Once the API answers, make sure a player who is already in the park is registered.
  useEffect(() => {
    if (quest.mode === 'api' && phase === 'playing') void quest.join(profile).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quest.mode, phase]);

  // Presence + chat: connect once playing against the live server. If the server forgets our session
  // (restart), register again and reconnect with the new one.
  const chatAvailable = quest.mode === 'api';
  const questRef = useRef(quest);
  questRef.current = quest;
  useRealtime(chatAvailable && phase === 'playing' ? quest.sessionId : null, () => {
    questRef.current.reset();
    void questRef.current.join(profile).catch(() => undefined);
  });

  const spot = waypoint?.kind === 'spot' ? getSpot(waypoint.id) : undefined;
  const slotTime = suggestions.find((s) => s.spotId === waypoint?.id)?.startsAt;

  return (
    <div className="app">
      <GameCanvas
        playerName={profile.name}
        playerColor={profile.color}
        booths={quest.booths}
        boothStats={quest.boothStats}
        visitedBoothIds={quest.progress.visitedBoothIds}
        availability={availability}
        game={quest.game}
        onTalk={(id) => openBooth(id)}
      />

      {phase === 'lobby' && <Lobby initial={profile} onEnter={enter} />}

      {phase === 'playing' && (
        <>
          <GameHud
            booths={quest.booths}
            boothStats={quest.boothStats}
            progress={quest.progress}
            leaderboard={quest.leaderboard}
            events={quest.events}
            careerProfile={toCareerProfile(profile)}
            game={quest.game}
            chatAvailable={chatAvailable}
            onCheckIn={async (id, quizAnswer, dwellMs) => {
              const outcome = await quest.checkIn(id, quizAnswer, dwellMs);
              if (outcome.ok) {
                if (useGame.getState().waypoint?.id === id) setWaypoint(null);
                window.setTimeout(() => openBooth(null), 1400);
              }
              return outcome;
            }}
          />

          {welcome && (
            <div className="app-welcome" role="status">
              Welcome to Expo Park, <b>{profile.name}</b>! Follow the gold beams for bonus XP.
            </div>
          )}

          <div className={`app-drawer${drawer ? ' open' : ''}`}>
            <button className="app-drawer__toggle" onClick={() => setDrawer((d) => !d)} aria-expanded={drawer}>
              {drawer ? '✕ Close' : '☰ Demo'}
            </button>
            {drawer && (
              <div className="app-drawer__body">
                <div className="app-drawer__mode">
                  {quest.mode === 'api' ? '🟢 Live game server' : quest.mode === 'connecting' ? '… Connecting' : '⚪ Offline demo (mock data)'}
                </div>
                <button className="primary" onClick={simulateMatch}>
                  💜 Simulate match with Sarah
                </button>
                <button className="primary" onClick={() => startDemo('booth-demo-test', quest.booths[0])}>
                  🎮 Start Demo Experience
                </button>
                <button onClick={toggleAdminPanel}>
                  ⚙️ Admin/Demo Panel
                </button>
                <button onClick={() => bounties[0] && setWaypoint({ kind: 'booth', id: bounties[0].id })} disabled={bounties.length === 0}>
                  ◆ Waypoint: nearest bounty ({bounties.length})
                </button>
                <button onClick={teleportToWaypoint} disabled={!waypoint}>
                  ⚡ Teleport to waypoint
                </button>
                <button onClick={() => teleport([0, 36])}>⌂ Back to plaza</button>
                <button onClick={quest.reset}>Reset quest</button>
                <button onClick={() => setPhase('lobby')}>← Back to lobby</button>
              </div>
            )}
          </div>

          {spot && suggestions.length > 0 && (
            <div className="app-match">
              <div className="app-match__title">{confirmed ? '✅ Meetup confirmed' : "It's a match! Meet Sarah"}</div>
              <div>
                <b>{spot.name}</b>
                {slotTime && <> · {formatTime(slotTime)}</>}
              </div>
              {!confirmed && (
                <div className="app-row">
                  {suggestions.map((s) => (
                    <button key={s.spotId} className={s.spotId === waypoint?.id ? 'active' : ''} onClick={() => setWaypoint({ kind: 'spot', id: s.spotId })}>
                      {getSpot(s.spotId)?.name}
                    </button>
                  ))}
                  <button className="primary" onClick={() => setConfirmed(true)}>
                    Confirm
                  </button>
                </div>
              )}
            </div>
          )}
          
          <DemoProgressUI />
          <DemoAdminPanel />
        </>
      )}
      
      <DemoExperience />
      <DemoQuiz />
    </div>
  );
}
