// Reads a garment photo and turns it into sweater colors: a stripe sequence for
// the body/sleeves plus colors for collar, cuffs and hem.
import { PATTERN_ROWS, GRID_W } from './grid.js';

const hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

export function loadPhoto(file, max = 800) {
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

// ---- color features: lightness plus a shading-invariant chroma, so shadows and folds stay with their color ----
const LW = 0.4;
function features(d, n) {
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const c = i / 255; lut[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  const g = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116), f = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = lut[d[i * 4]], gr = lut[d[i * 4 + 1]], bl = lut[d[i * 4 + 2]];
    const fx = g((0.4124 * r + 0.3576 * gr + 0.1805 * bl) / 0.95047), fy = g(0.2126 * r + 0.7152 * gr + 0.0722 * bl), fz = g((0.0193 * r + 0.1192 * gr + 0.9505 * bl) / 1.08883);
    const L = 116 * fy - 16, k = 100 / (Math.max(L, 14) + 16);
    f[i * 3] = L * LW; f[i * 3 + 1] = 500 * (fx - fy) * k; f[i * 3 + 2] = 200 * (fy - fz) * k;
  }
  return f;
}
const fdist = (f, i, c) => Math.hypot(f[i * 3] - c[0], f[i * 3 + 1] - c[1], f[i * 3 + 2] - c[2]);

// k-means over pixel indices `idx`, growing clusters while some pixel is still far from every center
function cluster(f, idx, maxK, split, share = 0.03) {
  let cents = [[f[idx[idx.length >> 1] * 3], f[idx[idx.length >> 1] * 3 + 1], f[idx[idx.length >> 1] * 3 + 2]]];
  const assign = new Uint8Array(idx.length);
  const run = () => {
    for (let it = 0; it < 6; it++) {
      const sum = cents.map(() => [0, 0, 0, 0]);
      for (let j = 0; j < idx.length; j++) {
        let bi = 0, bd = 1e9;
        for (let k = 0; k < cents.length; k++) { const dd = fdist(f, idx[j], cents[k]); if (dd < bd) { bd = dd; bi = k; } }
        assign[j] = bi; const s = sum[bi], i = idx[j] * 3; s[0] += f[i]; s[1] += f[i + 1]; s[2] += f[i + 2]; s[3]++;
      }
      cents = cents.map((c, k) => (sum[k][3] ? [sum[k][0] / sum[k][3], sum[k][1] / sum[k][3], sum[k][2] / sum[k][3]] : c));
    }
  };
  run();
  while (cents.length < maxK) {
    // split where a meaningful share of pixels (not a stray one) sits far from its center
    const far = [];
    for (let j = 0; j < idx.length; j++) if (fdist(f, idx[j], cents[assign[j]]) > split) far.push(j);
    if (far.length < idx.length * share) break;
    const j = far[far.length >> 1], i = idx[j] * 3;
    cents.push([f[i], f[i + 1], f[i + 2]]); run();
  }
  const counts = cents.map(() => 0); for (const a of assign) counts[a]++;
  return cents.map((c, k) => ({ c, n: counts[k] })).filter((x) => x.n >= idx.length * share * 0.8).sort((x, y) => y.n - x.n).map((x) => x.c);
}

export function analyze(canvas) {
  const W = canvas.width, H = canvas.height, N = W * H;
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const f = features(d, N), q = new Int32Array(N);
  const grow = (seeds, pass, each) => { // flood fill over 4-neighbours
    const seen = new Uint8Array(N); let qh = 0, qt = 0;
    const visit = (i) => { if (!seen[i] && pass(i)) { seen[i] = 1; q[qt++] = i; } };
    seeds(visit);
    while (qh < qt) {
      const i = q[qh++], x = i % W; each(i);
      if (x > 0) visit(i - 1); if (x < W - 1) visit(i + 1); if (i >= W) visit(i - W); if (i < N - W) visit(i + W);
    }
    return qt;
  };

  // 1. background: whatever is connected to the photo's edge and looks like the edge (lightness counts fully here)
  const m = Math.max(2, Math.round(Math.min(W, H) * 0.03)), edge = [];
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (x < m || y < m || x >= W - m || y >= H - m) edge.push(y * W + x);
  const bgC = cluster(f, edge, 5, 6);
  const isBg = (i) => { for (const c of bgC) if (Math.hypot((f[i * 3] - c[0]) / LW * 0.8, f[i * 3 + 1] - c[1], f[i * 3 + 2] - c[2]) < 10) return true; return false; };
  const bg = new Uint8Array(N);
  const bgCount = grow((v) => { for (let x = 0; x < W; x++) { v(x); v((H - 1) * W + x); } for (let y = 0; y < H; y++) { v(y * W); v(y * W + W - 1); } }, isBg, (i) => { bg[i] = 1; });
  const bgFound = bgCount > N * 0.1 && bgCount < N * 0.93;
  if (!bgFound) bg.fill(0);
  const bounds = (has) => { // bounding box of the rows/columns that hold a real amount of matching pixels
    const rows = new Int32Array(H), cols = new Int32Array(W);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (has(y * W + x)) { rows[y]++; cols[x]++; }
    let x0 = W, x1 = -1, y0 = H, y1 = -1; const tr = Math.max(3, W * 0.02), tc = Math.max(3, H * 0.02);
    for (let y = 0; y < H; y++) if (rows[y] > tr) { if (y0 === H) y0 = y; y1 = y; }
    for (let x = 0; x < W; x++) if (cols[x] > tc) { if (x0 === W) x0 = x; x1 = x; }
    return x1 > x0 && y1 > y0 ? { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2 } : null;
  };
  const box = (B, fx, fy0, fy1) => [Math.max(0, Math.round(B.cx - B.w * fx)), Math.min(W - 1, Math.round(B.cx + B.w * fx)), Math.max(0, Math.round(B.y0 + B.h * fy0)), Math.min(H - 1, Math.round(B.y0 + B.h * fy1))];
  const sampleBox = ([bx0, bx1, by0, by1]) => {
    const step = Math.max(1, Math.round(Math.sqrt(((bx1 - bx0) * (by1 - by0)) / 9000))), out = [];
    const flat = (i, j) => Math.hypot(f[i * 3] - f[j * 3], f[i * 3 + 1] - f[j * 3 + 1], f[i * 3 + 2] - f[j * 3 + 2]) < 7;
    for (let y = Math.max(3, by0); y <= Math.min(H - 4, by1); y += step) for (let x = Math.max(3, bx0); x <= Math.min(W - 4, bx1); x += step) {
      const i = y * W + x; // skip outlines: blended edge pixels would show up as colors that are not really there
      if (!bg[i] && flat(i, i - 3) && flat(i, i + 3) && flat(i, i - 3 * W) && flat(i, i + 3 * W)) out.push(i);
    }
    return out;
  };
  // label pixels by color, keeping only what is connected to the seed box (so look-alike things elsewhere stay untouched)
  const TOL = bgFound ? 14 : 12, SPLIT = 11;
  const labelPass = (cents, [bx0, bx1, by0, by1]) => {
    const raw = new Uint8Array(N).fill(255), lab = new Uint8Array(N).fill(255);
    for (let i = 0; i < N; i++) {
      if (bg[i]) continue;
      let bi = 255, bd = TOL;
      for (let k = 0; k < cents.length; k++) { const dd = fdist(f, i, cents[k]); if (dd < bd) { bd = dd; bi = k; } }
      raw[i] = bi;
    }
    grow((v) => { for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) if (raw[y * W + x] !== 255) v(y * W + x); },
      (i) => (bgFound ? !bg[i] : raw[i] !== 255), (i) => { lab[i] = raw[i]; });
    return { lab, raw };
  };
  const solid = (l, i) => l[i] !== 255 && i > 2 * W + 2 && i < N - 2 * W - 2 && l[i - 2] !== 255 && l[i + 2] !== 255 && l[i - 2 * W] !== 255 && l[i + 2 * W] !== 255; // not a 1-2 px outline

  // 2. the garment's main colors come from the middle of the object; that also tells us where the garment is
  const obj = (bgFound && bounds((i) => !bg[i])) || { x0: W * 0.1, x1: W * 0.9, y0: H * 0.08, y1: H * 0.92, w: W * 0.8, h: H * 0.84, cx: W / 2 };
  const core = box(obj, 0.18, 0.35, 0.7), s1 = sampleBox(core);
  if (s1.length < 50) return null;
  const c1 = cluster(f, s1, 5, SPLIT);
  if (!c1.length) return null;
  const p1 = labelPass(c1, core), G = bounds((i) => solid(p1.lab, i));
  if (!G) return null;
  // garment parts that match the background (a white stripe against a white wall) were eaten from the sides: give back
  // any short background run that has garment directly above it and garment-colored pixels below it
  if (bgFound) for (let x = 0; x < W; x++) {
    let last = -1;
    for (let y = 0; y < H; y++) {
      const i = y * W + x;
      if (bg[i]) continue;
      if (last >= 0 && y - last > 1 && y - last < H * 0.2 && p1.raw[i] !== 255) for (let k = last + 1; k < y; k++) bg[k * W + x] = 0;
      if (solid(p1.lab, i)) last = y;
    }
  }

  // 3. look again over the garment's full height, plus a margin, for trims in other colors (collar, hem)
  const full = [Math.max(0, Math.round(G.cx - G.w * 0.22)), Math.min(W - 1, Math.round(G.cx + G.w * 0.22)), Math.max(0, Math.round(G.y0 - G.h * 0.1)), Math.min(H - 1, Math.round(G.y1 + G.h * 0.1))];
  const extra = cluster(f, sampleBox(full), 7, SPLIT, 0.012).filter((c) => c1.every((k) => Math.hypot(c[0] - k[0], c[1] - k[1], c[2] - k[2]) > 10));
  const cents = c1.concat(extra).slice(0, 8), lab = labelPass(cents, full).lab;
  // a color found only in the margin belongs to the garment only if it stays close to it (a hem does; jeans, a face or the floor do not)
  for (let k = c1.length; k < cents.length; k++) {
    const B = bounds((i) => lab[i] === k && solid(lab, i));
    if (!B || B.y0 < G.y0 - G.h * 0.18 || B.y1 > G.y1 + G.h * 0.18 || B.x0 < G.x0 - G.w * 0.18 || B.x1 > G.x1 + G.w * 0.18) for (let i = 0; i < N; i++) if (lab[i] === k) lab[i] = 255;
  }

  // 4. clean up. Hairline outlines elsewhere in the photo can share a garment color: keep only what hangs on a solid area
  {
    const keep = new Uint8Array(N); let front = [];
    for (let i = 0; i < N; i++) if (solid(lab, i)) { keep[i] = 1; front.push(i); }
    for (let it = 0; it < 4; it++) {
      const next = [];
      for (const i of front) for (const o of [-1, 1, -W, W]) { const j = i + o; if (j >= 0 && j < N && !keep[j] && lab[j] !== 255) { keep[j] = 1; next.push(j); } }
      front = next;
    }
    for (let i = 0; i < N; i++) if (!keep[i]) lab[i] = 255;
  }
  // Thin clusters that are just the blend between two colors (anti-aliased outlines) are not areas of their own
  const stat = cents.map(() => [0, 0, 0, 0, 0]);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x, l = lab[i]; if (l === 255) continue;
    const s = stat[l]; s[0] += d[i * 4]; s[1] += d[i * 4 + 1]; s[2] += d[i * 4 + 2]; s[3]++;
    if (lab[i - 1] === l && lab[i + 1] === l && lab[i - W] === l && lab[i + W] === l) s[4]++;
  }
  const avg = stat.map((s) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : null));
  const between = (k) => avg.some((a, i) => avg.some((b, j) => {
    if (!a || !b || i >= j || i === k || j === k) return false;
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2; if (len < 900) return false;
    const t = ((avg[k][0] - a[0]) * ab[0] + (avg[k][1] - a[1]) * ab[1] + (avg[k][2] - a[2]) * ab[2]) / len;
    return t > 0.15 && t < 0.85 && Math.hypot(a[0] + ab[0] * t - avg[k][0], a[1] + ab[1] * t - avg[k][1], a[2] + ab[2] * t - avg[k][2]) < 22;
  }));
  const total = stat.reduce((n, s) => n + s[3], 0);
  const drop = stat.map((s, k) => !s[3] || s[3] < total * 0.004 || (s[4] / s[3] < 0.45 && between(k)));
  const order = cents.map((_, k) => k).filter((k) => !drop[k]).sort((x, y) => stat[y][3] - stat[x][3]);
  if (!order.length) return null;
  const remap = new Uint8Array(256).fill(255); order.forEach((k, n) => { remap[k] = n; });
  const loose = new Uint8Array(N); // pixels that should take a neighbour's label
  for (let i = 0; i < N; i++) { const l = lab[i]; if (l !== 255) { lab[i] = remap[l]; if (lab[i] === 255) loose[i] = 1; } }
  { // grow each area into touching pixels that are a looser match: the same yarn in deeper shadow or brighter light
    const cR = order.map((k) => cents[k]); let qh = 0, qt = 0;
    for (let i = 0; i < N; i++) if (lab[i] !== 255) q[qt++] = i;
    while (qh < qt) {
      const i = q[qh++], x = i % W, l = lab[i];
      for (const o of [-1, 1, -W, W]) {
        const j = i + o; if (j < 0 || j >= N || (o === -1 && x === 0) || (o === 1 && x === W - 1)) continue;
        if (lab[j] === 255 && !bg[j] && fdist(f, j, cR[l]) < TOL * 2 && qt < N) { lab[j] = l; q[qt++] = j; }
      }
    }
  }
  const nb = [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1], alpha = new Uint8Array(N);
  const spread = (ok, need, a) => {
    const add = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x; if (lab[i] !== 255 || !ok(i)) continue;
      const cnt = {}; let tot = 0, best = 255;
      for (const o of nb) { const l = lab[i + o]; if (l !== 255) { cnt[l] = (cnt[l] || 0) + 1; tot++; if (best === 255 || cnt[l] > cnt[best]) best = l; } }
      if (tot >= need) add.push(i, best);
    }
    for (let j = 0; j < add.length; j += 2) { lab[add[j]] = add[j + 1]; alpha[add[j]] = a; }
    return add.length;
  };
  for (let i = 0; i < N; i++) if (lab[i] !== 255) alpha[i] = 255;
  { // patches of the garment that fell outside every color (deep shadow, glare) and are fully enclosed by it join their surroundings
    const seen = new Uint8Array(N);
    for (let s0 = 0; s0 < N; s0++) {
      if (seen[s0] || lab[s0] !== 255 || bg[s0] || loose[s0]) continue;
      let qh = 0, qt = 0, open = false; seen[s0] = 1; q[qt++] = s0;
      while (qh < qt) {
        const i = q[qh++], x = i % W;
        if (x === 0 || x === W - 1 || i < W || i >= N - W) { open = true; continue; }
        for (const o of [-1, 1, -W, W]) { const j = i + o; if (bg[j]) open = true; else if (lab[j] === 255 && !seen[j]) { seen[j] = 1; q[qt++] = j; } }
      }
      if (!open && qt < N * 0.03) for (let k = 0; k < qt; k++) loose[q[k]] = 1;
    }
  }
  for (let it = 0; it < 30 && spread((i) => loose[i], 1, 255); it++); // dissolved outlines, enclosed patches
  for (let it = 0; it < 4 && spread((i) => !bg[i], 5, 255); it++);     // pinholes: deep folds, highlights
  spread((i) => !bg[i], 1, 255); spread(() => true, 1, 150); spread(() => true, 1, 60); // soft edge over the blended rim

  // 5. each area's real average color
  const sums = order.map(() => [0, 0, 0, 0]);
  for (let i = 0; i < N; i++) if (alpha[i] === 255) { const s = sums[lab[i]]; s[0] += d[i * 4]; s[1] += d[i * 4 + 1]; s[2] += d[i * 4 + 2]; s[3]++; }
  const means = sums.map((s) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : [128, 128, 128]));
  const palette = means.map(hex);
  const seg = { labels: lab, alpha, means, palette: palette.slice(), areas: palette.length === 1 ? ['body'] : palette.map((_, i) => 'p' + i), orig: new ImageData(new Uint8ClampedArray(d), W, H) };
  const zones = { body: palette[0], sleeves: palette[0], collar: palette[0], cuffs: palette[0], hem: palette[0] };
  if (palette.length === 1) return { pattern: null, zones, seg };

  // 6. the knitted pattern for the 3D sweater: a stitch chart read from the front of the garment
  const B = bounds((i) => alpha[i] === 255) || G;
  const mode = (arr) => { const c = {}; let b = -1; for (const v of arr) if (v >= 0) { c[v] = (c[v] || 0) + 1; if (b < 0 || c[v] > c[b]) b = v; } return b; };
  const at = (px, py) => { const i = Math.min(H - 1, Math.max(0, py)) * W + Math.min(W - 1, Math.max(0, px)); return alpha[i] === 255 ? lab[i] : -1; };
  const [gx0, gx1, gy0, gy1] = box(B, 0.2, 0.12, 0.9), grid = [], rows = [];
  const cw = (gx1 - gx0) / GRID_W, ch = (gy1 - gy0) / PATTERN_ROWS;
  for (let r = 0; r < PATTERN_ROWS; r++) for (let c = 0; c < GRID_W; c++) {
    const v = [];
    for (const oy of [0.25, 0.5, 0.75]) for (const ox of [0.25, 0.5, 0.75]) v.push(at(Math.round(gx0 + (c + ox) * cw), Math.round(gy0 + (r + oy) * ch)));
    grid.push(mode(v));
  }
  for (let r = 0; r < PATTERN_ROWS; r++) rows.push(mode(grid.slice(r * GRID_W, (r + 1) * GRID_W)));
  const main = Math.max(0, mode(rows));
  for (let r = 0; r < PATTERN_ROWS; r++) { if (rows[r] < 0) rows[r] = r ? rows[r - 1] : main; for (let c = 0; c < GRID_W; c++) if (grid[r * GRID_W + c] < 0) grid[r * GRID_W + c] = rows[r]; }
  let off = 0; for (let i = 0; i < grid.length; i++) if (grid[i] !== rows[(i / GRID_W) | 0]) off++;
  const band = (fx, a, b2) => { const [bx0, bx1, by0, by1] = box(B, fx, a, b2), v = []; for (let y = by0; y <= by1; y += 2) for (let x = bx0; x <= bx1; x += 2) v.push(at(x, y)); return mode(v); };
  const collar = band(0.08, 0.0, 0.06), hem = band(0.18, 0.94, 0.995);
  const rib = { collar: collar < 0 ? rows[0] : collar, hem: hem < 0 ? rows[PATTERN_ROWS - 1] : hem };
  rib.cuffs = rib.hem;
  return { pattern: { kind: 'photo', rows, palette, rib, grid: off > grid.length * 0.06 ? grid : null }, zones, seg };
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
    const j = i * 4, l = lum([o[j], o[j + 1], o[j + 2]]), m = ml[k], a = seg.alpha[i] / 255;
    let r, g, b;
    if (l <= m) { const f = (l + 14) / (m + 14); r = t[0] * f; g = t[1] * f; b = t[2] * f; }
    else { const f = Math.min(1, (l - m) / (256 - m)); r = t[0] + (255 - t[0]) * f; g = t[1] + (255 - t[1]) * f; b = t[2] + (255 - t[2]) * f; }
    o[j] += (r - o[j]) * a; o[j + 1] += (g - o[j + 1]) * a; o[j + 2] += (b - o[j + 2]) * a;
  }
  canvas.getContext('2d').putImageData(out, 0, 0);
}

export function labelAt(canvas, seg, fx, fy) {
  const x = Math.min(canvas.width - 1, Math.max(0, Math.round(fx * canvas.width))), y = Math.min(canvas.height - 1, Math.max(0, Math.round(fy * canvas.height)));
  const i = y * canvas.width + x;
  return seg.alpha[i] === 255 ? seg.labels[i] : 255;
}
