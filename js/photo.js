// Reads a garment photo and turns it into sweater colors: a stripe sequence for
// the body/sleeves plus colors for collar, cuffs and hem.
import { PATTERN_ROWS } from './studio.js';

const hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const median = (a) => a.sort((x, y) => x - y)[a.length >> 1];

export function loadPhoto(file, max = 900) {
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
  // label every garment pixel with its nearest palette color so the photo itself can be recolored
  const means = keep.map((i) => cents[i]), pix = new Uint8Array(W * H).fill(255);
  const areas = palette.length === 1 ? ['body'] : palette.map((_, i) => 'p' + i), segPal = palette.slice();
  // collar and hem become their own areas when their color differs from the body colors
  const half = y0 + bh / 2, where = [];
  for (const [c, area, top] of [[collar, 'collar', true], [hem, 'hem', false]]) {
    if (c && means.slice(0, palette.length).every((k) => dist(k, c) > 40)) { means.push(c); areas.push(area); segPal.push(hex(c)); where.push(top); }
  }
  for (let i = 0; i < W * H; i++) {
    if (!fg[i]) continue;
    const p = [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]], y = (i / W) | 0;
    let bi = 255, bd = 95;
    for (let k = 0; k < means.length; k++) {
      if (k >= palette.length && where[k - palette.length] !== (y < half)) continue;
      const dd = dist(means[k], p); if (dd < bd) { bd = dd; bi = k; }
    }
    pix[i] = bi;
  }
  const seg = { labels: pix, means, areas, palette: segPal, orig: new ImageData(new Uint8ClampedArray(d), W, H) };
  if (palette.length === 1) { zones.body = zones.sleeves = palette[0]; return { pattern: null, zones, seg }; }
  return { pattern: { kind: 'photo', rows, palette }, zones, seg };
}

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

// Repaint the photo: each labelled area takes its new color, keeping the original light and shadow.
export function recolor(canvas, seg, colors) {
  const out = new ImageData(new Uint8ClampedArray(seg.orig.data), seg.orig.width, seg.orig.height), o = out.data;
  const target = colors.map((c, i) => (c && c.toLowerCase() !== seg.palette[i] ? rgb(c) : null));
  const ml = seg.means.map(lum);
  for (let i = 0; i < seg.labels.length; i++) {
    const k = seg.labels[i], t = target[k];
    if (!t) continue;
    const j = i * 4, l = lum([o[j], o[j + 1], o[j + 2]]), m = ml[k];
    if (l <= m) { const f = l / (m || 1); o[j] = t[0] * f; o[j + 1] = t[1] * f; o[j + 2] = t[2] * f; }
    else { const f = Math.min(1, (l - m) / (256 - m)); o[j] = t[0] + (255 - t[0]) * f; o[j + 1] = t[1] + (255 - t[1]) * f; o[j + 2] = t[2] + (255 - t[2]) * f; }
  }
  canvas.getContext('2d').putImageData(out, 0, 0);
}

export function labelAt(canvas, seg, fx, fy) {
  const x = Math.min(canvas.width - 1, Math.max(0, Math.round(fx * canvas.width))), y = Math.min(canvas.height - 1, Math.max(0, Math.round(fy * canvas.height)));
  return seg.labels[y * canvas.width + x];
}
