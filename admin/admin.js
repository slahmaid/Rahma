/* Sahaby admin panel — talks to the Apps Script API (backend/Code.gs). No token is stored in code. */
(() => {
'use strict';
const DEFAULT_URL = 'https://script.google.com/macros/s/AKfycbw082JH3zXXByf-KuUSUsD6iwkruuXvS26sW8gM8Rl3K_8QmJKGrUxQcU34BvuK8WJ7wg/exec';
const LS_SET = 'sahaby_admin_settings', LS_TOK = 'sahaby_admin_token';
const TZ = 'Africa/Casablanca';
const STATUSES = [['new','جديد'],['confirmed','مؤكد'],['shipping','قيد الشحن'],['delivered','تم التسليم'],['cancelled','ملغى'],['no_answer','لا يجيب']];
const ST_COLOR = {new:'#1a4f9c',confirmed:'#1f6b3a',shipping:'#b8862b',delivered:'#1f3a2e',cancelled:'#a3261f',no_answer:'#9a9a9a'};
const DEF_TPL = {
  confirm: 'السلام عليكم {name}، معك متجر صحابي 🌿\nنؤكد طلبك رقم {id}: {product} × {qty}\nالمجموع: {total} درهم (الدفع عند الاستلام).\nهل نؤكد الإرسال إلى {city}؟',
  shipped: 'السلام عليكم {name}، تم شحن طلبك رقم {id} ({product}) ✅\nسيصلك خلال 24-72 ساعة. المبلغ عند الاستلام: {total} درهم.\nجزاكم الله خيراً.',
  noanswer: 'السلام عليكم {name}، حاولنا الاتصال بك لتأكيد طلبك رقم {id} ({product} - {total} درهم) ولم نتمكن من ذلك.\nالمرجو الرد علينا لتأكيد الطلب. شكراً لك.'
};
const TPL_NAMES = {confirm:'تأكيد الطلب', shipped:'تم الشحن', noanswer:'متابعة (لا يجيب)'};

// ---------- state ----------
const S = Object.assign({url: DEFAULT_URL, interval: 60, sound: true, auto: true, templates: {}}, JSON.parse(localStorage.getItem(LS_SET) || '{}'));
S.templates = Object.assign({}, DEF_TPL, S.templates);
const saveSettings = () => localStorage.setItem(LS_SET, JSON.stringify(S));
let TOKEN = localStorage.getItem(LS_TOK) || sessionStorage.getItem(LS_TOK) || '';
const st = {orders: [], meta: null, loaded: false, loading: false, error: null, known: null, lastSync: null,
  f: {q:'', status:'', from:'', to:'', product:'', city:'', sort:'new', page:1, per:20}, sel: new Set(), days: 14, view: 'dashboard', drawerId: null};
let timer = null;
// ---------- motion helpers (pure enhancement; everything works without them) ----------
const RM = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : {matches: false};
let FX = '';
const restart = (el, c) => { if (!el) return; el.classList.remove(c); void el.offsetWidth; el.classList.add(c); };
function countUp(root) {
  if (RM.matches) return;
  root.querySelectorAll('.kpi b').forEach(b => {
    const txt = b.textContent, m = txt.match(/^([\d,]+)(.*)$/s); if (!m) return;
    const end = +m[1].replace(/,/g, ''); if (!end) return;
    const t0 = performance.now(), D = 700;
    const step = t => { if (!b.isConnected) return; const p = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - p, 3);
      b.textContent = p < 1 ? Math.round(end * e).toLocaleString('en-US') + m[2] : txt; if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}
function applyFx() {
  const k = FX; FX = ''; if (!k) return; const v = $('#view');
  if (k === 'view') { [...v.children].forEach((c, i) => c.style.setProperty('--i', Math.min(i, 8))); $$('#view .kpi').forEach((c, i) => c.style.setProperty('--k', Math.min(i, 11))); restart(v, 'fx-in'); if (st.loaded) countUp(v); }
  $$('#view tbody tr').forEach((tr, i) => tr.style.setProperty('--r', Math.min(i, 14)));
  restart(v, 'fx-rows');
}
function flash(ids) { requestAnimationFrame(() => [].concat(ids).forEach(id => { const tr = document.querySelector(`#otbl tr[data-id="${CSS.escape(id)}"]`); if (tr) restart(tr, 'flash'); })); }
let lastFocus = null;
function navInd() {
  const nav = $('#nav'), a = nav.querySelector('a.on'); let ind = nav.querySelector('.nav-ind');
  if (!ind) { ind = document.createElement('span'); ind.className = 'nav-ind'; ind.setAttribute('aria-hidden', 'true'); nav.appendChild(ind); nav.classList.add('has-ind'); }
  if (a) { ind.style.transform = `translateY(${a.offsetTop}px)`; ind.style.height = a.offsetHeight + 'px'; ind.style.opacity = 1; } else ind.style.opacity = 0;
}
window.addEventListener('resize', () => { if (!$('#app').hidden) navInd(); });

// ---------- utils ----------
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = n => Number(n || 0).toLocaleString('en-US');
const mad = n => num(n) + ' درهم';
const dayStr = d => new Intl.DateTimeFormat('en-CA', {timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit'}).format(d);
const today = () => dayStr(new Date());
const fmtDate = s => s ? String(s).replace('T', ' ').slice(0, 16) : '—';
const stLabel = k => (STATUSES.find(s => s[0] === k) || [k, k])[1];
const badge = k => `<span class="st st-${esc(k)}">${esc(stLabel(k))}</span>`;
const localPhone = p => { const d = String(p || '').replace(/\D/g, ''); return d.length >= 9 ? '0' + d.slice(-9) : String(p || ''); };
const waNum = p => '212' + String(p || '').replace(/\D/g, '').slice(-9);
const fill = (t, o) => t.replace(/\{(\w+)\}/g, (_, k) => k === 'total' ? num(o.total) : k === 'phone' ? localPhone(o.phone) : (o[k] ?? ''));
function toast(msg, err) { const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg; const box = $('#toasts'); box.appendChild(t); while (box.children.length > 3) box.firstChild.remove(); setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), RM.matches ? 0 : 260); }, 4000); }
function beep() { if (!S.sound) return; try { const a = new (window.AudioContext || window.webkitAudioContext)(); [0, .18].forEach(t => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; g.gain.setValueAtTime(.15, a.currentTime + t); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + t + .15); o.connect(g).connect(a.destination); o.start(a.currentTime + t); o.stop(a.currentTime + t + .16); }); } catch (e) {} }

// ---------- API ----------
async function api(action, params = {}, url = S.url, token = TOKEN) {
  const q = new URLSearchParams(Object.assign({action, token}, params));
  const r = await fetch(url + '?' + q, {redirect: 'follow'});
  const j = await r.json();
  if (!j.ok) throw Object.assign(new Error(j.error || 'error'), {code: j.error, data: j});
  return j;
}
async function post(body) {
  const r = await fetch(S.url, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify(Object.assign({token: TOKEN, by: 'admin'}, body)), redirect: 'follow'});
  const j = await r.json();
  if (!j.ok) throw Object.assign(new Error(j.error || 'error'), {code: j.error, data: j});
  return j;
}
const errMsg = e => e.code === 'unauthorized' ? 'رمز الدخول غير صحيح أو منتهي.' : e.code === 'validation' ? 'بيانات غير صحيحة: ' + (e.data.fields || []).join('، ') : e.code === 'not_found' ? 'الطلب غير موجود.' : e.code === 'invalid_status' ? 'حالة غير صالحة.' : 'تعذّر الاتصال بالخادم. تحقق من الإنترنت أو من رابط الـ API.';

async function loadAll(silent) {
  if (st.loading) return;
  st.loading = true; if (!silent) { st.error = null; FX = 'view'; render(); }
  try {
    if (!st.meta) st.meta = await api('meta');
    let page = 1, all = [];
    for (;;) { const r = await api('list', {page, pageSize: 500}); all = all.concat(r.items); if (page >= r.pages || !r.items.length) break; page++; }
    const prevKnown = st.known;
    st.orders = all; st.loaded = true; st.error = null; st.lastSync = new Date();
    const ids = new Set(all.map(o => o.id));
    if (prevKnown) {
      const fresh = all.filter(o => !prevKnown.has(o.id));
      if (fresh.length) { toast(fresh.length === 1 ? `طلب جديد: ${fresh[0].id} — ${fresh[0].name}` : `${fresh.length} طلبات جديدة`); beep(); }
    }
    st.known = ids;
    if (st.sel.size) st.sel = new Set([...st.sel].filter(id => ids.has(id)));
  } catch (e) {
    if (e.code === 'unauthorized') { logout(true); return; }
    st.error = e; if (silent) toast(errMsg(e), true);
  } finally { st.loading = false; if (!silent) FX = 'view'; render(); updateBadge(); }
}
function updateBadge() {
  const n = st.orders.filter(o => o.statusKey === 'new').length;
  document.title = (n ? `(${n}) ` : '') + 'لوحة التحكم | صحابي';
  const b = $('#nb-new'); b.textContent = n; b.hidden = !n;
  $('#sync').textContent = st.lastSync ? 'آخر تحديث ' + st.lastSync.toTimeString().slice(0, 5) : '';
}
function setAuto() { clearInterval(timer); if (S.auto && TOKEN) timer = setInterval(() => loadAll(true), Math.max(15, S.interval) * 1000); $('#auto').checked = S.auto; }
function replaceOrder(o) { const i = st.orders.findIndex(x => x.id === o.id); if (i > -1) st.orders[i] = o; }

// ---------- auth ----------
function showLogin(msg) {
  $('#app').hidden = true; $('#login').hidden = false; $('#lg-url').value = S.url;
  const e = $('#lg-err'); e.textContent = msg || ''; e.classList.toggle('on', !!msg); setTimeout(() => $('#lg-token').focus(), 50);
}
$('#lgf').addEventListener('submit', async ev => {
  ev.preventDefault();
  const tok = $('#lg-token').value.trim(), url = $('#lg-url').value.trim() || DEFAULT_URL, btn = $('#lg-btn');
  if (!/^https:\/\//.test(url)) return showLogin('رابط الـ API غير صالح.');
  btn.disabled = true; btn.classList.add('busy'); btn.setAttribute('aria-busy', 'true'); btn.querySelector('.lg-btn-t').textContent = 'جارٍ التحقق...';
  try {
    const meta = await api('meta', {}, url, tok);
    TOKEN = tok; S.url = url; saveSettings(); st.meta = meta;
    localStorage.removeItem(LS_TOK); sessionStorage.removeItem(LS_TOK);
    ($('#lg-remember').checked ? localStorage : sessionStorage).setItem(LS_TOK, tok);
    $('#lg-token').value = ''; start(); toast('مرحباً بك 👋');
  } catch (e) { showLogin(errMsg(e)); if (!RM.matches) restart($('#lgf'), 'shake'); }
  finally { btn.disabled = false; btn.classList.remove('busy'); btn.removeAttribute('aria-busy'); btn.querySelector('.lg-btn-t').textContent = 'دخول'; }
});
function logout(expired) {
  TOKEN = ''; localStorage.removeItem(LS_TOK); sessionStorage.removeItem(LS_TOK); clearInterval(timer);
  Object.assign(st, {orders: [], meta: null, loaded: false, known: null, error: null}); st.sel.clear(); closeDrawer();
  showLogin(expired ? 'انتهت الجلسة أو الرمز غير صحيح، المرجو تسجيل الدخول من جديد.' : '');
}
$('#lg-eye').onclick = () => { const i = $('#lg-token'), show = i.type === 'password'; i.type = show ? 'text' : 'password'; $('#lg-eye').classList.toggle('on', show); $('#lg-eye').setAttribute('aria-label', show ? 'إخفاء الرمز' : 'إظهار الرمز'); i.focus(); };
$('#lg-forgot').onclick = () => { const h = $('#lg-hint'); h.hidden = !h.hidden; $('#lg-forgot').setAttribute('aria-expanded', String(!h.hidden)); };
$('#logout').onclick = () => { if (confirm('تسجيل الخروج؟')) logout(); };
function start() { $('#login').hidden = true; $('#app').hidden = false; if (!location.hash) location.hash = '#/dashboard'; route(); setAuto(); loadAll(); }

// ---------- layout ----------
const TITLES = {dashboard:'لوحة القيادة', orders:'الطلبات', customers:'العملاء', products:'المنتجات', settings:'الإعدادات'};
function route() {
  const v = (location.hash.match(/^#\/(\w+)/) || [])[1];
  st.view = TITLES[v] ? v : 'dashboard';
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.v === st.view));
  $('#title').textContent = TITLES[st.view]; closeSide(); FX = 'view'; render(); navInd();
}
window.addEventListener('hashchange', route);
const closeSide = () => { $('#side').classList.remove('on'); $('#scrim').classList.remove('on'); };
$('#burger').onclick = () => { $('#side').classList.add('on'); $('#scrim').classList.add('on'); };
$('#scrim').onclick = closeSide;
$('#refresh').onclick = () => loadAll();
$('#auto').onchange = e => { S.auto = e.target.checked; saveSettings(); setAuto(); toast(S.auto ? 'التحديث التلقائي مفعّل' : 'التحديث التلقائي متوقف'); };
document.addEventListener('keydown', e => {
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); if (st.view !== 'orders') location.hash = '#/orders'; setTimeout(() => { const s = $('#f-q'); s && s.focus(); }, 30); }
  if (e.key === 'Escape') closeDrawer();
});

function render() { renderCore(); applyFx(); }
function renderCore() {
  if ($('#app').hidden) return;
  const v = $('#view');
  if (st.view === 'settings') return v.innerHTML = vSettings(), bindSettings();
  if (st.error && !st.loaded) return v.innerHTML = `<div class="err"><h3>تعذّر تحميل البيانات</h3><p>${esc(errMsg(st.error))}</p><button class="btn pri" id="retry">إعادة المحاولة</button></div>`, $('#retry').onclick = () => loadAll();
  if (!st.loaded) return v.innerHTML = skeleton();
  ({dashboard: () => { v.innerHTML = vDash(); bindDash(); }, orders: () => { v.innerHTML = vOrders(); bindOrders(); }, customers: () => { v.innerHTML = vCustomers(); bindCustomers(); }, products: () => { v.innerHTML = vProducts(); }})[st.view]();
}
const skeleton = () => `<div class="kpis">${'<div class="kpi sk sk-kpi"></div>'.repeat(8)}</div><div class="grid2"><div class="sk sk-box"></div><div class="sk sk-box"></div></div>${'<div class="sk sk-line"></div>'.repeat(5)}`;

// ---------- dashboard ----------
function agg() {
  const O = st.orders, by = {}; STATUSES.forEach(s => by[s[0]] = 0);
  let rev = 0, pipe = 0, td = 0; const t = today();
  O.forEach(o => { by[o.statusKey] = (by[o.statusKey] || 0) + 1; if (o.statusKey === 'delivered') rev += +o.total || 0; if (o.statusKey === 'confirmed' || o.statusKey === 'shipping') pipe += +o.total || 0; if (String(o.createdAt).slice(0, 10) === t) td++; });
  const decided = O.length - by.new;
  const reached = by.confirmed + by.shipping + by.delivered;
  return {by, rev, pipe, td, total: O.length, confRate: decided ? Math.round(reached / decided * 100) : 0, delRate: reached ? Math.round(by.delivered / reached * 100) : 0};
}
function topBy(key, label) {
  const m = {};
  st.orders.filter(o => o.statusKey !== 'cancelled').forEach(o => { const k = o[key] || '—'; m[k] = m[k] || {k, label: label ? label(o) : k, n: 0, sum: 0}; m[k].n++; m[k].sum += +o.total || 0; });
  return Object.values(m).sort((a, b) => b.n - a.n).slice(0, 6);
}
function series(days) {
  const out = [], idx = {};
  for (let i = days - 1; i >= 0; i--) { const d = dayStr(new Date(Date.now() - i * 864e5)); idx[d] = out.length; out.push({d, n: 0, rev: 0}); }
  st.orders.forEach(o => { const i = idx[String(o.createdAt).slice(0, 10)]; if (i == null) return; out[i].n++; if (o.statusKey !== 'cancelled') out[i].rev += +o.total || 0; });
  return out;
}
function chartSvg(data) {
  const W = 720, H = 240, P = {l: 34, r: 40, t: 14, b: 26}, iw = W - P.l - P.r, ih = H - P.t - P.b;
  const mN = Math.max(1, ...data.map(d => d.n)), mR = Math.max(1, ...data.map(d => d.rev)), bw = iw / data.length;
  // RTL-friendly: newest day on the left like a timeline reading right->left? Keep chronological left->right for charts (standard).
  let g = '';
  for (let i = 0; i <= 4; i++) { const y = P.t + ih - ih * i / 4; g += `<line x1="${P.l}" x2="${W - P.r}" y1="${y}" y2="${y}" stroke="#eee"/><text x="${P.l - 6}" y="${y + 3}" text-anchor="end">${Math.round(mN * i / 4)}</text><text x="${W - P.r + 6}" y="${y + 3}">${num(Math.round(mR * i / 4))}</text>`; }
  data.forEach((d, i) => { const h = ih * d.n / mN, x = P.l + i * bw + bw * .18; g += `<rect x="${x}" y="${P.t + ih - h}" width="${bw * .64}" height="${h}" fill="#1f3a2e"><title>${d.d}: ${d.n} طلب</title></rect>`; if (data.length <= 14 || i % 3 === 0) g += `<text x="${x + bw * .32}" y="${H - 8}" text-anchor="middle">${d.d.slice(8)}/${d.d.slice(5, 7)}</text>`; });
  const pts = data.map((d, i) => `${P.l + i * bw + bw / 2},${P.t + ih - ih * d.rev / mR}`).join(' ');
  g += `<polyline points="${pts}" fill="none" stroke="#b8862b" stroke-width="2.5"/>` + data.map((d, i) => `<circle cx="${P.l + i * bw + bw / 2}" cy="${P.t + ih - ih * d.rev / mR}" r="3" fill="#b8862b"><title>${d.d}: ${mad(d.rev)}</title></circle>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" dir="ltr">${g}</svg>`;
}
function donutSvg(by) {
  const tot = Object.values(by).reduce((a, b) => a + b, 0) || 1, R = 60, c = 2 * Math.PI * R; let off = 0, segs = '';
  STATUSES.forEach(([k]) => { const v = by[k] || 0; if (!v) return; const len = c * v / tot; segs += `<circle r="${R}" cx="75" cy="75" fill="none" stroke="${ST_COLOR[k]}" stroke-width="22" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 75 75)"><title>${stLabel(k)}: ${v}</title></circle>`; off += len; });
  return `<svg viewBox="0 0 150 150"><circle r="${R}" cx="75" cy="75" fill="none" stroke="#f0ebe0" stroke-width="22"/>${segs}<text x="75" y="72" text-anchor="middle" font-size="22" font-weight="700" fill="#1f3a2e" font-family="Cairo">${tot === 1 && !Object.values(by).some(Boolean) ? 0 : num(tot)}</text><text x="75" y="92" text-anchor="middle" font-size="11" fill="#7d857f" font-family="Cairo">طلب</text></svg>`;
}
const barsList = (rows, money) => rows.length ? `<ul class="bars">${rows.map(r => `<li><div class="bl"><span>${esc(r.label)}</span><b>${num(r.n)}${money ? ' · ' + mad(r.sum) : ''}</b></div><div class="bt"><span style="width:${Math.round(r.n / rows[0].n * 100)}%"></span></div></li>`).join('')}</ul>` : '<p class="mu">لا توجد بيانات بعد</p>';
function vDash() {
  const a = agg(), ser = series(st.days);
  const k = (cls, l, v, sub) => `<div class="kpi ${cls}"><small>${l}</small><b>${v}</b>${sub ? `<i>${sub}</i>` : ''}</div>`;
  return `<div class="kpis">
   ${k('', 'إجمالي الطلبات', num(a.total))}${k('', 'طلبات اليوم', num(a.td))}${k('k-new', 'جديدة بانتظار التأكيد', num(a.by.new))}${k('k-conf', 'مؤكدة', num(a.by.confirmed))}
   ${k('k-ship', 'قيد الشحن', num(a.by.shipping))}${k('k-del', 'تم التسليم', num(a.by.delivered))}${k('k-can', 'ملغاة / لا يجيب', num(a.by.cancelled + a.by.no_answer), `ملغى ${a.by.cancelled} · لا يجيب ${a.by.no_answer}`)}
   ${k('k-money', 'الإيرادات (تم التسليم)', mad(a.rev))}${k('k-money', 'قيمة الطلبات الجارية', mad(a.pipe), 'مؤكد + قيد الشحن')}
   ${k('', 'نسبة التأكيد', a.confRate + '%', 'من الطلبات المعالجة')}${k('', 'نسبة التسليم', a.delRate + '%', 'من الطلبات المؤكدة')}</div>
  <div class="grid2"><section class="panel"><h3>الطلبات والإيرادات اليومية <span class="seg" id="days"><button data-d="14" class="${st.days === 14 ? 'on' : ''}">14 يوم</button><button data-d="30" class="${st.days === 30 ? 'on' : ''}">30 يوم</button></span></h3>
   <div class="pbody chart">${chartSvg(ser)}<div class="legend"><span><i style="background:#1f3a2e"></i>عدد الطلبات</span><span><i style="background:#b8862b"></i>الإيرادات (درهم، بدون الملغاة)</span><span>المجموع: ${num(ser.reduce((s, d) => s + d.n, 0))} طلب · ${mad(ser.reduce((s, d) => s + d.rev, 0))}</span></div></div></section>
   <section class="panel"><h3>توزيع الحالات</h3><div class="pbody donut">${donutSvg(a.by)}<ul>${STATUSES.map(([k, l]) => `<li><span><i style="background:${ST_COLOR[k]}"></i>${l}</span><b>${num(a.by[k])}</b></li>`).join('')}</ul></div></section></div>
  <div class="grid2 eq"><section class="panel"><h3>أكثر المنتجات طلباً</h3><div class="pbody">${barsList(topBy('productId', o => o.product), true)}</div></section>
   <section class="panel"><h3>أكثر المدن</h3><div class="pbody">${barsList(topBy('city'))}</div></section></div>`;
}
function bindDash() { $$('#days button').forEach(b => b.onclick = () => { st.days = +b.dataset.d; render(); }); }

// ---------- orders ----------
function filtered() {
  const f = st.f, q = f.q.trim().toLowerCase().replace(/\s/g, '');
  let L = st.orders.filter(o => (!f.status || o.statusKey === f.status) && (!f.product || o.productId === f.product) && (!f.city || o.city === f.city)
    && (!f.from || String(o.createdAt).slice(0, 10) >= f.from) && (!f.to || String(o.createdAt).slice(0, 10) <= f.to)
    && (!q || [o.id, o.name, o.phone, localPhone(o.phone), o.city, o.product].join('|').toLowerCase().replace(/\s/g, '').includes(q)));
  const S2 = {new: (a, b) => a.createdAt < b.createdAt ? 1 : -1, old: (a, b) => a.createdAt > b.createdAt ? 1 : -1, tdesc: (a, b) => b.total - a.total, tasc: (a, b) => a.total - b.total, name: (a, b) => String(a.name).localeCompare(b.name, 'ar')};
  return L.sort(S2[f.sort] || S2.new);
}
const repeatSet = () => { const c = {}; st.orders.forEach(o => c[o.phone] = (c[o.phone] || 0) + 1); return c; };
function vOrders() {
  const f = st.f, L = filtered(), pages = Math.max(1, Math.ceil(L.length / f.per)); f.page = Math.min(f.page, pages);
  const P = L.slice((f.page - 1) * f.per, f.page * f.per), rep = repeatSet();
  const cities = [...new Set(st.orders.map(o => o.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
  const prods = Object.entries((st.meta && st.meta.products) || {});
  const opt = (v, l, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`;
  const allSel = P.length && P.every(o => st.sel.has(o.id));
  return `<div class="tools">
   <div class="f s"><label for="f-q">بحث</label><div class="search"><input id="f-q" placeholder="الاسم، الهاتف، رقم الطلب، المدينة" value="${esc(f.q)}"><kbd>/</kbd></div></div>
   <div class="f"><label>الحالة</label><select id="f-status">${opt('', 'كل الحالات', f.status)}${STATUSES.map(s => opt(s[0], s[1], f.status)).join('')}</select></div>
   <div class="f"><label>المنتج</label><select id="f-product">${opt('', 'كل المنتجات', f.product)}${prods.map(([id, p]) => opt(id, p.name, f.product)).join('')}</select></div>
   <div class="f"><label>المدينة</label><select id="f-city">${opt('', 'كل المدن', f.city)}${cities.map(c => opt(c, c, f.city)).join('')}</select></div>
   <div class="f"><label>من</label><input type="date" id="f-from" value="${esc(f.from)}"></div><div class="f"><label>إلى</label><input type="date" id="f-to" value="${esc(f.to)}"></div>
   <div class="f"><label>ترتيب</label><select id="f-sort">${opt('new', 'الأحدث', f.sort)}${opt('old', 'الأقدم', f.sort)}${opt('tdesc', 'الأعلى مبلغاً', f.sort)}${opt('tasc', 'الأقل مبلغاً', f.sort)}${opt('name', 'الاسم', f.sort)}</select></div>
   <div class="acts"><button class="btn" id="f-reset">مسح الفلاتر</button><button class="btn" id="x-csv">CSV</button><button class="btn" id="x-xls">Excel</button><button class="btn" id="x-print">طباعة القائمة</button></div></div>
  ${st.sel.size ? `<div class="bulk"><b>${st.sel.size} محدد</b><select id="b-st"><option value="">تغيير الحالة إلى…</option>${STATUSES.map(s => `<option value="${s[0]}">${s[1]}</option>`).join('')}</select><button class="btn gold" id="b-go">تطبيق</button><button class="btn" id="b-slips">طباعة الوصولات</button><button class="btn ghost" id="b-clear" style="color:#fff">إلغاء التحديد</button></div>` : ''}
  ${L.length ? `<div class="tbl-wrap"><table class="cards" id="otbl"><thead><tr><th><input type="checkbox" id="sel-all" ${allSel ? 'checked' : ''} aria-label="تحديد الكل"></th><th>رقم الطلب</th><th class="sortable" data-s="new">التاريخ</th><th class="sortable" data-s="name">الاسم</th><th>الهاتف</th><th>المدينة</th><th>المنتج</th><th>الكمية</th><th class="sortable" data-s="tdesc">المجموع</th><th>الحالة</th></tr></thead><tbody>
   ${P.map(o => `<tr data-id="${esc(o.id)}" class="${st.sel.has(o.id) ? 'sel' : ''}"><td class="c-chk"><input type="checkbox" class="rsel" ${st.sel.has(o.id) ? 'checked' : ''} aria-label="تحديد"></td><td class="c-id" dir="ltr">${esc(o.id)}</td><td class="c-date">${esc(fmtDate(o.createdAt))}</td><td class="c-name" title="${esc(o.name)}"><span class="nm">${esc(o.name)}</span>${rep[o.phone] > 1 ? `<span class="rep" title="عميل متكرر">×${rep[o.phone]}</span>` : ''}</td><td class="c-phone" dir="ltr">${esc(localPhone(o.phone))}</td><td class="c-city">${esc(o.city)}</td><td class="c-prod">${esc(o.product)}${(window.innerWidth <= 900) ? ' × ' + o.qty + ' · ' + esc(o.city) : ''}</td><td class="c-qty">${o.qty}</td><td class="c-total num">${mad(o.total)}</td><td class="c-st"><select class="qs st st-${o.statusKey}" aria-label="الحالة">${STATUSES.map(s => `<option value="${s[0]}"${s[0] === o.statusKey ? ' selected' : ''}>${s[1]}</option>`).join('')}</select></td></tr>`).join('')}
   </tbody></table><div class="pager"><span>${num(L.length)} طلب · المجموع ${mad(L.reduce((s, o) => s + (+o.total || 0), 0))}</span><div class="pg"><button class="btn" id="pg-prev" ${f.page <= 1 ? 'disabled' : ''}>السابق</button><span style="padding:6px 10px">${f.page} / ${pages}</span><button class="btn" id="pg-next" ${f.page >= pages ? 'disabled' : ''}>التالي</button></div></div></div>`
  : `<div class="empty"><h3>${st.orders.length ? 'لا توجد طلبات مطابقة' : 'لا توجد طلبات بعد'}</h3><p>${st.orders.length ? 'جرّب تعديل البحث أو الفلاتر.' : 'ستظهر الطلبات هنا فور وصولها من المتجر.'}</p>${st.orders.length ? '<button class="btn pri" id="e-reset">مسح الفلاتر</button>' : ''}</div>`}`;
}
function bindOrders() {
  const f = st.f, re = () => { f.page = 1; FX = 'rows'; render(); };
  const q = $('#f-q'); let tmo;
  q.oninput = () => { clearTimeout(tmo); tmo = setTimeout(() => { f.q = q.value; f.page = 1; FX = 'rows'; const pos = q.selectionStart; render(); const n = $('#f-q'); n.focus(); n.setSelectionRange(pos, pos); }, 250); };
  [['status'], ['product'], ['city'], ['from'], ['to'], ['sort']].forEach(([k]) => { const el = $('#f-' + k); el.onchange = () => { f[k] = el.value; re(); }; });
  const reset = () => { Object.assign(f, {q:'', status:'', from:'', to:'', product:'', city:'', sort:'new', page:1}); FX = 'rows'; render(); };
  $('#f-reset').onclick = reset; const er = $('#e-reset'); if (er) er.onclick = reset;
  $('#x-csv').onclick = () => exportFile('csv'); $('#x-xls').onclick = () => exportFile('xls'); $('#x-print').onclick = printList;
  $$('th.sortable').forEach(th => th.onclick = () => { f.sort = th.dataset.s === f.sort && f.sort === 'new' ? 'old' : th.dataset.s; re(); });
  const pv = $('#pg-prev'), nx = $('#pg-next'); if (pv) { pv.onclick = () => { f.page--; FX = 'rows'; render(); }; nx.onclick = () => { f.page++; FX = 'rows'; render(); }; }
  const sa = $('#sel-all'); if (sa) sa.onchange = () => { $$('#otbl tbody tr').forEach(tr => sa.checked ? st.sel.add(tr.dataset.id) : st.sel.delete(tr.dataset.id)); render(); };
  $$('#otbl tbody tr').forEach(tr => {
    const id = tr.dataset.id;
    tr.querySelector('.rsel').onchange = e => { e.target.checked ? st.sel.add(id) : st.sel.delete(id); render(); };
    tr.querySelector('.c-chk').onclick = e => e.stopPropagation();
    const qs = tr.querySelector('.qs'); qs.onclick = e => e.stopPropagation();
    qs.onchange = () => changeStatus(id, qs.value);
    tr.onclick = () => openDrawer(id);
  });
  if ($('#b-go')) {
    $('#b-go').onclick = async () => {
      const s = $('#b-st').value; if (!s) return toast('اختر الحالة أولاً', true);
      if (!confirm(`تغيير حالة ${st.sel.size} طلب إلى "${stLabel(s)}"؟`)) return;
      const btn = $('#b-go'); btn.disabled = true;
      try { const r = await post({action: 'bulkStatus', ids: [...st.sel], status: s}); r.ids.forEach(id => { const o = st.orders.find(x => x.id === id); if (o) { o.statusKey = s; o.status = stLabel(s); } }); toast(`تم تحديث ${r.updated} طلب`); st.sel.clear(); render(); updateBadge(); flash(r.ids); }
      catch (e) { toast(errMsg(e), true); btn.disabled = false; }
    };
    $('#b-clear').onclick = () => { st.sel.clear(); render(); };
    $('#b-slips').onclick = () => printSlips(st.orders.filter(o => st.sel.has(o.id)));
  }
}
async function changeStatus(id, s) {
  try { const r = await post({action: 'updateStatus', id, status: s}); replaceOrder(r.order); toast(`${id}: ${stLabel(s)}`); render(); updateBadge(); flash(id); if (st.drawerId === id) openDrawer(id); }
  catch (e) { toast(errMsg(e), true); render(); }
}

// ---------- drawer ----------
function closeDrawer() { const was = $('#drawer').classList.contains('on'); $('#drawer').inert = true; if (was && lastFocus && lastFocus.isConnected) lastFocus.focus(); st.drawerId = null; $('#drawer').classList.remove('on'); $('#dscrim').classList.remove('on'); $('#drawer').setAttribute('aria-hidden', 'true'); }
$('#dscrim').onclick = closeDrawer;
const FIELD_AR = {status:'الحالة', notes:'الملاحظات', name:'الاسم', phone:'الهاتف', city:'المدينة', address:'العنوان', qty:'الكمية', productId:'رمز المنتج', product:'المنتج', unitPrice:'سعر الوحدة', total:'المجموع', delivery:'التوصيل'};
const BY_AR = {website:'المتجر', admin:'لوحة التحكم', sheet:'الجدول'};
async function openDrawer(id) {
  const o = st.orders.find(x => x.id === id); if (!o) return;
  st.drawerId = id; const rep = repeatSet()[o.phone] || 1;
  const prods = Object.entries((st.meta && st.meta.products) || {});
  $('#dr').innerHTML = `<div class="dr-head"><div><h2>${esc(o.id)}</h2><p>${esc(fmtDate(o.createdAt))} · ${badge(o.statusKey)}</p></div><button class="x" id="dr-x" aria-label="إغلاق">×</button></div>
  <div class="dr-sec"><h4>العميل</h4><dl class="kv"><dt>الاسم</dt><dd>${esc(o.name)} ${rep > 1 ? `<span class="rep">عميل متكرر ×${rep}</span>` : ''}</dd><dt>الهاتف</dt><dd dir="ltr" style="text-align:right">${esc(localPhone(o.phone))}</dd><dt>المدينة</dt><dd>${esc(o.city)}</dd><dt>العنوان</dt><dd>${esc(o.address || '—')}</dd></dl>
   <div class="dr-acts" style="margin-top:12px"><a class="btn pri" href="tel:${esc(o.phone)}"><svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>اتصال</a><button class="btn" id="dr-copy">نسخ الهاتف</button>
   ${Object.keys(TPL_NAMES).map(k => `<a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/${waNum(o.phone)}?text=${encodeURIComponent(fill(S.templates[k], o))}">واتساب: ${TPL_NAMES[k]}</a>`).join('')}</div></div>
  <div class="dr-sec"><h4>الطلب</h4><dl class="kv"><dt>المنتج</dt><dd>${esc(o.product)}</dd><dt>الكمية</dt><dd>${o.qty}</dd><dt>سعر الوحدة</dt><dd>${mad(o.unitPrice)}</dd><dt>التوصيل</dt><dd>${esc(o.delivery)}</dd><dt>المجموع</dt><dd class="total-big">${mad(o.total)}</dd><dt>المصدر</dt><dd style="font-size:12px;word-break:break-all">${esc(o.source || '—')}</dd><dt>آخر تحديث</dt><dd>${esc(fmtDate(o.updatedAt))}</dd></dl></div>
  <div class="dr-sec"><h4>الحالة</h4><div class="dr-acts"><select id="dr-st" style="width:auto">${STATUSES.map(s => `<option value="${s[0]}"${s[0] === o.statusKey ? ' selected' : ''}>${s[1]}</option>`).join('')}</select><button class="btn pri" id="dr-st-go">حفظ الحالة</button><button class="btn" id="dr-print">طباعة الوصل</button><button class="btn dang" id="dr-del">إلغاء / حذف</button></div></div>
  <div class="dr-sec"><h4>ملاحظات</h4><textarea id="dr-note" rows="3" placeholder="ملاحظة داخلية...">${esc(o.notes)}</textarea><button class="btn" id="dr-note-go" style="margin-top:8px">حفظ الملاحظة</button></div>
  <div class="dr-sec"><details><summary style="cursor:pointer;font-weight:700;color:#1f3a2e">تعديل بيانات الطلب</summary><form class="frm" id="dr-edit" style="margin-top:12px">
   <div><label>الاسم</label><input name="name" value="${esc(o.name)}"></div><div><label>الهاتف</label><input name="phone" dir="ltr" value="${esc(localPhone(o.phone))}"></div>
   <div><label>المدينة</label><input name="city" value="${esc(o.city)}"></div><div><label>الكمية</label><input name="qty" type="number" min="1" max="99" value="${o.qty}"></div>
   <div class="full"><label>المنتج</label><select name="productId">${prods.map(([pid, p]) => `<option value="${pid}"${pid === o.productId ? ' selected' : ''}>${esc(p.name)} — ${mad(p.price)}</option>`).join('')}</select></div>
   <div class="full"><label>العنوان</label><input name="address" value="${esc(o.address || '')}"></div>
   <div class="full"><button class="btn pri" type="submit">حفظ التعديلات</button><p class="note-s">يُعاد حساب المجموع على الخادم حسب الأسعار في Code.gs.</p></div></form></details></div>
  <div class="dr-sec"><h4>سجل التغييرات</h4><div id="dr-hist"><div class="sk sk-line"></div><div class="sk sk-line"></div></div></div>`;
  const wasOpen = $('#drawer').classList.contains('on'); $('#drawer').inert = false;
  if (!wasOpen) { lastFocus = document.activeElement; restart($('#dr'), 'fx-dr'); setTimeout(() => { const x = $('#dr-x'); x && x.focus({preventScroll: true}); }, 30); }
  $('#drawer').classList.add('on'); $('#dscrim').classList.add('on'); $('#drawer').setAttribute('aria-hidden', 'false');
  $('#dr-x').onclick = closeDrawer;
  $('#dr-copy').onclick = async () => { const p = localPhone(o.phone); try { await navigator.clipboard.writeText(p); } catch (e) { const t = document.createElement('textarea'); t.value = p; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); } toast('تم نسخ الرقم ' + p); };
  $('#dr-st-go').onclick = () => changeStatus(id, $('#dr-st').value);
  $('#dr-print').onclick = () => printSlips([o]);
  $('#dr-del').onclick = async () => { if (!confirm(`إلغاء الطلب ${id}؟ سيتم تعيين الحالة "ملغى" مع وسم [محذوف]. البيانات لا تُحذف نهائياً.`)) return; try { const r = await post({action: 'delete', id}); replaceOrder(r.order); toast('تم إلغاء الطلب'); render(); updateBadge(); openDrawer(id); } catch (e) { toast(errMsg(e), true); } };
  $('#dr-note-go').onclick = async () => { try { const r = await post({action: 'updateNote', id, note: $('#dr-note').value}); replaceOrder(r.order); toast('تم حفظ الملاحظة'); loadHistory(id); } catch (e) { toast(errMsg(e), true); } };
  $('#dr-edit').onsubmit = async ev => {
    ev.preventDefault(); const fd = Object.fromEntries(new FormData(ev.target)), ch = {};
    if (fd.name !== o.name) ch.name = fd.name; if (fd.phone !== localPhone(o.phone)) ch.phone = fd.phone; if (fd.city !== o.city) ch.city = fd.city;
    if (fd.address !== (o.address || '')) ch.address = fd.address; if (+fd.qty !== +o.qty) ch.qty = +fd.qty; if (fd.productId !== o.productId) ch.productId = fd.productId;
    if (!Object.keys(ch).length) return toast('لا توجد تغييرات');
    try { const r = await post({action: 'updateOrder', id, fields: ch}); replaceOrder(r.order); toast('تم حفظ التعديلات · المجموع ' + mad(r.order.total)); render(); openDrawer(id); } catch (e) { toast(errMsg(e), true); }
  };
  loadHistory(id);
}
async function loadHistory(id) {
  try {
    const r = await api('history', {id}); if (st.drawerId !== id) return;
    $('#dr-hist').innerHTML = r.history.length ? `<ul class="tline">${r.history.slice().reverse().map(h => `<li><b>${esc(FIELD_AR[h.field] || h.field)}</b>: ${h.from ? esc(h.from) + ' ← ' : ''}${esc(h.to)}<small>${esc(fmtDate(h.at))} · ${esc(BY_AR[h.by] || h.by)}</small></li>`).join('')}</ul>` : '<p style="color:#7d857f">لا يوجد سجل لهذا الطلب (الطلبات القديمة قبل تفعيل السجل).</p>';
  } catch (e) { const el = $('#dr-hist'); if (el) el.innerHTML = `<p style="color:#a3261f">تعذّر تحميل السجل. <button class="btn" id="h-retry">إعادة</button></p>`, $('#h-retry').onclick = () => loadHistory(id); }
}

// ---------- print / export ----------
function printSlips(list) {
  if (!list.length) return;
  $('#print').innerHTML = list.map(o => `<div class="slip"><div class="ph"><div class="lg">صحابي</div><div style="text-align:left"><h2 dir="ltr">${esc(o.id)}</h2><small>${esc(fmtDate(o.createdAt))}</small></div></div>
   <table><tr><th>الاسم</th><td>${esc(o.name)}</td></tr><tr><th>الهاتف</th><td dir="ltr" style="text-align:right">${esc(localPhone(o.phone))}</td></tr><tr><th>المدينة</th><td>${esc(o.city)}</td></tr><tr><th>العنوان</th><td>${esc(o.address || '')}</td></tr></table>
   <table><tr><th>المنتج</th><th>الكمية</th><th>سعر الوحدة</th><th>المجموع</th></tr><tr><td>${esc(o.product)}</td><td>${o.qty}</td><td>${mad(o.unitPrice)}</td><td>${mad(o.total)}</td></tr><tr><td colspan="3">التوصيل</td><td>${esc(o.delivery)}</td></tr></table>
   <div class="cod">المبلغ عند الاستلام: ${mad(o.total)}</div>${o.notes ? `<p style="font-size:11px">ملاحظات: ${esc(o.notes)}</p>` : ''}<div class="ft">شكراً لثقتكم بصحابي · الدفع عند الاستلام · جزاكم الله خيراً</div></div>`).join('');
  window.print();
}
function printList() {
  const L = filtered();
  $('#print').innerHTML = `<div class="plist"><h2 style="font-family:'Aref Ruqaa'">صحابي — قائمة الطلبات (${L.length})</h2><p style="font-size:10px">${new Date().toLocaleString('en-GB')}</p><table><tr>${['رقم الطلب', 'التاريخ', 'الاسم', 'الهاتف', 'المدينة', 'المنتج', 'الكمية', 'المجموع', 'الحالة'].map(h => `<th>${h}</th>`).join('')}</tr>${L.map(o => `<tr><td>${esc(o.id)}</td><td>${esc(fmtDate(o.createdAt))}</td><td>${esc(o.name)}</td><td dir="ltr">${esc(localPhone(o.phone))}</td><td>${esc(o.city)}</td><td>${esc(o.product)}</td><td>${o.qty}</td><td>${num(o.total)}</td><td>${esc(stLabel(o.statusKey))}</td></tr>`).join('')}</table></div>`;
  window.print();
}
const EXP_COLS = [['id', 'رقم الطلب'], ['createdAt', 'التاريخ'], ['name', 'الاسم'], ['phone', 'الهاتف'], ['city', 'المدينة'], ['address', 'العنوان'], ['product', 'المنتج'], ['productId', 'رمز المنتج'], ['qty', 'الكمية'], ['unitPrice', 'سعر الوحدة'], ['total', 'المجموع'], ['delivery', 'التوصيل'], ['status', 'الحالة'], ['notes', 'ملاحظات'], ['updatedAt', 'آخر تحديث']];
function exportFile(kind) {
  const L = filtered(); if (!L.length) return toast('لا توجد طلبات للتصدير', true);
  const val = (o, k) => k === 'status' ? stLabel(o.statusKey) : k === 'createdAt' || k === 'updatedAt' ? fmtDate(o[k]) : (o[k] ?? '');
  let blob, ext;
  if (kind === 'csv') {
    const cell = v => { v = String(v); if (/^[=+\-@]/.test(v)) v = "'" + v; return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const lines = [EXP_COLS.map(c => c[1]).join(',')].concat(L.map(o => EXP_COLS.map(c => cell(val(o, c[0]))).join(',')));
    blob = new Blob(['\ufeff' + lines.join('\r\n')], {type: 'text/csv;charset=utf-8'}); ext = 'csv';
  } else {
    const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body dir="rtl"><table border="1"><tr>${EXP_COLS.map(c => `<th style="background:#1f3a2e;color:#f1d08a">${c[1]}</th>`).join('')}</tr>${L.map(o => `<tr>${EXP_COLS.map(c => `<td style="mso-number-format:'\\@'">${esc(val(o, c[0]))}</td>`).join('')}</tr>`).join('')}</table></body></html>`;
    blob = new Blob(['\ufeff' + html], {type: 'application/vnd.ms-excel;charset=utf-8'}); ext = 'xls';
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `sahaby-orders-${today()}.${ext}`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(`تم تصدير ${L.length} طلب`);
}

// ---------- customers ----------
let custQ = '';
function vCustomers() {
  const m = {};
  st.orders.forEach(o => { const c = m[o.phone] = m[o.phone] || {phone: o.phone, name: o.name, city: o.city, n: 0, spent: 0, total: 0, last: '', lastId: ''}; c.n++; c.total += +o.total || 0; if (o.statusKey === 'delivered') c.spent += +o.total || 0; if (o.createdAt > c.last) { c.last = o.createdAt; c.lastId = o.id; c.name = o.name; c.city = o.city; } });
  const q = custQ.trim().toLowerCase();
  const L = Object.values(m).filter(c => !q || [c.name, c.phone, localPhone(c.phone), c.city].join('|').toLowerCase().includes(q)).sort((a, b) => b.n - a.n || (b.last > a.last ? 1 : -1));
  const repeat = Object.values(m).filter(c => c.n > 1).length;
  return `<div class="kpis"><div class="kpi"><small>عدد العملاء</small><b>${num(Object.keys(m).length)}</b></div><div class="kpi k-ship"><small>عملاء متكررون</small><b>${num(repeat)}</b></div><div class="kpi k-money"><small>متوسط قيمة الطلب</small><b>${mad(Math.round(st.orders.reduce((s, o) => s + (+o.total || 0), 0) / (st.orders.length || 1)))}</b></div></div>
  <div class="tools"><div class="f s"><label for="c-q">بحث عن عميل</label><input id="c-q" value="${esc(custQ)}" placeholder="الاسم، الهاتف، المدينة"></div></div>
  ${L.length ? `<div class="tbl-wrap"><table><thead><tr><th>العميل</th><th>الهاتف</th><th>المدينة</th><th>عدد الطلبات</th><th>مجموع الطلبات</th><th>المدفوع (تم التسليم)</th><th>آخر طلب</th><th></th></tr></thead><tbody>${L.map(c => `<tr data-ph="${esc(c.phone)}"><td><b>${esc(c.name)}</b>${c.n > 1 ? '<span class="rep">متكرر</span>' : ''}</td><td dir="ltr" style="text-align:right">${esc(localPhone(c.phone))}</td><td>${esc(c.city)}</td><td class="num">${c.n}</td><td>${mad(c.total)}</td><td class="num">${mad(c.spent)}</td><td>${esc(fmtDate(c.last))}</td><td><button class="btn c-orders">الطلبات</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><h3>لا يوجد عملاء</h3></div>'}`;
}
function bindCustomers() {
  const q = $('#c-q'); let t; q.oninput = () => { clearTimeout(t); t = setTimeout(() => { custQ = q.value; render(); const n = $('#c-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
  $$('tr[data-ph]').forEach(tr => tr.onclick = () => { Object.assign(st.f, {q: localPhone(tr.dataset.ph), status: '', product: '', city: '', from: '', to: '', page: 1}); location.hash = '#/orders'; });
}

// ---------- products ----------
function vProducts() {
  const P = (st.meta && st.meta.products) || {}, m = {};
  st.orders.forEach(o => { const x = m[o.productId] = m[o.productId] || {n: 0, qty: 0, rev: 0, del: 0, pipe: 0}; if (o.statusKey === 'cancelled') return; x.n++; x.qty += +o.qty || 0; if (o.statusKey === 'delivered') x.rev += +o.total || 0; if (o.statusKey === 'confirmed' || o.statusKey === 'shipping') x.pipe += +o.total || 0; });
  const rows = Object.entries(P).map(([id, p]) => Object.assign({id, name: p.name, price: p.price}, m[id] || {n: 0, qty: 0, rev: 0, pipe: 0})).sort((a, b) => b.n - a.n);
  return `<div class="tbl-wrap"><table><thead><tr><th>المنتج</th><th>الرمز</th><th>السعر</th><th>الطلبات</th><th>القطع</th><th>جارية (مؤكد + شحن)</th><th>الإيرادات (تم التسليم)</th></tr></thead><tbody>${rows.map(r => `<tr style="cursor:default"><td><b>${esc(r.name)}</b></td><td dir="ltr" style="text-align:right;color:#7d857f">${esc(r.id)}</td><td>${mad(r.price)}</td><td class="num">${r.n}</td><td>${r.qty}</td><td>${mad(r.pipe)}</td><td class="num">${mad(r.rev)}</td></tr>`).join('')}</tbody></table></div>
  <p class="note-s">الأسعار للعرض فقط. لتعديل سعر: غيّره في <b dir="ltr">PRODUCTS</b> داخل <b dir="ltr">backend/Code.gs</b> وفي صفحات الموقع، ثم أعد النشر (Deploy ← Manage deployments ← Edit ← New version). الطلبات الملغاة غير محسوبة.</p>`;
}

// ---------- settings ----------
function vSettings() {
  return `<div class="set-grid"><section class="panel"><h3>الاتصال بالخادم</h3><div class="pbody"><div><label for="s-url">رابط الـ API (Web app URL)</label><input id="s-url" dir="ltr" value="${esc(S.url)}"></div><div class="dr-acts"><button class="btn pri" id="s-url-go">حفظ واختبار</button><button class="btn" id="s-url-def">الرابط الافتراضي</button></div>
   <div><label for="s-tok">تغيير رمز الدخول</label><input id="s-tok" type="password" dir="ltr" placeholder="رمز جديد"></div><button class="btn" id="s-tok-go">تحقق واحفظ الرمز</button>
   <p class="note-s">الرمز محفوظ على هذا الجهاز فقط${localStorage.getItem(LS_TOK) ? ' (تذكرني مفعّل)' : ' (لهذه الجلسة فقط)'}. يوجد في Apps Script ← Project Settings ← Script properties ← ADMIN_TOKEN.</p></div></section>
  <section class="panel"><h3>التحديث والتنبيهات</h3><div class="pbody"><label class="chk"><input type="checkbox" id="s-auto" ${S.auto ? 'checked' : ''}> تحديث تلقائي</label><div><label for="s-int">الفاصل الزمني (ثانية)</label><input id="s-int" type="number" min="15" max="3600" value="${S.interval}"></div>
   <label class="chk"><input type="checkbox" id="s-sound" ${S.sound ? 'checked' : ''}> صوت عند وصول طلب جديد</label><div class="dr-acts"><button class="btn pri" id="s-ref-go">حفظ</button><button class="btn" id="s-beep">تجربة الصوت</button></div></div></section>
  <section class="panel" style="grid-column:1/-1"><h3>قوالب رسائل واتساب</h3><div class="pbody">${Object.keys(TPL_NAMES).map(k => `<div><label for="t-${k}">${TPL_NAMES[k]}</label><textarea id="t-${k}" rows="3">${esc(S.templates[k])}</textarea></div>`).join('')}
   <p class="note-s">المتغيرات: {name} {id} {product} {qty} {total} {city} {phone}</p><div class="dr-acts"><button class="btn pri" id="t-go">حفظ القوالب</button><button class="btn" id="t-def">استرجاع الافتراضي</button></div></div></section></div>`;
}
function bindSettings() {
  $('#s-url-go').onclick = async () => { const u = $('#s-url').value.trim(); try { await api('meta', {}, u); S.url = u; saveSettings(); st.meta = null; toast('تم حفظ الرابط والاتصال ناجح'); loadAll(true); } catch (e) { toast(errMsg(e), true); } };
  $('#s-url-def').onclick = () => { $('#s-url').value = DEFAULT_URL; };
  $('#s-tok-go').onclick = async () => { const t = $('#s-tok').value.trim(); if (!t) return; try { await api('meta', {}, S.url, t); TOKEN = t; (localStorage.getItem(LS_TOK) ? localStorage : sessionStorage).setItem(LS_TOK, t); $('#s-tok').value = ''; toast('تم تحديث الرمز'); } catch (e) { toast(errMsg(e), true); } };
  $('#s-ref-go').onclick = () => { S.auto = $('#s-auto').checked; S.interval = Math.max(15, +$('#s-int').value || 60); S.sound = $('#s-sound').checked; saveSettings(); setAuto(); toast('تم الحفظ'); };
  $('#s-beep').onclick = () => { const s = S.sound; S.sound = true; beep(); S.sound = s; };
  $('#t-go').onclick = () => { Object.keys(TPL_NAMES).forEach(k => S.templates[k] = $('#t-' + k).value); saveSettings(); toast('تم حفظ القوالب'); };
  $('#t-def').onclick = () => { S.templates = Object.assign({}, DEF_TPL); saveSettings(); render(); toast('تم استرجاع القوالب الافتراضية'); };
}

// expose for tests/debug (no secrets)
window.__sahabyAdmin = {st, S};
// ---------- boot ----------
$('#drawer').inert = true;
if (TOKEN) start(); else showLogin();
})();
