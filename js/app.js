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
function editPattern(p) {
  formSheet({
    title: p ? 'Edit pattern' : 'Add pattern', value: p,
    fields: [
      { key: 'name', label: 'Pattern name', ph: 'Everyday pullover', req: true },
      { key: 'designer', label: 'Designer', half: true },
      { key: 'kind', label: 'Type', type: 'select', options: ['Sweater', 'Cardigan', 'Hat', 'Socks', 'Scarf', 'Mittens', 'Other'], half: true },
      { key: 'link', label: 'Link', type: 'url', ph: 'https://…' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    onSave: (o) => { if (p) Object.assign(p, o); else db.patterns.push({ id: uid(), at: Date.now(), ...o }); toast('Pattern saved'); },
    onDelete: p ? () => { db.patterns = db.patterns.filter((x) => x !== p); } : null,
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
      ${list.length ? `<div class="list">${list.map((p) => `<button class="card item" data-id="${p.id}"><span class="dot">${I.book}</span><span class="txt"><b>${esc(p.name)}</b><span>${esc([p.designer, p.kind].filter(Boolean).join(' · '))}</span></span></button>`).join('')}</div>`
        : `<div class="card promo"><div class="grow"><h3>${ui.q ? 'Nothing matches' : 'No patterns yet'}</h3><p>Save the patterns you own or want to knit, with a link and notes.</p><button class="btn sm" id="add2">Add pattern</button></div></div>`}
      <div class="head"><h2>My Designs</h2><button class="btn sm ghost" data-go="studio">Open studio</button></div>
      ${db.designs.length ? `<div class="grid2">${db.designs.slice().reverse().map((d) => `<button class="design" data-d="${d.id}"><img src="${d.thumb}" alt=""><b>${esc(d.name)}</b></button>`).join('')}</div>`
        : '<p class="muted">Sweaters you save in the studio show up here.</p>'}
    </div>`;
    $('#add').onclick = () => editPattern(); if ($('#add2')) $('#add2').onclick = () => editPattern();
    $$('[data-id]').forEach((b) => (b.onclick = () => editPattern(db.patterns.find((p) => p.id === b.dataset.id))));
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
      if (a === 'open') { db.current = structuredClone(d.design); ui.photo = null; save(); close(); go('studio'); }
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
function setColor(hex) {
  const d = db.current;
  if (ui.area === 'all') { for (const z in d.zones) d.zones[z] = hex; if (d.pattern) d.pattern = null; }
  else if (ui.area[0] === 'p' && d.pattern) d.pattern.palette[Number(ui.area.slice(1))] = hex;
  else d.zones[ui.area] = hex;
  save(); studio?.applyColors(); panel();
}
function setPattern(kind) {
  const d = db.current, R = 48;
  const base = d.pattern ? d.pattern.palette[0] : d.zones.body;
  const second = d.pattern?.palette[1] || (base.toLowerCase() === '#f7ebe4' ? '#6b1d22' : '#f7ebe4');
  if (kind === 'solid') { d.zones.body = d.zones.sleeves = base; d.pattern = null; ui.area = 'body'; }
  else {
    const rows = Array.from({ length: R }, (_, i) => (kind === 'stripes' ? Math.floor(i / 4) % 2 : kind === 'wide' ? Math.floor(i / 9) % 2 : i < 19 ? 0 : 1));
    d.pattern = { kind, rows, palette: [base, second] }; ui.area = 'p1';
  }
  save(); studio?.applyColors(); panel();
}

function panel() {
  const body = $('#st-body'); if (!body) return;
  const d = db.current, list = areas();
  if (ui.area !== 'all' && !list.some((a) => a.id === ui.area)) ui.area = list[0].id;
  $$('.modes button').forEach((b) => b.classList.toggle('on', b.dataset.m === ui.mode));
  $('.photo')?.classList.toggle('big', ui.mode === 'photo');
  if (ui.mode === 'colors') {
    const cur = (list.find((a) => a.id === ui.area) || {}).color?.toLowerCase();
    const kind = d.pattern?.kind || 'solid';
    body.innerHTML = `<div class="scroller" role="tablist" aria-label="Area to color">
        <button class="chip ${ui.area === 'all' ? 'on' : ''}" data-a="all">Whole sweater</button>
        ${list.map((a) => `<button class="chip ${a.id === ui.area ? 'on' : ''}" data-a="${a.id}"><i style="background:${esc(a.color)}"></i>${a.label}</button>`).join('')}</div>
      <div class="scroller"><label class="sw custom" title="Any color"><input type="color" id="st-custom" value="${esc(cur || '#7f9fe0')}" aria-label="Pick any color"></label>
        ${SWATCHES.map((c) => `<button class="sw ${c === cur ? 'on' : ''}" data-c="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join('')}</div>
      <div class="opt"><span>Pattern</span><div class="seg">${[['solid', 'Solid'], ['stripes', 'Stripes'], ['wide', 'Wide'], ['block', 'Block']].map(([k, l]) => `<button data-k="${k}" class="${k === kind ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
    $$('[data-a]', body).forEach((b) => (b.onclick = () => { ui.area = b.dataset.a; panel(); }));
    $$('[data-c]', body).forEach((b) => (b.onclick = () => setColor(b.dataset.c)));
    $$('[data-k]', body).forEach((b) => (b.onclick = () => setPattern(b.dataset.k)));
    const custom = $('#st-custom');
    custom.oninput = () => { // live update without rebuilding the panel (keeps the picker open)
      const dd = db.current;
      if (ui.area === 'all') { for (const z in dd.zones) dd.zones[z] = custom.value; dd.pattern = null; }
      else if (ui.area[0] === 'p' && dd.pattern) dd.pattern.palette[Number(ui.area.slice(1))] = custom.value;
      else dd.zones[ui.area] = custom.value;
      studio?.applyColors();
    };
    custom.onchange = () => { save(); panel(); };
    $('.chip.on', body)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  } else if (ui.mode === 'shape') {
    const seg = (label, key, opts) => `<div class="opt"><span>${label}</span><div class="seg">${opts.map(([k, l]) => `<button data-key="${key}" data-v="${k}" class="${d[key] === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
    body.innerHTML = seg('Fit', 'fit', [['slim', 'Slim'], ['regular', 'Regular'], ['oversized', 'Oversized']])
      + seg('Length', 'length', [['cropped', 'Cropped'], ['regular', 'Regular'], ['long', 'Long']])
      + seg('Neck', 'neck', [['crew', 'Crew neck'], ['turtle', 'Turtleneck']]);
    $$('[data-key]', body).forEach((b) => (b.onclick = () => { d[b.dataset.key] = b.dataset.v; save(); studio?.build(); panel(); }));
  } else {
    const label = ui.area === 'all' ? 'the whole sweater' : (list.find((a) => a.id === ui.area) || list[0]).label.toLowerCase();
    body.innerHTML = `<div class="photo-pane">
      <p>${ui.photo ? `Colors and stripes were read from your photo. Tap a spot on the photo to use that color for <b>${label}</b>, or tap a part of the sweater to choose another area.` : 'Upload a photo of a sweater. The app reads its colors and stripes and puts them on the 3D model, so you can then recolor each area.'}</p>
      <div class="row"><label class="btn sm grow" for="st-file">${ui.photo ? 'Use another photo' : 'Upload a photo'}</label>
      ${ui.photo ? '<button class="btn sm ghost" id="st-reread">Read again</button>' : ''}</div>
      <input type="file" id="st-file" accept="image/*" hidden></div>`;
    $('#st-file').onchange = (e) => e.target.files[0] && usePhoto(e.target.files[0]);
    if ($('#st-reread')) $('#st-reread').onclick = () => applyPhoto();
  }
}

async function usePhoto(file) {
  const { loadPhoto } = await import('./photo.js');
  try { ui.photo = await loadPhoto(file); } catch { toast('That file could not be opened as a photo'); return; }
  showPhoto(); applyPhoto();
}
async function applyPhoto() {
  const { analyze } = await import('./photo.js');
  const r = analyze(ui.photo);
  if (!r) { toast('Could not find the sweater. Tap the photo to pick colors.'); panel(); return; }
  const d = db.current; d.zones = r.zones; d.pattern = r.pattern;
  ui.area = r.pattern ? 'p0' : 'body';
  save(); studio?.applyColors(); panel();
  toast(r.pattern ? `Found ${r.pattern.palette.length} colors in your photo` : 'Matched the color from your photo');
}
function showPhoto() {
  const stage = $('#stage'); if (!stage) return;
  $('.photo', stage)?.remove();
  if (!ui.photo) return;
  const box = document.createElement('div'); box.className = 'photo';
  box.append(ui.photo); box.insertAdjacentHTML('beforeend', '<span>tap to pick a color</span>');
  stage.append(box);
  ui.photo.onpointerdown = async (e) => {
    e.stopPropagation();
    const { colorAt } = await import('./photo.js');
    const r = ui.photo.getBoundingClientRect();
    setColor(colorAt(ui.photo, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height));
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
  $('#st-reset').onclick = () => { db.current = DEFAULT_DESIGN(); ui.photo = null; ui.area = 'body'; save(); showPhoto(); studio.design = db.current; studio.build(); panel(); toast('Started a fresh sweater'); };
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
