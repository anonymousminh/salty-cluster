# Conference Battle Royale - Interactive Booth Demo Experience

## Overview

This implementation extends the existing MeetSpace virtual conference application with an immersive, PUBG-inspired booth demonstration experience. Players can walk up to booths, launch 30-second interactive product demos, answer quiz questions, and earn points on a competitive leaderboard.

## Architecture

### Tech Stack (Existing)
- **Frontend**: React 19 + TypeScript + Vite
- **3D Engine**: Three.js + React Three Fiber + Drei
- **Physics**: React Three Rapier
- **Character Controller**: Ecctrl
- **State Management**: Zustand
- **Monorepo**: pnpm workspace

### New Components Added

#### Data Layer
- `packages/venue/src/types.ts` - Extended with demo experience types
- `packages/venue/src/scoring.ts` - Added demo scoring constants
- `apps/web/src/data/demoBooths.ts` - Centralized mock data for 8 exhibitors

#### Demo System
- `apps/web/src/game/demo/persistence.ts` - localStorage persistence layer
- `apps/web/src/game/demo/store.ts` - Zustand store for demo state management
- `apps/web/src/game/demo/DemoExperience.tsx` - Immersive 30-second demo presentation
- `apps/web/src/game/demo/DemoQuiz.tsx` - Quiz interface after demo completion
- `apps/web/src/game/demo/DemoProgressUI.tsx` - Non-obtrusive progress display
- `apps/web/src/game/demo/DemoAdminPanel.tsx` - Developer/admin controls
- `apps/web/src/game/demo/demo.css` - Demo UI styles
- `apps/web/src/game/demo/demo-ui.css` - Progress and admin UI styles

#### Integration
- `apps/web/src/game/Player.tsx` - Modified for demo interaction
- `apps/web/src/game/GameCanvas.tsx` - Integrated demo start
- `apps/web/src/game/hud/GameHud.tsx` - Demo prompts and status
- `apps/web/src/App.tsx` - Added demo overlays

## Features Implemented

### A. Booth Interaction
- ✅ Proximity detection (uses existing CHECKIN_RADIUS)
- ✅ "Press E to Start Demo" prompt
- ✅ Keyboard (E/Enter) and touch/mobile support
- ✅ Prevents interaction when too far
- ✅ Exit demo and return to virtual environment
- ✅ Shows visited/completed status

### B. Demo Experience
- ✅ Full-screen immersive interface
- ✅ Booth name, company, logo, description displayed
- ✅ 30-second countdown timer with animated ring
- ✅ 6 unique slides per booth with timed progression
- ✅ Different content types: text, animated slides, bullets
- ✅ CSS animations (fade, slide, zoom, typewriter)
- ✅ Completion screen transitions to quiz

### C. Demo Completion & Verification
- ✅ 1-2 multiple choice questions per booth
- ✅ Points awarded on completion
- ✅ Bonus points for correct quiz answers
- ✅ First-time completion bonus
- ✅ Duplicate prevention (no re-rewards)
- ✅ Records: attendee, booth, time, score, answers
- ✅ Structured for backend replacement

### D. Gamification Scoring
Configurable values:
- Booth visit: 10 points
- Completed 30-second demo: 100 points
- Correct quiz answer: 25 bonus points
- First-time booth completion bonus: 25 points

Separate tracking of visits vs demos completed.

### E. Leaderboard
- ✅ Enhanced display ready (mock data includes 20 players)
- ✅ Shows name, avatar, total points, booths visited, demos completed, rank
- ✅ Updates on demo completion
- ✅ Realistic competitive mock players

### F. Progress Tracking
- ✅ Total booths, visited, completed, remaining
- ✅ Total points earned
- ✅ Completion percentage
- ✅ Non-obtrusive UI panel

## Mock Data

### 8 Exhibitors (All Categories)
1. **AI Innovation Labs** (Artificial Intelligence) - Neurix Business Assistant
2. **Nimbus Cloud Systems** (Cloud Computing) - Nimbus Edge Platform
3. **ShieldFort Security** (Cybersecurity) - FortifyZero Suite
4. **Vertex Data Analytics** (Data Analytics) - Vertex Insight Engine
5. **DevForge Platforms** (Developer Platforms) - ForgeStack
6. **PayPulse FinTech** (FinTech) - PulsePay Gateway
7. **AutoNex Automation** (Automation) - NexFlow Orchestrator
8. **MediQuest HealthTech** (Healthcare Technology) - QuestCare AI

Each booth has:
- Unique booth ID and slot assignment
- Company info, logo, description
- Product details
- 6 unique slides with timed 30s presentation
- 2 quiz questions with answers
- Configurable points
- Compatible coordinates with existing world

### Mock Attendees
20 realistic mock players with varied scores and completion statuses for leaderboard demonstration.

## Setup Requirements

### Environment Variables
None required for demo mode. The app runs entirely client-side with localStorage.

### Dependencies
All dependencies are already in package.json files. No new external dependencies added.

## Running the Application

### Install Dependencies
```bash
cd /Users/jewelfaithmartin/Projects/salty-cluster
pnpm install
```

### Start Development Server
```bash
pnpm dev
```
This starts the web app at the default Vite port (usually http://localhost:5173).

### Run Tests
```bash
pnpm test
```

### Type Checking
```bash
pnpm typecheck
```

## Demo Walkthrough (Hackathon)

1. **Start the app** - Run `pnpm dev` and open the browser
2. **Enter the game** - Click "Enter" in lobby or use `?demo=enter` URL
3. **Find a booth** - Walk around Expo Park to any of the 8 demo booths (they'll show "Press E to Start Demo")
4. **Launch demo** - Press E or tap to start the 30-second immersive demo
5. **Watch presentation** - See company branding, slides change automatically, timer counts down
6. **Complete demo** - Timer reaches 0 or click "Skip to Quiz" to proceed
7. **Take quiz** - Answer 1-2 multiple choice questions
8. **See results** - View points earned breakdown and completion confirmation
9. **Check progress** - Look at top-right progress panel showing visits, completions, points
10. **Admin controls** - Click 🎮 button for demo controls, reset data, view mock leaderboard

### Demo URLs
- `?demo=enter` - Auto-enter as Alex
- `?demo=booth` - Skip to nearest bounty booth
- `?enter=1` - Skip lobby
- `?touch` - Enable touch controls

## Persistence
- Uses localStorage for saving demo progress
- Survives page refreshes
- Prevents duplicate rewards
- Reset available via admin panel or programmatically

## What's Mocked vs Production

### Currently Mocked
- **Booth data**: Hardcoded 8 exhibitors (vs real exhibitor API)
- **Demo content**: Pre-defined slides (vs CMS/exhibitor uploads)
- **Quiz questions**: Hardcoded per booth (vs dynamic questions)
- **Leaderboard**: Mix of local player + mock attendees (vs real-time server data)
- **Persistence**: localStorage (vs backend database)
- **Scoring**: Client-side calculation (vs server validation)

### For Production Deployment
1. **Backend API**: Replace mock data with REST/GraphQL endpoints
2. **Authentication**: Add user auth system
3. **Database**: Store booth data, demos, progress, leaderboard
4. **Real-time**: WebSocket/SSE for live leaderboard updates
5. **Asset Management**: CDN for logos, videos, images
6. **Analytics**: Track engagement metrics
7. **Validation**: Server-side scoring and anti-cheat
8. **Content Management**: Admin panel for exhibitors to manage their demos
9. **QR Codes**: Integrate with actual booth check-in system
10. **Deployment**: Kubernetes as mentioned in README

## Files Created/Modified

### Created (11 files)
- `packages/venue/src/types.ts` (extended)
- `packages/venue/src/scoring.ts` (extended)
- `apps/web/src/data/demoBooths.ts`
- `apps/web/src/game/demo/persistence.ts`
- `apps/web/src/game/demo/store.ts`
- `apps/web/src/game/demo/DemoExperience.tsx`
- `apps/web/src/game/demo/DemoQuiz.tsx`
- `apps/web/src/game/demo/DemoProgressUI.tsx`
- `apps/web/src/game/demo/DemoAdminPanel.tsx`
- `apps/web/src/game/demo/demo.css`
- `apps/web/src/game/demo/demo-ui.css`

### Modified (5 files)
- `apps/web/src/game/Player.tsx`
- `apps/web/src/game/GameCanvas.tsx`
- `apps/web/src/game/hud/GameHud.tsx`
- `apps/web/src/App.tsx`
- `packages/venue/src/index.ts` (exports already included)

## Design Notes
- Maintains existing game feel (dark theme, 3D world, movement)
- Demo overlays are immersive and game-like, not dashboard style
- Uses CSS animations for smooth transitions
- Responsive design for mobile/tablet
- Preserves all existing functionality (movement, camera, collision, old booth dialog still available as fallback)
- Follows existing code conventions and patterns
