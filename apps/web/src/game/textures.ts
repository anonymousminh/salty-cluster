import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();

/** Round badge with company initials (or a check mark), drawn on a canvas: no font/network loads. */
export function badgeTexture(text: string, fill: string, ring: string): THREE.CanvasTexture {
  const key = `${text}|${fill}|${ring}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = ring;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${text.length > 2 ? 40 : 52}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2 + 3);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

let beamTex: THREE.CanvasTexture | null = null;

/** Vertical alpha gradient (opaque at the bottom, transparent at the top) for light beams. */
export function beamGradient(): THREE.CanvasTexture {
  if (beamTex) return beamTex;
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0.9)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  beamTex = new THREE.CanvasTexture(canvas);
  return beamTex;
}

export function initials(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

const labelCache = new Map<string, { tex: THREE.CanvasTexture; aspect: number }>();

/** Rounded label (name tags, signs) drawn on a canvas. Returns the texture and its width/height ratio. */
export function labelTexture(text: string, bg = 'rgba(15,23,42,0.85)', fg = '#ffffff', fontPx = 44): { tex: THREE.CanvasTexture; aspect: number } {
  const key = `${text}|${bg}|${fg}|${fontPx}`;
  const hit = labelCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `700 ${fontPx}px system-ui, -apple-system, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + fontPx;
  const h = Math.ceil(fontPx * 1.6);
  canvas.width = w;
  canvas.height = h;
  ctx.font = `700 ${fontPx}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = bg;
  const r = h / 2;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(w, 0, w, h, r);
  ctx.arcTo(w, h, 0, h, r);
  ctx.arcTo(0, h, 0, 0, r);
  ctx.arcTo(0, 0, w, 0, r);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const out = { tex, aspect: w / h };
  labelCache.set(key, out);
  return out;
}

const bubbleCache = new Map<string, { tex: THREE.CanvasTexture; aspect: number }>();

/**
 * Speech bubble with the text wrapped to a few lines (white card, dark text, small tail).
 * Long messages are cut with an ellipsis; the full text is always in the chat panel.
 */
export function bubbleTexture(text: string, maxLines = 4, maxCharsPerLine = 24): { tex: THREE.CanvasTexture; aspect: number } {
  const key = `${text}|${maxLines}|${maxCharsPerLine}`;
  const hit = bubbleCache.get(key);
  if (hit) return hit;
  if (bubbleCache.size > 200) bubbleCache.clear(); // chat is unbounded; keep memory flat

  // Greedy word wrap, breaking over-long words.
  const lines: string[] = [];
  let line = '';
  for (let word of text.split(' ')) {
    while ([...word].length > maxCharsPerLine) {
      if (line) lines.push(line), (line = '');
      lines.push([...word].slice(0, maxCharsPerLine).join(''));
      word = [...word].slice(maxCharsPerLine).join('');
    }
    if (!line) line = word;
    else if ([...line].length + 1 + [...word].length <= maxCharsPerLine) line += ` ${word}`;
    else lines.push(line), (line = word);
  }
  if (line) lines.push(line);
  let shown = lines.slice(0, maxLines);
  if (lines.length > maxLines) shown[maxLines - 1] = `${[...shown[maxLines - 1]!].slice(0, maxCharsPerLine - 1).join('')}…`;
  if (shown.length === 0) shown = [''];

  const font = 40;
  const pad = 22;
  const tail = 18;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `600 ${font}px system-ui, -apple-system, sans-serif`;
  const textW = Math.max(...shown.map((l) => ctx.measureText(l).width));
  const w = Math.ceil(textW + pad * 2);
  const bodyH = Math.ceil(shown.length * font * 1.25 + pad * 1.4);
  canvas.width = w;
  canvas.height = bodyH + tail;
  ctx.font = `600 ${font}px system-ui, -apple-system, sans-serif`;
  const r = 20;
  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  ctx.strokeStyle = 'rgba(15,23,42,0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(r, 1);
  ctx.arcTo(w - 1, 1, w - 1, bodyH, r);
  ctx.arcTo(w - 1, bodyH, w / 2 + 12, bodyH, r);
  ctx.lineTo(w / 2 + 12, bodyH);
  ctx.lineTo(w / 2, bodyH + tail);
  ctx.lineTo(w / 2 - 12, bodyH);
  ctx.arcTo(1, bodyH, 1, 1, r);
  ctx.arcTo(1, 1, w - 1, 1, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  shown.forEach((l, i) => ctx.fillText(l, w / 2, pad * 0.7 + font * 0.62 + i * font * 1.25));
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const out = { tex, aspect: w / canvas.height };
  bubbleCache.set(key, out);
  return out;
}
