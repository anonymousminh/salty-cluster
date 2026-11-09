import { WORLD, getBoothSlot, type Circle, type Vec2 } from '@meetspace/venue';
import type { MouseEvent } from 'react';

export interface MapBooth {
  id: string;
  company: string;
  slotId: string;
  color?: string;
  visits?: number;
  bonus?: number;
  inZone: boolean;
}

interface Props {
  booths: MapBooth[];
  circle: Circle;
  /** Organizer mode: click the map to pick a point (world metres). */
  onPick?: (p: Vec2) => void;
  picked?: Vec2;
  preview?: Circle;
}

const ZONE_TINT: Record<string, string> = { plaza: '#fde68a', expo: '#bfdbfe', stage: '#fecaca', garden: '#bbf7d0', careers: '#ddd6fe' };

/** Expo Park from above (same world data as the 3D game): zones, paths, booths, the circle and the storm. */
export function FloorMap({ booths, circle, onPick, picked, preview }: Props) {
  const [w, d] = WORLD.size;
  const inZone = booths.filter((b) => b.inZone).length;

  const handleClick = (e: MouseEvent<SVGSVGElement>) => {
    if (!onPick) return;
    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    onPick([Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]);
  };

  return (
    <figure className="floor">
      <svg
        viewBox={`${-w / 2} ${-d / 2} ${w} ${d}`}
        role="img"
        aria-label={`Map of ${WORLD.name}. The safe zone has a ${Math.round(circle.radius)} metre radius and covers ${inZone} of ${booths.length} booths.`}
        onClick={handleClick}
        className={onPick ? 'pickable' : undefined}
      >
        <defs>
          <mask id="storm-mask">
            <rect x={-w / 2} y={-d / 2} width={w} height={d} fill="white" />
            <circle cx={circle.center[0]} cy={circle.center[1]} r={circle.radius} fill="black" />
          </mask>
          <pattern id="storm-hatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="3" height="3" fill="var(--storm)" />
            <line x1="0" y1="0" x2="0" y2="3" stroke="var(--storm-line)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect x={-w / 2} y={-d / 2} width={w} height={d} className="hall" />
        {WORLD.zones.map((z) => (
          <rect key={z.id} x={z.center[0] - z.size[0] / 2} y={z.center[1] - z.size[1] / 2} width={z.size[0]} height={z.size[1]} rx={2} fill={ZONE_TINT[z.kind]} opacity={0.55} />
        ))}
        {WORLD.paths.map((p, i) => (
          <line key={i} x1={p.from[0]} y1={p.from[1]} x2={p.to[0]} y2={p.to[1]} className="path" strokeWidth={p.width} strokeLinecap="round" />
        ))}
        {WORLD.zones.map((z) => (
          <text key={`l-${z.id}`} x={z.center[0]} y={z.center[1] - z.size[1] / 2 + 3} textAnchor="middle" className="zone-name">
            {z.name}
          </text>
        ))}
        <rect x={-w / 2} y={-d / 2} width={w} height={d} fill="url(#storm-hatch)" mask="url(#storm-mask)" />
        <circle cx={circle.center[0]} cy={circle.center[1]} r={circle.radius} className="zone" />
        {preview && <circle cx={preview.center[0]} cy={preview.center[1]} r={preview.radius} className="zone-preview" />}
        {booths.map((b) => {
          const slot = getBoothSlot(b.slotId);
          if (!slot) return null;
          const [x, z] = slot.anchor;
          return (
            <g key={b.id} className={`booth ${b.inZone ? 'in' : 'out'}`} transform={`translate(${x} ${z})`}>
              <rect x={-3.2} y={-1.6} width={6.4} height={3.2} rx={0.6} style={b.inZone && b.color ? { stroke: b.color } : undefined} />
              <text y={-0.1} textAnchor="middle" className="booth-name">
                {b.company.length > 13 ? b.company.slice(0, 12) + '…' : b.company}
              </text>
              <text y={1.1} textAnchor="middle" className="booth-meta">
                {b.inZone ? (b.bonus ? `+${b.bonus} bonus` : `${b.visits ?? 0} visits`) : 'storm'}
              </text>
            </g>
          );
        })}
        {picked && <path d={`M${picked[0] - 2} ${picked[1]}h4M${picked[0]} ${picked[1] - 2}v4`} className="pick" />}
      </svg>
      <figcaption>
        <span className="legend in">Safe zone</span> <span className="legend out">Storm: no XP</span> Radius {Math.round(circle.radius)} m
      </figcaption>
    </figure>
  );
}
