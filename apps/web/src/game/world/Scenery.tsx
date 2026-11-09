import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { WORLD, type Obstacle } from '@meetspace/venue';
import { labelTexture } from '../textures';
import { WORLD_COLORS } from '../theme';

type Box = Extract<Obstacle, { shape: 'box' }>;
type Cyl = Extract<Obstacle, { shape: 'cylinder' }>;

/** All solid scenery: visuals + fixed physics colliders. */
export function Scenery() {
  const trees = WORLD.obstacles.filter((o): o is Cyl => o.visual === 'tree');
  const others = WORLD.obstacles.filter((o) => o.visual !== 'tree');
  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        {WORLD.obstacles.map((o) =>
          o.shape === 'box' ? (
            <CuboidCollider
              key={o.id}
              args={[o.size[0] / 2, o.size[1] / 2, o.size[2] / 2]}
              position={[o.at[0], o.size[1] / 2, o.at[1]]}
              rotation={[0, (-(o.rotDeg ?? 0) * Math.PI) / 180, 0]}
            />
          ) : (
            <CylinderCollider key={o.id} args={[o.height / 2, o.radius]} position={[o.at[0], o.height / 2, o.at[1]]} />
          ),
        )}
      </RigidBody>
      <Trees trees={trees} />
      {others.map((o) => (
        <Prop key={o.id} o={o} />
      ))}
    </group>
  );
}

function Prop({ o }: { o: Obstacle }) {
  if (o.shape === 'box') {
    switch (o.visual) {
      case 'stage':
        return <Stage o={o} />;
      case 'screen':
        return <Screen o={o} />;
      case 'bench':
        return <Bench o={o} />;
      case 'hedge':
        return (
          <mesh position={[o.at[0], o.size[1] / 2, o.at[1]]}>
            <boxGeometry args={o.size} />
            <meshStandardMaterial color={WORLD_COLORS.hedge} roughness={1} />
          </mesh>
        );
      case 'arch':
        return <ArchPillar o={o} />;
      default:
        return (
          <mesh position={[o.at[0], o.size[1] / 2, o.at[1]]}>
            <boxGeometry args={o.size} />
            <meshStandardMaterial color={WORLD_COLORS.stone} />
          </mesh>
        );
    }
  }
  switch (o.visual) {
    case 'fountain':
      return <Fountain o={o} />;
    case 'sign':
      return <Sign o={o} />;
    case 'planter':
      return (
        <group position={[o.at[0], 0, o.at[1]]}>
          <mesh position={[0, o.height / 2, 0]}>
            <cylinderGeometry args={[o.radius, o.radius * 0.9, o.height, 20]} />
            <meshStandardMaterial color="#e7d3b0" />
          </mesh>
          <mesh position={[0, o.height + 0.4, 0]}>
            <icosahedronGeometry args={[o.radius * 0.9, 1]} />
            <meshStandardMaterial color="#f472b6" flatShading />
          </mesh>
        </group>
      );
    default:
      return null;
  }
}

/** Instanced low-poly trees (trunk + two canopy blobs). */
function Trees({ trees }: { trees: Cyl[] }) {
  const trunk = useRef<THREE.InstancedMesh>(null);
  const canopy = useRef<THREE.InstancedMesh>(null);
  const setup = (mesh: THREE.InstancedMesh | null, kind: 'trunk' | 'canopy') => {
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    trees.forEach((t, i) => {
      if (kind === 'trunk') {
        m.compose(new THREE.Vector3(t.at[0], t.height * 0.35, t.at[1]), new THREE.Quaternion(), new THREE.Vector3(1, t.height * 0.7, 1));
      } else {
        const s = 1.2 + (t.height - 2) * 0.35;
        m.compose(new THREE.Vector3(t.at[0], t.height * 0.7 + s * 0.7, t.at[1]), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, i, 0)), new THREE.Vector3(s, s * 1.15, s));
        color.set(WORLD_COLORS.leaf[i % WORLD_COLORS.leaf.length]!);
        mesh.setColorAt(i, color);
      }
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  return (
    <group>
      <instancedMesh
        ref={(m) => {
          (trunk as React.MutableRefObject<THREE.InstancedMesh | null>).current = m;
          setup(m, 'trunk');
        }}
        args={[undefined, undefined, trees.length]}
      >
        <cylinderGeometry args={[0.22, 0.3, 1, 8]} />
        <meshStandardMaterial color={WORLD_COLORS.trunk} />
      </instancedMesh>
      <instancedMesh
        ref={(m) => {
          (canopy as React.MutableRefObject<THREE.InstancedMesh | null>).current = m;
          setup(m, 'canopy');
        }}
        args={[undefined, undefined, trees.length]}
      >
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial flatShading />
      </instancedMesh>
    </group>
  );
}

function Fountain({ o }: { o: Cyl }) {
  const spray = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (spray.current) spray.current.scale.y = 1 + Math.sin(clock.elapsedTime * 3) * 0.12;
  });
  return (
    <group position={[o.at[0], 0, o.at[1]]}>
      <mesh position={[0, o.height / 2, 0]}>
        <cylinderGeometry args={[o.radius, o.radius + 0.2, o.height, 32]} />
        <meshStandardMaterial color={WORLD_COLORS.stone} />
      </mesh>
      <mesh position={[0, o.height + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[o.radius - 0.25, 32]} />
        <meshStandardMaterial color={WORLD_COLORS.water} transparent opacity={0.85} />
      </mesh>
      <mesh ref={spray} position={[0, o.height + 0.9, 0]}>
        <coneGeometry args={[0.35, 1.8, 16, 1, true]} />
        <meshStandardMaterial color="#bae6fd" transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

function Stage({ o }: { o: Box }) {
  return (
    <group position={[o.at[0], 0, o.at[1]]}>
      <mesh position={[0, o.size[1] / 2, 0]}>
        <boxGeometry args={o.size} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      <mesh position={[0, o.size[1] + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[o.size[0] - 0.6, o.size[2] - 0.6]} />
        <meshStandardMaterial color="#7c3aed" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (o.size[0] / 2 - 0.4), 3.5, -o.size[2] / 2 + 0.4]}>
          <cylinderGeometry args={[0.15, 0.15, 7, 8]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
      ))}
    </group>
  );
}

function Screen({ o }: { o: Box }) {
  const { tex, aspect } = useMemo(() => labelTexture('KEYNOTE · 2:00 PM · The Future of Work', '#0f172a', '#a5f3fc', 64), []);
  return (
    <group position={[o.at[0], 0, o.at[1]]}>
      <mesh position={[0, o.size[1] / 2 + 1, 0]}>
        <boxGeometry args={o.size} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>
      <mesh position={[0, o.size[1] / 2 + 1.5, o.size[2] / 2 + 0.01]}>
        <planeGeometry args={[o.size[0] - 1, (o.size[0] - 1) / aspect]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Bench({ o }: { o: Box }) {
  return (
    <group position={[o.at[0], 0, o.at[1]]}>
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[o.size[0], 0.1, o.size[2]]} />
        <meshStandardMaterial color={WORLD_COLORS.wood} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (o.size[0] / 2 - 0.2), 0.2, 0]}>
          <boxGeometry args={[0.12, 0.4, o.size[2]]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
      ))}
    </group>
  );
}

function ArchPillar({ o }: { o: Box }) {
  const label = o.label ? labelTexture(o.label, '#7c3aed', '#ffffff', 56) : null;
  return (
    <group>
      <mesh position={[o.at[0], o.size[1] / 2, o.at[1]]}>
        <boxGeometry args={o.size} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      {label && (
        <group position={[0, o.size[1] + 0.4, o.at[1]]}>
          <mesh>
            <boxGeometry args={[9.6, 0.9, 0.5]} />
            <meshStandardMaterial color="#7c3aed" />
          </mesh>
          {[1, -1].map((side) => (
            <mesh key={side} position={[0, 0, side * 0.26]} rotation={[0, side > 0 ? 0 : Math.PI, 0]}>
              <planeGeometry args={[0.8 * label.aspect, 0.8]} />
              <meshBasicMaterial map={label.tex} transparent toneMapped={false} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

function Sign({ o }: { o: Cyl }) {
  const label = labelTexture(o.label ?? '', '#ffffff', '#0f172a', 56);
  return (
    <group position={[o.at[0], 0, o.at[1]]}>
      <mesh position={[0, o.height / 2, 0]}>
        <cylinderGeometry args={[0.08, 0.08, o.height, 8]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
      <sprite position={[0, o.height + 0.35, 0]} scale={[0.7 * label.aspect, 0.7, 1]}>
        <spriteMaterial map={label.tex} transparent />
      </sprite>
    </group>
  );
}
