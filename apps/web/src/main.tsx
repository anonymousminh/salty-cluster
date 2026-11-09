import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startRum } from './telemetry';

startRum();

import { useGame } from './game/store';
import { useNet } from './game/net/store';

// Dev only: lets browser tests read game and chat state.
if (import.meta.env.DEV) (window as unknown as { __meetspace: unknown }).__meetspace = { game: useGame, net: useNet };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
