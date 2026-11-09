import type { Vec2 } from '@meetspace/venue';
import { useGame } from '../store';

/** Signed smallest difference b - a in degrees, in (-180, 180]. */
export function angleDiff(a: number, b: number): number {
  let d = (((b - a) % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

export interface CompassMarker {
  id: string;
  /** Plan position of the thing being pointed at. */
  at: Vec2;
  kind: 'waypoint' | 'bounty';
  label?: string;
}

const HALF_FOV = 90; // degrees shown each side of centre
const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** Plan angle (0 = +x/east, 90 = +z/south) → compass bearing (0 = north, clockwise). */
export function planToBearing(planDeg: number): number {
  return (((planDeg + 90) % 360) + 360) % 360;
}

export function bearingBetween(from: Vec2, to: Vec2): number {
  return planToBearing((Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI);
}

/** Heading strip across the top of the map, with markers at their bearing from you. */
export function CompassBar({ you, markers, distanceLabel }: { you: Vec2; markers: CompassMarker[]; distanceLabel?: string }) {
  const heading = planToBearing(useGame((s) => s.cameraHeadingDeg));
  const pos = (bearing: number) => 50 + (angleDiff(heading, bearing) / HALF_FOV) * 50;

  const ticks: { deg: number; label?: string }[] = [];
  for (let deg = 0; deg < 360; deg += 15) ticks.push({ deg, label: deg % 45 === 0 ? CARDINALS[deg / 45] : undefined });

  return (
    <div className="hud-compass" aria-label={`Heading ${Math.round(heading)} degrees`}>
      <div className="hud-compass__strip">
        {ticks.map((t) => {
          const x = pos(t.deg);
          if (x < -2 || x > 102) return null;
          return (
            <div key={t.deg} className={`hud-compass__tick${t.label ? ' major' : ''}`} style={{ left: `${x}%` }}>
              {t.label && <span className={t.label === 'N' ? 'north' : ''}>{t.label}</span>}
            </div>
          );
        })}
        {markers.map((m) => {
          const raw = pos(bearingBetween(you, m.at));
          const clamped = Math.min(98, Math.max(2, raw));
          const off = raw !== clamped;
          return (
            <div key={m.id} className={`hud-compass__marker ${m.kind}${off ? ' off' : ''}`} style={{ left: `${clamped}%` }} title={m.label}>
              {off ? (raw < 0 ? '◀' : '▶') : m.kind === 'bounty' ? '◆' : '▼'}
            </div>
          );
        })}
        <div className="hud-compass__center" />
      </div>
      <div className="hud-compass__readout">
        <span>{Math.round(heading).toString().padStart(3, '0')}°</span>
        {distanceLabel && <span className="dist">{distanceLabel}</span>}
      </div>
    </div>
  );
}
