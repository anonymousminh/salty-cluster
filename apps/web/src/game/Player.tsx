import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useKeyboardControls } from '@react-three/drei';
import { Ecctrl, type EcctrlHandle } from 'ecctrl';
import { EcctrlCameraControls, type EcctrlCameraControlsHandle } from 'ecctrl/camera';
import { useButtonStore, useJoystickStore } from 'ecctrl/input';
import { ARRIVE_RADIUS, CHECKIN_RADIUS, WORLD, getSpot, nearestBooth, type Booth, type Vec2 } from '@meetspace/venue';
import { Character } from './character/Character';
import type { MotionState } from './character/Chibi';
import { NameTag } from './world/NameTag';
import { isInputLocked, useGame } from './store';

export const KEYBOARD_MAP = [
  { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
  { name: 'backward', keys: ['ArrowDown', 'KeyS'] },
  { name: 'leftward', keys: ['ArrowLeft', 'KeyA'] },
  { name: 'rightward', keys: ['ArrowRight', 'KeyD'] },
  { name: 'jump', keys: ['Space'] },
  { name: 'run', keys: ['Shift'] },
  { name: 'talk', keys: ['KeyE', 'Enter'] },
];
type Controls = 'forward' | 'backward' | 'leftward' | 'rightward' | 'jump' | 'run' | 'talk';

const DEG = Math.PI / 180;
/** Capsule: half-height + radius + float height = distance from body centre to the feet. */
const CAPSULE_HALF = 0.4;
const CAPSULE_R = 0.32;
const FLOAT = 0.2;
const FEET_OFFSET = CAPSULE_HALF + CAPSULE_R + FLOAT;

export interface PlayerProps {
  color: string;
  name: string;
  booths: Booth[];
  /** Called when the attendee presses Talk (E / button) near a booth. */
  onTalk: (boothId: string) => void;
}

/** The attendee you control: physics capsule + 3D character + third-person camera. */
export function Player({ color, name, booths, onTalk }: PlayerProps) {
  const ecctrl = useRef<EcctrlHandle>(null);
  const motion = useRef<MotionState>({ gait: 0, airborne: false });
  const [, getKeys] = useKeyboardControls<Controls>();
  const talkLatch = useRef(false);
  const lastPublish = useRef(0);
  const spawnY = useRef(14); // drop in from the sky on entering

  useFrame((state, delta) => {
    const c = ecctrl.current;
    if (!c?.body) return; // rigid body not created yet
    const game = useGame.getState();
    const locked = isInputLocked(game);
    if (game.teleportTo && c.body) {
      c.body.setTranslation({ x: game.teleportTo[0], y: 1.5, z: game.teleportTo[1] }, true);
      c.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      game.teleport(null);
    }

    // --- input → controller (keyboard + on-screen joystick/buttons) ---
    const k = getKeys();
    const joy = useJoystickStore.getState().joysticks.default ?? { x: 0, y: 0, active: false };
    const buttons = useButtonStore.getState().buttons;
    c.setMovement(
      locked
        ? { forward: false, backward: false, leftward: false, rightward: false, run: false, jump: false, joystick: { x: 0, y: 0 } }
        : {
            forward: k.forward,
            backward: k.backward,
            leftward: k.leftward,
            rightward: k.rightward,
            run: k.run || Math.hypot(joy.x, joy.y) > 0.92,
            jump: k.jump || !!buttons.jump,
            joystick: { x: joy.x, y: joy.y },
          },
    );

    // --- animation drive ---
    const speed = Math.hypot(c.currLinVel.x, c.currLinVel.z);
    motion.current.gait = speed < 0.3 ? 0 : speed / 3;
    motion.current.airborne = !c.isOnGround;

    // --- publish position + proximity (10 Hz) ---
    const t = state.clock.elapsedTime;
    const pos: Vec2 = [c.currPos.x, c.currPos.z];
    const near = !locked || game.openBoothId ? nearestBooth(pos, booths, CHECKIN_RADIUS) : null;
    if (near) {
      if (game.nearBoothId !== near.item.id) game.setNearBooth(near.item.id);
      game.addDwell(near.item.id, delta);
    } else if (game.nearBoothId) {
      game.resetDwell(game.nearBoothId);
      game.setNearBooth(null);
    }

    // Talk (edge-triggered).
    const talk = k.talk || !!buttons.talk;
    if (talk && !talkLatch.current && near && !game.openBoothId && game.phase === 'playing') onTalk(near.item.id);
    talkLatch.current = talk;

    if (t - lastPublish.current > 0.1) {
      lastPublish.current = t;
      game.setPlayer(pos);
      // Arrival at a meetup waypoint.
      const wp = game.waypoint;
      if (wp?.kind === 'spot' && game.arrivedSpotId !== wp.id) {
        const spot = getSpot(wp.id);
        if (spot && Math.hypot(spot.anchor[0] - pos[0], spot.anchor[1] - pos[1]) < ARRIVE_RADIUS) {
          game.setArrived(wp.id);
          motion.current.cheer = 2;
        }
      }
      // Fell off the world somehow → respawn.
      if (c.currPos.y < -10 && c.body) c.body.setTranslation({ x: WORLD.spawn.at[0], y: 6, z: WORLD.spawn.at[1] }, true);
    }
  });

  return (
    <>
      <Ecctrl
        ref={ecctrl}
        position={[WORLD.spawn.at[0], spawnY.current, WORLD.spawn.at[1]]}
        capsuleHalfHeight={CAPSULE_HALF}
        capsuleRadius={CAPSULE_R}
        floatHeight={FLOAT}
        maxWalkVel={3.4}
        maxRunVel={7}
        jumpVel={5.5}
        enableToggleRun={false}
      >
        <group position={[0, -FEET_OFFSET, 0]}>
          <Character color={color} motion={motion} backpack />
          <NameTag text={name || 'You'} y={2.1} bg={color} />
        </group>
      </Ecctrl>
      <FollowCamera ecctrl={ecctrl} />
    </>
  );
}

/** Third-person camera: follows the player, drag to orbit, wheel/pinch to zoom. */
function FollowCamera({ ecctrl }: { ecctrl: React.RefObject<EcctrlHandle | null> }) {
  const cam = useRef<EcctrlCameraControlsHandle>(null);
  const camera = useThree((s) => s.camera);
  const resetToken = useGame((s) => s.cameraResetToken);
  const dir = useRef(new THREE.Vector3());
  const last = useRef(0);

  // Start (and reset) behind the player, looking north up Expo Street.
  useEffect(() => {
    const c = cam.current;
    if (!c) return;
    const [x, z] = WORLD.spawn.at;
    void c.setLookAt(x, 18, z + 14, x, 1, z - 2, false);
    void c.dollyTo(9, true);
    void c.rotatePolarTo(62 * DEG, true);
  }, [resetToken]);

  useFrame(({ clock }) => {
    const c = cam.current;
    const p = ecctrl.current?.currPos;
    if (!c || !p) return;
    // Clamp height so the camera stays low while you drop in from the sky.
    void c.moveTo(p.x, Math.min(p.y, 2) + 0.6, p.z, true);
    if (clock.elapsedTime - last.current > 0.1) {
      last.current = clock.elapsedTime;
      camera.getWorldDirection(dir.current);
      useGame.getState().setCameraHeading(((Math.atan2(dir.current.z, dir.current.x) / DEG) % 360 + 360) % 360);
    }
  });

  return (
    <EcctrlCameraControls
      ref={cam}
      makeDefault
      smoothTime={0.12}
      minDistance={4}
      maxDistance={22}
      minPolarAngle={22 * DEG}
      maxPolarAngle={82 * DEG}
    />
  );
}
