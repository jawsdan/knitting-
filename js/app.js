// Knit Nook: tabs, storage and screens. The 3D studio loads on demand.
const KEY = 'knitnook.v1';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const DEFAULT_DESIGN = () => ({
  fit: 'regular', length: 'regular', neck: 'crew', pattern: null,
  zones: { body: '#7f9fe0', sleeves: '#7f9fe0', collar: '#7f9fe0', cuffs: '#7f9fe0', hem: '#7f9fe0' },
});

let db = { name: '', projects: [], yarn: [], tools: [], patterns: [], designs: [], current: DEFAULT_DESIGN() };
try { db = { ...db, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* start fresh */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { toast('Storage is full. Delete a saved design to make room.'); } };

const view = $('#view');
let tab = 'home', studio = null, ui = { stash: 'yarn', q: '', sort: 'new', mode: 'colors', area: 'body', photo: null };

/* ---------- icons ---------- */
const I = {
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.300l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.2-1.300L14 3h-4l-.4 2.500a7 7 0 0 0-2.2 1.300l-2.3-1-2 3.4 2 1.500a7 7 0 0 0 0 2.600l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.2 1.300L10 21h4l.4-2.500a7 7 0 0 0 2.2-1.300l2.3 1 2-3.4-2-1.500c.1-.4.1-.9.1-1.300z"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
  sort: '<svg viewBox="0 0 24 24"><path d="M8 5v14m0 0-3-3m3 3 3-3M16 19V5m0 0-3 3m3-3 3 3"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M6 4h12v17l-6-4-6 4z"/></svg>',
  reset: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.5-5.800M4 4v5h5"/></svg>',
  yarn: '<svg viewBox="0 0 64 64"><circle cx="30" cy="30" r="22" fill="#d9603b"/><g fill="none" stroke="#8f2d1c" stroke-width="2.6" stroke-linecap="round"><path d="M12 22c12-8 30-8 40 2M9 32c14-9 34-8 43 3M12 42c12-8 28-7 37 1M22 10c-6 12-5 30 4 41M34 8c-7 13-6 31 3 43M45 13c-6 10-5 26 2 35"/><path d="M40 50c6 6 14 8 20 4"/></g></svg>',
  sweater: '<svg viewBox="0 0 64 64"><path d="M24 8c2 3 5 5 8 5s6-2 8-5l16 8-5 14-6-2v28H19V28l-6 2-5-14z" fill="#7f9fe0" stroke="#4c66a8" stroke-width="2.5" stroke-linejoin="round"/><path d="M19 50h26M24 8c2 5 5 7 8 7s6-2 8-7" fill="none" stroke="#4c66a8" stroke-width="2.5"/></svg>',
  needle: '<svg viewBox="0 0 24 24"><path d="m4 20 13-13 1.5 1.5-13 13zM18 3a2 2 0 1 1 3 3 2 2 0 0 1-3-3z"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  book: '<svg viewBox="0 0 24 24"><path d="M11 6.500C9 5 6 4.5 3 5v13c3-.5 6 0 8 1.500zm2 0C15 5 18 4.5 21 5v13c-3-.5-6 0-8 1.500z"/></svg>',
};

/* ---------- helpers ---------- */
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200);
}

function sheet(html, mount) {
  const root = $('#sheet-root');
  root.innerHTML = `<div class="scrim"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
  const close = () => { root.innerHTML = ''; };
  $('.scrim', root).addEventListener('click', (e) => { if (e.target.classList.contains('scrim')) close(); });
  mount?.($('.sheet', root), close);
  return close;
}

// A form sheet: fields → object, with optional delete for existing records.
function formSheet({ title, fields, value = {}, onSave, onDelete, extra = '' }) {
  const f = fields.map((x) => {
    const v = value[x.key] ?? x.def ?? '';
    const input = x.type === 'select'
      ? `<select id="f-${x.key}" name="${x.key}">${x.options.map((o) => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`
      : x.type === 'textarea'
        ? `<textarea id="f-${x.key}" name="${x.key}" rows="3" placeholder="${esc(x.ph || '')}">${esc(v)}</textarea>`
        : `<input id="f-${x.key}" name="${x.key}" type="${x.type || 'text'}" value="${esc(v)}" placeholder="${esc(x.ph || '')}" ${x.req ? 'required' : ''} ${x.type === 'number' ? 'min="0" step="any" inputmode="decimal"' : ''} autocomplete="off">`;
    return `<label class="field${x.half ? ' half' : ''}">${esc(x.label)}${input}</label>`;
  });
  // pair up consecutive half-width fields
  const out = [];
  for (let i = 0; i < fields.length; i++) {
    if (fields[i].half && fields[i + 1]?.half) { out.push(`<div class="two">${f[i]}${f[i + 1]}</div>`); i++; } else out.push(f[i]);
  }
  sheet(`<h2>${esc(title)}</h2><form class="stack">${extra}${out.join('')}
    <button class="btn block" type="submit">Save</button>
    ${onDelete ? '<button class="btn sm danger block" type="button" data-del>Delete</button>' : ''}</form>`, (el, close) => {
    $('form', el).addEventListener('submit', (e) => {
      e.preventDefault();
      const o = Object.fromEntries(new FormData(e.target));
      for (const x of fields) if (x.type === 'number') o[x.key] = Number(o[x.key]) || 0;
      onSave(o, el); close(); save(); render();
    });
    const del = $('[data-del]', el);
    del?.addEventListener('click', () => {
      if (del.dataset.sure) { onDelete(); close(); save(); render(); } else { del.dataset.sure = 1; del.textContent = 'Tap again to delete'; }
    });
  });
}

const greeting = () => { const h = new Date().getHours(); return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const statusPill = (s) => `<span class="pill ${s === 'In progress' ? 'wip' : s === 'Finished' ? '' : 'idle'}">${esc(s)}</span>`;
const searchBar = (ph) => `<div class="search"><label>${I.search}<input id="q" type="search" placeholder="${ph}" value="${esc(ui.q)}" aria-label="${ph}"></label>
  <button class="sq" id="sort" aria-label="Change sort order" title="Sort: ${ui.sort === 'new' ? 'newest first' : 'A to Z'}">${I.sort}</button></div>`;
const sorted = (list, key = 'name') => {
  const q = ui.q.trim().toLowerCase();
  const l = list.filter((x) => !q || Object.values(x).some((v) => typeof v === 'string' && v.toLowerCase().includes(q)));
  return ui.sort === 'az' ? l.sort((a, b) => (a[key] || '').localeCompare(b[key] || '')) : l.sort((a, b) => (b.at || 0) - (a.at || 0));
};
function bindSearch() {
  const q = $('#q');
  q?.addEventListener('input', () => { ui.q = q.value; const pos = q.selectionStart; render(); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); });
  $('#sort')?.addEventListener('click', () => { ui.sort = ui.sort === 'new' ? 'az' : 'new'; toast(ui.sort === 'new' ? 'Newest first' : 'A to Z'); render(); });
}

/* ---------- records ---------- */
const PROJECT_FIELDS = [
  { key: 'name', label: 'Project name', ph: 'Blue raglan sweater', req: true },
  { key: 'craft', label: 'Craft', type: 'select', options: ['Knitting', 'Crochet'], half: true },
  { key: 'status', label: 'Status', type: 'select', options: ['In progress', 'Planned', 'Finished'], half: true },
  { key: 'yarn', label: 'Yarn', ph: 'Merino DK, 6 skeins' },
  { key: 'needles', label: 'Needles / hook', ph: '4 mm circular' },
  { key: 'notes', label: 'Notes', type: 'textarea', ph: 'Gauge, size, changes…' },
];
function editProject(p, preset = {}) {
  const isNew = !p;
  const counter = isNew ? '' : `<div class="counter"><button type="button" class="minus" data-d="-1" aria-label="One row back">−</button><b id="rows">${p.rows || 0}</b><button type="button" data-d="1" aria-label="Add a row">+</button></div><p class="sub">rows knitted</p>`;
  formSheet({
    title: isNew ? 'New project' : p.name, fields: PROJECT_FIELDS, value: p || preset, extra: counter,
    onSave: (o, el) => {
      if (isNew) db.projects.push({ id: uid(), at: Date.now(), rows: 0, ...preset, ...o });
      else Object.assign(p, o, { rows: Number($('#rows', el).textContent) });
      toast(isNew ? 'Project added' : 'Saved');
    },
    onDelete: isNew ? null : () => { db.projects = db.projects.filter((x) => x !== p); },
  });
  $$('.counter button').forEach((b) => b.addEventListener('click', () => {
    const r = $('#rows'); r.textContent = Math.max(0, Number(r.textContent) + Number(b.dataset.d));
    p.rows = Number(r.textContent); save(); navigator.vibrate?.(8);
  }));
}
function editYarn(y) {
  formSheet({
    title: y ? 'Edit yarn' : 'Add yarn', value: y,
    fields: [
      { key: 'name', label: 'Yarn name', ph: 'Soft Merino', req: true },
      { key: 'brand', label: 'Brand', ph: 'Sandnes Garn' },
      { key: 'color', label: 'Color', type: 'color', def: '#b8434a', half: true },
      { key: 'skeins', label: 'Skeins', type: 'number', def: 1, half: true },
      { key: 'weight', label: 'Weight', type: 'select', options: ['Lace', 'Fingering', 'Sport', 'DK', 'Worsted', 'Aran', 'Bulky'], def: 'DK', half: true },
      { key: 'meters', label: 'Meters per skein', type: 'number', half: true },
    ],
    onSave: (o) => { if (y) Object.assign(y, o); else db.yarn.push({ id: uid(), at: Date.now(), ...o }); toast('Yarn saved'); },
    onDelete: y ? () => { db.yarn = db.yarn.filter((x) => x !== y); } : null,
  });
}
function editTool(t) {
  formSheet({
    title: t ? 'Edit tool' : 'Add tool', value: t,
    fields: [
      { key: 'name', label: 'Tool', ph: 'Bamboo circulars', req: true },
      { key: 'kind', label: 'Type', type: 'select', options: ['Circular needles', 'Straight needles', 'Double-pointed', 'Crochet hook', 'Other'], half: true },
      { key: 'size', label: 'Size', ph: '4 mm / 80 cm', half: true },
    ],
    onSave: (o) => { if (t) Object.assign(t, o); else db.tools.push({ id: uid(), at: Date.now(), ...o }); toast('Tool saved'); },
    onDelete: t ? () => { db.tools = db.tools.filter((x) => x !== t); } : null,
  });
}
/* ---------- pattern PDFs (kept in IndexedDB; too big for localStorage) ---------- */
const idb = () => new Promise((res, rej) => {
  const r = indexedDB.open('knitnook', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('files');
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const fileOp = async (mode, fn) => {
  const d = await idb();
  return new Promise((res, rej) => { const tx = d.transaction('files', mode), rq = fn(tx.objectStore('files')); tx.oncomplete = () => { d.close(); res(rq.result); }; tx.onerror = tx.onabort = () => { d.close(); rej(tx.error); }; });
};
const filePut = (k, buf) => fileOp('readwrite', (st) => st.put(buf, k));
const fileGet = (k) => fileOp('readonly', (st) => st.get(k));
const fileDel = (k) => fileOp('readwrite', (st) => st.delete(k));

async function openPdf(p, buf) {
  try { buf = buf || await fileGet(p.id); } catch { buf = null; }
  if (!buf) { toast('The PDF for this pattern is not on this device'); return; }
  const el = document.createElement('div'); el.className = 'viewer';
  el.innerHTML = `<header><button class="round" data-x aria-label="Close">${I.close}</button><b>${esc(p.name || 'Pattern')}</b><span class="row"><button class="round" data-z="-1" aria-label="Zoom out">${I.minus}</button><button class="round" data-z="1" aria-label="Zoom in">${I.plus}</button></span></header><div class="pages"><p class="sub it">Opening the PDF…</p></div>`;
  document.body.append(el);
  const box = $('.pages', el); let zoom = 1, handle = null;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if ('x' in b.dataset) { handle?.close(); el.remove(); }
    if (b.dataset.z) { zoom = Math.max(1, Math.min(3, zoom + Number(b.dataset.z) * 0.5)); box.style.setProperty('--z', zoom); }
  });
  try {
    const { view } = await import('./pdf.js');
    box.innerHTML = '';
    handle = await view(buf, box);
    if (!el.isConnected) handle.close();
  } catch { box.innerHTML = '<p class="sub">This PDF could not be opened.</p>'; }
}

const LEVELS = [['Unspecified', '#9a9a9a'], ['Beginner', '#7cc4ee'], ['Easy', '#8ddc8a'], ['Intermediate', '#f5d21f'], ['Advanced', '#f5a623'], ['Expert', '#ef5b45']];
const CATEGORIES = ['Sweater', 'Cardigan', 'Top', 'Hat', 'Socks', 'Scarf or shawl', 'Mittens', 'Blanket', 'Toy', 'Other'];
function editPattern(p) {
  const v = p || { craft: 'Knitting', kind: 'Other', level: 'Unspecified' };
  let pdf; // undefined = unchanged, null = removed, object = newly attached
  const radios = (name, opts, cur) => `<div class="rchips">${opts.map(([o, dot]) => `<label class="rchip"><input type="radio" name="${name}" value="${o}" ${o === (cur || opts[0][0]) ? 'checked' : ''}><span>${dot ? `<i style="background:${dot}"></i>` : ''}${o}</span></label>`).join('')}</div>`;
  const text = (key, label, ph, area) => `<label class="field">${label}${area ? `<textarea id="f-${key}" name="${key}" rows="2" placeholder="${esc(ph)}">${esc(v[key] || '')}</textarea>` : `<input id="f-${key}" name="${key}" value="${esc(v[key] || '')}" placeholder="${esc(ph)}" autocomplete="off">`}</label>`;
  sheet(`<h2>${p ? 'Edit pattern' : 'Add pattern'}</h2><form class="stack">
    <label class="field">Pattern name *<input id="f-name" name="name" required value="${esc(v.name || '')}" placeholder="e.g., Cozy Cable Sweater" autocomplete="off"></label>
    ${text('designer', 'Designer', 'e.g., your name or the pattern designer')}
    <div class="field">Pattern PDF (optional)
      <label class="attach" for="f-pdf"><svg viewBox="0 0 24 24"><path d="M6 3h8l5 5v13H6zM14 3v5h5"/></svg><span id="pdf-label"></span></label>
      <input type="file" id="f-pdf" accept="application/pdf,.pdf" hidden>
      <div class="row" id="pdf-actions"></div></div>
    <div class="field">Craft${radios('craft', [['Knitting'], ['Crochet'], ['Other']], v.craft)}</div>
    <label class="field">Category<select id="f-kind" name="kind">${CATEGORIES.map((o) => `<option${o === v.kind ? ' selected' : ''}>${o}</option>`).join('')}</select></label>
    <div class="field">Difficulty${radios('level', LEVELS, v.level)}</div>
    ${text('notes', 'Description', 'Describe your pattern…', true)}
    ${text('sizes', 'Sizes', 'e.g., XS, S, M, L, XL (default: one size)')}
    ${text('gauge', 'Gauge', 'e.g., 20 sts x 28 rows = 10 cm in stockinette')}
    ${text('yarn', 'Yarn / materials', 'Yarn weight, quantities, fibers, or a specific yarn', true)}
    ${text('tools', 'Tools', 'Needles, hooks, stitch markers…')}
    <label class="field">Link<input id="f-link" name="link" type="url" value="${esc(v.link || '')}" placeholder="https://…" autocomplete="off"></label>
    <button class="btn block" type="submit">${p ? 'Save' : 'Add pattern'}</button>
    ${p ? '<button class="btn sm danger block" type="button" data-del>Delete</button>' : ''}</form>`, (el, close) => {
    const paint = () => {
      const cur = pdf === undefined ? p?.pdf : pdf;
      $('#pdf-label', el).textContent = cur ? `${cur.name} · ${cur.pages} page${cur.pages === 1 ? '' : 's'}` : 'Attach PDF';
      $('#pdf-actions', el).innerHTML = cur ? '<button class="btn sm grow" type="button" data-open>Open PDF</button><button class="btn sm ghost grow" type="button" data-rm>Remove PDF</button>' : '';
    };
    paint();
    $('#f-pdf', el).onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (f.size > 60e6) { toast('That PDF is over 60 MB, which is too big to keep on the phone'); return; }
      $('#pdf-label', el).textContent = 'Reading the PDF…';
      try {
        const buf = await f.arrayBuffer(), { cover } = await import('./pdf.js'), info = await cover(buf);
        pdf = { buf, name: f.name, pages: info.pages, thumb: info.thumb };
        const name = $('#f-name', el);
        if (!name.value.trim()) name.value = info.title || f.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ');
      } catch { toast('That file could not be read as a PDF'); }
      e.target.value = ''; paint();
    };
    el.addEventListener('click', (e) => {
      if ('rm' in e.target.dataset) { pdf = null; paint(); }
      if ('open' in e.target.dataset) openPdf({ id: p?.id, name: $('#f-name', el).value }, pdf?.buf);
    });
    $('form', el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const o = Object.fromEntries(new FormData(e.target)), rec = p || { id: uid(), at: Date.now() };
      Object.assign(rec, o);
      try {
        if (pdf) { await filePut(rec.id, pdf.buf); rec.pdf = { name: pdf.name, pages: pdf.pages }; rec.thumb = pdf.thumb; navigator.storage?.persist?.(); }
        if (pdf === null) { await fileDel(rec.id); delete rec.pdf; delete rec.thumb; }
      } catch { toast('The PDF could not be saved. The phone may be out of space.'); return; }
      if (!p) db.patterns.push(rec);
      close(); save(); render(); toast(p ? 'Pattern saved' : 'Pattern added');
    });
    const del = $('[data-del]', el);
    del?.addEventListener('click', () => {
      if (!del.dataset.sure) { del.dataset.sure = 1; del.textContent = 'Tap again to delete'; return; }
      fileDel(p.id).catch(() => {}); db.patterns = db.patterns.filter((x) => x !== p); close(); save(); render();
    });
  });
}
function settings() {
  sheet(`<h2>Settings</h2><form class="stack"><label class="field">Your name<input id="f-name" name="name" value="${esc(db.name)}" placeholder="What should I call you?" autocomplete="given-name"></label>
    <button class="btn block">Save</button></form>
    <p class="muted" style="text-align:center">Everything you add is stored on this device only.<br>To install: open the share menu and choose <b>Add to Home Screen</b>.</p>`, (el, close) => {
    $('form', el).addEventListener('submit', (e) => { e.preventDefault(); db.name = $('#f-name', el).value.trim(); save(); close(); render(); });
  });
}

/* ---------- screens ---------- */
const screens = {
  home() {
    const active = db.projects.filter((p) => p.status === 'In progress');
    const skeins = db.yarn.reduce((s, y) => s + (Number(y.skeins) || 0), 0);
    view.innerHTML = `<div class="page">
      <div class="top"><span></span><span class="mascot">${I.yarn}</span><button class="round" id="gear" aria-label="Settings">${I.gear}</button></div>
      <div><h1>${greeting()}${db.name ? ', ' + esc(db.name) : ''}!</h1><p class="sub it">Let's make some magic today</p></div>
      ${db.projects.length ? `<div class="head"><h2>On the needles</h2><button class="btn sm" id="add">+ New</button></div>
        <div class="list">${(active.length ? active : db.projects.slice(-3)).map((p) => `<div class="card item"><button class="item grow" data-p="${p.id}"><span class="dot">${I.folder}</span><span class="txt"><b>${esc(p.name)}</b><span>Row ${p.rows || 0} · ${esc(p.craft)}</span></span></button><button class="plus1" data-row="${p.id}" aria-label="Add a row to ${esc(p.name)}">+1</button></div>`).join('')}</div>`
        : `<div class="dashed"><span class="bubble">${I.yarn}</span><h2>Start your first project</h2><p class="sub">Track your rows and keep your notes in one place</p><button class="btn hot" id="add">Start your first project →</button></div>`}
      <div class="card promo">${I.sweater}<div class="grow"><h3>Design a sweater in 3D</h3><p>Spin it, recolor each part, or match the colors from a photo.</p><button class="btn sm" data-go="studio">Open studio</button></div></div>
      <div class="stats"><div><b>${db.projects.length}</b><span>projects</span></div><div><b>${skeins}</b><span>skeins</span></div><div><b>${db.designs.length}</b><span>designs</span></div></div>
    </div>`;
    $('#gear').onclick = settings;
    $('#add').onclick = () => editProject();
    $$('[data-p]').forEach((b) => (b.onclick = () => editProject(db.projects.find((p) => p.id === b.dataset.p))));
    $$('[data-row]').forEach((b) => (b.onclick = () => { const p = db.projects.find((x) => x.id === b.dataset.row); p.rows = (p.rows || 0) + 1; save(); navigator.vibrate?.(8); render(); }));
  },

  stash() {
    const yarn = ui.stash === 'yarn', list = sorted(yarn ? db.yarn : db.tools);
    const skeins = db.yarn.reduce((s, y) => s + (Number(y.skeins) || 0), 0);
    const brands = new Set(db.yarn.map((y) => (y.brand || '').trim().toLowerCase()).filter(Boolean)).size;
    view.innerHTML = `<div class="page">
      <div class="top"><span></span><div class="seg"><button data-s="yarn" class="${yarn ? 'on' : ''}">Yarn</button><button data-s="tools" class="${yarn ? '' : 'on'}">Tools</button></div><button class="round" id="add" aria-label="Add">${I.plus}</button></div>
      <h1>${yarn ? 'My Yarn Stash' : 'My Tools'}</h1>
      ${yarn ? `<div class="stats"><div><b>${skeins}</b><span>skeins</span></div><div><b>${brands}</b><span>brands</span></div></div>` : ''}
      ${searchBar(yarn ? 'Search yarn…' : 'Search tools…')}
      ${list.length ? `<div class="list">${list.map((x) => `<button class="card item" data-id="${x.id}">${yarn ? `<span class="dot" style="background:${esc(x.color)}"></span>` : `<span class="dot">${I.needle}</span>`}<span class="txt"><b>${esc(x.name)}</b><span>${yarn ? esc([x.brand, x.weight, x.meters ? x.meters + ' m' : ''].filter(Boolean).join(' · ')) : esc([x.kind, x.size].filter(Boolean).join(' · '))}</span></span>${yarn ? `<span class="pill idle">${Number(x.skeins) || 0} skeins</span>` : ''}</button>`).join('')}</div>`
        : `<div class="dashed"><h2>${ui.q ? 'Nothing matches' : yarn ? 'Add your first yarn!' : 'Add your first tool!'}</h2><button class="btn" id="add2">${yarn ? 'Add yarn' : 'Add tool'}</button></div>`}
    </div>`;
    const add = () => (yarn ? editYarn() : editTool());
    $('#add').onclick = add; if ($('#add2')) $('#add2').onclick = add;
    $$('[data-s]').forEach((b) => (b.onclick = () => { ui.stash = b.dataset.s; ui.q = ''; render(); }));
    $$('[data-id]').forEach((b) => (b.onclick = () => { const x = (yarn ? db.yarn : db.tools).find((y) => y.id === b.dataset.id); yarn ? editYarn(x) : editTool(x); }));
    bindSearch();
  },

  projects() {
    const list = sorted(db.projects);
    view.innerHTML = `<div class="page">
      <div class="top"><span></span><span class="mascot">${I.yarn}</span><button class="round" id="add" aria-label="Add project">${I.plus}</button></div>
      <h1>My Projects</h1>
      ${searchBar('Search projects')}
      ${list.length ? `<div class="list">${list.map((p) => `<button class="card item" data-id="${p.id}"><span class="dot">${I.folder}</span><span class="txt"><b>${esc(p.name)}</b><span>Row ${p.rows || 0} · ${esc(p.craft)}${p.yarn ? ' · ' + esc(p.yarn) : ''}</span></span>${statusPill(p.status)}</button>`).join('')}</div>`
        : `<p class="sub">${ui.q ? 'No projects match your search' : 'Track your knitting and crochet projects'}</p><div class="stack" style="align-items:center"><button class="btn" id="add2">+ Add project</button><button class="btn ghost" data-go="studio">Design a sweater</button></div><p class="sub it">Your projects will appear here</p>`}
    </div>`;
    $('#add').onclick = () => editProject(); if ($('#add2')) $('#add2').onclick = () => editProject();
    $$('[data-id]').forEach((b) => (b.onclick = () => editProject(db.projects.find((p) => p.id === b.dataset.id))));
    bindSearch();
  },

  patterns() {
    const list = sorted(db.patterns);
    view.innerHTML = `<div class="page">
      <div class="head"><h1 style="text-align:left">Patterns</h1><button class="round" id="add" aria-label="Add pattern">${I.plus}</button></div>
      ${searchBar('Search patterns')}
      <h2>My Patterns</h2>
      ${list.length ? `<div class="list">${list.map((p) => `<div class="card item"><button class="item grow" data-id="${p.id}">${p.thumb ? `<img class="cover" src="${p.thumb}" alt="">` : `<span class="dot">${I.book}</span>`}<span class="txt"><b>${esc(p.name)}</b><span>${esc([p.designer, p.kind, p.level && p.level !== 'Unspecified' ? p.level : ''].filter(Boolean).join(' · '))}</span></span></button>${p.pdf ? `<button class="btn sm" data-pdf="${p.id}" aria-label="Open the PDF for ${esc(p.name)}">PDF</button>` : ''}</div>`).join('')}</div>`
        : `<div class="card promo"><div class="grow"><h3>${ui.q ? 'Nothing matches' : 'No patterns yet'}</h3><p>Add a pattern and attach its PDF to read it here while you knit.</p><button class="btn sm" id="add2">Add pattern</button></div></div>`}
      <div class="head"><h2>My Designs</h2><button class="btn sm ghost" data-go="studio">Open studio</button></div>
      ${db.designs.length ? `<div class="grid2">${db.designs.slice().reverse().map((d) => `<button class="design" data-d="${d.id}"><img src="${d.thumb}" alt=""><b>${esc(d.name)}</b></button>`).join('')}</div>`
        : '<p class="muted">Sweaters you save in the studio show up here.</p>'}
    </div>`;
    $('#add').onclick = () => editPattern(); if ($('#add2')) $('#add2').onclick = () => editPattern();
    $$('[data-id]').forEach((b) => (b.onclick = () => editPattern(db.patterns.find((p) => p.id === b.dataset.id))));
    $$('[data-pdf]').forEach((b) => (b.onclick = () => openPdf(db.patterns.find((p) => p.id === b.dataset.pdf))));
    $$('[data-d]').forEach((b) => (b.onclick = () => openDesign(db.designs.find((d) => d.id === b.dataset.d))));
    bindSearch();
  },

  studio: renderStudio,
};

function openDesign(d) {
  sheet(`<h2>${esc(d.name)}</h2><img src="${d.thumb}" alt="" style="width:60%;align-self:center">
    <button class="btn block" data-a="open">Open in studio</button>
    <button class="btn ghost block" data-a="project">Start a project from it</button>
    <button class="btn sm danger block" data-a="del">Delete</button>`, (el, close) => {
    el.addEventListener('click', (e) => {
      const a = e.target.dataset.a; if (!a) return;
      if (a === 'open') { db.current = structuredClone(d.design); ui.photo = null; ui.seg = null; save(); close(); go('studio'); }
      if (a === 'project') { close(); editProject(null, { name: d.name }); }
      if (a === 'del') {
        if (!e.target.dataset.sure) { e.target.dataset.sure = 1; e.target.textContent = 'Tap again to delete'; return; }
        db.designs = db.designs.filter((x) => x !== d); save(); close(); render();
      }
    });
  });
}

/* ---------- studio ---------- */
const SWATCHES = ['#f7ebe4', '#e8d5b5', '#f2c94c', '#f2994a', '#f4511e', '#d7263d', '#6b1d22', '#f3a6b8', '#b06ab3', '#5b3f8c', '#7f9fe0', '#2f5aa8', '#1d2f55', '#7ecbc0', '#2e8b6f', '#3d5a35', '#8a6a4f', '#4a3528', '#9aa0a6', '#2b2b2e'];
const ZONE_LABEL = { body: 'Body', sleeves: 'Sleeves', collar: 'Collar', cuffs: 'Cuffs', hem: 'Hem' };

function areas() {
  const d = db.current;
  const ribs = ['collar', 'cuffs', 'hem'].map((z) => ({ id: z, label: ZONE_LABEL[z], color: d.zones[z] }));
  if (!d.pattern) return [{ id: 'body', label: 'Body', color: d.zones.body }, { id: 'sleeves', label: 'Sleeves', color: d.zones.sleeves }, ...ribs];
  return [...d.pattern.palette.map((c, i) => ({ id: 'p' + i, label: 'Stripe ' + (i + 1), color: c })), ...ribs];
}
function paintPhoto() {
  if (!ui.photo || !ui.seg) return;
  const d = db.current;
  const colors = ui.seg.areas.map((a) => (a[0] === 'p' || a === 'body'
    ? (d.pattern ? d.pattern.palette[(Number(a.slice(1)) || 0) % d.pattern.palette.length] : d.zones.body) : d.zones[a]));
  import('./photo.js').then(({ recolor }) => recolor(ui.photo, ui.seg, colors));
}
const refresh = () => { studio?.applyColors(); paintPhoto(); };
function putColor(hex) {
  const d = db.current;
  if (ui.area === 'all') { for (const z in d.zones) d.zones[z] = hex; d.pattern = null; }
  else if (ui.area[0] === 'p' && d.pattern) d.pattern.palette[Number(ui.area.slice(1))] = hex;
  else d.zones[ui.area] = hex;
  refresh();
}
function setColor(hex) { putColor(hex); save(); panel(); }
function setPattern(kind) {
  const d = db.current, R = 48;
  const base = d.pattern ? d.pattern.palette[0] : d.zones.body;
  const second = d.pattern?.palette[1] || (base.toLowerCase() === '#f7ebe4' ? '#6b1d22' : '#f7ebe4');
  if (kind === 'solid') { d.zones.body = d.zones.sleeves = base; d.pattern = null; ui.area = 'body'; }
  else {
    const rows = Array.from({ length: R }, (_, i) => (kind === 'stripes' ? Math.floor(i / 4) % 2 : kind === 'wide' ? Math.floor(i / 9) % 2 : i < 19 ? 0 : 1));
    d.pattern = { kind, rows, palette: [base, second] }; ui.area = 'p1';
  }
  save(); refresh(); panel();
}

function colorRows(list) {
  const cur = (list.find((a) => a.id === ui.area) || {}).color?.toLowerCase();
  return `<div class="scroller" role="tablist" aria-label="Area to color">
      <button class="chip ${ui.area === 'all' ? 'on' : ''}" data-a="all">Whole sweater</button>
      ${list.map((a) => `<button class="chip ${a.id === ui.area ? 'on' : ''}" data-a="${a.id}"><i style="background:${esc(a.color)}"></i>${a.label}</button>`).join('')}</div>
    <div class="scroller"><label class="sw custom" title="Any color"><input type="color" id="st-custom" value="${esc(cur || '#7f9fe0')}" aria-label="Pick any color"></label>
      ${SWATCHES.map((c) => `<button class="sw ${c === cur ? 'on' : ''}" data-c="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join('')}</div>`;
}
function bindColorRows(body) {
  $$('[data-a]', body).forEach((b) => (b.onclick = () => { ui.area = b.dataset.a; panel(); }));
  $$('[data-c]', body).forEach((b) => (b.onclick = () => setColor(b.dataset.c)));
  const custom = $('#st-custom');
  custom.oninput = () => putColor(custom.value); // live, without rebuilding the panel (keeps the picker open)
  custom.onchange = () => { save(); panel(); };
  $('.chip.on', body)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function panel() {
  const body = $('#st-body'); if (!body) return;
  const d = db.current, list = areas();
  if (ui.area !== 'all' && !list.some((a) => a.id === ui.area)) ui.area = list[0].id;
  $$('.modes button').forEach((b) => b.classList.toggle('on', b.dataset.m === ui.mode));
  const big = ui.mode === 'photo' && !!ui.photo;
  $('.photo')?.classList.toggle('big', big);
  $('#stage')?.classList.toggle('photo-on', big);
  if (ui.mode === 'colors') {
    const kind = d.pattern?.kind || 'solid';
    body.innerHTML = colorRows(list) + `<div class="opt"><span>Pattern</span><div class="seg">${[['solid', 'Solid'], ['stripes', 'Stripes'], ['wide', 'Wide'], ['block', 'Block']].map(([k, l]) => `<button data-k="${k}" class="${k === kind ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
    $$('[data-k]', body).forEach((b) => (b.onclick = () => setPattern(b.dataset.k)));
    bindColorRows(body);
  } else if (ui.mode === 'shape') {
    const seg = (label, key, opts) => `<div class="opt"><span>${label}</span><div class="seg">${opts.map(([k, l]) => `<button data-key="${key}" data-v="${k}" class="${d[key] === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
    body.innerHTML = seg('Fit', 'fit', [['slim', 'Slim'], ['regular', 'Regular'], ['oversized', 'Oversized']])
      + seg('Length', 'length', [['cropped', 'Cropped'], ['regular', 'Regular'], ['long', 'Long']])
      + seg('Neck', 'neck', [['crew', 'Crew neck'], ['turtle', 'Turtleneck']]);
    $$('[data-key]', body).forEach((b) => (b.onclick = () => { d[b.dataset.key] = b.dataset.v; save(); studio?.build(); panel(); }));
  } else if (ui.photo) {
    body.innerHTML = colorRows(list) + `<div class="photo-pane"><div class="row">
      <label class="btn sm ghost grow" for="st-file">New photo</label><button class="btn sm ghost grow" id="st-orig">Reset</button><button class="btn sm grow" id="st-dl">Save</button></div>
      <input type="file" id="st-file" accept="image/*" hidden></div>`;
    bindColorRows(body);
    $('#st-file').onchange = (e) => e.target.files[0] && usePhoto(e.target.files[0]);
    $('#st-orig').onclick = () => applyPhoto();
    $('#st-dl').onclick = savePhoto;
  } else {
    body.innerHTML = `<div class="photo-pane">
      <p>Upload a photo of a sweater. Tap a part of it, pick a color, and the photo is recolored with the same colors as the 3D sweater.</p>
      <label class="btn sm" for="st-file">Upload a photo</label>
      <input type="file" id="st-file" accept="image/*" hidden></div>`;
    $('#st-file').onchange = (e) => e.target.files[0] && usePhoto(e.target.files[0]);
  }
}

async function usePhoto(file) {
  const { loadPhoto } = await import('./photo.js');
  try { ui.photo = await loadPhoto(file); } catch { toast('That file could not be opened as a photo'); return; }
  ui.seg = null; showPhoto(); applyPhoto();
}
async function applyPhoto() {
  const { analyze } = await import('./photo.js');
  if (ui.seg) ui.photo.getContext('2d').putImageData(ui.seg.orig, 0, 0); // analyze the untouched photo
  const r = analyze(ui.photo);
  if (!r) { toast('Could not find a sweater in this photo. Try one with a plain background.'); panel(); return; }
  const d = db.current; d.zones = r.zones; d.pattern = r.pattern; ui.seg = r.seg;
  ui.area = r.pattern ? 'p0' : 'body';
  save(); refresh(); panel();
  toast('Tap a part of the photo, then pick a color');
}
function savePhoto() {
  ui.photo.toBlob(async (blob) => {
    const file = new File([blob], 'sweater-recolored.jpg', { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file] }); } catch { /* cancelled */ } return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/jpeg', 0.92);
}
function showPhoto() {
  const stage = $('#stage'); if (!stage) return;
  $('.photo', stage)?.remove();
  if (!ui.photo) return;
  const box = document.createElement('div'); box.className = 'photo';
  box.append(ui.photo); box.insertAdjacentHTML('beforeend', '<span>your photo</span>');
  stage.append(box);
  ui.photo.onpointerdown = async (e) => {
    e.stopPropagation();
    if (!ui.seg) return;
    if (ui.mode !== 'photo') { ui.mode = 'photo'; panel(); return; }
    const { labelAt } = await import('./photo.js');
    const r = ui.photo.getBoundingClientRect();
    const k = labelAt(ui.photo, ui.seg, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    if (k === 255) { toast('Tap on the sweater itself'); return; }
    const a = ui.seg.areas[k], pat = db.current.pattern;
    ui.area = a[0] === 'p' || a === 'body' ? (pat ? 'p' + ((Number(a.slice(1)) || 0) % pat.palette.length) : 'body') : a;
    panel();
  };
}

function renderStudio() {
  view.innerHTML = `<div class="studio">
    <div class="top"><button class="round" id="st-reset" aria-label="Start over">${I.reset}</button><h2>Sweater studio</h2><button class="round" id="st-save" aria-label="Save design">${I.save}</button></div>
    <div class="stage" id="stage"><div class="loading">Winding the yarn…</div><div class="hint">Drag to spin · tap a part to select it</div></div>
    <div class="panel"><div class="body" id="st-body"></div>
      <div class="modes"><button data-m="colors">Colors</button><button data-m="shape">Shape</button><button data-m="photo">From photo</button></div></div>
  </div>`;
  $$('.modes button').forEach((b) => (b.onclick = () => { ui.mode = b.dataset.m; panel(); }));
  $('#st-reset').onclick = () => { db.current = DEFAULT_DESIGN(); ui.photo = null; ui.seg = null; ui.area = 'body'; save(); showPhoto(); studio.design = db.current; studio.build(); panel(); toast('Started a fresh sweater'); };
  $('#st-save').onclick = () => {
    if (!studio) return;
    const thumb = studio.snapshot();
    sheet(`<h2>Save design</h2><img src="${thumb}" alt="" style="width:55%;align-self:center"><form class="stack"><label class="field">Name<input id="f-dname" required value="Sweater ${db.designs.length + 1}" autocomplete="off"></label><button class="btn block">Save to My Designs</button></form>`, (el, close) => {
      $('form', el).addEventListener('submit', (e) => {
        e.preventDefault();
        db.designs.push({ id: uid(), at: Date.now(), name: $('#f-dname', el).value.trim() || 'Sweater', thumb, design: structuredClone(db.current) });
        save(); close(); toast('Saved to Patterns → My Designs');
      });
    });
  };
  panel();
  const stage = $('#stage');
  import('./studio.js').then(({ Studio }) => {
    if (tab !== 'studio' || !stage.isConnected) return;
    $('.loading', stage)?.remove();
    studio = new Studio(stage, db.current, (area) => {
      ui.area = area; if (ui.mode === 'shape') ui.mode = 'colors';
      panel(); $('.hint', stage).style.opacity = 0;
    });
    stage.addEventListener('pointerdown', () => { $('.hint', stage).style.opacity = 0; }, { once: true });
    showPhoto(); panel();
  }).catch(() => { $('.loading', stage).textContent = 'The 3D view could not start on this device.'; });
}

/* ---------- routing ---------- */
function render() {
  if (studio && tab !== 'studio') { studio.dispose(); studio = null; }
  if (tab === 'studio' && studio) { panel(); return; }
  view.classList.toggle('studio-on', tab === 'studio');
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  screens[tab]();
  $$('[data-go]', view).forEach((b) => (b.onclick = () => go(b.dataset.go)));
}
function go(t) {
  if (!screens[t]) t = 'home';
  if (t !== tab) { ui.q = ''; view.scrollTop = 0; }
  tab = t; history.replaceState(null, '', '#' + t); render();
}
$$('#tabs button').forEach((b) => (b.onclick = () => go(b.dataset.tab)));
window.addEventListener('hashchange', () => go(location.hash.slice(1)));
go(location.hash.slice(1) || 'home');

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
