import { useRoute } from './hooks';
import { Checkin } from './pages/Checkin';
import { Organizer } from './pages/Organizer';
import { BigScreen } from './pages/BigScreen';

/** Companion to the 3D game: organizer console, big screen, and QR check-in for physical booths. */
export function App() {
  const { path, params } = useRoute();
  const checkin = path.match(/^\/checkin\/([^/]+)$/);

  let page;
  if (checkin) page = <Checkin boothId={decodeURIComponent(checkin[1]!)} code={params.get('code') ?? ''} />;
  else if (path === '/organizer') page = <Organizer />;
  else page = <BigScreen />;

  return (
    <>
      <a href="#main" className="skip">
        Skip to content
      </a>
      {path !== '/' && path !== '/screen' && (
        <header className="topbar">
          <a href="#/" className="brand">
            MeetSpace console
          </a>
          <nav aria-label="Main">
            <a href="../">Play the 3D game</a>
            <a href="#/screen">Big screen</a>
            <a href="#/organizer" aria-current={path === '/organizer' ? 'page' : undefined}>
              Organizer
            </a>
          </nav>
        </header>
      )}
      <main id="main">{page}</main>
    </>
  );
}
