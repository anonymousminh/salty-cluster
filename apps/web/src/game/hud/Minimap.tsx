import { WORLD, getBoothSlot, isBounty, type Booth, type BoothStats, type Vec2 } from '@meetspace/venue';
import { useGame } from '../store';
import { QUEST, WORLD_COLORS, ZONE_TINT } from '../theme';

interface Props {
  booths: Booth[];
  boothStats: BoothStats;
  visited: Set<string>;
  target: Vec2 | null;
}

/** Whole-park minimap: zones, paths, booths (bounties as gold diamonds), meetup points, you + view direction. */
export function Minimap({ booths, boothStats, visited, target }: Props) {
  const pos = useGame((s) => s.playerPos);
  const heading = useGame((s) => s.cameraHeadingDeg);
  const [w, d] = WORLD.size;
  return (
    <div className="hud-minimap" aria-label="Map">
      <svg viewBox={`${-w / 2} ${-d / 2} ${w} ${d}`}>
        <rect x={-w / 2} y={-d / 2} width={w} height={d} fill={WORLD_COLORS.grass} />
        {WORLD.zones.map((z) => (
          <rect key={z.id} x={z.center[0] - z.size[0] / 2} y={z.center[1] - z.size[1] / 2} width={z.size[0]} height={z.size[1]} fill={ZONE_TINT[z.kind]} opacity={0.6} rx={2} />
        ))}
        {WORLD.paths.map((p, i) => (
          <line key={i} x1={p.from[0]} y1={p.from[1]} x2={p.to[0]} y2={p.to[1]} stroke={WORLD_COLORS.path} strokeWidth={p.width} strokeLinecap="round" />
        ))}
        {WORLD.obstacles
          .filter((o) => o.visual === 'stage' || o.visual === 'fountain')
          .map((o) =>
            o.shape === 'box' ? (
              <rect key={o.id} x={o.at[0] - o.size[0] / 2} y={o.at[1] - o.size[2] / 2} width={o.size[0]} height={o.size[2]} fill="#334155" />
            ) : (
              <circle key={o.id} cx={o.at[0]} cy={o.at[1]} r={o.radius} fill={WORLD_COLORS.water} />
            ),
          )}
        {WORLD.spots.map((s) => (
          <circle key={s.id} cx={s.anchor[0]} cy={s.anchor[1]} r={1.2} fill={QUEST.meetup} />
        ))}
        {booths.map((b) => {
          const slot = getBoothSlot(b.slotId);
          if (!slot) return null;
          const v = visited.has(b.id);
          const bounty = !v && isBounty(boothStats[b.id]);
          const [x, z] = slot.anchor;
          return bounty ? (
            <rect key={b.id} x={x - 1.4} y={z - 1.4} width={2.8} height={2.8} transform={`rotate(45 ${x} ${z})`} fill={QUEST.bounty} stroke="#fff" strokeWidth={0.4} />
          ) : (
            <circle key={b.id} cx={x} cy={z} r={1.5} fill={v ? QUEST.visited : b.color} stroke="#fff" strokeWidth={0.4} />
          );
        })}
        {target && <circle cx={target[0]} cy={target[1]} r={3} fill="none" stroke={QUEST.waypoint} strokeWidth={0.8} />}
        {target && <line x1={pos[0]} y1={pos[1]} x2={target[0]} y2={target[1]} stroke={QUEST.waypoint} strokeWidth={0.6} strokeDasharray="2 1.5" />}
        <g transform={`translate(${pos[0]} ${pos[1]}) rotate(${heading})`}>
          <path d="M 4 0 L -2.5 -2.6 L -1.2 0 L -2.5 2.6 Z" fill={QUEST.you} stroke="#fff" strokeWidth={0.5} />
        </g>
      </svg>
    </div>
  );
}
