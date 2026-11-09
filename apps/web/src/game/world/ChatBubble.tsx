import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { bubbleTexture } from '../textures';
import { useNet } from '../net/store';

/**
 * Speech bubble above a character while their message is fresh. Reads `bubbles[pid]` from the
 * chat store; the store removes it when it expires (and drops it for muted players).
 */
export function ChatBubble({ pid, y }: { pid: string | null | undefined; y: number }) {
  const bubble = useNet((s) => (pid ? s.bubbles[pid] : undefined));
  const muted = useNet((s) => (pid ? s.muted.includes(pid) : false));
  if (!bubble || muted) return null;
  return <BubbleSprite text={bubble.text} until={bubble.until} y={y} />;
}

const HEIGHT = 0.46;

function BubbleSprite({ text, until, y }: { text: string; until: number; y: number }) {
  const { tex, aspect } = useMemo(() => bubbleTexture(text), [text]);
  const mat = useRef<THREE.SpriteMaterial>(null);
  const born = useRef(performance.now());
  useEffect(() => {
    born.current = performance.now();
  }, [text]);
  useFrame(() => {
    if (!mat.current) return;
    const now = performance.now();
    const fadeIn = Math.min(1, (now - born.current) / 150);
    const fadeOut = Math.min(1, Math.max(0, (until - Date.now()) / 500));
    mat.current.opacity = Math.min(fadeIn, fadeOut);
  });
  // Anchored at the bottom so the bubble grows upward from the tail.
  return (
    <sprite position={[0, y, 0]} center={new THREE.Vector2(0.5, 0)} scale={[HEIGHT * aspect, HEIGHT, 1]} renderOrder={12}>
      <spriteMaterial ref={mat} map={tex} transparent depthWrite={false} opacity={0} />
    </sprite>
  );
}
