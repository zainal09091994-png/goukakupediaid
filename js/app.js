/* Goukaku Pedia ID v2.0.0 — app.js (frontend GitHub Pages). Sumber modul ada di folder sumber/. */
/* ============================================================================
 * GOUKAKU PEDIA ID — Frontend SPA (metode PRO: GitHub Pages + REST API Apps Script)
 *  • Semua data lewat fetch POST text/plain ke URL /exec (tanpa preflight CORS)
 *  • URL server cukup diisi di js/config.js → window.GP_CONFIG.GAS_URL
 * Prinsip instant UX: navigasi 0 ms (render dari state), cache localStorage
 * stale-while-revalidate, optimistic UI + outbox batch, prefetch saat idle.
 * ========================================================================== */
'use strict';
const CFG = {
  GAS_URL: (window.GP_CONFIG && window.GP_CONFIG.GAS_URL) || '__GAS_URL__',   // isi di js/config.js
  VERSI: '2.0.0',
  WIB_OFFSET: 7, JST_OFFSET: 9
};
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = v => String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, c => ESC_MAP[c]);
const ic = (n, cls = '') => `<span class="ms ${cls}" aria-hidden="true">${n}</span>`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const num = (v, d = 0) => { const n = Number(v); return isNaN(n) ? d : n; };
const ya = v => v === true || /^(ya|yes|true|1|aktif)$/i.test(String(v || '').trim());
const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const idle = fn => (window.requestIdleCallback || (f => setTimeout(f, 300)))(fn);

/* ---------- Penyimpanan lokal aman (iframe bisa memblokir localStorage) ---------- */
const MEM = {};
const LS = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? (k in MEM ? MEM[k] : d) : JSON.parse(v); } catch (e) { return k in MEM ? MEM[k] : d; } },
  set(k, v) { MEM[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* kuota penuh: bersihkan cache soal lama */ try { Object.keys(localStorage).filter(x => x.startsWith('gp_soal_')).forEach(x => localStorage.removeItem(x)); localStorage.setItem(k, JSON.stringify(v)); } catch (e2) { } } },
  del(k) { delete MEM[k]; try { localStorage.removeItem(k); } catch (e) { } }
};

/* ---------- Format ---------- */
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
function toDate(v) {
  if (!v) return null; if (v instanceof Date) return v;
  let s = String(v).trim(); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T00:00:00+09:00';
  const d = new Date(s); return isNaN(d) ? null : d;
}
/* Tampilkan waktu di zona tertentu (offset jam) tanpa bergantung zona HP */
function inTZ(d, off) { const t = d.getTime() + d.getTimezoneOffset() * 60000 + off * 3600000; return new Date(t); }
function fTgl(v, off = CFG.JST_OFFSET) { const d0 = toDate(v); if (!d0) return '-'; const d = inTZ(d0, off); return `${d.getDate()} ${BLN[d.getMonth()]} ${d.getFullYear()}`; }
function fJam(v, off) { const d0 = toDate(v); if (!d0) return '-'; const d = inTZ(d0, off); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function fWaktu(v) { const d0 = toDate(v); if (!d0) return '-'; const d = inTZ(d0, CFG.JST_OFFSET); return `${HARI[d.getDay()]}, ${d.getDate()} ${BLN[d.getMonth()]} ${d.getFullYear()} · ${fJam(v, CFG.WIB_OFFSET)} WIB / ${fJam(v, CFG.JST_OFFSET)} JST`; }
function fRel(v) {
  const d = toDate(v); if (!d) return '-'; const s = (Date.now() - d) / 1000;
  if (s < 60) return 'baru saja'; if (s < 3600) return Math.floor(s / 60) + ' mnt lalu'; if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
  if (s < 86400 * 7) return Math.floor(s / 86400) + ' hari lalu'; return fTgl(v);
}
const rp = n => 'Rp' + Math.round(num(n)).toLocaleString('id-ID');
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
function hariJST(d = new Date()) { const j = inTZ(d, 9); return Date.UTC(j.getFullYear(), j.getMonth(), j.getDate()); }
function sisaHari(v) { const d = toDate(v); if (!d) return null; return Math.round((hariJST(d) - hariJST()) / 86400000); }
function toLocalInput(v) { const d = toDate(v); if (!d) return ''; const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 16); }

/* Furigana: ｜漢字《かんじ》 atau 漢字《かんじ》 → <ruby> */
function furi(s) {
  let t = esc(s);
  t = t.replace(/｜([^｜《》]+?)《([^》]+?)》/g, '<ruby>$1<rt>$2</rt></ruby>');
  t = t.replace(/([㐀-鿿々〆ヵヶ]+)《([^》]+?)》/g, '<ruby>$1<rt>$2</rt></ruby>');
  return t.replace(/\n/g, '<br>');
}
const plainJP = s => String(s || '').replace(/｜([^｜《》]+?)《[^》]+?》/g, '$1').replace(/《[^》]+?》/g, '');
/* Teks kaya sederhana: **tebal**, baris baru, furigana */
function md(s) { return furi(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|<br>)• /g, '$1• '); }

/* Ring progres SVG */
function ring(p, size = 56, stroke = 5, inner = '', color = 'var(--c-primary-2)', track = 'var(--c-pale)') {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, p)) / 100);
  return `<div class="ring" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg><div class="ring-t">${inner}</div></div>`;
}
const stamp = (cls = '') => `<div class="stamp ${cls}" aria-label="合格"><b>合格</b><small>GOUKAKU</small></div>`;
function logoMark(size = 40) {
  const s = S.pub && S.pub.brand && S.pub.brand.logo;
  if (s) return `<img class="mark" src="${esc(s)}" alt="Logo" width="${size}" height="${size}" style="width:${size}px;height:${size}px">`;
  return `<img class="mark" src="./logo.png" alt="Logo Goukaku Pedia ID" width="${size}" height="${size}" style="width:${size}px;height:${size}px">`;
}
const logo = (sub = true) => `<div class="logo">${logoMark()}<div>GOUKAKU${sub ? '<small>Teman Belajar Kamu</small>' : ''}</div></div>`;
const WA_SVG = '<svg viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><path d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3zm0 23.7c-2.1 0-4.1-.6-5.9-1.6l-.4-.3-3.9 1 1-3.8-.3-.4A10.7 10.7 0 1 1 16 26.7zm5.9-8c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7.1a8.8 8.8 0 0 1-4.4-3.8c-.3-.6.3-.5 1-1.7.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4s-1.1 1.1-1.1 2.7 1.2 3.1 1.3 3.3c.2.2 2.3 3.5 5.5 4.9 2 .9 2.8.9 3.8.8.6-.1 1.9-.8 2.2-1.5s.3-1.3.2-1.5c-.1-.1-.3-.2-.6-.4z"/></svg>';

/* ---------- Toast, loadbar, modal, sheet, konfirmasi ---------- */
function toast(msg, type = 'ok', ms = 3200) {
  const icon = { ok: 'check_circle', err: 'error', warn: 'warning', info: 'info' }[type] || 'info';
  const el = document.createElement('div'); el.className = 'toast ' + type; el.setAttribute('role', 'status');
  el.innerHTML = ic(icon) + `<div class="f1">${esc(msg)}</div>`;
  $('#toasts').appendChild(el); setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, ms);
}
let _loads = 0;
function loading(on) {
  _loads = Math.max(0, _loads + (on ? 1 : -1)); const b = $('#loadbar'); if (!b) return;
  if (_loads > 0) { b.classList.add('on'); b.style.width = '70%'; } else { b.style.width = '100%'; setTimeout(() => { if (!_loads) { b.classList.remove('on'); b.style.width = '0'; } }, 250); }
}
function modal(html, opt = {}) {
  closeModal();
  const w = document.createElement('div'); w.className = 'ovl'; w.id = 'ovl';
  w.innerHTML = `<div class="modal ${opt.wide ? 'wide' : ''}" role="dialog" aria-modal="true"><div class="grab"></div>${opt.title ? `<div class="modal-h"><h3>${opt.title}</h3><button class="btn-ico sm" data-act="closeModal" aria-label="Tutup">${ic('close')}</button></div>` : ''}<div class="modal-b">${html}</div></div>`;
  w.addEventListener('click', e => { if (e.target === w && !opt.lock) closeModal(); });
  $('#layer').appendChild(w);
  setTimeout(() => { const f = $('#ovl input:not([type=hidden]):not([type=checkbox]),#ovl textarea'); if (f && opt.focus !== false && matchMedia('(min-width:700px)').matches) f.focus(); }, 50);
  return w;
}
function closeModal() { const o = $('#ovl'); if (o) o.remove(); }
function confirmBox(teks, okLabel = 'Ya, lanjutkan', bahaya = false) {
  return new Promise(res => {
    modal(`<p style="font-size:15px">${teks}</p><div class="row mt5" style="justify-content:flex-end"><button class="btn btn-light" id="cfN">Batal</button><button class="btn ${bahaya ? 'btn-red' : 'btn-primary'}" id="cfY">${esc(okLabel)}</button></div>`, { title: 'Konfirmasi' });
    $('#cfN').onclick = () => { closeModal(); res(false); }; $('#cfY').onclick = () => { closeModal(); res(true); };
  });
}

/* ---------- Identitas perangkat ---------- */
function deviceId() { let d = LS.get('gp_dev'); if (!d) { d = 'D' + uid() + uid(); LS.set('gp_dev', d); } return d; }
function deviceName() {
  const u = navigator.userAgent;
  const os = /Android/.test(u) ? 'Android' : /iPhone|iPad/.test(u) ? 'iPhone/iPad' : /Windows/.test(u) ? 'Windows' : /Mac/.test(u) ? 'Mac' : 'Perangkat';
  const br = /Edg\//.test(u) ? 'Edge' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : /Firefox\//.test(u) ? 'Firefox' : 'Browser';
  return os + ' · ' + br;
}

/* ==========================================================================
 * API — satu pintu untuk kedua mode transport
 * ========================================================================== */
/* Aksi baca: request kembar yang sedang berjalan menumpang satu promise (hemat eksekusi server).
 * Setiap aksi tulis menaikkan _epoch sehingga baca sesudahnya selalu mengambil data baru. */
const BACA = /^(p\.(konten|legal)|m\.(bootstrap|soal\.(ambil|ids)|hasil\.detail|perangkat)|a\.(bootstrap|list|stats|member\.(list|detail)|bayar\.list|crm\.(kontak|detail|hariini|segmen\.hitung)|setting\.get|log))$/;
const _inflight = {}; let _epoch = 0;
const API = {
  call(action, payload = {}, opt = {}) {
    if (!BACA.test(action) || opt.fresh) { _epoch++; return API._call(action, payload, opt); }
    const k = _epoch + '|' + action + '|' + ((S.auth && S.auth.token) || '') + '|' + JSON.stringify(payload);
    if (_inflight[k]) return _inflight[k];
    const pr = API._call(action, payload, opt);
    _inflight[k] = pr;
    const lepas = () => { delete _inflight[k]; };
    pr.then(lepas, lepas);
    return pr;
  },
  async _call(action, payload = {}, opt = {}) {
    const req = { action, payload, token: (S.auth && S.auth.token) || '' };
    if (!opt.silent) loading(true);
    try {
      let res;
      for (let i = 0; i < 2; i++) {
        try { res = await API._fetch(req, opt.timeout || 45000); break; }
        catch (e) { if (i === 1 || e.name === 'AbortError' || !navigator.onLine) throw e; await sleep(700); }
      }
      if (!res || typeof res !== 'object') throw new Error('Respons server tidak valid.');
      if (!res.ok) {
        const e = new Error(res.msg || 'Gagal'); e.code = res.code;
        if (res.code === 'AUTH' && S.auth && !opt.noAuthRedirect) { sesiHabis(res.msg); }
        throw e;
      }
      return res.data;
    } catch (e) {
      if (e.name === 'AbortError') e.message = 'Koneksi lambat. Coba lagi.';
      else if (e instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(e.message)) { e.message = 'Tidak ada koneksi internet.'; e.offline = true; }
      throw e;
    } finally { if (!opt.silent) loading(false); }
  },
  async _fetch(req, timeout) {
    if (!CFG.GAS_URL || CFG.GAS_URL.indexOf('__') === 0 || /GANTI_DENGAN/.test(CFG.GAS_URL)) throw new Error('Alamat server belum diisi. Isi GAS_URL di file js/config.js.');
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch(CFG.GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(req), signal: ctl.signal, redirect: 'follow' });
      return await r.json();
    } finally { clearTimeout(t); }
  }
};

/* ---------- Outbox: aksi optimistik dikirim batch di latar belakang ---------- */
const OB = {
  q: LS.get('gp_ob', []), busy: false, gagal: 0, t: null,
  push(op) { op.w = Date.now(); this.q.push(op); LS.set('gp_ob', this.q); this.schedule(1500); syncDot(); },
  schedule(ms) { clearTimeout(this.t); this.t = setTimeout(() => this.flush(), ms); },
  async flush() {
    if (this.busy || !S.auth || S.auth.role !== 'member') return;
    let pend = LS.get('gp_ujian_pending'); if (pend && !Array.isArray(pend)) pend = [pend];
    if (pend && pend.length && navigator.onLine) {
      const sisa = []; let kirim = 0;
      for (const p of pend) {
        try { const r = await API.call('m.ujian.selesai', p, { silent: true, timeout: 60000 }); kirim++; if (S.route === 'm/hasil' && S.hasil && S.hasil.pending) { S.hasil = Object.assign(r, { label: S.hasil.label, soal: r.pembahasan || null }); render(); } }
        catch (e) { sisa.push(p); }
      }
      if (sisa.length) LS.set('gp_ujian_pending', sisa); else LS.del('gp_ujian_pending');
      if (kirim) { toast('Hasil latihan/ujian tersimpan di server ✓'); if (S.boot) muatBoot(true); }
    }
    if (!this.q.length || !navigator.onLine) { syncDot(); return; }
    this.busy = true; syncDot();
    const batch = this.q.slice(0, 100);
    try {
      await API.call('m.sync', { ops: batch }, { silent: true });
      this.q = this.q.slice(batch.length); LS.set('gp_ob', this.q); this.gagal = 0;
      if (this.q.length) this.schedule(300);
    } catch (e) { this.gagal++; this.schedule(Math.min(60000, 3000 * this.gagal)); }
    finally { this.busy = false; syncDot(); }
  }
};
function syncDot() {
  const d = $('#syncDot'); if (!d) return;
  const pd = LS.get('gp_ujian_pending'), n = OB.q.length + (pd ? (Array.isArray(pd) ? pd.length : 1) : 0);
  d.className = 'sync-dot ' + (!navigator.onLine ? 'off' : n ? 'pend' : '');
  d.title = !navigator.onLine ? 'Offline — perubahan disimpan di HP' : n ? n + ' perubahan menunggu sinkron' : 'Tersinkron';
}
window.addEventListener('online', () => { OB.flush(); syncDot(); toast('Kembali online', 'ok', 1800); });
window.addEventListener('offline', () => { syncDot(); toast('Offline — kamu tetap bisa belajar, data disimpan di HP', 'warn'); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') OB.flush(); else if (S.auth && S.auth.role === 'member' && Date.now() - (S.bootAt || 0) > 120000) muatBoot(true); });

/* ==========================================================================
 * STATE & ROUTER (0 ms: semua tampilan dirender dari state di memori)
 * ========================================================================== */
const S = {
  route: '', params: {}, hist: [], pub: LS.get('gp_pub'), auth: LS.get('gp_auth'), boot: null, bootAt: 0,
  adm: null, ad: {}, quiz: null, hasil: null, ui: {}, read: LS.get('gp_read', {}), act: LS.get('gp_act', {})
};
const R = {};      // route → fungsi render (mengembalikan HTML konten)
const AFTER = {};  // route → fungsi setelah render (pasang chart, observer, dll.)
const ACT = {};    // data-act → handler
const FORM = {};   // data-form → handler submit

function go(route, params = {}, opt = {}) {
  if (S.route && !opt.replace && !opt.noHist && (S.route !== route || JSON.stringify(S.params) !== JSON.stringify(params))) {
    S.hist.push({ route: S.route, params: S.params }); if (S.hist.length > 40) S.hist.shift();
  }
  if (S.quiz && S.quiz.mode === 'ujian' && !S.quiz.selesai && S.route === 'm/kuis' && route !== 'm/kuis' && !opt.force) {
    confirmBox('Ujian sedang berjalan. Jawabanmu tersimpan di HP dan timer tetap berjalan. Keluar dari layar ujian?', 'Keluar').then(y => { if (y) go(route, params, Object.assign({}, opt, { force: true })); });
    return;
  }
  const dr = $('#drw'); if (dr) dr.remove();
  S.route = route; S.params = params || {};
  if (!opt.noHash) { const h = '#' + route + (params && params.id ? '/' + encodeURIComponent(params.id) : ''); if (location.hash !== h) history.pushState(null, '', h); }
  render(true);
}
function back() { const p = S.hist.pop(); if (p) go(p.route, p.params, { noHist: true }); else go(S.auth ? (S.auth.role === 'member' ? 'm/beranda' : 'a/ringkasan') : 'home', {}, { noHist: true }); }
window.addEventListener('popstate', () => { const r = parseHash(); if (r.route !== S.route || r.params.id !== S.params.id) { S.route = r.route; S.params = r.params; render(true); } });
function parseHash() {
  const h = decodeURIComponent((location.hash || '').slice(1)); if (!h) return { route: '', params: {} };
  const parts = h.split('/'); let route = parts[0], id = '';
  if ((parts[0] === 'm' || parts[0] === 'a') && parts[1]) { route = parts[0] + '/' + parts[1]; id = parts.slice(2).join('/'); } else id = parts.slice(1).join('/');
  return { route, params: id ? { id } : {} };
}

/* Render: pilih layout menurut awalan rute, lalu isi konten */
function render(top = false) {
  const route = S.route || 'home', y = window.scrollY;
  const area = route.startsWith('m/') ? 'member' : route.startsWith('a/') ? 'admin' : 'pub';
  if (area === 'member' && (!S.auth || S.auth.role === undefined)) return go('masuk', {}, { replace: true });
  if (area === 'admin' && (!S.auth || (S.auth.role !== 'admin' && S.auth.role !== 'superadmin'))) return go('admin', {}, { replace: true });
  const fn = R[route] || R.notfound;
  let body;
  try { body = fn(S.params); } catch (e) { console.error(e); body = `<div class="card empty">${ic('error')}<p>Terjadi kesalahan tampilan: ${esc(e.message)}</p></div>`; }
  const app = $('#app');
  if (area === 'member') app.innerHTML = shellMember(route, body);
  else if (area === 'admin') app.innerHTML = shellAdmin(route, body);
  else app.innerHTML = shellPub(route, body);
  document.title = (S.ui.title ? S.ui.title + ' · ' : '') + 'Goukaku Pedia ID';
  if (top) window.scrollTo(0, 0); else window.scrollTo(0, y);
  if (AFTER[route]) try { AFTER[route](S.params); } catch (e) { console.error(e); }
  syncDot(); tick();
}
/* Render ulang hanya bila rute masih sama (dipakai setelah revalidate latar) */
function rerender(route) { if (!route || S.route === route || (Array.isArray(route) && route.indexOf(S.route) > -1)) render(false); }

/* ---------- Delegasi event global ---------- */
document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]');
  if (g) { e.preventDefault(); const p = {}; if (g.dataset.id) p.id = g.dataset.id; if (g.dataset.tab) p.tab = g.dataset.tab; go(g.dataset.go, p); return; }
  const a = e.target.closest('[data-act]');
  if (a && ACT[a.dataset.act]) { e.preventDefault(); ACT[a.dataset.act](a, e); }
});
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]'); if (!f) return;
  e.preventDefault();
  const data = {}; new FormData(f).forEach((v, k) => { if (k in data) data[k] = [].concat(data[k], v); else data[k] = v; });
  $$('input[type=checkbox][name]', f).forEach(c => { if (!c.closest('[data-multi]')) data[c.name] = c.checked; });
  $$('[data-multi]', f).forEach(w => { data[w.dataset.multi] = $$('input:checked', w).map(x => x.value).join(','); });
  if (FORM[f.dataset.form]) FORM[f.dataset.form](f, data);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('#ovl')) closeModal(); else if ($('.viewer')) ACT.tutupViewer(); else if ($('.drawer')) ACT.tutupDrawer(); } });
ACT.closeModal = () => closeModal();
ACT.back = () => back();
ACT.tema = () => {
  const d = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', d); LS.set('gp_tema', d); try { localStorage.setItem('gp_tema', d); } catch (e) { }
  render(false);
};
/* Tombol kirim form: kunci saat proses agar tidak terkirim ganda */
async function kunciTombol(form, fn) {
  const b = form.querySelector('button[type=submit]'); if (b && b.classList.contains('loading')) return;
  if (b) { b.classList.add('loading'); b.disabled = true; }
  try { return await fn(); } finally { if (b && document.body.contains(b)) { b.classList.remove('loading'); b.disabled = false; } }
}
function errField(form, name, msg) {
  $$('.ferr', form).forEach(x => x.remove()); $$('.inp.err', form).forEach(x => x.classList.remove('err'));
  if (!name) return;
  const el = form.querySelector(`[name="${name}"]`);
  if (el) { el.classList.add('err'); el.insertAdjacentHTML('afterend', `<div class="ferr">${esc(msg)}</div>`); el.focus(); }
}

/* ---------- Countdown & ticker global (1 interval untuk semua) ---------- */
function tick() {
  $$('[data-cd]').forEach(el => {
    const t = toDate(el.dataset.cd); if (!t) return; let s = Math.max(0, Math.floor((t - Date.now()) / 1000));
    const d = Math.floor(s / 86400); s %= 86400; const h = Math.floor(s / 3600); s %= 3600; const m = Math.floor(s / 60); s %= 60;
    const set = (k, v) => { const x = el.querySelector('[data-u=' + k + ']'); if (x) x.textContent = String(v).padStart(k === 'd' ? 1 : 2, '0'); };
    set('d', d); set('h', h); set('m', m); set('s', s);
    if (el.dataset.cdHide && t <= Date.now()) el.closest(el.dataset.cdHide) && el.closest(el.dataset.cdHide).remove();
  });
}
setInterval(tick, 1000);
const cdBox = (iso, dark = false, hide = '') => `<div class="cdown ${dark ? 'dark' : ''}" data-cd="${esc(iso)}" ${hide ? `data-cd-hide="${hide}"` : ''}><div><b data-u="d">0</b><small>hari</small></div><div><b data-u="h">00</b><small>jam</small></div><div><b data-u="m">00</b><small>menit</small></div><div><b data-u="s">00</b><small>detik</small></div></div>`;

/* Aktivitas belajar harian (untuk streak & grafik 7 hari) */
function catatAktivitas(n = 1) {
  const k = new Date(hariJST()).toISOString().slice(0, 10); S.act[k] = (S.act[k] || 0) + n;
  const ks = Object.keys(S.act).sort(); while (ks.length > 60) delete S.act[ks.shift()];
  LS.set('gp_act', S.act);
}
function streak() {
  let n = 0, d = hariJST();
  if (!S.act[new Date(d).toISOString().slice(0, 10)]) d -= 86400000;
  while (S.act[new Date(d).toISOString().slice(0, 10)]) { n++; d -= 86400000; }
  return n;
}

/* Muat pustaka CDN hanya saat dibutuhkan (Chart.js, PDF.js) */
const _lib = {};
function muatLib(url, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (_lib[url]) return _lib[url];
  _lib[url] = new Promise((ok, no) => { const s = document.createElement('script'); s.src = url; s.onload = () => ok(window[globalName]); s.onerror = () => { delete _lib[url]; no(new Error('Gagal memuat pustaka. Periksa koneksi.')); }; document.head.appendChild(s); });
  return _lib[url];
}
const CHART_URL = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/* Unduh CSV (UTF-8 BOM agar terbaca rapi di Excel) */
function unduhCSV(nama, rows) {
  if (!rows.length) return toast('Tidak ada data untuk diexport', 'warn');
  const cols = Object.keys(rows.reduce((a, r) => Object.assign(a, r), {}));
  const q = v => { const s = String(v === null || v === undefined ? '' : v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = '﻿' + [cols.join(',')].concat(rows.map(r => cols.map(c => q(r[c])).join(','))).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = nama + '.csv';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
/* CSV → array objek (untuk import massal) */
function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',' || c === '\t') { row.push(f); f = ''; } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const h = (rows.shift() || []).map(x => x.replace(/^﻿/, '').trim());
  return rows.filter(r => r.join('').trim()).map(r => { const o = {}; h.forEach((k, i) => o[k] = r[i] === undefined ? '' : r[i]); return o; });
}
/* Kompres gambar di HP sebelum unggah (maks. sisi 1600 px, ≤ 2 MB) */
function kompresGambar(file, maks = 1600) {
  return new Promise((ok, no) => {
    if (!/^image\//.test(file.type)) return no(new Error('File harus gambar JPG/PNG/WebP.'));
    if (file.type === 'image/svg+xml') { const r = new FileReader(); r.onload = () => ok({ b64: r.result.split(',')[1], mime: file.type }); r.readAsDataURL(file); return; }
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      let { width: w, height: h } = img; const k = Math.min(1, maks / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h);
      let q = .85, data = cv.toDataURL('image/webp', q); if (data.indexOf('image/webp') < 0) data = cv.toDataURL('image/jpeg', q);
      while (data.length * .75 > 2 * 1024 * 1024 && q > .4) { q -= .1; data = cv.toDataURL(data.indexOf('webp') > -1 ? 'image/webp' : 'image/jpeg', q); }
      URL.revokeObjectURL(url); ok({ b64: data.split(',')[1], mime: data.slice(5, data.indexOf(';')) });
    };
    img.onerror = () => no(new Error('Gambar tidak bisa dibaca.')); img.src = url;
  });
}
const fileB64 = file => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result.split(',')[1]); r.onerror = no; r.readAsDataURL(file); });
function b64ToBytes(b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
function waLink(no, teks = '') { const n = String(no || '').replace(/\D/g, '').replace(/^0/, '62'); return `https://wa.me/${n}${teks ? '?text=' + encodeURIComponent(teks) : ''}`; }

/* Sesi habis / logout */
function sesiHabis(msg) {
  const role = S.auth && S.auth.role;
  S.auth = null; S.boot = null; LS.del('gp_auth');
  toast(msg || 'Sesi berakhir. Silakan masuk kembali.', 'warn');
  go(role === 'member' ? 'masuk' : 'admin', {}, { replace: true, force: true });
}
ACT.keluar = async () => {
  if (!await confirmBox('Keluar dari akun ini?', 'Keluar')) return;
  await OB.flush();
  const role = S.auth && S.auth.role;
  API.call('p.logout', {}, { silent: true }).catch(() => { });
  if (S.auth && S.auth.email) LS.del('gp_boot_' + S.auth.email);
  S.auth = null; S.boot = null; S.adm = null; S.ad = {}; LS.del('gp_auth');
  go(role === 'member' ? 'home' : 'admin', {}, { force: true });
};
/* ============================================================================
 * HALAMAN PUBLIK: beranda (etalase), Coba Gratis, Daftar, Masuk, Lupa sandi,
 * halaman legal, login admin.
 * ========================================================================== */
function shellPub(route, body) {
  const b = (S.pub && S.pub.brand) || {};
  const nav = `<header class="pnav"><div class="pnav-in">
    <a href="javascript:void(0)" data-go="home" aria-label="Beranda">${logo()}</a>
    <nav class="pnav-menu" aria-label="Menu">
      <a href="javascript:void(0)" data-act="ke" data-to="paket">Paket</a><a href="javascript:void(0)" data-act="ke" data-to="lulus">Bukti Lulus</a>
      <a href="javascript:void(0)" data-act="ke" data-to="kurikulum">Kurikulum</a><a href="javascript:void(0)" data-act="ke" data-to="faq">FAQ</a></nav>
    <div class="row">
      <button class="btn-ico sm only-d" data-act="tema" aria-label="Ganti tema">${ic(document.documentElement.dataset.theme === 'dark' ? 'light_mode' : 'dark_mode')}</button>
      ${S.auth && S.auth.role === 'member' ? `<button class="btn btn-primary btn-sm" data-go="m/beranda">${ic('school')} Belajar</button>` :
      `<button class="btn btn-light btn-sm" data-go="masuk">Masuk</button><button class="btn btn-red btn-sm only-d" data-go="coba">Coba Gratis</button>`}
    </div></div></header>`;
  const foot = ['home', 'legal'].indexOf(route) > -1 ? footer(b) : '';
  const fab = b.wa ? `<a class="fab-wa" href="${waLink(b.wa, 'Halo Admin Goukaku Pedia ID, saya ingin bertanya tentang kelas persiapan 介護福祉士.')}" target="_blank" rel="noopener" aria-label="Chat WhatsApp admin" data-act="kunjunganWA">${WA_SVG}</a>` : '';
  return nav + `<main id="pub" class="fadein">${body}</main>` + foot + fab;
}
function footer(b) {
  const legal = (S.pub && S.pub.legal) || [];
  return `<footer class="foot"><div class="wrapx foot-g">
    <div><div class="logo" style="color:#fff">${logoMark(44)}<div>${esc(b.nama || 'Goukaku Pedia ID')}<small style="color:#aab3ff">${esc(b.tagline || 'Teman Belajar Kamu')}</small></div></div>
      <p class="mt3 small" style="color:#cfd5ff">Web belajar persiapan Ujian Nasional 介護福祉士 untuk murid Indonesia — furigana, terjemahan Indonesia sederhana, dan TRIK JITU.</p></div>
    <div><h4>Hubungi kami</h4><div class="col gap2 small">
      ${b.wa ? `<a href="${waLink(b.wa)}" target="_blank" rel="noopener">WhatsApp: +${esc(b.wa)}</a>` : ''}
      ${b.email ? `<a href="mailto:${esc(b.email)}">${esc(b.email)}</a>` : ''}
      <a href="https://www.tiktok.com/@${esc(b.tiktok || 'goukakupedia.id')}" target="_blank" rel="noopener">TikTok @${esc(b.tiktok || 'goukakupedia.id')}</a>
      <a href="https://www.instagram.com/${esc(b.instagram || 'goukakupedia.id')}" target="_blank" rel="noopener">Instagram @${esc(b.instagram || 'goukakupedia.id')}</a></div></div>
    <div><h4>Informasi</h4><div class="col gap2 small">
      ${legal.map(l => `<a href="javascript:void(0)" data-go="legal" data-id="${esc(l.id)}">${esc(l.judul)}</a>`).join('')}
      <a href="javascript:void(0)" data-go="admin">Masuk Admin</a>
      ${S.installEvt ? `<a href="javascript:void(0)" data-act="pasangApp">\uD83D\uDCF2 Pasang aplikasi di HP</a>` : ''}</div></div>
  </div><div class="wrapx small mt5" style="color:#8f99e6">© ${new Date().getFullYear()} ${esc(b.nama || 'Goukaku Pedia ID')} · Semua hak dilindungi.</div></footer>`;
}
ACT.ke = el => { if (S.route !== 'home') { go('home'); setTimeout(() => ACT.ke(el), 60); return; } const t = document.getElementById(el.dataset.to); if (t) window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 70, behavior: 'smooth' }); };
ACT.kunjunganWA = () => { API.call('p.kunjungan', { sumber: 'tombol_wa' }, { silent: true }).catch(() => { }); };

/* Muat konten publik: tampil dari cache dulu, perbarui di latar */
async function muatPublik() {
  try {
    const d = await API.call('p.konten', {}, { silent: !!S.pub });
    const lama = JSON.stringify(S.pub); S.pub = d; LS.set('gp_pub', d);
    if (lama !== JSON.stringify(d)) rerender(['home', 'daftar', 'coba', 'legal', 'masuk']);
  } catch (e) { if (!S.pub) { toast(e.message, 'err'); rerender('home'); } }
}

/* ---------- Beranda publik ---------- */
R.home = () => {
  S.ui.title = '';
  const P = S.pub;
  if (!P) return `<div class="wrapx mt5"><div class="sk" style="height:320px"></div><div class="grid g3 mt4"><div class="sk" style="height:120px"></div><div class="sk" style="height:120px"></div><div class="sk" style="height:120px"></div></div></div>`;
  const u = P.ujian_utama, hero = P.hero.length ? P.hero : [{ judul: 'Lulus 介護福祉士 dengan TRIK JITU', subjudul: 'Belajar terarah dengan furigana & terjemahan Indonesia.', cta_teks: 'Coba Gratis', cta_link: '#coba' }];
  const slides = hero.map((h, i) => `<div class="slide ${i === 0 ? 'on' : ''}" data-i="${i}">
      <span class="chip" style="background:rgba(255,255,255,.15);color:#BEE9FF">${ic('verified')} Program Persiapan Kaigo Fukushishi</span>
      <h1 class="mt3">${furi(h.judul)}</h1><p class="sub">${furi(h.subjudul || '')}</p>
      <div class="row wrap mt4"><button class="btn btn-white" data-act="cta" data-link="${esc(h.cta_link || '#coba')}">${esc(h.cta_teks || 'Coba Gratis')} ${ic('arrow_forward')}</button>
      ${/paket/i.test(h.cta_link || '') ? `<button class="btn btn-ghost" style="color:#fff;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.5)" data-act="ke" data-to="coba">Coba Gratis</button>` : `<button class="btn btn-ghost" style="color:#fff;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.5)" data-act="ke" data-to="paket">Lihat Paket</button>`}</div>
      ${h.gambar_url ? `<img class="slide-img mt4" src="${esc(h.gambar_url)}" alt="${esc(h.judul)}" loading="${i ? 'lazy' : 'eager'}">` : ''}</div>`).join('');
  const art = `<div class="hero-art" aria-hidden="true"><div class="book">
      <div class="row-b"><span class="chip" style="background:rgba(255,255,255,.18);color:#fff">科目: 介護の基本</span><span class="tiny" style="opacity:.8">Soal #05</span></div>
      <div class="jp" style="font-size:17px;line-height:2.1">${furi('｜尊厳《そんげん》の｜保持《ほじ》と｜自立支援《じりつしえん》について、より｜適切《てきせつ》なものを１つ｜選《えら》びなさい。')}</div>
      <div style="background:rgba(22,163,74,.25);border-radius:10px;padding:8px 10px;font-size:13px">✓ 2. ${furi('｜残存能力《ざんぞんのうりょく》を｜活《い》かし…')}</div>
      <div style="background:rgba(255,255,255,.12);border-radius:10px;padding:8px 10px;font-size:12.5px">\uD83D\uDCA1 <b>TRIK JITU:</b> kata すべて / 必ず hampir selalu SALAH</div>
    </div>${stamp('lg')}</div>`;
  const promo = P.promo.map(p => `<div class="promo-band" id="promo-${esc(p.id)}">
      <div class="f1" style="min-width:220px"><span class="chip" style="background:#fff;color:var(--c-red)">${ic('local_fire_department')} PROMO</span>
      <h3 class="mt2" style="color:#fff">${esc(p.judul)}</h3><p class="small" style="opacity:.92">${esc(p.teks)}</p>
      <div class="mt2"><span class="price" style="color:#fff">${rp(p.harga)}</span></div></div>
      <div class="col gap2"><span class="tiny" style="opacity:.9">Promo berakhir dalam</span>${cdBox(p.berakhir, false, '.promo-band')}
      <a class="btn btn-white mt2" href="javascript:void(0)" data-go="daftar" data-id="${esc(p.paket_id)}">Ambil Promo ${ic('arrow_forward')}</a></div></div>`).join('');
  const t = P.pengajar[0];
  const trik = [['KATA KUNCI', 'Kenali kata kunci tiap soal & artinya dalam bahasa Indonesia yang mudah.', 'key'], ['RUMUS CEPAT', 'Cara mencoret pilihan yang pasti salah dalam hitungan detik.', 'bolt'],
  ['JEMBATAN INGATAN', 'Kalimat pengingat yang lucu & mudah diingat sampai hari ujian.', 'psychology'], ['AWAS JEBAKAN', 'Pola soal jebakan yang sering membuat peserta Indonesia keliru.', 'warning']];
  const fitur = [['route', 'Alur Belajar', 'Langkah demi langkah + target mingguan otomatis menuju hari ujian.'], ['picture_as_pdf', 'Materi PDF per 科目', 'Dibaca online dengan furigana — aman & rapi di HP.'],
  ['image', 'Belajar pakai gambar', 'Infografis berfurigana dengan penjelasan sederhana.'], ['style', 'Kosakata + kartu hafalan', 'Kata yang belum hafal muncul lebih sering.'],
  ['quiz', '13 Paket Soal', '過去問 第33〜38回, 練習, dan 模擬試験 bertimer.'], ['videocam', 'Kelas Zoom & rekaman', 'Bedah soal langsung bersama pengajar setiap minggu.']];
  return `
  <section class="hero"><div class="glow" style="width:260px;height:260px;right:-60px;top:-60px;background:rgba(191,230,246,.2)"></div>
    <div class="hero-in"><div><div class="slides" id="slides">${slides}</div>
      ${hero.length > 1 ? `<div class="row mt3"><button class="btn-ico sm" style="color:#fff" data-act="slide" data-d="-1" aria-label="Sebelumnya">${ic('chevron_left')}</button><div class="dots">${hero.map((h, i) => `<button class="${i === 0 ? 'on' : ''}" data-act="slideKe" data-i="${i}" aria-label="Slide ${i + 1}"></button>`).join('')}</div><button class="btn-ico sm" style="color:#fff" data-act="slide" data-d="1" aria-label="Berikutnya">${ic('chevron_right')}</button></div>` : ''}
      ${u ? `<div class="mt4"><div class="tiny" style="opacity:.85;text-transform:uppercase;letter-spacing:.08em;font-weight:700">Hitung mundur ${esc(u.nama)}</div><div class="mt2">${cdBox(u.tanggal)}</div></div>` : ''}
    </div>${art}</div></section>
  <svg class="wave" viewBox="0 0 1200 40" preserveAspectRatio="none"><path d="M0 20 Q 150 0 300 20 T 600 20 T 900 20 T 1200 20" stroke="currentColor" stroke-width="3" fill="none"/></svg>
  ${promo ? `<section class="psec tight"><div class="wrapx col gap3">${promo}</div></section>` : ''}
  <section class="psec tight"><div class="wrapx">
    <div class="stat-strip"><div class="card"><b>${num(P.stat.murid).toLocaleString('id-ID')}+</b><span class="small muted">Murid</span></div><div class="card"><b>${num(P.stat.lulus).toLocaleString('id-ID')}+</b><span class="small muted">Lulus 合格</span></div><div class="card"><b>${num(P.stat.soal).toLocaleString('id-ID')}+</b><span class="small muted">Soal dibahas</span></div></div>
    <div class="psec-h" style="margin-top:44px"><h2>Kenapa <span style="color:var(--c-red)">TRIK JITU</span>?</h2><p>Setiap soal dibahas dengan 4 bagian khas Goukaku Pedia ID — seperti di modul pembahasan.</p></div>
    <div class="grid g4 trik4">${trik.map((x, i) => `<div class="card hov"><div class="row"><div class="num">${i + 1}</div>${ic(x[2])}</div><h3 class="mt3">${x[0]}</h3><p class="small muted mt1">${x[1]}</p></div>`).join('')}</div>
  </div></section>
  ${t ? `<section class="psec"><div class="wrapx"><div class="psec-h"><h2>Kenali Pengajarmu</h2></div><div class="teacher">
      <div class="teacher-photo">${t.foto_url ? `<img src="${esc(t.foto_url)}" alt="${esc(t.nama)}" loading="lazy">` : esc(String(t.nama || 'G').split(' ').map(x => x[0]).join('').slice(0, 2))}<div style="position:absolute;right:14px;bottom:14px">${stamp()}</div></div>
      <div><span class="chip pale">${esc(t.peran)}</span><h2 class="mt2">${esc(t.nama)}</h2><p class="mt3">${esc(t.pengalaman)}</p>
        <p class="mt2 small"><b>Keahlian:</b> ${furi(t.keahlian)}</p>
        <div class="grid g2 mt4" style="max-width:420px"><div class="card center"><b style="font-family:var(--f-head);font-size:26px;color:var(--c-primary-2)">${num(t.jumlah_murid)}+</b><div class="small muted">Murid diajar</div></div><div class="card center"><b style="font-family:var(--f-head);font-size:26px;color:var(--c-red)">${num(t.jumlah_lulus)}+</b><div class="small muted">Murid lulus</div></div></div>
        ${t.pesan_singkat ? `<blockquote class="card mt4" style="border-left:4px solid var(--c-primary-2);margin:16px 0 0">“${furi(t.pesan_singkat)}”</blockquote>` : ''}
        <div class="row mt4 wrap"><a class="btn btn-light btn-sm" href="https://www.tiktok.com/@${esc(t.tiktok || 'goukakupedia.id')}" target="_blank" rel="noopener">TikTok @${esc(t.tiktok || 'goukakupedia.id')}</a><a class="btn btn-light btn-sm" href="https://www.instagram.com/${esc(t.instagram || 'goukakupedia.id')}" target="_blank" rel="noopener">Instagram @${esc(t.instagram || 'goukakupedia.id')}</a></div>
      </div></div></div></section>` : ''}
  <section class="psec tight"><div class="wrapx"><div class="band-coba"><div><h2>Coba 10 soal gratis sekarang</h2><p class="muted mt1">Tanpa daftar akun. Lihat skor dan contoh pembahasan TRIK JITU.</p></div><button class="btn btn-red" data-go="coba">${ic('play_circle', 'fill')} Mulai Coba Gratis</button></div></div></section>
  <section class="psec"><div class="wrapx"><div class="psec-h"><h2>Isi Kelas</h2><p>Semua yang kamu butuhkan dari hari pertama sampai hari ujian.</p></div>
    <div class="grid g3">${fitur.map(f => `<div class="card feat"><div class="ic">${ic(f[0])}</div><div><h3>${furi(f[1])}</h3><p class="small muted mt1">${furi(f[2])}</p></div></div>`).join('')}</div></div></section>
  <section class="psec" id="paket"><div class="wrapx"><div class="psec-h"><h2>Paket & Harga</h2><p>Masa aktif sampai hari ujian angkatanmu. Bayar aman lewat Lynk.id.</p></div>
    <div class="grid g3">${P.paket.map(p => paketCard(p)).join('')}</div></div></section>
  <section class="psec" id="lulus" style="background:var(--c-surface)"><div class="wrapx"><div class="psec-h"><h2>Bukti Lulus 合格</h2><p>Mereka sudah membuktikannya. Giliranmu berikutnya!</p></div>
    <div class="hscroll">${P.bukti.map(x => `<div class="card" style="background:var(--c-bg)">${x.foto_url ? `<img src="${esc(x.foto_url)}" alt="Bukti lulus ${esc(x.nama_member)}" loading="lazy" style="border-radius:12px;aspect-ratio:4/3;object-fit:cover;width:100%">` : `<div style="aspect-ratio:4/3;border-radius:12px;background:var(--grad-hero);display:flex;align-items:center;justify-content:center">${stamp('lg')}</div>`}
      <div class="row-b mt3"><b>${esc(x.nama_member)}</b><span class="chip red">第${esc(x.ujian_ke)}回 合格</span></div><p class="small muted mt1">${esc(x.cerita_singkat)}</p></div>`).join('')}</div>
    <h3 class="mt5 mb3">Kata Mereka</h3>
    <div class="grid g3">${P.testimoni.map(x => `<div class="card"><div style="color:var(--c-amber)">${'★'.repeat(Math.max(1, Math.min(5, num(x.rating, 5))))}<span style="color:var(--c-line)">${'★'.repeat(5 - Math.max(1, Math.min(5, num(x.rating, 5))))}</span></div><p class="mt2">“${esc(x.isi)}”</p><div class="row mt3"><div class="av">${esc(String(x.nama || '?')[0])}</div><div><b class="small">${esc(x.nama)}</b><div class="tiny muted">${esc(x.asal)}</div></div></div></div>`).join('')}</div></div></section>
  <section class="psec" id="kurikulum"><div class="wrapx"><div class="psec-h"><h2>Kurikulum per 科目</h2><p>13 科目ujian 介護福祉士, dibahas tuntas.</p></div>
    <div class="grid ${P.brand.video ? 'g2' : ''}" style="align-items:start"><div class="acc">${P.kurikulum.map((k, i) => `<details ${i === 0 ? 'open' : ''}><summary><span><span class="chip" style="margin-right:8px">${i + 1}</span><span class="jp">${esc(k.kamoku)}</span></span>${ic('expand_more')}</summary><div class="acc-b">${esc(k.ringkasan)}</div></details>`).join('')}</div>
    ${P.brand.video ? `<div><div class="video-box" id="vbox" data-vid="${esc(P.brand.video)}"><button class="btn btn-white btn-sm vbtn" data-act="suara">${ic('volume_off')} Nyalakan suara</button></div><p class="small muted mt2">Video profil Goukaku Pedia ID</p></div>` : ''}</div></div></section>
  <section class="psec" id="faq"><div class="wrapx" style="max-width:820px"><div class="psec-h"><h2>Pertanyaan Umum</h2></div>
    <div class="acc">${P.faq.map(f => `<details><summary>${esc(f.pertanyaan)}${ic('expand_more')}</summary><div class="acc-b">${md(f.jawaban)}</div></details>`).join('')}</div></div></section>
  <section class="psec"><div class="wrapx"><div class="hero" style="border-radius:24px;padding:32px 20px;text-align:center"><h2 style="color:#fff">Siap meraih 合格?</h2>
    ${u ? `<p class="mt2" style="opacity:.9">${esc(u.nama)} tinggal:</p><div class="row mt3" style="justify-content:center">${cdBox(u.tanggal)}</div>` : ''}
    <div class="row wrap mt5" style="justify-content:center"><button class="btn btn-white" data-act="ke" data-to="paket">Daftar Sekarang</button><button class="btn btn-red" data-go="coba">Coba Gratis</button></div></div></div></section>`;
};
function paketCard(p) {
  const harga = p.promo ? p.promo.harga : p.harga, coret = p.promo ? p.harga : p.harga_coret;
  const hl = /terlaris/i.test(p.label || '') || !!p.promo;
  return `<div class="card card-lg price-card hov ${hl ? 'hl' : ''}">
    <div class="row-b"><h3>${esc(p.nama)}</h3>${p.promo ? `<span class="chip red">PROMO</span>` : p.label ? `<span class="chip navy">${esc(p.label)}</span>` : ''}</div>
    <p class="small muted">${esc(p.deskripsi)}</p>
    <div><span class="price">${rp(harga)}</span>${coret && coret > harga ? `<s>${rp(coret)}</s>` : ''}</div>
    ${p.promo ? `<div class="tiny" style="color:var(--c-red);font-weight:700">Promo berakhir ${fTgl(p.promo.berakhir)}</div>` : ''}
    <ul class="ticks">${p.isi.map(x => `<li>${ic('check_circle', 'fill')}<span>${furi(x)}</span></li>`).join('')}</ul>
    <button class="btn ${hl ? 'btn-primary' : 'btn-light'} btn-block mt2" data-go="daftar" data-id="${esc(p.id)}">Daftar ${esc(p.nama)}</button></div>`;
}
ACT.cta = el => { const l = el.dataset.link || ''; if (l === '#coba') go('coba'); else if (l.charAt(0) === '#') ACT.ke({ dataset: { to: l.slice(1) } }); else if (/^https?:/.test(l)) { const a = document.createElement('a'); a.href = l; a.target = '_blank'; a.rel = 'noopener'; a.click(); } };
/* Slideshow hero: auto 5 detik + geser jari */
let _slideT = null;
function slideKe(i) {
  const sl = $$('#slides .slide'); if (!sl.length) return; i = (i + sl.length) % sl.length;
  sl.forEach((s, k) => s.classList.toggle('on', k === i)); $$('.dots button').forEach((d, k) => d.classList.toggle('on', k === i)); S.ui.slide = i;
}
ACT.slide = el => { slideKe((S.ui.slide || 0) + num(el.dataset.d)); mulaiSlide(); };
ACT.slideKe = el => { slideKe(num(el.dataset.i)); mulaiSlide(); };
function mulaiSlide() { clearInterval(_slideT); if ($$('#slides .slide').length > 1) _slideT = setInterval(() => { if (S.route === 'home' && document.visibilityState === 'visible') slideKe((S.ui.slide || 0) + 1); }, 5000); }
AFTER.home = () => {
  S.ui.slide = 0; mulaiSlide();
  const s = $('#slides'); if (s) { let x0 = null; s.addEventListener('touchstart', e => x0 = e.touches[0].clientX, { passive: true }); s.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) { slideKe((S.ui.slide || 0) + (dx < 0 ? 1 : -1)); mulaiSlide(); } x0 = null; }); }
  // Video profil: autoplay mute saat terlihat
  const vb = $('#vbox');
  if (vb && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(en => { if (en[0].isIntersecting && !vb.querySelector('iframe')) { vb.insertAdjacentHTML('afterbegin', `<iframe id="vprof" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(vb.dataset.vid)}?autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1" title="Video profil" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`); io.disconnect(); } }, { threshold: .4 });
    io.observe(vb);
  }
};
ACT.suara = el => {
  const f = $('#vprof'); if (!f) return;
  const on = el.dataset.on !== '1'; el.dataset.on = on ? '1' : '0';
  f.contentWindow.postMessage(JSON.stringify({ event: 'command', func: on ? 'unMute' : 'mute', args: [] }), '*');
  el.innerHTML = ic(on ? 'volume_up' : 'volume_off') + (on ? ' Matikan suara' : ' Nyalakan suara');
};

/* ---------- Coba Gratis ---------- */
R.coba = () => {
  S.ui.title = 'Coba Gratis';
  const c = S.coba || (S.coba = { step: 'form' });
  if (c.step === 'form') {
    const j = (S.pub && S.pub.jadwal) || [];
    return `<div class="auth"><div class="card" style="max-width:520px"><span class="chip red">${ic('bolt')} GRATIS</span><h2 class="mt2">Coba 10 Soal Gratis</h2><p class="muted small mt1">Isi data singkat, lalu langsung kerjakan soal. Di akhir kamu dapat skor + contoh pembahasan TRIK JITU.</p>
      <form data-form="coba" class="mt4" novalidate>
        <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
        <div class="fld"><label for="cNama">Nama</label><input id="cNama" class="inp" name="nama" required autocomplete="name" placeholder="Nama lengkap"></div>
        <div class="fld"><label for="cWa">Nomor WhatsApp</label><input id="cWa" class="inp" name="no_wa" required inputmode="tel" autocomplete="tel" placeholder="08xxxxxxxxxx"></div>
        <div class="fld"><label for="cEm">Email <span class="muted">(opsional)</span></label><input id="cEm" class="inp" name="email" type="email" autocomplete="email" placeholder="nama@email.com"></div>
        <div class="grid g2" style="gap:12px"><div class="fld"><label for="cSt">Tinggal di</label><select id="cSt" class="inp" name="status_tinggal"><option>di Indonesia</option><option>di Jepang</option></select></div>
        <div class="fld"><label for="cTg">Target ujian</label><select id="cTg" class="inp" name="target_ujian">${j.map(x => `<option value="${esc(x.ujian_ke)}">${esc(x.nama)}</option>`).join('')}<option value="">Belum tahu</option></select></div></div>
        <label class="chk mb3"><input type="checkbox" name="setuju_wa"><span>Saya bersedia menerima info & promo lewat WhatsApp</span></label>
        <p class="tiny muted mb3">Data kamu dipakai sesuai <a href="javascript:void(0)" data-go="legal" data-id="privasi">Kebijakan Privasi</a>.</p>
        <button class="btn btn-red btn-block" type="submit">Mulai Kerjakan ${ic('arrow_forward')}</button></form></div></div>`;
  }
  if (c.step === 'quiz') {
    const q = c.soal[c.idx], n = c.soal.length, jaw = c.jawab[q.id];
    return `<div class="wrapx" style="max-width:820px;padding-top:16px;padding-bottom:100px">
      <div class="row-b mb3"><span class="chip">${ic('quiz')} Coba Gratis</span><b class="small">Soal ${c.idx + 1} / ${n}</b></div>
      <div class="bar mb4"><i style="width:${pct(Object.keys(c.jawab).length, n)}%"></i></div>
      ${soalHTML(q, { pilih: jaw, terjemah: c.terjemah, nomor: c.idx + 1 })}
      <div class="row-b mt4"><button class="btn btn-light" data-act="cobaNav" data-d="-1" ${c.idx === 0 ? 'disabled' : ''}>${ic('chevron_left')} Sebelumnya</button>
      ${c.idx < n - 1 ? `<button class="btn btn-primary" data-act="cobaNav" data-d="1">Berikutnya ${ic('chevron_right')}</button>` : `<button class="btn btn-red" data-act="cobaSelesai">Selesai & Lihat Skor ${ic('flag')}</button>`}</div></div>`;
  }
  // hasil
  const benar = c.soal.filter(q => String(c.jawab[q.id]) === String(q.kunci)).length, contoh = c.soal.find(q => String(c.jawab[q.id]) !== String(q.kunci)) || c.soal[0];
  return `<div class="wrapx" style="max-width:860px;padding:20px 16px 60px">
    <div class="res-hero"><div class="tiny" style="letter-spacing:.1em;text-transform:uppercase;opacity:.85">Skor Coba Gratis</div><div class="score mt2">${benar}<span style="font-size:28px;opacity:.7">/${c.soal.length}</span></div>
      <p class="mt2">${benar >= 6 ? 'Hebat! Dasarmu sudah bagus. Tinggal diasah dengan TRIK JITU \uD83D\uDD25' : 'Tidak apa-apa! Dengan Alur Belajar & TRIK JITU, nilaimu pasti naik \uD83D\uDCAA'}</p>
      <div class="row wrap mt4" style="justify-content:center"><button class="btn btn-white" data-act="ke" data-to="paket">Daftar Sekarang</button><button class="btn btn-ghost" style="color:#fff" data-act="cobaUlang">Ulangi</button></div></div>
    <h3 class="mt5 mb3">Contoh pembahasan lengkap</h3>
    ${soalHTML(contoh, { pilih: c.jawab[contoh.id], tampilKunci: true, terjemah: true })}
    <div class="mt4">${trikHTML(contoh)}</div>
    <div class="band-coba mt5"><div><h3>Mau semua soal dibahas seperti ini?</h3><p class="small muted">13 paket soal + 模擬試験 + kelas Zoom.</p></div><button class="btn btn-primary" data-act="ke" data-to="paket">Lihat Paket</button></div></div>`;
};
FORM.coba = (f, d) => kunciTombol(f, async () => {
  if (!d.nama || d.nama.trim().length < 2) return errField(f, 'nama', 'Nama wajib diisi');
  if (!/^(\+?62|0)8\d{7,12}$/.test(String(d.no_wa).replace(/[\s-]/g, ''))) return errField(f, 'no_wa', 'Nomor WA tidak valid. Contoh: 08123456789');
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) return errField(f, 'email', 'Format email tidak valid');
  errField(f);
  try {
    const r = await API.call('p.coba.mulai', d);
    if (!r.soal.length) return toast('Soal gratis belum tersedia.', 'warn');
    S.coba = { step: 'quiz', lead_id: r.lead_id, soal: r.soal, idx: 0, jawab: {}, terjemah: false };
    render(true);
  } catch (e) { toast(e.message, 'err'); }
});
ACT.cobaNav = el => { S.coba.idx = Math.max(0, Math.min(S.coba.soal.length - 1, S.coba.idx + num(el.dataset.d))); render(true); };
ACT.cobaSelesai = async () => {
  const c = S.coba, belum = c.soal.length - Object.keys(c.jawab).length;
  if (belum && !await confirmBox(`Masih ada ${belum} soal belum dijawab. Selesaikan sekarang?`, 'Selesai')) return;
  c.step = 'hasil'; render(true);
  API.call('p.coba.hasil', { lead_id: c.lead_id, jawaban: c.jawab }, { silent: true }).catch(() => { });
};
ACT.cobaUlang = () => { S.coba = { step: 'form' }; render(true); };

/* ---------- Daftar ---------- */
R.daftar = p => {
  S.ui.title = 'Daftar';
  if (!S.pub) return '<div class="auth"><div class="sk" style="height:400px;width:100%;max-width:520px"></div></div>';
  if (S.daftarOk) { const d = S.daftarOk; return `<div class="auth"><div class="card center" style="max-width:520px">${stamp('lg')}<h2 class="mt4">Pendaftaran tersimpan!</h2>
      <p class="mt2">Langkah terakhir: bayar paket <b>${esc(d.paket)}</b> lewat Lynk.id.</p>
      <div class="card mt4" style="background:var(--c-pale);box-shadow:none;text-align:left"><b>⚠️ Penting:</b> saat membayar, pakai <b>email yang sama</b>: <span class="bold" style="color:var(--c-primary-2)">${esc(d.email)}</span>. Setelah bayar, akun aktif otomatis & kamu menerima WhatsApp.</div>
      <a class="btn btn-red btn-block mt4" href="${esc(d.link_bayar)}" target="_blank" rel="noopener">${ic('payments')} Bayar di Lynk.id</a>
      <button class="btn btn-light btn-block mt2" data-go="masuk">Sudah bayar? Masuk</button></div></div>`; }
  const pk = S.pub.paket, sel = p.id || (pk[1] || pk[0] || {}).id;
  return `<div class="auth"><div class="card" style="max-width:560px"><h2>Daftar Kelas</h2><p class="muted small mt1">Isi data diri, lalu bayar lewat Lynk.id.</p>
    <form data-form="daftar" class="mt4" novalidate><input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <div class="lbl mb2">Pilih paket</div><div class="col gap2 mb4">${pk.map(x => `<label class="card tap row" style="box-shadow:inset 0 0 0 2px ${x.id === sel ? 'var(--c-primary-2)' : 'var(--c-line)'};padding:12px"><input type="radio" name="paket_id" value="${esc(x.id)}" ${x.id === sel ? 'checked' : ''} data-act="pilihPaket" style="accent-color:var(--c-primary);width:20px;height:20px"><div class="f1"><b>${esc(x.nama)}</b><div class="tiny muted">${esc(x.deskripsi)}</div></div><b class="nowrap">${rp(x.promo ? x.promo.harga : x.harga)}</b></label>`).join('')}</div>
      <div class="fld"><label for="dNama">Nama lengkap</label><input id="dNama" class="inp" name="nama" required autocomplete="name"></div>
      <div class="fld"><label for="dEm">Email</label><input id="dEm" class="inp" name="email" type="email" required autocomplete="email"><span class="hint">Pakai email ini juga saat membayar di Lynk.id.</span></div>
      <div class="fld"><label for="dWa">Nomor WhatsApp</label><input id="dWa" class="inp" name="no_wa" required inputmode="tel" autocomplete="tel" placeholder="08xxxxxxxxxx"></div>
      <div class="fld"><label for="dPw">Buat sandi</label><input id="dPw" class="inp" name="sandi" type="password" required minlength="8" autocomplete="new-password" placeholder="Minimal 8 karakter"></div>
      <div class="fld"><label for="dSt">Tinggal di</label><select id="dSt" class="inp" name="status_tinggal"><option>di Indonesia</option><option>di Jepang</option></select></div>
      <label class="chk mb2"><input type="checkbox" name="setuju" required><span>Saya setuju dengan <a href="javascript:void(0)" data-go="legal" data-id="syarat">Syarat & Ketentuan</a> dan <a href="javascript:void(0)" data-go="legal" data-id="privasi">Kebijakan Privasi</a></span></label>
      <label class="chk mb4"><input type="checkbox" name="setuju_wa"><span>Saya bersedia menerima info & promo lewat WhatsApp</span></label>
      <button class="btn btn-primary btn-block" type="submit">Daftar & Lanjut Bayar</button>
      <p class="small center mt3">Sudah punya akun? <a href="javascript:void(0)" data-go="masuk">Masuk</a></p></form></div></div>`;
};
ACT.pilihPaket = el => { $$('label.card', el.closest('form')).forEach(l => l.style.boxShadow = 'inset 0 0 0 2px ' + (l.contains(el) ? 'var(--c-primary-2)' : 'var(--c-line)')); };
FORM.daftar = (f, d) => kunciTombol(f, async () => {
  if (!d.paket_id) return toast('Pilih paket dulu', 'warn');
  if (!d.nama || d.nama.trim().length < 2) return errField(f, 'nama', 'Nama wajib diisi');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email || '')) return errField(f, 'email', 'Format email tidak valid');
  if (!/^(\+?62|0)8\d{7,12}$/.test(String(d.no_wa).replace(/[\s-]/g, ''))) return errField(f, 'no_wa', 'Nomor WA harus diawali 08 atau 62');
  if (String(d.sandi || '').length < 8) return errField(f, 'sandi', 'Sandi minimal 8 karakter');
  if (!d.setuju) return toast('Centang persetujuan Syarat & Ketentuan dulu ya', 'warn');
  errField(f);
  try { const r = await API.call('p.daftar', d); S.daftarOk = r; LS.set('gp_daftar', r); render(true); }
  catch (e) { if (e.code === 'EMAIL_ADA') { toast(e.message, 'warn'); go('masuk'); } else toast(e.message, 'err'); }
});

/* ---------- Masuk member ---------- */
R.masuk = () => {
  S.ui.title = 'Masuk';
  return `<div class="auth"><div class="card"><div class="center"><div style="display:flex;justify-content:center">${logoMark(56)}</div><h2 class="mt3">Masuk Member</h2><p class="small muted">Lanjutkan belajarmu menuju 合格</p></div>
    <form data-form="masuk" class="mt4" novalidate>
      <div class="fld"><label for="mEm">Email</label><input id="mEm" class="inp" name="email" type="email" required autocomplete="email" value="${esc(LS.get('gp_last_email', ''))}"></div>
      <div class="fld"><label for="mPw">Sandi</label><div style="position:relative"><input id="mPw" class="inp" name="sandi" type="password" required autocomplete="current-password" style="padding-right:48px"><button type="button" class="btn-ico sm" style="position:absolute;right:4px;top:5px" data-act="lihatSandi" aria-label="Lihat sandi">${ic('visibility')}</button></div></div>
      <button class="btn btn-primary btn-block" type="submit">Masuk</button>
      <div class="row-b mt3 small"><a href="javascript:void(0)" data-go="lupa">Lupa sandi?</a><a href="javascript:void(0)" data-go="daftar">Daftar baru</a></div></form>
    <p class="tiny muted center mt4">Satu akun bisa dipakai di maksimal 2 perangkat.</p>
    <div class="center mt3"><a href="javascript:void(0)" class="btn btn-ghost btn-sm" data-go="admin">${ic('admin_panel_settings')} Masuk sebagai Admin</a></div></div></div>`;
};
ACT.lihatSandi = el => { const i = el.parentElement.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; el.innerHTML = ic(i.type === 'password' ? 'visibility' : 'visibility_off'); };
FORM.masuk = (f, d) => kunciTombol(f, async () => {
  if (!d.email || !d.sandi) return toast('Isi email dan sandi', 'warn');
  try {
    const r = await API.call('p.login', { email: d.email, sandi: d.sandi, device_id: deviceId(), nama_perangkat: deviceName() });
    S.auth = { token: r.token, role: 'member', email: r.member.email, nama: r.member.nama }; LS.set('gp_auth', S.auth); LS.set('gp_last_email', r.member.email);
    S.boot = LS.get('gp_boot_' + r.member.email);
    await muatBoot(!!S.boot);
    go('m/beranda', {}, { replace: true });
  } catch (e) {
    if (e.code === 'MAKS_PERANGKAT') { const wa = S.pub && S.pub.brand.wa; modal(`<p>${esc(e.message)}</p>${wa ? `<a class="btn btn-ok btn-block mt4" target="_blank" rel="noopener" href="${waLink(wa, 'Halo admin, mohon reset perangkat akun saya: ' + d.email)}">${WA_SVG.replace('<svg', '<svg width="20" height="20"')} Hubungi Admin</a>` : ''}`, { title: 'Batas 2 perangkat' }); }
    else toast(e.message, 'err', 4500);
  }
});

/* ---------- Lupa sandi ---------- */
R.lupa = () => {
  S.ui.title = 'Lupa Sandi';
  const st = S.ui.lupa || {};
  return `<div class="auth"><div class="card"><h2>Lupa Sandi</h2><p class="small muted mt1">${st.email ? 'Masukkan kode 6 digit dari WhatsApp dan sandi baru.' : 'Kami kirim kode 6 digit ke WhatsApp yang terdaftar.'}</p>
    ${st.email ? `<form data-form="lupaReset" class="mt4"><input type="hidden" name="email" value="${esc(st.email)}">
      <div class="fld"><label for="lK">Kode 6 digit</label><input id="lK" class="inp" name="kode" inputmode="numeric" maxlength="6" required autocomplete="one-time-code" style="letter-spacing:.4em;font-size:22px;text-align:center"></div>
      <div class="fld"><label for="lP">Sandi baru</label><input id="lP" class="inp" name="sandi" type="password" minlength="8" required autocomplete="new-password"></div>
      <button class="btn btn-primary btn-block" type="submit">Simpan Sandi Baru</button><button type="button" class="btn btn-ghost btn-block mt2" data-act="lupaUlang">Kirim ulang kode</button></form>`
      : `<form data-form="lupaKirim" class="mt4"><div class="fld"><label for="lE">Email akun</label><input id="lE" class="inp" name="email" type="email" required autocomplete="email"></div><button class="btn btn-primary btn-block" type="submit">Kirim Kode</button></form>`}
    <p class="small center mt3"><a href="javascript:void(0)" data-go="masuk">Kembali ke Masuk</a></p></div></div>`;
};
FORM.lupaKirim = (f, d) => kunciTombol(f, async () => { try { const r = await API.call('p.lupa.kirim', d); S.ui.lupa = { email: d.email }; toast(r.pesan, 'ok', 5000); render(); } catch (e) { toast(e.message, 'err'); } });
FORM.lupaReset = (f, d) => kunciTombol(f, async () => { try { const r = await API.call('p.lupa.reset', d); S.ui.lupa = null; toast(r.pesan); go('masuk', {}, { replace: true }); } catch (e) { toast(e.message, 'err'); } });
ACT.lupaUlang = () => { S.ui.lupa = null; render(); };

/* ---------- Halaman legal ---------- */
R.legal = p => {
  const id = p.id || 'syarat', d = (S.ui.legal || {})[id] || LS.get('gp_legal_' + id);
  S.ui.title = d ? d.judul : 'Legal';
  if (!d) { API.call('p.legal', { id }).then(x => { S.ui.legal = Object.assign(S.ui.legal || {}, { [id]: x }); LS.set('gp_legal_' + id, x); rerender('legal'); }).catch(e => toast(e.message, 'err')); return '<div class="wrapx mt5"><div class="sk" style="height:400px"></div></div>'; }
  if (!(S.ui.legal || {})[id]) API.call('p.legal', { id }, { silent: true }).then(x => { S.ui.legal = Object.assign(S.ui.legal || {}, { [id]: x }); LS.set('gp_legal_' + id, x); if (JSON.stringify(x) !== JSON.stringify(d)) rerender('legal'); }).catch(() => { });
  return `<div class="wrapx" style="max-width:820px;padding-top:24px;padding-bottom:24px"><button class="link mb3" data-act="back">${ic('arrow_back')} Kembali</button>
    <div class="card card-lg"><h1 style="font-size:28px">${esc(d.judul)}</h1><p class="tiny muted mt1">Versi ${esc(d.versi)} · diperbarui ${fTgl(d.diperbarui)}</p><div class="mt4" style="line-height:1.75">${md(d.isi)}</div></div></div>`;
};

/* ---------- Login admin ---------- */
R.admin = () => {
  S.ui.title = 'Admin';
  return `<div class="auth"><div class="card"><div class="row">${logoMark(44)}<div><h2 style="font-size:20px">Dashboard Admin</h2><p class="tiny muted">Khusus pengelola Goukaku Pedia ID</p></div></div>
    <form data-form="adminLogin" class="mt4"><div class="fld"><label for="aE">Email admin</label><input id="aE" class="inp" name="email" type="text" inputmode="email" autocapitalize="off" spellcheck="false" required autocomplete="username"></div>
    <div class="fld"><label for="aP">Sandi</label><input id="aP" class="inp" name="sandi" type="password" required autocomplete="current-password"></div>
    <button class="btn btn-primary btn-block" type="submit">Masuk Dashboard</button></form>
    <div class="center mt3"><a href="javascript:void(0)" class="small" data-go="masuk">Bukan admin? Masuk sebagai member</a></div></div></div>`;
};
FORM.adminLogin = (f, d) => kunciTombol(f, async () => {
  try {
    const r = await API.call('p.admin.login', Object.assign(d, { device_id: deviceId() }));
    S.auth = { token: r.token, role: r.role, email: r.email, nama: r.nama }; LS.set('gp_auth', S.auth);
    await muatAdmin(); go('a/ringkasan', {}, { replace: true });
  } catch (e) { toast(e.message, 'err'); }
});

R.notfound = () => `<div class="auth"><div class="card center empty">${ic('travel_explore')}<h3>Halaman tidak ditemukan</h3><button class="btn btn-primary mt4" data-go="home">Ke Beranda</button></div></div>`;

/* ---------- PWA: tombol pasang aplikasi ---------- */
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installEvt = e; });
ACT.pasangApp = async () => {
  if (S.installEvt) { S.installEvt.prompt(); const r = await S.installEvt.userChoice; if (r.outcome === 'accepted') toast('Aplikasi dipasang \uD83C\uDF89'); S.installEvt = null; render(); return; }
  modal(`<p>Untuk memasang di <b>iPhone</b>: buka di Safari → tombol <b>Bagikan</b> ${ic('ios_share')} → <b>Tambah ke Layar Utama</b>.</p><p class="mt2">Untuk <b>Android</b>: buka di Chrome → menu ⋮ → <b>Instal aplikasi</b>.</p>`, { title: 'Pasang di HP' });
};
/* ============================================================================
 * AREA MEMBER: shell (sidebar desktop + bottom-nav HP), bootstrap komposit,
 * Beranda (countdown + target minggu ini), Belajar (Alur, Materi PDF, Gambar,
 * Kosakata + Flashcard), Zoom, Profil, pengumuman, sambutan, laporkan.
 * ========================================================================== */
const MNAV = [['m/beranda', 'home', 'Beranda'], ['m/belajar', 'auto_stories', 'Belajar'], ['m/soal', 'assignment', 'Soal'], ['m/zoom', 'videocam', 'Zoom'], ['m/riwayat', 'analytics', 'Riwayat'], ['m/profil', 'person', 'Profil']];
const MNAV_ROOT = { 'm/kartu': 'm/belajar', 'm/kuis': 'm/soal', 'm/hasil': 'm/soal' };

function shellMember(route, body) {
  const B = S.boot, nama = (S.auth && S.auth.nama) || '';
  const aktif = MNAV_ROOT[route] || route, unread = B ? B.pengumuman.filter(p => !S.read[p.id]).length : 0;
  const jad = B && B.jadwal, judul = MNAV.find(x => x[0] === aktif);
  const fokus = route === 'm/kuis';
  return `${B && B.profil.pratinjau ? `<div class="preview-bar">Mode pratinjau admin — data tidak disimpan. <a href="javascript:void(0)" data-go="a/ringkasan" style="color:#3d2c06;text-decoration:underline">Kembali ke dashboard</a></div>` : ''}
  <div class="app">
  <aside class="side" aria-label="Navigasi utama"><div>${logo()}
    <nav>${MNAV.map(n => `<button class="${aktif === n[0] ? 'on' : ''}" data-go="${n[0]}" ${aktif === n[0] ? 'aria-current="page"' : ''}>${ic(n[1])}<span>${n[2]}</span></button>`).join('')}</nav></div>
    <div class="col gap2">${jad ? `<div class="row-b" style="background:var(--c-s1);border-radius:10px;padding:10px 12px"><span class="row small muted">${ic('verified')}Target Ujian</span><b class="small" style="color:var(--c-red)">第${esc(jad.ujian_ke)}回</b></div>` : ''}
    <button class="sbtn" style="color:var(--c-bad)" data-act="keluar">${ic('logout')}<span>Keluar</span></button></div></aside>
  <header class="topbar"><div class="topbar-in">
    ${route === 'm/beranda' ? `<div class="only-m">${logoMark(38)}</div><div class="f1"><b style="font-family:var(--f-head);color:var(--c-head)">Halo, ${esc(nama.split(' ')[0] || 'Kamu')} \uD83D\uDC4B</b><div class="tiny muted">${jad ? esc(jad.nama) : 'Teman Belajar Kamu'}</div></div>`
      : `${['m/kuis', 'm/hasil', 'm/kartu'].indexOf(route) > -1 || !judul ? `<button class="btn-ico" data-act="back" aria-label="Kembali">${ic('arrow_back')}</button>` : ''}<h1 class="tt f1 trunc">${esc(S.ui.title || (judul ? judul[2] : ''))}</h1>`}
    <span id="syncDot" class="sync-dot" title="Tersinkron"></span>
    <button class="btn-ico" data-act="tema" aria-label="Ganti tema">${ic(document.documentElement.dataset.theme === 'dark' ? 'light_mode' : 'dark_mode')}</button>
    <button class="btn-ico" style="position:relative" data-act="bukaNotif" aria-label="Pengumuman">${ic('notifications')}${unread ? `<span class="bell-dot">${unread}</span>` : ''}</button>
    <button class="btn-ico only-d" data-go="m/profil" aria-label="Profil"><div class="av" style="width:32px;height:32px">${esc((nama[0] || '?').toUpperCase())}</div></button>
  </div></header>
  <main class="main"><div class="main-in fadein">${B ? body : skeletonMember()}</div></main>
  ${fokus ? '' : `<nav class="bnav" aria-label="Navigasi bawah">${MNAV.filter(n => n[0] !== 'm/riwayat').map(n => `<button class="${aktif === n[0] ? 'on' : ''}" data-go="${n[0]}">${ic(n[1], aktif === n[0] ? 'fill' : '')}<span>${n[2]}</span></button>`).join('')}</nav>`}
  </div>`;
}
const skeletonMember = () => `<div class="sk" style="height:220px"></div><div class="grid g4"><div class="sk" style="height:110px"></div><div class="sk" style="height:110px"></div><div class="sk" style="height:110px"></div><div class="sk" style="height:110px"></div></div><div class="sk" style="height:180px"></div>`;

/* ---------- Bootstrap: 1 panggilan = seluruh data member ---------- */
async function muatBoot(silent = false) {
  try {
    const d = await API.call('m.bootstrap', {}, { silent });
    const lama = S.boot ? JSON.stringify(S.boot) : '';
    S.boot = d; S.bootAt = Date.now(); recalcLocal();
    if (S.auth) { S.auth.nama = d.profil.nama; LS.set('gp_auth', S.auth); if (!d.profil.pratinjau) LS.set('gp_boot_' + S.auth.email, d); }
    if (lama !== JSON.stringify(S.boot) && S.route.startsWith('m/') && S.route !== 'm/kuis') render(false);
    cekSambutan();
    idle(prefetchSoal);
  } catch (e) {
    if (e.code === 'BERAKHIR' || e.code === 'BELUM_AKTIF') {
      const em = S.auth && S.auth.email; S.auth = null; LS.del('gp_auth'); if (em) LS.del('gp_boot_' + em);
      go('masuk', {}, { replace: true, force: true });
      modal(`<p>${esc(e.message)}</p><button class="btn btn-primary btn-block mt4" data-go="home" onclick="closeModal()">Lihat Paket</button>`, { title: 'Akses belum tersedia' });
    } else if (!silent || !S.boot) toast(e.message, 'err');
  }
}
/* Hitung ulang status alur & target di HP (instan, tanpa menunggu server) */
function recalcLocal() {
  const B = S.boot; if (!B) return;
  const mat = {}, pk = {}, zm = {}; B.materi.forEach(m => { if (m.selesai) mat[m.id] = 1; }); B.hasil.forEach(h => pk[h.paket_soal_id] = 1); B.zoom.forEach(z => { if (z.ditonton || z.hadir) zm[z.id] = 1; });
  let tot = 0, dn = 0;
  B.alur.forEach(a => {
    let d = a.selesai;
    if (!d) {
      if (a.tipe_item === 'materi' || a.tipe_item === 'gambar') d = !!mat[a.item_id];
      else if (a.tipe_item === 'paket_soal') d = String(a.item_id).split(',').some(x => pk[x.trim()]);
      else if (a.tipe_item === 'zoom') d = !!zm[a.item_id];
      else if (a.tipe_item === 'kosakata') { const ks = B.kosakata.filter(k => !a.item_id || a.item_id === 'semua' || k.kamoku === a.item_id); d = ks.length > 0 && ks.filter(k => B.kosakata_status[k.id] === 'hafal').length / ks.length >= .8; }
    }
    a.selesai = d; tot += a.bobot; if (d) dn += a.bobot;
  });
  const t = B.target; if (t && t.ada) {
    const peta = {}; B.alur.forEach(a => peta[a.id] = a);
    (t.target || []).forEach(x => { if (peta[x.id]) x.selesai = peta[x.id].selesai; });
    t.progres = tot ? Math.round(dn / tot * 100) : 0; t.langkah_selesai = B.alur.filter(a => a.selesai).length;
  }
}
function langkahBerikut() { const B = S.boot; return B ? B.alur.find(a => !a.selesai) : null; }
/* Buka item yang ditautkan sebuah langkah/target */
function bukaItem(tipe, id) {
  if (tipe === 'materi' || tipe === 'gambar') return ACT.bukaMateri({ dataset: { id } });
  if (tipe === 'kosakata') { S.ui.kamoku = id && id !== 'semua' ? id : ''; return go('m/belajar', { tab: 'kosakata' }); }
  if (tipe === 'paket_soal') { const p = S.boot.paket_soal.find(x => x.id === String(id).split(',')[0].trim()); return p ? mulaiPaket(p.id, p.jenis === '模擬試験' ? 'ujian' : 'latihan') : go('m/soal'); }
  if (tipe === 'zoom') return go('m/zoom');
  if (tipe === 'mogi') { const p = S.boot.paket_soal.find(x => x.jenis === '模擬試験' && x.terbuka); return p ? mulaiPaket(p.id, 'ujian') : go('m/soal'); }
  if (tipe === 'ulang_salah') return ACT.ulangSalah();
  go('m/belajar', { tab: 'alur' });
}
ACT.bukaItem = el => bukaItem(el.dataset.tipe, el.dataset.id);
ACT.lanjut = () => { const l = langkahBerikut(); if (l) bukaItem(l.tipe_item, l.item_id); else go('m/soal'); };

/* ---------- BERANDA ---------- */
R['m/beranda'] = () => {
  S.ui.title = 'Beranda';
  const B = S.boot; if (!B) return '';
  const T = B.target, nxt = langkahBerikut(), ps = B.paket_soal;
  const mogi = B.hasil.filter(h => h.jenis === '模擬試験').slice(-1)[0];
  const dik = ps.filter(p => p.dikerjakan).length, st = streak();
  const tDone = T.ada ? (T.target || []).filter(x => x.selesai).length : 0, tTot = T.ada ? (T.target || []).length : 0;
  const stOk = T.status && (T.status.kode === 'sesuai' || T.status.kode === 'cepat' || T.status.kode === 'akhir');
  const pin = B.pengumuman.filter(p => p.sematkan);
  const zNext = B.zoom.find(z => z.status !== 'selesai' && toDate(z.mulai) && toDate(z.mulai).getTime() + z.durasi * 60000 > Date.now());
  // kartu countdown + target minggu ini (US-17a)
  const cd = `<section class="cd-card" style="order:1" aria-label="Hitung mundur ujian"><div class="glow"></div><div style="position:relative">
    <div class="row-b"><div><div class="tiny" style="color:var(--c-pale);font-weight:800;letter-spacing:.08em;text-transform:uppercase">Target Ujian Nasional</div><div style="font-family:var(--f-head);font-weight:700">${B.jadwal ? esc(B.jadwal.nama) : '介護福祉士'}</div></div>
      ${T.ada && T.status ? `<span class="st-pill ${stOk ? 'ok' : 'warn'}">${esc({ sesuai: 'Sesuai jadwal \uD83D\uDC4D', cepat: 'Lebih cepat \uD83D\uDE80', tertinggal: 'Tertinggal ' + (T.status.kurang || '') + ' langkah', akhir: 'Minggu terakhir \uD83D\uDD25', selesai: 'Selesai' }[T.status.kode] || T.status.teks)}</span>` : ''}</div>
    ${T.ada ? `<div class="row-b mt3"><div class="row" style="align-items:baseline"><span class="cd-num">${T.sisa_hari}</span><div><div style="font-weight:800;color:var(--c-pale);font-size:13px;text-transform:uppercase">hari lagi</div><div class="tiny jp" style="opacity:.8">menuju ujian 介護福祉士 · ${fTgl(T.tanggal)}</div></div></div>${stamp()}</div>
      <p class="small mt2" style="opacity:.9">${esc(T.pesan)}</p>
      <div class="cd-in"><div class="row-b mb2"><b class="row small">${ic('task_alt')} Target Minggu Ini</b><div class="row">${ring(pct(tDone, tTot), 34, 4, `<span style="font-size:10px;color:#75D2FB">${tDone}/${tTot}</span>`, '#75D2FB', 'rgba(255,255,255,.2)')}<span class="tiny" style="color:var(--c-pale)">${pct(tDone, tTot)}% beres</span></div></div>
        <div class="col gap1">${(T.target || []).map(x => `<button class="tgt ${x.selesai ? 'done' : ''}" data-act="bukaItem" data-tipe="${esc(x.tipe_item)}" data-id="${esc(x.item_id)}">${ic(x.selesai ? 'check_circle' : 'radio_button_unchecked', x.selesai ? 'fill' : '')}<span class="t f1 small">${furi(x.judul)}</span>${ic('chevron_right')}</button>`).join('') || `<div class="small" style="opacity:.85">\uD83C\uDF89 Semua langkah selesai! Lanjutkan 模擬試験 dan ulangi soal yang salah.</div>`}</div>
        ${T.status && T.status.kode === 'tertinggal' ? `<div class="tiny mt2" style="color:#FDE68A;font-weight:700">${esc(T.status.teks)}</div>` : ''}<div class="row-b mt3 tiny" style="color:var(--c-pale)"><span>Progres Alur Belajar</span><b>${T.progres}%</b></div><div class="bar mt1" style="background:rgba(255,255,255,.2)"><i style="width:${T.progres}%;background:#75D2FB"></i></div></div>`
      : `<p class="mt3">${esc(T.pesan || 'Tanggal ujian akan diumumkan.')}</p>`}</div></section>`;
  const welcome = `<section class="welcome" style="order:2"><div class="f1"><div class="tiny" style="color:var(--c-pale);font-weight:800;letter-spacing:.06em;text-transform:uppercase">Semangat Belajar</div>
      <h3 style="color:#fff" class="mt1">Asah Kemampuan Ujian ${furi('｜介護福祉士《かいごふくしし》')}</h3><p class="small mt1" style="opacity:.9">${nxt ? 'Langkah berikutnya: ' + furi(nxt.judul) : 'Semua langkah Alur Belajar selesai \uD83C\uDF89'}</p></div>
    <button class="btn btn-white" data-act="lanjut">Lanjut ${ic('play_arrow', 'fill')}</button></section>`;
  const stats = `<section style="order:3"><div class="row-b mb2"><h3>Capaian Belajar</h3><span class="tiny muted">Diperbarui otomatis</span></div><div class="mstat">
    <div class="card">${ring(T.ada ? T.progres : pct(B.alur.filter(a => a.selesai).length, B.alur.length), 52, 5, `<span style="font-size:12px">${B.alur.filter(a => a.selesai).length}/${B.alur.length}</span>`)}<b class="mt1">Langkah</b><span class="tiny muted">Alur selesai</span></div>
    <div class="card">${ring(pct(dik, ps.length), 52, 5, `<span style="font-size:12px">${dik}/${ps.length}</span>`, 'var(--c-sky)')}<b class="mt1">Paket Soal</b><span class="tiny muted">Dikerjakan</span></div>
    <div class="card">${ring(mogi ? pct(mogi.skor, mogi.total) : 0, 52, 5, `<span style="font-size:12px">${mogi ? pct(mogi.skor, mogi.total) + '%' : '–'}</span>`, mogi && pct(mogi.skor, mogi.total) >= B.garis_aman ? 'var(--c-ok)' : 'var(--c-amber)')}<b class="mt1">模擬試験</b><span class="tiny muted">Nilai terakhir</span></div>
    <div class="card"><div class="ring" style="width:52px;height:52px;border-radius:50%;background:#FFDAD6;font-size:24px">\uD83D\uDD25</div><b class="mt1" style="color:var(--c-red)">${st} Hari</b><span class="tiny muted">Daily streak</span></div></div></section>`;
  const peng = pin.length ? `<section style="order:4" class="col gap2">${pin.map(p => `<div class="card row" style="border-left:4px solid var(--c-red);cursor:pointer" data-act="bukaPeng" data-id="${esc(p.id)}">${ic('campaign', 'fill')}<div class="f1"><b class="small">${esc(p.judul)}</b><div class="tiny muted trunc">${esc(p.isi)}</div></div>${ic('chevron_right')}</div>`).join('')}</section>` : '';
  const kel = {}; B.materi.forEach(m => { (kel[m.kamoku] = kel[m.kamoku] || []).push(m); });
  const materi = `<section style="order:5"><div class="row-b mb2"><h3 class="sec-title">Materi Saya</h3><button class="link small" data-go="m/belajar" data-tab="materi">Semua (${B.materi.length})</button></div>
    <div class="grid g3">${Object.keys(kel).slice(0, 3).map((k, i) => { const l = kel[k], d = l.filter(m => m.selesai).length, p = pct(d, l.length); return `<div class="card hov col gap2"><div class="row-b"><span class="chip pale">科目 ${String(B.kamoku.indexOf(k) + 1).padStart(2, '0')}</span><span class="tiny muted">${l.length} materi</span></div>
      <b class="jp" style="font-size:17px">${furi(KANA[k] ? '｜' + k + '《' + KANA[k] + '》' : k)}</b><p class="tiny muted trunc">${esc(l[0].judul)}</p>
      <div class="row-b tiny"><span class="muted">Progres</span><b style="color:var(--c-primary-2)">${p}%</b></div><div class="bar"><i style="width:${p}%"></i></div>
      <div class="row-b mt1"><span class="row tiny muted"><span class="av" style="width:24px;height:24px;font-size:10px;background:var(--c-s2);color:var(--c-primary)">ZS</span>Zainal Sensei</span><button class="play" data-act="bukaMateri" data-id="${esc((l.find(m => !m.selesai) || l[0]).id)}" aria-label="Buka materi">${ic('play_arrow', 'fill')}</button></div></div>`; }).join('') || '<div class="card empty">Belum ada materi.</div>'}</div></section>`;
  const rek = rekomPaket();
  const paket = `<section style="order:6"><div class="row-b mb2"><h3 class="sec-title">${ps.length} Paket Soal</h3><button class="link small" data-go="m/soal">Lihat semua ${ic('arrow_forward')}</button></div>
    <div class="col gap2">${rek.map(p => paketRow(p)).join('')}</div></section>`;
  const zoom = `<section style="order:7" class="card col gap3"><div class="row-b"><span class="row tiny" style="color:var(--c-red);font-weight:800;letter-spacing:.06em">● LIVE BEDAH SOAL</span>${zNext ? `<span class="chip pale">${fTgl(zNext.mulai)}</span>` : ''}</div>
    ${zNext ? `<div class="row"><div class="kbox" style="border-radius:50%">${ic('video_camera_front')}</div><div class="f1"><b>${furi(zNext.judul)}</b><div class="tiny muted">${fWaktu(zNext.mulai)} · ${esc(zNext.pengajar)}</div></div></div>
      ${zoomTombol(zNext)}` : `<p class="small muted">Belum ada jadwal kelas berikutnya. Tonton rekaman kelas sebelumnya.</p><button class="btn btn-light btn-sm" data-go="m/zoom" data-tab="rekaman">${ic('smart_display')} Rekaman</button>`}</section>`;
  // aktivitas 7 hari
  const hari = []; for (let i = 6; i >= 0; i--) { const d = new Date(hariJST() - i * 86400000); hari.push({ k: d.toISOString().slice(0, 10), l: HARI[d.getUTCDay()] }); }
  B.hasil.forEach(h => { const d = toDate(h.selesai); if (d) { const k = new Date(hariJST(d)).toISOString().slice(0, 10); const x = hari.find(z => z.k === k); if (x) x.h = (x.h || 0) + 1; } });
  const val = hari.map(x => (S.act[x.k] || 0) + (x.h || 0) * 3), mx = Math.max(1, ...val), tot = val.reduce((a, b) => a + b, 0);
  const akt = `<section style="order:8" class="card"><div class="row-b"><h3 class="row">${ic('bar_chart')} Aktivitas 7 Hari</h3><span class="chip pale">${tot} aktivitas</span></div>
    <div class="chart-bars">${hari.map((x, i) => `<div class="b"><i class="${val[i] === mx && mx > 0 ? 'hi' : ''}" style="height:${Math.max(6, val[i] / mx * 100)}%">${val[i] === mx && val[i] ? `<span>${val[i]}</span>` : ''}</i><small>${x.l}</small></div>`).join('')}</div>
    <div class="row small mt3" style="background:var(--c-s1);border-radius:10px;padding:8px 10px">${ic('verified', '')}<span>${st ? `Streak <b>${st} hari</b> berturut-turut! Pertahankan \uD83D\uDCAA` : 'Mulai belajar hari ini untuk memulai streak \uD83D\uDD25'}</span></div></section>`;
  return `<div class="dash"><div class="col gap4 colL">${welcome}${stats}${materi}${paket}</div><div class="col gap4 colR">${cd}${peng}${zoom}${akt}</div></div>`;
};
/* Susunan beranda HP: urutan kartu mengikuti PRD (countdown paling atas) */
(() => { const s = document.createElement('style'); s.textContent = '@media(max-width:1023px){.dash{display:flex;flex-direction:column}.dash .colL,.dash .colR{display:contents}}'; document.head.appendChild(s); })();
const KANA = { '介護の基本': 'かいごのきほん', '認知症の理解': 'にんちしょうのりかい', '障害の理解': 'しょうがいのりかい', '生活支援技術': 'せいかつしえんぎじゅつ', '人間の尊厳と自立': 'にんげんのそんげんとじりつ', 'こころとからだのしくみ': '', '社会の理解': 'しゃかいのりかい', '医療的ケア': 'いりょうてきケア', '介護過程': 'かいごかてい', '発達と老化の理解': 'はったつとろうかのりかい', 'コミュニケーション技術': 'コミュニケーションぎじゅつ', '人間関係とコミュニケーション': 'にんげんかんけいとコミュニケーション', '総合問題': 'そうごうもんだい' };
function rekomPaket() {
  const B = S.boot, ps = B.paket_soal, out = [];
  const tgt = (B.target.target || []).find(x => x.tipe_item === 'paket_soal' && !x.selesai); if (tgt) { const p = ps.find(x => x.id === tgt.item_id); if (p) out.push(p); }
  ['過去問', '練習', '模擬試験'].forEach(j => { if (out.length < 3) { const p = ps.find(x => x.jenis === j && out.indexOf(x) < 0 && !x.dikerjakan) || ps.find(x => x.jenis === j && out.indexOf(x) < 0); if (p) out.push(p); } });
  return out.slice(0, 3);
}
function paketRow(p) {
  const k = p.jenis === '過去問' ? '過去' : p.jenis === '模擬試験' ? '模擬' : '練習';
  return `<div class="card list-card"><div class="kbox ${p.jenis === '模擬試験' ? 'red' : ''}">${k}</div><div class="f1"><b class="trunc" style="display:block">${furi(p.nama)}</b>
    <div class="tiny ${p.terbaik !== null ? '' : 'muted'}" style="${p.terbaik !== null ? 'color:var(--c-ok);font-weight:700' : ''}">${p.terbaik !== null ? 'Nilai terbaik: ' + p.terbaik + '%' : p.jumlah + ' soal' + (p.jenis === '模擬試験' ? ' · ' + p.durasi + ' menit' : '')}</div></div>
    <button class="btn ${p.dikerjakan ? 'btn-light' : p.jenis === '模擬試験' ? 'btn-red' : 'btn-primary'} btn-sm" data-act="mulai" data-id="${esc(p.id)}" data-mode="${p.jenis === '模擬試験' ? 'ujian' : 'latihan'}" ${p.terbuka ? '' : 'disabled'}>${p.dikerjakan ? 'Ulangi' : p.jenis === '模擬試験' ? 'Uji Coba' : 'Mulai'}</button></div>`;
}

/* ---------- Pengumuman (lonceng) ---------- */
ACT.bukaNotif = () => {
  const B = S.boot; if (!B) return;
  const d = document.createElement('div'); d.className = 'ovl'; d.id = 'drw'; d.style.alignItems = 'stretch';
  d.innerHTML = `<div class="drawer"><div class="row-b" style="padding:16px;padding-top:calc(16px + env(safe-area-inset-top))"><h3>Pengumuman</h3><button class="btn-ico" data-act="tutupDrawer" aria-label="Tutup">${ic('close')}</button></div>
    <div style="overflow:auto;padding:0 16px 24px" class="col gap2">${B.pengumuman.map(p => `<div class="card" ${S.read[p.id] ? '' : 'style="box-shadow:inset 4px 0 0 var(--c-primary-2),var(--sh)"'}><div class="row-b"><b>${esc(p.judul)}</b>${p.sematkan ? `<span class="chip red">${ic('push_pin')}</span>` : ''}</div>${p.gambar ? `<img src="${esc(p.gambar)}" alt="" class="mt2" style="border-radius:10px" loading="lazy">` : ''}<p class="small mt2">${md(p.isi)}</p><div class="tiny muted mt2">${fRel(p.waktu)}</div></div>`).join('') || '<div class="empty">Belum ada pengumuman.</div>'}</div></div>`;
  d.addEventListener('click', e => { if (e.target === d) ACT.tutupDrawer(); });
  $('#layer').appendChild(d);
  B.pengumuman.forEach(p => S.read[p.id] = 1); LS.set('gp_read', S.read);
  const dot = $('.bell-dot'); if (dot) dot.remove();
};
ACT.tutupDrawer = () => { const d = $('#drw'); if (d) d.remove(); };
ACT.bukaPeng = el => { const p = S.boot.pengumuman.find(x => x.id === el.dataset.id); if (!p) return; S.read[p.id] = 1; LS.set('gp_read', S.read); modal(`${p.gambar ? `<img src="${esc(p.gambar)}" alt="" style="border-radius:12px" class="mb3">` : ''}<div style="line-height:1.7">${md(p.isi)}</div>`, { title: esc(p.judul) }); };

/* ---------- BELAJAR ---------- */
R['m/belajar'] = p => {
  const B = S.boot, tab = p.tab || S.ui.tabBelajar || 'alur'; S.ui.tabBelajar = tab; S.ui.title = 'Belajar';
  const tabs = [['alur', 'route', 'Alur Belajar'], ['materi', 'picture_as_pdf', 'Materi PDF'], ['gambar', 'image', 'Belajar Gambar'], ['kosakata', 'style', 'Kosakata']];
  const head = `<div class="tabs" role="tablist">${tabs.map(t => `<button class="tab ${tab === t[0] ? 'on' : ''}" role="tab" aria-selected="${tab === t[0]}" data-go="m/belajar" data-tab="${t[0]}">${ic(t[1])}${t[2]}</button>`).join('')}</div>`;
  if (tab === 'alur') {
    const tgt = {}; (B.target.target || []).forEach(x => tgt[x.id] = 1);
    const nxt = langkahBerikut();
    return head + `<div class="card card-lg"><div class="row-b"><div><h3>Peta Belajarmu</h3><p class="small muted">Ikuti urutan langkah. Tanda ✓ muncul otomatis saat selesai.</p></div>${ring(B.target.progres || 0, 56, 6, `<span style="font-size:13px">${B.target.progres || 0}%</span>`)}</div>
      <div class="steps mt4">${B.alur.map(a => `<div class="step ${a.selesai ? 'done' : nxt && nxt.id === a.id ? 'now' : ''}" style="margin-bottom:20px"><div class="dot">${a.selesai ? ic('check') : a.langkah_ke}</div>
        <div class="f1"><div class="row wrap"><b>${furi(a.judul)}</b>${tgt[a.id] && !a.selesai ? '<span class="chip amber">Target minggu ini</span>' : ''}${a.wajib ? '' : '<span class="chip ghost">opsional</span>'}</div>
        <p class="small muted mt1">${furi(a.deskripsi || '')}</p><div class="row mt2"><span class="chip ghost">${ic(TIPE_IC[a.tipe_item] || 'circle')} ${TIPE_LBL[a.tipe_item] || a.tipe_item}</span><span class="tiny muted">±${a.bobot} bobot</span></div></div>
        <button class="btn ${a.selesai ? 'btn-light' : 'btn-primary'} btn-sm" data-act="bukaItem" data-tipe="${esc(a.tipe_item)}" data-id="${esc(a.item_id)}">${a.selesai ? 'Buka lagi' : 'Mulai'}</button></div>`).join('') || '<div class="empty">Alur belajar belum disusun admin.</div>'}</div></div>`;
  }
  if (tab === 'materi' || tab === 'gambar') {
    const list = B.materi.filter(m => tab === 'gambar' ? m.tipe === 'gambar' : m.tipe !== 'gambar'), kel = {};
    list.forEach(m => (kel[m.kamoku] = kel[m.kamoku] || []).push(m));
    return head + (Object.keys(kel).map(k => `<div><h3 class="jp mb2">${furi(KANA[k] ? '｜' + k + '《' + KANA[k] + '》' : k)}</h3><div class="grid g3">${kel[k].map(m => `<div class="card hov tap list-card" data-act="bukaMateri" data-id="${esc(m.id)}" role="button" tabindex="0">
      <div class="kbox ${m.selesai ? '' : 'navy'}">${ic(m.tipe === 'gambar' ? 'photo_library' : m.tipe === 'teks' ? 'article' : 'picture_as_pdf')}</div>
      <div class="f1"><b style="display:block">${furi(m.judul)}</b><span class="tiny muted">${m.tipe === 'gambar' ? m.jumlah_gambar + ' gambar' : m.tipe === 'teks' ? 'Teks' : 'PDF · baca online'}</span></div>
      ${m.selesai ? `<span class="chip ok">${ic('check')} Selesai</span>` : ic('chevron_right')}</div>`).join('')}</div></div>`).join('') || `<div class="card empty">${ic('folder_open')}<p>Belum ada ${tab === 'gambar' ? 'materi gambar' : 'materi'}.</p></div>`);
  }
  // kosakata
  const kam = S.ui.kamoku || '', q = (S.ui.qKosa || '').toLowerCase(), stt = B.kosakata_status;
  const daftar = B.kosakata.filter(k => (!kam || k.kamoku === kam) && (!q || (plainJP(k.jp) + k.jp + k.arti + plainJP(k.cjp)).toLowerCase().indexOf(q) > -1));
  const semua = B.kosakata.filter(k => !kam || k.kamoku === kam);
  const hafal = semua.filter(k => stt[k.id] === 'hafal').length, belum = semua.filter(k => stt[k.id] === 'belum').length, pent = semua.filter(k => k.penting).length;
  const kams = [...new Set(B.kosakata.map(k => k.kamoku))];
  return head + `<div class="card"><div class="row-b"><div><h3>Status Penguasaan</h3><p class="small muted">Kata "belum hafal" akan muncul lebih sering di kartu hafalan.</p></div>${ring(pct(hafal, semua.length), 56, 5, `<span style="font-size:12px">${pct(hafal, semua.length)}%</span>`)}</div>
    <div class="grid g3 mt3" style="grid-template-columns:repeat(3,1fr);gap:8px"><div class="center" style="background:var(--c-s1);border-radius:10px;padding:8px"><div class="tiny" style="color:var(--c-red);font-weight:700">★ Penting</div><b>${pent}</b></div><div class="center" style="background:var(--c-s1);border-radius:10px;padding:8px"><div class="tiny" style="color:var(--c-bad);font-weight:700">↺ Belum</div><b>${belum}</b></div><div class="center" style="background:var(--c-s1);border-radius:10px;padding:8px"><div class="tiny" style="color:var(--c-ok);font-weight:700">✓ Hafal</div><b>${hafal}</b></div></div>
    <button class="btn btn-primary btn-block mt3" data-act="modeHafalan">${ic('style')} Mode Hafalan (Kartu)</button></div>
    <div class="row gap2 wrap"><div class="search f1" style="min-width:220px">${ic('search')}<input class="inp" id="qKosa" placeholder="Cari kanji, bacaan, atau arti…" value="${esc(S.ui.qKosa || '')}" aria-label="Cari kosakata"></div>
      <select class="inp" style="max-width:260px;border-radius:999px" data-act="" id="kamKosa" aria-label="Filter 科目"><option value="">Semua 科目</option>${kams.map(k => `<option ${k === kam ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
    <div class="col gap2" id="listKosa">${kosaList(daftar)}</div>`;
};
const TIPE_IC = { materi: 'picture_as_pdf', gambar: 'image', kosakata: 'style', paket_soal: 'quiz', zoom: 'videocam' };
const TIPE_LBL = { materi: 'Materi', gambar: 'Gambar', kosakata: 'Kosakata', paket_soal: 'Paket soal', zoom: 'Kelas Zoom' };
function kosaList(daftar) {
  const stt = S.boot.kosakata_status;
  return daftar.map(k => { const s = stt[k.id]; return `<div class="card list-card"><div class="kbox" style="border-radius:50%;${s === 'hafal' ? 'background:#DCFCE7;color:#15803D' : s === 'belum' ? 'background:#FFDAD6;color:var(--c-bad)' : ''}">${ic(s === 'hafal' ? 'done' : s === 'belum' ? 'replay' : 'fiber_new')}</div>
    <div class="f1"><div class="row wrap"><span class="jp" style="font-size:19px;font-weight:700;line-height:2">${furi(k.jp)}</span>${k.penting ? '<span class="chip red">★ Prioritas</span>' : ''}</div><div class="small muted">${esc(k.arti)}</div>${k.cjp ? `<div class="tiny mt1 jp" style="line-height:2">${furi(k.cjp)}</div>` : ''}</div>
    <div class="col gap1" style="align-items:flex-end"><button class="btn-ico sm" data-act="lapor" data-tipe="kosakata" data-id="${esc(k.id)}" aria-label="Laporkan">${ic('flag')}</button></div></div>`; }).join('') || '<div class="card empty">Tidak ada kata yang cocok.</div>';
}
AFTER['m/belajar'] = () => {
  const q = $('#qKosa'); if (q) q.addEventListener('input', debounce(() => { S.ui.qKosa = q.value; const B = S.boot, kam = S.ui.kamoku || '', s = q.value.toLowerCase(); $('#listKosa').innerHTML = kosaList(B.kosakata.filter(k => (!kam || k.kamoku === kam) && (!s || (plainJP(k.jp) + k.jp + k.arti + plainJP(k.cjp)).toLowerCase().indexOf(s) > -1))); }, 200));
  const k = $('#kamKosa'); if (k) k.addEventListener('change', () => { S.ui.kamoku = k.value; render(false); });
};

/* ---------- Flashcard (kartu hafalan) ---------- */
ACT.modeHafalan = () => {
  const B = S.boot, kam = S.ui.kamoku || '', stt = B.kosakata_status, deck = [];
  B.kosakata.filter(k => !kam || k.kamoku === kam).forEach(k => { const s = stt[k.id]; const n = s === 'belum' ? 3 : s === 'hafal' ? 1 : 2; for (let i = 0; i < n; i++) deck.push(k.id); if (k.penting && s !== 'hafal') deck.push(k.id); });
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const uniq = []; deck.forEach(id => { if (uniq[uniq.length - 1] !== id) uniq.push(id); });
  if (!uniq.length) return toast('Belum ada kosakata', 'warn');
  S.kartu = { deck: uniq, i: 0, flip: false, kam }; go('m/kartu');
};
R['m/kartu'] = () => {
  const B = S.boot, F = S.kartu; S.ui.title = 'Kartu Hafalan';
  if (!F) { setTimeout(() => go('m/belajar', { tab: 'kosakata' }, { replace: true }), 0); return ''; }
  const k = B.kosakata.find(x => x.id === F.deck[F.i]) || B.kosakata[0], s = B.kosakata_status[k.id];
  const semua = B.kosakata.filter(x => !F.kam || x.kamoku === F.kam), hafal = semua.filter(x => B.kosakata_status[x.id] === 'hafal').length;
  return `<div style="max-width:620px;margin:0 auto;width:100%" class="col gap3">
    <div class="row-b"><span class="chip pale">${esc(F.kam || 'Semua 科目')}</span><span class="small muted">${F.i + 1} dari ${F.deck.length} kartu · ${hafal}/${semua.length} hafal</span></div>
    <div class="bar"><i style="width:${pct(F.i + 1, F.deck.length)}%"></i></div>
    <div class="fc-wrap"><div class="fc ${F.flip ? 'flip' : ''}" id="fc" data-act="balik" role="button" aria-label="Balik kartu" tabindex="0">
      <div class="face front"><div class="row-b"><div class="row">${k.penting ? '<span class="chip red">★ Sering keluar ujian</span>' : ''}<span class="chip ghost">${s === 'hafal' ? 'Hafal ✓' : s === 'belum' ? 'Belum ↺' : 'Baru'}</span></div><button class="btn-ico sm" data-act="lapor" data-tipe="kosakata" data-id="${esc(k.id)}" aria-label="Laporkan">${ic('flag')}</button></div>
        <div class="kanji">${furi(k.jp)}</div>
        ${k.cjp ? `<div style="background:var(--c-s1);border-radius:12px;padding:10px 12px"><div class="tiny bold" style="color:var(--c-primary-2)">${ic('menu_book')} CONTOH KALIMAT</div><div class="jp mt1" style="font-size:15px;line-height:2.1">${furi(k.cjp)}</div></div>` : ''}
        <div class="center tiny muted mt3">${ic('touch_app')} Sentuh kartu untuk lihat arti</div></div>
      <div class="face back"><div class="tiny bold" style="color:var(--c-primary-2);text-transform:uppercase">Arti bahasa Indonesia</div>
        <div style="font-family:var(--f-head);font-size:24px;font-weight:700;color:var(--c-head)" class="mt1">${esc(k.arti)}</div>
        <div class="jp mt3" style="font-size:20px;line-height:2.1">${furi(k.jp)}</div>
        ${k.cid ? `<div class="mt3" style="background:var(--c-pale);border-radius:12px;padding:10px 12px"><div class="jp small" style="line-height:2">${furi(k.cjp)}</div><div class="small mt1">${esc(k.cid)}</div></div>` : ''}
        ${k.img ? `<img src="${esc(k.img)}" alt="" class="mt3" style="max-height:120px;object-fit:contain" loading="lazy">` : ''}
        <div class="center tiny muted" style="margin-top:auto">${ic('touch_app')} Sentuh untuk kembali</div></div>
    </div></div>
    <div class="row gap2"><button class="btn btn-bad f1" style="min-height:56px" data-act="hafal" data-v="belum">${ic('thumb_down')} Belum Hafal</button><button class="btn btn-ok f1" style="min-height:56px" data-act="hafal" data-v="hafal">${ic('check_circle')} Sudah Hafal</button></div>
    <div class="row-b"><button class="link" data-act="kartuNav" data-d="-1">${ic('chevron_left')} Sebelumnya</button><button class="link" data-act="kartuNav" data-d="1">Berikutnya ${ic('chevron_right')}</button></div>
    <div class="row card" style="background:linear-gradient(90deg,var(--c-pale),var(--c-s2));box-shadow:none">${stamp('sm')}<p class="small f1">Target hari ini: <b>15 kata hafal</b>. Kamu pasti bisa lulus Kaigo Fukushishi!</p></div></div>`;
};
ACT.balik = (el, e) => { if (e && e.target.closest('[data-act="lapor"]')) return; S.kartu.flip = !S.kartu.flip; $('#fc').classList.toggle('flip', S.kartu.flip); };
ACT.kartuNav = el => { const F = S.kartu; F.i = (F.i + num(el.dataset.d) + F.deck.length) % F.deck.length; F.flip = false; render(false); };
ACT.hafal = el => {
  const F = S.kartu, id = F.deck[F.i], v = el.dataset.v;
  S.boot.kosakata_status[id] = v; OB.push({ t: 'kosa', id, status: v }); catatAktivitas();
  if (v === 'belum' && F.deck.length - F.i > 3) F.deck.splice(F.i + 3, 0, id); // muncul lagi sebentar lagi
  recalcLocal();
  const fc = $('#fc'); if (fc) fc.classList.add(v === 'hafal' ? 'swipe-r' : 'swipe-l');
  setTimeout(() => { if (F.i < F.deck.length - 1) { F.i++; F.flip = false; render(false); } else { toast('Satu putaran selesai! \uD83C\uDF89'); S.kartu = null; go('m/belajar', { tab: 'kosakata' }, { replace: true }); } }, 180);
};

/* ---------- Viewer materi PDF / galeri gambar (privat, watermark, tanpa unduh) ---------- */
const FILES = {}; // cache memori base64 (tidak disimpan ke disk)
function wm() { const p = S.boot && S.boot.profil, t = esc((p ? p.nama + ' · ' + p.email : 'Goukaku Pedia ID')); return `<div class="wm">${Array(18).fill(`<span>${t}</span>`).join('')}</div>`; }
ACT.bukaMateri = async el => {
  const m = S.boot.materi.find(x => x.id === el.dataset.id); if (!m) return toast('Materi tidak ditemukan', 'warn');
  catatAktivitas();
  if (m.tipe === 'teks') { modal(`<div style="line-height:1.8">${md(m.isi_teks || '')}</div><button class="btn btn-ok btn-block mt4" data-act="tandaiMateri" data-id="${esc(m.id)}">${ic('check')} Tandai selesai</button>`, { title: furi(m.judul), wide: true }); return; }
  const v = document.createElement('div'); v.className = 'viewer'; v.id = 'viewer';
  v.innerHTML = `<div class="viewer-top"><button class="btn-ico" data-act="tutupViewer" aria-label="Tutup">${ic('arrow_back')}</button><div class="f1 trunc"><b>${furi(m.judul)}</b><div class="tiny" style="opacity:.7" id="vInfo">Memuat…</div></div>
    <button class="btn-ico" data-act="lapor" data-tipe="materi" data-id="${esc(m.id)}" aria-label="Laporkan">${ic('flag')}</button>
    <button class="btn btn-sm ${m.selesai ? 'btn-light' : 'btn-ok'}" data-act="tandaiMateri" data-id="${esc(m.id)}">${ic('check')} ${m.selesai ? 'Selesai' : 'Tandai selesai'}</button></div>
    <div class="viewer-body" id="vBody"><div class="empty" style="color:#cfd5ff"><div class="sk" style="width:min(680px,90%);height:70vh;margin:20px auto;opacity:.15"></div></div></div>`;
  v.addEventListener('contextmenu', e => e.preventDefault());
  v.addEventListener('dragstart', e => e.preventDefault());
  $('#layer').appendChild(v);
  try { if (m.tipe === 'gambar') await galeri(m); else await pdfView(m); }
  catch (e) { const b = $('#vBody'); if (b) b.innerHTML = `<div class="empty" style="color:#fff">${ic('error')}<p>${esc(e.message)}</p><button class="btn btn-white mt3" data-act="tutupViewer">Tutup</button></div>`; }
};
ACT.tutupViewer = () => { const v = $('#viewer'); if (v) v.remove(); };
async function pdfView(m) {
  const [lib, data] = await Promise.all([muatLib(PDFJS_URL, 'pdfjsLib'), FILES[m.id] ? Promise.resolve(FILES[m.id]) : API.call('m.materi.buka', { id: m.id }, { timeout: 120000, silent: true })]);
  FILES[m.id] = data;
  lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const pdf = await lib.getDocument({ data: b64ToBytes(data.b64) }).promise;
  const body = $('#vBody'); if (!body) return;
  $('#vInfo').textContent = pdf.numPages + ' halaman · hanya baca online';
  body.innerHTML = `<div class="viewer-pages">${Array.from({ length: pdf.numPages }, (_, i) => `<div class="pg" data-p="${i + 1}"><div class="sk" style="width:min(820px,100%);aspect-ratio:.707;opacity:.15"></div></div>`).join('')}</div>`;
  const w = Math.min(body.clientWidth - 16, 900), dpr = Math.min(2, window.devicePixelRatio || 1);
  const io = new IntersectionObserver(async ents => {
    for (const en of ents) {
      if (!en.isIntersecting || en.target.dataset.done) continue; en.target.dataset.done = 1; io.unobserve(en.target);
      const page = await pdf.getPage(num(en.target.dataset.p)), vp0 = page.getViewport({ scale: 1 }), sc = w / vp0.width, vp = page.getViewport({ scale: sc * dpr });
      const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height; cv.style.width = (vp.width / dpr) + 'px';
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      en.target.innerHTML = ''; en.target.appendChild(cv); en.target.insertAdjacentHTML('beforeend', wm());
    }
  }, { root: body, rootMargin: '600px 0px' });
  $$('.pg', body).forEach(p => io.observe(p));
}
async function galeri(m) {
  const n = m.jumlah_gambar, body = $('#vBody'); if (!n) throw new Error('Galeri masih kosong.');
  $('#vInfo').textContent = n + ' gambar · geser untuk melihat';
  body.innerHTML = `<div class="gal" id="gal">${Array.from({ length: n }, (_, i) => `<div class="gi" data-i="${i}"><div class="sk" style="width:min(680px,90%);height:50vh;opacity:.15"></div></div>`).join('')}</div>`;
  const muat = async i => {
    const key = m.id + '#' + i; const d = FILES[key] || await API.call('m.materi.buka', { id: m.id, idx: i }, { silent: true, timeout: 60000 }); FILES[key] = d;
    const el = $(`#gal .gi[data-i="${i}"]`); if (!el) return;
    el.innerHTML = `<div style="position:relative;display:inline-block"><img src="data:${d.mime};base64,${d.b64}" alt="${esc(d.keterangan || m.judul)}" data-act="zoomImg">${wm()}</div><div class="gcap">${md(d.keterangan || '')}<div class="tiny mt1" style="opacity:.6">${i + 1} / ${n}</div></div>`;
  };
  for (let i = 0; i < n; i++) { await muat(i); if (!$('#gal')) return; }
}
ACT.zoomImg = el => { const z = el.style.transform === 'scale(2)'; el.style.transform = z ? '' : 'scale(2)'; el.style.transition = 'transform .25s'; el.style.cursor = z ? 'zoom-in' : 'zoom-out'; };
ACT.tandaiMateri = el => {
  const m = S.boot.materi.find(x => x.id === el.dataset.id); if (!m) return;
  if (!m.selesai) { m.selesai = true; OB.push({ t: 'progres', tipe: m.tipe === 'gambar' ? 'gambar' : 'materi', item_id: m.id }); catatAktivitas(2); recalcLocal(); toast('Materi ditandai selesai ✓'); }
  el.className = 'btn btn-sm btn-light'; el.innerHTML = ic('check') + ' Selesai'; closeModal();
  render(false);
};

/* ---------- ZOOM ---------- */
function zoomTombol(z) {
  const mulai = toDate(z.mulai), buka = mulai ? mulai.getTime() - 30 * 60000 : 0, akhir = mulai ? mulai.getTime() + (z.durasi + 30) * 60000 : 0, now = Date.now();
  if (now >= buka && now <= akhir) return `<button class="btn btn-primary btn-block" data-act="gabungZoom" data-id="${esc(z.id)}">${ic('videocam')} Gabung Zoom</button>${z.meeting_id ? `<div class="tiny muted center">Meeting ID ${esc(z.meeting_id)} · Passcode ${esc(z.passcode)}</div>` : ''}`;
  if (now < buka) return `<div class="row gap2"><button class="btn btn-light f1" disabled>${ic('lock_clock')} Gabung aktif 30 menit sebelum mulai</button></div><div class="tiny muted center row" style="justify-content:center">Mulai dalam ${cdBox(z.mulai, true)}</div>`;
  return z.rekaman ? `<button class="btn btn-light btn-block" data-act="putarRekaman" data-id="${esc(z.id)}">${ic('smart_display')} Tonton Rekaman</button>` : '<span class="small muted">Kelas selesai. Rekaman segera tersedia.</span>';
}
R['m/zoom'] = p => {
  const B = S.boot, tab = p.tab || S.ui.tabZoom || 'jadwal'; S.ui.tabZoom = tab; S.ui.title = 'Kelas Zoom';
  const head = `<div class="tabs"><button class="tab ${tab === 'jadwal' ? 'on' : ''}" data-go="m/zoom" data-tab="jadwal">${ic('event')} Jadwal & Link</button><button class="tab ${tab === 'rekaman' ? 'on' : ''}" data-go="m/zoom" data-tab="rekaman">${ic('smart_display')} Rekaman</button></div>`;
  if (tab === 'jadwal') {
    const up = B.zoom.filter(z => z.status !== 'selesai' && toDate(z.mulai) && toDate(z.mulai).getTime() + (z.durasi + 30) * 60000 > Date.now());
    return head + `<div class="grid g2">${up.map(z => `<div class="card card-lg col gap3"><div class="row-b"><span class="chip pale">${esc(z.kamoku)}</span><span class="chip red">${ic('videocam')} LIVE</span></div>
      <h3>${furi(z.judul)}</h3><div class="small col gap1"><span class="row">${ic('event')} ${fWaktu(z.mulai)}</span><span class="row">${ic('person')} ${esc(z.pengajar)} · ${z.durasi} menit</span></div>${zoomTombol(z)}</div>`).join('') || `<div class="card empty">${ic('event_busy')}<p>Belum ada jadwal kelas. Pantau pengumuman ya!</p></div>`}</div>`;
  }
  const rek = B.zoom.filter(z => z.rekaman), kel = {}; rek.forEach(z => (kel[z.kamoku || 'Umum'] = kel[z.kamoku || 'Umum'] || []).push(z));
  return head + (Object.keys(kel).map(k => `<div><h3 class="jp mb2">${esc(k)}</h3><div class="grid g3">${kel[k].map(z => `<div class="card hov tap" data-act="putarRekaman" data-id="${esc(z.id)}" role="button">
      <div style="aspect-ratio:16/9;border-radius:10px;background:var(--grad-hero);display:flex;align-items:center;justify-content:center;color:#fff;position:relative">${ic('play_circle', 'fill')}${z.ditonton ? '<span class="chip ok" style="position:absolute;top:8px;right:8px">✓ Ditonton</span>' : ''}</div>
      <b class="mt2" style="display:block">${furi(z.judul)}</b><span class="tiny muted">${fTgl(z.mulai)} · ${esc(z.pengajar)}</span></div>`).join('')}</div></div>`).join('') || `<div class="card empty">${ic('video_library')}<p>Belum ada rekaman.</p></div>`);
};
ACT.gabungZoom = async el => {
  el.classList.add('loading');
  try {
    const r = await API.call('m.zoom.gabung', { id: el.dataset.id });
    const z = S.boot.zoom.find(x => x.id === el.dataset.id); if (z) { z.hadir = true; recalcLocal(); } catatAktivitas(2);
    modal(`<p>Kehadiranmu sudah dicatat ✓</p>${r.meeting_id ? `<div class="card mt3" style="background:var(--c-s1);box-shadow:none"><div class="small">Meeting ID: <b>${esc(r.meeting_id)}</b></div><div class="small">Passcode: <b>${esc(r.passcode)}</b></div></div>` : ''}<a class="btn btn-primary btn-block mt4" href="${esc(r.link)}" target="_blank" rel="noopener">${ic('videocam')} Buka Zoom</a>`, { title: 'Gabung Kelas' });
  } catch (e) { toast(e.message, 'err'); } finally { el.classList.remove('loading'); }
};
ACT.putarRekaman = el => {
  const z = S.boot.zoom.find(x => x.id === el.dataset.id); if (!z || !z.rekaman) return;
  const mat = z.materi_terkait_id && S.boot.materi.find(m => m.id === z.materi_terkait_id);
  modal(`<div class="video-box"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(z.rekaman)}?rel=0&modestbranding=1&playsinline=1" title="${esc(z.judul)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>
    <p class="small muted mt2">${fWaktu(z.mulai)} · ${esc(z.pengajar)}</p>${mat ? `<button class="btn btn-light btn-block mt3" data-act="bukaMateri" data-id="${esc(mat.id)}">${ic('picture_as_pdf')} Materi terkait: ${furi(mat.judul)}</button>` : ''}`, { title: furi(z.judul), wide: true });
  if (!z.ditonton) { z.ditonton = true; OB.push({ t: 'progres', tipe: 'zoom', item_id: z.id }); catatAktivitas(2); recalcLocal(); }
};

/* ---------- PROFIL ---------- */
R['m/profil'] = () => {
  const B = S.boot, p = B.profil; S.ui.title = 'Profil';
  const legal = (S.pub && S.pub.legal) || [{ id: 'syarat', judul: 'Syarat & Ketentuan' }, { id: 'privasi', judul: 'Kebijakan Privasi' }, { id: 'refund', judul: 'Kebijakan Refund' }];
  return `<div class="grid g2" style="align-items:start"><div class="col gap3"><div class="card card-lg row gap3"><div class="av lg">${esc((p.nama || '?')[0])}</div><div class="f1"><h3>${esc(p.nama)}</h3><div class="small muted">${esc(p.email)}</div><div class="small muted">+${esc(p.no_wa || '')}</div></div></div>
    <div class="card col gap2"><div class="row-b small"><span class="muted">Paket</span><b>${esc(B.paket)}</b></div><div class="row-b small"><span class="muted">Angkatan</span><b>${B.jadwal ? esc(B.jadwal.nama) : '-'}</b></div>
      <div class="row-b small"><span class="muted">Aktif sampai</span><b>${p.tgl_berakhir ? fTgl(p.tgl_berakhir) : (B.jadwal ? fTgl(B.jadwal.tanggal) : '-')}</b></div></div>
    <div class="card"><div class="row-b"><h3>Perangkat aktif</h3><span class="chip pale">maks. 2</span></div><div id="devList" class="col gap2 mt3"><div class="sk" style="height:44px"></div></div><p class="tiny muted mt2">Untuk mengganti perangkat, hubungi admin agar daftar perangkat direset.</p></div></div>
    <div class="col gap3"><div class="card"><h3>Ganti Sandi</h3><form data-form="gantiSandi" class="mt3"><div class="fld"><label for="gL">Sandi lama</label><input id="gL" class="inp" type="password" name="lama" required autocomplete="current-password"></div><div class="fld"><label for="gB">Sandi baru</label><input id="gB" class="inp" type="password" name="baru" minlength="8" required autocomplete="new-password"></div><button class="btn btn-primary" type="submit">Simpan</button></form></div>
    <div class="card col gap1"><button class="btn btn-ghost" style="justify-content:flex-start" data-act="ulangSambutan">${ic('waving_hand')} Panduan (Sambutan)</button>
      <button class="btn btn-ghost" style="justify-content:flex-start" data-act="pasangApp">${ic('install_mobile')} Pasang aplikasi di HP</button>
      <button class="btn btn-ghost" style="justify-content:flex-start" data-act="tema">${ic('dark_mode')} Mode gelap / terang</button>
      ${legal.map(l => `<button class="btn btn-ghost" style="justify-content:flex-start" data-go="legal" data-id="${esc(l.id)}">${ic('gavel')} ${esc(l.judul)}</button>`).join('')}
      ${B.wa_admin ? `<a class="btn btn-ghost" style="justify-content:flex-start" href="${waLink(B.wa_admin, 'Halo admin, saya member ' + p.email)}" target="_blank" rel="noopener">${ic('support_agent')} Hubungi admin</a>` : ''}
      <button class="btn btn-ghost" style="justify-content:flex-start;color:var(--c-bad)" data-act="keluar">${ic('logout')} Keluar</button></div></div></div>`;
};
AFTER['m/profil'] = async () => {
  try { const d = await API.call('m.perangkat', {}, { silent: true }); const el = $('#devList'); if (el) el.innerHTML = d.map(x => `<div class="row" style="background:var(--c-s1);border-radius:10px;padding:10px">${ic(/Android|iPhone/.test(x.nama) ? 'smartphone' : 'computer')}<div class="f1"><b class="small">${esc(x.nama)}${x.ini ? ' <span class="chip ok">ini</span>' : ''}</b><div class="tiny muted">Aktif ${fRel(x.terakhir)}</div></div></div>`).join('') || '<span class="small muted">Mode pratinjau.</span>'; } catch (e) { }
};
FORM.gantiSandi = (f, d) => kunciTombol(f, async () => { try { const r = await API.call('m.sandi', d); toast(r.pesan); f.reset(); } catch (e) { toast(e.message, 'err'); } });

/* ---------- Sambutan member baru (3 layar) & persetujuan ulang S&K ---------- */
function cekSambutan() {
  const B = S.boot; if (!B || B.profil.pratinjau) return;
  if (B.perlu_setuju && !$('#ovl')) return setujuUlang();
  if (!B.profil.sudah_onboarding && !LS.get('gp_onb_' + B.profil.id) && !$('.onb')) sambutan();
}
function sambutan() {
  const sl = [['route', 'Ikuti Alur Belajar', 'Belajar langkah demi langkah. Target minggu ini dihitung otomatis sampai hari ujianmu.'],
  ['lightbulb', 'Kerjakan soal & baca TRIK JITU', 'Setiap soal punya furigana, terjemahan, analisa ○×, dan TRIK JITU 4 bagian.'],
  ['videocam', 'Kelas Zoom & pengumuman', 'Ikuti kelas live tiap minggu. Pengumuman penting muncul di ikon lonceng.']];
  const d = document.createElement('div'); d.className = 'onb';
  d.innerHTML = `<div class="row-b" style="padding:16px;padding-top:calc(16px + env(safe-area-inset-top))">${logo()}<button class="btn btn-ghost btn-sm" style="color:#fff" data-act="selesaiSambutan">Lewati</button></div>
    <div class="onb-track" id="onbT">${sl.map((s, i) => `<div class="onb-s"><div class="ill">${ic(s[0], 'fill')}</div>${i === 0 ? '<h2>Selamat datang di Goukaku Pedia ID \uD83C\uDF89</h2>' : ''}<h3 style="color:#BEE9FF">${i + 1}. ${s[1]}</h3><p style="max-width:420px;opacity:.9">${s[2]}</p></div>`).join('')}</div>
    <div class="onb-f"><div class="dots" id="onbD">${sl.map((s, i) => `<button class="${i === 0 ? 'on' : ''}" aria-label="Layar ${i + 1}"></button>`).join('')}</div><button class="btn btn-white" data-act="onbNext" id="onbB">Lanjut ${ic('arrow_forward')}</button></div>`;
  document.body.appendChild(d);
  const t = $('#onbT'); t.addEventListener('scroll', debounce(() => { const i = Math.round(t.scrollLeft / t.clientWidth); $$('#onbD button').forEach((b, k) => b.classList.toggle('on', k === i)); $('#onbB').innerHTML = i === 2 ? 'Mulai Langkah 1 ' + ic('play_arrow', 'fill') : 'Lanjut ' + ic('arrow_forward'); }, 60));
}
ACT.onbNext = () => { const t = $('#onbT'), i = Math.round(t.scrollLeft / t.clientWidth); if (i >= 2) { ACT.selesaiSambutan(); const a = S.boot.alur[0]; if (a) bukaItem(a.tipe_item, a.item_id); } else t.scrollTo({ left: (i + 1) * t.clientWidth, behavior: 'smooth' }); };
ACT.selesaiSambutan = () => { const o = $('.onb'); if (o) o.remove(); const B = S.boot; if (!B.profil.pratinjau) { LS.set('gp_onb_' + B.profil.id, 1); if (!B.profil.sudah_onboarding) { B.profil.sudah_onboarding = true; OB.push({ t: 'onboard' }); } } };
ACT.ulangSambutan = () => sambutan();
function setujuUlang() {
  modal(`<p>Syarat & Ketentuan diperbarui (versi ${esc(S.boot.versi_syarat)}). Mohon baca dan setujui untuk melanjutkan.</p><button class="link mt2" data-go="legal" data-id="syarat" onclick="closeModal()">Baca Syarat & Ketentuan</button>
    <label class="chk mt3"><input type="checkbox" id="stj"><span>Saya setuju dengan Syarat & Ketentuan terbaru</span></label><button class="btn btn-primary btn-block mt4" data-act="setuju">Setuju & Lanjut</button>`, { title: 'Persetujuan ulang', lock: true });
}
ACT.setuju = async el => { if (!$('#stj').checked) return toast('Centang persetujuan dulu', 'warn'); el.classList.add('loading'); try { await API.call('m.setuju', {}); S.boot.perlu_setuju = false; closeModal(); cekSambutan(); } catch (e) { toast(e.message, 'err'); el.classList.remove('loading'); } };

/* ---------- Laporkan (bottom sheet) ---------- */
ACT.lapor = (el, e) => {
  if (e) e.stopPropagation();
  modal(`<form data-form="lapor"><input type="hidden" name="tipe_item" value="${esc(el.dataset.tipe || 'soal')}"><input type="hidden" name="item_id" value="${esc(el.dataset.id || '')}">
    <div class="lbl mb2">Apa yang keliru?</div><div class="row wrap gap2 mb3">${['terjemahan', 'kunci jawaban', 'furigana', 'gambar', 'lainnya'].map((j, i) => `<label class="chip ghost" style="padding:8px 12px;cursor:pointer"><input type="radio" name="jenis" value="${j}" ${i === 0 ? 'checked' : ''} style="accent-color:var(--c-primary)"> ${j}</label>`).join('')}</div>
    <div class="fld"><label for="lpK">Keterangan</label><textarea id="lpK" class="inp" name="keterangan" maxlength="1000" placeholder="Contoh: terjemahan pilihan 3 kurang tepat…"></textarea></div>
    <button class="btn btn-primary btn-block" type="submit">${ic('send')} Kirim Laporan</button></form>`, { title: `${ic('flag')} Laporkan ${esc(el.dataset.tipe || 'soal')}` });
};
FORM.lapor = (f, d) => { OB.push({ t: 'lapor', tipe_item: d.tipe_item, item_id: d.item_id, jenis: d.jenis, keterangan: d.keterangan }); closeModal(); toast('Terima kasih! Laporanmu akan diperiksa tim \uD83D\uDE4F'); };

/* Prefetch soal paket target saat idle → tombol "Mulai" terasa instan */
function prefetchSoal() {
  const B = S.boot; if (!B || B.profil.pratinjau) return;
  const t = (B.target.target || []).find(x => x.tipe_item === 'paket_soal' && !x.selesai);
  if (t) { const p = B.paket_soal.find(x => x.id === t.item_id); if (p && p.jenis !== '模擬試験') ambilSoal(p.id, 'latihan', true).catch(() => { }); }
}
/* ============================================================================
 * SOAL: 13 paket (過去問 / 練習 / 模擬試験), mesin kuis latihan & ujian bertimer,
 * hasil + pembahasan, ulangi yang salah, riwayat & grafik nilai.
 * ========================================================================== */

/* ---------- Komponen bersama ---------- */
function parseAnalisa(s) {
  return String(s || '').split('\n').map(l => l.split('|')).filter(p => p.length >= 3 && /^\d$/.test(p[0].trim()))
    .map(p => ({ n: p[0].trim(), ok: /○|o|benar/i.test(p[1]), jp: p[2] || '', id: p[3] || '' }));
}
function parseKosa(s) {
  return String(s || '').split(/;|\n/).map(x => x.trim()).filter(Boolean).map(x => {
    const [w, arti] = x.split('='); const m = String(w).match(/^(.+?)（(.+?)）$/) || String(w).match(/^(.+?)\((.+?)\)$/);
    return { jp: m ? '｜' + m[1] + '《' + m[2] + '》' : w, arti: arti || '' };
  });
}
function soalHTML(q, o = {}) {
  const kunci = String(q.kunci || ''), tampil = !!o.tampilKunci, pilih = o.pilih === undefined ? '' : String(o.pilih);
  const an = tampil ? parseAnalisa(q.analisa) : [];
  return `<article class="q-card col gap3" aria-label="Soal ${o.nomor || q.nomor || ''}">
    <div class="row-b wrap"><div class="row wrap"><span class="flex" style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:var(--c-primary);color:#fff;font-weight:800;font-family:var(--f-head)">${o.nomor || q.nomor || ''}</span><span class="chip pale jp">${ic('medical_services')} ${esc(q.kamoku || '')}</span>${q.sesi ? `<span class="chip ghost jp">${esc(q.sesi)}${q.bagian ? ' · ' + esc(q.bagian) + 'パート' : ''}</span>` : ''}</div>
      ${o.noLapor ? '' : `<button class="btn-ico sm" data-act="lapor" data-tipe="${tampil ? 'pembahasan' : 'soal'}" data-id="${esc(q.id)}" aria-label="Laporkan soal">${ic('flag')}</button>`}</div>
    <div class="q-text">${furi(q.soal_jp)}</div>
    ${q.gambar ? `<img src="${esc(q.gambar)}" alt="Gambar soal" loading="lazy" style="border-radius:12px;max-height:340px;object-fit:contain;background:#fff">` : ''}
    <button class="btn btn-light btn-sm" style="align-self:flex-start" data-act="terjemah">${ic('translate')} ${o.terjemah ? 'Sembunyikan' : 'Tampilkan'} terjemahan Indonesia</button>
    ${o.terjemah ? `<div class="trans"><div class="tiny bold" style="color:var(--c-primary-2);text-transform:uppercase;letter-spacing:.05em">Arti bahasa Indonesia</div>${esc(q.soal_id)}</div>` : ''}
    <div class="tiny bold muted" style="letter-spacing:.06em">PILIHAN JAWABAN (${q.pilihan.length} OPSI)</div>
    <div class="opts" role="radiogroup">${q.pilihan.map((p, i) => {
      const n = String(i + 1), ok = tampil && n === kunci, bad = tampil && pilih === n && n !== kunci, sel = !tampil && pilih === n;
      return `<button class="opt ${ok ? 'ok' : bad ? 'bad' : sel ? 'sel' : ''}" role="radio" aria-checked="${pilih === n}" data-act="jawab" data-v="${n}" ${tampil ? 'disabled' : ''}>
        <span class="n">${ok ? '✓' : bad ? '✕' : n}</span><span class="f1">${ok || bad ? `<span class="tiny bold" style="color:${ok ? 'var(--c-ok)' : 'var(--c-bad)'}">${ok ? 'KUNCI JAWABAN BENAR (正解)' : 'JAWABAN KAMU (KURANG TEPAT)'}</span>` : ''}
        <span class="jp">${furi(p.jp)}</span>${(o.terjemah || tampil) && p.id ? `<span class="id">${esc(p.id)}</span>` : ''}</span></button>`;
    }).join('')}</div>
    ${tampil && an.length ? `<div class="col gap2"><div class="tiny bold muted" style="letter-spacing:.06em">ANALISA SETIAP PILIHAN (○×)</div>${an.map(a => `<div class="an"><span class="mk ${a.ok ? 'o' : 'x'}">${a.ok ? '○' : '×'}</span><div><b>${a.n}.</b> <span class="jp">${furi(a.jp)}</span><div class="muted small">${esc(a.id)}</div></div></div>`).join('')}</div>` : ''}
  </article>`;
}
function trikHTML(q) {
  const t = q.trik || {}, ks = parseKosa(q.kosakata);
  if (!t.kata_kunci && !t.rumus_cepat && !t.jembatan && !t.jebakan) return '';
  const part = (cls, lbl, ico, txt) => txt ? `<div class="part"><span class="lb ${cls}">${ic(ico)} ${lbl}</span><p>${md(txt)}</p></div>` : '';
  return `<section class="trik" aria-label="TRIK JITU"><div class="glow"></div>${stamp('sm')}
    <div class="row" style="position:relative">${ic('lightbulb', 'fill')}<div><h3>TRIK JITU GOUKAKU</h3><div class="tiny" style="color:var(--c-tfix)">Bongkar pola ujian Kaigo Fukushishi</div></div></div>
    ${part('k', '1. KATA KUNCI (キーワード)', 'key', t.kata_kunci)}${part('r', '2. RUMUS CEPAT', 'bolt', t.rumus_cepat)}${part('j', '3. JEMBATAN INGATAN', 'psychology', t.jembatan)}${part('a', '4. AWAS JEBAKAN! (注意点)', 'warning', t.jebakan)}
    ${ks.length ? `<div class="mt3" style="position:relative"><div class="tiny bold" style="color:var(--c-tfix);letter-spacing:.06em">KOSAKATA PENTING</div>${ks.map(k => `<span class="vchip"><b>${furi(k.jp)}</b>${k.arti ? ' ' + esc(k.arti) : ''}</span>`).join('')}</div>` : ''}</section>`;
}
ACT.terjemah = () => {
  if (S.route === 'coba') { S.coba.terjemah = !S.coba.terjemah; render(false); return; }
  if (S.quiz) { S.quiz.terjemah = !S.quiz.terjemah; LS.set('gp_terjemah', S.quiz.terjemah); render(false); }
};

/* ---------- Daftar paket soal ---------- */
R['m/soal'] = () => {
  const B = S.boot; S.ui.title = 'Soal';
  const grp = [['過去問', '過去問 · Ujian Resmi', 'history_edu', '第33〜38回 + pembahasan lengkap'], ['練習', '練習 · Latihan', 'psychology', 'Latihan buatan Goukaku Pedia ID'], ['模擬試験', '模擬試験 · Simulasi', 'timer', 'Bertimer seperti hari ujian']];
  const kams = [...new Set(B.kamoku)], aktif = LS.get('gp_quiz');
  return `<div class="tabs"><button class="tab on">${ic('quiz')} 13 Paket Soal</button><button class="tab" data-go="m/riwayat">${ic('analytics')} Riwayat Nilai</button></div>
    ${aktif && !aktif.selesai ? `<div class="card row" style="border-left:4px solid var(--c-amber)">${ic('pending_actions')}<div class="f1"><b class="small">Lanjutkan: ${furi(aktif.label)}</b><div class="tiny muted">${Object.keys(aktif.jawab).length}/${aktif.soal.length} dijawab${aktif.mode === 'ujian' ? ' · timer tetap berjalan' : ''}</div></div><button class="btn btn-primary btn-sm" data-act="lanjutKuis">Lanjut</button></div>` : ''}
    <div class="card col gap3"><div class="row-b wrap"><b>Latihan cepat</b><span class="tiny muted">Pembahasan langsung setelah menjawab</span></div>
      <div class="row wrap gap2"><select class="inp f1" id="selKam" style="min-width:200px;border-radius:999px" aria-label="Pilih 科目"><option value="">Acak dari semua 科目</option>${kams.map(k => `<option>${esc(k)}</option>`).join('')}</select>
      <button class="btn btn-primary" data-act="acak">${ic('shuffle')} Mulai 20 soal</button>
      <button class="btn btn-light" data-act="ulangSalah" ${B.salah.length ? '' : 'disabled'}>${ic('replay')} Ulangi yang salah (${B.salah.length})</button></div></div>
    ${grp.map(g => { const l = B.paket_soal.filter(p => p.jenis === g[0]); return l.length ? `<section><div class="row-b mb2"><h3 class="row jp">${ic(g[2])} ${g[1]}</h3><span class="tiny muted">${l.length} paket · ${g[3]}</span></div>
      <div class="grid g3">${l.map(p => paketKartu(p, aktif)).join('')}</div></section>` : ''; }).join('')}`;
};
function paketKartu(p, aktif) {
  const sedang = aktif && !aktif.selesai && aktif.paket_id === p.id, st = sedang ? ['sedang', 'amber'] : p.dikerjakan ? ['selesai', 'ok'] : ['belum', 'ghost'];
  const mogi = p.jenis === '模擬試験';
  return `<div class="card hov col gap2"><div class="row-b"><span class="chip ${mogi ? 'red' : p.jenis === '過去問' ? '' : 'pale'} jp">${esc(p.jenis)}</span><span class="chip ${st[1]}">${st[0]}</span></div>
    <h3 class="jp">${furi(p.nama)}</h3><p class="small muted">${esc(p.deskripsi || '')}</p>
    <div class="row wrap tiny muted gap3"><span class="row gap1">${ic('quiz')} ${p.jumlah} soal</span>${mogi || p.durasi ? `<span class="row gap1">${ic('timer')} ${p.durasi} menit</span>` : ''}${p.terbaik !== null ? `<span class="row gap1" style="color:var(--c-ok);font-weight:700">${ic('emoji_events')} ${p.terbaik}%</span>` : ''}</div>
    ${!p.terbuka ? `<div class="tiny" style="color:var(--c-red);font-weight:700">${toDate(p.buka) && toDate(p.buka) > Date.now() ? 'Dibuka ' + fTgl(p.buka) : 'Sudah ditutup'}</div>` : mogi && p.tutup ? `<div class="tiny muted">Ditutup ${fTgl(p.tutup)} · pembahasan ${p.pembahasan === 'setelah_tutup' ? 'setelah ditutup' : 'setelah selesai'}</div>` : ''}
    <div class="row gap2 mt1" style="margin-top:auto">${mogi ? `<button class="btn btn-red f1" data-act="mulai" data-id="${esc(p.id)}" data-mode="ujian" ${p.terbuka ? '' : 'disabled'}>${ic('timer')} Mulai Simulasi</button>`
      : p.jenis === '過去問' ? `<button class="btn btn-primary f1 btn-sm" data-act="mulai" data-id="${esc(p.id)}" data-mode="latihan">Latihan</button><button class="btn btn-light f1 btn-sm" data-act="mulai" data-id="${esc(p.id)}" data-mode="ujian">${ic('timer')} Bertimer</button>`
        : `<button class="btn btn-primary f1" data-act="mulai" data-id="${esc(p.id)}" data-mode="latihan">${p.dikerjakan ? 'Ulangi' : 'Mulai Latihan'}</button>`}</div></div>`;
}

/* ---------- Ambil soal (cache memori + localStorage untuk mode latihan) ---------- */
const SOAL_MEM = {};
async function ambilSoal(paketId, mode, silent) {
  const key = 'gp_soal_' + paketId + '_' + mode;
  if (SOAL_MEM[key]) return SOAL_MEM[key];
  const c = LS.get(key);
  if (c && Date.now() - c.t < 6 * 3600000) { SOAL_MEM[key] = c.d; return c.d; }
  const d = await API.call('m.soal.ambil', { paket_id: paketId, mode }, { silent });
  SOAL_MEM[key] = d; if (mode === 'latihan') LS.set(key, { t: Date.now(), d });
  return d;
}
ACT.mulai = el => mulaiPaket(el.dataset.id, el.dataset.mode);
async function mulaiPaket(id, mode) {
  const B = S.boot, p = B.paket_soal.find(x => x.id === id); if (!p) return;
  const aktif = LS.get('gp_quiz');
  if (aktif && !aktif.selesai && aktif.paket_id === id && aktif.mode === mode) { S.quiz = aktif; return go('m/kuis'); }
  if (aktif && !aktif.selesai && aktif.mode === 'ujian' && !await confirmBox(`Ada ujian lain yang belum selesai (${esc(plainJP(aktif.label))}). Tinggalkan dan mulai paket ini?`, 'Mulai baru', true)) return;
  if (mode === 'ujian' && !await confirmBox(`<b>${furi(p.nama)}</b><br>${p.jumlah} soal · ${p.durasi} menit.<br><br>Timer berjalan seperti ujian asli. Jawaban tersimpan otomatis di HP dan terkirim saat selesai / waktu habis.`, 'Mulai Ujian')) return;
  try {
    const d = await ambilSoal(id, mode);
    if (!d.soal.length) return toast('Paket ini belum berisi soal.', 'warn');
    const now = Date.now(), draft = d.draft;
    S.quiz = { paket_id: id, label: p.nama, jenis: p.jenis, mode, soal: d.soal, idx: 0, jawab: draft ? draft.jawaban || {} : {}, ragu: draft ? draft.ragu || {} : {}, cek: {},
      terjemah: mode === 'ujian' ? false : !!LS.get('gp_terjemah'), mulai: new Date(now).toISOString(),
      deadline: mode === 'ujian' ? now + (draft && draft.sisa ? draft.sisa * 1000 : (d.paket.durasi || 120) * 60000) : 0 };
    simpanKuis(); catatAktivitas(); go('m/kuis');
  } catch (e) { toast(e.message, 'err'); }
}
ACT.lanjutKuis = () => { S.quiz = LS.get('gp_quiz'); go('m/kuis'); };
ACT.acak = async () => {
  const kam = $('#selKam') ? $('#selKam').value : '';
  try { const soal = await API.call('m.soal.acak', { kamoku: kam, n: 20 }); if (!soal.length) return toast('Belum ada soal untuk pilihan ini', 'warn'); mulaiLatihanBebas(soal, kam ? 'Latihan ' + kam : 'Acak 20 soal', 'acak'); } catch (e) { toast(e.message, 'err'); }
};
ACT.ulangSalah = async () => {
  const ids = (S.boot.salah || []).slice(0, 60); if (!ids.length) return toast('Belum ada soal yang salah \uD83D\uDC4D');
  try { const soal = await API.call('m.soal.ids', { ids }); if (!soal.length) return toast('Pembahasan soal ini belum dibuka.', 'warn'); mulaiLatihanBebas(soal, 'Ulangi soal yang salah', 'ulang_salah'); } catch (e) { toast(e.message, 'err'); }
};
function mulaiLatihanBebas(soal, label, tag) {
  S.quiz = { paket_id: '', tag, label, jenis: 'latihan', mode: 'latihan', soal, idx: 0, jawab: {}, ragu: {}, cek: {}, terjemah: !!LS.get('gp_terjemah'), mulai: new Date().toISOString(), deadline: 0 };
  simpanKuis(); go('m/kuis');
}
function simpanKuis() { if (S.quiz) LS.set('gp_quiz', S.quiz); }

/* ---------- Layar kuis ---------- */
let _qTimer = null, _qSave = null;
R['m/kuis'] = () => {
  const Q = S.quiz; if (!Q) { setTimeout(() => go('m/soal', {}, { replace: true }), 0); return ''; }
  S.ui.title = plainJP(Q.label);
  const q = Q.soal[Q.idx], n = Q.soal.length, ujian = Q.mode === 'ujian', review = Q.mode === 'review';
  const sudah = review || (!ujian && Q.cek[q.id]);
  const terj = ujian ? Q.terjemah : (Q.terjemah || sudah);
  const dijawab = Object.keys(Q.jawab).length;
  const nav = `<div class="qnav">${Q.soal.map((s, i) => { const j = Q.jawab[s.id]; let c = ''; if (review || (!ujian && Q.cek[s.id])) c = j === undefined ? '' : String(j) === String(s.kunci) ? 'ok' : 'bad'; else if (j !== undefined) c = 'ans'; return `<button class="${c} ${i === Q.idx ? 'cur' : ''} ${Q.ragu[s.id] ? 'ragu' : ''}" data-act="keSoal" data-i="${i}" aria-label="Soal ${i + 1}">${i + 1}</button>`; }).join('')}</div>`;
  const top = `<div class="q-top"><div class="card row-b wrap" style="padding:10px 14px"><div class="row wrap gap2"><span class="chip jp">${esc(Q.jenis)}</span><b class="small">Soal ${Q.idx + 1} dari ${n}</b>${ujian ? `<span class="tiny muted">${dijawab} dijawab</span>` : ''}</div>
    <div class="row gap2">${ujian ? `<button class="btn btn-light btn-sm" data-act="ragu">${ic('flag', Q.ragu[q.id] ? 'fill' : '')} <span style="color:${Q.ragu[q.id] ? 'var(--c-amber)' : 'inherit'}">Ragu-ragu</span></button><span class="timer" id="qTimer" aria-live="off">${ic('timer')}<span>--:--</span></span>` : review ? '<span class="chip pale">Mode pembahasan</span>' : `<span class="chip ok">${ic('bolt')} Pembahasan langsung</span>`}</div></div></div>`;
  const side = `<div class="col gap3">${sudah ? trikHTML(q) || '<div class="card small muted">TRIK JITU untuk soal ini belum tersedia.</div>' : ''}
    <div class="card col gap3 ${sudah ? 'only-d' : ''}"><div class="row-b"><b class="small">Navigasi Cepat (1–${n})</b>${ujian ? '' : `<span class="tiny muted">${Object.keys(Q.cek).length}/${n} dibahas</span>`}</div>${nav}
      ${review ? '' : `<button class="btn ${ujian ? 'btn-red' : 'btn-primary'} btn-block" data-act="selesaiKuis">${ic('flag')} ${ujian ? 'Selesai & Kumpulkan' : 'Selesai Latihan'}</button>`}</div></div>`;
  return `${top}<div class="qwrap"><div class="col gap3">${soalHTML(q, { pilih: Q.jawab[q.id], tampilKunci: sudah, terjemah: terj, nomor: Q.idx + 1 })}</div>${side}</div>
    <div class="qbar"><button class="btn btn-light" data-act="qNav" data-d="-1" ${Q.idx === 0 ? 'disabled' : ''}>${ic('arrow_back')}<span class="only-d">Sebelumnya</span></button>
      <button class="btn btn-light only-m" data-act="daftarSoal">${ic('grid_view')} Daftar Soal</button>
      ${Q.idx < n - 1 ? `<button class="btn btn-primary" data-act="qNav" data-d="1"><span>Berikutnya</span>${ic('arrow_forward')}</button>` : review ? `<button class="btn btn-primary" data-act="back">Selesai ${ic('check')}</button>` : `<button class="btn ${ujian ? 'btn-red' : 'btn-primary'}" data-act="selesaiKuis">Selesai ${ic('flag')}</button>`}</div>`;
};
AFTER['m/kuis'] = () => {
  const Q = S.quiz; clearInterval(_qTimer); clearTimeout(_qSave);
  if (!Q || Q.mode !== 'ujian') return;
  const upd = () => {
    if (S.route !== 'm/kuis' || !S.quiz || S.quiz.selesai) { clearInterval(_qTimer); return; }
    const s = Math.max(0, Math.floor((Q.deadline - Date.now()) / 1000)), el = $('#qTimer');
    if (el) { el.querySelector('span:last-child').textContent = `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; el.classList.toggle('low', s < 300); }
    if (s <= 0) { clearInterval(_qTimer); toast('Waktu habis! Jawaban dikumpulkan otomatis.', 'warn', 5000); selesaiKuis(true); }
  };
  upd(); _qTimer = setInterval(upd, 1000);
  // simpan sementara ke server tiap ±3 menit (jeda acak agar tidak serentak)
  const auto = () => { _qSave = setTimeout(() => { if (S.quiz && S.quiz.mode === 'ujian' && !S.quiz.selesai) { API.call('m.ujian.simpan', { paket_id: Q.paket_id, jawaban: Q.jawab, ragu: Q.ragu, sisa: Math.floor((Q.deadline - Date.now()) / 1000) }, { silent: true }).catch(() => { }); auto(); } }, 180000 + Math.random() * 30000); };
  auto();
};
ACT.jawab = el => {
  const Q = S.quiz;
  if (S.route === 'coba') { S.coba.jawab[S.coba.soal[S.coba.idx].id] = el.dataset.v; render(false); if (S.coba.idx < S.coba.soal.length - 1) setTimeout(() => { S.coba.idx++; render(true); }, 220); return; }
  if (!Q || Q.mode === 'review') return;
  const q = Q.soal[Q.idx];
  if (Q.mode === 'latihan' && Q.cek[q.id]) return;
  Q.jawab[q.id] = el.dataset.v;
  if (Q.mode === 'latihan') { Q.cek[q.id] = 1; catatAktivitas(); }
  simpanKuis(); render(false);
  if (Q.mode === 'latihan') setTimeout(() => { const t = $('.trik') || $('.an'); if (t && window.innerWidth < 1100) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
};
ACT.qNav = el => { const Q = S.quiz; Q.idx = Math.max(0, Math.min(Q.soal.length - 1, Q.idx + num(el.dataset.d))); simpanKuis(); render(true); };
ACT.keSoal = el => { closeModal(); S.quiz.idx = num(el.dataset.i); simpanKuis(); render(true); };
ACT.ragu = () => { const Q = S.quiz, id = Q.soal[Q.idx].id; if (Q.ragu[id]) delete Q.ragu[id]; else Q.ragu[id] = 1; simpanKuis(); render(false); };
ACT.daftarSoal = () => { const Q = S.quiz; modal(`<div class="row wrap gap3 tiny muted mb3"><span class="row gap1"><i style="width:12px;height:12px;border-radius:4px;background:var(--c-primary-2);display:inline-block"></i>Dijawab</span><span class="row gap1"><i style="width:12px;height:12px;border-radius:50%;background:var(--c-amber);display:inline-block"></i>Ragu-ragu</span></div>${$('.qnav') ? $('.qnav').outerHTML : ''}${Q.mode !== 'review' ? `<button class="btn ${Q.mode === 'ujian' ? 'btn-red' : 'btn-primary'} btn-block mt4" data-act="selesaiKuis">${ic('flag')} Selesai & Kumpulkan</button>` : ''}`, { title: 'Daftar Soal' }); };
ACT.selesaiKuis = () => { closeModal(); selesaiKuis(false); };

async function selesaiKuis(paksa) {
  const Q = S.quiz; if (!Q || Q.selesai) return;
  const belum = Q.soal.filter(s => Q.jawab[s.id] === undefined).length, ragu = Object.keys(Q.ragu).length;
  if (!paksa && !await confirmBox(`${belum ? `Masih ada <b>${belum}</b> soal belum dijawab. ` : 'Semua soal sudah dijawab. '}${ragu ? `Ada <b>${ragu}</b> soal ditandai ragu-ragu. ` : ''}Kumpulkan sekarang?`, 'Kumpulkan')) return;
  Q.selesai = true; clearInterval(_qTimer); clearTimeout(_qSave);
  const payload = { paket_id: Q.paket_id, jawaban: Q.jawab, mulai: Q.mulai, mode: Q.mode, jenis: Q.jenis === '模擬試験' ? '模擬試験' : 'latihan', label: Q.tag || '', ids: Q.paket_id ? [] : Q.soal.map(s => s.id) };
  LS.del('gp_quiz');
  // hasil lokal (instan) — server menghitung ulang dari kunci asli
  const lokal = hitungLokal(Q);
  if (Q.mode === 'latihan') {
    S.hasil = Object.assign(lokal, { label: Q.label, soal: Q.soal, garis_aman: S.boot.garis_aman });
    tambahHasilLokal(Q, lokal); go('m/hasil', {}, { replace: true });
    API.call('m.ujian.selesai', payload, { silent: true }).then(() => muatBoot(true)).catch(() => antrekanHasil(payload));
    return;
  }
  loading(true);
  try {
    const r = await API.call('m.ujian.selesai', payload, { silent: true, timeout: 60000 });
    S.hasil = Object.assign(r, { label: Q.label, soal: r.pembahasan || null });
    tambahHasilLokal(Q, r); go('m/hasil', {}, { replace: true, force: true }); muatBoot(true);
  } catch (e) {
    antrekanHasil(payload);
    S.hasil = { pending: true, label: Q.label, skor: null, total: Q.soal.length }; go('m/hasil', {}, { replace: true, force: true });
  } finally { loading(false); }
}
function antrekanHasil(p) { let a = LS.get('gp_ujian_pending') || []; if (!Array.isArray(a)) a = [a]; a.push(p); LS.set('gp_ujian_pending', a); syncDot(); OB.schedule(5000); }
function hitungLokal(Q) {
  const per = {}, jaw = {}; let skor = 0;
  Q.soal.forEach(s => { const k = s.kamoku || '総合', j = Q.jawab[s.id] === undefined ? '' : String(Q.jawab[s.id]); per[k] = per[k] || { b: 0, t: 0 }; per[k].t++; if (s.kunci !== undefined) { const b = j !== '' && j === String(s.kunci); if (b) { per[k].b++; skor++; } jaw[s.id] = [j, String(s.kunci)]; } });
  return { skor, total: Q.soal.length, per_kamoku: per, jawaban: jaw, pembahasan_boleh: true };
}
function tambahHasilLokal(Q, r) {
  const B = S.boot; if (!B || B.profil.pratinjau) return;
  B.hasil.push({ id: 'L' + Date.now(), jenis: Q.jenis === '模擬試験' ? '模擬試験' : 'latihan', paket_soal_id: Q.paket_id || Q.tag, selesai: new Date().toISOString(), skor: r.skor, total: r.total, per_kamoku: r.per_kamoku });
  const p = B.paket_soal.find(x => x.id === Q.paket_id); if (p) { const v = pct(r.skor, r.total); p.dikerjakan = true; p.terbaik = Math.max(p.terbaik || 0, v); }
  const jaw = r.jawaban || {}; const sal = new Set(B.salah); Object.keys(jaw).forEach(k => { if (String(jaw[k][0]) === String(jaw[k][1])) sal.delete(k); else sal.add(k); }); B.salah = [...sal];
  catatAktivitas(3); recalcLocal(); if (S.auth) LS.set('gp_boot_' + S.auth.email, B);
}

/* ---------- Hasil ---------- */
R['m/hasil'] = () => {
  const H = S.hasil; S.ui.title = 'Hasil';
  if (!H) { setTimeout(() => go('m/soal', {}, { replace: true }), 0); return ''; }
  if (H.pending) return `<div class="res-hero"><div class="score" style="font-size:40px">${ic('cloud_upload')}</div><h2 style="color:#fff" class="mt3">Jawaban tersimpan di HP</h2><p class="mt2" style="opacity:.9">Koneksi terputus. Jawabanmu akan dikirim otomatis begitu online — tidak ada yang hilang.</p><button class="btn btn-white mt4" data-act="kirimUlangHasil">Coba kirim sekarang</button></div>`;
  const p = pct(H.skor, H.total), aman = H.garis_aman || (S.boot && S.boot.garis_aman) || 60, lulus = p >= aman;
  const per = H.per_kamoku || {}, nol = Object.keys(per).filter(k => per[k].t && !per[k].b);
  const salahIds = Object.keys(H.jawaban || {}).filter(k => String(H.jawaban[k][0]) !== String(H.jawaban[k][1]));
  return `<div class="res-hero"><div class="tiny" style="letter-spacing:.1em;text-transform:uppercase;opacity:.85">${furi(H.label || 'Hasil')}</div>
    <div class="row mt3" style="justify-content:center;gap:20px"><div><div class="score">${p}<span style="font-size:28px">%</span></div><div class="small" style="opacity:.85">${H.skor} benar dari ${H.total} soal</div></div>${lulus ? stamp('lg') : ''}</div>
    <p class="mt3">${lulus ? `Di atas garis aman ${aman}% — pertahankan! \uD83C\uDF89` : `Garis aman ${aman}%. Ulangi soal yang salah dan baca TRIK JITU-nya ya \uD83D\uDCAA`}</p></div>
    ${nol.length ? `<div class="card row" style="border-left:4px solid var(--c-bad)">${ic('warning', 'fill')}<div class="small"><b>Peringatan nilai 0:</b> <span class="jp">${nol.map(esc).join('、')}</span>. Di ujian asli, nilai 0 di satu 科目 = tidak lulus!</div></div>` : ''}
    <div class="card"><h3 class="mb3">Nilai per 科目</h3>${hbars(per, aman)}</div>
    ${H.pembahasan_boleh === false ? `<div class="card small muted row">${ic('lock_clock')} Pembahasan akan dibuka setelah 模擬試験 ditutup.</div>` : ''}
    <div class="grid g3" style="gap:8px">${H.soal && H.soal.length ? `<button class="btn btn-primary" data-act="lihatBahas">${ic('menu_book')} Lihat pembahasan</button>` : ''}
      ${salahIds.length && H.pembahasan_boleh !== false ? `<button class="btn btn-light" data-act="ulangHasil">${ic('replay')} Ulangi yang salah (${salahIds.length})</button>` : ''}
      <button class="btn btn-ghost" data-go="m/soal">Kembali ke Soal</button></div>`;
};
function hbars(per, aman) {
  const ks = Object.keys(per); if (!ks.length) return '<div class="small muted">Belum ada data.</div>';
  return `<div class="hbars">${ks.map(k => { const v = pct(per[k].b, per[k].t); return `<div class="r"><span class="jp trunc" title="${esc(k)}">${esc(k)}</span><div class="bar"><i style="width:${v}%;background:${v >= aman ? 'var(--c-ok)' : v === 0 ? 'var(--c-bad)' : 'var(--c-amber)'}"></i><span class="safe" style="left:${aman}%"></span></div><b class="small" style="text-align:right">${v}%</b></div>`; }).join('')}<div class="tiny muted row gap1"><span style="width:2px;height:12px;background:var(--c-red);display:inline-block"></span> garis aman ${aman}%</div></div>`;
}
ACT.lihatBahas = () => { const H = S.hasil; const jaw = {}; Object.keys(H.jawaban || {}).forEach(k => { if (H.jawaban[k][0] !== '') jaw[k] = H.jawaban[k][0]; }); S.quiz = { mode: 'review', label: H.label, jenis: 'Pembahasan', soal: H.soal, idx: 0, jawab: jaw, ragu: {}, cek: {}, terjemah: true }; go('m/kuis'); };
ACT.ulangHasil = async () => {
  const H = S.hasil, ids = Object.keys(H.jawaban || {}).filter(k => String(H.jawaban[k][0]) !== String(H.jawaban[k][1]));
  let soal = (H.soal || []).filter(s => ids.indexOf(s.id) > -1 && s.kunci !== undefined);
  if (soal.length < ids.length) { try { soal = await API.call('m.soal.ids', { ids }); } catch (e) { return toast(e.message, 'err'); } }
  mulaiLatihanBebas(soal, 'Ulangi yang salah', 'ulang_salah');
};
ACT.kirimUlangHasil = () => OB.flush();

/* ---------- Riwayat & analisa nilai ---------- */
R['m/riwayat'] = () => {
  const B = S.boot; S.ui.title = 'Riwayat Nilai';
  const per = {}; B.hasil.forEach(h => Object.keys(h.per_kamoku || {}).forEach(k => { per[k] = per[k] || { b: 0, t: 0 }; per[k].b += num(h.per_kamoku[k].b); per[k].t += num(h.per_kamoku[k].t); }));
  const mogi = B.hasil.filter(h => h.jenis === '模擬試験'), nama = {}; B.paket_soal.forEach(p => nama[p.id] = p.nama);
  return `<div class="tabs"><button class="tab" data-go="m/soal">${ic('quiz')} 13 Paket Soal</button><button class="tab on">${ic('analytics')} Riwayat Nilai</button></div>
    <div class="grid g2" style="align-items:start"><div class="card"><h3 class="mb3">Nilai per 科目 (semua latihan)</h3>${hbars(per, B.garis_aman)}</div>
    <div class="card"><h3>Perkembangan 模擬試験</h3>${lineChart(mogi.map(h => ({ l: fTgl(h.selesai).slice(0, 6), v: pct(h.skor, h.total) })), B.garis_aman)}</div></div>
    <div class="card row-b wrap"><div><h3>Soal yang sering salah</h3><p class="small muted">${B.salah.length} soal masih salah di percobaan terakhir.</p></div><button class="btn btn-primary" data-act="ulangSalah" ${B.salah.length ? '' : 'disabled'}>${ic('replay')} Ulangi soal yang salah</button></div>
    <div class="card"><h3 class="mb3">Riwayat pengerjaan</h3><div class="col gap2">${B.hasil.slice().reverse().map(h => { const v = pct(h.skor, h.total); return `<div class="list-card" style="padding:8px 0;border-bottom:1px solid var(--c-line)"><div class="kbox ${h.jenis === '模擬試験' ? 'red' : ''}" style="font-size:12px">${h.jenis === '模擬試験' ? '模擬' : '練習'}</div><div class="f1"><b class="small jp">${furi(nama[h.paket_soal_id] || (h.paket_soal_id === 'ulang_salah' ? 'Ulangi yang salah' : 'Latihan acak'))}</b><div class="tiny muted">${fRel(h.selesai)} · ${h.skor}/${h.total}</div></div><b style="color:${v >= B.garis_aman ? 'var(--c-ok)' : 'var(--c-amber)'}">${v}%</b>${String(h.id).charAt(0) !== 'L' ? `<button class="btn-ico sm" data-act="detailHasil" data-id="${esc(h.id)}" aria-label="Detail">${ic('chevron_right')}</button>` : ''}</div>`; }).join('') || '<div class="empty">Belum ada riwayat. Yuk mulai latihan!</div>'}</div></div>`;
};
function lineChart(pts, aman) {
  if (!pts.length) return '<div class="empty small">Belum ada 模擬試験. Kerjakan simulasi pertamamu!</div>';
  const W = 320, H = 150, px = i => 20 + (pts.length === 1 ? (W - 40) / 2 : i * (W - 40) / (pts.length - 1)), py = v => 12 + (100 - v) / 100 * (H - 36);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + px(i).toFixed(1) + ',' + py(p.v).toFixed(1)).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="Grafik nilai 模擬試験"><line x1="16" x2="${W - 10}" y1="${py(aman)}" y2="${py(aman)}" stroke="var(--c-red)" stroke-dasharray="4 4" stroke-width="1.5"/><text x="${W - 10}" y="${py(aman) - 4}" text-anchor="end" font-size="9" fill="var(--c-red)">aman ${aman}%</text>
    <path d="${d}" fill="none" stroke="var(--c-primary-2)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${pts.map((p, i) => `<circle cx="${px(i)}" cy="${py(p.v)}" r="4.5" fill="${p.v >= aman ? '#16A34A' : '#F59E0B'}" stroke="#fff" stroke-width="2"/><text x="${px(i)}" y="${py(p.v) - 9}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--c-head)">${p.v}%</text><text x="${px(i)}" y="${H - 4}" text-anchor="middle" font-size="9" fill="var(--c-muted)">${esc(p.l)}</text>`).join('')}</svg>`;
}
ACT.detailHasil = async el => {
  try { const d = await API.call('m.hasil.detail', { id: el.dataset.id }); const p = S.boot.paket_soal.find(x => x.id === (S.boot.hasil.find(h => h.id === el.dataset.id) || {}).paket_soal_id); S.hasil = Object.assign(d, { label: p ? p.nama : 'Hasil latihan', garis_aman: S.boot.garis_aman }); go('m/hasil'); } catch (e) { toast(e.message, 'err'); }
};
/* ============================================================================
 * DASHBOARD ADMIN: ringkasan & grafik, CRUD generik berbasis skema, member,
 * pembayaran, laporan soal, CRM (Hari ini, Kontak, Segmen, Kampanye, Follow-up),
 * export, pengaturan, legal, admin, log, antrean, migrasi.
 * ========================================================================== */
const STATUS = [['aktif', 'Aktif'], ['nonaktif', 'Nonaktif']];
const YN = 'yn';
const F = (k, l, t = 'text', x = {}) => Object.assign({ k, l, t }, x);
const MODS = {
  hero: { sheet: 'Hero', judul: 'Hero / Gambar Promosi', ico: 'view_carousel', urut: true, cols: [['judul', 'Judul'], ['cta_teks', 'Tombol'], ['urutan', '#'], ['status', 'Status']],
    f: [F('judul', 'Judul', 'furi', { req: 1 }), F('subjudul', 'Subjudul', 'textarea'), F('gambar_url', 'Gambar promosi', 'img', { folder: 'publik' }), F('cta_teks', 'Teks tombol'), F('cta_link', 'Link tombol', 'text', { help: '#coba, #paket, atau https://…' }), F('urutan', 'Urutan', 'num'), F('status', 'Status', 'sel', { opt: STATUS })] },
  promo: { sheet: 'Promo', judul: 'Promo Harga', ico: 'local_offer', cols: [['judul', 'Judul'], ['harga_promo', 'Harga', rp], ['berakhir', 'Berakhir', fTgl], ['status', 'Status']],
    f: [F('judul', 'Judul', 'text', { req: 1 }), F('teks', 'Teks', 'textarea'), F('gambar_banner', 'Gambar banner', 'img', { folder: 'publik' }), F('paket_id', 'Paket', 'paket', { req: 1 }), F('harga_promo', 'Harga promo (Rp)', 'num', { req: 1 }), F('link_lynk_promo', 'Link Lynk.id promo', 'text', { req: 1 }), F('mulai', 'Mulai', 'dt'), F('berakhir', 'Berakhir', 'dt', { req: 1 }), F('status', 'Status', 'sel', { opt: STATUS })] },
  paket: { sheet: 'Paket', judul: 'Paket & Harga', ico: 'sell', urut: true, cols: [['nama', 'Nama'], ['ujian_ke', 'Ujian'], ['harga', 'Harga', rp], ['label', 'Label'], ['status', 'Status']],
    f: [F('nama', 'Nama paket', 'text', { req: 1 }), F('ujian_ke', 'Angkatan (ujian ke-)', 'angkatan', { req: 1 }), F('deskripsi', 'Deskripsi', 'textarea'), F('isi_paket', 'Isi paket (1 baris = 1 poin)', 'textarea'), F('harga', 'Harga (Rp)', 'num', { req: 1 }), F('harga_coret', 'Harga coret (Rp)', 'num'), F('link_lynk', 'Link produk Lynk.id', 'text', { req: 1 }), F('akses', 'Akses', 'text', { help: 'materi,soal,zoom' }), F('label', 'Label', 'text', { help: 'mis. Terlaris' }), F('urutan', 'Urutan', 'num'), F('status', 'Status', 'sel', { opt: STATUS })] },
  pengajar: { sheet: 'ProfilPengajar', judul: 'Profil Pengajar', ico: 'school', urut: true, cols: [['nama', 'Nama'], ['peran', 'Peran'], ['jumlah_murid', 'Murid'], ['jumlah_lulus', 'Lulus'], ['status', 'Status']],
    f: [F('nama', 'Nama', 'text', { req: 1 }), F('foto_url', 'Foto', 'img', { folder: 'publik' }), F('peran', 'Peran'), F('pengalaman', 'Pengalaman', 'textarea'), F('keahlian', 'Keahlian', 'textarea'), F('jumlah_murid', 'Jumlah murid', 'num'), F('jumlah_lulus', 'Jumlah lulus', 'num'), F('pesan_singkat', 'Pesan singkat', 'textarea'), F('tiktok', 'TikTok'), F('instagram', 'Instagram'), F('urutan', 'Urutan', 'num'), F('status', 'Status', 'sel', { opt: STATUS })] },
  bukti: { sheet: 'BuktiLulus', judul: 'Bukti Lulus 合格', ico: 'workspace_premium', cols: [['nama_member', 'Nama'], ['ujian_ke', 'Ujian'], ['tanggal', 'Tanggal', fTgl], ['status', 'Status']],
    f: [F('nama_member', 'Nama member', 'text', { req: 1 }), F('ujian_ke', 'Ujian ke-', 'num'), F('foto_url', 'Foto / sertifikat', 'img', { folder: 'publik' }), F('cerita_singkat', 'Cerita singkat', 'textarea'), F('tanggal', 'Tanggal', 'date'), F('status', 'Status', 'sel', { opt: STATUS })] },
  testimoni: { sheet: 'Testimoni', judul: 'Testimoni', ico: 'reviews', cols: [['nama', 'Nama'], ['asal', 'Asal'], ['rating', '★'], ['status', 'Status']],
    f: [F('nama', 'Nama', 'text', { req: 1 }), F('asal', 'Asal / tempat kerja'), F('isi', 'Isi testimoni', 'textarea', { req: 1 }), F('avatar_url', 'Foto', 'img', { folder: 'publik' }), F('rating', 'Rating (1–5)', 'sel', { opt: [5, 4, 3, 2, 1].map(x => [x, '★'.repeat(x)]) }), F('status', 'Status', 'sel', { opt: STATUS })] },
  kurikulum: { sheet: 'Kurikulum', judul: 'Kurikulum', ico: 'menu_book', urut: true, cols: [['kamoku', '科目'], ['judul', 'Judul'], ['urutan', '#']],
    f: [F('kamoku', '科目', 'kamoku', { req: 1 }), F('judul', 'Judul'), F('ringkasan', 'Ringkasan', 'textarea'), F('urutan', 'Urutan', 'num')] },
  faq: { sheet: 'FAQ', judul: 'FAQ', ico: 'help', urut: true, cols: [['pertanyaan', 'Pertanyaan'], ['urutan', '#'], ['status', 'Status']],
    f: [F('pertanyaan', 'Pertanyaan', 'text', { req: 1 }), F('jawaban', 'Jawaban', 'textarea', { req: 1 }), F('urutan', 'Urutan', 'num'), F('status', 'Status', 'sel', { opt: STATUS })] },
  alur: { sheet: 'AlurBelajar', judul: 'Alur Belajar', ico: 'route', urut: true, cols: [['langkah_ke', '#'], ['judul', 'Judul'], ['tipe_item', 'Tipe'], ['bobot', 'Bobot'], ['wajib', 'Wajib']], tools: [['alurPratinjau', 'insights', 'Pratinjau target']],
    f: [F('langkah_ke', 'Langkah ke-', 'num', { req: 1 }), F('judul', 'Judul', 'furi', { req: 1 }), F('deskripsi', 'Deskripsi', 'textarea'), F('tipe_item', 'Tipe item', 'sel', { opt: [['materi', 'Materi PDF'], ['gambar', 'Materi gambar'], ['kosakata', 'Kosakata'], ['paket_soal', 'Paket soal'], ['zoom', 'Kelas Zoom']], ubah: 1 }), F('item_id', 'Item yang ditautkan', 'itemAlur', { req: 1 }), F('bobot', 'Bobot (perkiraan lama belajar)', 'num', { help: 'default 1' }), F('wajib', 'Wajib', YN), F('urutan', 'Urutan', 'num')] },
  materi: { sheet: 'Materi', judul: 'Materi & Gambar', ico: 'picture_as_pdf', urut: true, filter: 'kamoku', cols: [['kamoku', '科目'], ['judul', 'Judul'], ['tipe', 'Tipe'], ['gratis', 'Gratis'], ['status', 'Status']],
    f: [F('kamoku', '科目', 'kamoku', { req: 1 }), F('judul', 'Judul', 'furi', { req: 1 }), F('tipe', 'Tipe', 'sel', { opt: [['pdf', 'PDF'], ['gambar', 'Galeri gambar'], ['teks', 'Teks']], ubah: 1 }),
      F('file_id', 'File PDF (privat)', 'pdf', { show: r => (r.tipe || 'pdf') === 'pdf' }), F('daftar_gambar', 'Gambar galeri (privat)', 'imgs', { show: r => r.tipe === 'gambar' }), F('keterangan_gambar', 'Keterangan (1 baris per gambar)', 'textarea', { show: r => r.tipe === 'gambar' }),
      F('isi_teks', 'Isi teks', 'textarea', { show: r => r.tipe === 'teks' }), F('paket_akses', 'Akses paket', 'akses'), F('gratis', 'Gratis (tanpa paket)', YN), F('urutan', 'Urutan', 'num'), F('status', 'Status', 'sel', { opt: STATUS })] },
  kosakata: { sheet: 'Kosakata', judul: 'Kosakata', ico: 'style', urut: true, imp: 1, filter: 'kamoku', cols: [['kata_jp', 'Kata', v => furi(v)], ['arti_id', 'Arti'], ['kamoku', '科目'], ['penting', '★']],
    f: [F('kamoku', '科目', 'kamoku', { req: 1 }), F('kata_jp', 'Kata JP (format ｜漢字《かんじ》)', 'furi', { req: 1 }), F('arti_id', 'Arti Indonesia', 'text', { req: 1 }), F('contoh_jp', 'Contoh kalimat JP', 'furi'), F('contoh_id', 'Arti contoh'), F('gambar_url', 'Gambar (opsional)', 'img', { folder: 'publik' }), F('penting', '★ Penting', YN), F('urutan', 'Urutan', 'num'), F('status', 'Status', 'sel', { opt: STATUS })] },
  paketsoal: { sheet: 'PaketSoal', judul: 'Paket Soal (13)', ico: 'quiz', urut: true, cols: [['nama', 'Nama', v => furi(v)], ['jenis', 'Jenis'], ['mode', 'Mode'], ['durasi_menit', 'Menit'], ['status', 'Status']],
    f: [F('nama', 'Nama', 'furi', { req: 1 }), F('jenis', 'Jenis', 'sel', { opt: [['過去問', '過去問'], ['練習', '練習'], ['模擬試験', '模擬試験']] }), F('ujian_ke', 'Ujian ke- (過去問)', 'num'), F('deskripsi', 'Deskripsi', 'textarea'), F('jumlah_soal', 'Jumlah soal', 'num'),
      F('mode', 'Mode', 'sel', { opt: [['latihan', 'Latihan'], ['ujian_bertimer', 'Ujian bertimer']] }), F('durasi_menit', 'Durasi (menit)', 'num'), F('paket_akses', 'Akses paket', 'akses'), F('buka', 'Buka (opsional)', 'dt'), F('tutup', 'Tutup (opsional)', 'dt'),
      F('tampilkan_pembahasan', 'Tampilkan pembahasan', 'sel', { opt: [['langsung', 'Langsung'], ['setelah_selesai', 'Setelah selesai'], ['setelah_tutup', 'Setelah ditutup']] }), F('urutan', 'Urutan', 'num'), F('status', 'Status', 'sel', { opt: STATUS })] },
  banksoal: { sheet: 'BankSoal', judul: 'Bank Soal', ico: 'library_books', imp: 1, filter: 'paket_soal_id', cols: [['nomor', 'No'], ['sesi', 'Sesi'], ['kamoku', '科目'], ['soal_jp', 'Soal', v => esc(plainJP(v).slice(0, 60)) + '…'], ['kunci', 'Kunci'], ['gratis', 'Gratis']],
    f: [F('paket_soal_id', 'Paket soal', 'paketSoal', { req: 1 }), F('sesi', 'Sesi', 'sel', { opt: [['午前', '午前'], ['午後', '午後']] }), F('bagian', 'Bagian', 'sel', { opt: [['A', 'A'], ['B', 'B'], ['C', 'C']] }), F('nomor', 'Nomor', 'num', { req: 1 }), F('kamoku', '科目', 'kamoku', { req: 1 }),
      F('soal_jp', 'Soal JP (｜漢字《かんじ》)', 'furi', { req: 1, full: 1 }), F('soal_id', 'Terjemahan soal', 'textarea'), F('gambar_url', 'Gambar soal', 'img', { folder: 'soal' }),
      ...[1, 2, 3, 4, 5].map(i => [F('pilihan_' + i, 'Pilihan ' + i + ' (JP)', 'furi', { rows: 2 }), F('pilihan_' + i + '_id', 'Pilihan ' + i + ' (ID)')]).flat(),
      F('kunci', 'Kunci jawaban', 'sel', { opt: [1, 2, 3, 4, 5].map(x => [x, x]), req: 1 }), F('analisa', 'Analisa ○× (1 baris per pilihan: no|○/×|teks JP|teks ID)', 'textarea', { rows: 6 }),
      F('trik_kata_kunci', 'TRIK 1 · KATA KUNCI', 'textarea', { rows: 2 }), F('trik_rumus_cepat', 'TRIK 2 · RUMUS CEPAT', 'textarea', { rows: 2 }), F('trik_jembatan_ingatan', 'TRIK 3 · JEMBATAN INGATAN', 'textarea', { rows: 2 }), F('trik_awas_jebakan', 'TRIK 4 · AWAS JEBAKAN', 'textarea', { rows: 2 }),
      F('kosakata', 'Kosakata penting (漢字（かな）=arti; …)', 'textarea', { rows: 2 }), F('gratis', 'Soal gratis (Coba Gratis)', YN), F('status', 'Status', 'sel', { opt: STATUS })] },
  zoom: { sheet: 'KelasZoom', judul: 'Kelas Zoom', ico: 'videocam', cols: [['judul', 'Judul'], ['mulai', 'Mulai', fWaktu], ['rekaman_youtube_id', 'Rekaman', v => v ? '✓' : '–'], ['status', 'Status']],
    f: [F('judul', 'Judul', 'text', { req: 1 }), F('kamoku', '科目', 'kamoku'), F('pengajar', 'Pengajar'), F('mulai', 'Mulai', 'dt', { req: 1 }), F('durasi_menit', 'Durasi (menit)', 'num'), F('link_zoom', 'Link Zoom', 'text', { req: 1 }), F('meeting_id', 'Meeting ID'), F('passcode', 'Passcode'), F('paket_akses', 'Akses paket', 'akses'),
      F('rekaman_youtube_id', 'ID rekaman YouTube (unlisted)', 'text', { help: 'Bagian setelah watch?v=' }), F('materi_terkait_id', 'Materi terkait', 'materiSel'), F('status', 'Status', 'sel', { opt: [['akan_datang', 'Akan datang'], ['selesai', 'Selesai']] })] },
  pengumuman: { sheet: 'Pengumuman', judul: 'Pengumuman & Blast', ico: 'campaign', cols: [['judul', 'Judul'], ['target', 'Target'], ['sematkan', 'Pin'], ['kirim_wa', 'WA'], ['status', 'Status']], rowAct: [['blastPeng', 'send', 'Blast WA']],
    f: [F('judul', 'Judul', 'text', { req: 1 }), F('isi', 'Isi', 'textarea', { req: 1 }), F('gambar_url', 'Gambar', 'img', { folder: 'publik' }), F('target', 'Target', 'target'), F('sematkan', 'Sematkan di beranda', YN), F('kirim_wa', 'Kirim juga ke WhatsApp', YN), F('tampil_mulai', 'Tampil mulai', 'dt'), F('tampil_sampai', 'Tampil sampai', 'dt'), F('status', 'Status', 'sel', { opt: STATUS })] },
  leads: { sheet: 'Leads', judul: 'Leads', ico: 'person_search', filter: 'sumber', noAdd: 1, cols: [['waktu', 'Waktu', fRel], ['nama', 'Nama'], ['no_wa', 'WA'], ['sumber', 'Sumber'], ['skor_coba_gratis', 'Skor'], ['status_followup', 'Follow-up']], rowAct: [['chatWA', 'chat', 'Chat WA']],
    f: [F('nama', 'Nama'), F('no_wa', 'No WA'), F('email', 'Email'), F('status_followup', 'Status follow-up', 'sel', { opt: [['baru', 'Baru'], ['dihubungi', 'Dihubungi'], ['tertarik', 'Tertarik'], ['daftar', 'Daftar'], ['menunggu_bayar', 'Menunggu bayar'], ['tidak_tertarik', 'Tidak tertarik']] }), F('catatan', 'Catatan', 'textarea')] },
  followup: { sheet: 'FollowUpOtomatis', judul: 'Follow-up Otomatis', ico: 'autorenew', cols: [['nama', 'Nama'], ['pemicu', 'Pemicu'], ['jeda_hari', 'Jeda (hari)'], ['aktif', 'Aktif']],
    f: [F('nama', 'Nama aturan', 'text', { req: 1 }), F('pemicu', 'Pemicu', 'sel', { opt: [['coba_gratis_belum_daftar', 'Coba gratis, belum daftar'], ['daftar_belum_bayar', 'Daftar, belum bayar'], ['member_tidak_aktif_7_hari', 'Member tidak aktif'], ['masa_aktif_berakhir', 'Masa aktif berakhir / survei']] }), F('jeda_hari', 'Jeda (hari)', 'num', { req: 1 }),
      F('template', 'Template pesan', 'textarea', { help: 'Variabel: {nama} {skor} {paket} {link_promo} {sisa_hari}' }), F('berhenti_bila', 'Berhenti bila', 'text', { help: 'bayar,opt_out,dibalas' }), F('aktif', 'Aktif', YN)] },
  kampanye: { sheet: 'Kampanye', judul: 'Kampanye Blast WA', ico: 'forward_to_inbox', cols: [['nama', 'Nama'], ['status', 'Status'], ['jumlah_target', 'Target'], ['terkirim', 'Terkirim'], ['dilewati_opt_out', 'Dilewati'], ['dibalas', 'Dibalas']], rowAct: [['pratinjauKamp', 'visibility', 'Pratinjau'], ['kirimKamp', 'send', 'Kirim']],
    f: [F('nama', 'Nama kampanye', 'text', { req: 1 }), F('segmen_id', 'Segmen', 'segmen', { req: 1 }), F('template', 'Template pesan', 'textarea', { req: 1, rows: 6, help: 'Variabel: {nama} {skor} {paket} {link_promo} {sisa_hari}. Kalimat "Balas STOP…" ditambahkan otomatis.' }), F('jadwal_kirim', 'Jadwal kirim (kosong = kirim manual)', 'dt')] },
  legal: { sheet: 'HalamanLegal', judul: 'Halaman Legal', ico: 'gavel', su: 1, cols: [['id', 'ID'], ['judul', 'Judul'], ['versi', 'Versi'], ['diperbarui', 'Diperbarui', fTgl]],
    f: [F('id', 'ID', 'sel', { opt: [['syarat', 'syarat'], ['privasi', 'privasi'], ['refund', 'refund']] }), F('judul', 'Judul', 'text', { req: 1 }), F('isi', 'Isi (**tebal**, baris baru)', 'textarea', { rows: 14 }), F('versi', 'Versi', 'text', { help: 'Naikkan versi S&K agar member menyetujui ulang' })] },
  jadwal: { sheet: 'JadwalUjian', judul: 'Jadwal Ujian / Angkatan', ico: 'event', su: 1, cols: [['ujian_ke', 'Ujian'], ['nama_angkatan', 'Nama'], ['tanggal_ujian', 'Tanggal', fTgl], ['status', 'Status']],
    f: [F('ujian_ke', 'Ujian ke-', 'num', { req: 1 }), F('nama_angkatan', 'Nama angkatan', 'text', { req: 1 }), F('tanggal_ujian', 'Tanggal ujian', 'date'), F('tampil_di_depan', 'Tampil di halaman depan', YN), F('status', 'Status', 'sel', { opt: [['buka', 'Buka'], ['berjalan', 'Berjalan'], ['selesai', 'Selesai']] })] },
  pengguna: { sheet: 'Pengguna', judul: 'Akun Admin', ico: 'admin_panel_settings', su: 1, key: 'email', cols: [['email', 'Email'], ['nama', 'Nama'], ['role', 'Peran'], ['status', 'Status']],
    f: [F('email', 'Email', 'text', { req: 1 }), F('nama', 'Nama', 'text', { req: 1 }), F('role', 'Peran', 'sel', { opt: [['admin', 'Admin'], ['superadmin', 'Superadmin']] }), F('status', 'Status', 'sel', { opt: STATUS }), F('_sandi', 'Sandi (isi untuk akun baru / reset)', 'pass')] }
};
const ANAV = [
  ['Utama', [['ringkasan', 'dashboard', 'Ringkasan'], ['hariini', 'today', 'Hari ini', 'hari_ini']]],
  ['CRM', [['kontak', 'contacts', 'Kontak'], ['segmen', 'filter_alt', 'Segmen'], ['kampanye', 'forward_to_inbox', 'Kampanye'], ['followup', 'autorenew', 'Follow-up otomatis'], ['leads', 'person_search', 'Leads']]],
  ['Halaman Depan', [['hero', 'view_carousel', 'Hero'], ['promo', 'local_offer', 'Promo'], ['paket', 'sell', 'Paket'], ['pengajar', 'school', 'Profil Pengajar'], ['bukti', 'workspace_premium', 'Bukti Lulus'], ['testimoni', 'reviews', 'Testimoni'], ['kurikulum', 'menu_book', 'Kurikulum'], ['faq', 'help', 'FAQ']]],
  ['Belajar', [['alur', 'route', 'Alur Belajar'], ['materi', 'picture_as_pdf', 'Materi & Gambar'], ['kosakata', 'style', 'Kosakata'], ['paketsoal', 'quiz', 'Paket Soal'], ['banksoal', 'library_books', 'Bank Soal'], ['zoom', 'videocam', 'Kelas Zoom']]],
  ['Operasional', [['pengumuman', 'campaign', 'Pengumuman'], ['laporan', 'flag', 'Laporan Soal', 'laporan'], ['member', 'group', 'Member'], ['pembayaran', 'payments', 'Pembayaran', 'bayar'], ['export', 'download', 'Export'], ['antrean', 'outbox', 'Antrean Notif']]],
  ['Superadmin', [['pengaturan', 'settings', 'Pengaturan'], ['legal', 'gavel', 'Halaman Legal'], ['jadwal', 'event', 'Jadwal Ujian'], ['pengguna', 'admin_panel_settings', 'Akun Admin'], ['log', 'history', 'Log Aktivitas'], ['migrasi', 'move_up', 'Migrasi Data']], 'su']
];
const isSU = () => S.auth && S.auth.role === 'superadmin';

function shellAdmin(route, body) {
  const key = route.slice(2), A = S.adm, badge = (A && A.badge) || {};
  const nav = ANAV.filter(g => !g[2] || isSU()).map(g => `<div class="grp">${g[0]}</div>${g[1].map(n => `<button class="${key === n[0] ? 'on' : ''}" data-go="a/${n[0]}" data-act="tutupDrawer">${ic(n[1])}<span>${n[2]}</span>${n[3] && badge[n[3]] ? `<span class="cnt">${badge[n[3]]}</span>` : ''}</button>`).join('')}`).join('');
  const item = ANAV.map(g => g[1]).flat().find(n => n[0] === key);
  return `<div class="app"><aside class="side"><div>${logo()}<nav>${nav}</nav></div><div class="col gap2 mt4">
    <button class="sbtn" data-act="pratinjauMember">${ic('preview')}<span>Pratinjau area member</span></button><button class="sbtn" style="color:var(--c-bad)" data-act="keluar">${ic('logout')}<span>Keluar</span></button></div></aside>
  <header class="topbar"><div class="topbar-in"><button class="btn-ico only-m" data-act="menuAdmin" aria-label="Menu">${ic('menu')}</button>
    <h1 class="tt f1 trunc">${esc(item ? item[2] : 'Dashboard')}</h1><span class="chip pale only-d">${esc(S.auth.role)}</span>
    <button class="btn-ico" data-act="segarkan" aria-label="Muat ulang data">${ic('refresh')}</button><button class="btn-ico" data-act="tema" aria-label="Tema">${ic(document.documentElement.dataset.theme === 'dark' ? 'light_mode' : 'dark_mode')}</button>
    <div class="av" title="${esc(S.auth.email)}">${esc((S.auth.nama || 'A')[0])}</div></div></header>
  <main class="main" style="padding-bottom:40px"><div class="main-in fadein">${body}</div></main></div>`;
}
ACT.menuAdmin = () => {
  const d = document.createElement('div'); d.className = 'ovl'; d.id = 'drw'; d.style.alignItems = 'stretch';
  d.innerHTML = `<div class="drawer side" style="display:flex;position:fixed;left:0;right:auto;top:0;bottom:0;border-radius:0;width:280px;overflow:auto;padding:16px">${$('.side').innerHTML}</div>`;
  d.addEventListener('click', e => { if (e.target === d) d.remove(); }); $('#layer').appendChild(d);
  $$('#drw nav button').forEach(b => { b.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;border:0;background:none;width:100%;text-align:left;min-height:44px;border-radius:10px;color:var(--c-muted);font-weight:600'; if (b.classList.contains('on')) { b.style.background = 'var(--c-primary)'; b.style.color = '#fff'; } });
  $$('#drw .grp').forEach(g => g.style.cssText = 'font-size:10.5px;font-weight:800;color:var(--c-outline);text-transform:uppercase;letter-spacing:.08em;margin:12px 12px 2px');
};
ACT.pratinjauMember = async () => { toast('Membuka area member (pratinjau)…', 'info'); S.boot = null; await muatBoot(); go('m/beranda'); };
ACT.segarkan = () => { const k = S.route.slice(2), m = MODS[k]; if (m) delete S.ad[m.sheet]; S.ad['__' + k] = undefined; muatAdmin(); render(false); };

async function muatAdmin() {
  try { const d = await API.call('a.bootstrap', {}, { silent: !!S.adm }); S.adm = d; LS.set('gp_adm', d); if (S.route.startsWith('a/')) render(false); }
  catch (e) { if (!S.adm) toast(e.message, 'err'); }
}
/* Muat data sheet admin (SWR: tampil dari cache, perbarui di latar) */
function adData(sheet, action = 'a.list', payload = null, key = sheet) {
  if (S.ad[key] === undefined) {
    const c = LS.get('gp_ad_' + key); if (c) S.ad[key] = c;
    const route = S.route;
    if (!S.ad['_l_' + key]) {
      S.ad['_l_' + key] = 1;
      API.call(action, payload || { sheet }, { silent: !!c }).then(rows => { S.ad[key] = rows; try { LS.set('gp_ad_' + key, rows); } catch (e) { } if (S.route === route) render(false); })
        .catch(e => { toast(e.message, 'err'); if (!S.ad[key]) S.ad[key] = []; render(false); }).finally(() => { delete S.ad['_l_' + key]; });
    }
  }
  return S.ad[key];
}
const skelTbl = () => `<div class="sk" style="height:44px"></div><div class="sk" style="height:320px"></div>`;
function simpanAd(key) { try { LS.set('gp_ad_' + key, S.ad[key]); } catch (e) { } }

/* ---------- CRUD generik ---------- */
Object.keys(MODS).forEach(k => { R['a/' + k] = () => crudView(k); });
function crudView(key) {
  const M = MODS[key], rows = adData(M.sheet); S.ui.title = M.judul;
  if (M.su && !isSU()) return '<div class="card empty">Khusus Superadmin.</div>';
  if (!rows) return skelTbl();
  const q = (S.ui['q_' + key] || '').toLowerCase(), fv = S.ui['f_' + key] || '', lim = S.ui['lim_' + key] || 100, kunci = M.key || 'id';
  let list = rows.filter(r => (!q || JSON.stringify(r).toLowerCase().indexOf(q) > -1) && (!fv || String(r[M.filter]) === fv));
  if (M.urut) list = list.slice().sort((a, b) => num(a.urutan || a.langkah_ke) - num(b.urutan || b.langkah_ke));
  if (M.sheet === 'Leads' || M.sheet === 'Kampanye') list = list.slice().reverse();
  const fopts = M.filter ? [...new Set(rows.map(r => r[M.filter]).filter(Boolean))] : [];
  const fLabel = v => M.filter === 'paket_soal_id' ? ((S.adm && S.adm.paket_soal.find(p => p.id === v)) || { nama: v }).nama : v;
  return `<div class="row-b wrap gap2"><div class="row wrap gap2 f1"><div class="search" style="min-width:220px;flex:1;max-width:360px">${ic('search')}<input class="inp" id="qAd" data-k="${key}" placeholder="Cari…" value="${esc(S.ui['q_' + key] || '')}"></div>
      ${M.filter ? `<select class="inp" style="max-width:260px;border-radius:999px" id="fAd" data-k="${key}"><option value="">Semua ${esc(M.filter === 'paket_soal_id' ? 'paket' : M.filter)}</option>${fopts.map(v => `<option value="${esc(v)}" ${v === fv ? 'selected' : ''}>${furi(fLabel(v))}</option>`).join('')}</select>` : ''}</div>
    <div class="row wrap gap2">${(M.tools || []).map(t => `<button class="btn btn-light btn-sm" data-act="${t[0]}">${ic(t[1])} ${t[2]}</button>`).join('')}
      ${M.imp ? `<label class="btn btn-light btn-sm">${ic('upload_file')} Import CSV<input type="file" accept=".csv,text/csv,.tsv" hidden data-imp="${key}"></label>` : ''}
      <button class="btn btn-light btn-sm" data-act="csvAd" data-k="${key}">${ic('download')} CSV</button>
      ${M.noAdd ? '' : `<button class="btn btn-primary btn-sm" data-act="editAd" data-k="${key}">${ic('add')} Tambah</button>`}</div></div>
  <div class="tiny muted">${list.length} data${list.length > lim ? ' · menampilkan ' + lim : ''}</div>
  <div class="tbl-wrap"><table class="tbl"><thead><tr>${M.cols.map(c => `<th>${esc(c[1])}</th>`).join('')}<th></th></tr></thead><tbody>
    ${list.slice(0, lim).map(r => `<tr>${M.cols.map(c => `<td>${c[2] ? c[2](r[c[0]], r) : c[0] === 'status' || c[0] === 'aktif' ? stChip(r[c[0]]) : esc(r[c[0]])}</td>`).join('')}
      <td class="act">${(M.rowAct || []).map(a => `<button class="btn-ico sm" data-act="${a[0]}" data-k="${key}" data-id="${esc(r[kunci])}" title="${a[2]}" aria-label="${a[2]}">${ic(a[1])}</button>`).join('')}
      ${M.urut ? `<button class="btn-ico sm" data-act="geserAd" data-k="${key}" data-id="${esc(r[kunci])}" data-d="-1" aria-label="Naik">${ic('arrow_upward')}</button><button class="btn-ico sm" data-act="geserAd" data-k="${key}" data-id="${esc(r[kunci])}" data-d="1" aria-label="Turun">${ic('arrow_downward')}</button>` : ''}
      <button class="btn-ico sm" data-act="editAd" data-k="${key}" data-id="${esc(r[kunci])}" aria-label="Ubah">${ic('edit')}</button><button class="btn-ico sm" style="color:var(--c-bad)" data-act="hapusAd" data-k="${key}" data-id="${esc(r[kunci])}" aria-label="Hapus">${ic('delete')}</button></td></tr>`).join('') || `<tr><td colspan="${M.cols.length + 1}" class="empty">Belum ada data.</td></tr>`}
  </tbody></table></div>${list.length > lim ? `<button class="btn btn-light" data-act="lebihAd" data-k="${key}">Tampilkan lebih banyak</button>` : ''}`;
}
const stChip = v => { const s = String(v || ''); const c = /^(aktif|ya|berhasil|selesai|diperbaiki|terkirim|buka|member_aktif)/.test(s) ? 'ok' : /^(nonaktif|tidak|gagal|ditolak|dibatalkan|berakhir)/.test(s) ? 'red' : /^(baru|perlu|menunggu|antri|draf|terjadwal|berjalan|akan)/.test(s) ? 'amber' : 'ghost'; return s ? `<span class="chip ${c}">${esc(s)}</span>` : '<span class="muted">–</span>'; };
document.addEventListener('input', debounce(e => {
  if (e.target.id === 'qAd') { S.ui['q_' + e.target.dataset.k] = e.target.value; const p = e.target.selectionStart; render(false); const n = $('#qAd'); if (n) { n.focus(); n.setSelectionRange(p, p); } }
}, 250));
document.addEventListener('change', e => {
  if (e.target.id === 'fAd') { S.ui['f_' + e.target.dataset.k] = e.target.value; render(false); }
  if (e.target.dataset && e.target.dataset.imp) importCSV(e.target);
});
ACT.lebihAd = el => { S.ui['lim_' + el.dataset.k] = (S.ui['lim_' + el.dataset.k] || 100) + 200; render(false); };
ACT.csvAd = el => { const M = MODS[el.dataset.k]; unduhCSV(M.sheet + '-' + new Date().toISOString().slice(0, 10), S.ad[M.sheet] || []); };

/* Form edit generik */
function fieldHTML(f, r) {
  const v = r[f.k] === undefined || r[f.k] === null ? '' : r[f.k], id = 'f_' + f.k, A = S.adm || {};
  if (f.show && !f.show(r)) return `<div data-fw="${f.k}" class="hide"></div>`;
  const lab = `<label for="${id}">${esc(f.l)}${f.req ? ' <span style="color:var(--c-bad)">*</span>' : ''}</label>`, help = f.help ? `<span class="hint">${esc(f.help)}</span>` : '';
  const sel = (opts, extra = '') => `<select id="${id}" class="inp" name="${f.k}" ${f.req ? 'required' : ''} ${f.ubah ? 'data-ubah="1"' : ''} ${extra}><option value="">— pilih —</option>${opts.map(o => `<option value="${esc(o[0])}" ${String(o[0]) === String(v) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
  let inp;
  switch (f.t) {
    case 'textarea': inp = `<textarea id="${id}" class="inp" name="${f.k}" rows="${f.rows || 4}" ${f.req ? 'required' : ''}>${esc(v)}</textarea>`; break;
    case 'furi': inp = `<textarea id="${id}" class="inp jp" name="${f.k}" rows="${f.rows || 2}" ${f.req ? 'required' : ''} data-furi="1">${esc(v)}</textarea><div class="jp small" data-prev="${f.k}" style="line-height:2.2;background:var(--c-s1);border-radius:8px;padding:4px 10px;min-height:20px">${furi(v)}</div>`; break;
    case 'num': inp = `<input id="${id}" class="inp" type="number" step="any" name="${f.k}" value="${esc(v)}" ${f.req ? 'required' : ''}>`; break;
    case 'date': inp = `<input id="${id}" class="inp" type="date" name="${f.k}" value="${esc(String(v).slice(0, 10))}">`; break;
    case 'dt': inp = `<input id="${id}" class="inp" type="datetime-local" name="${f.k}" value="${esc(toLocalInput(v))}" data-dt="1">`; break;
    case 'pass': inp = `<input id="${id}" class="inp" type="password" name="${f.k}" autocomplete="new-password" minlength="8">`; break;
    case 'sel': inp = sel(f.opt); break;
    case YN: inp = `<label class="chk"><input type="checkbox" name="${f.k}" ${ya(v) ? 'checked' : ''}><span>Ya</span></label>`; break;
    case 'kamoku': inp = sel((A.kamoku || []).map(k => [k, k])); break;
    case 'paket': inp = sel((A.paket || []).map(p => [p.id, p.nama])); break;
    case 'paketSoal': inp = sel((A.paket_soal || []).map(p => [p.id, plainJP(p.nama)])); break;
    case 'materiSel': inp = sel((A.materi || []).map(p => [p.id, plainJP(p.judul)])); break;
    case 'segmen': inp = sel((A.segmen || []).map(p => [p.id, p.nama])); break;
    case 'angkatan': inp = sel((A.jadwal || []).map(j => [j.ujian_ke, j.nama_angkatan])); break;
    case 'target': inp = sel([['semua', 'Semua member aktif']].concat((A.jadwal || []).map(j => ['angkatan:' + j.ujian_ke, 'Angkatan ' + j.nama_angkatan])).concat((A.paket || []).map(p => ['paket:' + p.id, 'Paket ' + p.nama]))); break;
    case 'itemAlur': {
      const t = r.tipe_item, o = t === 'materi' || t === 'gambar' ? (A.materi || []).filter(m => t === 'gambar' ? m.tipe === 'gambar' : m.tipe !== 'gambar').map(m => [m.id, plainJP(m.judul)]) : t === 'paket_soal' ? (A.paket_soal || []).map(p => [p.id, plainJP(p.nama)]) : t === 'zoom' ? (A.zoom || []).map(z => [z.id, z.judul]) : t === 'kosakata' ? [['semua', 'Semua kosakata']].concat((A.kamoku || []).map(k => [k, k])) : [];
      inp = sel(o); break;
    }
    case 'akses': {
      const cur = String(v || 'semua').split(',').map(x => x.trim());
      inp = `<div class="row wrap gap2" data-multi="${f.k}"><label class="chk"><input type="checkbox" value="semua" ${cur.indexOf('semua') > -1 || !v ? 'checked' : ''}><span>Semua paket</span></label>${(A.paket || []).map(p => `<label class="chk"><input type="checkbox" value="${esc(p.id)}" ${cur.indexOf(p.id) > -1 ? 'checked' : ''}><span>${esc(p.nama)}</span></label>`).join('')}</div>`; break;
    }
    case 'img': inp = `<div class="row gap2"><input id="${id}" class="inp f1" name="${f.k}" value="${esc(v)}" placeholder="URL gambar atau unggah"><label class="btn btn-light btn-sm">${ic('upload')} Unggah<input type="file" accept="image/*" hidden data-up="${f.k}" data-folder="${f.folder || 'publik'}"></label></div>${v ? `<img src="${esc(v)}" alt="" style="max-height:90px;border-radius:8px;margin-top:6px" data-pv="${f.k}">` : `<img alt="" style="max-height:90px;border-radius:8px;margin-top:6px" class="hide" data-pv="${f.k}">`}`; break;
    case 'pdf': inp = `<div class="row gap2"><input id="${id}" class="inp f1" name="${f.k}" value="${esc(v)}" placeholder="File ID Drive (otomatis setelah unggah)"><label class="btn btn-light btn-sm">${ic('upload')} Unggah PDF<input type="file" accept="application/pdf" hidden data-up="${f.k}" data-folder="materi"></label></div>`; break;
    case 'imgs': inp = `<textarea id="${id}" class="inp" name="${f.k}" rows="2" placeholder="File ID dipisah koma">${esc(v)}</textarea><label class="btn btn-light btn-sm mt1" style="align-self:flex-start">${ic('add_photo_alternate')} Tambah gambar<input type="file" accept="image/*" multiple hidden data-up="${f.k}" data-folder="gambar" data-multi-up="1"></label>`; break;
    default: inp = `<input id="${id}" class="inp" name="${f.k}" value="${esc(v)}" ${f.req ? 'required' : ''}>`;
  }
  return `<div class="fld ${f.full ? 'full' : ''}" data-fw="${f.k}">${lab}${inp}${help}</div>`;
}
ACT.editAd = el => {
  const key = el.dataset.k, M = MODS[key], kunci = M.key || 'id', rows = S.ad[M.sheet] || [];
  const r = el.dataset.id ? Object.assign({}, rows.find(x => String(x[kunci]) === String(el.dataset.id)) || {}) : {};
  if (!el.dataset.id && M.urut) r.urutan = rows.length + 1;
  if (!el.dataset.id && M.sheet === 'AlurBelajar') r.langkah_ke = rows.length + 1;
  S.ui.editRow = r; S.ui.editKey = key;
  modal(`<form data-form="simpanAd" class="grid g2" style="gap:0 14px" novalidate>${M.f.map(f => fieldHTML(f, r)).join('')}
    <div class="row mt3" style="grid-column:1/-1;justify-content:flex-end"><button type="button" class="btn btn-light" data-act="closeModal">Batal</button><button class="btn btn-primary" type="submit">${ic('save')} Simpan</button></div></form>`, { title: (el.dataset.id ? 'Ubah ' : 'Tambah ') + M.judul, wide: M.f.length > 8 });
  $$('#ovl .fld.full').forEach(x => x.style.gridColumn = '1/-1'); $$('#ovl textarea').forEach(x => { if (x.rows > 3) x.closest('.fld').style.gridColumn = '1/-1'; });
};
/* Live preview furigana + ubah tipe → render ulang field dependen */
document.addEventListener('input', e => { const t = e.target; if (t.dataset && t.dataset.furi) { const p = $(`[data-prev="${t.name}"]`); if (p) p.innerHTML = furi(t.value); } });
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset && t.dataset.ubah && S.ui.editKey) {
    const M = MODS[S.ui.editKey], f = $('#ovl form'); if (!f) return;
    const r = Object.assign({}, S.ui.editRow); new FormData(f).forEach((v, k) => r[k] = v); S.ui.editRow = r;
    M.f.forEach(fd => { if (fd.show || fd.t === 'itemAlur') { const w = $(`[data-fw="${fd.k}"]`, f); if (w) { w.outerHTML = fieldHTML(fd, r); } } });
  }
  if (t.dataset && t.dataset.up) {
    const files = Array.from(t.files || []); if (!files.length) return;
    const lbl = t.closest('label'); lbl.classList.add('loading');
    try {
      for (const file of files) {
        let up;
        if (file.type === 'application/pdf') { if (file.size > 20 * 1024 * 1024) throw new Error('PDF maksimal 20 MB. Pecah per bab.'); up = { b64: await fileB64(file), mime: file.type }; }
        else up = await kompresGambar(file);
        const r = await API.call('a.upload', { nama: file.name, mime: up.mime, b64: up.b64, folder: t.dataset.folder }, { timeout: 120000 });
        const inp = $(`#ovl [name="${t.dataset.up}"]`);
        if (t.dataset.multiUp) inp.value = (inp.value ? inp.value.replace(/,\s*$/, '') + ',' : '') + r.id;
        else inp.value = r.url || r.id;
        const pv = $(`#ovl [data-pv="${t.dataset.up}"]`); if (pv && r.url) { pv.src = 'data:' + up.mime + ';base64,' + up.b64; pv.classList.remove('hide'); }
      }
      toast('Unggahan berhasil ✓');
    } catch (err) { toast(err.message, 'err'); } finally { lbl.classList.remove('loading'); t.value = ''; }
  }
});
FORM.simpanAd = (f, d) => {
  const key = S.ui.editKey, M = MODS[key], kunci = M.key || 'id', lama = S.ui.editRow || {};
  for (const fd of M.f) { if (fd.req && (!fd.show || fd.show(Object.assign({}, lama, d))) && (d[fd.k] === undefined || String(d[fd.k]).trim() === '')) return errField(f, fd.k, fd.l + ' wajib diisi'); }
  const row = Object.assign({}, lama);
  M.f.forEach(fd => {
    if (fd.t === 'pass') return;
    let v = d[fd.k];
    if (fd.t === YN) v = v ? 'ya' : '';
    if (fd.t === 'dt' && v) v = new Date(v).toISOString();
    if (fd.t === 'akses') v = !v || String(v).split(',').indexOf('semua') > -1 ? 'semua' : v;
    if (v !== undefined) row[fd.k] = v;
  });
  const sandi = d._sandi;
  const rows = S.ad[M.sheet] || (S.ad[M.sheet] = []), idx = lama[kunci] ? rows.findIndex(x => String(x[kunci]) === String(lama[kunci])) : -1, backup = rows.slice();
  const tmp = Object.assign({}, row); if (!tmp[kunci]) tmp[kunci] = 'baru-' + uid();
  if (idx > -1) rows[idx] = tmp; else rows.push(tmp);
  closeModal(); render(false);
  API.call('a.save', { sheet: M.sheet, row: lama[kunci] ? row : Object.assign(row, { [kunci]: M.key ? row[kunci] : '' }), sandi }, { silent: true })
    .then(r => { const i = rows.indexOf(tmp); if (i > -1) rows[i] = r; simpanAd(M.sheet); toast('Tersimpan ✓'); render(false); if (['Paket', 'PaketSoal', 'Materi', 'KelasZoom', 'Segmen', 'JadwalUjian'].indexOf(M.sheet) > -1) muatAdmin(); })
    .catch(e => { S.ad[M.sheet] = backup; render(false); toast('Gagal menyimpan: ' + e.message, 'err', 5000); });
};
ACT.hapusAd = async el => {
  const M = MODS[el.dataset.k], kunci = M.key || 'id';
  if (!await confirmBox('Hapus data ini? Tindakan tidak bisa dibatalkan.', 'Hapus', true)) return;
  const rows = S.ad[M.sheet], backup = rows.slice(); S.ad[M.sheet] = rows.filter(r => String(r[kunci]) !== String(el.dataset.id)); render(false);
  API.call('a.del', { sheet: M.sheet, id: el.dataset.id }, { silent: true }).then(() => { simpanAd(M.sheet); toast('Dihapus'); }).catch(e => { S.ad[M.sheet] = backup; render(false); toast(e.message, 'err'); });
};
ACT.geserAd = el => {
  const M = MODS[el.dataset.k], rows = S.ad[M.sheet].slice().sort((a, b) => num(a.urutan || a.langkah_ke) - num(b.urutan || b.langkah_ke));
  const i = rows.findIndex(r => String(r.id) === String(el.dataset.id)), j = i + num(el.dataset.d); if (j < 0 || j >= rows.length) return;
  [rows[i], rows[j]] = [rows[j], rows[i]]; rows.forEach((r, k) => r.urutan = k + 1); S.ad[M.sheet] = rows; render(false);
  API.call('a.urut', { sheet: M.sheet, ids: rows.map(r => r.id) }, { silent: true }).then(() => simpanAd(M.sheet)).catch(e => toast(e.message, 'err'));
};
async function importCSV(inp) {
  const M = MODS[inp.dataset.imp], file = inp.files[0]; if (!file) return;
  const rows = parseCSV(await file.text()); inp.value = '';
  if (!rows.length) return toast('CSV kosong', 'warn');
  if (!await confirmBox(`Import <b>${rows.length}</b> baris ke ${M.judul}? Baris dengan id sama akan diperbarui.<br><span class="tiny muted">Kolom dikenali: ${Object.keys(rows[0]).map(esc).join(', ')}</span>`, 'Import')) return;
  try { const r = await API.call('a.import', { sheet: M.sheet, rows }, { timeout: 120000 }); toast(`Import selesai: ${r.ins} baru, ${r.upd} diperbarui`); delete S.ad[M.sheet]; render(false); } catch (e) { toast(e.message, 'err'); }
}
ACT.alurPratinjau = async () => { try { const r = await API.call('a.alur.pratinjau', {}); modal(`<p>${esc(r.pesan)}</p>`, { title: 'Pratinjau target mingguan' }); } catch (e) { toast(e.message, 'err'); } };
ACT.blastPeng = async el => { if (!await confirmBox('Kirim pengumuman ini ke WhatsApp member sesuai target? Dikirim bertahap lewat antrean.', 'Kirim')) return; try { const r = await API.call('a.pengumuman.blast', { id: el.dataset.id }); toast(r.antre + ' pesan masuk antrean'); } catch (e) { toast(e.message, 'err'); } };
ACT.chatWA = el => { const r = (S.ad.Leads || []).find(x => x.id === el.dataset.id) || {}; const a = document.createElement('a'); a.href = waLink(r.no_wa, `Halo ${r.nama || ''}, saya admin Goukaku Pedia ID \uD83D\uDE4F`); a.target = '_blank'; a.rel = 'noopener'; a.click(); };

/* ---------- Grafik ringan (SVG/CSS, tanpa pustaka luar) ---------- */
function barsV(labels, values, opt = {}) {
  const mx = Math.max(1, ...values), garis = opt.garis;
  return `<div style="position:relative"><div class="chart-bars" style="height:${opt.h || 160}px">${values.map((v, i) => `<div class="b" title="${esc(labels[i])}: ${v}"><i class="${opt.hi === i || (opt.color && v >= (garis || 0)) ? 'hi' : ''}" style="height:${Math.max(2, v / (opt.max || mx) * 100)}%;${opt.color ? `background:${v >= (garis || 0) ? 'var(--c-ok)' : 'var(--c-amber)'}` : ''}"><span style="opacity:1">${v}${opt.suf || ''}</span></i><small class="trunc" style="max-width:100%">${esc(labels[i])}</small></div>`).join('')}</div>
    ${garis ? `<div style="position:absolute;left:0;right:0;bottom:calc(${garis}% * ${(opt.h || 160) - 18} / ${opt.h || 160} + 18px);border-top:2px dashed var(--c-red)"><span class="tiny" style="color:var(--c-red);background:var(--c-surface);padding:0 4px">garis aman ${garis}%</span></div>` : ''}</div>`;
}
function lineSmall(labels, values) {
  const W = 600, H = 170, mx = Math.max(1, ...values), n = values.length, px = i => 10 + i * (W - 20) / Math.max(1, n - 1), py = v => 10 + (1 - v / mx) * (H - 34);
  const d = values.map((v, i) => (i ? 'L' : 'M') + px(i).toFixed(1) + ',' + py(v).toFixed(1)).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto"><defs><linearGradient id="lgA" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#0351E2" stop-opacity=".28"/><stop offset="1" stop-color="#0351E2" stop-opacity="0"/></linearGradient></defs>
    <path d="${d} L${px(n - 1)},${H - 24} L${px(0)},${H - 24} Z" fill="url(#lgA)"/><path d="${d}" fill="none" stroke="#0351E2" stroke-width="3" stroke-linejoin="round"/>${values.map((v, i) => v ? `<circle cx="${px(i)}" cy="${py(v)}" r="3.5" fill="#041CA2"/>` : '').join('')}
    ${labels.map((l, i) => i % Math.ceil(n / 8) === 0 ? `<text x="${px(i)}" y="${H - 6}" font-size="11" text-anchor="middle" fill="var(--c-muted)">${esc(l.slice(5))}</text>` : '').join('')}</svg>`;
}

/* ---------- Ringkasan & statistik ---------- */
R['a/ringkasan'] = () => {
  S.ui.title = 'Ringkasan';
  const f = S.ui.stF || { dari: new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10), sampai: new Date().toISOString().slice(0, 10), angkatan: '' };
  S.ui.stF = f;
  const key = '__stats', d = adData('', 'a.stats', f, key);
  const A = S.adm || {};
  const filt = `<div class="card row wrap gap2"><div class="fld" style="margin:0"><label>Dari</label><input class="inp" type="date" id="stDari" value="${f.dari}"></div><div class="fld" style="margin:0"><label>Sampai</label><input class="inp" type="date" id="stSampai" value="${f.sampai}"></div>
    <div class="fld" style="margin:0"><label>Angkatan</label><select class="inp" id="stAng"><option value="">Semua</option>${(A.jadwal || []).map(j => `<option value="${esc(j.ujian_ke)}" ${String(j.ujian_ke) === String(f.angkatan) ? 'selected' : ''}>${esc(j.nama_angkatan)}</option>`).join('')}</select></div>
    <button class="btn btn-primary" data-act="terapStat" style="align-self:flex-end">${ic('filter_alt')} Terapkan</button></div>`;
  if (!d || !d.ringkas) return filt + skelTbl();
  const k = d.ringkas, kpi = [['Kunjungan', k.kunjungan, 'visibility'], ['Leads', k.leads, 'person_search'], ['Pendaftar', k.pendaftar, 'how_to_reg'], ['Member aktif', k.member_aktif, 'group'], ['Penjualan', k.penjualan + ' · ' + rp(k.rupiah), 'payments'], ['Dari promo', k.dari_promo, 'local_offer'], ['Laporan baru', k.laporan_baru, 'flag'], ['Opt-out WA', k.opt_out, 'block']];
  const pp = Object.keys(d.per_paket);
  return filt + `<div class="grid g4 kpi">${kpi.map(x => `<div class="card"><span class="row tiny muted">${ic(x[2])} ${x[0]}</span><b>${esc(x[1])}</b></div>`).join('')}</div>
    <div class="grid g2"><div class="card"><h3>Leads per hari</h3>${lineSmall(d.hari, d.leads_hari)}</div>
      <div class="card"><h3>Corong konversi</h3><div class="hbars mt3">${d.corong.map((c, i) => `<div class="r"><span>${c.label}</span><div class="bar"><i style="width:${pct(c.n, Math.max(1, ...d.corong.map(z => z.n)))}%;background:${['#74D1FA', '#0351E2', '#041CA2', '#16A34A'][i]}"></i></div><b class="small">${c.n}</b></div>`).join('')}</div></div>
      <div class="card"><h3>Penjualan per paket</h3>${pp.length ? barsV(pp, pp.map(x => d.per_paket[x].jumlah)) + `<div class="tiny muted mt2">${pp.map(x => esc(x) + ': ' + rp(d.per_paket[x].rp)).join(' · ')}</div>` : '<div class="empty small">Belum ada penjualan di rentang ini.</div>'}</div>
      <div class="card"><h3>Rata-rata 模擬試験 per 科目</h3>${d.mogi.length ? barsV(d.mogi.map(x => x.kamoku), d.mogi.map(x => x.pct), { suf: '%', max: 100, garis: d.garis_aman, color: 1 }) : '<div class="empty small">Belum ada 模擬試験.</div>'}</div>
      <div class="card"><h3>Progres Alur Belajar member</h3>${barsV(Object.keys(d.alur), Object.values(d.alur))}</div>
      <div class="card"><h3>Kehadiran kelas Zoom</h3>${d.zoom.length ? barsV(d.zoom.map(z => z.judul), d.zoom.map(z => z.hadir)) : '<div class="empty small">Belum ada kelas.</div>'}</div>
      <div class="card"><h3>CRM: kontak per tahap</h3>${barsV(Object.keys(d.tahap), Object.values(d.tahap))}</div>
      <div class="card"><h3>Hasil kampanye</h3>${d.kampanye.length ? `<div class="tbl-wrap" style="box-shadow:none"><table class="tbl" style="min-width:0"><tr><th>Kampanye</th><th>Target</th><th>Terkirim</th><th>Dilewati</th><th>Dibalas</th></tr>${d.kampanye.map(x => `<tr><td>${esc(x.nama)}</td><td>${x.target}</td><td>${x.terkirim}</td><td>${x.dilewati}</td><td>${x.dibalas}</td></tr>`).join('')}</table></div>` : '<div class="empty small">Belum ada kampanye.</div>'}</div></div>
    <div class="card"><h3 class="mb3">10 soal paling sering salah</h3><div class="tbl-wrap" style="box-shadow:none"><table class="tbl"><tr><th>#</th><th>Soal</th><th>科目</th><th>Salah</th><th>Dicoba</th></tr>${d.top_salah.map((x, i) => `<tr><td>${i + 1}</td><td class="jp">${esc(plainJP(x.soal))}…</td><td>${esc(x.kamoku)}</td><td><b style="color:var(--c-bad)">${x.salah}</b></td><td>${x.dicoba}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Belum ada data.</td></tr>'}</table></div></div>`;
};
ACT.terapStat = () => { S.ui.stF = { dari: $('#stDari').value, sampai: $('#stSampai').value, angkatan: $('#stAng').value }; S.ad.__stats = undefined; LS.del('gp_ad___stats'); render(false); };

/* ---------- CRM: Hari ini ---------- */
R['a/hariini'] = () => {
  S.ui.title = 'Hari ini'; const d = adData('', 'a.crm.hariini', {}, '__hariini');
  if (!d || !d.followup) return skelTbl();
  const box = (t, ico, items, f) => `<div class="card"><div class="row-b mb3"><h3 class="row">${ic(ico)} ${t}</h3><span class="chip ${items.length ? 'amber' : 'ok'}">${items.length}</span></div><div class="col gap2">${items.map(f).join('') || '<div class="small muted">Tidak ada. \uD83D\uDC4D</div>'}</div></div>`;
  return `<div class="grid g3" style="align-items:start">${box('Perlu dihubungi', 'call', d.followup, x => `<div class="list-card"><div class="f1"><b class="small">${esc(x.nama)}</b><div class="tiny muted">${esc(x.tahap)} · jadwal ${esc(x.tanggal)}</div></div><button class="btn btn-light btn-sm" data-act="detailKontak" data-id="${esc(x.id)}">Buka</button></div>`)}
    ${box('Balasan WA belum ditanggapi', 'mark_chat_unread', d.balasan, x => `<div class="list-card"><div class="f1"><b class="small">${esc(x.nama || x.no_wa)}</b><div class="tiny muted trunc">“${esc(x.pesan)}” · ${fRel(x.waktu)}</div></div><button class="btn btn-light btn-sm" data-act="detailKontak" data-id="${esc(x.id)}">Buka</button></div>`)}
    ${box('Pembayaran perlu dicek', 'payments', d.bayar, x => `<div class="list-card"><div class="f1"><b class="small">${rp(x.nominal)}</b><div class="tiny muted">${esc(x.email_pembeli || '-')} · ${esc(x.ref_id_lynk)}</div></div><button class="btn btn-light btn-sm" data-go="a/pembayaran">Proses</button></div>`)}</div>`;
};

/* ---------- CRM: Kontak terpadu ---------- */
const TAHAP = [['lead', 'Lead'], ['menunggu_bayar', 'Menunggu bayar'], ['member_aktif', 'Member aktif'], ['alumni', 'Alumni'], ['lulus_合格', 'Lulus 合格']];
R['a/kontak'] = () => {
  S.ui.title = 'Kontak'; const rows = adData('', 'a.crm.kontak', {}, '__kontak'); if (!rows) return skelTbl();
  const q = (S.ui.q_kontak || '').toLowerCase(), th = S.ui.th_kontak || '';
  const list = rows.filter(r => (!th || r.tahap === th) && (!q || (r.nama + r.no_wa + r.email + r.tag).toLowerCase().indexOf(q) > -1));
  return `<div class="row wrap gap2"><div class="search f1" style="min-width:220px;max-width:380px">${ic('search')}<input class="inp" id="qKontak" placeholder="Cari nama, WA, email, tag…" value="${esc(S.ui.q_kontak || '')}"></div>
    <div class="seg">${[['', 'Semua']].concat(TAHAP).map(t => `<button class="${th === t[0] ? 'on' : ''}" data-act="thKontak" data-v="${t[0]}">${t[1]} ${t[0] ? `(${rows.filter(r => r.tahap === t[0]).length})` : ''}</button>`).join('')}</div>
    <button class="btn btn-light btn-sm" data-act="csvKontak">${ic('download')} CSV</button></div>
  <div class="tbl-wrap"><table class="tbl"><tr><th>Nama</th><th>WA</th><th>Tahap</th><th>Tag</th><th>Skor</th><th>Terakhir dihubungi</th><th>Follow-up</th><th>Promo</th><th></th></tr>
    ${list.slice(0, 300).map(r => `<tr><td><b>${esc(r.nama)}</b>${r.perlu_balas ? ' <span class="chip amber">balas</span>' : ''}<div class="tiny muted">${esc(r.email)}</div></td><td>${esc(r.no_wa)}</td><td>${stChip(r.tahap)}</td><td class="small">${esc(r.tag)}</td><td>${esc(r.skor)}</td><td class="small">${r.terakhir_dihubungi ? fRel(r.terakhir_dihubungi) : '–'}</td><td class="small">${esc(String(r.follow_up_berikutnya || '').slice(0, 10))}</td>
      <td>${ya(String(r.opt_out).split(' ')[0]) ? '<span class="chip red">opt-out</span>' : r.setuju_info_wa ? '<span class="chip ok">setuju</span>' : '<span class="chip ghost">–</span>'}</td>
      <td class="act"><a class="btn-ico sm" href="${waLink(r.no_wa)}" target="_blank" rel="noopener" data-act="waKontak" data-id="${esc(r.id)}" aria-label="Chat WA">${ic('chat')}</a><button class="btn-ico sm" data-act="detailKontak" data-id="${esc(r.id)}" aria-label="Detail">${ic('open_in_new')}</button></td></tr>`).join('') || '<tr><td colspan="9" class="empty">Tidak ada kontak.</td></tr>'}</table></div>`;
};
AFTER['a/kontak'] = () => { const q = $('#qKontak'); if (q) q.addEventListener('input', debounce(() => { S.ui.q_kontak = q.value; const p = q.selectionStart; render(false); const n = $('#qKontak'); n.focus(); n.setSelectionRange(p, p); }, 250)); };
ACT.thKontak = el => { S.ui.th_kontak = el.dataset.v; render(false); };
ACT.csvKontak = () => unduhCSV('kontak', S.ad.__kontak || []);
ACT.waKontak = el => { API.call('a.crm.catatan', { id: el.dataset.id, dihubungi: true }, { silent: true }).catch(() => { }); const a = document.createElement('a'); a.href = el.getAttribute('href'); a.target = '_blank'; a.rel = 'noopener'; a.click(); };
ACT.detailKontak = async el => {
  try { const d = await API.call('a.crm.detail', { id: el.dataset.id }); kontakModal(d); } catch (e) { toast(e.message, 'err'); }
};
function kontakModal(d) {
  const k = d.kontak, opt = ya(String(k.opt_out).split(' ')[0]);
  const ikon = { coba_gratis: 'quiz', daftar: 'how_to_reg', bayar: 'payments', wa_keluar: 'call_made', wa_masuk: 'call_received', catatan: 'edit_note', ubah_tahap: 'swap_horiz', opt_out: 'block' };
  modal(`<div class="grid g2" style="align-items:start"><div class="col gap3">
      <div class="row"><div class="av lg">${esc((k.nama || '?')[0])}</div><div><h3>${esc(k.nama)}</h3><div class="small muted">+${esc(k.no_wa)} · ${esc(k.email)}</div><div class="tiny muted">${esc(k.status_tinggal)} · target ${esc(k.target_ujian)} · sumber ${esc(k.sumber_pertama)}</div></div></div>
      <a class="btn btn-ok" href="${waLink(k.no_wa, 'Halo ' + (k.nama || '') + ' \uD83D\uDE4F')}" target="_blank" rel="noopener" data-act="waKontak" data-id="${esc(k.id)}">${ic('chat')} Chat WA</a>
      <form data-form="ubahKontak" class="col gap2"><input type="hidden" name="id" value="${esc(k.id)}">
        <div class="fld" style="margin:0"><label>Tahap</label><select class="inp" name="tahap">${TAHAP.map(t => `<option value="${t[0]}" ${k.tahap === t[0] ? 'selected' : ''}>${t[1]}</option>`).join('')}</select></div>
        <div class="fld" style="margin:0"><label>Tag (pisahkan koma)</label><input class="inp" name="tag" value="${esc(k.tag)}"></div>
        <div class="fld" style="margin:0"><label>PIC admin</label><input class="inp" name="pic_admin" value="${esc(k.pic_admin)}"></div>
        <label class="chk"><input type="checkbox" name="opt_out" ${opt ? 'checked' : ''}><span>Opt-out (berhenti terima promo)</span></label>
        <label class="chk"><input type="checkbox" name="setuju_info_wa" ${k.setuju_info_wa ? 'checked' : ''}><span>Setuju menerima info WA</span></label>
        <button class="btn btn-light btn-sm" type="submit">${ic('save')} Simpan perubahan</button></form>
      <form data-form="catatKontak" class="card col gap2" style="background:var(--c-s1);box-shadow:none"><input type="hidden" name="id" value="${esc(k.id)}"><b class="small">Tambah catatan / jadwal follow-up</b>
        <textarea class="inp" name="catatan" rows="2" placeholder="mis. sudah ditelepon, mau bayar tgl 25"></textarea><div class="row gap2"><input class="inp" type="date" name="follow_up" value="${esc(String(k.follow_up_berikutnya || '').slice(0, 10))}"><button class="btn btn-primary btn-sm" type="submit">Simpan</button></div></form>
    </div><div><h3 class="mb3">Riwayat interaksi</h3><div class="tl">${d.timeline.map(i => `<div class="tl-i ${i.jenis === 'wa_masuk' ? 'in' : i.jenis === 'catatan' ? 'note' : ''}"><div class="row small"><b>${ic(ikon[i.jenis] || 'circle')} ${esc(i.jenis.replace(/_/g, ' '))}</b><span class="tiny muted">${fRel(i.waktu)} · ${esc(i.oleh)}</span></div><div class="small mt1">${esc(i.ringkasan)}</div></div>`).join('') || '<div class="small muted">Belum ada interaksi.</div>'}</div>
      ${d.member.length ? `<h3 class="mt4 mb2">Akun member</h3>${d.member.map(m => `<div class="small">${esc(m.email)} · ${stChip(m.status)} · ${esc(m.ujian_ke)}</div>`).join('')}` : ''}</div></div>`, { title: 'Detail kontak', wide: true });
}
FORM.ubahKontak = (f, d) => kunciTombol(f, async () => { try { const r = await API.call('a.crm.ubah', { id: d.id, patch: { tahap: d.tahap, tag: d.tag, pic_admin: d.pic_admin, opt_out: d.opt_out ? 'ya' : 'tidak', setuju_info_wa: d.setuju_info_wa ? 'ya' : '' } }); toast('Kontak diperbarui'); S.ad.__kontak = undefined; kontakModal(r); } catch (e) { toast(e.message, 'err'); } });
FORM.catatKontak = (f, d) => kunciTombol(f, async () => { try { const r = await API.call('a.crm.catatan', d); toast('Catatan tersimpan'); S.ad.__kontak = undefined; S.ad.__hariini = undefined; kontakModal(r); } catch (e) { toast(e.message, 'err'); } });

/* ---------- CRM: Segmen (builder aturan + hitung langsung) ---------- */
R['a/segmen'] = () => {
  S.ui.title = 'Segmen'; const rows = adData('Segmen'); if (!rows) return skelTbl();
  return `<div class="row-b"><p class="small muted">Segmen = filter kontak tersimpan untuk kampanye blast WA.</p><button class="btn btn-primary btn-sm" data-act="editSegmen">${ic('add')} Segmen baru</button></div>
    <div class="grid g3">${rows.map(s => { const a = (() => { try { return JSON.parse(s.aturan || '{}'); } catch (e) { return {}; } })(); return `<div class="card col gap2"><b>${esc(s.nama)}</b><div class="row wrap gap1">${Object.keys(a).filter(k => a[k] !== '' && a[k] !== undefined).map(k => `<span class="chip ghost">${esc(k)}: ${esc(a[k])}</span>`).join('')}</div>
      <div class="row gap2 mt2"><button class="btn btn-light btn-sm" data-act="hitungSeg" data-id="${esc(s.id)}">${ic('group')} Hitung</button><button class="btn btn-light btn-sm" data-act="editSegmen" data-id="${esc(s.id)}">${ic('edit')}</button><button class="btn-ico sm" style="color:var(--c-bad)" data-act="hapusAd" data-k="segmenX" data-id="${esc(s.id)}">${ic('delete')}</button></div><div class="tiny muted" data-hit="${esc(s.id)}"></div></div>`; }).join('') || '<div class="card empty">Belum ada segmen.</div>'}</div>`;
};
MODS.segmenX = { sheet: 'Segmen', judul: 'Segmen', f: [] };
ACT.hitungSeg = async el => { const t = $(`[data-hit="${el.dataset.id}"]`); t.textContent = 'menghitung…'; try { const r = await API.call('a.crm.segmen.hitung', { segmen_id: el.dataset.id }, { silent: true }); t.innerHTML = `<b>${r.total}</b> kontak · <b style="color:var(--c-ok)">${r.bisa_dikirim}</b> bisa dikirim promo · ${r.dilewati} dilewati (belum setuju / opt-out)`; } catch (e) { t.textContent = e.message; } };
ACT.editSegmen = el => {
  const s = el.dataset.id ? (S.ad.Segmen || []).find(x => x.id === el.dataset.id) || {} : {}, a = (() => { try { return JSON.parse(s.aturan || '{}'); } catch (e) { return {}; } })(), A = S.adm || {};
  const tah = String(a.tahap || '').split(',');
  modal(`<form data-form="simpanSegmen" id="fSeg"><input type="hidden" name="id" value="${esc(s.id || '')}"><div class="fld"><label>Nama segmen</label><input class="inp" name="nama" required value="${esc(s.nama || '')}"></div>
    <div class="lbl mb2">Tahap</div><div class="row wrap gap2 mb3" data-multi="tahap">${TAHAP.map(t => `<label class="chk"><input type="checkbox" value="${t[0]}" ${tah.indexOf(t[0]) > -1 ? 'checked' : ''}><span>${t[1]}</span></label>`).join('')}</div>
    <div class="grid g2" style="gap:0 12px"><div class="fld"><label>Tag mengandung</label><input class="inp" name="tag" value="${esc(a.tag || '')}"></div>
      <div class="fld"><label>Sumber</label><select class="inp" name="sumber"><option value="">Semua</option>${['coba_gratis', 'daftar', 'tombol_wa', 'promo'].map(x => `<option ${a.sumber === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div class="fld"><label>Angkatan</label><select class="inp" name="angkatan"><option value="">Semua</option>${(A.jadwal || []).map(j => `<option value="${esc(j.ujian_ke)}" ${String(a.angkatan) === String(j.ujian_ke) ? 'selected' : ''}>${esc(j.nama_angkatan)}</option>`).join('')}</select></div>
      <div class="fld"><label>Status tinggal</label><select class="inp" name="status_tinggal"><option value="">Semua</option>${['di Indonesia', 'di Jepang'].map(x => `<option ${a.status_tinggal === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <div class="fld"><label>Skor coba gratis ≥</label><input class="inp" type="number" name="skor_min" value="${esc(a.skor_min === undefined ? '' : a.skor_min)}"></div>
      <div class="fld"><label>Skor coba gratis ≤</label><input class="inp" type="number" name="skor_max" value="${esc(a.skor_max === undefined ? '' : a.skor_max)}"></div>
      <div class="fld"><label>Daftar belum bayar ≥ (hari)</label><input class="inp" type="number" name="belum_bayar_hari" value="${esc(a.belum_bayar_hari || '')}"></div>
      <div class="fld"><label>Tidak dihubungi ≥ (hari)</label><input class="inp" type="number" name="tidak_dihubungi_hari" value="${esc(a.tidak_dihubungi_hari || '')}"></div></div>
    <div class="card small" style="background:var(--c-s1);box-shadow:none" id="segHit">Ubah filter untuk melihat jumlah kontak…</div>
    <div class="row mt3" style="justify-content:flex-end"><button type="button" class="btn btn-light" data-act="closeModal">Batal</button><button class="btn btn-primary" type="submit">Simpan</button></div></form>`, { title: 'Segmen', wide: true });
  const f = $('#fSeg'), hitung = debounce(async () => { const d = segData(f); try { const r = await API.call('a.crm.segmen.hitung', { aturan: d.aturan }, { silent: true }); const h = $('#segHit'); if (h) h.innerHTML = `<b>${r.total}</b> kontak cocok · <b style="color:var(--c-ok)">${r.bisa_dikirim}</b> bisa menerima promo · ${r.dilewati} otomatis dilewati.<div class="tiny muted mt1">${r.contoh.map(c => esc(c.nama)).join(', ')}</div>`; } catch (e) { } }, 500);
  f.addEventListener('input', hitung); f.addEventListener('change', hitung); hitung();
};
function segData(f) {
  const fd = {}; new FormData(f).forEach((v, k) => fd[k] = v);
  const tahap = $$('[data-multi="tahap"] input:checked', f).map(x => x.value).join(',');
  const aturan = {}; ['tag', 'sumber', 'angkatan', 'status_tinggal', 'skor_min', 'skor_max', 'belum_bayar_hari', 'tidak_dihubungi_hari'].forEach(k => { if (fd[k] !== '' && fd[k] !== undefined) aturan[k] = fd[k]; });
  if (tahap) aturan.tahap = tahap;
  return { id: fd.id, nama: fd.nama, aturan: JSON.stringify(aturan) };
}
FORM.simpanSegmen = f => kunciTombol(f, async () => { const d = segData(f); if (!d.nama) return toast('Isi nama segmen', 'warn'); try { await API.call('a.save', { sheet: 'Segmen', row: { id: d.id, nama: d.nama, aturan: d.aturan, dibuat_oleh: S.auth.email } }); closeModal(); toast('Segmen tersimpan'); delete S.ad.Segmen; muatAdmin(); render(false); } catch (e) { toast(e.message, 'err'); } });
ACT.pratinjauKamp = async el => { try { const r = await API.call('a.crm.kampanye.pratinjau', { id: el.dataset.id }); modal(`<div class="small muted mb2">Contoh untuk: <b>${esc(r.kepada)}</b> · ${r.jumlah} kontak akan menerima</div><div class="card" style="background:#DCF8C6;color:#111;white-space:pre-wrap;box-shadow:none">${esc(r.pesan)}</div>`, { title: 'Pratinjau pesan' }); } catch (e) { toast(e.message, 'err'); } };
ACT.kirimKamp = async el => {
  const k = (S.ad.Kampanye || []).find(x => x.id === el.dataset.id) || {}, j = toDate(k.jadwal_kirim), nanti = j && j > Date.now();
  if (!await confirmBox(nanti ? `Jadwalkan kampanye <b>${esc(k.nama)}</b> pada ${fWaktu(k.jadwal_kirim)}?` : `Kirim kampanye <b>${esc(k.nama)}</b> sekarang? Pesan dikirim bertahap (jeda acak) hanya ke kontak yang setuju & tidak opt-out.`, nanti ? 'Jadwalkan' : 'Kirim')) return;
  try { const r = await API.call('a.crm.kampanye.kirim', { id: k.id }); toast(r.status === 'terjadwal' ? 'Kampanye dijadwalkan' : `${r.antre} pesan masuk antrean · ${r.dilewati} dilewati`); delete S.ad.Kampanye; render(false); } catch (e) { toast(e.message, 'err'); }
};

/* ---------- Member ---------- */
R['a/member'] = () => {
  S.ui.title = 'Member'; const rows = adData('', 'a.member.list', {}, '__member'); if (!rows) return skelTbl();
  const q = (S.ui.q_member || '').toLowerCase(), st = S.ui.st_member || '', ang = S.ui.ang_member || '', A = S.adm || {};
  const list = rows.filter(r => (!st || r.status === st) && (!ang || String(r.ujian_ke) === ang) && (!q || (r.nama + r.email + r.no_wa).toLowerCase().indexOf(q) > -1));
  const pk = {}; (A.paket || []).forEach(p => pk[p.id] = p.nama);
  return `<div class="row wrap gap2"><div class="search f1" style="min-width:220px;max-width:360px">${ic('search')}<input class="inp" id="qMem" placeholder="Cari nama, email, WA…" value="${esc(S.ui.q_member || '')}"></div>
    <select class="inp" style="max-width:200px;border-radius:999px" id="stMem"><option value="">Semua status</option>${['aktif', 'menunggu_bayar', 'berakhir', 'nonaktif'].map(x => `<option ${x === st ? 'selected' : ''}>${x}</option>`).join('')}</select>
    <select class="inp" style="max-width:220px;border-radius:999px" id="angMem"><option value="">Semua angkatan</option>${(A.jadwal || []).map(j => `<option value="${esc(j.ujian_ke)}" ${String(j.ujian_ke) === ang ? 'selected' : ''}>${esc(j.nama_angkatan)}</option>`).join('')}</select>
    <button class="btn btn-light btn-sm" data-act="csvMem">${ic('download')} CSV</button></div>
  <div class="tiny muted">${list.length} member</div>
  <div class="tbl-wrap"><table class="tbl"><tr><th>Nama</th><th>Paket</th><th>Status</th><th>Berakhir</th><th>Alur</th><th>模擬</th><th>Perangkat</th><th></th></tr>
  ${list.map(r => `<tr><td><b>${esc(r.nama)}</b><div class="tiny muted">${esc(r.email)} · +${esc(r.no_wa)}</div></td><td class="small">${esc(pk[r.paket_id] || r.paket_id)}<div class="tiny muted">第${esc(r.ujian_ke)}回</div></td><td>${stChip(r.status)}</td><td class="small">${r.tgl_berakhir ? fTgl(r.tgl_berakhir) : '–'}</td>
    <td style="min-width:90px"><div class="bar"><i style="width:${r.alur_pct}%"></i></div><span class="tiny">${r.alur_pct}%</span></td><td>${r.mogi_terakhir === null || r.mogi_terakhir === undefined ? '–' : r.mogi_terakhir + '%'}</td><td>${r.perangkat}/2</td>
    <td class="act"><button class="btn btn-light btn-sm" data-act="aksiMember" data-id="${esc(r.id)}">Kelola</button></td></tr>`).join('') || '<tr><td colspan="8" class="empty">Tidak ada member.</td></tr>'}</table></div>`;
};
AFTER['a/member'] = () => {
  const q = $('#qMem'); if (q) q.addEventListener('input', debounce(() => { S.ui.q_member = q.value; const p = q.selectionStart; render(false); const n = $('#qMem'); n.focus(); n.setSelectionRange(p, p); }, 250));
  ['stMem', 'angMem'].forEach(id => { const s = $('#' + id); if (s) s.addEventListener('change', () => { S.ui[id === 'stMem' ? 'st_member' : 'ang_member'] = s.value; render(false); }); });
};
ACT.csvMem = () => unduhCSV('member', S.ad.__member || []);
ACT.aksiMember = async el => {
  const m = (S.ad.__member || []).find(x => x.id === el.dataset.id); if (!m) return;
  const A = S.adm || {};
  modal(`<div class="row mb3"><div class="av lg">${esc(m.nama[0])}</div><div><h3>${esc(m.nama)}</h3><div class="small muted">${esc(m.email)} · +${esc(m.no_wa)}</div>${stChip(m.status)}</div></div>
    <div id="memDet"><div class="sk" style="height:60px"></div></div>
    <form data-form="aktifkanMember" class="card col gap2 mt3" style="background:var(--c-s1);box-shadow:none"><input type="hidden" name="id" value="${esc(m.id)}"><b class="small">${ic('bolt')} Aktivasi manual (1 klik)</b>
      <div class="row wrap gap2"><input class="inp f1" name="ref" placeholder="No. pesanan Lynk.id (opsional)"><input class="inp" style="max-width:150px" name="nominal" type="number" placeholder="Nominal"></div>
      <select class="inp" name="paket_id">${(A.paket || []).map(p => `<option value="${esc(p.id)}" ${p.id === m.paket_id ? 'selected' : ''}>${esc(p.nama)}</option>`).join('')}</select><button class="btn btn-ok" type="submit">Aktifkan</button></form>
    <div class="row wrap gap2 mt3"><button class="btn btn-light btn-sm" data-act="memAksi" data-a="reset_perangkat" data-id="${esc(m.id)}">${ic('devices')} Reset perangkat (${m.perangkat})</button>
      <button class="btn btn-light btn-sm" data-act="memBerakhir" data-id="${esc(m.id)}">${ic('event')} Ubah tgl berakhir</button>
      <a class="btn btn-light btn-sm" href="${waLink(m.no_wa, 'Halo ' + m.nama + ', saya admin Goukaku Pedia ID \uD83D\uDE4F')}" target="_blank" rel="noopener">${ic('chat')} WA</a>
      <button class="btn btn-bad btn-sm" data-act="memAksi" data-a="nonaktif" data-id="${esc(m.id)}">${ic('block')} Nonaktifkan</button></div>`, { title: 'Kelola member', wide: true });
  try {
    const d = await API.call('a.member.detail', { id: m.id }, { silent: true }); const el2 = $('#memDet'); if (!el2) return;
    el2.innerHTML = `<div class="grid g2"><div><b class="small">Alur Belajar</b><div class="col gap1 mt2">${d.alur.map(a => `<div class="row small">${ic(a.selesai ? 'check_circle' : 'radio_button_unchecked', a.selesai ? 'fill' : '')}<span class="jp">${furi(a.judul)}</span></div>`).join('')}</div></div>
      <div><b class="small">Nilai terakhir</b><div class="col gap1 mt2">${d.hasil.slice(-6).reverse().map(h => `<div class="row-b small"><span>${esc(h.jenis)} · ${fTgl(h.selesai)}</span><b>${pct(h.skor, h.total)}%</b></div>`).join('') || '<span class="small muted">Belum ada.</span>'}</div>
      <b class="small mt3" style="display:block">Perangkat</b>${d.perangkat.map(p => `<div class="small">${esc(p.nama)} · ${fRel(p.terakhir)}</div>`).join('') || '<span class="small muted">–</span>'}</div></div>`;
  } catch (e) { }
};
FORM.aktifkanMember = (f, d) => kunciTombol(f, async () => { try { await API.call('a.member.aksi', Object.assign(d, { aksi: 'aktifkan' })); toast('Member diaktifkan · WA akun aktif masuk antrean'); closeModal(); S.ad.__member = undefined; render(false); } catch (e) { toast(e.message, 'err'); } });
ACT.memAksi = async el => {
  const lbl = { reset_perangkat: 'Reset daftar perangkat member ini?', nonaktif: 'Nonaktifkan member ini? Sesi di semua perangkat akan keluar.' }[el.dataset.a];
  if (!await confirmBox(lbl, 'Ya', el.dataset.a === 'nonaktif')) return;
  try { await API.call('a.member.aksi', { id: el.dataset.id, aksi: el.dataset.a }); toast('Berhasil'); closeModal(); S.ad.__member = undefined; render(false); } catch (e) { toast(e.message, 'err'); }
};
ACT.memBerakhir = el => { modal(`<form data-form="memBerakhir"><input type="hidden" name="id" value="${esc(el.dataset.id)}"><div class="fld"><label>Tanggal berakhir baru</label><input class="inp" type="date" name="tgl" required></div><button class="btn btn-primary btn-block" type="submit">Simpan</button></form>`, { title: 'Ubah tanggal berakhir (kasus khusus)' }); };
FORM.memBerakhir = (f, d) => kunciTombol(f, async () => { try { await API.call('a.member.aksi', { id: d.id, aksi: 'ubah_berakhir', tgl_berakhir: d.tgl }); toast('Tanggal diubah'); closeModal(); S.ad.__member = undefined; render(false); } catch (e) { toast(e.message, 'err'); } });

/* ---------- Pembayaran ---------- */
R['a/pembayaran'] = () => {
  S.ui.title = 'Pembayaran'; const rows = adData('', 'a.bayar.list', {}, '__bayar'); if (!rows) return skelTbl();
  const st = S.ui.st_bayar || '', list = rows.filter(r => !st || r.status === st);
  return `<div class="seg">${[['', 'Semua'], ['perlu_dicek', 'Perlu dicek'], ['berhasil', 'Berhasil'], ['dibatalkan', 'Dibatalkan']].map(t => `<button class="${st === t[0] ? 'on' : ''}" data-act="stBayar" data-v="${t[0]}">${t[1]} (${t[0] ? rows.filter(r => r.status === t[0]).length : rows.length})</button>`).join('')}</div>
  <div class="tbl-wrap"><table class="tbl"><tr><th>Waktu</th><th>Ref Lynk.id</th><th>Nominal</th><th>Email pembeli</th><th>Status</th><th>Sumber</th><th></th></tr>
  ${list.map(r => `<tr><td class="small">${fRel(r.waktu)}</td><td class="small">${esc(r.ref_id_lynk)}</td><td><b>${rp(r.nominal)}</b></td><td class="small">${esc(r.email_pembeli)}</td><td>${stChip(r.status)}</td><td class="small">${esc(r.sumber)}</td>
    <td class="act">${r.status === 'perlu_dicek' ? `<button class="btn btn-primary btn-sm" data-act="prosesBayar" data-id="${esc(r.id)}">Proses</button><button class="btn-ico sm" data-act="batalBayar" data-id="${esc(r.id)}" aria-label="Batalkan">${ic('close')}</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Belum ada pembayaran.</td></tr>'}</table></div>`;
};
ACT.stBayar = el => { S.ui.st_bayar = el.dataset.v; render(false); };
ACT.prosesBayar = async el => {
  const b = S.ad.__bayar.find(x => x.id === el.dataset.id), mem = S.ad.__member || await API.call('a.member.list', {}).then(r => (S.ad.__member = r));
  const cocok = mem.filter(m => m.status !== 'aktif').concat(mem.filter(m => m.status === 'aktif')), A = S.adm || {};
  modal(`<p class="small">Pembayaran <b>${rp(b.nominal)}</b> · ${esc(b.email_pembeli || 'tanpa email')} · ref ${esc(b.ref_id_lynk)}</p>
    <form data-form="prosesBayar" class="mt3"><input type="hidden" name="id" value="${esc(b.id)}"><div class="fld"><label>Aktifkan untuk member</label><select class="inp" name="member_id" required><option value="">— pilih member —</option>${cocok.map(m => `<option value="${esc(m.id)}">${esc(m.nama)} · ${esc(m.email)} (${esc(m.status)})</option>`).join('')}</select></div>
    <div class="fld"><label>Paket</label><select class="inp" name="paket_id">${(A.paket || []).map(p => `<option value="${esc(p.id)}" ${p.id === b.paket_id ? 'selected' : ''}>${esc(p.nama)}</option>`).join('')}</select></div><button class="btn btn-ok btn-block" type="submit">Aktifkan member</button></form>`, { title: 'Proses pembayaran' });
};
FORM.prosesBayar = (f, d) => kunciTombol(f, async () => { try { await API.call('a.bayar.proses', d); toast('Pembayaran diproses & member aktif'); closeModal(); S.ad.__bayar = undefined; S.ad.__member = undefined; muatAdmin(); render(false); } catch (e) { toast(e.message, 'err'); } });
ACT.batalBayar = async el => { if (!await confirmBox('Batalkan pembayaran ini?', 'Batalkan', true)) return; try { await API.call('a.bayar.proses', { id: el.dataset.id, aksi: 'batal' }); S.ad.__bayar = undefined; render(false); } catch (e) { toast(e.message, 'err'); } };

/* ---------- Laporan soal ---------- */
R['a/laporan'] = () => {
  S.ui.title = 'Laporan Soal'; const rows = adData('LaporanSoal'); if (!rows) return skelTbl();
  const st = S.ui.st_lap === undefined ? 'baru' : S.ui.st_lap, list = rows.filter(r => !st || r.status === st).slice().reverse();
  return `<div class="seg">${[['baru', 'Baru'], ['diperbaiki', 'Diperbaiki'], ['ditolak', 'Ditolak'], ['', 'Semua']].map(t => `<button class="${st === t[0] ? 'on' : ''}" data-act="stLap" data-v="${t[0]}">${t[1]} (${t[0] ? rows.filter(r => r.status === t[0]).length : rows.length})</button>`).join('')}</div>
  <div class="col gap2">${list.map(r => `<div class="card row wrap gap3"><div class="f1" style="min-width:240px"><div class="row wrap gap2"><span class="chip">${esc(r.tipe_item)}</span><span class="chip amber">${esc(r.jenis)}</span>${stChip(r.status)}<span class="tiny muted">${fRel(r.waktu)}</span></div>
    <p class="mt2">${esc(r.keterangan || '(tanpa keterangan)')}</p><div class="tiny muted mt1">Item: ${esc(r.item_id)} · member ${esc(r.member_id)}${r.catatan_admin ? ' · catatan: ' + esc(r.catatan_admin) : ''}</div></div>
    <div class="row gap2">${r.tipe_item === 'soal' || r.tipe_item === 'pembahasan' ? `<button class="btn btn-light btn-sm" data-act="bukaItemLap" data-id="${esc(r.item_id)}">${ic('edit')} Buka soal</button>` : r.tipe_item === 'kosakata' ? `<button class="btn btn-light btn-sm" data-act="bukaKosaLap" data-id="${esc(r.item_id)}">${ic('edit')} Buka kata</button>` : ''}
    ${r.status === 'baru' ? `<button class="btn btn-ok btn-sm" data-act="tanganiLap" data-id="${esc(r.id)}" data-s="diperbaiki">Diperbaiki</button><button class="btn btn-bad btn-sm" data-act="tanganiLap" data-id="${esc(r.id)}" data-s="ditolak">Tolak</button>` : ''}</div></div>`).join('') || '<div class="card empty">Tidak ada laporan.</div>'}</div>`;
};
ACT.stLap = el => { S.ui.st_lap = el.dataset.v; render(false); };
ACT.bukaItemLap = async el => { if (!S.ad.BankSoal) S.ad.BankSoal = await API.call('a.list', { sheet: 'BankSoal' }); ACT.editAd({ dataset: { k: 'banksoal', id: el.dataset.id } }); };
ACT.bukaKosaLap = async el => { if (!S.ad.Kosakata) S.ad.Kosakata = await API.call('a.list', { sheet: 'Kosakata' }); ACT.editAd({ dataset: { k: 'kosakata', id: el.dataset.id } }); };
ACT.tanganiLap = el => { modal(`<form data-form="tanganiLap"><input type="hidden" name="id" value="${esc(el.dataset.id)}"><input type="hidden" name="status" value="${esc(el.dataset.s)}"><div class="fld"><label>Catatan admin</label><textarea class="inp" name="catatan" rows="3"></textarea></div>${el.dataset.s === 'diperbaiki' ? '<label class="chk mb3"><input type="checkbox" name="kirim_wa"><span>Kirim WA "Terima kasih, soal sudah diperbaiki" ke pelapor</span></label>' : ''}<button class="btn btn-primary btn-block" type="submit">Simpan</button></form>`, { title: el.dataset.s === 'diperbaiki' ? 'Tandai diperbaiki' : 'Tolak laporan' }); };
FORM.tanganiLap = (f, d) => kunciTombol(f, async () => { try { await API.call('a.lapor.update', Object.assign(d, { kirim_wa: d.kirim_wa ? 'ya' : '' })); const r = S.ad.LaporanSoal.find(x => x.id === d.id); if (r) { r.status = d.status; r.catatan_admin = d.catatan; } closeModal(); toast('Laporan diperbarui'); muatAdmin(); render(false); } catch (e) { toast(e.message, 'err'); } });

/* ---------- Export ---------- */
R['a/export'] = () => {
  S.ui.title = 'Export'; const A = S.adm || {};
  return `<div class="card" style="max-width:640px"><h3>Export data ke Excel (CSV)</h3><p class="small muted mt1">File CSV UTF-8 bisa langsung dibuka di Excel / Google Sheets.</p>
    <form data-form="export" class="mt4"><div class="fld"><label>Data</label><select class="inp" name="sheet">${[['Leads', 'Leads'], ['Member', 'Member'], ['Pembayaran', 'Pembayaran'], ['HasilKuis', 'Hasil kuis / 模擬試験'], ['Progres', 'Progres belajar'], ['ProgresKosakata', 'Progres kosakata'], ['Kontak', 'Kontak CRM'], ['Interaksi', 'Interaksi CRM'], ['LaporanSoal', 'Laporan soal'], ['Kampanye', 'Kampanye']].map(x => `<option value="${x[0]}">${x[1]}</option>`).join('')}</select></div>
    <div class="grid g2" style="gap:0 12px"><div class="fld"><label>Dari</label><input class="inp" type="date" name="dari"></div><div class="fld"><label>Sampai</label><input class="inp" type="date" name="sampai"></div></div>
    <div class="fld"><label>Angkatan (khusus Member)</label><select class="inp" name="angkatan"><option value="">Semua</option>${(A.jadwal || []).map(j => `<option value="${esc(j.ujian_ke)}">${esc(j.nama_angkatan)}</option>`).join('')}</select></div>
    <button class="btn btn-primary" type="submit">${ic('download')} Unduh CSV</button></form></div>`;
};
FORM.export = (f, d) => kunciTombol(f, async () => { try { const r = await API.call('a.export', d, { timeout: 90000 }); unduhCSV(r.sheet + '-' + new Date().toISOString().slice(0, 10), r.rows); toast(r.rows.length + ' baris diexport'); } catch (e) { toast(e.message, 'err'); } });

/* ---------- Antrean notifikasi ---------- */
R['a/antrean'] = () => {
  S.ui.title = 'Antrean Notifikasi'; const d = adData('', 'a.antrean', {}, '__antrean'); if (!d || !d.ringkas) return skelTbl();
  return `<div class="grid g4 kpi">${Object.keys(d.ringkas).map(k => `<div class="card"><span class="tiny muted">${k}</span><b>${d.ringkas[k]}</b></div>`).join('')}</div>
    <div class="row-b"><p class="small muted">Dikirim otomatis tiap 5 menit dengan jeda acak (anti-blokir). Gagal dicoba ulang maksimal 3×.</p><button class="btn btn-primary btn-sm" data-act="prosesAntrean">${ic('send')} Proses sekarang</button></div>
    <div class="tbl-wrap"><table class="tbl"><tr><th>Waktu</th><th>Kanal</th><th>Tujuan</th><th>Event</th><th>Status</th><th>Respon</th><th>Pesan</th></tr>${d.terbaru.map(r => `<tr><td class="small">${fRel(r.waktu)}</td><td>${esc(r.kanal)}</td><td class="small">${esc(r.tujuan)}</td><td class="small">${esc(r.event)}</td><td>${stChip(r.status)}</td><td class="tiny">${esc(r.respon)}</td><td class="tiny" style="max-width:280px">${esc(String(r.pesan).slice(0, 120))}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Antrean kosong.</td></tr>'}</table></div>`;
};
ACT.prosesAntrean = async () => { try { S.ad.__antrean = await API.call('a.antrean', { proses: true }, { timeout: 60000 }); toast('Antrean diproses'); render(false); } catch (e) { toast(e.message, 'err'); } };

/* ---------- Log ---------- */
R['a/log'] = () => {
  S.ui.title = 'Log Aktivitas'; if (!isSU()) return '<div class="card empty">Khusus Superadmin.</div>';
  const rows = adData('', 'a.log', {}, '__log'); if (!rows) return skelTbl();
  return `<div class="tbl-wrap"><table class="tbl"><tr><th>Waktu</th><th>Pengguna</th><th>Aksi</th><th>Target</th></tr>${rows.map(r => `<tr><td class="small nowrap">${fRel(r.waktu)}</td><td class="small">${esc(r.pengguna)}</td><td>${esc(r.aksi)}</td><td class="small">${esc(r.target)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Belum ada log.</td></tr>'}</table></div>`;
};

/* ---------- Pengaturan (Superadmin) ---------- */
R['a/pengaturan'] = () => {
  S.ui.title = 'Pengaturan'; if (!isSU()) return '<div class="card empty">Khusus Superadmin.</div>';
  const d = adData('', 'a.setting.get', {}, '__setting'); if (!d || !d.setting) return skelTbl();
  const s = d.setting, inp = (k, l, t = 'text', h = '') => `<div class="fld"><label>${l}</label>${t === 'textarea' ? `<textarea class="inp" name="${k}" rows="2">${esc(s[k])}</textarea>` : `<input class="inp" type="${t}" name="${k}" value="${esc(s[k])}">`}${h ? `<span class="hint">${h}</span>` : ''}</div>`;
  const yn = (k, l) => `<label class="chk mb2"><input type="checkbox" name="${k}" ${ya(s[k]) ? 'checked' : ''}><span>${l}</span></label>`;
  return `<form data-form="simpanSetting" class="col gap4">
    <div class="grid g2" style="align-items:start"><div class="card"><h3 class="mb3">${ic('palette')} Identitas & Alamat</h3>${inp('NAMA_BRAND', 'Nama brand')}${inp('TAGLINE', 'Tagline')}${inp('LOGO_URL', 'URL logo (PNG transparan)', 'text', 'Kosongkan untuk memakai logo bawaan')}${inp('ALAMAT_WEB', 'Alamat web', 'text', 'mis. https://goukakupedia.github.io — dipakai di template WA')}${inp('VIDEO_PROFIL_YT', 'ID video profil YouTube')}${inp('TIKTOK', 'TikTok')}${inp('INSTAGRAM', 'Instagram')}${inp('STAT_SOAL_DIBAHAS', 'Angka "soal dibahas" di halaman depan', 'number')}</div>
      <div class="card"><h3 class="mb3">${ic('event')} Ujian & Belajar</h3><div class="fld"><label>Angkatan utama (countdown halaman depan)</label><select class="inp" name="ANGKATAN_UTAMA">${d.jadwal.map(j => `<option value="${esc(j.ujian_ke)}" ${String(j.ujian_ke) === String(s.ANGKATAN_UTAMA) ? 'selected' : ''}>${esc(j.nama_angkatan)}</option>`).join('')}</select><span class="hint">Kelola daftar angkatan di menu Jadwal Ujian</span></div>
        ${inp('GARIS_AMAN', 'Garis aman nilai (%)', 'number')}${inp('LIMIT_COBA_HARIAN', 'Batas Coba Gratis per nomor per hari', 'number')}${inp('LIMIT_LAPOR_HARIAN', 'Batas laporan soal per member per hari', 'number')}
        <h3 class="mb3 mt4">${ic('support_agent')} Kontak admin</h3>${inp('WA_ADMIN', 'No WA admin', 'text', 'Format 62…')}${inp('EMAIL_ADMIN', 'Email admin', 'email')}</div></div>
    <div class="card"><h3 class="mb3">${ic('sentiment_satisfied')} Pesan semangat per fase</h3><div class="grid g2" style="gap:0 14px">${inp('FASE_90', '> 90 hari', 'textarea')}${inp('FASE_30', '30–90 hari', 'textarea')}${inp('FASE_7', '7–30 hari', 'textarea')}${inp('FASE_1', '< 7 hari', 'textarea')}${inp('FASE_H', 'Hari H', 'textarea')}</div></div>
    <div class="card"><h3 class="mb3">${ic('notifications_active')} Notifikasi</h3><div class="row wrap gap4">${yn('NOTIF_WA', 'WhatsApp (Fonnte) aktif')}${yn('NOTIF_EMAIL', 'Email cadangan aktif')}${yn('NOTIF_SENIN', 'WA ringkasan target tiap Senin')}</div>
      <div class="grid g3" style="gap:0 14px">${inp('BLAST_JEDA_MIN', 'Jeda blast min (detik)', 'number')}${inp('BLAST_JEDA_MAKS', 'Jeda blast maks (detik)', 'number')}${inp('BLAST_BATAS_HARIAN', 'Batas kampanye per hari', 'number')}</div>
      <div class="tiny muted mb3">Kuota email tersisa hari ini: ${d.email_kuota === null ? '-' : d.email_kuota}. Variabel template: {nama} {paket} {angkatan} {tanggal_ujian} {link_login} {judul_kelas} {jam_kelas} {sisa_hari} {target_minggu_ini} {status_jadwal} {kode}</div>
      <div class="acc">${Object.keys(d.event).map(k => { const e = d.event[k]; return `<details><summary><span class="row"><input type="checkbox" name="NOTIF_EV_${k}" ${e.aktif ? 'checked' : ''} data-ev="1" style="width:18px;height:18px;accent-color:var(--c-primary)"> ${esc(e.label)}</span>${ic('expand_more')}</summary><div class="acc-b"><textarea class="inp" name="TPL_${k}" rows="4">${esc(e.template)}</textarea></div></details>`; }).join('')}</div></div>
    <div class="grid g2" style="align-items:start"><div class="card"><h3 class="mb3">${ic('key')} Rahasia (Script Properties)</h3>
        <div class="fld"><label>Token Fonnte</label><input class="inp" name="R_FONNTE_TOKEN" value="${esc(d.rahasia.FONNTE_TOKEN)}" autocomplete="off"></div>
        <div class="fld"><label>Kunci bersama webhook Lynk (Cloudflare Worker)</label><input class="inp" name="R_SHARED_KEY" value="${esc(d.rahasia.SHARED_KEY)}" autocomplete="off"></div>
        <div class="fld"><label>Token webhook Fonnte</label><input class="inp" name="R_FONNTE_HOOK_TOKEN" value="${esc(d.rahasia.FONNTE_HOOK_TOKEN)}" autocomplete="off"></div>
        <button type="button" class="btn btn-light btn-sm" data-act="cekFonnte">${ic('wifi_tethering')} Cek koneksi Fonnte</button>
        <div class="tiny muted mt3">URL Web App: <code>${esc(d.url_exec || '(deploy dulu)')}</code><br>Webhook Fonnte: <code style="word-break:break-all">${esc(d.hook_fonnte)}</code>${d.catatan_rahasia ? `<br>${esc(d.catatan_rahasia)}` : ''}</div></div>
      <div class="card"><h3 class="mb3">${ic('backup')} Backup & Sistem</h3><div class="small">Backup terakhir: <b>${s.BACKUP_TERAKHIR ? fWaktu(s.BACKUP_TERAKHIR) : 'belum pernah'}</b> · ${stChip(String(s.BACKUP_STATUS || '-').split(':')[0])}</div>
        ${inp('BACKUP_SIMPAN_HARI', 'Simpan backup (hari)', 'number')}
        <div class="row wrap gap2"><button type="button" class="btn btn-light btn-sm" data-act="backupNow">${ic('backup')} Backup sekarang</button><button type="button" class="btn btn-light btn-sm" data-act="pasangTrigger">${ic('schedule')} Pasang ulang trigger</button></div>
        <div class="tiny muted mt2">Trigger aktif: ${d.triggers.map(esc).join(', ') || '-'}</div>
        <details class="mt3"><summary class="small bold">Cara memulihkan dari backup</summary><ol class="small muted"><li>Buka folder Drive “Goukaku Pedia ID/Backup”.</li><li>Salin ID spreadsheet backup yang dipilih.</li><li>Di editor Apps Script → Project Settings → Script Properties → ubah <code>SS_ID</code> ke ID backup.</li><li>Muat ulang aplikasi.</li></ol></details>
        <div class="divider"></div><b class="small">Data dummy</b><div class="row wrap gap2 mt2"><button type="button" class="btn btn-light btn-sm" data-act="dummy" data-a="isi">Isi data dummy</button><button type="button" class="btn btn-bad btn-sm" data-act="dummy" data-a="hapus">Hapus semua data dummy</button></div></div></div>
    <div class="row" style="position:sticky;bottom:12px;justify-content:flex-end"><button class="btn btn-primary" type="submit" style="box-shadow:0 8px 24px rgba(4,28,162,.35)">${ic('save')} Simpan Pengaturan</button></div></form>`;
};
FORM.simpanSetting = (f, d) => kunciTombol(f, async () => {
  const setting = {}, rahasia = {};
  Object.keys(d).forEach(k => { if (k.indexOf('R_') === 0) rahasia[k.slice(2)] = d[k]; else if (/^(NOTIF_WA|NOTIF_EMAIL|NOTIF_SENIN)$/.test(k)) setting[k] = d[k] ? 'ya' : 'tidak'; else if (k.indexOf('NOTIF_EV_') === 0) setting[k] = d[k] ? 'ya' : 'tidak'; else setting[k] = d[k]; });
  try { S.ad.__setting = await API.call('a.setting.save', { setting, rahasia }); toast('Pengaturan tersimpan ✓'); render(false); } catch (e) { toast(e.message, 'err'); }
});
ACT.cekFonnte = async () => { try { const r = await API.call('a.fonnte.cek', {}); modal(`<pre style="white-space:pre-wrap;font-size:12px">${esc(JSON.stringify(r, null, 2))}</pre>`, { title: 'Status Fonnte' }); } catch (e) { toast(e.message, 'err'); } };
ACT.backupNow = async el => { el.classList.add('loading'); try { const r = await API.call('a.backup.now', {}, { timeout: 120000 }); toast(r.status === 'berhasil' ? 'Backup berhasil: ' + r.nama : 'Backup gagal: ' + r.error, r.status === 'berhasil' ? 'ok' : 'err'); S.ad.__setting = undefined; render(false); } catch (e) { toast(e.message, 'err'); } finally { el.classList.remove('loading'); } };
ACT.pasangTrigger = async () => { try { await API.call('a.trigger.pasang', {}); toast('Trigger terpasang'); S.ad.__setting = undefined; render(false); } catch (e) { toast(e.message, 'err'); } };
ACT.dummy = async el => { const h = el.dataset.a === 'hapus'; if (!await confirmBox(h ? 'Hapus SEMUA data dummy (id berawalan DMY-)? Lakukan sebelum go-live.' : 'Isi data dummy contoh?', h ? 'Hapus' : 'Isi', h)) return; try { await API.call('a.dummy', { aksi: el.dataset.a }, { timeout: 180000 }); toast('Selesai'); S.ad = {}; Object.keys(localStorage).filter(k => k.startsWith('gp_ad_')).forEach(k => LS.del(k)); muatAdmin(); } catch (e) { toast(e.message, 'err'); } };

/* ---------- Migrasi dari aplikasi lama ---------- */
R['a/migrasi'] = () => {
  S.ui.title = 'Migrasi Data'; if (!isSU()) return '<div class="card empty">Khusus Superadmin.</div>';
  const M = S.ui.mig || {};
  return `<div class="card"><h3>Migrasi dari spreadsheet aplikasi lama</h3><p class="small muted mt1">Spreadsheet lama hanya <b>dibaca</b>. Kolom dicocokkan berdasarkan nama header. Aman diulang (upsert). Jalankan <b>Pindai</b> dulu, lalu <b>Jalankan</b>. Ulangi sesaat sebelum go-live untuk menangkap data terbaru (delta-sync).</p>
    <form data-form="migSumber" class="row wrap gap2 mt3"><input class="inp f1" name="sumber" placeholder="ID atau URL spreadsheet lama" value="${esc(M.sumber || '')}" required><button class="btn btn-primary" type="submit">Baca sheet</button></form></div>
  ${M.info ? `<div class="card"><h3 class="mb3">Peta sheet: ${esc(M.info.judul)}</h3><div class="col gap2" id="migPeta">${M.info.sheets.map((s, i) => `<div class="row wrap gap2" style="border-bottom:1px solid var(--c-line);padding-bottom:8px"><label class="chk" style="min-width:220px"><input type="checkbox" data-mig="${i}" ${M.pilih && M.pilih[i] ? 'checked' : ''}><span><b>${esc(s.nama)}</b> <span class="tiny muted">${s.baris} baris</span><br><span class="tiny muted">${s.header.slice(0, 8).map(esc).join(', ')}…</span></span></label>
      <span>${ic('arrow_forward')}</span><select class="inp" style="max-width:220px" data-ke="${i}"><option value="">— target —</option>${['Member', 'Leads', 'Kontak', 'Interaksi', 'HasilKuis', 'Pembayaran', 'Kosakata', 'BankSoal', 'Materi', 'Testimoni', 'BuktiLulus', 'FAQ'].map(t => `<option ${guessTarget(s.nama) === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <input class="inp" style="max-width:150px" placeholder="kunci (auto)" data-kunci="${i}"></div>`).join('')}</div>
    <div class="row gap2 mt3"><button class="btn btn-light" data-act="migJalan" data-dry="1">${ic('search')} Pindai (dry-run)</button><button class="btn btn-red" data-act="migJalan" data-dry="0">${ic('play_arrow')} Jalankan migrasi</button></div></div>` : ''}
  ${M.hasil ? `<div class="card"><h3 class="mb3">${M.hasil.dry ? 'Hasil pindai (belum ditulis)' : 'Hasil migrasi'}</h3><div class="tbl-wrap" style="box-shadow:none"><table class="tbl"><tr><th>Dari</th><th>Ke</th><th>Kunci</th><th>Tambah</th><th>Ubah</th><th>Lewati</th><th>Kolom cocok</th></tr>${M.hasil.laporan.map(l => `<tr><td>${esc(l.dari)}</td><td>${esc(l.ke)}</td><td>${esc(l.kunci || '')}</td><td>${l.error ? `<span style="color:var(--c-bad)">${esc(l.error)}</span>` : l.tambah}</td><td>${l.ubah || 0}</td><td>${l.lewati || 0}</td><td class="tiny">${(l.kolom_cocok || []).map(esc).join(', ')}</td></tr>`).join('')}</table></div></div>` : ''}`;
};
function guessTarget(n) { n = String(n).toLowerCase(); return /member|siswa|murid|user/.test(n) ? 'Member' : /lead|calon|daftar/.test(n) ? 'Leads' : /kontak|crm/.test(n) ? 'Kontak' : /hasil|nilai|skor/.test(n) ? 'HasilKuis' : /bayar|transaksi/.test(n) ? 'Pembayaran' : /kosa|vocab/.test(n) ? 'Kosakata' : /soal/.test(n) ? 'BankSoal' : ''; }
FORM.migSumber = (f, d) => kunciTombol(f, async () => { try { const info = await API.call('a.migrasi.sheets', { sumber: d.sumber }); S.ui.mig = { sumber: d.sumber, info, pilih: {} }; render(false); } catch (e) { toast(e.message, 'err'); } });
ACT.migJalan = async el => {
  const M = S.ui.mig, dry = el.dataset.dry === '1', peta = [];
  $$('[data-mig]').forEach(c => { const i = c.dataset.mig; M.pilih[i] = c.checked; const ke = $(`[data-ke="${i}"]`).value; if (c.checked && ke) peta.push({ dari: M.info.sheets[i].nama, ke, kunci: $(`[data-kunci="${i}"]`).value || '' }); });
  if (!peta.length) return toast('Centang sheet dan pilih target', 'warn');
  if (!dry && !await confirmBox('Tulis data ke spreadsheet aplikasi baru sekarang?', 'Jalankan', true)) return;
  el.classList.add('loading');
  try { M.hasil = await API.call('a.migrasi.jalankan', { sumber: M.sumber, peta, dry }, { timeout: 330000 }); render(false); toast(dry ? 'Pindai selesai' : 'Migrasi selesai'); } catch (e) { toast(e.message, 'err'); } finally { el.classList.remove('loading'); }
};
/* ============================================================================
 * BOOT: render instan dari cache → muat data di latar belakang
 * ========================================================================== */
(function boot() {
  const h = parseHash();
  if (S.auth && S.auth.role === 'member') S.boot = LS.get('gp_boot_' + S.auth.email);
  if (S.auth && (S.auth.role === 'admin' || S.auth.role === 'superadmin')) S.adm = LS.get('gp_adm');
  if (S.boot) recalcLocal();
  const awal = S.auth ? (S.auth.role === 'member' ? 'm/beranda' : 'a/ringkasan') : 'home';
  S.route = h.route || awal; S.params = h.params || {};
  if (S.route === 'm/kuis') S.quiz = LS.get('gp_quiz');
  if (S.route === 'daftar' && LS.get('gp_daftar') && h.params.id === 'ok') S.daftarOk = LS.get('gp_daftar');
  render(true);
  // Alamat khusus admin: …/?admin atau …/#admin langsung ke form login admin
  if (!S.auth && /[?&]admin(=|&|$)/.test(location.search) && S.route !== 'admin') go('admin', {}, { replace: true });
  // Latar belakang (tidak menahan tampilan)
  muatPublik();
  if (S.auth && S.auth.role === 'member') { muatBoot(!!S.boot); OB.flush(); }
  if (S.auth && S.auth.role !== 'member' && S.auth.role) muatAdmin();
  try {
    if (!sessionStorage.getItem('gp_kj')) {
      sessionStorage.setItem('gp_kj', '1');
      const q = new URLSearchParams(location.search), ref = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : '';
      const sumber = q.get('src') || q.get('utm_source') || (/tiktok/.test(ref) ? 'tiktok' : /instagram/.test(ref) ? 'instagram' : /whatsapp|wa\.me/.test(ref) ? 'whatsapp' : ref && ref.indexOf('google') < 0 ? ref : 'langsung');
      idle(() => API.call('p.kunjungan', { sumber }, { silent: true }).catch(() => { }));
    }
  } catch (e) { }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => { });
  syncDot();
  window.GP_READY = true;
})();
/* PENANDA AKHIR FILE — jangan dihapus */
window.GP_JS_END = true;
