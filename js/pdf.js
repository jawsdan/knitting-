// PDF support for patterns: cover thumbnail + an in-app page viewer (pdf.js).
import * as pdfjs from '../vendor/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;

const load = (buf) => pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise; // pdf.js takes over the bytes, so pass a copy

async function draw(page, width) {
  const base = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: width / base.width });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  return c;
}

export async function cover(buf) {
  const doc = await load(buf);
  try {
    const c = await draw(await doc.getPage(1), 240);
    const meta = await doc.getMetadata().catch(() => null);
    return { thumb: c.toDataURL('image/jpeg', 0.75), pages: doc.numPages, title: (meta?.info?.Title || '').trim() };
  } finally { doc.destroy(); }
}

// Fills `box` with one placeholder per page; pages are drawn as they scroll near and freed when far away.
export async function view(buf, box) {
  const doc = await load(buf);
  const first = (await doc.getPage(1)).getViewport({ scale: 1 });
  const px = () => Math.min(2000, box.clientWidth * Math.min(devicePixelRatio || 1, 2) * 1.5);
  const io = new IntersectionObserver((entries) => entries.forEach(async (e) => {
    const el = e.target;
    if (!e.isIntersecting) { const c = el.firstChild; if (c && el.dataset.done === '2') { c.width = 0; c.remove(); el.dataset.done = ''; } return; }
    if (el.dataset.done) return;
    el.dataset.done = '1';
    try {
      const c = await draw(await doc.getPage(Number(el.dataset.n)), px());
      el.style.aspectRatio = `${c.width} / ${c.height}`;
      el.append(c); el.dataset.done = '2';
    } catch { el.dataset.done = ''; }
  }), { root: box, rootMargin: '900px 0px' });
  for (let n = 1; n <= doc.numPages; n++) {
    const el = document.createElement('div');
    el.className = 'pg'; el.dataset.n = n; el.style.aspectRatio = `${first.width} / ${first.height}`;
    box.append(el); io.observe(el);
  }
  return { pages: doc.numPages, close: () => { io.disconnect(); doc.destroy(); } };
}
