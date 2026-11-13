// 3D sweater: procedural geometry, knit textures, drag-to-spin, tap-to-select.
import * as THREE from '../vendor/three.module.min.js';

const FIT = { slim: { W: 0.44, D: 0.235, R: 0.15 }, regular: { W: 0.5, D: 0.27, R: 0.17 }, oversized: { W: 0.58, D: 0.31, R: 0.2 } };
const LEN = { cropped: 0.42, regular: 0.62, long: 0.84 };
const NECK = { crew: { h: 0.07, dip: 0.075 }, turtle: { h: 0.25, dip: 0.02 } };
const YS = 0.4, NY = 0.58, NRX = 0.17, NRZ = 0.15, VS = 0.8, HEM = 0.13, CUFF = 0.12;
const STITCH_W = 0.022, STITCH_H = 0.019;
export const PATTERN_ROWS = 48;

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const se = (c) => Math.sign(c) * Math.pow(Math.abs(c), 0.8);
const front = (s) => (s > 0 ? Math.pow(s, 1.5) : 0);

function surface(fn, nu, nv, flipV) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = i / nu, v = j / nv, p = fn(u, v);
    pos.push(p[0], p[1], p[2]); uv.push(u, flipV ? 1 - v : v);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    idx.push(a, d, b, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const n = g.attributes.normal; // weld the seam so lighting is continuous
  for (let j = 0; j <= nv; j++) {
    const a = j * (nu + 1), b = a + nu;
    const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
  }
  return g;
}

function knitTile(rib) {
  const w = 64, h = 56, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = rib ? '#8a8a8a' : '#a8a8a8'; x.fillRect(0, 0, w, h);
  if (rib) {
    const g = x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#6e6e6e'); g.addColorStop(0.3, '#f4f4f4'); g.addColorStop(0.7, '#f4f4f4'); g.addColorStop(1, '#6e6e6e');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  }
  x.lineCap = 'round'; x.lineWidth = rib ? 11 : 16;
  x.strokeStyle = '#ffffff'; x.shadowColor = rib ? 'rgba(0,0,0,.35)' : '#fff'; x.shadowBlur = rib ? 3 : 4;
  const inset = rib ? 0.3 : 0.14;
  for (const oy of [-h, 0, h]) {
    x.beginPath();
    x.moveTo(w * inset, oy - h * 0.1); x.lineTo(w * 0.5, oy + h * 0.95);
    x.moveTo(w * (1 - inset), oy - h * 0.1); x.lineTo(w * 0.5, oy + h * 0.95);
    x.stroke();
  }
  x.shadowBlur = 0; x.strokeStyle = 'rgba(0,0,0,.16)'; x.lineWidth = 2;
  for (const oy of [-h, 0, h]) { x.beginPath(); x.moveTo(w * 0.5, oy + h * 0.05); x.lineTo(w * 0.5, oy + h * 0.8); x.stroke(); }
  return c;
}

function tex(canvas, rx, ry, color) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Studio {
  constructor(stage, design, onPick) {
    this.stage = stage; this.design = design; this.onPick = onPick;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    stage.prepend(r.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd9c4bb, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(1.5, 2.2, 3); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xcfe2ff, 1.1); rim.position.set(-2.5, 1, -2.5); this.scene.add(rim);
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.tiles = { knit: knitTile(false), rib: knitTile(true) };
    this.spin = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.006;
    this.vel = 0; this.dirty = true;
    this.build();
    this.bind();
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(stage);
    this.resize();
    const loop = () => { this.raf = requestAnimationFrame(loop); this.tick(); };
    loop();
  }

  dims() {
    const d = this.design, f = FIT[d.fit] || FIT.regular, n = NECK[d.neck] || NECK.crew;
    return { ...f, L: LEN[d.length] || LEN.regular, ...n };
  }

  sleevePath(sgn) {
    const { W } = this.dims();
    const A = [sgn * (W - 0.2), YS - 0.14], C = [sgn * (W + 0.13), YS - 0.1], B = [sgn * (W + 0.3), YS - 1.0];
    const at = (t) => {
      const m = 1 - t;
      return {
        p: [m * m * A[0] + 2 * m * t * C[0] + t * t * B[0], m * m * A[1] + 2 * m * t * C[1] + t * t * B[1]],
        d: [2 * m * (C[0] - A[0]) + 2 * t * (B[0] - C[0]), 2 * m * (C[1] - A[1]) + 2 * t * (B[1] - C[1])],
      };
    };
    return { at, B };
  }

  build() {
    for (const m of this.group.children) { m.geometry.dispose(); this.disposeMat(m.material); }
    this.group.clear();
    const D = this.dims(), { W, L, R, h, dip } = D, Dz = D.D;
    const scale = W / 0.5;
    this.cols = Math.round(124 * scale);
    this.rows = Math.round((L + YS + 0.3) / STITCH_H);
    this.sCols = Math.round(46 * scale); this.sRows = 52;

    const torso = surface((u, v) => {
      const c = Math.cos(u * TAU), s = Math.sin(u * TAU);
      let y, rx, rz;
      if (v <= VS) { const k = v / VS; y = lerp(-L, YS, k); const taper = 1 - 0.035 * (1 - k) * (1 - k); rx = W * taper; rz = Dz * taper; }
      else {
        const q = (v - VS) / (1 - VS), a = q * Math.PI / 2;
        rx = NRX + (W - NRX) * Math.cos(a); rz = NRZ + (Dz - NRZ) * Math.cos(a);
        y = YS + (NY - YS) * Math.sin(a) - dip * q * q * front(s);
      }
      return [rx * se(c), y, rz * se(s)];
    }, 72, 48);
    this.add(torso, 'body');

    this.add(surface((u, v) => {
      const c = Math.cos(u * TAU), s = Math.sin(u * TAU);
      const k = (1 - 0.035) * (1 - 0.05 * Math.sin((1 - v) * Math.PI / 2));
      return [W * k * se(c), -L - HEM * (1 - v), Dz * k * se(s)];
    }, 72, 6), 'hem');

    this.add(surface((u, v) => {
      const c = Math.cos(u * TAU), s = Math.sin(u * TAU);
      const k = d_neckFlare(this.design.neck, v);
      return [NRX * k * se(c), NY - dip * front(s) - 0.02 + v * (h + 0.02 + dip * front(s) * (this.design.neck === 'turtle' ? 1 : 0.25)), NRZ * k * se(s)];
    }, 48, 8), 'collar');

    for (const sgn of [1, -1]) {
      const path = this.sleevePath(sgn);
      const ring = (p, d, r, u) => {
        const l = Math.hypot(d[0], d[1]), tx = d[0] / l, ty = d[1] / l;
        const c = Math.cos(u * TAU), s = Math.sin(u * TAU);
        return [p[0] + ty * r * c, p[1] - tx * r * c, r * 0.94 * s];
      };
      this.add(surface((u, v) => {
        const { p, d } = path.at(v);
        return ring(p, d, lerp(R, R * 0.6, Math.pow(v, 0.85)), u);
      }, 28, 40, true), 'sleeves');
      const end = path.at(1), l = Math.hypot(end.d[0], end.d[1]);
      this.add(surface((u, v) => {
        const p = [end.p[0] + end.d[0] / l * CUFF * v, end.p[1] + end.d[1] / l * CUFF * v];
        return ring(p, end.d, R * 0.6 * (1 - 0.1 * Math.min(1, v * 3)), u);
      }, 28, 5, true), 'cuffs');
    }
    this.cy = (NY + h - L - HEM) / 2;
    this.span = { h: NY + h + L + HEM, w: 2 * (W + 0.3 + R) };
    this.group.position.y = -this.cy;
    this.applyColors();
    this.fit();
  }

  add(geo, zone) {
    const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.92, side: THREE.DoubleSide, sheen: 0.5, sheenRoughness: 0.6, bumpScale: 1.3 });
    const m = new THREE.Mesh(geo, mat); m.userData.zone = zone;
    this.group.add(m);
  }

  disposeMat(m) { m.map?.dispose(); m.bumpMap?.dispose(); m.dispose(); }

  // pattern row (0 = neckline) for a point on the sleeve, aligned with the body stripes by height
  sleeveRow(t) {
    const { L } = this.dims();
    const y = lerp(YS - 0.1, YS - 1.0, t);
    const f = 1 - VS * (y + L) / (YS + L);
    return ((Math.floor(f * PATTERN_ROWS) % PATTERN_ROWS) + PATTERN_ROWS) % PATTERN_ROWS;
  }

  stripeCanvas(n, rowAt) {
    const pat = this.design.pattern, th = 32, c = document.createElement('canvas');
    c.width = 64; c.height = n * th;
    const x = c.getContext('2d');
    for (let r = 0; r < n; r++) { x.fillStyle = pat.palette[pat.rows[rowAt(r)]] || '#888'; x.fillRect(0, r * th, 64, th); }
    x.globalCompositeOperation = 'multiply';
    for (let r = 0; r < n; r++) x.drawImage(this.tiles.knit, 0, r * th, 64, th);
    return c;
  }

  applyColors() {
    const d = this.design, pat = d.pattern;
    for (const m of this.group.children) {
      const z = m.userData.zone, mat = m.material;
      mat.map?.dispose(); mat.bumpMap?.dispose();
      const ribbed = z === 'hem' || z === 'collar' || z === 'cuffs';
      const cols = z === 'body' ? this.cols : z === 'hem' ? this.cols / 2 : z === 'collar' ? 30 : z === 'cuffs' ? Math.round(this.sCols * 0.35) : this.sCols;
      const rows = z === 'body' ? this.rows : z === 'sleeves' ? this.sRows : z === 'hem' ? 6 : z === 'collar' ? (d.neck === 'turtle' ? 13 : 5) : 6;
      const tile = ribbed ? this.tiles.rib : this.tiles.knit;
      mat.bumpMap = tex(tile, cols, rows, false);
      if (pat && !ribbed) {
        const canvas = z === 'body'
          ? this.stripeCanvas(rows, (r) => Math.min(PATTERN_ROWS - 1, Math.floor(r / rows * PATTERN_ROWS)))
          : this.stripeCanvas(rows, (r) => this.sleeveRow((r + 0.5) / rows));
        mat.map = tex(canvas, cols, 1, true);
        mat.color.set('#ffffff');
      } else {
        mat.map = tex(tile, cols, rows, true);
        mat.color.set(d.zones[z] || '#888888');
      }
      mat.sheenColor.copy(mat.color).lerp(new THREE.Color('#ffffff'), 0.5);
      mat.needsUpdate = true;
    }
    this.dirty = true;
  }

  fit() {
    const w = this.stage.clientWidth || 1, h = this.stage.clientHeight || 1, a = w / h;
    const t = Math.tan(this.camera.fov * Math.PI / 360);
    const dist = Math.max(this.span.h / 2 / t, this.span.w / 2 / (t * a)) * 1.1;
    this.camera.aspect = a; this.camera.position.set(0, 0, dist); this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  resize() {
    const w = this.stage.clientWidth, h = this.stage.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.fit();
  }

  bind() {
    const el = this.stage; let down = null;
    this.h = {
      down: (e) => {
        if (e.target.closest('.photo')) return;
        el.setPointerCapture(e.pointerId);
        down = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: performance.now() };
        this.spin = 0; this.vel = 0;
      },
      move: (e) => {
        if (!down) return;
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        down.x = e.clientX; down.y = e.clientY;
        this.group.rotation.y += dx * 0.011;
        this.group.rotation.x = Math.max(-0.6, Math.min(0.6, this.group.rotation.x + dy * 0.006));
        this.vel = dx * 0.011; this.dirty = true;
      },
      up: (e) => {
        if (!down) return;
        const moved = Math.hypot(e.clientX - down.x0, e.clientY - down.y0), quick = performance.now() - down.t < 350;
        down = null;
        if (moved < 7 && quick) { this.vel = 0; this.pick(e); }
      },
    };
    el.addEventListener('pointerdown', this.h.down);
    el.addEventListener('pointermove', this.h.move);
    el.addEventListener('pointerup', this.h.up);
    el.addEventListener('pointercancel', this.h.up);
  }

  pick(e) {
    const r = this.stage.getBoundingClientRect();
    const p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(p, this.camera);
    const hit = ray.intersectObjects(this.group.children)[0];
    if (!hit) return;
    const z = hit.object.userData.zone, pat = this.design.pattern;
    if (pat && (z === 'body' || z === 'sleeves')) {
      const fromTop = 1 - hit.uv.y;
      const row = z === 'body' ? Math.min(PATTERN_ROWS - 1, Math.floor(fromTop * PATTERN_ROWS)) : this.sleeveRow(fromTop);
      this.onPick('p' + pat.rows[row]);
    } else this.onPick(z);
  }

  tick() {
    if (this.spin) { this.group.rotation.y += this.spin; this.dirty = true; }
    if (Math.abs(this.vel) > 0.0004) { this.group.rotation.y += this.vel; this.vel *= 0.94; this.dirty = true; }
    if (this.dirty) { this.renderer.render(this.scene, this.camera); this.dirty = false; }
  }

  snapshot(size = 320) {
    const rot = this.group.rotation.clone();
    this.group.rotation.set(0.05, -0.45, 0);
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement, c = document.createElement('canvas');
    c.width = c.height = size;
    const s = Math.min(size / src.width, size / src.height) , w = src.width * s, h = src.height * s;
    c.getContext('2d').drawImage(src, (size - w) / 2, (size - h) / 2, w, h);
    this.group.rotation.copy(rot); this.dirty = true;
    return c.toDataURL('image/png');
  }

  dispose() {
    cancelAnimationFrame(this.raf); this.ro.disconnect();
    const el = this.stage;
    el.removeEventListener('pointerdown', this.h.down); el.removeEventListener('pointermove', this.h.move);
    el.removeEventListener('pointerup', this.h.up); el.removeEventListener('pointercancel', this.h.up);
    for (const m of this.group.children) { m.geometry.dispose(); this.disposeMat(m.material); }
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove();
  }
}

function d_neckFlare(neck, v) {
  return neck === 'turtle' ? 1.02 - 0.05 * v + 0.05 * Math.sin(v * Math.PI) * v : 1.01 + 0.05 * Math.sin(v * Math.PI);
}
