/**
 * 業務主管專區｜社宅管報。
 * 登入公司系統只用 secret 名稱 SKYFUN_USERNAME / SKYFUN_PASSWORD，不在程式裡寫值。
 * 不修改 skyfun-arrears-rpa。登入與 Cookie 寫法參考該 Worker 的 loginSkyfunHttp。
 */

var SKYFUN_ORIGIN = 'https://skyfunsystem.com';
var LOGIN_URL = SKYFUN_ORIGIN + '/Home/Login';
var CONTRAT_SEARCH_URL = SKYFUN_ORIGIN + '/Contrat/SearchContracts';
var RENEW_SEARCH_URL = SKYFUN_ORIGIN + '/Renewal/SearchRenewals';
var ARREARS_SEARCH_URL = SKYFUN_ORIGIN + '/ArrearsManagement/Search';
var SKYFUN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

var DEFAULT_SUPABASE_URL = 'https://xpbownhiedurytlyqszu.supabase.co';
var DEFAULT_SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhwYm93bmhpZWR1cnl0bHlxc3p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyNzM1NTYsImV4cCI6MjEwMTg0OTU1Nn0.UsrQ042IYFNwPn31LfkpYGAZP6Gg4blf2O0JSMUvk5Q';

var FULL_ACCESS = { '簡為倢': true, '邱奕棋': true, '黃怡婷': true };
var BIZ_TITLES = { '儲備處經理': true, '儲備營業處經理': true, '營業處經理': true, '營業區協理': true, '區協理': true };

var PAGES_PER_TICK = 5;
var CONTRACT_PAGE_SIZE = 1000;
var PART_SIZE = 5000;
var LOCK_TTL = 600;
/** 儀表板只要近年起租案件（含去年同期＋明年已審案件），不必掃全部歷史。 */
var DEFAULT_CONTRACT_LEASE_YEARS = 3;

/** 匯入 Excel／CSV 的表頭對應。實際匯出欄名不同時只改這一張。loader.js 有同一份。 */
var MATCH_EXTRA_COLUMNS = {
  id: ['id', '合約編號', '合約ID', '合約id', 'contractId', 'ContractId'],
  n: ['n', '媒合編號', 'matchNo', 'MatchNo'],
  st: ['st', '狀態', '資料狀態', 'displayStatus', 'applyStatus'],
  ct: ['ct', '委託類型', '委託型式', 'contratType', 'contractType'],
  ft: ['ft', '案件來源', '案件類型', 'contratFromType'],
  sl: ['sl', '業務', 'sales'],
  so: ['so', '營業處', 'salesOffice'],
  eu: ['eu', '業績歸屬業務', '業績歸屬', 'performanceUser'],
  eo: ['eo', '業績歸屬處', 'performanceOffice'],
  ls: ['ls', '起租日', '租約起日', 'leaseStart'],
  le: ['le', '迄租日', '租約迄日', 'leaseEnd'],
  i: ['i', '身分別', 'idClass', 'identityTypeName'],
  h: ['h', '房屋類型', 'houseType'],
  src: ['src', '媒合來源', 'matchSource', '來源'],
  nl: ['nl', '新件類別', '是否帶租約', 'hasExistingLease'],
  fam: ['fam', '家庭', 'family'],
  cd: ['cd'],
  cls: ['cls'],
  cle: ['cle']
};

var EXTRA_KEYS = Object.keys(MATCH_EXTRA_COLUMNS);

/** GetContract 明細可能的欄位名。抓不到就留空，不覆蓋匯入值。 */
var DETAIL_FIELDS = {
  h: ['houseType', 'houseTypeName', 'rentTypeName', 'objectTypeName', 'buildingTypeName'],
  src: ['matchSource', 'matchSourceName', 'mediaSource', 'sourceTypeName', 'contratSource'],
  eu: ['performanceUserName', 'performanceSales', 'belongSalesName', 'achieveUserName'],
  eo: ['performanceOfficeName', 'belongOfficeName', 'achieveOfficeName'],
  fam: ['familyTypeName', 'familyStatus', 'weakFamily'],
  cd: ['cd'],
  cls: ['charterLeaseStart', 'cls'],
  cle: ['charterLeaseEnd', 'cle']
};

var KEY = {
  lock: 'mgr-report:lock',
  force: 'mgr-report:force',
  build: 'mgr-report:build',
  buf: 'mgr-report:contracts:buf',
  meta: 'mgr-report:contracts:meta',
  touch: 'mgr-report:contracts:touch',
  staff: 'mgr-report:staff',
  renewals: 'mgr-report:renewals',
  renewBuild: 'mgr-report:renewals:build',
  arrears: 'mgr-report:arrears',
  arrearsBuild: 'mgr-report:arrears:build',
  extraMeta: 'mgr-report:match-extra:meta',
  extraIncoming: 'mgr-report:match-extra:incoming',
  extraQueue: 'mgr-report:match-extra:queue',
  extraDay: 'mgr-report:match-extra:day:'
};

function num(env, name, fallback) {
  var n = Number(env && env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function taipei(when) {
  var t = new Date(when.getTime() + 8 * 60 * 60 * 1000);
  var y = t.getUTCFullYear();
  var m = String(t.getUTCMonth() + 1).padStart(2, '0');
  var d = String(t.getUTCDate()).padStart(2, '0');
  return { hour: t.getUTCHours(), key: y + '-' + m + '-' + d };
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

async function kvGet(env, key) {
  if (!env.MGR_REPORT_KV) return null;
  var raw = await env.MGR_REPORT_KV.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

async function kvPut(env, key, value, ttl) {
  var opts = ttl ? { expirationTtl: ttl } : undefined;
  await env.MGR_REPORT_KV.put(key, JSON.stringify(value), opts);
}

async function kvDel(env, key) {
  if (env.MGR_REPORT_KV) await env.MGR_REPORT_KV.delete(key);
}

function logPhase(phase, extra) {
  var row = Object.assign({ tag: 'mgr-report', phase: phase }, extra || {});
  console.log(JSON.stringify(row));
}

var CookieJar = class {
  constructor() { this.map = new Map(); }
  absorb(response) {
    var list = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    for (var i = 0; i < list.length; i++) {
      var first = String(list[i] || '').split(';')[0];
      var eq = first.indexOf('=');
      if (eq <= 0) continue;
      var name = first.slice(0, eq).trim();
      var value = first.slice(eq + 1).trim();
      if (!name) continue;
      if (value === '' || /deleted/i.test(value)) this.map.delete(name);
      else this.map.set(name, value);
    }
  }
  header() {
    if (!this.map.size) return '';
    return Array.from(this.map.entries()).map(function (pair) { return pair[0] + '=' + pair[1]; }).join('; ');
  }
};

async function skyfunFetch(jar, url, opts) {
  var headers = Object.assign({
    'User-Agent': SKYFUN_UA,
    Accept: 'application/json, text/html, */*',
    Origin: SKYFUN_ORIGIN
  }, (opts && opts.headers) || {});
  var cookie = jar.header();
  if (cookie) headers.Cookie = cookie;
  var res = await fetch(url, {
    method: opts && opts.method,
    headers: headers,
    body: opts && opts.body,
    redirect: (opts && opts.redirect) || 'manual'
  });
  jar.absorb(res);
  return res;
}

async function loginSkyfunHttp(env) {
  var username = String(env.SKYFUN_USERNAME || '').trim();
  var password = String(env.SKYFUN_PASSWORD || '').trim();
  if (!username || !password) throw new Error('缺少 SKYFUN_USERNAME / SKYFUN_PASSWORD');
  var jar = new CookieJar();
  var pageRes = await skyfunFetch(jar, LOGIN_URL, {
    method: 'GET',
    headers: { Referer: SKYFUN_ORIGIN + '/' },
    redirect: 'follow'
  });
  if (!pageRes.ok && pageRes.status !== 302) {
    throw new Error('無法開啟星鴻登入頁（HTTP ' + pageRes.status + '）');
  }
  var loginRes = await skyfunFetch(jar, LOGIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Referer: LOGIN_URL,
      'X-Requested-With': 'XMLHttpRequest'
    },
    body: JSON.stringify({ loginAccount: username, password: password, rememberMe: false }),
    redirect: 'manual'
  });
  var text = await loginRes.text();
  var payload = null;
  try { payload = JSON.parse(text); } catch (e) { payload = null; }
  if (payload && payload.success === false) {
    throw new Error('登入失敗');
  }
  if (!loginRes.ok && !(payload && payload.success)) {
    throw new Error('登入失敗（HTTP ' + loginRes.status + '）');
  }
  if (!jar.header()) throw new Error('登入後未取得 Cookie');
  await skyfunFetch(jar, SKYFUN_ORIGIN + '/Home/Index', {
    method: 'GET',
    headers: { Referer: LOGIN_URL },
    redirect: 'follow'
  }).catch(function () {});
  return jar;
}

function slim(r) {
  return {
    id: r.id,
    st: r.displayStatus || r.applyStatus || '',
    ct: r.contratType || '',
    ft: r.contratFromType || '',
    so: r.salesOffice || '',
    sl: r.sales || '',
    city: r.registerCity || '',
    p: r.socialHousingPeriodName || '',
    ls: r.leaseStart || '',
    le: r.leaseEnd || '',
    ad: r.applyDate || '',
    n: r.matchNo || '',
    rel: r.relatedContract || '',
    addr: r.rentAddress || '',
    i: r.idClass || r.identityTypeName || r.i || '',
    nl: r.hasExistingLease || ''
  };
}

function rocYM(ls) {
  var m = String(ls || '').match(/^(\d{2,3})\/(\d{1,2})/);
  if (!m) return { y: 0, m: 0 };
  return { y: +m[1], m: +m[2] };
}

function perfOf(r) {
  var ym = rocYM(r.ls);
  return { id: r.id, st: r.st, ct: r.ct, ft: r.ft, so: r.so, sl: r.sl, y: ym.y, m: ym.m, ls: r.ls, n: r.n };
}

function touchOf(raw, row) {
  var updated = raw.updateDate || raw.modifyDate || raw.updatedAt || raw.lastUpdateTime || raw.modifiedDate || '';
  return [row.st, row.ls, row.le, updated].join('|');
}

function fieldPresence(raw) {
  var keys = raw && typeof raw === 'object' ? Object.keys(raw) : [];
  function has(names) {
    for (var i = 0; i < names.length; i++) if (keys.indexOf(names[i]) >= 0) return true;
    return false;
  }
  return {
    idClass: has(['idClass', 'identityTypeName']),
    hasExistingLease: has(['hasExistingLease']),
    houseType: has(['houseType', 'houseTypeName', 'rentTypeName', 'objectTypeName']),
    matchSource: has(['matchSource', 'matchSourceName', 'mediaSource', 'sourceTypeName'])
  };
}

function canEnter(user) {
  if (!user) return false;
  var name = String(user.name || '').trim();
  if (FULL_ACCESS[name]) return true;
  var team = String(user.team || '').trim();
  var title = String(user.jobTitle || user.job_title || '').trim();
  if (title === '工讀生') return false;
  if (team === '總經理室') return true;
  if (BIZ_TITLES[title]) return true;
  return false;
}

function canImport(user) {
  if (!user) return false;
  var name = String(user.name || '').trim();
  if (FULL_ACCESS[name]) return true;
  return String(user.team || '').trim() === '總經理室';
}

async function sessionUser(request, env) {
  var token = String(request.headers.get('X-Skyfun-Session') || '').trim();
  if (!token) return null;
  var url = String(env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
  var anon = String(env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON).trim();
  try {
    var res = await fetch(url + '/rest/v1/rpc/toolbox_me', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anon,
        Authorization: 'Bearer ' + anon
      },
      body: JSON.stringify({ p_token: token })
    });
    if (!res.ok) return null;
    var data = await res.json();
    if (!data || !data.ok || !data.user) return null;
    return data.user;
  } catch (e) {
    return null;
  }
}

function allowedOrigins(env) {
  var list = String(env.ALLOWED_ORIGINS || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  return list.length ? list : [
    'https://toolbox.skyfunsystem.com',
    'https://skyfun-toolbox-preview.pages.dev',
    'http://127.0.0.1:8080',
    'http://localhost:8080'
  ];
}

function cors(response, request, env) {
  var origin = request.headers.get('Origin') || '';
  var allowed = allowedOrigins(env);
  var ok = allowed.some(function (item) { return origin === item; });
  var headers = new Headers(response.headers);
  if (ok) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Skyfun-Session');
  return new Response(response.body, { status: response.status, headers: headers });
}

function json(data, request, env, status) {
  return cors(new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  }), request, env);
}

async function authorize(request, env) {
  var user = await sessionUser(request, env);
  if (!user) return { status: 401, error: '請先登入工具箱' };
  if (!canEnter(user)) return { status: 403, error: '業務主管專區僅限儲備處經理以上使用。' };
  return { user: user };
}

function partKey(version, index) {
  return 'mgr-report:contracts:v:' + version + ':' + index;
}

function extraPartKey(version, index) {
  return 'mgr-report:match-extra:v:' + version + ':' + index;
}

async function readParts(env, version, parts, keyFn) {
  var rows = [];
  for (var i = 0; i < parts; i++) {
    var part = await kvGet(env, keyFn(version, i));
    if (Array.isArray(part)) rows = rows.concat(part);
  }
  return rows;
}

async function writeParts(env, version, rows, keyFn) {
  var parts = 0;
  for (var i = 0; i < rows.length; i += PART_SIZE) {
    await kvPut(env, keyFn(version, parts), rows.slice(i, i + PART_SIZE));
    parts += 1;
  }
  if (!parts) {
    await kvPut(env, keyFn(version, 0), []);
    parts = 1;
  }
  return parts;
}

function isoToRoc(iso) {
  var parts = String(iso || '').slice(0, 10).split('-');
  if (parts.length < 3) return '';
  return (Number(parts[0]) - 1911) + '/' + parts[1] + '/' + parts[2];
}

/** 管報儀表板：近 N 個西元年起租日（含當年、去年同期，並預留明年已審案件）。 */
function leaseRangeForDashboard(env, when) {
  var years = num(env, 'CONTRACT_LEASE_YEARS', DEFAULT_CONTRACT_LEASE_YEARS);
  var clock = taipei(when || new Date());
  var y = Number(String(clock.key).slice(0, 4));
  if (!Number.isFinite(y) || y < 2000) y = new Date().getFullYear();
  var startY = y - Math.max(1, years) + 1;
  return {
    start: isoToRoc(startY + '-01-01'),
    end: isoToRoc((y + 1) + '-12-31')
  };
}

async function searchContractsPage(jar, page, range) {
  var body = { page: page, pageSize: CONTRACT_PAGE_SIZE, sortItems: [] };
  if (range && range.start && range.end) body.leaseStartDateRange = range;
  var res = await skyfunFetch(jar, CONTRAT_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: SKYFUN_ORIGIN + '/Contrat/Contrat_Index'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('合約搜尋失敗（HTTP ' + res.status + '）');
  var data = await res.json().catch(function () { return null; });
  if (!data || data.success === false) throw new Error('合約搜尋回傳格式錯誤');
  return data;
}

async function publishContracts(env, build) {
  var buf = (await kvGet(env, KEY.buf)) || [];
  if (buf.length) {
    await kvPut(env, partKey(build.version, build.partIndex), buf);
    build.partIndex += 1;
    build.rowCount += buf.length;
    await kvDel(env, KEY.buf);
  }
  var prevTouch = (await kvGet(env, KEY.touch)) || {};
  var prev = await kvGet(env, KEY.meta);
  var meta = {
    version: build.version,
    fetchedAt: build.fetchedAt,
    n: build.rowCount,
    parts: build.partIndex,
    source: 'skyfunsystem.com/Contrat/SearchContracts',
    leaseRange: build.leaseRange || null,
    fieldPresence: build.fieldPresence || null,
    building: false
  };
  await kvPut(env, KEY.meta, meta);
  await kvPut(env, KEY.touch, build.touch || {});
  if (prev && prev.version && prev.version !== build.version) {
    for (var i = 0; i < (prev.parts || 0); i++) await kvDel(env, partKey(prev.version, i));
  }
  await rebuildExtraQueue(env, build.touch || {}, prevTouch);
}

async function advanceContracts(env, jar, build) {
  var t0 = Date.now();
  var buf = (await kvGet(env, KEY.buf)) || [];
  var touch = build.touch || {};
  var pages = 0;
  var range = build.leaseRange || leaseRangeForDashboard(env, new Date());
  build.leaseRange = range;
  while (pages < PAGES_PER_TICK && build.page <= build.totalPages) {
    var data = await searchContractsPage(jar, build.page, range);
    if (!build.totalCount) {
      build.totalCount = Number(data.totalCount) || 0;
      build.totalPages = Math.max(1, Math.ceil(build.totalCount / CONTRACT_PAGE_SIZE));
    }
    var list = Array.isArray(data.data) ? data.data : [];
    if (!build.fieldPresence && list[0]) build.fieldPresence = fieldPresence(list[0]);
    for (var i = 0; i < list.length; i++) {
      var row = slim(list[i]);
      buf.push(row);
      if (row.id != null) touch[String(row.id)] = touchOf(list[i], row);
      if (buf.length >= PART_SIZE) {
        await kvPut(env, partKey(build.version, build.partIndex), buf);
        build.partIndex += 1;
        build.rowCount += buf.length;
        buf = [];
      }
    }
    build.page += 1;
    pages += 1;
    if (!list.length) break;
  }
  build.touch = touch;
  await kvPut(env, KEY.buf, buf);
  var done = build.page > build.totalPages;
  if (done) {
    await publishContracts(env, build);
    build.phase = 'staff';
    build.fail = 0;
  }
  logPhase('contracts', {
    done: done,
    page: build.page,
    total: build.totalPages,
    n: build.totalCount,
    range: range,
    ms: Date.now() - t0
  });
  return build;
}

function titleMapOf(options) {
  var map = {};
  var list = Array.isArray(options) ? options : [];
  for (var i = 0; i < list.length; i++) {
    var value = String(list[i] && list[i].value != null ? list[i].value : '').trim();
    var text = String(list[i] && list[i].text != null ? list[i].text : '').trim();
    if (value && text) map[value] = text;
  }
  return map;
}

function titleLabel(raw, map) {
  var codes = [];
  if (Array.isArray(raw)) codes = raw.map(function (item) { return String(item || '').trim(); }).filter(Boolean);
  else codes = String(raw || '').split(/[,，、\s]+/).map(function (s) { return s.trim(); }).filter(Boolean);
  var labels = [];
  for (var i = 0; i < codes.length; i++) {
    var label = map[codes[i]] || (/^\d+$/.test(codes[i]) ? '' : codes[i]);
    if (label && labels.indexOf(label) < 0) labels.push(label);
  }
  return labels.join('、');
}

async function fetchStaff(env, jar) {
  var t0 = Date.now();
  var referer = { Referer: SKYFUN_ORIGIN + '/Account/Account_Index' };
  var headers = Object.assign({ 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' }, referer);
  var titlesRes = await skyfunFetch(jar, SKYFUN_ORIGIN + '/Account/GetJobTitleOptions', { method: 'GET', headers: headers });
  var branchRes = await skyfunFetch(jar, SKYFUN_ORIGIN + '/Account/GetBranchOfficeOptions', { method: 'GET', headers: headers });
  var listRes = await skyfunFetch(jar, SKYFUN_ORIGIN + '/Account/Search', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
    body: JSON.stringify({})
  });
  if (!titlesRes.ok || !branchRes.ok || !listRes.ok) throw new Error('讀取人事失敗');
  var titles = await titlesRes.json().catch(function () { return null; });
  var branches = await branchRes.json().catch(function () { return null; });
  var list = await listRes.json().catch(function () { return null; });
  var tMap = titleMapOf(titles && titles.data);
  var bMap = {};
  var bList = Array.isArray(branches && branches.data) ? branches.data : [];
  bList.forEach(function (o) { bMap[String(o.value != null ? o.value : '')] = String(o.text || '').trim(); });
  var people = Array.isArray(list && list.data) ? list.data : [];
  var supervisorField = false;
  var hr = [];
  var meta = [];
  people.forEach(function (row) {
    var office = String(row.branchOffice || '');
    var officeName = String(bMap[office] || office).replace(/\s*\([^)]*\)\s*$/, '');
    var titleCode = Array.isArray(row.jobTitleList) ? row.jobTitleList.join(',') : String(row.jobTitle || '');
    var titleName = titleLabel(row.jobTitleList || row.jobTitle, tMap);
    var supervisor = String(row.supervisorName || row.supervisor || row.directSupervisorName || row.managerName || '');
    if (Object.prototype.hasOwnProperty.call(row, 'supervisor') || Object.prototype.hasOwnProperty.call(row, 'supervisorName') || Object.prototype.hasOwnProperty.call(row, 'directSupervisorName')) supervisorField = true;
    var dept = String(row.departmentName || row.deptName || row.department || '');
    var base = {
      id: row.id,
      name: String(row.userName || row.name || ''),
      office: office,
      officeName: officeName,
      status: String(row.status || ''),
      dept: dept
    };
    hr.push(Object.assign({}, base, {
      title: titleCode,
      titleName: titleName,
      reportDate: row.reportDate || row.onBoardDate || row.hireDate || row.arrivalDate || null,
      brokerNo: String(row.brokerNo || row.brokerLicenseNo || row.agentLicense || ''),
      leaseNo: String(row.leaseNo || row.leaseLicenseNo || row.rentalLicense || '')
    }));
    meta.push(Object.assign({}, base, {
      title: titleName || titleCode,
      supervisor: supervisor
    }));
  });
  var fetchedAt = new Date().toISOString();
  await kvPut(env, KEY.staff, {
    fetchedAt: fetchedAt,
    supervisorField: supervisorField,
    hr: { fetchedAt: fetchedAt, staff: hr },
    meta: { fetchedAt: fetchedAt, staff: meta, supervisorField: supervisorField }
  });
  logPhase('staff', { done: true, total: hr.length, ms: Date.now() - t0 });
}

async function advanceRenewals(env, jar, build) {
  var t0 = Date.now();
  var state = (await kvGet(env, KEY.renewBuild)) || { page: 1, rows: [], st: {}, total: 0 };
  var pages = 0;
  var done = false;
  while (pages < 4) {
    var res = await skyfunFetch(jar, RENEW_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: SKYFUN_ORIGIN + '/Renewal/Renewal_Index'
      },
      body: JSON.stringify({ page: state.page, pageSize: 300, sortItems: [] })
    });
    if (!res.ok) throw new Error('續約查詢失敗（HTTP ' + res.status + '）');
    var data = await res.json().catch(function () { return null; });
    if (!data || data.success === false) throw new Error((data && data.message) || '續約查詢回傳格式錯誤');
    state.total = Number(data.totalCount) || state.total;
    var list = Array.isArray(data.data) ? data.data : [];
    list.forEach(function (raw) {
      var st = String(raw.renewalStatus || raw.applyStatus || raw.status || '');
      state.st[st] = (state.st[st] || 0) + 1;
      state.rows.push({
        id: raw.id,
        cid: raw.contractId || raw.contratId || null,
        st: st,
        raw: raw.renewalStatus || raw.status || '',
        ct: raw.contratType || raw.contractType || raw.entrustType || '',
        ft: raw.contratFromType || raw.caseType || '',
        ag: raw.sales || raw.agentName || raw.business || '',
        of: raw.salesOffice || raw.branchOfficeName || raw.escrowOfficeName || '',
        ls: raw.leaseStart || '',
        le: raw.leaseEnd || '',
        n: raw.matchNo || ''
      });
    });
    state.page += 1;
    pages += 1;
    if (!list.length || state.rows.length >= state.total) { done = true; break; }
  }
  if (done) {
    var fetchedAt = new Date().toISOString();
    await kvPut(env, KEY.renewals, {
      fetchedAt: fetchedAt,
      n: state.rows.length,
      st: state.st,
      rows: state.rows
    });
    await kvDel(env, KEY.renewBuild);
    build.phase = 'arrears';
    build.fail = 0;
  } else {
    await kvPut(env, KEY.renewBuild, state);
  }
  logPhase('renewals', { done: done, total: state.total, page: state.page, ms: Date.now() - t0 });
}

function rocDate(value) {
  var s = String(value || '').trim();
  var m = s.match(/^(\d{2,4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (!m) return s;
  var y = Number(m[1]);
  if (y > 1911) y -= 1911;
  return y + '/' + String(Number(m[2])).padStart(2, '0') + '/' + String(Number(m[3])).padStart(2, '0');
}

function arrearsOf(item) {
  var fee = String(item.arrearsTypeText || item.receivableTypeText || item.feeTypeText || item.itemName || item.receivableName || '');
  return {
    days: Number(item.overdueDays) || 0,
    amt: Number(item.arrearsAmount != null ? item.arrearsAmount : item.receivableAmount) || 0,
    rd: rocDate(item.receivableDate),
    agent: String(item.agentName || ''),
    office: String(item.branchOfficeName || item.branchOfficeText || item.branchOffice || ''),
    ct: String(item.contractTypeText || item.contratType || ''),
    cat: /押/.test(fee) ? 'deposit' : 'rent',
    id: item.contractId || item.contratId || item.id || item.recordId || null
  };
}

async function advanceArrears(env, jar, build) {
  var t0 = Date.now();
  var state = (await kvGet(env, KEY.arrearsBuild)) || { page: 1, rows: [], src: 0 };
  var pages = 0;
  var done = false;
  while (pages < 2) {
    var res = await skyfunFetch(jar, ARREARS_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: SKYFUN_ORIGIN + '/ArrearsManagement/Query'
      },
      body: JSON.stringify({
        city: null,
        branchOffice: null,
        arrearsStatus: null,
        overdueDaysMin: 1,
        overdueDaysMax: null,
        contractType: null,
        matchNo: null,
        page: state.page,
        pageSize: 500,
        sortItems: null
      })
    });
    if (!res.ok) throw new Error('欠款查詢失敗（HTTP ' + res.status + '）');
    var data = await res.json().catch(function () { return null; });
    if (!data || data.success === false) throw new Error((data && data.message) || '欠款查詢回傳格式錯誤');
    state.src = Number(data.totalCount) || state.src;
    var list = Array.isArray(data.data) ? data.data : [];
    list.forEach(function (item) { state.rows.push(arrearsOf(item)); });
    state.page += 1;
    pages += 1;
    if (!list.length || state.rows.length >= state.src) { done = true; break; }
  }
  if (done) {
    await kvPut(env, KEY.arrears, {
      fetchedAt: new Date().toISOString(),
      source: 'ArrearsManagement/Search',
      srcRecords: state.src,
      rows: state.rows
    });
    await kvDel(env, KEY.arrearsBuild);
    // 媒合明細補抓只在有 Excel 匯入時才有意義；儀表板日常更新到欠款即可結束。
    build.phase = 'done';
    build.fail = 0;
  } else {
    await kvPut(env, KEY.arrearsBuild, state);
  }
  logPhase('arrears', { done: done, total: state.src, ms: Date.now() - t0 });
}

async function readExtra(env) {
  var meta = await kvGet(env, KEY.extraMeta);
  if (!meta || !meta.version) return { meta: meta, rows: [] };
  var rows = await readParts(env, meta.version, meta.parts || 0, extraPartKey);
  return { meta: meta, rows: rows };
}

function pickDetail(raw, names) {
  if (!raw) return '';
  for (var i = 0; i < names.length; i++) {
    var value = raw[names[i]];
    if (value != null && String(value).trim() !== '') return value;
  }
  return '';
}

async function rebuildExtraQueue(env, touch, prevTouch) {
  var extra = await readExtra(env);
  if (!extra.meta || !extra.meta.importedAt) {
    await kvPut(env, KEY.extraQueue, []);
    return;
  }
  var have = {};
  extra.rows.forEach(function (row) {
    if (row && row.id != null) have[String(row.id)] = true;
  });
  var prev = prevTouch || (await kvGet(env, KEY.touch)) || {};
  var queue = [];
  Object.keys(touch || {}).forEach(function (id) {
    if (!have[id]) queue.push(id);
    else if (prev[id] && prev[id] !== touch[id]) queue.push(id);
  });
  await kvPut(env, KEY.extraQueue, queue);
}

async function advanceMatch(env, jar, build, when) {
  var t0 = Date.now();
  var dayKey = KEY.extraDay + taipei(when).key;
  var day = (await kvGet(env, dayKey)) || { queried: 0, stopped: false, reason: '', fail: 0, emptyDetail: 0 };
  var extra = await readExtra(env);
  if (!extra.meta || !extra.meta.importedAt) {
    build.phase = 'done';
    logPhase('match', { done: true, total: 0, ms: Date.now() - t0, note: 'no-import' });
    return;
  }
  if (day.stopped || day.queried >= num(env, 'MATCH_EXTRA_DAILY_CAP', 500)) {
    build.phase = 'done';
    logPhase('match', { done: true, total: day.queried, ms: Date.now() - t0, note: day.reason || 'cap' });
    return;
  }
  var queue = (await kvGet(env, KEY.extraQueue)) || [];
  var cap = Math.min(num(env, 'MATCH_EXTRA_PER_TICK', 20), num(env, 'MATCH_EXTRA_DAILY_CAP', 500) - day.queried);
  var gap = num(env, 'MATCH_EXTRA_GAP_MS', 300);
  var byId = {};
  extra.rows.forEach(function (row) { if (row && row.id != null) byId[String(row.id)] = row; });
  var take = queue.slice(0, cap);
  var rest = queue.slice(take.length);
  for (var i = 0; i < take.length; i++) {
    if (i) await sleep(gap);
    var id = take[i];
    try {
      var res = await skyfunFetch(jar, SKYFUN_ORIGIN + '/Contrat/GetContract/' + encodeURIComponent(id), {
        method: 'GET',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'application/json',
          Referer: SKYFUN_ORIGIN + '/Contrat/EditContrat?id=' + id + '&mode=view'
        }
      });
      if (res.status === 429 || res.status >= 500) {
        day.fail += 1;
        rest.unshift(id);
        if (day.fail >= 3) {
          day.stopped = true;
          day.reason = '公司系統回應 ' + res.status + '，今天停止補抓';
        }
        break;
      }
      if (!res.ok) {
        day.fail += 1;
        if (day.fail >= 3) {
          day.stopped = true;
          day.reason = '連續失敗 3 次，今天停止補抓';
          rest.unshift(id);
          break;
        }
        rest.push(id);
        continue;
      }
      day.fail = 0;
      day.queried += 1;
      var data = await res.json().catch(function () { return null; });
      var raw = data && data.data && typeof data.data === 'object' && !Array.isArray(data.data) ? data.data : data;
      var current = byId[String(id)] || { id: id };
      var found = false;
      Object.keys(DETAIL_FIELDS).forEach(function (field) {
        var value = pickDetail(raw, DETAIL_FIELDS[field]);
        if (value !== '') {
          current[field] = value;
          found = true;
        }
      });
      if (!found) day.emptyDetail += 1;
      else day.emptyDetail = 0;
      byId[String(id)] = current;
      if (day.emptyDetail >= 3) {
        day.stopped = true;
        day.reason = '合約明細沒有房屋類型或媒合來源，已停止補抓，請核對欄位';
        break;
      }
    } catch (err) {
      day.fail += 1;
      rest.unshift(id);
      if (day.fail >= 3) {
        day.stopped = true;
        day.reason = '連續失敗 3 次，今天停止補抓';
      }
      break;
    }
  }
  var merged = Object.keys(byId).map(function (id) { return byId[id]; });
  if (merged.length) {
    var version = String(Date.now());
    var parts = await writeParts(env, version, merged, extraPartKey);
    var prev = extra.meta;
    await kvPut(env, KEY.extraMeta, Object.assign({}, prev, {
      version: version,
      parts: parts,
      n: merged.length,
      fetchedAt: new Date().toISOString()
    }));
    if (prev && prev.version && prev.version !== version) {
      for (var p = 0; p < (prev.parts || 0); p++) await kvDel(env, extraPartKey(prev.version, p));
    }
  }
  await kvPut(env, KEY.extraQueue, rest);
  await kvPut(env, dayKey, day, 3 * 86400);
  if (!rest.length || day.stopped || day.queried >= num(env, 'MATCH_EXTRA_DAILY_CAP', 500)) build.phase = 'done';
  logPhase('match', { done: build.phase === 'done', total: day.queried, ms: Date.now() - t0 });
}

async function withLock(env, fn) {
  var token = String(Date.now()) + '-' + Math.random().toString(16).slice(2);
  var cur = await kvGet(env, KEY.lock);
  if (cur && cur.until > Date.now()) return { skipped: true };
  await kvPut(env, KEY.lock, { token: token, until: Date.now() + LOCK_TTL * 1000 }, LOCK_TTL);
  var again = await kvGet(env, KEY.lock);
  if (!again || again.token !== token) return { skipped: true };
  try {
    return await fn();
  } finally {
    var held = await kvGet(env, KEY.lock);
    if (held && held.token === token) await kvDel(env, KEY.lock);
  }
}

async function stepJob(env, when, force) {
  if (!env.MGR_REPORT_KV) throw new Error('缺少 KV binding MGR_REPORT_KV');
  var clock = taipei(when);
  var build = (await kvGet(env, KEY.build)) || null;
  var running = build && build.phase && build.phase !== 'done';
  if (!running && clock.hour < 7 && !force) return { skipped: true, reason: 'before-7' };
  if (!running && build && build.date === clock.key && build.phase === 'done' && !force) {
    return { skipped: true, reason: 'done' };
  }
  if (!running || force) {
    if (!running || (build && build.phase === 'done') || force) {
      build = {
        date: clock.key,
        phase: 'contracts',
        version: String(Date.now()),
        page: 1,
        totalPages: 1,
        totalCount: 0,
        partIndex: 0,
        rowCount: 0,
        fetchedAt: new Date().toISOString(),
        fail: 0,
        touch: {},
        leaseRange: leaseRangeForDashboard(env, when)
      };
      await kvDel(env, KEY.buf);
      await kvDel(env, KEY.renewBuild);
      await kvDel(env, KEY.arrearsBuild);
    }
  }
  var jar = await loginSkyfunHttp(env);
  try {
    if (build.phase === 'contracts') await advanceContracts(env, jar, build);
    else if (build.phase === 'staff') {
      await fetchStaff(env, jar);
      build.phase = 'renewals';
      build.fail = 0;
    } else if (build.phase === 'renewals') await advanceRenewals(env, jar, build);
    else if (build.phase === 'arrears') await advanceArrears(env, jar, build);
    else if (build.phase === 'match') {
      // 保留函式供手動／舊排程相容；日常流程改在欠款後直接結束。
      await advanceMatch(env, jar, build, when);
      if (build.phase === 'match') build.phase = 'done';
    } else build.phase = 'done';
  } catch (err) {
    var msg = String(err && err.message || err);
    build.fail = (build.fail || 0) + 1;
    build.lastError = msg;
    logPhase(build.phase, { done: false, error: msg, ms: 0 });
    var transient = /HTTP 502|HTTP 503|HTTP 504|ETIMEDOUT|fetch failed|network|無法開啟星鴻登入/i.test(msg);
    if (!transient && build.fail >= 3 && build.phase !== 'contracts') {
      build.phase = build.phase === 'staff' ? 'renewals' : build.phase === 'renewals' ? 'arrears' : build.phase === 'arrears' ? 'match' : 'done';
      build.fail = 0;
    }
  }
  await kvPut(env, KEY.build, build);
  return { ok: true, phase: build.phase, date: build.date };
}

function cleanExtraRow(input) {
  var src = input || {};
  var id = src.id != null ? src.id : '';
  if (String(id).trim() === '') return null;
  var row = { id: typeof id === 'number' ? id : String(id).trim() };
  for (var i = 0; i < EXTRA_KEYS.length; i++) {
    var key = EXTRA_KEYS[i];
    if (key === 'id') continue;
    if (src[key] == null) continue;
    row[key] = String(src[key]).slice(0, 500);
  }
  return row;
}

function headerField(name) {
  var want = String(name || '').replace(/^\uFEFF/, '').trim().toLowerCase();
  for (var i = 0; i < EXTRA_KEYS.length; i++) {
    var aliases = MATCH_EXTRA_COLUMNS[EXTRA_KEYS[i]];
    for (var j = 0; j < aliases.length; j++) {
      if (String(aliases[j]).toLowerCase() === want) return EXTRA_KEYS[i];
    }
  }
  return '';
}

function normalizeImportRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  var shaped = cleanExtraRow(raw);
  if (shaped) return shaped;
  var obj = {};
  Object.keys(raw).forEach(function (key) {
    var field = headerField(key);
    if (field) obj[field] = raw[key];
  });
  return cleanExtraRow(obj);
}

async function importExtra(env, body) {
  var rows = Array.isArray(body && body.rows) ? body.rows : [];
  if (rows.length > 500) return { status: 400, error: '每批最多 500 筆' };
  var mode = body && body.mode === 'append' ? 'append' : 'replace';
  var incoming = mode === 'replace'
    ? { version: String(Date.now()), parts: 0, n: 0, startedAt: new Date().toISOString() }
    : ((await kvGet(env, KEY.extraIncoming)) || { version: String(Date.now()), parts: 0, n: 0, startedAt: new Date().toISOString() });
  var clean = [];
  rows.forEach(function (raw) {
    var row = normalizeImportRow(raw);
    if (row) clean.push(row);
  });
  await kvPut(env, extraPartKey(incoming.version, incoming.parts), clean);
  incoming.parts += 1;
  incoming.n += clean.length;
  if (body && body.done) {
    var flat = await readParts(env, incoming.version, incoming.parts, extraPartKey);
    var byId = {};
    flat.forEach(function (row) { if (row && row.id != null) byId[String(row.id)] = row; });
    var merged = Object.keys(byId).map(function (id) { return byId[id]; });
    var version = String(Date.now());
    var parts = await writeParts(env, version, merged, extraPartKey);
    for (var oldPart = 0; oldPart < incoming.parts; oldPart++) await kvDel(env, extraPartKey(incoming.version, oldPart));
    var prev = await kvGet(env, KEY.extraMeta);
    incoming.n = merged.length;
    await kvPut(env, KEY.extraMeta, {
      version: version,
      parts: parts,
      n: merged.length,
      importedAt: new Date().toISOString(),
      fetchedAt: new Date().toISOString()
    });
    await kvDel(env, KEY.extraIncoming);
    if (prev && prev.version && prev.version !== incoming.version) {
      for (var i = 0; i < (prev.parts || 0); i++) await kvDel(env, extraPartKey(prev.version, i));
    }
    var touch = (await kvGet(env, KEY.touch)) || {};
    await rebuildExtraQueue(env, touch);
  } else {
    await kvPut(env, KEY.extraIncoming, incoming);
  }
  return { ok: true, n: incoming.n, accepted: clean.length, done: !!(body && body.done) };
}

async function handle(request, env) {
  var url = new URL(request.url);
  var path = url.pathname.replace(/\/$/, '') || '/';
  if (request.method === 'OPTIONS') return json({ ok: true }, request, env);
  if (request.method === 'GET' && path === '/') return json({ ok: true, service: 'skyfun-mgr-report' }, request, env);
  if (!path.startsWith('/api/mgr-report')) return json({ ok: false, error: '找不到' }, request, env, 404);

  var auth = await authorize(request, env);
  if (auth.status) return json({ ok: false, error: auth.error }, request, env, auth.status);

  if (request.method === 'POST' && path === '/api/mgr-report/match-extra/import') {
    if (!canImport(auth.user)) return json({ ok: false, error: '只有總經理室可以匯入' }, request, env, 403);
    var body = await request.json().catch(function () { return null; });
    var saved = await importExtra(env, body || {});
    return json(saved.ok ? saved : { ok: false, error: saved.error }, request, env, saved.status || 200);
  }
  if (request.method === 'POST' && path === '/api/mgr-report/refresh') {
    await kvPut(env, KEY.force, { at: new Date().toISOString() }, 3600);
    var stepped = await withLock(env, function () { return stepJob(env, new Date(), true); });
    return json({ ok: true, message: '已排入更新，完成前仍顯示上一版', step: stepped }, request, env);
  }
  if (request.method !== 'GET') return json({ ok: false, error: '找不到' }, request, env, 404);

  if (path === '/api/mgr-report/status') return json(await statusPayload(env), request, env);
  if (path === '/api/mgr-report/contracts') {
    var meta = await kvGet(env, KEY.meta);
    var build = await kvGet(env, KEY.build);
    var building = !!(build && build.phase === 'contracts');
    if (!meta) return json({ ok: true, fetchedAt: null, n: 0, rows: [], building: building }, request, env);
    var rows = await readParts(env, meta.version, meta.parts || 0, partKey);
    return json({ ok: true, fetchedAt: meta.fetchedAt, n: rows.length, rows: rows, building: building, fieldPresence: meta.fieldPresence || null }, request, env);
  }
  if (path === '/api/mgr-report/perf') {
    var cMeta = await kvGet(env, KEY.meta);
    if (!cMeta) return json({ ok: true, fetchedAt: null, source: 'skyfunsystem.com/Contrat/SearchContracts', by: 'leaseStartDate', n: 0, rows: [] }, request, env);
    var cRows = await readParts(env, cMeta.version, cMeta.parts || 0, partKey);
    var perf = cRows.map(perfOf);
    return json({ ok: true, fetchedAt: cMeta.fetchedAt, source: 'skyfunsystem.com/Contrat/SearchContracts', by: 'leaseStartDate', n: perf.length, rows: perf }, request, env);
  }
  if (path === '/api/mgr-report/staff') {
    var staff = await kvGet(env, KEY.staff);
    if (!staff) return json({ ok: true, fetchedAt: null, hr: { fetchedAt: null, staff: [] }, meta: { fetchedAt: null, staff: [] } }, request, env);
    return json(Object.assign({ ok: true }, staff), request, env);
  }
  if (path === '/api/mgr-report/arrears') {
    var arrears = await kvGet(env, KEY.arrears);
    return json(arrears ? Object.assign({ ok: true }, arrears) : { ok: true, fetchedAt: null, source: 'ArrearsManagement/Search', srcRecords: 0, rows: [] }, request, env);
  }
  if (path === '/api/mgr-report/renewals') {
    var renewals = await kvGet(env, KEY.renewals);
    return json(renewals ? Object.assign({ ok: true }, renewals) : { ok: true, fetchedAt: null, n: 0, st: {}, rows: [] }, request, env);
  }
  if (path === '/api/mgr-report/match-extra') {
    var extra = await readExtra(env);
    return json({
      ok: true,
      fetchedAt: extra.meta && (extra.meta.fetchedAt || extra.meta.importedAt) || null,
      importedAt: extra.meta && extra.meta.importedAt || null,
      imported: !!(extra.meta && extra.meta.importedAt),
      n: extra.rows.length,
      rows: extra.rows
    }, request, env);
  }
  if (path === '/api/mgr-report/lookup') {
    return json({
      ok: true,
      pending: '待設定',
      owners: {},
      settlement: {},
      targets: [],
      forecast: { rows: [] }
    }, request, env);
  }
  return json({ ok: false, error: '找不到' }, request, env, 404);
}

async function statusPayload(env) {
  var meta = await kvGet(env, KEY.meta);
  var build = await kvGet(env, KEY.build);
  var staff = await kvGet(env, KEY.staff);
  var arrears = await kvGet(env, KEY.arrears);
  var renewals = await kvGet(env, KEY.renewals);
  var extra = await kvGet(env, KEY.extraMeta);
  var queue = (await kvGet(env, KEY.extraQueue)) || [];
  var day = (await kvGet(env, KEY.extraDay + taipei(new Date()).key)) || { queried: 0, stopped: false, reason: '' };
  return {
    ok: true,
    contracts: {
      fetchedAt: meta && meta.fetchedAt || null,
      n: meta && meta.n || 0,
      building: !!(build && build.phase && build.phase !== 'done'),
      phase: build && build.phase || null,
      fieldPresence: meta && meta.fieldPresence || null
    },
    staff: { fetchedAt: staff && staff.fetchedAt || null, n: staff && staff.hr && staff.hr.staff ? staff.hr.staff.length : 0, supervisorField: !!(staff && staff.supervisorField) },
    arrears: { fetchedAt: arrears && arrears.fetchedAt || null, n: arrears && arrears.rows ? arrears.rows.length : 0, source: 'ArrearsManagement/Search' },
    renewals: { fetchedAt: renewals && renewals.fetchedAt || null, n: renewals && renewals.n || 0 },
    matchExtra: {
      importedAt: extra && extra.importedAt || null,
      n: extra && extra.n || 0,
      queue: queue.length,
      queriedToday: day.queried || 0,
      stopped: !!day.stopped,
      reason: day.reason || ''
    },
    lookup: { pending: '待設定' }
  };
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (err) {
      console.log(JSON.stringify({ tag: 'mgr-report', phase: 'error', error: String(err && err.message || err) }));
      return json({ ok: false, error: '管報服務暫時失敗' }, request, env, 500);
    }
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async function () {
      try {
        var when = new Date(controller.scheduledTime || Date.now());
        var forceFlag = await kvGet(env, KEY.force);
        var result = await withLock(env, function () { return stepJob(env, when, !!forceFlag); });
        if (forceFlag) await kvDel(env, KEY.force);
        logPhase('cron', result || {});
      } catch (err) {
        var msg = String(err && err.message || err);
        var transient = /HTTP 502|HTTP 503|HTTP 504|ETIMEDOUT|fetch failed|network/i.test(msg);
        logPhase('cron', { done: false, error: msg, transient: transient });
      }
    })());
  }
};
