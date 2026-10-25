/**
 * Sahaby (صحابي) — COD orders backend for Google Sheets.
 * Paste into: Google Sheet > Extensions > Apps Script. Run setup() once, then deploy as Web app.
 * API documentation: see SETUP.md (section "Admin API").
 */

// ============ CONFIG ============
const CFG = {
  VERSION: '1.2.0',
  HISTORY: 'History',
  SHEET: 'Orders',
  DASH: 'Dashboard',
  CONFIG: 'Config',
  TZ: 'Africa/Casablanca',
  FONT: 'Cairo',            // Google Font available in Sheets; change to 'Arial' if you prefer
  KEY_ROW: 1,               // hidden row with stable English keys (used by the admin API)
  HEAD_ROW: 2,              // visible Arabic header
  FIRST_DATA_ROW: 3,
  FREE_OVER: 200,           // free delivery threshold (MAD), same as the website
  DUP_SECONDS: 120,         // duplicate guard: same phone + product within 2 minutes
  MAX_QTY: 99,
  BRAND_GREEN: '#1f3a2e', BRAND_GOLD: '#b8862b', BRAND_GOLD_LIGHT: '#f1d08a', BRAND_CREAM: '#f7f5f0'
};

// Server-side price list — the ONLY source of truth for prices (client prices are ignored).
const PRODUCTS = {
  'quran-big-blue':     { name: 'مصحف كبير - أزرق',          price: 200 },
  'quran-big-red':      { name: 'مصحف كبير - أحمر',          price: 200 },
  'quran-medium-black': { name: 'مصحف متوسط - أسود',         price: 150 },
  'pack-small':         { name: 'باقة صغيرة',                 price: 200 },
  'pack-large':         { name: 'باقة كبيرة',                 price: 500 },
  'tafsir-jalalayn':    { name: 'باقة الجلالين + مصحف أسود',  price: 200 },
  'tafsir-sabri':       { name: 'باقة صابري + مصحف أسود',     price: 200 },
  'tafsir-rahman':      { name: 'باقة الرحمن + مصحف أسود',    price: 250 }
};

// Promo codes, checked on the server (the site's copy is only for display).
// pct: percent off the order subtotal. firstOrder: only for a phone with no earlier non-cancelled order.
// active: false stops new orders from using the code; orders that already have it keep their discount when edited.
const PROMOS = {
  'SAHABY30': { pct: 30, firstOrder: true, active: true }
};

// [stable key, Arabic header, width, number format]
const COLS = [
  ['id',        'رقم الطلب',  160, '@'],
  ['createdAt', 'التاريخ',    140, 'yyyy-mm-dd HH:mm'],
  ['name',      'الاسم',      170, '@'],
  ['phone',     'الهاتف',     140, '@'],
  ['city',      'المدينة',    120, '@'],
  ['product',   'المنتج',     220, '@'],
  ['productId', 'رمز المنتج', 150, '@'],
  ['qty',       'الكمية',      70, '0'],
  ['unitPrice', 'سعر الوحدة',  95, '#,##0 "درهم"'],
  ['total',     'المجموع',    105, '#,##0 "درهم"'],
  ['delivery',  'التوصيل',    130, '@'],
  ['status',    'الحالة',     115, '@'],
  ['notes',     'ملاحظات',    230, '@'],
  ['source',    'المصدر',     230, '@'],
  ['updatedAt', 'آخر تحديث',  140, 'yyyy-mm-dd HH:mm'],
  ['address',   'العنوان',    220, '@'],  // added in v1.1 (auto-migrated)
  ['promo',     'كود الخصم',  110, '@'],  // added in v1.2 (auto-migrated)
  ['discount',  'الخصم',       95, '#,##0 "درهم"']  // v1.2; "total" is the amount to collect, after this discount
];
const C = {}; COLS.forEach(function (c, i) { C[c[0]] = i + 1; });
const NCOLS = COLS.length;

// status key -> [Arabic label, background, text color]
const STATUS = {
  new:       ['جديد',       '#e3edfb', '#1a4f9c'],
  confirmed: ['مؤكد',       '#e2f2e6', '#1f6b3a'],
  shipping:  ['قيد الشحن',  '#fdf1d8', '#8a6420'],
  delivered: ['تم التسليم', '#1f3a2e', '#f1d08a'],
  cancelled: ['ملغى',       '#f8e1e0', '#a3261f'],
  no_answer: ['لا يجيب',    '#ececec', '#555555']
};
const STATUS_AR = {}; Object.keys(STATUS).forEach(function (k) { STATUS_AR[STATUS[k][0]] = k; });

// ============ SETUP (run once from the editor) ============
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(CFG.TZ);
  ss.setSpreadsheetLocale('en_US'); // Western digits, '.' decimals
  buildOrdersSheet_(ss);
  buildConfigSheet_(ss);
  buildDashboard_(ss);
  const def = ss.getSheetByName('Sheet1') || ss.getSheetByName('Feuille 1') || ss.getSheetByName('ورقة1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
  ss.setActiveSheet(ss.getSheetByName(CFG.SHEET));
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('ADMIN_TOKEN')) p.setProperty('ADMIN_TOKEN', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  if (!p.getProperty('NOTIFY_ENABLED')) p.setProperty('NOTIFY_ENABLED', 'false');
  Logger.log('Setup done. ADMIN_TOKEN is in Project Settings > Script properties.');
}

function buildOrdersSheet_(ss) {
  const sh = ss.getSheetByName(CFG.SHEET) || ss.insertSheet(CFG.SHEET, 0);
  sh.setRightToLeft(true);
  const maxC = sh.getMaxColumns();
  if (maxC < NCOLS) sh.insertColumnsAfter(maxC, NCOLS - maxC);
  else if (maxC > NCOLS) sh.deleteColumns(NCOLS + 1, maxC - NCOLS);
  if (sh.getMaxRows() < 1000) sh.insertRowsAfter(sh.getMaxRows(), 1000 - sh.getMaxRows());
  const rows = sh.getMaxRows();

  sh.getRange(CFG.KEY_ROW, 1, 1, NCOLS).setValues([COLS.map(function (c) { return c[0]; })])
    .setFontColor('#999999').setFontSize(8);
  sh.getRange(CFG.HEAD_ROW, 1, 1, NCOLS).setValues([COLS.map(function (c) { return c[1]; })]);
  sh.hideRows(CFG.KEY_ROW);
  sh.setFrozenRows(CFG.HEAD_ROW);
  sh.setFrozenColumns(1);

  sh.getRange(1, 1, rows, NCOLS).setFontFamily(CFG.FONT).setFontSize(11)
    .setVerticalAlignment('middle').setHorizontalAlignment('right');
  sh.getRange(CFG.HEAD_ROW, 1, 1, NCOLS)
    .setBackground(CFG.BRAND_GREEN).setFontColor(CFG.BRAND_GOLD_LIGHT).setFontWeight('bold').setFontSize(12)
    .setHorizontalAlignment('center')
    .setBorder(null, null, true, null, null, null, CFG.BRAND_GOLD, SpreadsheetApp.BorderStyle.SOLID_THICK);
  sh.setRowHeight(CFG.HEAD_ROW, 42);

  const dataRows = rows - CFG.FIRST_DATA_ROW + 1;
  COLS.forEach(function (c, i) {
    sh.setColumnWidth(i + 1, c[2]);
    sh.getRange(CFG.FIRST_DATA_ROW, i + 1, dataRows, 1).setNumberFormat(c[3]);
  });
  ['id', 'createdAt', 'phone', 'qty', 'unitPrice', 'total', 'delivery', 'status', 'updatedAt', 'promo', 'discount'].forEach(function (k) {
    sh.getRange(CFG.FIRST_DATA_ROW, C[k], dataRows, 1).setHorizontalAlignment('center');
  });
  sh.getRange(CFG.FIRST_DATA_ROW, C.id, dataRows, 1).setFontWeight('bold').setFontColor(CFG.BRAND_GREEN);
  sh.getRange(CFG.FIRST_DATA_ROW, C.total, dataRows, 1).setFontWeight('bold');
  sh.getRange(CFG.FIRST_DATA_ROW, C.notes, dataRows, 1).setWrap(true);

  // banding
  sh.getBandings().forEach(function (b) { b.remove(); });
  sh.getRange(CFG.HEAD_ROW, 1, rows - 1, NCOLS)
    .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false)
    .setHeaderRowColor(CFG.BRAND_GREEN).setFirstRowColor('#ffffff').setSecondRowColor(CFG.BRAND_CREAM);

  // status dropdown + colors
  const stRange = sh.getRange(CFG.FIRST_DATA_ROW, C.status, dataRows, 1);
  stRange.setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(Object.keys(STATUS).map(function (k) { return STATUS[k][0]; }), true)
    .setAllowInvalid(false).setHelpText('اختر حالة الطلب').build());
  const rules = Object.keys(STATUS).map(function (k) {
    return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(STATUS[k][0])
      .setBackground(STATUS[k][1]).setFontColor(STATUS[k][2]).setBold(true).setRanges([stRange]).build();
  });
  sh.setConditionalFormatRules(rules);

  sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) { if (p.getDescription() === 'headers') p.remove(); });
  sh.getRange(CFG.KEY_ROW, 1, 2, NCOLS).protect().setDescription('headers').setWarningOnly(true);
  sh.setTabColor(CFG.BRAND_GREEN);
  return sh;
}

function buildConfigSheet_(ss) {
  const sh = ss.getSheetByName(CFG.CONFIG) || ss.insertSheet(CFG.CONFIG);
  sh.clear(); sh.setRightToLeft(false);
  const rows = [['section', 'key', 'label_ar', 'column', 'extra']];
  COLS.forEach(function (c, i) { rows.push(['column', c[0], c[1], columnLetter_(i + 1), c[3]]); });
  Object.keys(STATUS).forEach(function (k) { rows.push(['status', k, STATUS[k][0], '', STATUS[k][1]]); });
  Object.keys(PRODUCTS).forEach(function (k) { rows.push(['product', k, PRODUCTS[k].name, '', PRODUCTS[k].price]); });
  Object.keys(PROMOS).forEach(function (k) { rows.push(['promo', k, PROMOS[k].pct + '%', PROMOS[k].firstOrder ? 'first order' : '', PROMOS[k].active ? 'active' : 'inactive']); });
  rows.push(['meta', 'version', CFG.VERSION, '', '']);
  sh.getRange(1, 1, rows.length, 5).setValues(rows).setFontFamily(CFG.FONT);
  sh.getRange(1, 1, 1, 5).setBackground(CFG.BRAND_GREEN).setFontColor(CFG.BRAND_GOLD_LIGHT).setFontWeight('bold');
  sh.setFrozenRows(1); sh.autoResizeColumns(1, 5);
  sh.setTabColor('#999999');
  sh.hideSheet();
}

function buildDashboard_(ss) {
  const sh = ss.getSheetByName(CFG.DASH) || ss.insertSheet(CFG.DASH, 1);
  sh.clear(); sh.setRightToLeft(true); sh.setHiddenGridlines(true);
  sh.getRange('A1:H60').setFontFamily(CFG.FONT).setVerticalAlignment('middle');
  const O = CFG.SHEET, r0 = CFG.FIRST_DATA_ROW;
  const col = function (k) { return O + '!' + columnLetter_(C[k]) + r0 + ':' + columnLetter_(C[k]); };
  const ar = function (k) { return STATUS[k][0]; };

  sh.getRange('A1:H1').merge().setValue('لوحة متابعة الطلبات — صحابي')
    .setBackground(CFG.BRAND_GREEN).setFontColor(CFG.BRAND_GOLD_LIGHT).setFontSize(18).setFontWeight('bold').setHorizontalAlignment('center');
  sh.setRowHeight(1, 52);

  const kpis = [
    ['إجمالي الطلبات', '=COUNTA(' + col('id') + ')', '0'],
    ['طلبات اليوم', '=COUNTIFS(' + col('createdAt') + ',">="&TODAY(),' + col('createdAt') + ',"<"&TODAY()+1)', '0'],
    ['الإيرادات (تم التسليم)', '=SUMIF(' + col('status') + ',"' + ar('delivered') + '",' + col('total') + ')', '#,##0 "درهم"'],
    ['قيد التنفيذ (مؤكد + شحن)', '=SUMIF(' + col('status') + ',"' + ar('confirmed') + '",' + col('total') + ')+SUMIF(' + col('status') + ',"' + ar('shipping') + '",' + col('total') + ')', '#,##0 "درهم"']
  ];
  kpis.forEach(function (k, i) {
    const c = 1 + i * 2;
    sh.getRange(3, c, 1, 2).merge().setValue(k[0]).setBackground(CFG.BRAND_CREAM).setFontColor('#777777').setHorizontalAlignment('center');
    sh.getRange(4, c, 1, 2).merge().setFormula(k[1]).setNumberFormat(k[2]).setFontSize(22).setFontWeight('bold')
      .setFontColor(CFG.BRAND_GREEN).setHorizontalAlignment('center')
      .setBorder(null, null, true, null, null, null, CFG.BRAND_GOLD, SpreadsheetApp.BorderStyle.SOLID_THICK);
  });
  sh.setRowHeight(4, 48);

  const head = function (a1, t) { sh.getRange(a1).merge().setValue(t).setBackground(CFG.BRAND_GREEN).setFontColor(CFG.BRAND_GOLD_LIGHT).setFontWeight('bold').setHorizontalAlignment('center'); };
  head('A6:B6', 'الطلبات حسب الحالة');
  Object.keys(STATUS).forEach(function (k, i) {
    sh.getRange(7 + i, 1).setValue(STATUS[k][0]).setBackground(STATUS[k][1]).setFontColor(STATUS[k][2]).setFontWeight('bold');
    sh.getRange(7 + i, 2).setFormula('=COUNTIF(' + col('status') + ',"' + STATUS[k][0] + '")').setNumberFormat('0').setHorizontalAlignment('center');
  });

  head('D6:F6', 'أكثر المنتجات طلباً');
  sh.getRange('D7:F7').setValues([['المنتج', 'الطلبات', 'المبيعات']]).setFontWeight('bold').setBackground(CFG.BRAND_CREAM);
  const rng = O + '!A' + r0 + ':' + columnLetter_(NCOLS);
  const L = function (k) { return columnLetter_(C[k]); };
  sh.getRange('D8').setFormula('=IFERROR(QUERY(' + rng + ',"select ' + L('product') + ', count(' + L('id') + '), sum(' + L('total') + ') where ' + L('id') + ' is not null and ' + L('status') + ' <> \'' + ar('cancelled') + '\' group by ' + L('product') + ' order by count(' + L('id') + ') desc limit 5 label count(' + L('id') + ') \'\', sum(' + L('total') + ') \'\'",0),"—")');
  sh.getRange('F8:F12').setNumberFormat('#,##0 "درهم"');

  head('H6:I6', 'أكثر المدن');
  sh.getRange('H7:I7').setValues([['المدينة', 'الطلبات']]).setFontWeight('bold').setBackground(CFG.BRAND_CREAM);
  sh.getRange('H8').setFormula('=IFERROR(QUERY(' + rng + ',"select ' + L('city') + ', count(' + L('id') + ') where ' + L('id') + ' is not null group by ' + L('city') + ' order by count(' + L('id') + ') desc limit 5 label count(' + L('id') + ') \'\'",0),"—")');

  [1, 2, 4, 5, 6, 8, 9].forEach(function (c) { sh.setColumnWidth(c, c === 4 ? 220 : 120); });
  sh.setColumnWidth(3, 24); sh.setColumnWidth(7, 24);
  sh.setTabColor(CFG.BRAND_GOLD);
}

// ============ PUBLIC ENDPOINTS ============
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!p.action) return json_({ ok: true, service: 'sahaby-orders', version: CFG.VERSION });
  if (!authed_(p.token)) return json_({ ok: false, error: 'unauthorized' });
  try {
    if (p.action === 'list') return json_(listOrders_(p));
    if (p.action === 'get') {
      const o = readAll_().filter(function (x) { return x.id === p.id; })[0];
      return json_(o ? { ok: true, order: o, history: history_(o.id) } : { ok: false, error: 'not_found' });
    }
    if (p.action === 'stats') return json_(stats_(p));
    if (p.action === 'history') return json_({ ok: true, history: history_(p.id) });
    if (p.action === 'meta') return json_({ ok: true, version: CFG.VERSION, columns: COLS.map(function (c) { return { key: c[0], label: c[1] }; }), statuses: Object.keys(STATUS).map(function (k) { return { key: k, label: STATUS[k][0] }; }), products: PRODUCTS });
    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) { return json_({ ok: false, error: 'server_error', message: String(err) }); }
}

function doPost(e) {
  let b;
  try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (_) { return json_({ ok: false, error: 'bad_json' }); }
  try {
    if (b.action) return json_(adminPost_(b));
    return json_(createOrder_(b));
  } catch (err) { return json_({ ok: false, error: 'server_error', message: String(err) }); }
}

// ============ ORDER CREATION ============
function createOrder_(b) {
  if (b.website) return { ok: true, orderId: 'SH-0' };        // honeypot filled => bot; pretend success
  const name = clean_(b.name, 80), city = clean_(b.city, 60), phone = normPhone_(b.phone);
  const prod = PRODUCTS[String(b.productId || '')];
  const qty = Math.floor(Number(b.qty));
  const errors = [];
  if (name.length < 3) errors.push('name');
  if (!phone) errors.push('phone');
  if (city.length < 2) errors.push('city');
  if (!prod) errors.push('productId');
  if (!(qty >= 1 && qty <= CFG.MAX_QTY)) errors.push('qty');
  if (errors.length) return { ok: false, error: 'validation', fields: errors };
  const promo = normPromo_(b.promo);
  if (promo && !(PROMOS[promo] && PROMOS[promo].active)) return { ok: false, error: 'promo', reason: 'invalid' };

  const cache = CacheService.getScriptCache();
  const dupKey = 'dup_' + phone + '_' + b.productId;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let order;
  try {
    const prev = cache.get(dupKey);                    // checked first, so a retried submit is not refused as "used"
    if (prev) return { ok: true, duplicate: true, orderId: prev };
    const sh = sheet_();
    if (promo && PROMOS[promo].firstOrder && hasOrders_(sh, phone)) return { ok: false, error: 'promo', reason: 'used' };
    const now = new Date();
    const subtotal = prod.price * qty;
    const discount = promoDiscount_(promo, subtotal);
    order = {
      id: nextId_(now), createdAt: now, name: name, phone: phone, city: city,
      product: prod.name, productId: String(b.productId), qty: qty, unitPrice: prod.price, total: subtotal - discount,
      delivery: deliveryLabel_(subtotal),
      status: STATUS.new[0], notes: clean_(b.notes, 500), source: clean_(b.source, 300), updatedAt: now,
      address: clean_(b.address, 200), promo: discount ? promo : '', discount: discount || ''
    };
    const r = Math.max(sh.getLastRow() + 1, CFG.FIRST_DATA_ROW);
    sh.getRange(r, 1, 1, NCOLS).setValues([COLS.map(function (c) { return order[c[0]]; })]);
    cache.put(dupKey, order.id, CFG.DUP_SECONDS);
    logHistory_([[order.id, now, 'status', '', order.status, 'website']]);
  } finally { lock.releaseLock(); }
  notify_(order);
  return { ok: true, orderId: order.id, subtotal: order.unitPrice * order.qty, discount: Number(order.discount) || 0, promo: order.promo, total: order.total, delivery: order.delivery };
}

function normPromo_(v) { return String(v || '').replace(/\s/g, '').toUpperCase().slice(0, 30); }
/** Discount in MAD for a known code (active or not), else 0. */
function promoDiscount_(code, subtotal) {
  const p = PROMOS[code];
  return p ? Math.round(subtotal * p.pct / 100) : 0;
}
// Free delivery is decided on the price before any promo, so a discount never adds a delivery fee.
function deliveryLabel_(subtotal) { return subtotal >= CFG.FREE_OVER ? 'مجاني' : 'يُحدد عند التأكيد'; }
/** True when this phone already has an order that was not cancelled. */
function hasOrders_(sh, phone) {
  const last = sh.getLastRow();
  if (last < CFG.FIRST_DATA_ROW) return false;
  const n = last - CFG.FIRST_DATA_ROW + 1;
  const phones = sh.getRange(CFG.FIRST_DATA_ROW, C.phone, n, 1).getValues();
  const sts = sh.getRange(CFG.FIRST_DATA_ROW, C.status, n, 1).getValues();
  for (let i = 0; i < n; i++) if (phones[i][0] === phone && sts[i][0] !== STATUS.cancelled[0]) return true;
  return false;
}

function nextId_(d) {
  const day = Utilities.formatDate(d, CFG.TZ, 'yyyyMMdd');
  const props = PropertiesService.getScriptProperties();
  const n = Number(props.getProperty('seq_' + day) || 0) + 1;
  props.setProperty('seq_' + day, String(n));
  return 'SH-' + day + '-' + ('000' + n).slice(-4);
}

function notify_(o) {
  try {
    const p = PropertiesService.getScriptProperties();
    const to = p.getProperty('NOTIFY_EMAIL');
    if (p.getProperty('NOTIFY_ENABLED') !== 'true' || !to) return;
    MailApp.sendEmail({
      to: to,
      subject: 'طلب جديد ' + o.id + ' — ' + o.product,
      htmlBody: '<div dir="rtl" style="font-family:Arial">' +
        '<h2 style="color:#1f3a2e">طلب جديد: ' + o.id + '</h2>' +
        '<p><b>الاسم:</b> ' + esc_(o.name) + '<br><b>الهاتف:</b> ' + o.phone + '<br><b>المدينة:</b> ' + esc_(o.city) +
        '<br><b>المنتج:</b> ' + o.product + ' × ' + o.qty +
        (o.discount ? '<br><b>الخصم:</b> ' + o.discount + ' درهم (' + o.promo + ')' : '') +
        '<br><b>المجموع:</b> ' + o.total + ' درهم (' + o.delivery + ')</p></div>'
    });
  } catch (err) { console.error('notify failed', err); }
}

// ============ ADMIN API ============
function adminPost_(b) {
  if (!authed_(b.token)) return { ok: false, error: 'unauthorized' };
  const by = clean_(b.by || 'admin', 40);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = sheet_();
    const now = new Date();
    if (b.action === 'bulkStatus') {
      const ar = statusLabel_(b.status);
      if (!ar) return { ok: false, error: 'invalid_status' };
      const ids = Array.isArray(b.ids) ? b.ids.slice(0, 500) : [];
      const done = [], missing = [], log = [];
      ids.forEach(function (id) {
        const row = findRow_(sh, id);
        if (!row) { missing.push(id); return; }
        const prev = sh.getRange(row, C.status).getValue();
        if (prev !== ar) {
          sh.getRange(row, C.status).setValue(ar);
          sh.getRange(row, C.updatedAt).setValue(now);
          log.push([id, now, 'status', prev, ar, by]);
        }
        done.push(id);
      });
      logHistory_(log);
      return { ok: true, updated: done.length, ids: done, missing: missing };
    }
    const row = findRow_(sh, b.id);
    if (!row) return { ok: false, error: 'not_found' };
    const get = function (k) { return sh.getRange(row, C[k]).getValue(); };
    const set = function (k, v) { sh.getRange(row, C[k]).setValue(v); };
    const log = [];
    if (b.action === 'updateStatus') {
      const ar = statusLabel_(b.status);
      if (!ar) return { ok: false, error: 'invalid_status' };
      log.push([b.id, now, 'status', get('status'), ar, by]); set('status', ar);
    } else if (b.action === 'updateNote') {
      const n = clean_(b.note, 500); log.push([b.id, now, 'notes', get('notes'), n, by]); set('notes', n);
    } else if (b.action === 'updateOrder') {
      const f = b.fields || {}, errors = [];
      const ch = {};
      if (f.name != null) { ch.name = clean_(f.name, 80); if (ch.name.length < 3) errors.push('name'); }
      if (f.phone != null) { ch.phone = normPhone_(f.phone); if (!ch.phone) errors.push('phone'); }
      if (f.city != null) { ch.city = clean_(f.city, 60); if (ch.city.length < 2) errors.push('city'); }
      if (f.address != null) ch.address = clean_(f.address, 200);
      const pid = f.productId != null ? String(f.productId) : String(get('productId'));
      const prod = PRODUCTS[pid];
      if (!prod) errors.push('productId');
      const qty = f.qty != null ? Math.floor(Number(f.qty)) : Number(get('qty'));
      if (!(qty >= 1 && qty <= CFG.MAX_QTY)) errors.push('qty');
      if (errors.length) return { ok: false, error: 'validation', fields: errors };
      if (f.productId != null || f.qty != null) {        // server-side recompute, keeping the order's promo code
        const sub = prod.price * qty, disc = promoDiscount_(String(get('promo') || ''), sub);
        ch.productId = pid; ch.product = prod.name; ch.qty = qty; ch.unitPrice = prod.price;
        ch.discount = disc || ''; ch.total = sub - disc; ch.delivery = deliveryLabel_(sub);
      }
      Object.keys(ch).forEach(function (k) {
        const prev = get(k);
        if (String(prev) !== String(ch[k])) { log.push([b.id, now, k, prev, ch[k], by]); set(k, ch[k]); }
      });
    } else if (b.action === 'delete') {          // soft delete
      log.push([b.id, now, 'status', get('status'), STATUS.cancelled[0], by]);
      set('status', STATUS.cancelled[0]);
      const n = String(get('notes') || '');
      set('notes', (n ? n + ' | ' : '') + '[محذوف ' + Utilities.formatDate(now, CFG.TZ, 'yyyy-MM-dd HH:mm') + ']');
    } else return { ok: false, error: 'unknown_action' };
    set('updatedAt', now);
    logHistory_(log);
    return { ok: true, order: rowToObj_(sh.getRange(row, 1, 1, NCOLS).getValues()[0], row) };
  } finally { lock.releaseLock(); }
}

function statusLabel_(s) { return STATUS[s] ? STATUS[s][0] : (STATUS_AR[s] ? s : null); }

// ---- History (sheet created on demand) ----
function historySheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let h = ss.getSheetByName(CFG.HISTORY);
  if (!h) {
    h = ss.insertSheet(CFG.HISTORY);
    h.setRightToLeft(true);
    h.getRange(1, 1, 1, 6).setValues([['رقم الطلب', 'الوقت', 'الحقل', 'من', 'إلى', 'بواسطة']])
      .setBackground(CFG.BRAND_GREEN).setFontColor(CFG.BRAND_GOLD_LIGHT).setFontWeight('bold');
    h.setFrozenRows(1);
    h.getRange('B:B').setNumberFormat('yyyy-mm-dd HH:mm');
    h.getRange('A:A').setNumberFormat('@'); h.getRange('D:E').setNumberFormat('@');
    h.setTabColor('#999999');
  }
  return h;
}
function logHistory_(rows) {
  if (!rows || !rows.length) return;
  try {
    const h = historySheet_();
    h.getRange(h.getLastRow() + 1, 1, rows.length, 6).setValues(rows.map(function (r) {
      return [r[0], r[1], r[2], r[3] instanceof Date ? Utilities.formatDate(r[3], CFG.TZ, 'yyyy-MM-dd HH:mm') : String(r[3] == null ? '' : r[3]), String(r[4] == null ? '' : r[4]), r[5]];
    }));
  } catch (err) { console.error('history log failed', err); }
}
function history_(id) {
  const h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CFG.HISTORY);
  if (!h || !id || h.getLastRow() < 2) return [];
  return h.getRange(2, 1, h.getLastRow() - 1, 6).getValues()
    .filter(function (r) { return r[0] === id; })
    .map(function (r) { return { at: r[1] instanceof Date ? Utilities.formatDate(r[1], CFG.TZ, "yyyy-MM-dd'T'HH:mm:ss") : String(r[1]), field: r[2], from: r[3], to: r[4], by: r[5] }; });
}

function listOrders_(p) {
  let items = readAll_();
  if (p.status) { const ar = STATUS[p.status] ? STATUS[p.status][0] : p.status; items = items.filter(function (o) { return o.status === ar; }); }
  if (p.productId) items = items.filter(function (o) { return o.productId === p.productId; });
  if (p.city) items = items.filter(function (o) { return String(o.city) === String(p.city); });
  if (p.from) items = items.filter(function (o) { return o.createdAt.slice(0, 10) >= p.from; });
  if (p.to) items = items.filter(function (o) { return o.createdAt.slice(0, 10) <= p.to; });
  if (p.search) {
    const q = String(p.search).toLowerCase().replace(/\s/g, '');
    items = items.filter(function (o) { return [o.id, o.name, o.phone, o.city, o.product].join('|').toLowerCase().replace(/\s/g, '').indexOf(q) > -1; });
  }
  items.sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
  const size = Math.min(Math.max(parseInt(p.pageSize, 10) || 50, 1), 500);
  const page = Math.max(parseInt(p.page, 10) || 1, 1);
  return { ok: true, total: items.length, page: page, pageSize: size, pages: Math.ceil(items.length / size), items: items.slice((page - 1) * size, page * size) };
}

function stats_(p) {
  p = p || {};
  const all = readAll_();
  const days = Math.min(Math.max(parseInt(p.days, 10) || 0, 0), 366);
  const today = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd');
  const byStatus = {}; Object.keys(STATUS).forEach(function (k) { byStatus[k] = 0; });
  const prods = {}, cities = {};
  let revenue = 0, pipeline = 0, todayCount = 0;
  all.forEach(function (o) {
    byStatus[o.statusKey] = (byStatus[o.statusKey] || 0) + 1;
    if (o.statusKey === 'delivered') revenue += Number(o.total) || 0;
    if (o.statusKey === 'confirmed' || o.statusKey === 'shipping') pipeline += Number(o.total) || 0;
    if (o.createdAt.slice(0, 10) === today) todayCount++;
    if (o.statusKey !== 'cancelled') { prods[o.productId] = prods[o.productId] || { productId: o.productId, product: o.product, orders: 0, total: 0 }; prods[o.productId].orders++; prods[o.productId].total += Number(o.total) || 0; }
    cities[o.city] = (cities[o.city] || 0) + 1;
  });
  const top = function (obj, n) { return Object.keys(obj).map(function (k) { return obj[k]; }).sort(function (a, b) { return b.orders - a.orders; }).slice(0, n); };
  let series;
  if (days) {
    const idx = {}; series = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = Utilities.formatDate(new Date(Date.now() - i * 864e5), CFG.TZ, 'yyyy-MM-dd');
      idx[d] = series.length; series.push({ date: d, orders: 0, revenue: 0, delivered: 0 });
    }
    all.forEach(function (o) {
      const i = idx[o.createdAt.slice(0, 10)];
      if (i == null) return;
      series[i].orders++;
      if (o.statusKey !== 'cancelled') series[i].revenue += Number(o.total) || 0;
      if (o.statusKey === 'delivered') series[i].delivered += Number(o.total) || 0;
    });
  }
  return {
    ok: true, series: series, totalOrders: all.length, today: todayCount, byStatus: byStatus, revenueDelivered: revenue, pipeline: pipeline,
    topProducts: top(prods, 5),
    topCities: top(Object.keys(cities).reduce(function (m, c) { m[c] = { city: c, orders: cities[c] }; return m; }, {}), 5)
  };
}

// Keep "آخر تحديث" fresh when someone edits the sheet by hand (simple trigger).
function onEdit(e) {
  try {
    const sh = e.range.getSheet();
    if (sh.getName() !== CFG.SHEET || e.range.getRow() < CFG.FIRST_DATA_ROW || e.range.getColumn() === C.updatedAt) return;
    sh.getRange(e.range.getRow(), C.updatedAt, e.range.getNumRows(), 1).setValue(new Date());
    if (e.range.getColumn() === C.status && e.range.getNumRows() === 1) {
      const id = sh.getRange(e.range.getRow(), C.id).getValue();
      if (id) logHistory_([[id, new Date(), 'status', e.oldValue || '', e.value || '', 'sheet']]);
    }
  } catch (_) {}
}

// ============ HELPERS ============
function sheet_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CFG.SHEET);
  if (!sh) throw new Error('Orders sheet missing — run setup() first');
  ensureSchema_(sh);
  return sh;
}
/** Idempotent migration: adds any new columns (e.g. "address") to an existing Orders sheet. */
function ensureSchema_(sh) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SCHEMA_VERSION') === CFG.VERSION) return;
  const have = Math.max(sh.getLastColumn(), 1);
  const keys = sh.getRange(CFG.KEY_ROW, 1, 1, have).getValues()[0];
  COLS.forEach(function (c, i) {
    if (keys[i] === c[0]) return;
    if (sh.getMaxColumns() < i + 1) sh.insertColumnsAfter(sh.getMaxColumns(), i + 1 - sh.getMaxColumns());
    sh.getRange(CFG.KEY_ROW, i + 1).setValue(c[0]);
    sh.getRange(CFG.HEAD_ROW, i + 1).setValue(c[1]).setBackground(CFG.BRAND_GREEN).setFontColor(CFG.BRAND_GOLD_LIGHT)
      .setFontWeight('bold').setHorizontalAlignment('center').setFontFamily(CFG.FONT);
    sh.setColumnWidth(i + 1, c[2]);
    sh.getRange(CFG.FIRST_DATA_ROW, i + 1, Math.max(sh.getMaxRows() - CFG.FIRST_DATA_ROW + 1, 1), 1).setNumberFormat(c[3]);
  });
  props.setProperty('SCHEMA_VERSION', CFG.VERSION);
}

function readAll_() {
  const sh = sheet_(), last = sh.getLastRow();
  if (last < CFG.FIRST_DATA_ROW) return [];
  return sh.getRange(CFG.FIRST_DATA_ROW, 1, last - CFG.FIRST_DATA_ROW + 1, NCOLS).getValues()
    .map(function (r, i) { return rowToObj_(r, CFG.FIRST_DATA_ROW + i); })
    .filter(function (o) { return o.id; });
}
function rowToObj_(r, row) {
  const o = { _row: row };
  COLS.forEach(function (c, i) { o[c[0]] = r[i] instanceof Date ? Utilities.formatDate(r[i], CFG.TZ, "yyyy-MM-dd'T'HH:mm:ss") : r[i]; });
  o.createdAt = String(o.createdAt || '');
  o.statusKey = STATUS_AR[o.status] || 'new';
  return o;
}
function findRow_(sh, id) {
  if (!id) return 0;
  const last = sh.getLastRow();
  if (last < CFG.FIRST_DATA_ROW) return 0;
  const ids = sh.getRange(CFG.FIRST_DATA_ROW, C.id, last - CFG.FIRST_DATA_ROW + 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (ids[i][0] === id) return CFG.FIRST_DATA_ROW + i;
  return 0;
}
function authed_(t) {
  const k = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  return !!k && k.length >= 8 && t === k;
}
/** Moroccan mobile -> +212XXXXXXXXX, or '' if invalid. */
function normPhone_(v) {
  const s = String(v || '').replace(/[\s.\-()]/g, '');
  const m = s.match(/^(?:0|\+212|00212|212)([567]\d{8})$/);
  return m ? '+212' + m[1] : '';
}
/** Trim, cap length, and neutralise spreadsheet formula injection. */
function clean_(v, max) {
  let s = String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}
function esc_(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function columnLetter_(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// Manual test from the editor: creates one sample order.
function testOrder() {
  Logger.log(JSON.stringify(createOrder_({ name: 'تجربة النظام', phone: '0612345678', city: 'الرباط', productId: 'quran-big-blue', qty: 1, source: 'editor-test' })));
}
