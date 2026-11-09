import type { Vec2, ZoneKind } from './types';

/**
 * Sponsor booth positions in Expo Park. Companies are assigned to slots by the API
 * (`Booth.slotId`), so organizers can move a sponsor without touching the map.
 */
export interface BoothSlot {
  /** Stable id, format b<nn>. */
  id: string;
  zone: ZoneKind;
  /** Kiosk centre, world meters. */
  anchor: Vec2;
  /** Direction the kiosk front faces (degrees, from +x towards +z). */
  facingDeg: number;
}

/** Sponsor-facing data, served by `GET /booths`. */
export interface Booth {
  id: string;
  slotId: string;
  company: string;
  /** Brand color for the kiosk, hex. */
  color: string;
  tagline: string;
  hiring?: string[];
  tags?: string[];
}

/** Kiosk footprint (x = width, y = height, z = depth) in its local frame; used for colliders. */
export const KIOSK_SIZE: [number, number, number] = [2.8, 2.4, 1.8];

const EXPO_ROWS_Z = [18, 11, -5, -12, -19]; // skips the cross path at z ≈ 2
const CAREERS_ROWS_Z = [-12, -4, 10];

export const BOOTH_SLOTS: BoothSlot[] = [
  // Expo Street: two facing rows either side of the main street.
  ...EXPO_ROWS_Z.map((z) => ({ zone: 'expo' as const, anchor: [-9, z] as Vec2, facingDeg: 0 })),
  ...EXPO_ROWS_Z.map((z) => ({ zone: 'expo' as const, anchor: [9, z] as Vec2, facingDeg: 180 })),
  // Careers Corner: two rows facing the careers path (x = 32).
  ...CAREERS_ROWS_Z.map((z) => ({ zone: 'careers' as const, anchor: [27, z] as Vec2, facingDeg: 0 })),
  ...CAREERS_ROWS_Z.map((z) => ({ zone: 'careers' as const, anchor: [37, z] as Vec2, facingDeg: 180 })),
].map((s, i) => ({ id: `b${String(i + 1).padStart(2, '0')}`, ...s }));

const slotById = new Map(BOOTH_SLOTS.map((s) => [s.id, s]));
export function getBoothSlot(id: string): BoothSlot | undefined {
  return slotById.get(id);
}

/** Where a visitor stands to talk to a booth: in front of the counter. */
export function boothFront(slot: BoothSlot, distance = 2.2): Vec2 {
  const r = (slot.facingDeg * Math.PI) / 180;
  return [slot.anchor[0] + Math.cos(r) * distance, slot.anchor[1] + Math.sin(r) * distance];
}
