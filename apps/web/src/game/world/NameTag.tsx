import { labelTexture } from '../textures';

/** Camera-facing label above a character or sign (canvas texture, no font downloads). */
export function NameTag({ text, y, bg = 'rgba(15,23,42,0.8)', height = 0.32 }: { text: string; y: number; bg?: string; height?: number }) {
  const { tex, aspect } = labelTexture(text, bg);
  return (
    <sprite position={[0, y, 0]} scale={[height * aspect, height, 1]} renderOrder={10}>
      <spriteMaterial map={tex} transparent depthWrite={false} />
    </sprite>
  );
}
