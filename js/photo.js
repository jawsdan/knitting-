// Reads a garment photo and turns it into sweater colors: a stripe sequence for
// the body/sleeves plus colors for collar, cuffs and hem.
import { PATTERN_ROWS } from './studio.js';

const hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const median = (a) => a.sort((x, y) => x - y)[a.length >> 1];

export function loadPhoto(file, max = 300) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
      c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
    img.src = url;
  });
}

export function colorAt(canvas, fx, fy) {
  const x = Math.round(fx * (canvas.width - 1)), y = Math.round(fy * (canvas.height - 1));
  const x0 = Math.max(0, x - 2), y0 = Math.max(0, y - 2), w = Math.min(canvas.width - x0, 5), h = Math.min(canvas.height - y0, 5);
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(x0, y0, w, h).data;
  const s = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; }
  return hex(s.map((v) => v / (d.length / 4)));
}

export function analyze(canvas) {
  const W = canvas.width, H = canvas.height;
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const px = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };

  // background = median color of the photo's border
  const b = [[], [], []], m = Math.max(1, Math.round(Math.min(W, H) * 0.04));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x < m || y < m || x >= W - m || y >= H - m) { const p = px(x, y); b[0].push(p[0]); b[1].push(p[1]); b[2].push(p[2]); }
  }
  const bg = b.map(median);
  let fg = new Uint8Array(W * H), n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dist(px(x, y), bg) > 44) { fg[y * W + x] = 1; n++; }
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  const ratio = n / (W * H);
  if (ratio < 0.08 || ratio > 0.9) { // no clear background: assume the garment fills the middle
    fg = fg.fill(1); x0 = Math.round(W * 0.15); x1 = Math.round(W * 0.85); y0 = Math.round(H * 0.1); y1 = Math.round(H * 0.9);
  } else {
    for (let y = 0; y < H; y++) { let c = 0; for (let x = 0; x < W; x++) c += fg[y * W + x]; if (c > W * 0.06) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
    for (let x = 0; x < W; x++) { let c = 0; for (let y = 0; y < H; y++) c += fg[y * W + x]; if (c > H * 0.06) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); } }
  }
  const bw = x1 - x0, bh = y1 - y0, cx = (x0 + x1) / 2;
  const xa = Math.max(0, Math.round(cx - bw * 0.13)), xb = Math.min(W - 1, Math.round(cx + bw * 0.13));

  const rowColor = (y) => {
    const s = [0, 0, 0]; let c = 0;
    for (let x = xa; x <= xb; x++) if (fg[y * W + x]) { const p = px(x, y); s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; c++; }
    return c >= (xb - xa + 1) * 0.3 ? s.map((v) => v / c) : null;
  };
  const band = (f0, f1) => {
    const out = [];
    for (let y = Math.round(y0 + bh * f0); y <= Math.round(y0 + bh * f1); y++) { const c = rowColor(Math.min(H - 1, y)); if (c) out.push(c); }
    return out;
  };
  const avg = (list) => list.length ? [0, 1, 2].map((k) => list.reduce((s, c) => s + c[k], 0) / list.length) : null;

  const body = band(0.14, 0.88);
  if (!body.length) return null;

  // k-means on the row colors, farthest-point start
  let cents = [body[body.length >> 1]];
  while (cents.length < 4) {
    let best = null, bd = 0;
    for (const c of body) { const dd = Math.min(...cents.map((k) => dist(k, c))); if (dd > bd) { bd = dd; best = c; } }
    if (bd < 40) break;
    cents.push(best);
  }
  let labels = [];
  for (let it = 0; it < 8; it++) {
    labels = body.map((c) => { let bi = 0, bd = 1e9; cents.forEach((k, i) => { const dd = dist(k, c); if (dd < bd) { bd = dd; bi = i; } }); return bi; });
    cents = cents.map((k, i) => avg(body.filter((_, j) => labels[j] === i)) || k);
  }
  // drop tiny clusters (noise, shadows) and relabel
  const counts = cents.map((_, i) => labels.filter((l) => l === i).length);
  const keep = cents.map((_, i) => i).filter((i) => counts[i] >= body.length * 0.05);
  const map = cents.map((k, i) => { if (keep.includes(i)) return keep.indexOf(i); let bi = 0, bd = 1e9; keep.forEach((j, n2) => { const dd = dist(cents[j], k); if (dd < bd) { bd = dd; bi = n2; } }); return bi; });
  labels = labels.map((l) => map[l]);
  const palette = keep.map((i) => hex(cents[i]));
  // mode filter, then resample to the pattern length
  const smooth = labels.map((_, i) => {
    const win = labels.slice(Math.max(0, i - 2), i + 3), cnt = {};
    let best = win[0]; for (const l of win) { cnt[l] = (cnt[l] || 0) + 1; if (cnt[l] > cnt[best]) best = l; }
    return best;
  });
  const rows = Array.from({ length: PATTERN_ROWS }, (_, i) => smooth[Math.min(smooth.length - 1, Math.floor((i + 0.5) / PATTERN_ROWS * smooth.length))]);

  const main = palette[rows[0]] || palette[0];
  const collar = avg(band(0.02, 0.09)), hem = avg(band(0.93, 0.99));
  const zones = { body: palette[0], sleeves: palette[0], collar: collar ? hex(collar) : main, hem: hem ? hex(hem) : palette[rows[PATTERN_ROWS - 1]], cuffs: hem ? hex(hem) : palette[rows[PATTERN_ROWS - 1]] };
  if (palette.length === 1) { zones.body = zones.sleeves = palette[0]; return { pattern: null, zones }; }
  return { pattern: { kind: 'photo', rows, palette }, zones };
}
