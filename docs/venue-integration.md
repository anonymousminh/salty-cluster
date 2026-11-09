# MeetSpace game: integration guide

MeetSpace is a **virtual conference you play**. Attendees work through four steps:
1. Sign up in the **lobby**: name, role, goals, skills and avatar color, with a live 3D character preview.
2. **Drop into Expo Park**, our own conference world.
3. **Walk a 3D character** to sponsor booths to earn XP. Quiet booths pay an underdog bonus.
4. **Follow waypoints** to meetup points after a match.
5. **Talk to other players**: nearby text chat, private messages, and mute (needs the live game server).

Run it with `pnpm install && pnpm dev` and open http://localhost:5173.

| Controls | Desktop | Phone |
|---|---|---|
| Move | `W A S D` / arrows | left joystick |
| Run | hold `Shift` | push the joystick to the edge |
| Jump | `Space` | Jump button |
| Talk to a booth | `E` (when the prompt shows) | Talk button / tap the prompt |
| Camera | drag to orbit, wheel to zoom | drag / pinch |
| Open chat | `Enter` (then type; `Enter` sends, `Esc` closes) | 💬 Chat button |

| URL | What it does |
|---|---|
| `/` | Lobby → Enter conference |
| `?demo=enter` | Presenter mode: auto-fills a profile and enters after 2.5 s |
| `?enter=1` | Skip the lobby (demo profile) |
| `?demo=booth` | Skip the lobby, stand at the nearest bounty booth with its dialog open |
| `?demo=match` | Skip the lobby, get a match with a meetup waypoint (beam, guide arrows, compass) |
| `?touch` | Force the on-screen joystick and buttons |
| `?name=Sam&color=22d3ee` | With `?enter=1`: join under another name/color, so several windows can be different players |
| `?bots` | Keep the simulated attendees even when connected to the live server (they are hidden then, so you only see real players) |
| `?offline` | Never contact the API: mock quest data, no chat |

The **☰ Demo** drawer (top left) has buttons to simulate a match, set a bounty waypoint, teleport to the waypoint, reset the quest, and go back to the lobby.

## World: Expo Park (`packages/venue/src/world.ts`)

| Zone | What's there |
|---|---|
| Spawn Plaza | Entrance arch, fountain, two café meetup tables |
| Expo Street | 10 sponsor booths in two facing rows |
| Careers Corner | 6 booths for hiring companies |
| Networking Garden | 6 meetup tables, a lounge and a bench |
| Keynote Stage | Stage, screen, benches, and a stage-side lounge |

All coordinates are meters: origin at the park centre, +x east, +z south. `validateWorld()` (tested) checks that:
- every booth and meetup point is clear of obstacles and paths
- booths are at least 4 m apart
- the spawn point is clear

Trees come from a seeded generator, so they are the same on every machine.

## Tech
- **React Three Fiber 9 + drei 10**, **@react-three/rapier** physics, and **ecctrl 2** (pmndrs) as the character controller.
- Input: ecctrl takes input only via `setMovement`, so `game/Player.tsx` bridges keyboard, joystick and buttons into it, and freezes input while a dialog is open.
- **Character:** a procedural "chibi" by default. Drop a rigged CC0 glTF at `apps/web/public/characters/player.glb` (see the README there; KayKit recommended) and it replaces the default with idle/walk/run/jump animations. Ready Player Me shut down in January 2026, so don't build on it.
- **Bots** (`game/world/Bots.tsx`) simulate attendees walking the paths. Real multiplayer would feed positions from a presence channel into the same renderer.
- **State:** `zustand` (`game/store.ts`) holds the phase, player position, camera heading, waypoint, booth proximity, dwell and the open dialog.

## Who builds what

| Piece | Owner |
|---|---|
| World data, 3D game, lobby, HUD, check-in rules, scoring/quiz helpers, mocks | 3D/game workstream (done) |
| Booth quest API on Elasticsearch: join, booths, stats, check-in, progress, leaderboard (`apps/api`) | Backend (done) |
| Battle-royale circle, scheduled shrinks, organizer console, QR check-in for physical booths (`apps/console`) | Backend (done) |
| Swipe/match screens, SSE, presence channel (server-side dwell checks) | Next |
| Sponsor list and booth-slot assignment | Organizers (`DEMO_SPONSORS` in `packages/venue/src/sponsors.ts` for now) |

The game talks to the API when `/api` answers and falls back to the offline mocks otherwise (`?offline` forces it). The **☰ Demo** drawer shows which mode is active.

## Contract (implemented by `apps/api`, types exported by `@meetspace/venue`)

Player calls send `Authorization: Bearer <sessionId>` (from join; the server stores only a salted hash).

```ts
POST /api/join                 JoinRequest { name, role?, lookingFor?, skills?, color?, showOnLeaderboard? } → Session { sessionId, name }
GET  /api/booths               → Booth[]      sorted by slot (the quiz is generated from this order on both sides)
GET  /api/booths/stats         → BoothStats   Record<boothId, { visits, bonus }>   (computeBoothStats)
GET  /api/game                 → GameView     { state: { status, round, circle, nextShrink? }, inZoneBoothIds }
POST /api/booths/:id/checkin   CheckinRequest { quizAnswer, dwellMs? | code? }
                               → CheckinResponse { xpGained, base, bonus, totalXp }
                               | 409 already_visited | 422 not_eligible { reason: dwell_too_short | wrong_answer | in_storm | bad_code | game_not_live }
GET  /api/me/progress          → Progress     { xp, rank, visitedBoothIds, totalBooths }
GET  /api/leaderboard?limit=10 → Leaderboard  { entries: { rank, name, xp, booths, bonusXp, isMe? }[], me? }

Organizer (header x-organizer-token):
PUT  /api/organizer/circle          { center: Vec2, radius }
POST /api/organizer/shrink          { factor, target?: Vec2 }
POST /api/organizer/schedule-shrink { inSeconds, factor, target? }   DELETE to cancel
POST /api/organizer/status          { status: lobby | live | ended }
POST /api/organizer/reset
GET  /api/organizer/booths          → OrganizerBooth[] (with QR codes)
GET  /api/organizer/stats           → OrganizerStats

Next: SSE booth.visited / leaderboard.changed (the game polls every 3 s for now), WS presence { id, x, z, heading }.
```

**Check-in rules** (`interaction.ts`, shared so client and server agree):
- `CHECKIN_RADIUS` 4.5 m from the booth front.
- `DWELL_SECONDS` 6.
- One `boothQuiz()` question. It is deterministic per booth, and the answer is the booth's tagline.
- A wrong answer locks the quiz for `QUIZ_RETRY_SECONDS` (5 s).
- The server must re-verify dwell from presence pings. Client timers are UX only.

**Scoring:** the server uses `scoring.ts` + `battle.ts` (`checkinXp`).
- XP for a visit = `BASE_XP (10) + underdogBonus(visits, avgVisits)`, where the bonus ranges from 0 to 25.
- Bounty threshold: 15.
- One credit per booth per attendee.
- Battle royale: booths outside the organizer's circle ("the storm") pay 0 XP and are not used up.

**Privacy:** the leaderboard shows the attendee's display name, or "Anonymous" if they opted out. In the offline demo, bots stand in for other players.

## Chat and presence (`/api/realtime`)

To try it with two players: run `pnpm dev:memory` (API without Docker) and `pnpm dev`, then open `http://localhost:5173/?enter=1&name=Sam` and `http://localhost:5173/?enter=1&name=Priya` in two windows (or two browsers). Walk close together, press Enter and type. Open the **People** tab to send a private message.

```ts
WS /api/realtime   JSON text frames. The first frame must be hello; the session id never goes in the URL.
  client → server   { t:'hello', session }   { t:'pos', x, z, h, m }   { t:'say', text }   { t:'dm', to: pid, text }
  server → client   { t:'welcome', you, roster }   { t:'join', p }   { t:'leave', pid }
                    { t:'snap', p: [[n, x, z, h, m], …] }           nearest 40 within 45 m, 5 per second
                    { t:'say', id, from, name, text, at }            reaches players within 15 m (and the speaker)
                    { t:'dm', id, from, to, name, text, at }         to one player and an echo to the sender
                    { t:'err', code, message }                        rate_limited | empty | too_long | unknown_player | …
```
Types and constants are in `packages/venue/src/realtime.ts` (`CHAT_RADIUS`, `INTEREST_RADIUS`, `INTEREST_MAX`, `MAX_CHAT_LENGTH`, `cleanChatText`).

- **Server:** `apps/api/src/presence.ts` is the hub (no sockets in it, so it is unit-tested with fake connections); `apps/api/src/realtime.ts` is the WebSocket layer. Message text is never logged or stored.
- **Client:** `apps/web/src/game/net` (connection, store, remote positions), `world/RemotePlayers.tsx` (avatars), `world/ChatBubble.tsx`, `hud/ChatPanel.tsx`. While a chat box has focus the game ignores movement keys.
- **One process only.** Presence is in memory, so all players must reach the same server process. In Kubernetes that is the single-replica `realtime` Deployment (`deploy/k8s/realtime.yaml`), reached through the `/api/realtime` route in `deploy/web/nginx.conf`. The scaled-out `api` pods run with `REALTIME_ENABLED=false`.
- **Load test:** `N=800 SECONDS=20 pnpm --filter @meetspace/api loadtest:realtime` (server must be running). Results are in `docs/system-design.md` §7.
- **Not done:** DMs are open to any online player (not just matches), there is no moderation beyond rate limits and mute, and no voice.

## Editing the world
- Change `world.ts` (zones, paths, obstacles, spots) or `booths.ts` (slots), then run `pnpm --filter @meetspace/venue test`.
- Bot routes are hand-written loops in `Bots.tsx`. Keep them on paths and clear of planters and fountains.
