(() => {
  const NAV = ['案件管理','包租管理','政策戶管理','新件管理','續約管理','應收帳管理','業務績效表','證照檢核','開發管理','報修管理','社宅回饋管理'];
  const LEASE_TARGET_RATE = 0.5;
  const NEW_TARGET_RATE = 0.9;
  const RENEW_TARGET_RATE = 0.7;
  const RENEW_LEAD1_RATE = 0.8;
  const RENEW_LEAD2_RATE = 0.7;
  const NEW_CHILDREN = ['新媒合','新媒合-多元-直','新媒合-多元-間','新媒合-爬蟲','新媒合-客服-直','新媒合-客服-間','新媒合-寄居蟹轉銜案','新媒合-跨區派案-直','新媒合-跨區派案-間','新媒合-電銷-直','新媒合-電銷-間'];
  const CASE_LEAVES = ['代管轉包租','包租轉代管','到期再媒合', ...NEW_CHILDREN, '解約再媒合','續約'];
  const CITIES = ['基隆市','新北市','臺北市','桃園市','新竹市','新竹縣','宜蘭縣','臺中市','彰化縣','南投縣','嘉義市','嘉義縣','臺南市','高雄市'];
  const CITIES_NS = ['基隆市','臺北市','新北市','桃園市','新竹市','新竹縣','臺中市','彰化縣','南投縣','嘉義市','嘉義縣','臺南市','高雄市','宜蘭縣'];
  const PERIODS = ['2期','3期','3-1期','4期','4-1期','5期'];
  const REGIONS = {
    '雙北/基/宜': ['北一處','北二處','北三處','北四處','北五處','北六處','基一處','基二處','基三處','宜一處','宜二處','宜三處','蘆洲處'],
    '桃/竹/中/彰/投/嘉': ['桃一處','桃二處','桃三處','林口處','竹一處','竹二處','中一處','中三處','中二處','中四處','中五處','中六處','中七處','投一處','嘉一處','嘉二處','彰一處','彰二處'],
    '台南': ['南一處','南二處','南三處','南四處','南五處','南六處'],
    '高雄': ['高一處','高二處','高三處','高四處','高五處','高六處']
  };
  const CITY_REGIONS = [
    { id: '雙北/基/宜', cities: ['臺北市', '新北市', '基隆市', '宜蘭縣'] },
    { id: '桃/竹/中/彰/投/嘉', cities: ['桃園市', '新竹市', '新竹縣', '臺中市', '彰化縣', '南投縣', '嘉義市', '嘉義縣'] },
    { id: '台南', cities: ['臺南市'] },
    { id: '高雄', cities: ['高雄市'] }
  ];
  const SALES_OFFICES = Object.values(REGIONS).flat();
  const MULTI_OFFICES = ['多元-全居','多元-新北大管家','多元-合宜','多元-寓見','多元-都營','多元-紅租','多元開發部'];
  const BACK_OFFICES = ['財務會計部','人資部','總經理室','行銷企劃處','市調部','教育訓練部','星華整租','星耀'];
  const VALID_STATUS = new Set(['已生效','已生效(更換房東客)','更換房東房客','更換房東客(未送件)','更換房東客(審核中)','待產編','預審中','預審中已財調','預審中未財調','預審退件(預審中)','預審退件(預審中已財調)','預審退件(預審中未財調)','預審通過','複審中','複審退件(待產編)','複審退件(複審中)','複審退件(複審通過)','複審通過']);
  const PAGE = 40;
  const C_TARGET = '#1e3a8a';
  const C_ACTUAL = '#3b82f6';
  const C_YOY = '#22c55e';
  const LOOKUP = window.DASH_LOOKUP || { owners: {}, settlement: {}, targets: [] };
  const FORECAST_SKIP = new Set(['電服部', '業務支援管理部', '電銷部']);
  const FORECAST = (() => {
    const raw = window.DASH_FORECAST || { rows: [] };
    return Object.assign({}, raw, {
      rows: (raw.rows || []).filter(t => t && t.office && !FORECAST_SKIP.has(t.office))
    });
  })();

  const $ = id => document.getElementById(id);
  const toast = (msg, ms) => { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); setTimeout(() => t.classList.add('hidden'), ms || 2200); };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const judgeP = (label, body) => `<p><span class="judge-k">${esc(label)}：</span>${esc(String(body == null ? '' : body).replace(/\(/g, '（').replace(/\)/g, '）'))}</p>`;
  function setPieUnit(cardSel) {
    const el = document.querySelector(cardSel + ' .pie-foot');
    if (el) el.textContent = '';
  }
  const fmt = n => {
    const v = Math.round(Number(n) || 0);
    const sign = v < 0 ? '-' : '';
    return sign + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };
  const pad = n => String(n).padStart(2, '0');
  const rocToDate = s => {
    if (!s) return null;
    const p = String(s).split(/[/-]/).map(Number);
    if (p.length < 3) return null;
    return new Date(p[0] + 1911, p[1] - 1, p[2]);
  };
  const rocToDateFlex = s => {
    if (!s) return null;
    const p = String(s).split(/[/-]/).map(Number);
    if (p.length >= 3 && p[1] && p[2]) return new Date(p[0] + 1911, p[1] - 1, p[2]);
    if (p.length >= 2 && p[1]) return new Date(p[0] + 1911, p[1] - 1, 1);
    return null;
  };
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const slash = d => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  const showDate = s => { const d = rocToDate(s); return d ? slash(d) : (s || ''); };
  const pct = n => `${(Number(n) * 100).toFixed(2)}%`;
  const signedNum = n => {
    const v = Math.round(Number(n) || 0);
    return `${v > 0 ? '+' : ''}${fmt(v)}`;
  };
  const kpiNeg = n => {
    const v = Math.round(Number(n) || 0);
    return `<span class="${v < 0 ? 'neg' : ''}">${signedNum(v)}</span>`;
  };
  const signed = n => {
    const v = Math.round(Number(n) || 0);
    const cls = v > 0 ? 'up' : (v < 0 ? 'down' : '');
    return `<span class="delta ${cls}${v < 0 ? ' thin' : ''}">${signedNum(v)}</span>`;
  };
  const roc = d => `${d.getFullYear() - 1911}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const inRange = (d, a, b) => d && d >= a && d <= b;
  const normCity = s => String(s || '').replace(/台/g, '臺');
  function cityOfLease(r) {
    const raw = normCity(String((r && (r.addr || r.a)) || '').replace(/\s+/g, ''));
    const head = raw.slice(0, 3);
    if (CITIES.includes(head)) return head;
    const c = normCity(r && r.city);
    if (CITIES.includes(c)) return c;
    return '';
  }
  function citySet(rows) {
    return new Set((rows || []).map(cityOfLease).filter(c => CITIES.includes(c)));
  }
  function cityCount(rows) {
    return citySet(rows).size;
  }
  const monthStart = d => new Date(d.getFullYear(), d.getMonth(), 1);
  const monthEnd = d => new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
  const lastCompleteMonth = (today) => {
    const d = new Date(today.getFullYear(), today.getMonth(), 0);
    return { start: monthStart(d), end: d };
  };

  function taiwanNow() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const g = k => Number(parts.find(p => p.type === k).value);
    return new Date(g('year'), g('month') - 1, g('day'));
  }
  function currentMonthRange(base) {
    const d = base || taiwanNow();
    const stl = LOOKUP.settlement[`${d.getFullYear()}-${pad(d.getMonth() + 1)}`];
    const start = stl && stl.leaseStart ? parseIso(stl.leaseStart) : monthStart(d);
    const end = stl && stl.leaseEnd ? parseIso(stl.leaseEnd) : monthEnd(d);
    return { start, end };
  }
  const now = taiwanNow();
  const defaultMonth = currentMonthRange(now);
  const state = {
    nav: '案件管理',
    types: [...NEW_CHILDREN],
    offices: ['__ALL__'],
    cities: [...CITIES],
    periods: [...PERIODS],
    start: defaultMonth.start,
    end: defaultMonth.end,
    page: 1,
    trendGrain: 'month',
    cmpGrain: 'month',
    cmpSort: '',
    cmpTblSort: '',
    cmpTblDir: 'desc',
    cmpOpen: ['全公司'],
    typeGrain: 'month',
    typeFilter: '新媒合',
    typeOpen: ['全公司'],
    typeFocus: '全公司',
    typeStaffOpen: false,
    typeStaffSort: 'total',
    typeStaffDir: 'desc',
    typeTblSort: '',
    typeTblDir: 'desc',
    srcGrain: 'month',
    srcFilter: '全部',
    srcOpen: ['全公司', '__SEL__'],
    srcFocus: '全公司',
    srcStaffOpen: false,
    srcStaffSort: 'ref',
    srcStaffDir: 'desc',
    srcTblSort: '',
    srcTblDir: 'desc',
    houseGrain: 'month',
    houseFilter: '全部',
    houseOpen: ['全公司', '__SEL__'],
    houseFocus: '全公司',
    houseStaffOpen: false,
    houseStaffSort: 'total',
    houseStaffDir: 'desc',
    houseTblSort: '',
    houseTblDir: 'desc',
    revGrain: 'month',
    revFilter: '全部',
    revOpen: ['全公司', '__SEL__'],
    revFocus: '全公司',
    revStaffOpen: false,
    revStaffSort: 'done',
    revStaffDir: 'desc',
    revTblSort: '',
    revTblDir: 'desc',
    growGrain: 'month',
    growPick: 0,
    growStaffOpen: false,
    growStaffSort: 'total',
    growStaffDir: 'desc',
    growOpen: ['全公司'],
    growTblSort: '',
    growTblDir: 'desc',
    growFocus: '全公司',
    growMonthOpen: [],
    growHide: { 目標: false, 同期: false, 實績: false },
    cityGrowGrain: 'month',
    cityGrowPick: 0,
    cgStaffOpen: false,
    cityGrowStaffSort: 'total',
    cityGrowStaffDir: 'desc',
    cgStaffSort: 'total',
    cgStaffDir: 'desc',
    cityGrowOpen: ['全公司'],
    cityGrowTblSort: '',
    cityGrowTblDir: 'desc',
    cityGrowFocus: '全公司',
    cityGrowMonthOpen: [],
    cityGrowHide: { 同期: false, 實績: false },
    lzGrowGrain: 'month',
    lzGrowPick: 0,
    lzGrowStaffOpen: false,
    lzGrowStaffSort: 'total',
    lzGrowStaffDir: 'desc',
    lzGrowTblSort: '',
    lzGrowTblDir: 'desc',
    lzGrowOpen: ['全公司'],
    lzGrowFocus: '全公司',
    lzGrowMonthOpen: [],
    lzGrowHide: { 目標: false, 同期: false, 實績: false },
    wkGrowGrain: 'month',
    wkGrowPick: 0,
    wkGrowStaffOpen: false,
    wkGrowStaffSort: 'total',
    wkGrowStaffDir: 'desc',
    wkGrowTblSort: '',
    wkGrowTblDir: 'desc',
    wkGrowOpen: ['全公司'],
    wkGrowFocus: '全公司',
    wkGrowMonthOpen: [],
    wkGrowHide: { 目標: false, 同期: false, 實績: false },
    nwGrowGrain: 'month',
    nwGrowPick: 0,
    nwGrowStaffOpen: false,
    nwGrowStaffSort: 'total',
    nwGrowStaffDir: 'desc',
    nwGrowTblSort: '',
    nwGrowTblDir: 'desc',
    nwGrowOpen: ['全公司'],
    nwGrowFocus: '全公司',
    nwGrowMonthOpen: [],
    nwGrowHide: { 目標: false, 同期: false, 實績: false },
    lzCgGrain: 'month', lzCgPick: 0, lzCgStaffOpen: false, lzCgStaffSort: 'total', lzCgStaffDir: 'desc',
    lzCgTblSort: '', lzCgTblDir: 'desc', lzCgOpen: ['全公司'], lzCgFocus: '全公司', lzCgMonthOpen: [], lzCgHide: { 同期: false, 實績: false },
    wkCgGrain: 'month', wkCgPick: 0, wkCgStaffOpen: false, wkCgStaffSort: 'total', wkCgStaffDir: 'desc',
    wkCgTblSort: '', wkCgTblDir: 'desc', wkCgOpen: ['全公司'], wkCgFocus: '全公司', wkCgMonthOpen: [], wkCgHide: { 同期: false, 實績: false },
    nwCgGrain: 'month', nwCgPick: 0, nwCgStaffOpen: false, nwCgStaffSort: 'total', nwCgStaffDir: 'desc',
    nwCgTblSort: '', nwCgTblDir: 'desc', nwCgOpen: ['全公司'], nwCgFocus: '全公司', nwCgMonthOpen: [], nwCgHide: { 同期: false, 實績: false },
    fcstGrain: 'week',
    fcstFocus: '營業部',
    fcstOpen: ['營業部'],
    fcstHide: { 目標: false, 同期: false, 實績: false },
    fcstTblSort: '',
    fcstTblDir: 'desc',
    fcstStaffOpen: false,
    fcstStaffSort: 'total',
    fcstStaffDir: 'desc',
    crabGrain: 'month',
    crabPick: 0,
    crabStaffOpen: false,
    crabStaffSort: 'total',
    crabStaffDir: 'desc',
    crabOpen: ['全公司'],
    crabFocus: '全公司',
    crabMonthOpen: [],
    staffCase: null,
    caseSortKey: 'ls',
    caseSortDir: 'desc',
    salesNatGrain: 'month',
    natBand: 'all',
    natTblSort: 'n',
    natTblDir: 'desc',
    natPerson: null,
    natOffice: null,
    perfQ: '',
    lzTrendGrain: 'month',
    lzCmpGrain: 'month',
    lzCmpSort: '',
    lzCmpDir: 'desc',
    lzCmpOpen: ['全公司'],
    lzCmpFocus: '',
    lzTypeGrain: 'month',
    lzTypeOpen: ['全公司'],
    lzTypeFocus: '全公司',
    lzTypeTblSort: '',
    lzTypeTblDir: 'desc',
    lzTypeStaffOpen: false,
    lzTypeStaffSort: 'total',
    lzTypeStaffDir: 'desc',
    lzRevGrain: 'month',
    lzRevOpen: ['全公司'],
    lzRevFocus: '全公司',
    lzRevTblSort: '',
    lzRevTblDir: 'desc',
    lzRevStaffOpen: false,
    lzRevStaffSort: 'done',
    lzRevStaffDir: 'desc',
    wkTrendGrain: 'month',
    wkCmpGrain: 'month',
    wkCmpSort: '',
    wkCmpDir: 'desc',
    wkCmpOpen: ['全公司'],
    wkCmpFocus: '',
    wkTypeGrain: 'month',
    wkTypeOpen: ['全公司'],
    wkTypeFocus: '全公司',
    wkTypeTblSort: '',
    wkTypeTblDir: 'desc',
    wkTypeStaffOpen: false,
    wkTypeStaffSort: 'total',
    wkTypeStaffDir: 'desc',
    wkRevGrain: 'month',
    wkRevOpen: ['全公司'],
    wkRevFocus: '全公司',
    wkRevTblSort: '',
    wkRevTblDir: 'desc',
    wkRevStaffOpen: false,
    wkRevStaffSort: 'done',
    wkRevStaffDir: 'desc',
    nwTrendGrain: 'month',
    nwCmpGrain: 'month',
    nwCmpSort: '',
    nwCmpDir: 'desc',
    nwCmpOpen: ['全公司'],
    nwCmpFocus: '',
    nwTypeGrain: 'month',
    nwTypeOpen: ['全公司'],
    nwTypeFocus: '全公司',
    nwTypeTblSort: '',
    nwTypeTblDir: 'desc',
    nwTypeStaffOpen: false,
    nwTypeStaffSort: 'total',
    nwTypeStaffDir: 'desc',
    nwRevGrain: 'month',
    nwRevOpen: ['全公司'],
    nwRevFocus: '全公司',
    nwRevTblSort: '',
    nwRevTblDir: 'desc',
    nwRevStaffOpen: false,
    nwRevStaffSort: 'done',
    nwRevStaffDir: 'desc',
    arCt: 'all',
    arAgeOpen: ['全公司'],
    arAgeFocus: '全公司',
    arAgeTblSort: '',
    arAgeTblDir: 'desc',
    arStOpen: ['全公司'],
    arStFocus: '全公司',
    arStTblSort: '',
    arStTblDir: 'desc',
    arStaffOpen: false,
    arStaffSort: 'amt',
    arStaffDir: 'desc',
    arDebtorTblSort: 'amt',
    arDebtorTblDir: 'desc',
    arAgentSort: 'amt',
    arAgentDir: 'desc',
    rnGrowGrain: 'month',
    rnGrowPick: 0,
    rnGrowStaffOpen: false,
    rnGrowStaffSort: 'due',
    rnGrowStaffDir: 'desc',
    rnGrowHide: { 目標: false, 實績: false, 同期: false },
    rnGrowMetric: 'month',
    rnGrowOpen: ['全公司'],
    rnGrowFocus: '全公司',
    rnGrowMonthOpen: [],
    rnGrowTblSort: '',
    rnGrowTblDir: 'desc',
    rnTrendGrain: 'month',
    rnTrendMetric: 'month',
    rnCmpGrain: 'month',
    rnCmpSort: '',
    rnCmpDir: 'desc',
    rnCmpOpen: ['全公司'],
    rnCmpFocus: ''
  };
  const draft = {};
  let charts = {};
  const staffPeople = { rev: [], src: [], house: [], type: [], crab: [], grow: [], cg: [], fcst: [], lzGrow: [], wkGrow: [], nwGrow: [], lzCg: [], wkCg: [], nwCg: [], nat: [], lzType: [], lzRev: [], wkType: [], wkRev: [], nwType: [], nwRev: [], ar: [], rnGrow: [] };
  const ROWS = window.CONTRACTS || [];
  for (let i = 0; i < ROWS.length; i++) {
    const r = ROWS[i];
    const d = rocToDate(r.ls);
    r._lsT = d ? d.getTime() : NaN;
  }
  let rowPool = { sig: '', map: Object.create(null) };
  const dashPaint = { lease: '', weak: '', new: '', renew: '' };
  let dashJob = 0;
  function filterSig() {
    const off = selectedOffices();
    return [
      (state.types || []).join('\0'),
      isNewMatchAllSelected() ? '1' : '0',
      off ? [...off].join('\0') : '*',
      state.cities.length === CITIES.length ? '*' : (state.cities || []).join('\0'),
      state.periods.length === PERIODS.length ? '*' : (state.periods || []).join('\0')
    ].join('|');
  }
  function cachedPool(key, build) {
    const sig = filterSig();
    if (rowPool.sig !== sig) rowPool = { sig, map: Object.create(null) };
    if (!rowPool.map[key]) rowPool.map[key] = build();
    return rowPool.map[key];
  }
  function sliceByRange(list, start, end, offices) {
    const a = start.getTime(), b = end.getTime();
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (offices && !offices.has(r.so)) continue;
      const t = r._lsT;
      if (t === t && t >= a && t <= b) out.push(r);
    }
    return out;
  }
  function clearDashCache() {
    rowPool = { sig: '', map: Object.create(null) };
    dashPaint.lease = dashPaint.weak = dashPaint.new = dashPaint.renew = '';
  }
  const STAFF = (window.STAFF_META && window.STAFF_META.staff) || [];
  const STAFF_HR = (window.STAFF_HR && window.STAFF_HR.staff) || [];
  const STAFF_HR_BY_ID = new Map(STAFF_HR.map(s => [s.id, s]));
  const STAFF_HR_BY_NAME = new Map();
  STAFF_HR.forEach(s => {
    STAFF_HR_BY_NAME.set(s.name, s);
    if (s.officeName) STAFF_HR_BY_NAME.set(s.name + '\t' + s.officeName, s);
  });
  const ARREARS = (window.ARREARS && window.ARREARS.rows) || [];
  const AR_AGE = [
    { id: 'b17', lab: '1-7天', lo: 0, hi: 7 },
    { id: 'b814', lab: '8-14天', lo: 8, hi: 14 },
    { id: 'b1529', lab: '15-29天', lo: 15, hi: 29 },
    { id: 'b30', lab: '30天以上', lo: 30, hi: null }
  ];
  const AR_STATUS = [
    { id: 'paid', lab: '已繳款' },
    { id: 'open', lab: '未處理完成未繳款' },
    { id: 'legal', lab: '預計送法務部' }
  ];
  function arAgeBand(days) {
    const d = Number(days) || 0;
    if (d <= 7) return 'b17';
    if (d <= 14) return 'b814';
    if (d <= 29) return 'b1529';
    return 'b30';
  }
  function arStatusOf(r) {
    const amt = Number(r.amt) || 0;
    if (amt <= 0) return 'paid';
    if ((Number(r.days) || 0) >= 30) return 'legal';
    return 'open';
  }
  function arMoney(n, amt) {
    return `${fmt(n)}筆／$${fmt(amt)}`;
  }
  const MATCH_EXTRA = (window.MATCH_EXTRA && window.MATCH_EXTRA.rows) || [];
  const MATCH_EXTRA_BY_ID = new Map(MATCH_EXTRA.map(x => [x.id, x]));
  const MATCH_EXTRA_BY_N = new Map();
  MATCH_EXTRA.forEach(x => { if (x.n) MATCH_EXTRA_BY_N.set(x.n, x); });
  const ID_CLASS = window.ID_CLASS || {};
  const NL_CLASS = window.NL_CLASS || {};
  const RENEWALS = (window.RENEWALS && window.RENEWALS.rows) || [];

  function ymKey(y, m) { return `${y}-${pad(m)}`; }
  function parseIso(s) {
    if (!s) return null;
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function settleOf(y, m) { return LOOKUP.settlement[ymKey(y, m)] || null; }
  function monthsInRange(start, end) {
    const out = [];
    let y = start.getFullYear(), m = start.getMonth() + 1;
    const ey = end.getFullYear(), em = end.getMonth() + 1;
    while (y < ey || (y === ey && m <= em)) {
      out.push({ year: y, month: m });
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    return out;
  }
  function officeMonthTarget(office, year, month) {
    const row = (LOOKUP.targets || []).find(t => t.office === office && Number(t.year) === year);
    if (!row || !row.months) return 0;
    return Number(row.months[month] || row.months[String(month)] || 0);
  }
  function officeMonthFcst(office, year, month) {
    const row = (FORECAST.rows || []).find(t => t.office === office && Number(t.year) === year);
    if (!row || !row.months) return 0;
    return Number(row.months[month] || row.months[String(month)] || 0);
  }
  function sumFcst(officeSet, year, month) {
    const offices = officeSet
      ? [...officeSet]
      : [...new Set((FORECAST.rows || []).map(t => t.office))];
    return offices.reduce((s, o) => s + officeMonthFcst(o, year, month), 0);
  }
  function sumTargets(officeSet, start, end) {
    const months = monthsInRange(start, end);
    const offices = officeSet
      ? [...officeSet]
      : [...new Set((LOOKUP.targets || []).map(t => t.office))];
    let sum = 0;
    offices.forEach(o => months.forEach(mo => { sum += officeMonthTarget(o, mo.year, mo.month); }));
    return sum;
  }
  function splitNames(s) {
    return String(s || '').split('/').map(x => x.trim()).filter(Boolean);
  }
  function ownerLabel(unit) {
    const n = LOOKUP.owners && LOOKUP.owners[unit];
    return n || '—';
  }
  function displayOwner(id, name) {
    if (id === '__SEL__') return '';
    const v = LOOKUP.owners[id] || LOOKUP.owners[name] || ownerName(unitOfficeSet(id), name);
    if (!v || v === '—') return '';
    return String(v).replace(/\s*\/\s*/g, ' ／ ');
  }
  function unitCellHtml(node, depth, togHtml) {
    const ow = displayOwner(node.id, node.name);
    return `<td class="unit-cell" style="padding-left:${6 + depth * 14}px">${togHtml}<span class="unit-stack"><span class="unit-nm">${esc(node.name)}</span>${ow ? `<span class="unit-ow">${esc(ow)}</span>` : ''}</span></td>`;
  }

  const officeParent = {};
  Object.entries(REGIONS).forEach(([r, arr]) => arr.forEach(o => officeParent[o] = { bu: '營業部', region: r }));
  ['業務支援管理部'].forEach(o => officeParent[o] = { bu: '業務支援管理部', region: '' });
  ['電服部'].forEach(o => officeParent[o] = { bu: '電服部', region: '' });
  MULTI_OFFICES.forEach(o => officeParent[o] = { bu: '多元開發部(全)', region: o === '多元-全居' ? '多元-全居' : '多元' });
  BACK_OFFICES.forEach(o => officeParent[o] = { bu: '後勤', region: '' });

  let _officesMemo = { key: null, set: null };
  function selectedOffices() {
    const key = (state.offices || []).join('\0');
    if (_officesMemo.key === key) return _officesMemo.set;
    let set = null;
    if (!state.offices.includes('__ALL__')) {
      set = new Set();
      state.offices.forEach(id => {
        if (id === '營業部') SALES_OFFICES.forEach(o => set.add(o));
        else if (REGIONS[id]) REGIONS[id].forEach(o => set.add(o));
        else if (id === '多元開發部(全)') MULTI_OFFICES.forEach(o => set.add(o));
        else if (id === '多元-全居') set.add('多元-全居');
        else if (id === '多元') MULTI_OFFICES.filter(o => o !== '多元-全居').forEach(o => set.add(o));
        else if (id === '後勤') BACK_OFFICES.forEach(o => set.add(o));
        else set.add(id);
      });
    }
    _officesMemo = { key, set };
    return set;
  }

  function isNewMatchFt(ft) {
    return String(ft || '').includes('新媒合');
  }
  function isNewMatchAllSelected() {
    const t = state.types || [];
    return t.length === NEW_CHILDREN.length && NEW_CHILDREN.every(x => t.includes(x));
  }
  function passFilters(r, opts = {}) {
    const offices = selectedOffices();
    if (offices && !offices.has(r.so)) return false;
    if (state.cities.length !== CITIES.length && !state.cities.includes(normCity(r.city))) return false;
    if (state.periods.length !== PERIODS.length && !state.periods.includes(r.p)) return false;
    if (!opts.ignoreType) {
      if (isNewMatchAllSelected()) {
        if (!isNewMatchFt(r.ft)) return false;
      } else if (!state.types.includes(r.ft)) return false;
    }
    return true;
  }

  function isPerf(r) {
    if (r.ct === '轉租') return false;
    return /已生效|已到期|已解約|審|產編/.test(r.st || '');
  }
  function isCyclePerf(r) {
    const st = String(r.st || '');
    if (/已停用|暫存/.test(st)) return false;
    return /已生效|已到期|已解約|審|產編/.test(st);
  }
  function submitDateOf(r) {
    const extra = r && r.id != null ? MATCH_EXTRA_BY_ID.get(r.id) : null;
    return rocToDate((r && r.ad) || (extra && extra.ad) || (r && (r.sd || r.submitDate)) || '');
  }
  function isLeaseCt(r) {
    return String(r.ct || '').includes('包租');
  }
  function isMgmtCt(r) {
    return String(r.ct || '').includes('代管');
  }
  function isSubletCt(r) {
    return String(r.ct || '').includes('轉租');
  }
  function isPolicyCt(r) {
    return isSubletCt(r) || isMgmtCt(r);
  }
  function isPolicyPerf(r) {
    if (!isPolicyCt(r)) return false;
    return /已生效|已到期|已解約|審|產編/.test(r.st || '');
  }
  function isThreeYearTerm(r) {
    const ls = rocToDate(r.ls), le = rocToDate(r.le);
    if (!ls || !le) return false;
    const months = (le.getFullYear() - ls.getFullYear()) * 12 + (le.getMonth() - ls.getMonth()) - (le.getDate() < ls.getDate() ? 1 : 0);
    return months >= 35 && months <= 37;
  }
  function leaseShare(rows) {
    const list = rows || [];
    let n = 0, lease = 0, mgmt = 0;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      n++;
      if (isLeaseCt(r)) lease++;
      if (isMgmtCt(r)) mgmt++;
    }
    return { n, lease, mgmt, rate: n ? lease / n : 0 };
  }
  function isWeak1(r) { return /第一類/.test(identityOf(r)); }
  function isWeak2(r) { return /第二類/.test(identityOf(r)); }
  function weakShare(rows) {
    const list = rows || [];
    let w1 = 0, w2 = 0;
    list.forEach(r => {
      if (isWeak1(r)) w1 += 1;
      else if (isWeak2(r)) w2 += 1;
    });
    const n = list.length, lease = w1 + w2;
    return { n, lease, mgmt: n - lease, w1, w2, rate: n ? lease / n : 0 };
  }
  function isNewCaseCt(r) {
    return isSubletCt(r) || isMgmtCt(r);
  }
  function isNewCaseSt(r) {
    const st = String(r.st || '');
    if (/已停用|暫存/.test(st)) return false;
    return /已生效|已到期|已解約|審|產編/.test(st);
  }
  function isNewCasePerf(r) {
    return isNewCaseCt(r) && isNewCaseSt(r);
  }
  function isFreshNew(r) {
    return newLeaseFlag(r) === true;
  }
  function newShare(rows) {
    const list = rows || [];
    let n = 0, lease = 0;
    for (let i = 0; i < list.length; i++) {
      n++;
      if (isFreshNew(list[i])) lease++;
    }
    return { n, lease, mgmt: n - lease, rate: n ? lease / n : 0 };
  }
  function dashKind(kind) {
    if (kind === 'weak') return 'weak';
    if (kind === 'new') return 'new';
    return 'lease';
  }
  function dashPrefix(kind) {
    kind = dashKind(kind);
    if (kind === 'weak') return 'wk';
    if (kind === 'new') return 'nw';
    return 'lz';
  }
  function dashPage(kind) {
    kind = dashKind(kind);
    if (kind === 'weak') return 'page-weak';
    if (kind === 'new') return 'page-new';
    return 'page-lease';
  }
  function dashTarget(kind) {
    return dashKind(kind) === 'new' ? NEW_TARGET_RATE : LEASE_TARGET_RATE;
  }
  function dashTgtPct(kind) {
    return (dashTarget(kind) * 100).toFixed(1) + '%';
  }
  function dashTgtLabel(kind) {
    return Math.round(dashTarget(kind) * 100) + '%';
  }
  function $d(kind, id) { return $(dashPrefix(kind) + id); }
  function dashShare(rows, kind) {
    kind = dashKind(kind);
    if (kind === 'weak') return weakShare(rows);
    if (kind === 'new') return newShare(rows);
    return leaseShare(rows);
  }
  function dashLab(kind) {
    kind = dashKind(kind);
    if (kind === 'weak') {
      return {
        piece: '政策戶件', gen: '一般戶', rate: '政策戶比率',
        peer: '同期政策戶比率', last: '上月政策戶比率',
        typeAna: '政策戶案件類型分析', revAna: '政策戶案件進度分析',
        map: '營業據點全台政策戶比率', rank: '單位政策戶比率排行榜',
        cmp: '單位政策戶比較表', month: '政策戶比較表', trend: '政策戶比率趨勢圖',
        sec: '政策戶', tgt: '政策戶目標(%)', act: '政策戶實績(%)',
        yoyR: '同期政策戶比率', lastR: '上月政策戶比率',
        yoyH: '同期政策戶%', lastH: '上月政策戶%',
        only: '僅計政策戶', typeFilter: '政策戶',
        note: '政策戶比率＝（轉租＋代管中第一類＋第二類）／（轉租＋代管）；包租未轉租不列入；未設定歸一般戶。'
      };
    }
    if (kind === 'new') {
      return {
        piece: '新件', gen: '續約件', rate: '新件比率',
        peer: '同期新件比率', last: '上月新件比率',
        typeAna: '新件案件類型分析', revAna: '新件案件進度分析',
        map: '營業據點全台新件比率', rank: '單位新件比率排行榜',
        cmp: '單位新件比較表', month: '新件比較表', trend: '新件比率趨勢圖',
        sec: '新件', tgt: '新件目標(%)', act: '新件實績(%)',
        yoyR: '同期新件比率', lastR: '上月新件比率',
        yoyH: '同期新件%', lastH: '上月新件%',
        only: '僅計新件', typeFilter: '新件',
        note: '新件比率＝轉租與代管中是否帶租約為新件／轉租與代管總簽約件；包租未列入。狀態剔除已停用、暫存。新件＝是否帶租約選新件。'
      };
    }
    return {
      piece: '包租件', gen: '代管件', rate: '包租率',
      peer: '同期包租率', last: '上月包租率',
      typeAna: '包租案件類型分析', revAna: '包租案件進度分析',
      map: '營業據點全台包租率', rank: '單位包租率排行榜',
      cmp: '單位包租比較表', month: '包租比較表', trend: '包租率趨勢圖',
      sec: '包租', tgt: '包租目標(%)', act: '包租實績(%)',
      yoyR: '同期包租率', lastR: '上月包租率',
      yoyH: '同期包租%', lastH: '上月包租%',
      only: '僅計包租', typeFilter: '包租',
      note: '包租率＝包租件／所選案件類型；目標%固定 50%。簽三年代管＝代管且租期約三年。'
    };
  }
  function leaseNewRows(start, end, offices, kind) {
    kind = dashKind(kind);
    const pool = cachedPool('lease:' + kind, () => {
      const pred = kind === 'weak' ? isPolicyPerf : kind === 'new' ? isNewCasePerf : isPerf;
      return uniqueById(ROWS.filter(r => passFilters(r) && pred(r)));
    });
    return sliceByRange(pool, start, end, offices);
  }
  function leaseTypeShort() {
    const lab = ddLabel('type');
    if (lab === '新媒合(全)') return '新媒合';
    if (lab === '全部案件類型') return '';
    if (lab.startsWith('已選')) return lab;
    return lab;
  }
  function leaseTypeFull() {
    return ddLabel('type');
  }
  function rateTxt(n, d, digits) {
    if (!d) return (0).toFixed(digits == null ? 1 : digits) + '%';
    return ((n / d) * 100).toFixed(digits == null ? 1 : digits) + '%';
  }
  function isValidLease(r, start, end) {
    if (r.ct === '轉租') return false;
    if (!VALID_STATUS.has(r.st)) return false;
    const ls = rocToDate(r.ls), le = rocToDate(r.le);
    if (!ls || !le) return false;
    return ls <= end && le >= start;
  }

  function startIn(r, start, end) {
    let t = r._lsT;
    if (t === undefined) {
      const d = rocToDate(r.ls);
      t = r._lsT = d ? d.getTime() : NaN;
    }
    return t === t && t >= start.getTime() && t <= end.getTime();
  }

  function uniqueById(list) {
    const m = new Map();
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (!m.has(r.id)) m.set(r.id, r);
    }
    return [...m.values()];
  }
  function leaseAddrKey(r) {
    const a = normCity(String(r.addr || r.a || '').replace(/\s+/g, ''));
    return a || ('id:' + (r.id == null ? '' : r.id));
  }
  function cycleCtRank(r) {
    const ct = String(r.ct || '');
    if (ct.includes('轉租')) return 3;
    if (ct.includes('代管')) return 2;
    if (ct.includes('包租')) return 1;
    return 0;
  }
  function uniqueByLeaseAddr(list) {
    const m = new Map();
    list.forEach(r => {
      const k = leaseAddrKey(r);
      const prev = m.get(k);
      if (!prev) { m.set(k, r); return; }
      const d = cycleCtRank(r) - cycleCtRank(prev);
      if (d > 0) m.set(k, r);
      else if (d === 0 && submitDateOf(r) && !submitDateOf(prev)) m.set(k, r);
    });
    return [...m.values()];
  }

  function uniqueUnits(list) {
    const m = new Map();
    list.forEach(r => {
      const key = r.addr || ('id:' + r.id);
      if (!m.has(key)) m.set(key, r);
    });
    return m.size;
  }

  function perfRows(start, end) {
    const pool = cachedPool('perf', () => uniqueById(ROWS.filter(r => passFilters(r) && isPerf(r))));
    return sliceByRange(pool, start, end, null);
  }

  function salesOfficeSet(rows) {
    return new Set((rows || []).map(r => r.so).filter(o => SALES_OFFICES.includes(o)));
  }
  function salesOfficeCount(rows) {
    return salesOfficeSet(rows).size;
  }

  function ownerName(scopeOffices, regionName) {
    if (regionName === '營業部') return ownerLabel('營業部');
    if (regionName && LOOKUP.owners[regionName]) return LOOKUP.owners[regionName];
    if (!scopeOffices || !scopeOffices.size) return ownerLabel('全公司');
    if (scopeOffices.size === 1) return ownerLabel([...scopeOffices][0]);
    const first = [...scopeOffices][0];
    const p = officeParent[first];
    if (p && LOOKUP.owners[p.region]) return LOOKUP.owners[p.region];
    if (p && LOOKUP.owners[p.bu]) return LOOKUP.owners[p.bu];
    return '—';
  }
  function ownerNamesForSelection() {
    const names = new Set();
    const add = v => splitNames(v).forEach(n => names.add(n));
    const offices = selectedOffices();
    if (!offices) {
      Object.values(LOOKUP.owners || {}).forEach(add);
      return names;
    }
    offices.forEach(id => {
      add(LOOKUP.owners[id]);
      const p = officeParent[id];
      if (p) { add(LOOKUP.owners[p.region]); add(LOOKUP.owners[p.bu]); }
    });
    state.offices.forEach(id => add(LOOKUP.owners[id]));
    return names;
  }

  function ddLabel(kind) {
    if (kind === 'type') {
      if (state.types.length === CASE_LEAVES.length) return '全部案件類型';
      const onlyNewAll = NEW_CHILDREN.every(x => state.types.includes(x)) && state.types.length === NEW_CHILDREN.length;
      if (onlyNewAll) return '新媒合(全)';
      if (state.types.length === 1) return state.types[0];
      return `已選${state.types.length}個類型`;
    }
    if (kind === 'office') {
      if (state.offices.includes('__ALL__')) return '全公司';
      if (state.offices.length === 1) return state.offices[0];
      return `已選${state.offices.length}個單位`;
    }
    if (kind === 'city') {
      if (state.cities.length === CITIES.length) return '全部縣市';
      if (state.cities.length === 1) return state.cities[0];
      return `已選${state.cities.length}個縣市`;
    }
    if (kind === 'period') {
      if (state.periods.length === PERIODS.length) return '全期';
      if (state.periods.length === 1) return state.periods[0];
      return `已選${state.periods.length}個期別`;
    }
    return `${slash(state.start)} 至 ${slash(state.end)}`;
  }
  function showTarget() {
    return (state.types || []).some(t => String(t).includes('新媒合'));
  }
  function scopeNote() {
    return `資料依勾選的案件類型（${ddLabel('type')}）、營業區／處（${ddLabel('office')}）統計。`;
  }
  function typeFilterNote() {
    return `案件類型：${ddLabel('type')}`;
  }

  function closePanels() {
    document.querySelectorAll('.dd-panel').forEach(p => p.remove());
  }
  function attachPanel(btn, panel) {
    panel.addEventListener('mousedown', e => e.stopPropagation());
    panel.addEventListener('click', e => e.stopPropagation());
    btn.parentElement.appendChild(panel);
  }
  function bindDocClose() {
    if (bindDocClose.ok) return;
    bindDocClose.ok = true;
    document.addEventListener('mousedown', e => {
      if (!e.target || typeof e.target.closest !== 'function') return;
      if (e.target.closest('.dd') || e.target.closest('.dd-panel')) return;
      closePanels();
    });
  }

  function treeCheck(id, checked, getKids, selected) {
    const kids = getKids(id) || [];
    if (!kids.length) {
      if (checked) selected.add(id); else selected.delete(id);
      return;
    }
    kids.forEach(k => treeCheck(k, checked, getKids, selected));
  }

  function makeCheck(checked, indeterminate) {
    const i = document.createElement('input');
    i.type = 'checkbox';
    i.checked = checked;
    i.indeterminate = !!indeterminate;
    return i;
  }

  function openTypePanel(btn) {
    const selected = new Set(draft.types || state.types);
    const panel = document.createElement('div');
    panel.className = 'dd-panel';
    const render = () => {
      panel.innerHTML = '';
      const addLeaf = (name, indent) => {
        const row = document.createElement('div');
        row.className = 'tree-row ' + (indent ? 'indent-1' : '');
        const ck = makeCheck(selected.has(name));
        ck.onchange = () => { if (ck.checked) selected.add(name); else selected.delete(name); render(); };
        row.append(ck, document.createTextNode(name));
        panel.appendChild(row);
      };
      const allNew = NEW_CHILDREN.every(x => selected.has(x));
      const someNew = NEW_CHILDREN.some(x => selected.has(x));
      const group = document.createElement('div');
      group.className = 'tree-row';
      const arrow = document.createElement('button');
      arrow.className = 'arrow';
      arrow.dataset.open = panel.dataset.open || '1';
      arrow.textContent = arrow.dataset.open === '1' ? '▾' : '▸';
      const gck = makeCheck(allNew, someNew && !allNew);
      gck.onchange = () => { NEW_CHILDREN.forEach(x => gck.checked ? selected.add(x) : selected.delete(x)); render(); };
      arrow.onclick = e => { e.preventDefault(); panel.dataset.open = arrow.dataset.open === '1' ? '0' : '1'; render(); };
      group.append(arrow, gck, document.createTextNode('新媒合(全)'));
      panel.appendChild(group);
      if ((panel.dataset.open || '1') === '1') NEW_CHILDREN.forEach(n => addLeaf(n, true));
      ['代管轉包租','包租轉代管','到期再媒合','解約再媒合','續約'].forEach(n => addLeaf(n, false));
      actions(panel, () => { NEW_CHILDREN.concat(['代管轉包租','包租轉代管','到期再媒合','解約再媒合','續約']).forEach(x => selected.add(x)); render(); },
        () => { selected.clear(); render(); },
        () => { closePanels(); },
        () => {
          if (!selected.size) return toast('請至少選擇一個案件類型');
          state.types = [...selected];
          closePanels(); refreshFilterBtns();
        });
    };
    attachPanel(btn, panel);
    render();
  }

  function officeNodes() {
    return [
      { id: '__ALL__', name: '全公司', kids: ['營業部','業務支援管理部','電服部','多元開發部(全)','後勤'] },
      { id: '營業部', name: '營業部', kids: Object.keys(REGIONS) },
      ...Object.entries(REGIONS).map(([r, arr]) => ({ id: r, name: r, kids: arr })),
      ...SALES_OFFICES.map(o => ({ id: o, name: o, kids: [] })),
      { id: '業務支援管理部', name: '業務支援管理部', kids: [] },
      { id: '電服部', name: '電服部', kids: [] },
      { id: '多元開發部(全)', name: '多元開發部(全)', kids: ['多元-全居','多元'] },
      { id: '多元-全居', name: '多元-全居', kids: [] },
      { id: '多元', name: '多元', kids: [] },
      { id: '後勤', name: '後勤', kids: [] }
    ];
  }

  function collectLeaves(id, map) {
    const n = map.get(id);
    if (!n || !n.kids.length) return [id];
    return n.kids.flatMap(k => collectLeaves(k, map));
  }

  function openOfficePanel(btn) {
    const nodes = officeNodes();
    const map = new Map(nodes.map(n => [n.id, n]));
    const selected = new Set(draft.offices || state.offices);
    const open = new Set(['__ALL__','營業部','多元開發部(全)']);
    const panel = document.createElement('div');
    panel.className = 'dd-panel wide';
    const leavesOf = id => collectLeaves(id, map).filter(x => x !== id || !map.get(x).kids.length);
    const render = () => {
      panel.innerHTML = '';
      const walk = (id, depth) => {
        const n = map.get(id); if (!n) return;
        const leaves = leavesOf(id);
        const hit = leaves.filter(x => selected.has(x) || selected.has(id) || (selected.has('__ALL__') && id !== '__ALL__'));
        const all = selected.has('__ALL__') || selected.has(id) || (leaves.length && leaves.every(x => selected.has(x)));
        const some = !all && (selected.has(id) || leaves.some(x => selected.has(x)));
        const row = document.createElement('div');
        row.className = 'tree-row indent-' + Math.min(depth, 3);
        const hasKids = n.kids.length > 0;
        const arrow = document.createElement('button');
        arrow.className = 'arrow';
        arrow.textContent = hasKids ? (open.has(id) ? '▾' : '▸') : '';
        if (hasKids) arrow.onclick = e => { e.preventDefault(); open.has(id) ? open.delete(id) : open.add(id); render(); };
        const ck = makeCheck(all, some);
        ck.onchange = () => {
          if (id === '__ALL__') {
            selected.clear();
            if (ck.checked) selected.add('__ALL__');
          } else {
            selected.delete('__ALL__');
            const ls = leavesOf(id);
            if (ck.checked) ls.forEach(x => selected.add(x));
            else ls.forEach(x => selected.delete(x));
          }
          render();
        };
        row.append(arrow, ck, document.createTextNode(n.name));
        panel.appendChild(row);
        if (hasKids && open.has(id)) n.kids.forEach(k => walk(k, depth + 1));
      };
      walk('__ALL__', 0);
      actions(panel, () => { selected.clear(); selected.add('__ALL__'); render(); },
        () => { selected.clear(); render(); },
        () => closePanels(),
        () => {
          if (!selected.size) return toast('請至少選擇一個營業區/營業處');
          state.offices = [...selected];
          closePanels(); refreshFilterBtns();
        });
    };
    attachPanel(btn, panel);
    render();
  }

  function openFlatPanel(btn, items, key, emptyMsg, allLabelFn) {
    const selected = new Set(draft[key] || state[key]);
    const panel = document.createElement('div');
    panel.className = 'dd-panel';
    const render = () => {
      panel.innerHTML = '';
      items.forEach(name => {
        const row = document.createElement('div');
        row.className = 'tree-row';
        const ck = makeCheck(selected.has(name));
        ck.onchange = () => { if (ck.checked) selected.add(name); else selected.delete(name); render(); };
        row.append(ck, document.createTextNode(name));
        panel.appendChild(row);
      });
      actions(panel, () => { items.forEach(x => selected.add(x)); render(); },
        () => { selected.clear(); render(); },
        () => closePanels(),
        () => {
          if (!selected.size) return toast(emptyMsg);
          state[key] = items.filter(x => selected.has(x));
          closePanels(); refreshFilterBtns();
        });
    };
    attachPanel(btn, panel);
    render();
  }

  function openDatePanel(btn) {
    const panel = document.createElement('div');
    panel.className = 'dd-panel cal';
    let view = new Date(state.start.getFullYear(), state.start.getMonth(), 1);
    let startPick = new Date(state.start.getFullYear(), state.start.getMonth(), state.start.getDate());
    let endPick = new Date(state.end.getFullYear(), state.end.getMonth(), state.end.getDate());
    let step = 0;
    const paint = () => {
      const a = startPick <= endPick ? startPick : endPick;
      const b = startPick <= endPick ? endPick : startPick;
      const first = new Date(view.getFullYear(), view.getMonth(), 1);
      const startWeek = first.getDay();
      const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
      let cells = '';
      for (let i = 0; i < startWeek; i++) cells += '<span class="out"></span>';
      for (let d = 1; d <= days; d++) {
        const dt = new Date(view.getFullYear(), view.getMonth(), d);
        const cls = sameDay(dt, a) || sameDay(dt, b) ? 'edge' : (dt > a && dt < b ? 'in' : '');
        cells += `<span data-day="${dt.getTime()}" class="${cls}">${d}</span>`;
      }
      panel.innerHTML = `
        <div class="cal-head">
          <button type="button" data-m="-1">‹</button>
          <b>${view.getFullYear()}年${view.getMonth() + 1}月</b>
          <button type="button" data-m="1">›</button>
        </div>
        <div class="cal-grid">${['日','一','二','三','四','五','六'].map(x => `<b>${x}</b>`).join('')}${cells}</div>
        <button type="button" class="cal-quick" data-quick="month">本月</button>
        <div class="dd-actions">
          <button type="button" data-act="cancel">取消</button>
          <button type="button" class="apply" data-act="apply">套用</button>
        </div>`;
    };
    panel.addEventListener('click', e => {
      const m = e.target.getAttribute('data-m');
      if (m) {
        view = new Date(view.getFullYear(), view.getMonth() + Number(m), 1);
        paint();
        return;
      }
      if (e.target.dataset.quick === 'month') {
        const cur = currentMonthRange(taiwanNow());
        startPick = new Date(cur.start); endPick = new Date(cur.end); step = 0;
        view = new Date(cur.start.getFullYear(), cur.start.getMonth(), 1);
        paint();
        return;
      }
      if (e.target.dataset.act === 'cancel') { closePanels(); return; }
      if (e.target.dataset.act === 'apply') {
        const s = startPick <= endPick ? startPick : endPick;
        const t = startPick <= endPick ? endPick : startPick;
        state.start = s; state.end = t;
        closePanels(); refreshFilterBtns();
        return;
      }
      const cell = e.target.closest('[data-day]');
      if (!cell) return;
      const dt = new Date(Number(cell.dataset.day));
      if (step === 0) { startPick = dt; endPick = dt; step = 1; }
      else { endPick = dt; step = 0; }
      paint();
    });
    attachPanel(btn, panel);
    paint();
  }

  function actions(panel, all, clear, cancel, apply) {
    const bar = document.createElement('div');
    bar.className = 'dd-actions';
    const mk = (text, fn, cls) => { if (!fn) return; const b = document.createElement('button'); b.textContent = text; if (cls) b.className = cls; b.onclick = fn; bar.appendChild(b); };
    mk('全選', all); mk('清除', clear); mk('取消', cancel); mk('套用', apply, 'apply');
    panel.appendChild(bar);
  }

  function refreshFilterBtns() {
    ['type','office','city','period','date'].forEach(k => {
      const b = document.querySelector('[data-dd="'+k+'"]');
      if (b) b.textContent = ddLabel(k);
    });
    const pl = $('periodLabel');
    if (pl) pl.textContent = `${slash(state.start)} 至 ${slash(state.end)}`;
  }

  function renderNav() {
    $('nav').innerHTML = NAV.map(n => `<button class="nav-item ${n===state.nav?'on':''}" data-nav="${n}">${n}</button>`).join('');
    $('nav').onclick = e => {
      const n = e.target.dataset.nav; if (!n) return;
      state.nav = n;
      document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('on', b.dataset.nav === n));
      const cases = n === '案件管理';
      const lease = n === '包租管理';
      const weak = n === '政策戶管理';
      const fresh = n === '新件管理';
      const renew = n === '續約管理';
      const ar = n === '應收帳管理';
      const perf = n === '業務績效表';
      $('page-cases').classList.toggle('hidden', !cases);
      if ($('page-lease')) $('page-lease').classList.toggle('hidden', !lease);
      if ($('page-weak')) $('page-weak').classList.toggle('hidden', !weak);
      if ($('page-new')) $('page-new').classList.toggle('hidden', !fresh);
      if ($('page-renew')) $('page-renew').classList.toggle('hidden', !renew);
      if ($('page-ar')) $('page-ar').classList.toggle('hidden', !ar);
      if ($('page-perf')) $('page-perf').classList.toggle('hidden', !perf);
      $('page-placeholder').classList.toggle('hidden', cases || lease || weak || fresh || renew || ar || perf);
      if ($('phTitle')) $('phTitle').textContent = n;
      if (lease) renderLeaseDash('lease');
      if (weak) renderLeaseDash('weak');
      if (fresh) renderLeaseDash('new');
      if (renew) renderRnDash();
      if (ar) renderArDash();
      if (perf) renderNatPerf(staffPeople.nat || []);
    };
  }

  function renderFilters() {
    const keys = [
      ['type', '案件類型', '全部案件類型'],
      ['office', '營業區/營業處', '全公司'],
      ['city', '縣市區域', '全部縣市'],
      ['period', '期數', '全期'],
      ['date', '日期區間', ddLabel('date')]
    ];
    $('filters').innerHTML = keys.map(([k, cap, l]) => `<div class="dd"><div class="dd-cap">${cap}</div><button class="dd-btn" data-dd="${k}">${l}</button></div>`).join('');
    $('filters').onclick = e => {
      const k = e.target.dataset.dd; if (!k) return;
      closePanels();
      if (k === 'type') openTypePanel(e.target);
      if (k === 'office') openOfficePanel(e.target);
      if (k === 'city') openFlatPanel(e.target, CITIES, 'cities', '請至少選擇一個縣市');
      if (k === 'period') openFlatPanel(e.target, PERIODS, 'periods', '請至少選擇一個期別');
      if (k === 'date') openDatePanel(e.target);
    };
    bindDocClose();
    refreshFilterBtns();
  }

  function upsert(id, type, labels, datasets, extra, extraPlugins) {
    if (charts[id]) charts[id].destroy();
    const el = $(id);
    if (!el) return;
    const opts = Object.assign({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: datasets.length > 1 } }
    }, extra || {});
    charts[id] = new Chart(el, {
      type,
      data: { labels, datasets },
      options: opts,
      plugins: extraPlugins || []
    });
  }

  function compute() {
    const start = state.start, end = state.end;
    const thisPerf = perfRows(start, end);
    const prevStart = addMonths(start, -1), prevEnd = new Date(start.getTime() - 86400000);
    const yoyStart = new Date(start.getFullYear() - 1, start.getMonth(), start.getDate());
    const yoyEnd = new Date(end.getFullYear() - 1, end.getMonth(), end.getDate());
    const lastPerf = perfRows(monthStart(prevStart), monthEnd(prevStart));
    const yoyPerf = perfRows(yoyStart, yoyEnd);
    const offices = salesOfficeCount(thisPerf);
    const lastOff = salesOfficeCount(lastPerf);
    const yoyOff = salesOfficeCount(yoyPerf);
    const avg = offices ? thisPerf.length / offices : 0;
    const lastAvg = lastOff ? lastPerf.length / lastOff : 0;
    const yoyAvg = yoyOff ? yoyPerf.length / yoyOff : 0;
    const valid = uniqueUnits(ROWS.filter(r => passFilters(r, { ignoreType: true }) && isValidLease(r, start, end)));
    const scoped = selectedOffices() ? new Set([...selectedOffices()].filter(o => SALES_OFFICES.includes(o))) : null;
    const target = sumTargets(scoped, start, end);
    const rate = target ? thisPerf.length / target : 0;
    return { thisPerf, lastPerf, yoyPerf, offices, lastOff, yoyOff, avg, lastAvg, yoyAvg, valid, target, rate };
  }

  function renderKpis(c) {
    const n = c.thisPerf.length;
    const avg = Math.round(c.avg || 0);
    const yoyAvg = Math.round(c.yoyAvg || 0);
    const lastAvg = Math.round(c.lastAvg || 0);
    const p = Math.max(0, Math.min(100, c.rate * 100));
    const ring = `${p.toFixed(1)}%`;
    const gap = n - c.target;
    const yoyN = c.yoyPerf.length;
    const lastN = c.lastPerf.length;
    $('kpiRow').innerHTML = `
      <div class="card kpi">
        <div class="k">有效租約總數(所有案件類型)</div>
        <div class="v">${fmt(c.valid)}<span class="unit"> 件</span></div>
        <div class="s">包租代管租約執行中的總件數</div>
      </div>
      <div class="card kpi">
        <div class="k">當月業績數</div>
        <div class="v">${fmt(n)}<span class="unit"> 件</span></div>
        <div class="s">營業處數 ${fmt(c.offices)} ｜ 處均件 ${fmt(avg)}</div>
      </div>
      <div class="card kpi kpi-rate">
        <div class="main">
          <div class="k">當月達成率</div>
          <div class="v">${(Number(c.rate) * 100).toFixed(2)}<span class="unit"> %</span></div>
          <div class="s">目標 ${fmt(c.target)}件　差異 ${signed(gap)}</div>
        </div>
        <div class="rate-bar" style="--p:${p}%"><span>${ring}</span></div>
      </div>
      <div class="card kpi">
        <div class="k">同期比</div>
        <div class="v">${fmt(yoyN)}<span class="unit"> 件</span></div>
        <div class="s">差異 ${kpiNeg(n - yoyN)} ｜ 營業處數 ${fmt(c.yoyOff)} ｜ 處均件 ${fmt(yoyAvg)}</div>
      </div>
      <div class="card kpi">
        <div class="k">上月比</div>
        <div class="v">${fmt(lastN)}<span class="unit"> 件</span></div>
        <div class="s">差異 ${kpiNeg(n - lastN)} ｜ 營業處數 ${fmt(c.lastOff)} ｜ 處均件 ${fmt(lastAvg)}</div>
      </div>`;
  }

  function scopedOffices() {
    const sel = selectedOffices();
    return sel ? [...sel].filter(o => SALES_OFFICES.includes(o)) : [...SALES_OFFICES];
  }
  function monthTarget(year, month) {
    return sumTargets(new Set(scopedOffices()), new Date(year, month - 1, 1), monthEnd(new Date(year, month - 1, 1)));
  }
  function monthPerf(year, month) {
    return perfRows(new Date(year, month - 1, 1), monthEnd(new Date(year, month - 1, 1)));
  }
  function forecastMeta() {
    const lastFull = lastCompleteMonth(now).end;
    const people = STAFF.filter(s => s.status === 'NORMAL' && ['30', '40', '50', '60'].includes(String(s.title))).length || 1;
    const last3 = [1, 2, 3].map(n => {
      const d = new Date(lastFull.getFullYear(), lastFull.getMonth() - n + 1, 1);
      return perfRows(monthStart(d), monthEnd(d)).length;
    });
    const perCap = (last3.reduce((a, b) => a + b, 0) / 3) / people;
    const pred = Math.round(perCap * people);
    const curM = now.getMonth();
    const base = [curM, 10, 11].filter((m, i, arr) => m <= 11 && arr.indexOf(m) === i).filter(m => m >= curM);
    return { people, perCap, pred, lastFull, curM, base };
  }
  function cum(arr) {
    let s = 0;
    return arr.map(v => { s += Number(v || 0); return s; });
  }

  function renderTrend() {
    const year = state.end.getFullYear();
    const g = state.trendGrain || 'month';
    const fc = forecastMeta();
    const labelPlugin = {
      id: 'ptLabels',
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        chart.data.datasets.forEach((ds, di) => {
          const meta = chart.getDatasetMeta(di);
          if (!meta.visible) return;
          meta.data.forEach((pt, i) => {
            const v = ds.data[i];
            if (v == null || !pt) return;
            ctx.save();
            ctx.fillStyle = ds.borderColor || '#334155';
            ctx.font = '10px Arial, sans-serif';
            ctx.textAlign = 'center';
            const lift = di === 3 ? 16 : -12;
            ctx.fillText(fmt(v), pt.x, pt.y + lift);
            ctx.restore();
          });
        });
      }
    };
    const tideOnce = {
      id: 'tideOnce',
      afterLayout(chart) {
        if (chart.$tideOk) return;
        chart.$tideOk = true;
        requestAnimationFrame(() => { if (charts.chartTrend === chart) chart.update('none'); });
      }
    };
    const bandPlugin = {
      id: 'curBand',
      beforeDraw(chart) {
        if (g !== 'month' && g !== 'year') return;
        const meta = chart.getDatasetMeta(0);
        const pt = meta && meta.data[fc.curM];
        if (!pt) return;
        const { ctx, chartArea } = chart;
        const w = 36;
        ctx.save();
        ctx.fillStyle = 'rgba(59,130,246,.07)';
        ctx.fillRect(pt.x - w / 2, chartArea.top, w, chartArea.bottom - chartArea.top);
        ctx.restore();
      }
    };
    const tideFill = (ctx) => {
      const { chart } = ctx;
      const area = chart.chartArea;
      if (!area) return 'rgba(59,130,246,0.18)';
      const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
      g.addColorStop(0, 'rgba(59,130,246,0.42)');
      g.addColorStop(0.45, 'rgba(59,130,246,0.18)');
      g.addColorStop(1, 'rgba(59,130,246,0.03)');
      return g;
    };
    const lineOpt = (label, data, color, dash, tide) => ({
      label, data, borderColor: color,
      backgroundColor: tide ? tideFill : '#fff',
      tension: .35, pointRadius: 4, pointHoverRadius: 5,
      fill: tide ? 'origin' : false, spanGaps: true,
      borderDash: dash && dash.length ? dash : [],
      borderWidth: 2.75,
      borderCapStyle: 'butt',
      pointStyle: 'circle',
      pointBackgroundColor: '#fff',
      pointBorderColor: color,
      pointBorderWidth: 2,
      ...(dash && dash.length ? { segment: { borderDash: () => dash } } : {})
    });
    const cleanOpts = {
      plugins: {
        filler: { propagate: false },
        legend: {
          display: true, position: 'top', align: 'end',
          labels: {
            usePointStyle: true, pointStyle: 'line',
            boxWidth: 18, boxHeight: 6, padding: 4,
            font: { family: 'Arial', size: 11 },
            color: '#64748b',
            generateLabels(chart) {
              return chart.data.datasets.map((ds, i) => ({
                text: ds.label,
                fillStyle: ds.borderColor,
                strokeStyle: ds.borderColor,
                fontColor: '#64748b',
                lineWidth: 2,
                pointStyle: 'line',
                lineDash: Array.isArray(ds.borderDash) && ds.borderDash.length ? ds.borderDash : [],
                hidden: !chart.isDatasetVisible(i),
                datasetIndex: i
              }));
            }
          }
        }
      },
      clip: false,
      layout: { padding: { top: 4, right: 8, left: 4, bottom: 2 } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'Arial', size: 11 }, color: '#94a3b8' }, border: { display: false } },
        y: { grid: { color: '#f1f5f9' }, ticks: { display: false }, border: { display: false } }
      }
    };

    if (g === 'day' || g === 'week') {
      const buckets = [];
      if (g === 'day') {
        for (let d = new Date(state.start); d <= state.end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
          const s = new Date(d), e = new Date(d);
          buckets.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, s, e, y: d.getFullYear(), m: d.getMonth() + 1, days: 1 });
        }
      } else {
        let cur = new Date(state.start);
        const wd = cur.getDay();
        cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() - wd);
        let n = 1;
        while (cur <= state.end) {
          const s = new Date(Math.max(cur, state.start));
          const wEnd = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 6);
          const e = wEnd < state.end ? wEnd : new Date(state.end);
          buckets.push({ label: 'W' + n, s, e, y: s.getFullYear(), m: s.getMonth() + 1, days: Math.round((e - s) / 86400000) + 1 });
          cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 7);
          n += 1;
        }
      }
      const actual = buckets.map(b => perfRows(b.s, b.e).length);
      const yoy = buckets.map(b => {
        const s = new Date(b.s.getFullYear() - 1, b.s.getMonth(), b.s.getDate());
        const e = new Date(b.e.getFullYear() - 1, b.e.getMonth(), b.e.getDate());
        return perfRows(s, e).length;
      });
      const target = buckets.map(b => {
        const mt = monthTarget(b.y, b.m);
        const dim = new Date(b.y, b.m, 0).getDate();
        return Math.round(mt * b.days / dim);
      });
      $('trendNote').textContent = (g === 'day' ? '逐日' : '週別') + '趨勢：依查詢期間租約起日統計業績件數。' + scopeNote();
      const daySets = [
        ...(showTarget() ? [lineOpt('目標', target, C_TARGET)] : []),
        lineOpt('本年實績', actual, C_ACTUAL, null, true),
        lineOpt('去年同期', yoy, C_YOY)
      ];
      upsert('chartTrend', 'line', buckets.map(b => b.label), daySets, cleanOpts, [tideOnce, labelPlugin]);
      return;
    }

    const labels = Array.from({ length: 12 }, (_, i) => (i + 1) + '月');
    const actual = labels.map((_, i) => monthPerf(year, i + 1).length);
    const yoy = labels.map((_, i) => monthPerf(year - 1, i + 1).length);
    const target = labels.map((_, i) => monthTarget(year, i + 1));
    const actualLine = actual.map((v, i) => i <= fc.curM ? v : null);
    const fcLine = actual.map((v, i) => {
      if (i < fc.curM) return null;
      if (i === fc.curM) return v;
      return fc.pred;
    });
    const useCum = g === 'year';
    const tData = useCum ? cum(target) : target;
    const aData = useCum ? cum(actualLine.map(v => v || 0)).map((v, i) => i <= fc.curM ? v : null) : actualLine;
    const yData = useCum ? cum(yoy) : yoy;
    const fData = useCum
      ? actual.map((_, i) => {
          if (i < fc.curM) return null;
          const base = cum(actualLine.map(v => v || 0))[fc.curM];
          return base + fc.pred * (i - fc.curM);
        })
      : fcLine;
    const baseNames = fc.base.map(m => `${year}年${m + 1}月`).join('、');
    $('trendNote').textContent = (useCum ? '年度累計' : '月別趨勢') +
      `：實績呈現至最後完整月；之後以目前正常在職業務近 3 個完整月人均產能推估至 12 月。正常在職業務 ${fmt(fc.people)} 人近 3 月人均月產能 ${fc.perCap.toFixed(1)} 件，未來每月預測 ${fmt(fc.pred)} 件。基礎月份 ${baseNames}。` +
      scopeNote();
    const monthSets = [
      ...(showTarget() ? [lineOpt('目標', tData, C_TARGET)] : []),
      lineOpt('本年各月實績', aData, C_ACTUAL, null, true),
      lineOpt('預測值（近3月在職業務人均產能）', fData, C_ACTUAL, [8, 6]),
      lineOpt('去年同期', yData, C_YOY)
    ];
    upsert('chartTrend', 'line', labels, monthSets, cleanOpts, [tideOnce, bandPlugin, labelPlugin]);
  }

  function renderMonthCmp() {
    const year = state.end.getFullYear();
    const cur = now.getMonth();
    const ytd = cur + 1;
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const targetN = months.map(m => scopedOffices().filter(o => officeMonthTarget(o, year, m) > 0).length);
    const officeN = months.map(m => salesOfficeCount(monthPerf(year, m)));
    const tgt = months.map(m => monthTarget(year, m));
    const act = months.map(m => monthPerf(year, m).length);
    const yoy = months.map(m => monthPerf(year - 1, m).length);
    const ytdOffices = new Set();
    const ytdTargetOff = new Set();
    months.slice(0, ytd).forEach(m => {
      monthPerf(year, m).forEach(r => { if (SALES_OFFICES.includes(r.so)) ytdOffices.add(r.so); });
      scopedOffices().forEach(o => { if (officeMonthTarget(o, year, m) > 0) ytdTargetOff.add(o); });
    });
    const sum = (arr, n) => arr.slice(0, n).reduce((a, b) => a + b, 0);
    const ytdT = sum(tgt, ytd), ytdA = sum(act, ytd), ytdY = sum(yoy, ytd);
    const yrT = sum(tgt, 12), yrA = sum(act, 12), yrY = sum(yoy, 12);
    const yrTN = scopedOffices().filter(o => months.some(m => officeMonthTarget(o, year, m) > 0)).length;
    const yrON = (() => {
      const s = new Set();
      months.forEach(m => monthPerf(year, m).forEach(r => { if (SALES_OFFICES.includes(r.so)) s.add(r.so); }));
      return s.size;
    })();
    const ytdTN = ytdTargetOff.size, ytdON = ytdOffices.size;
    const yoyOfficeN = months.map(m => salesOfficeCount(monthPerf(year - 1, m)));
    const ytdYoyOff = new Set();
    months.slice(0, ytd).forEach(m => {
      monthPerf(year - 1, m).forEach(r => { if (SALES_OFFICES.includes(r.so)) ytdYoyOff.add(r.so); });
    });
    const ytdYoyON = ytdYoyOff.size;
    const yrYoyON = (() => {
      const s = new Set();
      months.forEach(m => monthPerf(year - 1, m).forEach(r => { if (SALES_OFFICES.includes(r.so)) s.add(r.so); }));
      return s.size;
    })();
    const dcell = v => {
      const n = Math.round(v);
      return `<td${n < 0 ? ' class="neg"' : ''}>${n > 0 ? '+' : ''}${fmt(n)}</td>`;
    };
    const rate = (a, t) => t ? ((a / t) * 100).toFixed(1) + '%' : '0.0%';
    const vs = (a, b, unit) => {
      const d = Math.round(a - b);
      if (!d) return `與${unit}持平`;
      return d > 0 ? `較${unit}多 ${fmt(d)}` : `較${unit}少 ${fmt(-d)}`;
    };
    const withT = showTarget();
    $('monthCmpNote').innerHTML =
      `據點：${cur + 1}月有業績營業處 ${fmt(officeN[cur])} 處` +
      (withT ? `，${vs(officeN[cur], targetN[cur], `目標 ${fmt(targetN[cur])} 處`)}` : '') +
      `，${vs(officeN[cur], yoyOfficeN[cur], `去年同期 ${fmt(yoyOfficeN[cur])} 處`)}。<br>` +
      `業績：${cur + 1}月實績 ${fmt(act[cur])} 件` +
      (withT ? `，${vs(act[cur], tgt[cur], `目標 ${fmt(tgt[cur])} 件`)}，達成率 ${rate(act[cur], tgt[cur])}` : '') +
      `；${vs(act[cur], yoy[cur], `去年同期 ${fmt(yoy[cur])} 件`)}。1~${ytd}月累計實績 ${fmt(ytdA)} 件` +
      (withT ? `，達成率 ${rate(ytdA, ytdT)}` : '') + '。';
    $('monthCmpTable').innerHTML = `<table class="month-cmp"><thead><tr><th></th><th>項目</th>${months.map((m, i) => `<th${i === cur ? ' class="cur"' : ''}>${m}月</th>`).join('')}<th>1~${ytd}月</th><th>年度</th></tr></thead><tbody>
      <tr><th rowspan="${withT ? 4 : 2}">據點</th>${withT ? `<td class="item">目標(數)</td>${months.map((_, i) => `<td>${fmt(targetN[i])}</td>`).join('')}<td>${fmt(ytdTN)}</td><td>${fmt(yrTN)}</td></tr>
      <tr>` : ''}<td class="item">營業處(數)</td>${months.map((_, i) => `<td>${fmt(officeN[i])}</td>`).join('')}<td>${fmt(ytdON)}</td><td>${fmt(yrON)}</td></tr>
      ${withT ? `<tr><td class="item">差異數</td>${months.map((_, i) => dcell(officeN[i] - targetN[i])).join('')}${dcell(ytdON - ytdTN)}${dcell(yrON - yrTN)}</tr>` : ''}
      <tr><td class="item">同期營業處數</td>${months.map((_, i) => `<td>${fmt(yoyOfficeN[i])}</td>`).join('')}<td>${fmt(ytdYoyON)}</td><td>${fmt(yrYoyON)}</td></tr>
      <tr class="sec"><th rowspan="${withT ? 6 : 3}">業績</th>${withT ? `<td class="item">本月目標(件)</td>${months.map((_, i) => `<td>${fmt(tgt[i])}</td>`).join('')}<td>${fmt(ytdT)}</td><td>${fmt(yrT)}</td></tr>
      <tr>` : ''}<td class="item">本月實績(件)</td>${months.map((_, i) => `<td>${fmt(act[i])}</td>`).join('')}<td>${fmt(ytdA)}</td><td>${fmt(yrA)}</td></tr>
      ${withT ? `<tr><td class="item">差異數</td>${months.map((_, i) => dcell(act[i] - tgt[i])).join('')}${dcell(ytdA - ytdT)}${dcell(yrA - yrT)}</tr>
      <tr><td class="item">達成率(%)</td>${months.map((_, i) => `<td>${rate(act[i], tgt[i])}</td>`).join('')}<td>${rate(ytdA, ytdT)}</td><td>${rate(yrA, yrT)}</td></tr>` : ''}
      <tr><td class="item">同期實績(件)</td>${months.map((_, i) => `<td>${fmt(yoy[i])}</td>`).join('')}<td>${fmt(ytdY)}</td><td>${fmt(yrY)}</td></tr>
      <tr><td class="item">差異數</td>${months.map((_, i) => dcell(act[i] - yoy[i])).join('')}${dcell(ytdA - ytdY)}${dcell(yrA - yrY)}</tr>
    </tbody></table>`;
  }

  function rankToneCount(n) {
    if (n >= 20) return 'cnt-hi';
    if (n <= 10) return 'lo';
    return '';
  }
  function rankToneRate(rate, hi, lo) {
    if (rate >= hi) return 'cnt-hi';
    if (rate <= lo) return 'lo';
    return '';
  }
  function rankRowHtml(i, name, pct, label, tone) {
    return `<div class="rank-row${tone ? ' rank-' + tone : ''}">
      <b>${i + 1}</b>
      <span>${esc(name || '—')}</span>
      <div class="rank-bar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>
      <span class="right">${label}</span>
    </div>`;
  }
  function officeCountList(rows) {
    const map = {};
    (rows || []).forEach(r => {
      if (!(SALES_OFFICES.includes(r.so) || !selectedOffices())) return;
      if (!r.so) return;
      map[r.so] = (map[r.so] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant'));
  }
  function renderOffCountRank3(el, rows) {
    if (!el) return;
    const arr = officeCountList(rows).slice(0, 24);
    const max = Math.max(...arr.map(x => x[1]), 1);
    const cols = [arr.slice(0, 8), arr.slice(8, 16), arr.slice(16, 24)];
    el.innerHTML = `<h4>單位業績排行榜</h4>
      <p class="note">依篩選單位轄下營業處業績件數排名</p>
      <div class="off-rank-3">${cols.map((col, ci) => `<div class="rank-list">${col.map((x, i) => {
        const n = x[1];
        return rankRowHtml(ci * 8 + i, x[0], (n / max) * 100, fmt(n), rankToneCount(n));
      }).join('')}</div>`).join('')}</div>`;
  }
  function renderCityCountRank3(el, rows) {
    if (!el) return;
    const map = {};
    (rows || []).forEach(r => {
      const c = cityOfLease(r);
      if (!c) return;
      map[c] = (map[c] || 0) + 1;
    });
    const arr = Object.entries(map).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant')).slice(0, 24);
    const max = Math.max(...arr.map(x => x[1]), 1);
    const cols = [arr.slice(0, 8), arr.slice(8, 16)];
    el.innerHTML = `<h4>各縣市業績排行榜</h4>
      <p class="note">依租賃地址前三字歸縣市，件數口徑與業績達成與成長分析相同</p>
      <div class="off-rank-3">${cols.map((col, ci) => `<div class="rank-list">${col.map((x, i) => {
        const n = x[1];
        return rankRowHtml(ci * 8 + i, x[0], (n / max) * 100, fmt(n), rankToneCount(n));
      }).join('')}</div>`).join('')}</div>`;
  }
  function officeRateList(rows, kind) {
    const map = {};
    (rows || []).forEach(r => {
      if (!(SALES_OFFICES.includes(r.so) || !selectedOffices())) return;
      if (!r.so) return;
      if (!map[r.so]) map[r.so] = [];
      map[r.so].push(r);
    });
    return Object.entries(map).map(([so, list]) => {
      const s = dashShare(list, kind);
      return [so, s.rate, s.n, s.lease];
    }).sort((a, b) => b[1] - a[1] || b[3] - a[3] || a[0].localeCompare(b[0], 'zh-Hant'));
  }
  function renderOffRateRank3(el, rows, kind) {
    if (!el) return;
    kind = dashKind(kind);
    const lab = dashLab(kind);
    const hi = kind === 'new' ? 0.9 : 0.5;
    const lo = kind === 'new' ? 0.7 : 0.3;
    const arr = officeRateList(rows, kind).slice(0, 24);
    const max = Math.max(...arr.map(x => x[1]), 0.01);
    const cols = [arr.slice(0, 8), arr.slice(8, 16), arr.slice(16, 24)];
    el.innerHTML = `<h4>單位${esc(lab.rate)}排行榜</h4>
      <p class="note">依篩選單位轄下營業處${esc(lab.rate)}排名</p>
      <div class="off-rank-3">${cols.map((col, ci) => `<div class="rank-list">${col.map((x, i) => {
        const rate = x[1];
        return rankRowHtml(ci * 8 + i, x[0], (rate / max) * 100, (rate * 100).toFixed(1) + '%', rankToneRate(rate, hi, lo));
      }).join('')}</div>`).join('')}</div>`;
  }
  function renderRank(c) {
    const arr = officeCountList(c.thisPerf);
    const max = Math.max(...arr.map(x => x[1]), 1);
    $('rankList').innerHTML = arr.map((x, i) => rankRowHtml(i, x[0], (x[1] / max) * 100, fmt(x[1]), rankToneCount(x[1]))).join('')
      || '<div class="empty">無符合條件的資料</div>';
  }

  function settleWeeks(y, m) {
    const stl = settleOf(y, m);
    const from = stl && stl.calcStart ? parseIso(stl.calcStart) : new Date(y, m - 2, 22);
    const to = stl && stl.calcEnd ? parseIso(stl.calcEnd) : new Date(y, m - 1, 20);
    const weeks = [];
    let cur = new Date(from);
    while (cur <= to) {
      const wStart = new Date(cur);
      const wEnd = new Date(Math.min(cur.getTime() + 6 * 86400000, to.getTime()));
      weeks.push({ start: wStart, end: wEnd });
      cur = new Date(wEnd.getTime() + 86400000);
    }
    return weeks;
  }
  function monthLeaseRows(y, m) {
    const stl = settleOf(y, m);
    const start = stl && stl.leaseStart ? parseIso(stl.leaseStart) : new Date(y, m - 1, 1);
    const end = stl && stl.leaseEnd ? parseIso(stl.leaseEnd) : monthEnd(new Date(y, m - 1, 1));
    return uniqueByLeaseAddr(ROWS.filter(r => passFilters(r) && startIn(r, start, end) && isCyclePerf(r)));
  }
  function bucketWeeks(rows, weeks) {
    const counts = weeks.map(() => 0);
    if (!weeks.length) return counts;
    const w1End = weeks[0].end;
    const lastEnd = weeks[weeks.length - 1].end;
    rows.forEach(r => {
      const d = submitDateOf(r);
      if (!d || d <= w1End) { counts[0] += 1; return; }
      if (d > lastEnd) { counts[counts.length - 1] += 1; return; }
      const i = weeks.findIndex(w => d >= w.start && d <= w.end);
      counts[i >= 0 ? i : counts.length - 1] += 1;
    });
    return counts;
  }
  function renderWeek() {
    const y = state.end.getFullYear(), m = state.end.getMonth() + 1;
    const weeks = settleWeeks(y, m);
    const md = d => `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
    const monthT = monthTarget(y, m);
    const weekDays = w => {
      const a = new Date(w.start.getFullYear(), w.start.getMonth(), w.start.getDate());
      const b = new Date(w.end.getFullYear(), w.end.getMonth(), w.end.getDate());
      return Math.max(1, Math.round((b - a) / 86400000) + 1);
    };
    const days = weeks.map(weekDays);
    const totalDays = days.reduce((s, d) => s + d, 0) || 1;
    const targets = days.map((d, i) => {
      if (i < days.length - 1) return Math.round(monthT * d / totalDays);
      return 0;
    });
    if (targets.length) targets[targets.length - 1] = monthT - targets.slice(0, -1).reduce((s, n) => s + n, 0);
    const actual = bucketWeeks(monthLeaseRows(y, m), weeks);
    const prevM = m === 1 ? 12 : m - 1;
    const prevY = m === 1 ? y - 1 : y;
    const lastWeeks = settleWeeks(prevY, prevM);
    const lastCounts = bucketWeeks(monthLeaseRows(prevY, prevM), lastWeeks);
    const lastM = weeks.map((_, i) => lastCounts[i] || 0);
    const yoyWeeks = settleWeeks(y - 1, m);
    const yoyCounts = bucketWeeks(monthLeaseRows(y - 1, m), yoyWeeks);
    const yoy = weeks.map((_, i) => yoyCounts[i] || 0);
    const chg = (a, b) => {
      if (!b) return '<span class="chg">—</span>';
      const p = (a - b) / b * 100;
      const cls = p < 0 ? 'down' : (p > 0 ? 'up' : '');
      const arrow = p < 0 ? '↓' : (p > 0 ? '↑' : '');
      return `<span class="chg ${cls}">${arrow} ${Math.abs(p).toFixed(1)}%</span>`;
    };
    const totT = targets.reduce((a, b) => a + b, 0);
    const totA = actual.reduce((a, b) => a + b, 0);
    const totL = lastM.reduce((a, b) => a + b, 0);
    const totY = yoy.reduce((a, b) => a + b, 0);
    const rateCell = (a, t) => {
      const r = t ? Math.max(0, Math.min(100, a / t * 100)) : 0;
      return `<div class="rate-cell"><span class="rate-mini"><i style="width:${r}%"></i></span><span class="rate-pct">${t ? (a / t * 100).toFixed(1) : '0.0'}%</span></div>`;
    };
    const dcell = v => `<td class="${v < 0 ? 'neg' : ''}">${v > 0 ? '+' : ''}${fmt(v)}</td>`;
    const withT = showTarget();
    const body = weeks.map((w, i) => {
      const t = targets[i], a = actual[i];
      return `<tr>
        <td>${m}月W${i + 1} (${md(w.start)}-${md(w.end)})</td>
        ${withT ? `<td>${fmt(t)}</td>` : ''}<td>${fmt(a)}</td>${withT ? dcell(a - t) : ''}
        ${withT ? `<td>${rateCell(a, t)}</td>` : ''}
        <td>${fmt(lastM[i])}</td><td>${chg(a, lastM[i])}</td>
        <td>${fmt(yoy[i])}</td><td>${chg(a, yoy[i])}</td>
      </tr>`;
    }).join('');
    const weekNote = $('weekNote');
    if (weekNote) {
      weekNote.textContent = '週期實績：起租日落在該月租約區間（通常為1日至月底）才計入該月；週別依送審日期歸屬。第一週含結績起日以前送審、最後一週含結截日以後送審。新媒合案件狀態含已生效／已到期／已解約／審／產編即計入，已停用與暫存不算。包租成立後才有轉租，同一租賃地址只計1件。' +
        (withT ? '目標依結績天數比例分配：目標數／結績總天數×當週天數。' : '');
    }
    $('weekTable').innerHTML = `<table class="week-tbl"><thead><tr>
      <th>月份</th>${withT ? '<th>目標</th>' : ''}<th>實績</th>${withT ? '<th>差異</th><th class="rate-h">目標達成率</th>' : ''}
      <th>上月</th><th>上月比%</th><th>同期</th><th>同期比%</th>
    </tr></thead><tbody>${body}
      <tr class="total"><td>Total</td>${withT ? `<td>${fmt(totT)}</td>` : ''}<td>${fmt(totA)}</td>${withT ? `${dcell(totA - totT)}<td>${rateCell(totA, totT)}</td>` : ''}
      <td>${fmt(totL)}</td><td>${chg(totA, totL)}</td>
      <td>${fmt(totY)}</td><td>${chg(totA, totY)}</td></tr>
    </tbody></table>`;
    const barLabel = {
      id: 'barLabels',
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        chart.data.datasets.forEach((ds, di) => {
          const meta = chart.getDatasetMeta(di);
          if (!meta.visible) return;
          meta.data.forEach((pt, i) => {
            const v = ds.data[i];
            if (v == null) return;
            ctx.save();
            ctx.fillStyle = '#334155';
            ctx.font = '10px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(fmt(v), pt.x, pt.y - 4);
            ctx.restore();
          });
        });
      }
    };
    upsert('chartWeek', 'bar', weeks.map((_, i) => 'W' + (i + 1)), [
      ...(withT ? [{ label: '目標', data: targets, backgroundColor: C_TARGET, borderRadius: { topLeft: 10, topRight: 10, bottomLeft: 0, bottomRight: 0 }, borderSkipped: 'bottom', barPercentage: .56, categoryPercentage: .72 }] : []),
      { label: '實績', data: actual, backgroundColor: C_ACTUAL, borderRadius: { topLeft: 10, topRight: 10, bottomLeft: 0, bottomRight: 0 }, borderSkipped: 'bottom', barPercentage: .56, categoryPercentage: .72 },
      { label: '同期', data: yoy, backgroundColor: C_YOY, borderRadius: { topLeft: 10, topRight: 10, bottomLeft: 0, bottomRight: 0 }, borderSkipped: 'bottom', barPercentage: .56, categoryPercentage: .72 }
    ], {
      plugins: {
        legend: { display: true, position: 'top', align: 'end', labels: { font: { family: 'Arial', size: 11 }, color: '#64748b', boxWidth: 10 } }
      },
      clip: false,
      layout: { padding: { top: 14 } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'Arial', size: 11 }, color: '#94a3b8' }, border: { display: false } },
        y: { grid: { color: '#f1f5f9' }, ticks: { display: false }, border: { display: false } }
      }
    }, [barLabel]);
  }

  const ISLANDS = new Set(['澎湖縣', '金門縣', '連江縣']);
  let twTopo = null;
  let twFeatures = null;

  function decodeArc(topo, index) {
    const raw = topo.arcs[index < 0 ? ~index : index];
    const [sx, sy] = topo.transform.scale;
    const [tx, ty] = topo.transform.translate;
    let x = 0, y = 0;
    const pts = raw.map(([dx, dy]) => {
      x += dx; y += dy;
      return [x * sx + tx, y * sy + ty];
    });
    return index < 0 ? pts.slice().reverse() : pts;
  }
  function mergeArcs(topo, indexes) {
    const pts = [];
    indexes.forEach((idx, i) => {
      const a = decodeArc(topo, idx);
      const start = i === 0 ? 0 : 1;
      for (let j = start; j < a.length; j++) pts.push(a[j]);
    });
    return pts;
  }
  function geomToPolys(topo, g) {
    const polys = g.type === 'Polygon' ? [g.arcs] : g.arcs;
    return (polys || []).map(poly => poly.map(ring => mergeArcs(topo, ring)));
  }
  function mixBlue(t) {
    const a = [210, 222, 235], b = [30, 64, 175];
    const u = Math.max(0, Math.min(1, t));
    const ch = i => Math.round(a[i] + (b[i] - a[i]) * u);
    return `rgb(${ch(0)},${ch(1)},${ch(2)})`;
  }
  function ringPath(ring, project) {
    return ring.map((p, i) => {
      const [x, y] = project(p);
      return `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join('') + 'Z';
  }
  function parseTwFeatures(topo) {
    return topo.objects.counties.geometries
      .filter(g => g.properties && !ISLANDS.has(normCity(g.properties.COUNTYNAME)))
      .map(g => ({ name: normCity(g.properties.COUNTYNAME), polys: geomToPolys(topo, g) }));
  }
  function loadTwMap() {
    if (twFeatures) return Promise.resolve(twFeatures);
    return fetch('counties-10t.json').then(r => r.json()).then(topo => {
      twTopo = topo;
      twFeatures = parseTwFeatures(topo);
      return twFeatures;
    });
  }

  function renderMap(c) {
    const counts = {};
    c.thisPerf.forEach(r => {
      const city = normCity(r.city);
      if (!city) return;
      counts[city] = (counts[city] || 0) + 1;
    });
    const draw = (features) => {
      features.forEach(f => { if (counts[f.name] == null) counts[f.name] = 0; });
      const max = Math.max(...features.map(f => counts[f.name] || 0), 1);
      const pts = [];
      features.forEach(f => f.polys.forEach(poly => poly.forEach(ring => ring.forEach(p => pts.push(p)))));
      const lons = pts.map(p => p[0]), lats = pts.map(p => p[1]);
      const minLon = Math.min(...lons), maxLon = Math.max(...lons);
      const minLat = Math.min(...lats), maxLat = Math.max(...lats);
      const pad = 3, targetH = 220;
      const s = (targetH - pad * 2) / (maxLat - minLat);
      const W = Math.ceil((maxLon - minLon) * s + pad * 2);
      const H = targetH;
      const ox = pad;
      const oy = pad;
      const project = ([lon, lat]) => [ox + (lon - minLon) * s, oy + (maxLat - lat) * s];
      const paths = features.map(f => {
        const n = counts[f.name] || 0;
        const fill = n === 0 ? '#d7dee8' : mixBlue(0.28 + 0.72 * (n / max));
        const d = f.polys.map(poly => poly.map(ring => ringPath(ring, project)).join('')).join('');
        return `<path fill="${fill}" fill-rule="evenodd" d="${d}"><title>${f.name} ${fmt(n)}件</title></path>`;
      }).join('');
      $('twMap').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="臺灣本島縣市業績分佈">${paths}</svg>`;
      const ranked = CITIES.map(normCity)
        .map(name => [name, counts[name] || 0])
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant'));
      $('twMapTitle').innerHTML = `營業據點全台分佈 <span class="tw-n">｜ ${fmt(CITIES.length)}處</span>`;
      $('twRank').innerHTML = ranked.map((x, i) =>
        `<div class="tw-rank-row"><span class="tw-no">${i + 1}</span><span class="city">${x[0]}</span><span class="cnt">${fmt(x[1])}</span></div>`
      ).join('') || '<div class="empty">無符合條件的資料</div>';
    };
    loadTwMap().then(draw).catch(() => {
      $('twMap').innerHTML = '<div class="empty">地圖資料載入失敗</div>';
    });
  }

  function unitOfficeSet(id) {
    let set = null;
    if (id === '__SEL__' || id === '管轄單位加總') set = selectedOffices();
    else if (!id || id === '全公司' || id === '__ALL__') set = null;
    else if (id === '營業部') set = new Set(SALES_OFFICES);
    else if (id === '電銷部' || id === '電服部') set = new Set(['電服部']);
    else if (id === '多元開發部' || id === '多元開發部(全)') set = new Set(MULTI_OFFICES);
    else if (id === '後勤') set = new Set(BACK_OFFICES);
    else if (REGIONS[id]) set = new Set(REGIONS[id]);
    else set = new Set([id]);
    const sel = selectedOffices();
    if (sel && set) return new Set([...set].filter(o => sel.has(o)));
    if (sel && !set) return sel;
    return set;
  }
  function unitPerf(offices, start, end) {
    return uniqueById(ROWS.filter(r => {
      if (!passFilters(r)) return false;
      if (offices && !offices.has(r.so)) return false;
      return startIn(r, start, end) && isPerf(r);
    }));
  }
  function unitStaff(offices) {
    return STAFF.filter(s => s.status === 'NORMAL' && (!offices || offices.has(s.officeName)));
  }
  function cmpRange() {
    if (state.cmpGrain === 'year') {
      const y = state.end.getFullYear();
      return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
    }
    return { start: state.start, end: state.end };
  }
  function cmpChg(a, b) {
    if (!b) return '<span class="chg">—</span>';
    const p = (a - b) / b * 100;
    const cls = p < 0 ? 'down' : (p > 0 ? 'up' : '');
    const arrow = p < 0 ? '↓' : (p > 0 ? '↑' : '');
    return `<span class="chg ${cls}">${arrow} ${Math.abs(p).toFixed(1)}%</span>`;
  }
  function unitTree() {
    return {
      id: '全公司', name: '全公司',
      kids: [
        {
          id: '營業部', name: '營業部',
          kids: Object.entries(REGIONS).map(([r, arr]) => ({
            id: r, name: r, kids: arr.map(o => ({ id: o, name: o, kids: [] }))
          }))
        },
        { id: '業務支援管理部', name: '業務支援管理部', kids: [] },
        { id: '電銷部', name: '電銷部', kids: [] },
        { id: '多元開發部', name: '多元開發部', kids: MULTI_OFFICES.map(o => ({ id: o, name: o, kids: [] })) },
        { id: '後勤', name: '後勤', kids: BACK_OFFICES.map(o => ({ id: o, name: o, kids: [] })) }
      ]
    };
  }
  const SALES_OFFICE_SET = new Set(SALES_OFFICES);
  function pruneIdleSalesOffices(node, hasPerf) {
    if (!node) return null;
    const kids = (node.kids || []).map(k => pruneIdleSalesOffices(k, hasPerf)).filter(Boolean);
    if (SALES_OFFICE_SET.has(node.id) && !hasPerf(node)) return null;
    if (REGIONS[node.id] && !kids.length) return null;
    return { ...node, kids };
  }
  function aliasUnitId(id) {
    if (id === '電服部') return '電銷部';
    if (id === '多元開發部(全)') return '多元開發部';
    return id;
  }
  function findUnitNode(node, id) {
    const want = aliasUnitId(id);
    if (node.id === want || node.id === id) return node;
    for (const k of node.kids || []) {
      const hit = findUnitNode(k, id);
      if (hit) return hit;
    }
    return null;
  }
  function cloneUnitNode(node) {
    return { id: node.id, name: node.name, kids: (node.kids || []).map(cloneUnitNode) };
  }
  function scopedUnitTree() {
    const full = unitTree();
    const ids = state.offices || [];
    if (!ids.length || ids.includes('__ALL__')) return full;
    const mapped = [...new Set(ids.map(aliasUnitId))];
    const picked = mapped.map(id => findUnitNode(full, id)).filter(Boolean).map(cloneUnitNode);
    if (!picked.length) return full;
    if (picked.length === 1) return picked[0];
    const top = picked.filter(n => !picked.some(p => p !== n && findUnitNode(p, n.id)));
    return { id: '__SEL__', name: '管轄單位加總', kids: top };
  }
  function selectedSalesOfficeLeaves() {
    const ids = (state.offices || []).map(aliasUnitId);
    if (!ids.length || ids.includes('__ALL__')) return [];
    return ids.filter(id => SALES_OFFICE_SET.has(id));
  }
  function onlySalesOfficeFilter() {
    const ids = (state.offices || []).map(aliasUnitId);
    if (!ids.length || ids.includes('__ALL__')) return false;
    return ids.every(id => SALES_OFFICE_SET.has(id));
  }
  function officeFilterKind() {
    const ids = (state.offices || []).map(aliasUnitId);
    const leaves = selectedSalesOfficeLeaves();
    if (!ids.length || ids.includes('__ALL__')) return 'all';
    if (ids.includes('營業部') || (leaves.length === SALES_OFFICES.length && leaves.every(o => SALES_OFFICE_SET.has(o)))) return 'bu';
    const regionHit = Object.entries(REGIONS).find(([, arr]) => arr.length && arr.length === leaves.length && arr.every(o => leaves.includes(o)));
    if (regionHit && leaves.length) return 'region';
    if (leaves.length && ids.every(id => SALES_OFFICE_SET.has(id))) return 'offices';
    return 'mixed';
  }

  function renderCmp() {
    const { start, end } = cmpRange();
    const lastStart = addMonths(start, -1), lastEnd = addMonths(end, -1);
    const yoyStart = new Date(start.getFullYear() - 1, start.getMonth(), start.getDate());
    const yoyEnd = new Date(end.getFullYear() - 1, end.getMonth(), end.getDate());
    const open = new Set(state.cmpOpen || []);
    const withT = showTarget();
    const cmpSort = $('cmpSort');
    if (cmpSort) {
      [...cmpSort.options].forEach(o => {
        if (['target', 'gap', 'rate'].includes(o.value)) o.hidden = !withT;
      });
      if (!withT && ['target', 'gap', 'rate'].includes(cmpSort.value)) cmpSort.value = 'actual';
    }
    const metrics = (id) => {
      const offices = unitOfficeSet(id);
      const nowRows = unitPerf(offices, start, end);
      const lastRows = unitPerf(offices, lastStart, lastEnd);
      const yoyRows = unitPerf(offices, yoyStart, yoyEnd);
      const n = nowRows.length, last = lastRows.length, yoy = yoyRows.length;
      const target = sumTargets(offices, start, end);
      const people = unitStaff(offices);
      const active = people.filter(s => nowRows.some(r => r.sl === s.name)).length;
      return {
        actual: n, target, gap: n - target, rate: target ? n / target : 0,
        last, yoy, people: people.length, moved: active,
        lastPct: last ? (n - last) / last : (n ? 1 : 0),
        yoyPct: yoy ? (n - yoy) / yoy : (n ? 1 : 0),
        util: people.length ? active / people.length : 0,
        avg: people.length ? n / people.length : 0
      };
    };
    const decorate = (node) => {
      const kids = (node.kids || []).map(decorate);
      return { ...node, kids, m: metrics(node.id) };
    };
    const ownerOf = (id, name) => {
      if (id === '__SEL__') return '—';
      return LOOKUP.owners[id] || LOOKUP.owners[name] || ownerName(unitOfficeSet(id), name) || '—';
    };
    const root = pruneIdleSalesOffices(decorate(scopedUnitTree()), n => n.m && n.m.actual) || decorate(scopedUnitTree());
    let sortKey = state.cmpTblSort || state.cmpSort || '';
    if (!withT && ['target', 'gap', 'rate'].includes(sortKey)) sortKey = 'actual';
    if (sortKey) {
      sortUnitTree(root, n => {
        if (sortKey === 'name') return n.name;
        if (sortKey === 'owner') return ownerOf(n.id, n.name);
        return n.m[sortKey];
      }, state.cmpTblDir || 'desc');
    }
    const rateCell = (a, t) => {
      const r = t ? Math.max(0, Math.min(100, a / t * 100)) : 0;
      return `<div class="rate-cell"><span class="rate-mini"><i style="width:${r}%"></i></span><span class="rate-pct">${t ? (a / t * 100).toFixed(1) : '0.0'}%</span></div>`;
    };
    const gapHtml = v => {
      const n = Math.round(v);
      return `<span class="${n < 0 ? 'neg' : ''}">${n > 0 ? '+' : ''}${fmt(n)}</span>`;
    };
    const rows = [];
    const walk = (node, depth) => {
      const hasKids = node.kids && node.kids.length;
      const isOpen = node.id === '__SEL__' || open.has(node.id);
      const pad = 6 + depth * 14;
      const tog = hasKids
        ? `<button type="button" class="unit-tog" data-unit="${node.id}">${isOpen ? '▾' : '▸'}</button>`
        : `<span class="unit-tog-sp"></span>`;
      const m = node.m;
      const on = node.id === root.id ? ' on' : '';
      rows.push(`<tr class="${on}">
        <td class="left unit-name" style="padding-left:${pad}px">${tog}<span>${node.name}</span></td>
        <td class="left">${ownerOf(node.id, node.name) || '—'}</td>
        ${withT ? `<td>${fmt(m.target)}</td>` : ''}
        <td>${fmt(m.actual)}</td>
        ${withT ? `<td>${gapHtml(m.gap)}</td><td class="rate-h">${rateCell(m.actual, m.target)}</td>` : ''}
        <td>${fmt(m.last)}</td>
        <td>${cmpChg(m.actual, m.last)}</td>
        <td>${fmt(m.yoy)}</td>
        <td>${cmpChg(m.actual, m.yoy)}</td>
        <td>${fmt(m.people)}</td>
        <td>${fmt(m.moved)}</td>
        <td>${pct(m.util)}</td>
        <td>${m.avg ? m.avg.toFixed(1) : '0.0'}</td>
      </tr>`);
      if (hasKids && isOpen) node.kids.forEach(k => walk(k, depth + 1));
    };
    walk(root, 0);
    $('cmpTable').innerHTML = `<table class="unit-cmp"><colgroup>
      <col class="u"><col class="o">${withT ? '<col class="n"><col class="n"><col class="n"><col class="rate">' : '<col class="n">'}
      <col class="n"><col class="n"><col class="n"><col class="n"><col class="n"><col class="n"><col class="n"><col class="n">
    </colgroup><thead><tr>
      ${tblTh('cmp', 'name', '單位')}${tblTh('cmp', 'owner', '擔當者')}${withT ? tblTh('cmp', 'target', '目標') : ''}${tblTh('cmp', 'actual', '實績')}${withT ? `${tblTh('cmp', 'gap', '差異')}${tblTh('cmp', 'rate', '目標達成率', 'rate-h')}` : ''}
      ${tblTh('cmp', 'last', '上月')}${tblTh('cmp', 'lastPct', '上月比')}${tblTh('cmp', 'yoy', '同期')}${tblTh('cmp', 'yoyPct', '同期比')}
      ${tblTh('cmp', 'people', '組織人數')}${tblTh('cmp', 'moved', '實動人數')}${tblTh('cmp', 'util', '人員稼動')}${tblTh('cmp', 'avg', '人均件數')}
    </tr></thead><tbody>${rows.join('')}</tbody></table>`;
    renderPerfCmpIntel(root, withT);
  }
  function perfCmpJudgeLines(root, withT) {
    const m = root.m || {};
    const name = root.name || '所選單位';
    if (!m.actual && !m.target) return [`${name}在此期間無符合件數。`];
    const pp = v => `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}`;
    const lines = [];
    if (withT) {
      lines.push(`${name}實績 ${fmt(m.actual)} 件，目標 ${fmt(m.target)} 件，達成率 ${(m.rate * 100).toFixed(1)}%，差異 ${m.gap > 0 ? '+' : ''}${fmt(m.gap)} 件。`);
    } else {
      lines.push(`${name}實績 ${fmt(m.actual)} 件。`);
    }
    lines.push(`去年同期 ${fmt(m.yoy)} 件，同期比 ${pp(m.yoyPct * 100)}%。`);
    lines.push(`上月 ${fmt(m.last)} 件，上月比 ${pp(m.lastPct * 100)}%。`);
    if (m.people) lines.push(`組織 ${fmt(m.people)} 人、實動 ${fmt(m.moved)} 人，稼動 ${pct(m.util)}，人均 ${m.avg ? m.avg.toFixed(1) : '0.0'} 件。`);
    return lines;
  }
  function perfCmpClusterLines(root, withT) {
    const kids = (root.kids || []).filter(k => k.m && (k.m.actual || k.m.target));
    if (!kids.length) return ['所選範圍目前沒有可展開的下層單位，依本列數字判讀即可。'];
    const byRate = [...kids].sort((a, b) => (withT ? (b.m.rate - a.m.rate) : (b.m.actual - a.m.actual)) || b.m.actual - a.m.actual || a.name.localeCompare(b.name, 'zh-Hant'));
    const byN = [...kids].sort((a, b) => b.m.actual - a.m.actual || a.name.localeCompare(b.name, 'zh-Hant'));
    const hi = byRate[0];
    const lo = byRate[byRate.length - 1];
    const top = byN[0];
    const lines = [];
    const rateBit = n => withT ? `，達成率 ${(n.m.rate * 100).toFixed(1)}%` : '';
    if (hi) lines.push(`${hi.name}實績 ${fmt(hi.m.actual)} 件${rateBit(hi)}，為下層最高。`);
    if (lo && lo !== hi) lines.push(`${lo.name}實績 ${fmt(lo.m.actual)} 件${rateBit(lo)}，為下層最低。`);
    if (top && root.m && root.m.actual) lines.push(`${top.name}總件 ${fmt(top.m.actual)} 件，占${root.name} ${revPct(top.m.actual, root.m.actual)}%。`);
    if (withT) {
      const below = kids.filter(k => k.m.target && k.m.rate < 1);
      if (below.length) lines.push(`下層 ${fmt(below.length)} 個單位未達目標 100%，宜優先看件數較多且達成率偏低者。`);
    }
    return lines;
  }
  function renderPerfCmpIntel(root, withT) {
    const name = root.name || '所選單位';
    if ($('cmpJudge')) $('cmpJudge').innerHTML = `<h4>智慧分析（${esc(name)}）</h4>${perfCmpJudgeLines(root, withT).map(t => `<p>${esc(t)}</p>`).join('')}`;
    if ($('cmpFocusNote')) $('cmpFocusNote').innerHTML = `<h4>單位觀察：下層結構</h4>${perfCmpClusterLines(root, withT).map(t => `<p>${esc(t)}</p>`).join('')}`;
  }

  function isCrabFt(r) {
    return String(r.ft || '').includes('寄居');
  }
  function crabNormSo(so) {
    return so === '電銷部' ? '電服部' : (so || '—');
  }
  function crabOfficeOf(r, reassign) {
    const so = crabNormSo(r.so);
    if (reassign && isCrabFt(r) && so === '電服部') return '北一處';
    return so;
  }
  function crabUniverse(start, end) {
    return uniqueById(ROWS.filter(r => {
      if (state.cities.length !== CITIES.length && !state.cities.includes(normCity(r.city))) return false;
      if (state.periods.length !== PERIODS.length && !state.periods.includes(r.p)) return false;
      if (!NEW_CHILDREN.includes(r.ft)) return false;
      if (!isPerf(r)) return false;
      return startIn(r, start, end);
    }));
  }
  function crabKeep(r, reassign) {
    const offices = selectedOffices();
    if (!offices) return true;
    return offices.has(crabOfficeOf(r, reassign));
  }
  function crabNewRows(start, end, reassign) {
    const use = reassign == null ? true : !!reassign;
    return crabUniverse(start, end).filter(r => crabKeep(r, use));
  }
  function crabSplit(rows) {
    const crab = rows.filter(isCrabFt);
    return { all: rows.length, crab: crab.length, non: rows.length - crab.length };
  }
  function crabByOffice(rows, reassign) {
    const m = new Map();
    rows.forEach(r => {
      const so = crabOfficeOf(r, reassign == null ? true : !!reassign);
      if (!m.has(so)) m.set(so, { all: 0, crab: 0, non: 0 });
      const o = m.get(so);
      o.all += 1;
      if (isCrabFt(r)) o.crab += 1; else o.non += 1;
    });
    return m;
  }
  function crabSigned(n) {
    const v = Math.round(Number(n) || 0);
    return (v > 0 ? '+' : '') + fmt(v);
  }
  function crabMom(now, prev) {
    if (!prev) return null;
    return (now - prev) / prev * 100;
  }
  function crabMomTxt(now, prev) {
    const p = crabMom(now, prev);
    if (p == null || !isFinite(p)) return '—';
    return `${p > 0 ? '+' : ''}${p.toFixed(1)}%`;
  }
  function crabCls(n) {
    if (n > 0) return 'pos';
    if (n < 0) return 'neg';
    return '';
  }
  function crabPpTxt(n) {
    if (n == null || !isFinite(n)) return '—';
    const r = Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1);
    return `${n > 0 ? '+' : ''}${r}%`;
  }
  function crabTd(n, cls) {
    return `<td class="${cls || ''}">${n}</td>`;
  }
  function crabTint(n) {
    if (n > 0) return 'tint-up';
    if (n < 0) return 'tint-dn';
    return '';
  }
  function renderCrabImpact() {
    if (!$('crabKpis')) return;
    const y = state.end.getFullYear();
    const filterM = state.end.getMonth() + 1;
    const grain = state.crabGrain || 'month';
    const isYear = grain === 'year';
    const pick = state.crabPick || filterM;
    const viewM = isYear ? filterM : pick;
    const prev = addMonths(new Date(y, viewM - 1, 1), -1);
    const py = prev.getFullYear(), pm = prev.getMonth() + 1;
    const salesSo = so => SALES_OFFICES.includes(so);
    const officesWith = (rows, reassign) => new Set(rows.map(r => crabOfficeOf(r, reassign)).filter(salesSo));
    const salesNon = (rows, reassign) => rows.filter(r => !isCrabFt(r) && salesSo(crabOfficeOf(r, reassign))).length;
    const pack = (rows, reassign) => {
      const sp = crabSplit(rows);
      const offN = officesWith(rows, reassign).size;
      const sNon = salesNon(rows, reassign);
      return { rows, ...sp, offN, sNon, avg: offN ? sNon / offN : 0, share: sp.all ? sp.crab / sp.all : 0 };
    };
    const monthRows = i => {
      const start = new Date(y, i - 1, 1);
      return crabUniverse(start, monthEnd(start));
    };
    const cachedMonths = Array.from({ length: 12 }, (_, i) => monthRows(i + 1));
    const nodePack = (set, i) => {
      const rows = cachedMonths[i - 1].filter(r => {
        const so = crabOfficeOf(r, true);
        if (!crabKeep(r, true)) return false;
        return !set || set.has(so);
      });
      return { i, rows, ...crabSplit(rows) };
    };
    const yoyNodePack = (set, i) => {
      const start = new Date(y - 1, i - 1, 1);
      const rows = crabUniverse(start, monthEnd(start)).filter(r => {
        if (!crabKeep(r, false)) return false;
        return !set || set.has(crabOfficeOf(r, false));
      });
      return { i, rows, ...crabSplit(rows) };
    };
    const decorate = (node) => {
      const kids = (node.kids || []).map(decorate);
      const set = unitOfficeSet(node.id);
      const mm = Array.from({ length: 12 }, (_, i) => nodePack(set, i + 1));
      const now = isYear
        ? mm.filter(x => x.i <= viewM).reduce((a, x) => ({ all: a.all + x.all, crab: a.crab + x.crab, non: a.non + x.non, rows: a.rows.concat(x.rows) }), { all: 0, crab: 0, non: 0, rows: [] })
        : mm[viewM - 1];
      const lastN = isYear
        ? Array.from({ length: viewM }, (_, i) => yoyNodePack(set, i + 1)).reduce((a, x) => ({ all: a.all + x.all, non: a.non + x.non }), { all: 0, non: 0 })
        : (viewM === 1 ? yoyNodePack(set, 12) : mm[viewM - 2]);
      const lastNon = isYear ? lastN.all : lastN.non;
      return { ...node, kids, rows: now.rows || [], c: { all: now.all, crab: now.crab, non: now.non, lastNon }, months: mm };
    };
    const root = pruneIdleSalesOffices(decorate(scopedUnitTree()), n => n.c && n.c.crab) || decorate(scopedUnitTree());
    const open = new Set(state.crabOpen || []);
    const monthOpen = new Set(state.crabMonthOpen || []);
    if (!findUnitNode(root, state.crabFocus || '')) state.crabFocus = root.id;
    const focus = state.crabFocus || root.id;
    const focusNode = findUnitNode(root, focus) || root;
    const focusSet = unitOfficeSet(focusNode.id);
    const months = (focusNode.months || []).map(x => ({ i: x.i, ...pack(x.rows || [], true) }));
    const yoyMonths = Array.from({ length: 12 }, (_, i) => {
      const p = yoyNodePack(focusSet, i + 1);
      return { i: i + 1, ...pack(p.rows || [], false) };
    });
    const sumPack = list => list.reduce((a, x) => ({
      all: a.all + x.all, crab: a.crab + x.crab, non: a.non + x.non, sNon: a.sNon + x.sNon, rows: a.rows.concat(x.rows)
    }), { all: 0, crab: 0, non: 0, sNon: 0, rows: [] });
    const finishYtd = (s, thru, srcMonths) => {
      const offKeys = new Set();
      srcMonths.filter(x => x.i <= thru).forEach(x => officesWith(x.rows, true).forEach(o => offKeys.add(o)));
      const offN = offKeys.size;
      return { ...s, offN, avg: offN ? s.sNon / offN : 0, share: s.all ? s.crab / s.all : 0 };
    };
    const ytd = finishYtd(sumPack(months.filter(x => x.i <= viewM)), viewM, months);
    const yoyYtd = finishYtd(sumPack(yoyMonths.filter(x => x.i <= viewM)), viewM, yoyMonths);
    const curM = months[viewM - 1];
    const lastM = viewM === 1
      ? pack(crabNewRows(new Date(y - 1, 11, 1), monthEnd(new Date(y - 1, 11, 1)), true), true)
      : months[viewM - 2];
    const yoyM = yoyMonths[viewM - 1];
    const cur = isYear ? ytd : curM;
    const last = isYear ? { all: 0, crab: 0, non: 0, offN: 0, sNon: 0, avg: 0, share: 0, rows: [] } : lastM;
    const yoy = isYear ? yoyYtd : yoyM;
    const yoyDev = yoy.all;
    const curRows = cur.rows || [];
    const lastRows = last.rows || [];
    const moved = curRows.filter(r => isCrabFt(r) && crabNormSo(r.so) === '電服部').length;
    const curShare = cur.share, lastShare = last.share;
    const pp = (curShare - lastShare) * 100;
    const dAll = cur.all - last.all, dCrab = cur.crab - last.crab, dNon = cur.non - last.non;
    const dOff = cur.offN - last.offN, dAvg = cur.avg - last.avg;
    const yoyNonPct = yoyDev ? (cur.non - yoyDev) / yoyDev * 100 : null;
    const yoyOffPct = yoy.offN ? (cur.offN - yoy.offN) / yoy.offN * 100 : null;
    const yoyAvgBase = yoy.offN ? yoyDev / yoy.offN : 0;
    const yoyAvgPct = yoyAvgBase ? (cur.avg - yoyAvgBase) / yoyAvgBase * 100 : null;
    if ($('crabSeg')) $('crabSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === grain));
    if ($('crabStaffBtn')) $('crabStaffBtn').classList.toggle('on', !!state.crabStaffOpen);
    $('crabNote').textContent = `起租月口徑｜包租、代管（不含轉租）｜新媒合｜排除暫存／停用｜轉銜不列開發｜電服轉銜案件預設改歸北一處，各月皆同（本期 ${fmt(moved)} 件）｜目前單位：${focusNode.name}｜點柱狀切換月份`;
    const lab = isYear ? `1–${viewM}月` : `${viewM}月`;
    const lastLab = isYear ? '' : `${pm}月`;
    $('crabKpis').innerHTML = `
      <div class="card kpi">
        <div class="k">${lab}全部新媒合</div>
        <div class="v">${fmt(cur.all)}<span class="unit"> 件</span></div>
        <div class="s">${isYear ? `轉銜${fmt(cur.crab)}件不列開發` : `較${lastLab}${fmt(last.all)}件${last.all >= cur.all ? '少' : '多'}${fmt(Math.abs(cur.all - last.all))}件`}</div>
      </div>
      <div class="card kpi">
        <div class="k">${lab}轉銜案件</div>
        <div class="v">${fmt(cur.crab)}<span class="unit"> 件</span></div>
        <div class="s">占${lab}${revPct(cur.crab, cur.all)}％｜不列開發</div>
      </div>
      <div class="card kpi">
        <div class="k">${lab}非轉銜</div>
        <div class="v">${fmt(cur.non)}<span class="unit"> 件</span></div>
        <div class="s">${isYear ? `開發件＝非轉銜` : `較${lastLab}${fmt(last.non)}件${last.non >= cur.non ? '少' : '多'}${fmt(Math.abs(cur.non - last.non))}件`}</div>
      </div>
      <div class="card kpi ${(!isYear && crabMom(cur.non, last.non) < 0) || (isYear && yoyNonPct < 0) ? 'down' : ''}">
        <div class="k">${isYear ? '非轉銜同期比' : '非轉銜上月比'}</div>
        <div class="v">${isYear ? (yoyNonPct == null ? '—' : crabPpTxt(yoyNonPct)) : crabMomTxt(cur.non, last.non)}</div>
        <div class="s">${isYear ? '去年無轉銜，以今年非轉銜對去年全部' : `不以情境值代替${lastLab}資料`}</div>
      </div>`;
    const dash = '—';
    const yoyShare = 0;
    const ytdDiffNon = cur.non - yoyDev;
    const ytdDiffOff = cur.offN - yoy.offN;
    const ytdDiffAvg = cur.avg - yoyAvgBase;
    const markDiff = (txt, n) => crabTd(txt, `${crabCls(n)} ${crabTint(n)}`.trim());
    const cmpHead = isYear
      ? `<th>比較項目</th><th>1–${viewM}月</th><th>累計差異</th><th>同期1–${viewM}月</th><th>同期比</th>`
      : `<th>比較項目</th><th>${viewM}月</th><th>${pm}月</th><th>差異</th><th>上月比</th><th>同期</th><th>同期比</th>`;
    const yearRows = `
      <tr><td>有業績營業處數</td><td>${fmt(cur.offN)}</td>${crabTd(crabSigned(ytdDiffOff) + '處', crabCls(ytdDiffOff))}<td>${fmt(yoy.offN)}</td>${crabTd(yoy.offN ? crabPpTxt(yoyOffPct) : dash, crabCls(yoyOffPct))}</tr>
      <tr><td>全部新媒合</td><td>${fmt(cur.all)}</td><td>${dash}</td><td>${fmt(yoyDev)}</td><td>${dash}</td></tr>
      <tr><td>寄居蟹轉銜</td><td>${fmt(cur.crab)}</td><td>${dash}</td><td>0</td><td>${dash}</td></tr>
      <tr class="mark"><td>非轉銜新媒合</td><td>${fmt(cur.non)}</td>${markDiff(crabSigned(ytdDiffNon), ytdDiffNon)}<td>${fmt(yoyDev)}</td>${markDiff(yoyDev ? crabPpTxt(yoyNonPct) : dash, yoyNonPct)}</tr>
      <tr><td>轉銜占比</td><td>${revPct(cur.crab, cur.all)}%</td><td>${dash}</td><td>${yoyShare.toFixed(1)}%</td><td>${dash}</td></tr>
      <tr><td>非轉銜營業處均件</td><td>${cur.avg.toFixed(2)}</td>${crabTd(`${ytdDiffAvg >= 0 ? '+' : ''}${ytdDiffAvg.toFixed(2)}`, crabCls(ytdDiffAvg))}<td>${yoyAvgBase.toFixed(2)}</td>${crabTd(yoyAvgBase ? crabPpTxt(yoyAvgPct) : dash, crabCls(yoyAvgPct))}</tr>`;
    const monthRowsHtml = `
      <tr><td>有業績營業處數</td><td>${fmt(cur.offN)}</td><td>${fmt(last.offN)}</td>
        ${crabTd(crabSigned(dOff) + '處', crabCls(dOff))}
        ${crabTd(crabMomTxt(cur.offN, last.offN), crabCls(dOff))}
        <td>${fmt(yoy.offN)}</td>${crabTd(yoy.offN ? crabPpTxt(yoyOffPct) : dash, crabCls(yoyOffPct))}</tr>
      <tr><td>全部新媒合</td><td>${fmt(cur.all)}</td><td>${fmt(last.all)}</td>
        ${crabTd(crabSigned(dAll), crabCls(dAll))}
        ${crabTd(crabMomTxt(cur.all, last.all), crabCls(dAll))}
        <td>${fmt(yoyDev)}</td><td>${dash}</td></tr>
      <tr><td>寄居蟹轉銜</td><td>${fmt(cur.crab)}</td><td>${fmt(last.crab)}</td>
        ${crabTd(crabSigned(dCrab), crabCls(dCrab))}
        ${crabTd(crabMomTxt(cur.crab, last.crab), crabCls(dCrab))}
        <td>0</td><td>${dash}</td></tr>
      <tr class="mark"><td>非轉銜新媒合</td><td>${fmt(cur.non)}</td><td>${fmt(last.non)}</td>
        ${markDiff(crabSigned(dNon), dNon)}
        ${markDiff(crabMomTxt(cur.non, last.non), dNon)}
        <td>${fmt(yoyDev)}</td>${markDiff(yoyDev ? crabPpTxt(yoyNonPct) : dash, yoyNonPct)}</tr>
      <tr><td>轉銜占比</td><td>${revPct(cur.crab, cur.all)}%</td><td>${revPct(last.crab, last.all)}%</td>
        ${crabTd(crabPpTxt(pp), crabCls(pp))}
        ${crabTd(crabPpTxt(pp), crabCls(pp))}
        <td>${yoyShare.toFixed(1)}%</td><td>${dash}</td></tr>
      <tr><td>非轉銜營業處均件</td><td>${cur.avg.toFixed(2)}</td><td>${last.avg.toFixed(2)}</td>
        ${crabTd(`${dAvg >= 0 ? '+' : ''}${dAvg.toFixed(2)}`, crabCls(dAvg))}
        ${crabTd(crabMomTxt(cur.avg, last.avg), crabCls(dAvg))}
        <td>${yoyAvgBase.toFixed(2)}</td>${crabTd(yoyAvgBase ? crabPpTxt(yoyAvgPct) : dash, crabCls(yoyAvgPct))}</tr>`;
    $('crabCmpTbl').innerHTML = `<table class="crab-tbl"><thead><tr>${cmpHead}</tr></thead><tbody>${isYear ? yearRows : monthRowsHtml}</tbody></table>`;
    const dropShare = dAll ? Math.abs(dNon) / Math.abs(dAll) * 100 : 0;
    const n1 = crabByOffice(curRows).get('北一處') || { all: 0, crab: 0, non: 0 };
    const tel = crabByOffice(curRows).get('電服部') || { all: 0, crab: 0, non: 0 };
    const telRaw = crabByOffice(curRows, false).get('電服部') || { all: 0, crab: 0, non: 0 };
    $('crabJudge').innerHTML = isYear ? `<h4>管理結論（${esc(focusNode.name)}）</h4>
      <p>${esc(`1至${viewM}月全部${fmt(cur.all)}件，轉銜${fmt(cur.crab)}件不列開發；開發件以非轉銜${fmt(cur.non)}件計，較去年同期${fmt(yoyDev)}件${ytdDiffNon >= 0 ? '增' : '減'}${fmt(Math.abs(ytdDiffNon))}件，同期比${yoyNonPct == null ? '—' : crabPpTxt(yoyNonPct)}。`)}</p>
      <p>去年沒有轉銜案件，屬今年特殊狀況。同期欄為去年1至${viewM}月全部新媒合；同期比只比較今年非轉銜與去年全部，不做含轉銜的年增比較。</p>
      <p>${esc(`電服轉銜案件預設改歸北一處，各月皆同（本期改歸${fmt(moved)}件），公司總量不變；目前北一處${fmt(n1.all)}件、電服${fmt(tel.all)}件。`)}</p>
      <p>${esc(`1至${viewM}月轉銜占${revPct(cur.crab, cur.all)}%。有業績營業處數${fmt(cur.offN)}處，去年同期${fmt(yoy.offN)}處；非轉銜營業處均件${cur.avg.toFixed(2)}，去年${yoyAvgBase.toFixed(2)}。`)}</p>`
    : `<h4>管理結論（${esc(focusNode.name)}）</h4>
      <p>${esc(`${viewM}月較${pm}月${dAll < 0 ? '減' : '增'}${fmt(Math.abs(dAll))}件中，非轉銜${dNon < 0 ? '少' : '多'}${fmt(Math.abs(dNon))}件，占變量${dropShare.toFixed(1)}%；轉銜不列開發，不宜將月減主要歸因轉銜增減。`)}</p>
      <p>${esc(`轉銜${dCrab < 0 ? '少' : '多'}${fmt(Math.abs(dCrab))}件，占比${pp >= 0 ? '升' : '降'}${crabPpTxt(Math.abs(pp))}；開發觀察以非轉銜為準。`)}</p>
      <p>${esc(yoyDev ? `去年${viewM}月無轉銜（${fmt(yoyDev)}件皆視為非轉銜）。同期比僅今年非轉銜${fmt(cur.non)}件對去年全部，${crabPpTxt(yoyNonPct)}。` : '去年同期基期尚缺，暫不列同期比。')}</p>
      <p>${esc(`電服轉銜案件預設改歸北一處，各月皆同${moved ? `（本期${fmt(moved)}件）` : ''}，公司總量不變；北一處${fmt(n1.all)}件、電服${fmt(tel.all)}件。`)}</p>
      <p>${esc(`有業績營業處數${fmt(cur.offN)}處，去年同期${fmt(yoy.offN)}處。非轉銜營業處均件${cur.avg.toFixed(2)}，去年（全部÷處數）${yoyAvgBase.toFixed(2)}。`)}</p>`;
    $('crabTrendNote').textContent = `深藍非轉銜、淺藍轉銜；點柱切換本月數字。柱內為件數，柱上為總件與轉銜占比。1至${filterM}月累計${fmt(finishYtd(sumPack(months.filter(x => x.i <= filterM)), filterM, months).all)}件。`;
    const maxBar = Math.max(...months.map(x => x.all), 1);
    $('crabMonthBars').innerHTML = `<div class="crab-vbars">${months.map(x => {
      const h = x.all ? Math.max(8, (x.all / maxBar) * 100) : 3;
      const crabH = x.all ? (x.crab / x.all) * 100 : 0;
      const nonH = x.all ? (x.non / x.all) * 100 : 0;
      const on = !isYear && x.i === viewM;
      return `<div class="crab-vcol${on ? ' on' : ''}" data-crab-m="${x.i}">
        <div class="crab-vnum">${x.all ? fmt(x.all) : '—'}</div>
        <div class="crab-vpct">${x.all ? revPct(x.crab, x.all) + '%' : ''}</div>
        <div class="crab-vtrack"><div class="crab-vbar" style="height:${h}%">
          <i class="non" style="flex:${Math.max(nonH, x.non ? 0.01 : 0.001)}">${x.non ? fmt(x.non) : ''}</i>
          <i class="crab" style="flex:${Math.max(crabH, x.crab ? 0.01 : 0)}">${x.crab ? fmt(x.crab) : ''}</i>
        </div></div>
        <div class="crab-vlbl">${x.i}月</div>
      </div>`;
    }).join('')}</div>`;
    const html = [];
    const walk = (node, depth) => {
      const hasKids = node.kids && node.kids.length;
      const isOpen = node.id === '__SEL__' || open.has(node.id);
      const tog = hasKids
        ? `<button type="button" class="unit-tog" data-crab-open="${node.id}">${isOpen ? '▾' : '▸'}</button>`
        : `<span class="unit-tog-sp"></span>`;
      const on = node.id === focus ? ' on' : '';
      const d = node.c.non - node.c.lastNon;
      html.push(`<tr class="${on}" data-crab-focus="${node.id}">
        ${unitCellHtml(node, depth, tog)}
        <td class="v num-hit" data-crab-months="${node.id}">${fmt(node.c.all)}</td>
        <td class="v num-hit" data-crab-months="${node.id}">${fmt(node.c.crab)}</td>
        <td class="v num-hit" data-crab-months="${node.id}">${fmt(node.c.non)}</td>
        <td class="v num-hit" data-crab-months="${node.id}">${fmt(node.c.lastNon)}</td>
        <td class="${crabCls(d)}">${crabSigned(d)}</td>
        <td class="${crabCls(d)}">${isYear ? (node.c.lastNon ? crabPpTxt((node.c.non - node.c.lastNon) / node.c.lastNon * 100) : '—') : crabMomTxt(node.c.non, node.c.lastNon)}</td>
      </tr>`);
      if (monthOpen.has(node.id)) {
        html.push(`<tr class="crab-mdetail"><td colspan="7"><table class="crab-mini"><thead><tr>
          <th>月</th><th>全部</th><th>轉銜</th><th>非轉銜</th><th>轉銜占比</th>
        </tr></thead><tbody>${node.months.map(x => `<tr class="${x.i === viewM ? 'on' : ''}">
          <td>${x.i}月</td><td>${fmt(x.all)}</td><td>${fmt(x.crab)}</td><td>${fmt(x.non)}</td>
          <td>${x.all ? revPct(x.crab, x.all) + '%' : '—'}</td>
        </tr>`).join('')}</tbody></table></td></tr>`);
      }
      if (hasKids && isOpen) node.kids.forEach(k => walk(k, depth + 1));
    };
    walk(root, 0);
    $('crabUnitNote').textContent = `僅列有轉銜的單位｜點數字展開月細｜電服轉銜預設改歸北一處｜${isYear ? `1–${viewM}月對去年1–${viewM}月（去年無轉銜）` : `上月為${pm}月非轉銜`}`;
    $('crabUnitTbl').innerHTML = `<table class="type-tbl ana-tbl"><thead><tr>
      <th>單位／擔當者</th><th>${isYear ? `1–${viewM}月全部` : `${viewM}月全部`}</th><th>${isYear ? `1–${viewM}月轉銜` : `${viewM}月轉銜`}</th>
      <th>${isYear ? `1–${viewM}月非轉銜` : `${viewM}月非轉銜`}</th><th>${isYear ? `去年1–${viewM}月` : `${pm}月非轉銜`}</th>
      <th>${isYear ? '累計差異' : '非轉銜增減'}</th><th>${isYear ? '同期比' : '非轉銜上月比'}</th>
    </tr></thead><tbody>${html.join('')}</tbody></table>`;

    const lastOff = crabByOffice(lastRows);
    const n1Last = lastOff.get('北一處') || { non: 0, all: 0 };
    const telLast = lastOff.get('電服部') || { non: 0 };
    const n5 = crabByOffice(curRows).get('北五處') || { all: 0, crab: 0, non: 0 };
    const n1d = n1.non - n1Last.non;
    const teld = tel.non - telLast.non;
    const scopeTop = focusNode.id === '全公司' || focusNode.id === '營業部' || focusNode.id === '__SEL__';
    $('crabUnitJudge').innerHTML = `<h4>解讀歸屬與非轉銜開發</h4>
      ${scopeTop ? (isYear ? `
      <p>${esc(`1至${viewM}月北一處全部${fmt(n1.all)}件（含轉銜${fmt(n1.crab)}件，不列開發）；非轉銜${fmt(n1.non)}件。電服轉銜預設改歸北一處，只改歸屬、不增加開發件。`)}</p>
      <p>${esc(`電服累計${fmt(tel.all)}件皆為非轉銜；開發觀察以此列。`)}</p>
      <p>${esc(`北五處非轉銜${fmt(n5.non)}件；轉銜${fmt(n5.crab)}件不列該處開發。`)}</p>` : `
      <p>${esc(`北一處：${viewM}月全部${fmt(n1.all)}件（含轉銜${fmt(n1.crab)}件，不列開發）；非轉銜${fmt(n1.non)}件，較${pm}月${fmt(n1Last.non)}件${n1d < 0 ? '減' : '增'}${fmt(Math.abs(n1d))}件。電服轉銜預設改歸北一處，各月皆同${moved ? `（本期移入${fmt(moved)}件）` : ''}，只改歸屬、不增加開發件。`)}</p>
      <p>${esc(`電服：改歸後${viewM}月${fmt(tel.all)}件皆為非轉銜；開發觀察以此列。原始含轉銜${fmt(telRaw.all)}件。`)}</p>
      <p>${esc(`北五處非轉銜${fmt(n5.non)}件；轉銜${fmt(n5.crab)}件不列該處開發。`)}</p>`) : `
      <p>${esc(`${focusNode.name}：${lab}全部${fmt(cur.all)}件（轉銜${fmt(cur.crab)}件不列開發）；非轉銜${fmt(cur.non)}件${isYear ? '' : `，較${pm}月${fmt(last.non)}件${dNon < 0 ? '減' : '增'}${fmt(Math.abs(dNon))}件`}。`)}</p>
      <p>電服轉銜案件預設改歸北一處，只改歸屬、不增加開發件。</p>`}`;
    const curOffMap = crabByOffice(curRows);
    const supportNon = ((lastOff.get('業務支援管理部') || { non: 0 }).non) - ((curOffMap.get('業務支援管理部') || { non: 0 }).non);
    const dNonS = cur.sNon - last.sNon;
    $('crabTrack').innerHTML = `<h4>管理追蹤重點</h4>
      ${isYear ? `
      <p>${esc(`1至${viewM}月開發件（非轉銜）${fmt(cur.non)}件，同期比${yoyNonPct == null ? '—' : crabPpTxt(yoyNonPct)}。轉銜${fmt(cur.crab)}件另列專案，不計開發達成。`)}</p>
      <p>累計分析不以單月增減解讀開發能力；結績後重跑。</p>` : `
      <p>${esc(`開發件（非轉銜）${dNon < 0 ? '減少' : '增加'}${fmt(Math.abs(dNon))}件。轉銜${fmt(cur.crab)}件另列專案，不計開發達成。`)}</p>
      <p>${esc(`營業處非轉銜${dNonS < 0 ? '減' : '增'}${fmt(Math.abs(dNonS))}件，電服非轉銜${teld < 0 ? '減' : '增'}${fmt(Math.abs(teld))}件，支援變動${fmt(Math.abs(supportNon))}件。`)}</p>
      <p>${esc(`${pm}月對${viewM}月為目前進度，結績後重跑；不因轉銜件數解讀開發能力。`)}</p>`}`;
    renderCrabStaff(focusNode.rows || [], focusNode.name || '全公司');
  }
  function renderCrabStaff(rows, scopeName) {
    const box = $('crabStaffBox');
    if (!box) return;
    bindStaffBox('crabStaffBox', 'crab');
    box.classList.toggle('hidden', !state.crabStaffOpen);
    if (!state.crabStaffOpen) {
      if (state.staffCase && state.staffCase.kind === 'crab') state.staffCase = null;
      box.innerHTML = '';
      return;
    }
    const map = new Map();
    rows.forEach(r => {
      const name = r.sl || '—';
      const office = crabOfficeOf(r, true);
      const key = office + '\t' + name;
      if (!map.has(key)) map.set(key, { office, name, rows: [] });
      map.get(key).rows.push(r);
    });
    const people = sortStaffPeople([...map.values()].map(p => {
      const crab = p.rows.filter(isCrabFt).length;
      const non = p.rows.length - crab;
      return { ...p, crab, non, total: p.rows.length };
    }), state.crabStaffSort || 'total', state.crabStaffDir || 'desc');
    staffPeople.crab = people;
    box.innerHTML = `
      ${staffHead(esc(scopeName) + ' ｜ 轉銜專案業務明細（轉銜不列開發）')}
      <p class="src-staff-k">非轉銜${fmt(people.reduce((s, p) => s + p.non, 0))}件、轉銜${fmt(people.reduce((s, p) => s + p.crab, 0))}件。點數字展開案件明細</p>
      <div class="src-staff-scroll"><table class="src-combo"><thead><tr>
        <th data-sort="office" class="${staffSortMark('crab', 'office')}">業務營業處</th>
        <th data-sort="name" class="${staffSortMark('crab', 'name')}">業務</th>
        <th data-sort="non" class="${staffSortMark('crab', 'non')}">非轉銜</th>
        <th data-sort="crab" class="${staffSortMark('crab', 'crab')}">轉銜</th>
        <th data-sort="total" class="${staffSortMark('crab', 'total')}">總件數</th>
      </tr></thead><tbody>
        ${people.map(p => `<tr>
          <td>${esc(p.office)}</td><td class="name-hit">${esc(p.name)}</td>
          ${numTd(p.non, 'non')}${numTd(p.crab, 'crab')}${numTd(p.total, 'total')}
        </tr>`).join('') || '<tr><td colspan="5">無資料</td></tr>'}
      </tbody></table></div>
      ${staffCasePanel('crab')}`;
  }

  function renderGrowAnalysis() {
    if (!$('growKpis')) return;
    const y = state.end.getFullYear();
    const filterM = state.end.getMonth() + 1;
    const grain = state.growGrain || 'month';
    const isYear = grain === 'year';
    const pick = state.growPick || filterM;
    const viewM = Math.min(isYear ? filterM : pick, filterM);
    const prev = addMonths(new Date(y, viewM - 1, 1), -1);
    const py = prev.getFullYear(), pm = prev.getMonth() + 1;
    const typeLab = leaseTypeShort() || '新媒合';
    const officeLab = ddLabel('office');
    const rocY = y - 1911;
    const monthsAll = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      return { m, rows: monthLeaseRows(y, m), yoyRows: monthLeaseRows(y - 1, m) };
    });
    const lastYearLast = monthLeaseRows(py, pm);
    const packRows = (rows, yoyRows, tgt) => {
      const n = rows.length;
      const yoyN = yoyRows.length;
      return { rows, n, yoyN, tgt, offN: salesOfficeCount(rows), yoyOff: salesOfficeCount(yoyRows) };
    };
    const keepOf = set => r => !set || set.has(r.so);
    const tgtOf = (set, yy, mm) => sumTargets(set || new Set(scopedOffices()), new Date(yy, mm - 1, 1), monthEnd(new Date(yy, mm - 1, 1)));
    const decorate = (node) => {
      const kids = (node.kids || []).map(decorate);
      const set = unitOfficeSet(node.id);
      const keep = keepOf(set);
      const mm = monthsAll.map(x => {
        const rows = x.rows.filter(keep);
        const yoyRows = x.yoyRows.filter(keep);
        return { m: x.m, rows, yoyRows, n: rows.length, yoyN: yoyRows.length, tgt: tgtOf(set, y, x.m) };
      });
      const lastRows = lastYearLast.filter(keep);
      const ytdRows = mm.filter(x => x.m <= viewM).flatMap(x => x.rows);
      const ytdYoyRows = mm.filter(x => x.m <= viewM).flatMap(x => x.yoyRows);
      const ytdN = ytdRows.length;
      const ytdTgt = mm.filter(x => x.m <= viewM).reduce((s, x) => s + x.tgt, 0);
      const ytdYoy = ytdYoyRows.length;
      const now = mm[viewM - 1];
      const lastN = lastRows.length;
      const lastTgt = tgtOf(set, py, pm);
      return {
        ...node, kids, months: mm, lastRows, ytdRows,
        c: {
          n: isYear ? ytdN : now.n,
          last: isYear ? ytdYoy : lastN,
          yoy: isYear ? ytdYoy : now.yoyN,
          tgt: isYear ? ytdTgt : now.tgt,
          lastTgt: isYear ? 0 : lastTgt,
          offN: salesOfficeCount(isYear ? ytdRows : now.rows),
          lastOff: isYear ? 0 : salesOfficeCount(lastRows),
          yoyOff: salesOfficeCount(isYear ? ytdYoyRows : now.yoyRows),
          rows: isYear ? ytdRows : now.rows
        }
      };
    };
    const keepLeaves = new Set(officeFilterKind() === 'offices' ? selectedSalesOfficeLeaves() : []);
    const root = pruneIdleSalesOffices(decorate(scopedUnitTree()), n => {
      if (!SALES_OFFICE_SET.has(n.id)) return true;
      if (keepLeaves.has(n.id)) return true;
      return !!(n.c && n.c.tgt);
    }) || decorate(scopedUnitTree());
    const gSort = state.growTblSort || '';
    if (gSort) {
      sortUnitTree(root, n => {
        if (gSort === 'name') return n.name;
        if (gSort === 'n') return n.c.n;
        if (gSort === 'last') return n.c.last;
        if (gSort === 'd') return n.c.n - n.c.last;
        if (gSort === 'lastP') return n.c.last ? (n.c.n - n.c.last) / n.c.last : 0;
        if (gSort === 'yoy') return n.c.yoy;
        if (gSort === 'yoyP') return n.c.yoy ? (n.c.n - n.c.yoy) / n.c.yoy : 0;
        return n.c.n;
      }, state.growTblDir || 'desc');
    }
    const open = new Set(state.growOpen || []);
    const monthOpen = new Set(state.growMonthOpen || []);
    if (!findUnitNode(root, state.growFocus || '')) state.growFocus = root.id;
    const focus = state.growFocus || root.id;
    const focusNode = findUnitNode(root, focus) || root;
    const months = focusNode.months.map(x => ({
      ...x,
      offN: salesOfficeCount(x.rows),
      yoyOff: salesOfficeCount(x.yoyRows)
    }));
    const sumThru = (list, thru, key) => list.filter(x => x.m <= thru).reduce((s, x) => s + x[key], 0);
    const fc = focusNode.c;
    const ytdYoyTgt = sumTargets(unitOfficeSet(focusNode.id) || new Set(scopedOffices()), new Date(y - 1, 0, 1), monthEnd(new Date(y - 1, viewM - 1, 1)));
    const cur = {
      n: fc.n, tgt: fc.tgt, offN: fc.offN, rows: fc.rows, yoyN: fc.yoy, yoyOff: fc.yoyOff
    };
    const last = isYear
      ? { n: 0, tgt: 0, offN: 0, rows: [] }
      : { n: fc.last, tgt: fc.lastTgt, offN: fc.lastOff, rows: focusNode.lastRows };
    const yoy = { n: fc.yoy, offN: fc.yoyOff };
    const ytdN = isYear ? cur.n : sumThru(months, viewM, 'n');
    const ytdTgt = isYear ? cur.tgt : sumThru(months, viewM, 'tgt');
    const ytdYoy = isYear ? yoy.n : sumThru(months, viewM, 'yoyN');
    const avg = cur.offN ? cur.n / cur.offN : 0;
    const lastAvg = last.offN ? last.n / last.offN : 0;
    const yoyAvg = yoy.offN ? yoy.n / yoy.offN : 0;
    const rate = cur.tgt ? cur.n / cur.tgt : 0;
    const lastRate = last.tgt ? last.n / last.tgt : 0;
    const yoyRate = 0;
    const momPct = last.n ? (cur.n - last.n) / last.n * 100 : null;
    const yoyPct = yoy.n ? (cur.n - yoy.n) / yoy.n * 100 : null;
    const ytdRate = ytdTgt ? ytdN / ytdTgt : 0;
    const ytdYoyRate = ytdYoyTgt ? ytdYoy / ytdYoyTgt : 0;
    if ($('growSeg')) $('growSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === grain));
    if ($('growStaffBtn')) $('growStaffBtn').classList.toggle('on', !!state.growStaffOpen);
    $('growTitle').textContent = `${typeLab}業績達成與成長分析`;
    $('growMeta').textContent = `${rocY}年${viewM}月 ｜ ${officeLab} ｜ ${typeLab} ｜ 1–${viewM}月累計 ｜ 目前單位：${focusNode.name}｜${grain === 'day' ? '趨勢為當月逐日' : grain === 'week' ? '趨勢為當月週別' : '點柱切換月份'}`;
    const lab = isYear ? `1–${viewM}月` : `${viewM}月`;
    const lastLab = `${pm}月`;
    const momTxt = crabMomTxt(cur.n, last.n);
    const yoyTxt = yoyPct == null ? '—' : crabPpTxt(yoyPct);
    const signedHtml = (n, unit) => {
      const v = Math.round(Number(n) || 0);
      const cls = crabCls(v);
      const body = `${v > 0 ? '+' : ''}${fmt(v)}${unit || '件'}`;
      return cls ? `<span class="${cls}">${body}</span>` : body;
    };
    const pctHtml = p => {
      if (p == null || !isFinite(p)) return '—';
      const cls = crabCls(p);
      const t = crabPpTxt(p);
      return cls ? `<span class="${cls}">${t}</span>` : t;
    };
    const tgtGap = cur.n - Math.round(cur.tgt);
    const yoyGap = cur.n - yoy.n;
    $('growKpis').innerHTML = `
      <div class="card kpi">
        <div class="k">${lab}${esc(typeLab)}件數</div>
        <div class="v">${fmt(cur.n)}<span class="unit"> 件</span></div>
        <div class="s">${isYear
          ? `同期${fmt(yoy.n)}件（${signedHtml(yoyGap)}）`
          : `上月比 ${pctHtml(momPct)}（${lastLab}${fmt(last.n)}件）`}</div>
      </div>
      <div class="card kpi">
        <div class="k">${lab}目標達成率${cur.tgt
          ? `<span class="fcst-hit ${cur.n >= cur.tgt ? 'ok' : 'no'}">${cur.n >= cur.tgt ? '已達標' : '未達標'}</span>`
          : ''}</div>
        <div class="v">${(rate * 100).toFixed(1)}%</div>
        <div class="s">目標${fmt(Math.round(cur.tgt))}件（${signedHtml(tgtGap)}）</div>
      </div>
      <div class="card kpi ${yoyPct < 0 ? 'down' : (yoyPct > 0 ? 'up' : '')}">
        <div class="k">同期成長</div>
        <div class="v">${yoyTxt}</div>
        <div class="s">同期${fmt(yoy.n)}件（${signedHtml(yoyGap)}）</div>
      </div>
      <div class="card kpi">
        <div class="k">1–${viewM}月累計達成率</div>
        <div class="v">${(ytdRate * 100).toFixed(1)}%</div>
        <div class="s">累計${fmt(ytdN)}件｜目標${fmt(Math.round(ytdTgt))}件</div>
      </div>`;
    const dOff = cur.offN - last.offN;
    const dN = cur.n - last.n;
    const dAvg = avg - lastAvg;
    const dTgt = cur.tgt - last.tgt;
    const dRate = (rate - lastRate) * 100;
    const yoyOffPct = yoy.offN ? (cur.offN - yoy.offN) / yoy.offN * 100 : null;
    const yoyNPct = yoy.n ? (cur.n - yoy.n) / yoy.n * 100 : null;
    const yoyAvgPct = yoyAvg ? (avg - yoyAvg) / yoyAvg * 100 : null;
    const yoyTgtPct = null;
    const yoyRatePp = null;
    const dash = '—';
    const markDiff = (txt, n) => crabTd(txt, `${crabCls(n)} ${crabTint(n)}`.trim());
    const rateCell = v => `${(v * 100).toFixed(1)}%`;
    const cmpHead = isYear
      ? `<th>比較項目</th><th>1–${viewM}月</th><th>累計差異</th><th>同期1–${viewM}月</th><th>同期比</th>`
      : `<th>比較項目</th><th>${viewM}月</th><th>${pm}月</th><th>差異</th><th>上月比</th><th>同期</th><th>同期比</th>`;
    const yearRows = `
      <tr><td>有業績營業處數</td><td>${fmt(cur.offN)}</td>${crabTd(crabSigned(cur.offN - yoy.offN) + '處', crabCls(cur.offN - yoy.offN))}<td>${fmt(yoy.offN)}</td>${crabTd(yoy.offN ? crabPpTxt(yoyOffPct) : dash, crabCls(yoyOffPct))}</tr>
      <tr class="mark"><td>${esc(typeLab)}件數</td><td>${fmt(cur.n)}</td>${markDiff(crabSigned(cur.n - yoy.n), cur.n - yoy.n)}<td>${fmt(yoy.n)}</td>${markDiff(yoy.n ? crabPpTxt(yoyNPct) : dash, yoyNPct)}</tr>
      <tr><td>處均件數</td><td>${avg.toFixed(2)}</td>${crabTd(`${(avg - yoyAvg) >= 0 ? '+' : ''}${(avg - yoyAvg).toFixed(2)}`, crabCls(avg - yoyAvg))}<td>${yoyAvg.toFixed(2)}</td>${crabTd(yoyAvg ? crabPpTxt(yoyAvgPct) : dash, crabCls(yoyAvgPct))}</tr>
      <tr><td>目標件數</td><td>${fmt(Math.round(cur.tgt))}</td><td>${dash}</td><td>${fmt(Math.round(ytdYoyTgt))}</td><td>${dash}</td></tr>
      <tr><td>目標達成率</td><td>${rateCell(rate)}</td>${crabTd(ytdYoyTgt ? crabPpTxt((rate - ytdYoyRate) * 100) : dash, crabCls(rate - ytdYoyRate))}<td>${ytdYoyTgt ? rateCell(ytdYoyRate) : dash}</td><td>${dash}</td></tr>`;
    const monthRowsHtml = `
      <tr><td>有業績營業處數</td><td>${fmt(cur.offN)}</td><td>${fmt(last.offN)}</td>
        ${crabTd(crabSigned(dOff) + '處', crabCls(dOff))}
        ${crabTd(crabMomTxt(cur.offN, last.offN), crabCls(dOff))}
        <td>${fmt(yoy.offN)}</td>${crabTd(yoy.offN ? crabPpTxt(yoyOffPct) : dash, crabCls(yoyOffPct))}</tr>
      <tr class="mark"><td>${esc(typeLab)}件數</td><td>${fmt(cur.n)}</td><td>${fmt(last.n)}</td>
        ${markDiff(crabSigned(dN), dN)}
        ${markDiff(crabMomTxt(cur.n, last.n), dN)}
        <td>${fmt(yoy.n)}</td>${markDiff(yoy.n ? crabPpTxt(yoyNPct) : dash, yoyNPct)}</tr>
      <tr><td>處均件數</td><td>${avg.toFixed(2)}</td><td>${lastAvg.toFixed(2)}</td>
        ${crabTd(`${dAvg >= 0 ? '+' : ''}${dAvg.toFixed(2)}`, crabCls(dAvg))}
        ${crabTd(crabMomTxt(avg, lastAvg), crabCls(dAvg))}
        <td>${yoyAvg.toFixed(2)}</td>${crabTd(yoyAvg ? crabPpTxt(yoyAvgPct) : dash, crabCls(yoyAvgPct))}</tr>
      <tr><td>目標件數</td><td>${fmt(Math.round(cur.tgt))}</td><td>${fmt(Math.round(last.tgt))}</td>
        ${crabTd(crabSigned(dTgt), crabCls(dTgt))}
        ${crabTd(crabMomTxt(cur.tgt, last.tgt), crabCls(dTgt))}
        <td>${dash}</td><td>${dash}</td></tr>
      <tr><td>目標達成率</td><td>${rateCell(rate)}</td><td>${rateCell(lastRate)}</td>
        ${crabTd(crabPpTxt(dRate), crabCls(dRate))}
        ${crabTd(crabPpTxt(dRate), crabCls(dRate))}
        <td>${dash}</td><td>${dash}</td></tr>`;
    $('growCmpTbl').innerHTML = `<table class="crab-tbl"><thead><tr>${cmpHead}</tr></thead><tbody>${isYear ? yearRows : monthRowsHtml}</tbody></table>`;
    const gapAbs = Math.abs(Math.round(cur.tgt - cur.n));
    const offNow = salesOfficeSet(cur.rows);
    const offMom = salesOfficeSet(last.rows || []);
    const yoyRowsNow = isYear
      ? (focusNode.months || []).filter(x => x.m <= viewM).flatMap(x => x.yoyRows || [])
      : (((focusNode.months || [])[viewM - 1] || {}).yoyRows || []);
    const offYoySet = salesOfficeSet(yoyRowsNow);
    const offPair = fromSet => {
      const added = [...offNow].filter(o => !fromSet.has(o)).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
      const dropped = [...fromSet].filter(o => !offNow.has(o)).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
      return { added, dropped };
    };
    const momOff = offPair(offMom);
    const yoyOff = offPair(offYoySet);
    const offMomBit = isYear ? '' : (() => {
      const bits = [];
      if (momOff.dropped.length) bits.push(`減少${momOff.dropped.join('、')}`);
      if (momOff.added.length) bits.push(`新增${momOff.added.join('、')}`);
      return bits.length ? `較${pm}月${bits.join('，')}` : '';
    })();
    const offYoyBit = (() => {
      const lab = isYear ? '去年同期' : '去年同月';
      const bits = [];
      if (yoyOff.dropped.length) bits.push(`減少${yoyOff.dropped.length}處(${yoyOff.dropped.join('、')})`);
      if (yoyOff.added.length) bits.push(`增加${yoyOff.added.length}處(${yoyOff.added.join('、')})`);
      return bits.length ? `較${lab}${bits.join('，')}` : '';
    })();
    const offBody = [`有業績營業處數${fmt(cur.offN)}處`, offMomBit, offYoyBit].filter(Boolean).join('，') + '。';
    const peak = [...(focusNode.months || []).filter(x => x.m <= viewM)].sort((a, b) => b.n - a.n)[0];
    const avgTxt = v => Number(v || 0).toFixed(2);
    const pieceChg = (now, prev) => {
      const d = Math.round(Number(now) - Number(prev));
      if (!d) return '持平';
      return `${d > 0 ? '+' : '-'}${fmt(Math.abs(d))}件`;
    };
    const avgChg = (now, prev) => {
      const d = Number(now) - Number(prev);
      if (!isFinite(d) || Math.abs(d) < 0.005) return '持平';
      return `${d > 0 ? '+' : '-'}${Math.abs(d).toFixed(2)}件`;
    };
    const pctParen = (now, prev) => {
      if (!prev) return '';
      return `(${crabPpTxt((now - prev) / prev * 100)})`;
    };
    const yoyLab = isYear ? '去年同期' : '去年同月';
    const momBody = `${viewM}月${fmt(cur.n)}件，較${pm}月${pieceChg(cur.n, last.n)}${pctParen(cur.n, last.n)}，單位均件${avgTxt(avg)}件，較${pm}月${avgChg(avg, lastAvg)}。`;
    const yoyBody = yoy.n
      ? `較${yoyLab}${pieceChg(cur.n, yoy.n)}${pctParen(cur.n, yoy.n)}，單位均件較去年${pieceChg(avg, yoyAvg)}(同期${avgTxt(yoyAvg)}件)。`
      : '去年同期基期尚缺，暫不列同期比。';
    const focusOffSet = unitOfficeSet(focusNode.id);
    const salesInFocus = SALES_OFFICES.filter(o => !focusOffSet || focusOffSet.has(o));
    const hasTgt = o => isYear
      ? Array.from({ length: viewM }, (_, i) => officeMonthTarget(o, y, i + 1)).some(v => v > 0)
      : officeMonthTarget(o, y, viewM) > 0;
    const tgtOffN = salesInFocus.filter(hasTgt).length;
    const countSo = rows => {
      const m = new Map();
      (rows || []).forEach(r => {
        if (!SALES_OFFICES.includes(r.so)) return;
        m.set(r.so, (m.get(r.so) || 0) + 1);
      });
      return m;
    };
    const nowByOff = countSo(cur.rows);
    const hitList = salesInFocus.map(o => {
      const n = nowByOff.get(o) || 0;
      const tgt = isYear
        ? sumTargets(new Set([o]), new Date(y, 0, 1), monthEnd(new Date(y, viewM - 1, 1)))
        : officeMonthTarget(o, y, viewM);
      return { o, n, tgt, rate: tgt ? n / tgt : 0 };
    }).filter(x => x.tgt > 0 && x.n >= x.tgt).sort((a, b) => (b.rate - a.rate) || (b.n - a.n) || a.o.localeCompare(b.o, 'zh-Hant'));
    const tgtGapTxt = !cur.tgt
      ? '目標資料尚缺'
      : (rate < 1 ? `低於目標 ${fmt(gapAbs)} 件` : (rate > 1 ? `高於目標 ${fmt(gapAbs)} 件` : '已達目標'));
    const expandTxt = tgtOffN && tgtOffN !== cur.offN
      ? `拓展營業處有業績${fmt(cur.offN)}處，較目標${fmt(tgtOffN)}處${cur.offN < tgtOffN ? '少' : '多'}${fmt(Math.abs(cur.offN - tgtOffN))}處。`
      : '';
    const tgtBody = [`${lab}達成率${(rate * 100).toFixed(1)}%，${tgtGapTxt}。`, expandTxt].filter(Boolean).join('');
    const hitBody = hitList.length
      ? `業績達標${hitList.map(x => `${x.o}${fmt(x.n)}件（${(x.rate * 100).toFixed(1)}%）`).join('、')}。`
      : '本期無營業處達標。';
    const ytdYoyPct = ytdYoy ? (ytdN - ytdYoy) / ytdYoy * 100 : null;
    const ytdBody = `1–${viewM}月累計${fmt(ytdN)}件，累計達成率${(ytdRate * 100).toFixed(1)}%${peak ? `，單月最高${peak.m}月${fmt(peak.n)}件` : ''}。${ytdYoyPct == null ? '' : `累計同期比${crabPpTxt(ytdYoyPct)}。`}`;
    $('growJudge').innerHTML = `<h4>管理結論（${esc(focusNode.name)}）</h4>
      ${isYear ? '' : judgeP('上月比', momBody)}
      ${judgeP('同期比', yoyBody)}
      ${judgeP('目標比', tgtBody)}
      ${judgeP('達成率', hitBody)}
      ${judgeP('單位差異', offBody)}
      ${judgeP('累計', ytdBody)}`;
    const fineGrain = grain === 'day' || grain === 'week';
    let labels = months.map(x => `${x.m}月`);
    let actual = months.map(x => {
      if (x.m > filterM) return null;
      return isYear ? sumThru(months, x.m, 'n') : x.n;
    });
    let yoyLine = months.map(x => isYear ? sumThru(months, x.m, 'yoyN') : x.yoyN);
    let tgtLine = months.map(x => isYear ? sumThru(months, x.m, 'tgt') : x.tgt);
    if (fineGrain) {
      const dim = new Date(y, viewM, 0).getDate();
      const ms = new Date(y, viewM - 1, 1);
      const me = monthEnd(new Date(y, viewM - 1, 1));
      const buckets = [];
      if (grain === 'day') {
        for (let d = 1; d <= dim; d++) {
          const dt = new Date(y, viewM - 1, d);
          buckets.push({ label: `${viewM}/${d}`, s: dt, e: dt, days: 1 });
        }
      } else {
        let curD = new Date(ms);
        const wd = curD.getDay();
        curD = new Date(curD.getFullYear(), curD.getMonth(), curD.getDate() - wd);
        let n = 1;
        while (curD <= me) {
          const wEnd = new Date(curD.getFullYear(), curD.getMonth(), curD.getDate() + 6);
          const s = curD < ms ? new Date(ms) : new Date(curD);
          const e = wEnd > me ? new Date(me) : wEnd;
          if (s <= e) buckets.push({
            label: 'W' + n,
            s, e,
            days: Math.round((e - s) / 86400000) + 1
          });
          curD = new Date(curD.getFullYear(), curD.getMonth(), curD.getDate() + 7);
          n += 1;
        }
      }
      const monthRows = ((focusNode.months || [])[viewM - 1] || {});
      const actRows = monthRows.rows || [];
      const yoyRows = monthRows.yoyRows || [];
      const monthTgt = monthRows.tgt || 0;
      labels = buckets.map(b => b.label);
      actual = buckets.map(b => actRows.filter(r => startIn(r, b.s, b.e)).length);
      yoyLine = buckets.map(b => {
        const s = new Date(b.s.getFullYear() - 1, b.s.getMonth(), b.s.getDate());
        const e = new Date(b.e.getFullYear() - 1, b.e.getMonth(), b.e.getDate());
        return yoyRows.filter(r => startIn(r, s, e)).length;
      });
      tgtLine = buckets.map(b => Math.round(monthTgt * b.days / dim));
    }
    $('growChartTitle').textContent = grain === 'day'
      ? `${viewM}月逐日業績趨勢`
      : grain === 'week'
        ? `${viewM}月週別業績趨勢`
        : (isYear ? `1–${viewM}月累計趨勢` : '1–12月業績趨勢');
    $('growChartNote').textContent = fineGrain
      ? `深藍柱為實績、綠線為去年同期、灰線為目標（依當月目標按天數比例）。`
      : `深藍柱為實績、綠線為去年同期、灰線為目標；${filterM < 12 ? `${filterM + 1}–12月尚未結算` : '全年已列入'}。點柱切換月份。`;
    const bandPlugin = {
      id: 'growBand',
      beforeDraw(chart) {
        if (isYear || fineGrain) return;
        const meta = chart.getDatasetMeta(0);
        const pt = meta && meta.data[viewM - 1];
        if (!pt) return;
        const { ctx, chartArea } = chart;
        const bw = typeof pt.width === 'number' ? pt.width : 24;
        const w = bw + 10;
        ctx.save();
        ctx.fillStyle = '#e8eef6';
        ctx.fillRect(pt.x - w / 2, chartArea.top, w, chartArea.bottom - chartArea.top);
        ctx.restore();
      }
    };
    const labelPlugin = {
      id: 'growLabels',
      afterDatasetsDraw(chart) {
        const { ctx, chartArea } = chart;
        chart.data.datasets.forEach((ds, di) => {
          const meta = chart.getDatasetMeta(di);
          if (!meta.visible) return;
          meta.data.forEach((pt, i) => {
            const v = ds.data[i];
            ctx.save();
            ctx.textAlign = 'center';
            ctx.font = '10px Arial, sans-serif';
            if (di === 0 && !fineGrain && i + 1 > filterM) {
              ctx.fillStyle = '#94a3b8';
              ctx.fillText('未結算', pt.x, chartArea.bottom - 6);
              ctx.restore();
              return;
            }
            if (v == null || !pt) { ctx.restore(); return; }
            if (di === 0) {
              ctx.fillStyle = '#fff';
              const base = pt.base != null ? pt.base : chartArea.bottom;
              const h = Math.abs(base - pt.y);
              if (h > 16) {
                ctx.textBaseline = 'middle';
                ctx.fillText(fmt(Math.round(v)), pt.x, (pt.y + base) / 2);
              } else {
                ctx.fillStyle = '#1e4a7a';
                ctx.textBaseline = 'bottom';
                ctx.fillText(fmt(Math.round(v)), pt.x, pt.y - 4);
              }
            } else {
              ctx.fillStyle = ds.borderColor || '#64748b';
              const lift = di === 2 ? -14 : -4;
              ctx.fillText(fmt(Math.round(v)), pt.x, pt.y + lift);
            }
            ctx.restore();
          });
        });
      }
    };
    const hide = state.growHide || {};
    upsert('growChart', 'bar', labels, [
      {
        type: 'bar', label: '實績', data: actual, hidden: !!hide['實績'],
        backgroundColor: '#1e4a7a', borderRadius: 3, order: 3,
        barPercentage: fineGrain ? 0.72 : 0.55, categoryPercentage: 0.78, maxBarThickness: fineGrain ? 18 : 26
      },
      {
        type: 'line', label: '同期', data: yoyLine, hidden: !!hide['同期'],
        borderColor: '#22c55e',
        backgroundColor: '#fff', tension: 0.25, pointRadius: 3, pointHoverRadius: 4,
        fill: false, spanGaps: true, borderWidth: 2, order: 1,
        pointBackgroundColor: '#86efac', pointBorderColor: '#22c55e', pointBorderWidth: 2
      },
      {
        type: 'line', label: '目標', data: tgtLine, hidden: !!hide['目標'],
        borderColor: '#94a3b8',
        backgroundColor: '#fff', tension: 0.25, pointRadius: 3, pointHoverRadius: 4,
        fill: false, spanGaps: true, borderWidth: 2, order: 0,
        pointBackgroundColor: '#cbd5e1', pointBorderColor: '#94a3b8', pointBorderWidth: 2
      }
    ], {
      plugins: {
        legend: { display: false }
      },
      layout: { padding: { top: 2, right: 4 } },
      interaction: { mode: 'index', intersect: false },
      onClick: (evt, els) => {
        if (fineGrain || !els.length) return;
        const i = els[0].index + 1;
        if (i > filterM) return;
        state.growPick = i;
        state.growGrain = 'month';
        renderGrowAnalysis();
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: fineGrain ? 10 : 11 }, color: '#64748b', maxRotation: 0, autoSkip: true } },
        y: { beginAtZero: true, grid: { color: '#eef2f7' }, ticks: { font: { size: 10 }, color: '#94a3b8' } }
      }
    }, [bandPlugin, labelPlugin]);
    if ($('growLegend')) {
      $('growLegend').querySelectorAll('[data-grow-ds]').forEach(b => {
        b.classList.toggle('off', !!hide[b.dataset.growDs]);
      });
    }
    const unitHead = isYear
      ? `${tblTh('grow', 'name', '單位／擔當者')}${tblTh('grow', 'n', `1–${viewM}月`)}${tblTh('grow', 'd', '累計差異')}${tblTh('grow', 'yoy', `同期1–${viewM}月`)}${tblTh('grow', 'yoyP', '同期比')}`
      : `${tblTh('grow', 'name', '單位／擔當者')}${tblTh('grow', 'n', `${viewM}月`)}${tblTh('grow', 'last', `${pm}月`)}${tblTh('grow', 'd', '差異')}${tblTh('grow', 'lastP', '上月比')}${tblTh('grow', 'yoy', '同期')}${tblTh('grow', 'yoyP', '同期比')}`;
    const html = [];
    const walk = (node, depth) => {
      const hasKids = node.kids && node.kids.length;
      const isOpen = node.id === '__SEL__' || open.has(node.id);
      const tog = hasKids
        ? `<button type="button" class="unit-tog" data-grow-open="${node.id}">${isOpen ? '▾' : '▸'}</button>`
        : `<span class="unit-tog-sp"></span>`;
      const on = node.id === focus ? ' on' : '';
      const d = node.c.n - node.c.last;
      const yoyP = node.c.yoy ? (node.c.n - node.c.yoy) / node.c.yoy * 100 : null;
      if (isYear) {
        html.push(`<tr class="${on}" data-grow-focus="${node.id}">
          ${unitCellHtml(node, depth, tog)}
          <td class="v num-hit" data-grow-months="${node.id}">${fmt(node.c.n)}</td>
          ${crabTd(crabSigned(d), crabCls(d))}
          <td class="v num-hit" data-grow-months="${node.id}">${fmt(node.c.yoy)}</td>
          ${crabTd(yoyP == null ? dash : crabPpTxt(yoyP), crabCls(yoyP))}
        </tr>`);
      } else {
        html.push(`<tr class="${on}" data-grow-focus="${node.id}">
          ${unitCellHtml(node, depth, tog)}
          <td class="v num-hit" data-grow-months="${node.id}">${fmt(node.c.n)}</td>
          <td class="v num-hit" data-grow-months="${node.id}">${fmt(node.c.last)}</td>
          ${crabTd(crabSigned(d), crabCls(d))}
          ${crabTd(crabMomTxt(node.c.n, node.c.last), crabCls(d))}
          <td class="v num-hit" data-grow-months="${node.id}">${fmt(node.c.yoy)}</td>
          ${crabTd(yoyP == null ? dash : crabPpTxt(yoyP), crabCls(yoyP))}
        </tr>`);
      }
      if (monthOpen.has(node.id)) {
        html.push(`<tr class="crab-mdetail"><td colspan="${isYear ? 5 : 7}"><table class="crab-mini"><thead><tr>
          <th>月</th><th>${esc(typeLab)}</th><th>去年同月</th><th>同期比</th>
        </tr></thead><tbody>${node.months.map(x => {
          const yp = x.yoyN ? (x.n - x.yoyN) / x.yoyN * 100 : null;
          return `<tr class="${x.m === viewM ? 'on' : ''}">
            <td>${x.m}月</td><td>${fmt(x.n)}</td><td>${fmt(x.yoyN)}</td>
            <td class="${crabCls(yp)}">${yp == null ? dash : crabPpTxt(yp)}</td>
          </tr>`;
        }).join('')}</tbody></table></td></tr>`);
      }
      if (hasKids && isOpen) node.kids.forEach(k => walk(k, depth + 1));
    };
    walk(root, 0);
    if ($('growUnitNote')) {
      $('growUnitNote').textContent = isYear
        ? `點單位查閱｜點數字展開月細｜1–${viewM}月對去年1–${viewM}月`
        : `點單位查閱｜點數字展開月細｜上月為${pm}月`;
    }
    if ($('growUnitTbl')) {
      $('growUnitTbl').innerHTML = `<table class="type-tbl ana-tbl"><thead><tr>${unitHead}</tr></thead><tbody>${html.join('')}</tbody></table>`;
    }
    renderOffCountRank3($('growOffRank'), cur.rows || []);
    renderGrowStaff(cur.rows || [], focusNode.name || officeLab);
  }
  function renderGrowStaff(rows, scopeName) {
    const box = $('growStaffBox');
    if (!box) return;
    bindStaffBox('growStaffBox', 'grow');
    box.classList.toggle('hidden', !state.growStaffOpen);
    if (!state.growStaffOpen) {
      if (state.staffCase && state.staffCase.kind === 'grow') state.staffCase = null;
      box.innerHTML = '';
      return;
    }
    const map = new Map();
    rows.forEach(r => {
      const name = r.sl || '—';
      const office = r.so || '—';
      const key = office + '\t' + name;
      if (!map.has(key)) map.set(key, { office, name, rows: [] });
      map.get(key).rows.push(r);
    });
    const people = sortStaffPeople([...map.values()].map(p => ({ ...p, total: p.rows.length })), state.growStaffSort || 'total', state.growStaffDir || 'desc');
    staffPeople.grow = people;
    box.innerHTML = `
      ${staffHead(esc(scopeName) + ' ｜ 業績達成業務明細')}
      <p class="src-staff-k">共 ${fmt(people.reduce((s, p) => s + p.total, 0))} 件。點數字展開案件明細</p>
      <div class="src-staff-scroll"><table class="src-combo"><thead><tr>
        <th data-sort="office" class="${staffSortMark('grow', 'office')}">業務營業處</th>
        <th data-sort="name" class="${staffSortMark('grow', 'name')}">業務</th>
        <th data-sort="total" class="${staffSortMark('grow', 'total')}">件數</th>
      </tr></thead><tbody>
        ${people.map(p => `<tr>
          <td>${esc(p.office)}</td><td class="name-hit">${esc(p.name)}</td>
          ${numTd(p.total, 'total')}
        </tr>`).join('') || '<tr><td colspan="3">無資料</td></tr>'}
      </tbody></table></div>
      ${staffCasePanel('grow')}`;
  }

  function cityGrowSelRoot() {
    const cityFiltered = (state.cities || []).length && (state.cities || []).length !== CITIES.length;
    const officeSel = officeFilterKind() === 'offices' && selectedSalesOfficeLeaves().length;
    return cityFiltered || officeSel;
  }
  function cityGrowTree() {
    const allow = new Set((state.cities || []).map(normCity));
    const allCities = !allow.size || allow.size === CITIES.length;
    const cityNode = city => ({
      id: 'cgC:' + city, name: city, kind: 'city', cities: [city], kids: []
    });
    const ns = CITIES_NS.filter(c => CITIES.includes(c));
    if (cityGrowSelRoot()) {
      const cities = ns.filter(c => allCities || allow.has(c));
      return {
        id: '__SEL__', name: '管轄縣市加總', kind: 'all', cities: null,
        kids: (cities.length ? cities : ns).map(cityNode)
      };
    }
    return {
      id: '全公司', name: '全公司', kind: 'all', cities: null,
      kids: CITY_REGIONS.map(reg => {
        const cities = reg.cities.filter(c => allCities || allow.has(c));
        return {
          id: reg.id, name: reg.id, kind: 'region', cities,
          kids: cities.map(cityNode)
        };
      }).filter(r => r.kids.length)
    };
  }
  function cityGrowKeep(node, r) {
    const c = cityOfLease(r);
    if (node.kind === 'all') return true;
    if (node.kind === 'region' || node.kind === 'city') return (node.cities || []).includes(c);
    if (node.kind === 'office') return c === node.city && r.so === node.so;
    return true;
  }
  function cityGrowTgtSet(node) {
    if (node.kind === 'office' && node.so) return new Set([node.so]);
    if (node.kind === 'region' && REGIONS[node.id]) {
      const sel = selectedOffices();
      const set = new Set(REGIONS[node.id]);
      return sel ? new Set([...set].filter(o => sel.has(o))) : set;
    }
    if (node.kind === 'all') return unitOfficeSet(node.id) || new Set(scopedOffices());
    return new Set();
  }
  function renderCityGrowAnalysis() {
    if (!$('cgKpis')) return;
    const y = state.end.getFullYear();
    const filterM = state.end.getMonth() + 1;
    const grain = state.cityGrowGrain || 'month';
    const isYear = grain === 'year';
    const pick = state.cityGrowPick || filterM;
    const viewM = Math.min(isYear ? filterM : pick, filterM);
    const prev = addMonths(new Date(y, viewM - 1, 1), -1);
    const py = prev.getFullYear(), pm = prev.getMonth() + 1;
    const typeLab = leaseTypeShort() || '新媒合';
    const officeLab = ddLabel('office');
    const rocY = y - 1911;
    const monthsAll = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      return { m, rows: monthLeaseRows(y, m), yoyRows: monthLeaseRows(y - 1, m) };
    });
    const lastYearLast = monthLeaseRows(py, pm);
    const tgtOf = (node, yy, mm) => {
      const set = cityGrowTgtSet(node);
      if (!set || !set.size) return 0;
      return sumTargets(set, new Date(yy, mm - 1, 1), monthEnd(new Date(yy, mm - 1, 1)));
    };
    const decorate = (node) => {
      const keep = r => cityGrowKeep(node, r);
      const mm = monthsAll.map(x => {
        const rows = x.rows.filter(keep);
        const yoyRows = x.yoyRows.filter(keep);
        return { m: x.m, rows, yoyRows, n: rows.length, yoyN: yoyRows.length, tgt: tgtOf(node, y, x.m) };
      });
      const lastRows = lastYearLast.filter(keep);
      const ytdRows = mm.filter(x => x.m <= viewM).flatMap(x => x.rows);
      const ytdYoyRows = mm.filter(x => x.m <= viewM).flatMap(x => x.yoyRows);
      const ytdN = ytdRows.length;
      const ytdTgt = mm.filter(x => x.m <= viewM).reduce((s, x) => s + x.tgt, 0);
      const ytdYoy = ytdYoyRows.length;
      const nowM = mm[viewM - 1];
      const lastN = lastRows.length;
      const lastTgt = tgtOf(node, py, pm);
      let kids;
      if (node.kind === 'city') {
        const sos = [...new Set(mm.flatMap(x => x.rows).map(r => r.so).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
        kids = sos.map(so => decorate({
          id: 'cgO:' + node.name + ':' + so,
          name: so, kind: 'office', city: node.name, so, kids: []
        }));
      } else {
        kids = (node.kids || []).map(decorate);
      }
      return {
        ...node, kids, months: mm, lastRows, ytdRows,
        c: {
          n: isYear ? ytdN : nowM.n,
          last: isYear ? ytdYoy : lastN,
          yoy: isYear ? ytdYoy : nowM.yoyN,
          tgt: isYear ? ytdTgt : nowM.tgt,
          lastTgt: isYear ? 0 : lastTgt,
          offN: salesOfficeCount(isYear ? ytdRows : nowM.rows),
          lastOff: isYear ? 0 : salesOfficeCount(lastRows),
          yoyOff: salesOfficeCount(isYear ? ytdYoyRows : nowM.yoyRows),
          cityN: cityCount(isYear ? ytdRows : nowM.rows),
          lastCity: isYear ? 0 : cityCount(lastRows),
          yoyCity: cityCount(isYear ? ytdYoyRows : nowM.yoyRows),
          rows: isYear ? ytdRows : nowM.rows
        }
      };
    };
    const prune = node => {
      const kids = (node.kids || []).map(prune).filter(Boolean);
      const n = node.c || {};
      if (node.kind === 'office') {
        const any = (node.months || []).some(x => x.n || x.yoyN) || n.last;
        if (!any) return null;
      }
      if (node.kind === 'city' && !kids.length && !(n.n || n.last || n.yoy)) return null;
      if (node.kind === 'region' && !kids.length) return null;
      return { ...node, kids };
    };
    const root = prune(decorate(cityGrowTree())) || decorate(cityGrowTree());
    const gSort = state.cityGrowTblSort || '';
    if (gSort) {
      sortUnitTree(root, n => {
        if (gSort === 'name') return n.name;
        if (gSort === 'n') return n.c.n;
        if (gSort === 'last') return n.c.last;
        if (gSort === 'd') return n.c.n - n.c.last;
        if (gSort === 'lastP') return n.c.last ? (n.c.n - n.c.last) / n.c.last : 0;
        if (gSort === 'yoy') return n.c.yoy;
        if (gSort === 'yoyP') return n.c.yoy ? (n.c.n - n.c.yoy) / n.c.yoy : 0;
        return n.c.n;
      }, state.cityGrowTblDir || 'desc');
    }
    const open = new Set(state.cityGrowOpen || ['全公司']);
    if (root.id === '__SEL__') {
      open.add('__SEL__');
      if ((root.kids || []).length === 1) open.add(root.kids[0].id);
    }
    const monthOpen = new Set(state.cityGrowMonthOpen || []);
    if (!findUnitNode(root, state.cityGrowFocus || '')) state.cityGrowFocus = root.id;
    const focus = state.cityGrowFocus || root.id;
    const focusNode = findUnitNode(root, focus) || root;
    const months = focusNode.months.map(x => ({
      ...x,
      offN: salesOfficeCount(x.rows),
      yoyOff: salesOfficeCount(x.yoyRows),
      cityN: cityCount(x.rows),
      yoyCity: cityCount(x.yoyRows)
    }));
    const sumThru = (list, thru, key) => list.filter(x => x.m <= thru).reduce((s, x) => s + x[key], 0);
    const fc = focusNode.c;
    const ytdYoyTgt = (() => {
      const set = cityGrowTgtSet(focusNode);
      if (!set || !set.size) return 0;
      return sumTargets(set, new Date(y - 1, 0, 1), monthEnd(new Date(y - 1, viewM - 1, 1)));
    })();
    const cur = { n: fc.n, tgt: fc.tgt, offN: fc.offN, cityN: fc.cityN, rows: fc.rows, yoyN: fc.yoy, yoyOff: fc.yoyOff, yoyCity: fc.yoyCity };
    const last = isYear
      ? { n: 0, tgt: 0, offN: 0, cityN: 0, rows: [] }
      : { n: fc.last, tgt: fc.lastTgt, offN: fc.lastOff, cityN: fc.lastCity, rows: focusNode.lastRows };
    const yoy = { n: fc.yoy, offN: fc.yoyOff, cityN: fc.yoyCity };
    const ytdN = isYear ? cur.n : sumThru(months, viewM, 'n');
    const ytdTgt = isYear ? cur.tgt : sumThru(months, viewM, 'tgt');
    const ytdYoy = isYear ? yoy.n : sumThru(months, viewM, 'yoyN');
    const avg = cur.cityN ? cur.n / cur.cityN : 0;
    const lastAvg = last.cityN ? last.n / last.cityN : 0;
    const yoyAvg = yoy.cityN ? yoy.n / yoy.cityN : 0;
    const rate = cur.tgt ? cur.n / cur.tgt : 0;
    const lastRate = last.tgt ? last.n / last.tgt : 0;
    const momPct = last.n ? (cur.n - last.n) / last.n * 100 : null;
    const yoyPct = yoy.n ? (cur.n - yoy.n) / yoy.n * 100 : null;
    const ytdRate = ytdTgt ? ytdN / ytdTgt : 0;
    const ytdYoyRate = ytdYoyTgt ? ytdYoy / ytdYoyTgt : 0;
    if ($('cgSeg')) $('cgSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === grain));
    if ($('cgStaffBtn')) $('cgStaffBtn').classList.toggle('on', !!state.cgStaffOpen);
    $('cgTitle').textContent = '縣市業績概況與成長分析';
    $('cgMeta').textContent = `${rocY}年${viewM}月 ｜ ${officeLab} ｜ ${typeLab} ｜ 1–${viewM}月累計 ｜ 目前單位：${focusNode.name}｜${grain === 'day' ? '趨勢為當月逐日' : grain === 'week' ? '起租日歸月、送審日歸週' : '點柱切換月份'}｜縣市依租賃地址前三字`;
    const lab = isYear ? `1–${viewM}月` : `${viewM}月`;
    const lastLab = `${pm}月`;
    const yoyTxt = yoyPct == null ? '—' : crabPpTxt(yoyPct);
    const signedHtml = (n, unit) => {
      const v = Math.round(Number(n) || 0);
      const cls = crabCls(v);
      const body = `${v > 0 ? '+' : ''}${fmt(v)}${unit || '件'}`;
      return cls ? `<span class="${cls}">${body}</span>` : body;
    };
    const pctHtml = p => {
      if (p == null || !isFinite(p)) return '—';
      const cls = crabCls(p);
      const t = crabPpTxt(p);
      return cls ? `<span class="${cls}">${t}</span>` : t;
    };
    const yoyGap = cur.n - yoy.n;
    const ytdGap = ytdN - ytdYoy;
    $('cgKpis').innerHTML = `
      <div class="card kpi">
        <div class="k">${lab}${esc(typeLab)}件數</div>
        <div class="v">${fmt(cur.n)}<span class="unit"> 件</span></div>
        <div class="s">${isYear
          ? `同期${fmt(yoy.n)}件（${signedHtml(yoyGap)}）`
          : `上月比 ${pctHtml(momPct)}（${lastLab}${fmt(last.n)}件）`}</div>
      </div>
      <div class="card kpi ${!isYear && momPct < 0 ? 'down' : (!isYear && momPct > 0 ? 'up' : '')}">
        <div class="k">上月成長</div>
        <div class="v">${isYear ? '—' : pctHtml(momPct)}</div>
        <div class="s">${isYear ? '年度累計不列上月比' : `${lastLab}${fmt(last.n)}件（${signedHtml(cur.n - last.n)}）`}</div>
      </div>
      <div class="card kpi ${yoyPct < 0 ? 'down' : (yoyPct > 0 ? 'up' : '')}">
        <div class="k">同期成長</div>
        <div class="v">${yoyTxt}</div>
        <div class="s">同期${fmt(yoy.n)}件（${signedHtml(yoyGap)}）</div>
      </div>
      <div class="card kpi">
        <div class="k">1–${viewM}月累計媒合件數</div>
        <div class="v">${fmt(ytdN)}<span class="unit"> 件</span></div>
        <div class="s">同期${fmt(ytdYoy)}件（${signedHtml(ytdGap)}）</div>
      </div>`;
    const dCity = cur.cityN - last.cityN;
    const dN = cur.n - last.n;
    const dAvg = avg - lastAvg;
    const yoyCityPct = yoy.cityN ? (cur.cityN - yoy.cityN) / yoy.cityN * 100 : null;
    const yoyNPct = yoy.n ? (cur.n - yoy.n) / yoy.n * 100 : null;
    const yoyAvgPct = yoyAvg ? (avg - yoyAvg) / yoyAvg * 100 : null;
    const dash = '—';
    const markDiff = (txt, n) => crabTd(txt, `${crabCls(n)} ${crabTint(n)}`.trim());
    const yoyRowsCmp = isYear
      ? (focusNode.months || []).filter(x => x.m <= viewM).flatMap(x => x.yoyRows || [])
      : (((focusNode.months || [])[viewM - 1] || {}).yoyRows || []);
    const crabN = rows => (rows || []).filter(isCrabFt).length;
    const nonN = rows => (rows || []).filter(r => !isCrabFt(r)).length;
    const curCrab = crabN(cur.rows), lastCrab = crabN(last.rows), yoyCrab = crabN(yoyRowsCmp);
    const curNon = nonN(cur.rows), lastNon = nonN(last.rows), yoyNon = nonN(yoyRowsCmp);
    const yoyCrabPct = yoyCrab ? (curCrab - yoyCrab) / yoyCrab * 100 : null;
    const yoyNonPctCg = yoyNon ? (curNon - yoyNon) / yoyNon * 100 : null;
    const dCrab = curCrab - lastCrab;
    const dNonCg = curNon - lastNon;
    const cmpHead = isYear
      ? `<th>比較項目</th><th>1–${viewM}月</th><th>累計差異</th><th>同期1–${viewM}月</th><th>同期比</th>`
      : `<th>比較項目</th><th>${viewM}月</th><th>${pm}月</th><th>差異</th><th>上月比</th><th>同期</th><th>同期比</th>`;
    const yearRows = `
      <tr><td>有業績縣市數</td><td>${fmt(cur.cityN)}</td>${crabTd(crabSigned(cur.cityN - yoy.cityN) + '市', crabCls(cur.cityN - yoy.cityN))}<td>${fmt(yoy.cityN)}</td>${crabTd(yoy.cityN ? crabPpTxt(yoyCityPct) : dash, crabCls(yoyCityPct))}</tr>
      <tr class="mark"><td>${esc(typeLab)}件數</td><td>${fmt(cur.n)}</td>${markDiff(crabSigned(cur.n - yoy.n), cur.n - yoy.n)}<td>${fmt(yoy.n)}</td>${markDiff(yoy.n ? crabPpTxt(yoyNPct) : dash, yoyNPct)}</tr>
      <tr><td>轉銜案件數</td><td>${fmt(curCrab)}</td>${crabTd(crabSigned(curCrab - yoyCrab), crabCls(curCrab - yoyCrab))}<td>${fmt(yoyCrab)}</td>${crabTd(yoyCrab ? crabPpTxt(yoyCrabPct) : dash, crabCls(yoyCrabPct))}</tr>
      <tr><td>非轉銜案件數</td><td>${fmt(curNon)}</td>${crabTd(crabSigned(curNon - yoyNon), crabCls(curNon - yoyNon))}<td>${fmt(yoyNon)}</td>${crabTd(yoyNon ? crabPpTxt(yoyNonPctCg) : dash, crabCls(yoyNonPctCg))}</tr>
      <tr><td>縣市均件</td><td>${avg.toFixed(2)}</td>${crabTd(`${(avg - yoyAvg) >= 0 ? '+' : ''}${(avg - yoyAvg).toFixed(2)}`, crabCls(avg - yoyAvg))}<td>${yoyAvg.toFixed(2)}</td>${crabTd(yoyAvg ? crabPpTxt(yoyAvgPct) : dash, crabCls(yoyAvgPct))}</tr>`;
    const monthRowsHtml = `
      <tr><td>有業績縣市數</td><td>${fmt(cur.cityN)}</td><td>${fmt(last.cityN)}</td>
        ${crabTd(crabSigned(dCity) + '市', crabCls(dCity))}
        ${crabTd(crabMomTxt(cur.cityN, last.cityN), crabCls(dCity))}
        <td>${fmt(yoy.cityN)}</td>${crabTd(yoy.cityN ? crabPpTxt(yoyCityPct) : dash, crabCls(yoyCityPct))}</tr>
      <tr class="mark"><td>${esc(typeLab)}件數</td><td>${fmt(cur.n)}</td><td>${fmt(last.n)}</td>
        ${markDiff(crabSigned(dN), dN)}
        ${markDiff(crabMomTxt(cur.n, last.n), dN)}
        <td>${fmt(yoy.n)}</td>${markDiff(yoy.n ? crabPpTxt(yoyNPct) : dash, yoyNPct)}</tr>
      <tr><td>轉銜案件數</td><td>${fmt(curCrab)}</td><td>${fmt(lastCrab)}</td>
        ${crabTd(crabSigned(dCrab), crabCls(dCrab))}
        ${crabTd(crabMomTxt(curCrab, lastCrab), crabCls(dCrab))}
        <td>${fmt(yoyCrab)}</td>${crabTd(yoyCrab ? crabPpTxt(yoyCrabPct) : dash, crabCls(yoyCrabPct))}</tr>
      <tr><td>非轉銜案件數</td><td>${fmt(curNon)}</td><td>${fmt(lastNon)}</td>
        ${crabTd(crabSigned(dNonCg), crabCls(dNonCg))}
        ${crabTd(crabMomTxt(curNon, lastNon), crabCls(dNonCg))}
        <td>${fmt(yoyNon)}</td>${crabTd(yoyNon ? crabPpTxt(yoyNonPctCg) : dash, crabCls(yoyNonPctCg))}</tr>
      <tr><td>縣市均件</td><td>${avg.toFixed(2)}</td><td>${lastAvg.toFixed(2)}</td>
        ${crabTd(`${dAvg >= 0 ? '+' : ''}${dAvg.toFixed(2)}`, crabCls(dAvg))}
        ${crabTd(crabMomTxt(avg, lastAvg), crabCls(dAvg))}
        <td>${yoyAvg.toFixed(2)}</td>${crabTd(yoyAvg ? crabPpTxt(yoyAvgPct) : dash, crabCls(yoyAvgPct))}</tr>`;
    $('cgCmpTbl').innerHTML = `<table class="crab-tbl"><thead><tr>${cmpHead}</tr></thead><tbody>${isYear ? yearRows : monthRowsHtml}</tbody></table>`;
    const gapAbs = Math.abs(Math.round(cur.tgt - cur.n));
    const cityNow = citySet(cur.rows);
    const cityMom = citySet(last.rows || []);
    const yoyRowsNow = isYear
      ? (focusNode.months || []).filter(x => x.m <= viewM).flatMap(x => x.yoyRows || [])
      : (((focusNode.months || [])[viewM - 1] || {}).yoyRows || []);
    const cityYoySet = citySet(yoyRowsNow);
    const cityPair = fromSet => {
      const added = [...cityNow].filter(o => !fromSet.has(o)).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
      const dropped = [...fromSet].filter(o => !cityNow.has(o)).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
      return { added, dropped };
    };
    const momCity = cityPair(cityMom);
    const yoyCityDiff = cityPair(cityYoySet);
    const cityMomBit = isYear ? '' : (() => {
      const bits = [];
      if (momCity.dropped.length) bits.push(`減少${momCity.dropped.join('、')}`);
      if (momCity.added.length) bits.push(`新增${momCity.added.join('、')}`);
      return bits.length ? `較${pm}月${bits.join('，')}` : '';
    })();
    const cityYoyBit = (() => {
      const yoyLab2 = isYear ? '去年同期' : '去年同月';
      const bits = [];
      if (yoyCityDiff.dropped.length) bits.push(`減少${yoyCityDiff.dropped.length}市(${yoyCityDiff.dropped.join('、')})`);
      if (yoyCityDiff.added.length) bits.push(`增加${yoyCityDiff.added.length}市(${yoyCityDiff.added.join('、')})`);
      return bits.length ? `較${yoyLab2}${bits.join('，')}` : '';
    })();
    const offBody = [`有業績縣市數${fmt(cur.cityN)}市`, cityMomBit, cityYoyBit].filter(Boolean).join('，') + '。';
    const peak = [...(focusNode.months || []).filter(x => x.m <= viewM)].sort((a, b) => b.n - a.n)[0];
    const avgTxt = v => Number(v || 0).toFixed(2);
    const pieceChg = (nowN, prevN) => {
      const d = Math.round(Number(nowN) - Number(prevN));
      if (!d) return '持平';
      return `${d > 0 ? '+' : '-'}${fmt(Math.abs(d))}件`;
    };
    const avgChg = (nowN, prevN) => {
      const d = Number(nowN) - Number(prevN);
      if (!isFinite(d) || Math.abs(d) < 0.005) return '持平';
      return `${d > 0 ? '+' : '-'}${Math.abs(d).toFixed(2)}件`;
    };
    const pctParen = (nowN, prevN) => {
      if (!prevN) return '';
      return `(${crabPpTxt((nowN - prevN) / prevN * 100)})`;
    };
    const yoyLab = isYear ? '去年同期' : '去年同月';
    const momBody = `${viewM}月${fmt(cur.n)}件，較${pm}月${pieceChg(cur.n, last.n)}${pctParen(cur.n, last.n)}，縣市均件${avgTxt(avg)}件，較${pm}月${avgChg(avg, lastAvg)}。`;
    const yoyBody = yoy.n
      ? `較${yoyLab}${pieceChg(cur.n, yoy.n)}${pctParen(cur.n, yoy.n)}，縣市均件較去年${pieceChg(avg, yoyAvg)}(同期${avgTxt(yoyAvg)}件)。`
      : '去年同期基期尚缺，暫不列同期比。';
    const countSo = rows => {
      const m = new Map();
      (rows || []).forEach(r => {
        if (!SALES_OFFICES.includes(r.so)) return;
        m.set(r.so, (m.get(r.so) || 0) + 1);
      });
      return m;
    };
    const nowByOff = countSo(cur.rows);
    const tgtSet = cityGrowTgtSet(focusNode);
    const salesInFocus = tgtSet && tgtSet.size
      ? SALES_OFFICES.filter(o => tgtSet.has(o))
      : [...nowByOff.keys()].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    const hasTgt = o => isYear
      ? Array.from({ length: viewM }, (_, i) => officeMonthTarget(o, y, i + 1)).some(v => v > 0)
      : officeMonthTarget(o, y, viewM) > 0;
    const tgtOffN = salesInFocus.filter(hasTgt).length;
    const hitList = salesInFocus.map(o => {
      const n = nowByOff.get(o) || 0;
      const tgt = isYear
        ? sumTargets(new Set([o]), new Date(y, 0, 1), monthEnd(new Date(y, viewM - 1, 1)))
        : officeMonthTarget(o, y, viewM);
      return { o, n, tgt, rate: tgt ? n / tgt : 0 };
    }).filter(x => x.tgt > 0 && x.n >= x.tgt).sort((a, b) => (b.rate - a.rate) || (b.n - a.n) || a.o.localeCompare(b.o, 'zh-Hant'));
    const tgtGapTxt = !cur.tgt
      ? '目標資料尚缺'
      : (rate < 1 ? `低於目標 ${fmt(gapAbs)} 件` : (rate > 1 ? `高於目標 ${fmt(gapAbs)} 件` : '已達目標'));
    const expandTxt = tgtOffN && tgtOffN !== cur.offN
      ? `拓展營業處有業績${fmt(cur.offN)}處，較目標${fmt(tgtOffN)}處${cur.offN < tgtOffN ? '少' : '多'}${fmt(Math.abs(cur.offN - tgtOffN))}處。`
      : '';
    const tgtBody = [`${lab}達成率${cur.tgt ? (rate * 100).toFixed(1) + '%' : '—'}，${tgtGapTxt}。`, expandTxt].filter(Boolean).join('');
    const hitBody = hitList.length
      ? `業績達標${hitList.map(x => `${x.o}${fmt(x.n)}件（${(x.rate * 100).toFixed(1)}%）`).join('、')}。`
      : '本期無營業處達標。';
    const ytdYoyPct = ytdYoy ? (ytdN - ytdYoy) / ytdYoy * 100 : null;
    const ytdBody = `1–${viewM}月累計${fmt(ytdN)}件${ytdTgt ? `，累計達成率${(ytdRate * 100).toFixed(1)}%` : ''}${peak ? `，單月最高${peak.m}月${fmt(peak.n)}件` : ''}。${ytdYoyPct == null ? '' : `累計同期比${crabPpTxt(ytdYoyPct)}。`}`;
    $('cgJudge').innerHTML = `<h4>管理結論（${esc(focusNode.name)}）</h4>
      ${isYear ? '' : judgeP('上月比', momBody)}
      ${judgeP('同期比', yoyBody)}
      ${judgeP('目標比', tgtBody)}
      ${judgeP('達成率', hitBody)}
      ${judgeP('單位差異', offBody)}
      ${judgeP('累計', ytdBody)}`;
    const isWeek = grain === 'week';
    const fineGrain = grain === 'day' || isWeek;
    const md = d => `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
    const weeks = settleWeeks(y, viewM);
    const yoyWeeks = settleWeeks(y - 1, viewM);
    const weekDays = w => {
      const a = new Date(w.start.getFullYear(), w.start.getMonth(), w.start.getDate());
      const b = new Date(w.end.getFullYear(), w.end.getMonth(), w.end.getDate());
      return Math.max(1, Math.round((b - a) / 86400000) + 1);
    };
    const wDays = weeks.map(weekDays);
    const monthRowsFg = ((focusNode.months || [])[viewM - 1] || {});
    const weekAct = bucketWeeks(monthRowsFg.rows || [], weeks);
    const weekYoy = weeks.map((_, i) => (bucketWeeks(monthRowsFg.yoyRows || [], yoyWeeks)[i] || 0));
    const weekBox = $('cgWeekBox');
    if (weekBox) weekBox.classList.toggle('hidden', !isWeek);
    if (isWeek && $('cgWeekTbl')) {
      const day0 = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const today = day0(now);
      let curWi = weeks.findIndex(w => day0(w.start) <= today && today <= day0(w.end));
      const allowC = new Set((state.cities || []).map(normCity));
      const allC = !allowC.size || allowC.size === CITIES.length;
      const cityCols = CITIES_NS.filter(c => CITIES.includes(c) && (allC || allowC.has(c)));
      const monthRowsAll = ((root.months || [])[viewM - 1] || {}).rows || [];
      const cityWeek = cityCols.map(city => bucketWeeks(monthRowsAll.filter(r => cityOfLease(r) === city), weeks));
      const twWeek = bucketWeeks(monthRowsAll, weeks);
      const allDays = weeks.length
        ? Math.max(1, Math.round((day0(weeks[weeks.length - 1].end) - day0(weeks[0].start)) / 86400000) + 1)
        : 0;
      const cityHead = cityCols.map(c => `<th>${esc(c)}</th>`).join('');
      const cells = (arr, lastHi) => arr.map((n, i) => `<td${lastHi && i === arr.length - 1 ? ' class="hi"' : ''}>${fmt(n)}</td>`).join('');
      const rowNums = i => cityCols.map((_, ci) => cityWeek[ci][i] || 0).concat([twWeek[i] || 0]);
      const allNums = cityCols.map((_, ci) => cityWeek[ci].reduce((s, n) => s + n, 0)).concat([twWeek.reduce((s, n) => s + n, 0)]);
      $('cgWeekTbl').innerHTML = `<table class="crab-tbl cg-week-city"><thead><tr>
        <th>週別／日期</th><th>天數</th>${cityHead}<th class="hi">全台合計</th>
      </tr></thead><tbody>${weeks.map((w, i) => `<tr class="${i === curWi ? 'mark' : ''}">
          <td>W${i + 1}　${md(w.start)}–${md(w.end)}</td>
          <td>${fmt(wDays[i])}</td>${cells(rowNums(i), true)}
        </tr>`).join('')}${weeks.length ? `<tr class="total">
          <td>All　${md(weeks[0].start)}–${md(weeks[weeks.length - 1].end)}</td>
          <td>${fmt(allDays)}</td>${cells(allNums, true)}
        </tr>` : ''}</tbody></table>`;
      const cgWeekTblEl = $('cgWeekTbl').querySelector('table');
      const cgWeekC1 = cgWeekTblEl && cgWeekTblEl.querySelector('th');
      if (cgWeekTblEl && cgWeekC1) cgWeekTblEl.style.setProperty('--cg-week-c1', cgWeekC1.getBoundingClientRect().width + 'px');
    }
    let labels = months.map(x => `${x.m}月`);
    let actual = months.map(x => {
      if (x.m > filterM) return null;
      return isYear ? sumThru(months, x.m, 'n') : x.n;
    });
    let yoyLine = months.map(x => isYear ? sumThru(months, x.m, 'yoyN') : x.yoyN);
    if (isWeek) {
      labels = weeks.map((_, i) => 'W' + (i + 1));
      actual = weekAct;
      yoyLine = weekYoy;
    } else if (grain === 'day') {
      const dim = new Date(y, viewM, 0).getDate();
      const buckets = [];
      for (let d = 1; d <= dim; d++) {
        const dt = new Date(y, viewM - 1, d);
        buckets.push({ label: `${viewM}/${d}`, s: dt, e: dt, days: 1 });
      }
      const actRows = monthRowsFg.rows || [];
      const yoyRowsFg = monthRowsFg.yoyRows || [];
      labels = buckets.map(b => b.label);
      actual = buckets.map(b => actRows.filter(r => startIn(r, b.s, b.e)).length);
      yoyLine = buckets.map(b => {
        const s = new Date(b.s.getFullYear() - 1, b.s.getMonth(), b.s.getDate());
        const e = new Date(b.e.getFullYear() - 1, b.e.getMonth(), b.e.getDate());
        return yoyRowsFg.filter(r => startIn(r, s, e)).length;
      });
    }
    $('cgChartTitle').textContent = grain === 'day'
      ? `${viewM}月逐日業績趨勢`
      : grain === 'week'
        ? `${viewM}月週別業績趨勢`
        : (isYear ? `1–${viewM}月累計趨勢` : '1–12月業績趨勢');
    $('cgChartNote').textContent = isWeek
      ? '深藍柱為實績（起租日歸月、送審日歸週；狀態含已生效／已到期／已解約／審／產編；同地址只計1件優先轉租）、綠線為去年同期。'
      : grain === 'day'
        ? `深藍柱為實績、綠線為去年同期。`
        : `深藍柱為實績、綠線為去年同期；${filterM < 12 ? `${filterM + 1}–12月尚未結算` : '全年已列入'}。點柱切換月份。`;
    const bandPlugin = {
      id: 'cgBand',
      beforeDraw(chart) {
        if (isYear || fineGrain) return;
        const meta = chart.getDatasetMeta(0);
        const pt = meta && meta.data[viewM - 1];
        if (!pt) return;
        const { ctx, chartArea } = chart;
        const bw = typeof pt.width === 'number' ? pt.width : 24;
        const w = bw + 10;
        ctx.save();
        ctx.fillStyle = '#e8eef6';
        ctx.fillRect(pt.x - w / 2, chartArea.top, w, chartArea.bottom - chartArea.top);
        ctx.restore();
      }
    };
    const labelPlugin = {
      id: 'cgLabels',
      afterDatasetsDraw(chart) {
        const { ctx, chartArea } = chart;
        chart.data.datasets.forEach((ds, di) => {
          const meta = chart.getDatasetMeta(di);
          if (!meta.visible) return;
          meta.data.forEach((pt, i) => {
            const v = ds.data[i];
            ctx.save();
            ctx.textAlign = 'center';
            ctx.font = '10px Arial, sans-serif';
            if (di === 0 && !fineGrain && i + 1 > filterM) {
              ctx.fillStyle = '#94a3b8';
              ctx.fillText('未結算', pt.x, chartArea.bottom - 6);
              ctx.restore();
              return;
            }
            if (v == null || !pt) { ctx.restore(); return; }
            if (di === 0) {
              ctx.fillStyle = '#fff';
              const base = pt.base != null ? pt.base : chartArea.bottom;
              const h = Math.abs(base - pt.y);
              if (h > 16) {
                ctx.textBaseline = 'middle';
                ctx.fillText(fmt(Math.round(v)), pt.x, (pt.y + base) / 2);
              } else {
                ctx.fillStyle = '#1e4a7a';
                ctx.textBaseline = 'bottom';
                ctx.fillText(fmt(Math.round(v)), pt.x, pt.y - 4);
              }
            } else {
              ctx.fillStyle = ds.borderColor || '#64748b';
              ctx.fillText(fmt(Math.round(v)), pt.x, pt.y - 4);
            }
            ctx.restore();
          });
        });
      }
    };
    const hide = state.cityGrowHide || {};
    upsert('cgChart', 'bar', labels, [
      {
        type: 'bar', label: '實績', data: actual, hidden: !!hide['實績'],
        backgroundColor: '#1e4a7a', borderRadius: 3, order: 3,
        barPercentage: fineGrain ? 0.72 : 0.55, categoryPercentage: 0.78, maxBarThickness: fineGrain ? 18 : 26
      },
      {
        type: 'line', label: '同期', data: yoyLine, hidden: !!hide['同期'],
        borderColor: '#22c55e',
        backgroundColor: '#fff', tension: 0.25, pointRadius: 3, pointHoverRadius: 4,
        fill: false, spanGaps: true, borderWidth: 2, order: 1,
        pointBackgroundColor: '#86efac', pointBorderColor: '#22c55e', pointBorderWidth: 2
      }
    ], {
      plugins: { legend: { display: false } },
      layout: { padding: { top: 2, right: 4 } },
      interaction: { mode: 'index', intersect: false },
      onClick: (evt, els) => {
        if (fineGrain || !els.length) return;
        const i = els[0].index + 1;
        if (i > filterM) return;
        state.cityGrowPick = i;
        state.cityGrowGrain = 'month';
        renderCityGrowAnalysis();
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: fineGrain ? 10 : 11 }, color: '#64748b', maxRotation: 0, autoSkip: true } },
        y: { beginAtZero: true, grid: { color: '#eef2f7' }, ticks: { font: { size: 10 }, color: '#94a3b8' } }
      }
    }, [bandPlugin, labelPlugin]);
    if ($('cgLegend')) {
      $('cgLegend').querySelectorAll('[data-cg-ds]').forEach(b => {
        b.classList.toggle('off', !!hide[b.dataset.cgDs]);
      });
    }
    const unitHead = isYear
      ? `${tblTh('cityGrow', 'name', '縣市區域')}${tblTh('cityGrow', 'n', `1–${viewM}月`)}${tblTh('cityGrow', 'd', '累計差異')}${tblTh('cityGrow', 'yoy', `同期1–${viewM}月`)}${tblTh('cityGrow', 'yoyP', '同期比')}`
      : `${tblTh('cityGrow', 'name', '縣市區域')}${tblTh('cityGrow', 'n', `${viewM}月`)}${tblTh('cityGrow', 'last', `${pm}月`)}${tblTh('cityGrow', 'd', '差異')}${tblTh('cityGrow', 'lastP', '上月比')}${tblTh('cityGrow', 'yoy', '同期')}${tblTh('cityGrow', 'yoyP', '同期比')}`;
    const html = [];
    const walk = (node, depth) => {
      const hasKids = node.kids && node.kids.length;
      const isOpen = node.id === '__SEL__' || open.has(node.id);
      const tog = hasKids
        ? `<button type="button" class="unit-tog" data-cg-open="${esc(node.id)}">${isOpen ? '▾' : '▸'}</button>`
        : `<span class="unit-tog-sp"></span>`;
      const on = node.id === focus ? ' on' : '';
      const d = node.c.n - node.c.last;
      const yoyP = node.c.yoy ? (node.c.n - node.c.yoy) / node.c.yoy * 100 : null;
      const ownerNode = node.kind === 'office' ? { id: node.so, name: node.name } : node;
      if (isYear) {
        html.push(`<tr class="${on}" data-cg-focus="${esc(node.id)}">
          ${unitCellHtml(ownerNode, depth, tog)}
          <td class="v num-hit" data-cg-months="${esc(node.id)}">${fmt(node.c.n)}</td>
          ${crabTd(crabSigned(d), crabCls(d))}
          <td class="v num-hit" data-cg-months="${esc(node.id)}">${fmt(node.c.yoy)}</td>
          ${crabTd(yoyP == null ? dash : crabPpTxt(yoyP), crabCls(yoyP))}
        </tr>`);
      } else {
        html.push(`<tr class="${on}" data-cg-focus="${esc(node.id)}">
          ${unitCellHtml(ownerNode, depth, tog)}
          <td class="v num-hit" data-cg-months="${esc(node.id)}">${fmt(node.c.n)}</td>
          <td class="v num-hit" data-cg-months="${esc(node.id)}">${fmt(node.c.last)}</td>
          ${crabTd(crabSigned(d), crabCls(d))}
          ${crabTd(crabMomTxt(node.c.n, node.c.last), crabCls(d))}
          <td class="v num-hit" data-cg-months="${esc(node.id)}">${fmt(node.c.yoy)}</td>
          ${crabTd(yoyP == null ? dash : crabPpTxt(yoyP), crabCls(yoyP))}
        </tr>`);
      }
      if (monthOpen.has(node.id)) {
        html.push(`<tr class="crab-mdetail"><td colspan="${isYear ? 5 : 7}"><table class="crab-mini"><thead><tr>
          <th>月</th><th>${esc(typeLab)}</th><th>去年同月</th><th>同期比</th>
        </tr></thead><tbody>${node.months.map(x => {
          const yp = x.yoyN ? (x.n - x.yoyN) / x.yoyN * 100 : null;
          return `<tr class="${x.m === viewM ? 'on' : ''}">
            <td>${x.m}月</td><td>${fmt(x.n)}</td><td>${fmt(x.yoyN)}</td>
            <td class="${crabCls(yp)}">${yp == null ? dash : crabPpTxt(yp)}</td>
          </tr>`;
        }).join('')}</tbody></table></td></tr>`);
      }
      if (hasKids && isOpen) node.kids.forEach(k => walk(k, depth + 1));
    };
    walk(root, 0);
    if ($('cgUnitNote')) {
      $('cgUnitNote').textContent = isYear
        ? `點縣市區域查閱｜點數字展開月細｜1–${viewM}月對去年1–${viewM}月`
        : `點縣市區域查閱｜點數字展開月細｜上月為${pm}月｜縣市展開為營業處`;
    }
    if ($('cgUnitTbl')) {
      $('cgUnitTbl').innerHTML = `<table class="type-tbl ana-tbl"><thead><tr>${unitHead}</tr></thead><tbody>${html.join('')}</tbody></table>`;
    }
    const rankRows = isYear ? (root.ytdRows || root.c.rows || []) : (((root.months || [])[viewM - 1] || {}).rows || root.c.rows || []);
    renderCityCountRank3($('cgOffRank'), rankRows);
    renderCityGrowStaff(cur.rows || [], focusNode.name || officeLab);
  }
  function renderCityGrowStaff(rows, scopeName) {
    const box = $('cgStaffBox');
    if (!box) return;
    bindStaffBox('cgStaffBox', 'cg');
    box.classList.toggle('hidden', !state.cgStaffOpen);
    if (!state.cgStaffOpen) {
      if (state.staffCase && state.staffCase.kind === 'cg') state.staffCase = null;
      box.innerHTML = '';
      return;
    }
    const map = new Map();
    rows.forEach(r => {
      const name = r.sl || '—';
      const office = r.so || '—';
      const key = office + '\t' + name;
      if (!map.has(key)) map.set(key, { office, name, rows: [] });
      map.get(key).rows.push(r);
    });
    const people = sortStaffPeople([...map.values()].map(p => ({ ...p, total: p.rows.length })), state.cgStaffSort || 'total', state.cgStaffDir || 'desc');
    staffPeople.cg = people;
    box.innerHTML = `
      ${staffHead(esc(scopeName) + ' ｜ 縣市業績業務明細')}
      <p class="src-staff-k">共 ${fmt(people.reduce((s, p) => s + p.total, 0))} 件。點數字展開案件明細</p>
      <div class="src-staff-scroll"><table class="src-combo"><thead><tr>
        <th data-sort="office" class="${staffSortMark('cg', 'office')}">業務營業處</th>
        <th data-sort="name" class="${staffSortMark('cg', 'name')}">業務</th>
        <th data-sort="total" class="${staffSortMark('cg', 'total')}">件數</th>
      </tr></thead><tbody>
        ${people.map(p => `<tr>
          <td>${esc(p.office)}</td><td class="name-hit">${esc(p.name)}</td>
          ${numTd(p.total, 'total')}
        </tr>`).join('') || '<tr><td colspan="3">無資料</td></tr>'}
      </tbody></table></div>
      ${staffCasePanel('cg')}`;
  }

  function cityRateGrowCfg(kind) {
    const base = rateGrowCfg(kind);
    if (base.kind === 'weak') {
      return Object.assign({}, base, {
        pfx: 'wkCg', ds: 'wkcg',
        title: '縣市政策戶比率概況與成長分析',
        staffKind: 'wkCg',
        staffHead: '縣市政策戶比率業務明細',
        rankTitle: '各縣市政策戶比率排行榜',
        rankNote: '依租賃地址前三字歸縣市，口徑與政策戶比率達成與成長分析相同'
      });
    }
    if (base.kind === 'new') {
      return Object.assign({}, base, {
        pfx: 'nwCg', ds: 'nwcg',
        title: '縣市新件率概況與成長分析',
        staffKind: 'nwCg',
        staffHead: '縣市新件率業務明細',
        rankTitle: '各縣市新件率排行榜',
        rankNote: '依租賃地址前三字歸縣市，口徑與新件率達成與成長分析相同'
      });
    }
    return Object.assign({}, base, {
      pfx: 'lzCg', ds: 'lzcg',
      title: '縣市包租率概況與成長分析',
      staffKind: 'lzCg',
      staffHead: '縣市包租率業務明細',
      rankTitle: '各縣市包租率排行榜',
      rankNote: '依租賃地址前三字歸縣市，口徑與包租率達成與成長分析相同'
    });
  }
  function renderCityRateRank3(el, rows, cfg) {
    if (!el) return;
    const map = {};
    (rows || []).forEach(r => {
      const c = cityOfLease(r);
      if (!c) return;
      if (!map[c]) map[c] = [];
      map[c].push(r);
    });
    const tgt = dashTarget(cfg.kind);
    const arr = Object.entries(map).map(([c, list]) => {
      const n = list.length, hit = list.filter(cfg.isHit).length;
      return [c, n ? hit / n : 0, hit, n];
    }).sort((a, b) => b[1] - a[1] || b[2] - a[2] || a[0].localeCompare(b[0], 'zh-Hant')).slice(0, 16);
    const max = Math.max(...arr.map(x => x[1]), 0.01);
    const cols = [arr.slice(0, 8), arr.slice(8, 16)];
    el.innerHTML = `<h4>${esc(cfg.rankTitle)}</h4>
      <p class="note">${esc(cfg.rankNote)}</p>
      <div class="off-rank-3">${cols.map((col, ci) => `<div class="rank-list">${col.map((x, i) => {
        const rate = x[1];
        return rankRowHtml(ci * 8 + i, x[0], (rate / max) * 100, (rate * 100).toFixed(1) + '%', rankToneRate(rate, tgt, tgt * 0.6));
      }).join('')}</div>`).join('')}</div>`;
  }
  function renderLzCityGrowAnalysis() { renderCityRateGrow('lease'); }
  function renderWkCityGrowAnalysis() { renderCityRateGrow('weak'); }
  function renderNwCityGrowAnalysis() { renderCityRateGrow('new'); }
  function renderCityRateGrow(kind) {
    const cfg = cityRateGrowCfg(kind);
    if (!$(cfg.pfx + 'Kpis')) return;
    const y = state.end.getFullYear();
    const filterM = state.end.getMonth() + 1;
    const grain = state[cfg.pfx + 'Grain'] || 'month';
    const isYear = grain === 'year';
    const pick = state[cfg.pfx + 'Pick'] || filterM;
    const viewM = Math.min(isYear ? filterM : pick, filterM);
    const prev = addMonths(new Date(y, viewM - 1, 1), -1);
    const py = prev.getFullYear(), pm = prev.getMonth() + 1;
    const typeLab = leaseTypeShort() || '新媒合';
    const officeLab = ddLabel('office');
    const rocY = y - 1911;
    const tgtRate = dashTarget(cfg.kind);
    const monthsAll = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      return { m, rows: cfg.monthRows(y, m), yoyRows: cfg.monthRows(y - 1, m) };
    });
    const lastYearLast = cfg.monthRows(py, pm);
    const pack = rows => {
      const list = rows || [];
      const n = list.length;
      const lease = list.filter(cfg.isHit).length;
      return { n, lease, rate: n ? lease / n : 0, rows: list };
    };
    const decorate = (node) => {
      const keep = r => cityGrowKeep(node, r);
      const mm = monthsAll.map(x => {
        const rows = x.rows.filter(keep);
        const yoyRows = x.yoyRows.filter(keep);
        const a = pack(rows), b = pack(yoyRows);
        return { m: x.m, rows, yoyRows, n: a.n, lease: a.lease, rate: a.rate, yoyN: b.n, yoyLease: b.lease, yoyRate: b.rate };
      });
      const lastRows = lastYearLast.filter(keep);
      const lastP = pack(lastRows);
      const ytdRows = mm.filter(x => x.m <= viewM).flatMap(x => x.rows);
      const ytdYoyRows = mm.filter(x => x.m <= viewM).flatMap(x => x.yoyRows);
      const nowM = mm[viewM - 1];
      const ytd = pack(ytdRows);
      const ytdYoy = pack(ytdYoyRows);
      const nowP = pack(nowM.rows);
      let kids;
      if (node.kind === 'city') {
        const sos = [...new Set(mm.flatMap(x => x.rows).map(r => r.so).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
        kids = sos.map(so => decorate({
          id: cfg.pfx + 'O:' + node.name + ':' + so,
          name: so, kind: 'office', city: node.name, so, kids: []
        }));
      } else {
        kids = (node.kids || []).map(decorate);
      }
      return {
        ...node, kids, months: mm, lastRows, ytdRows,
        c: {
          n: isYear ? ytd.n : nowP.n,
          lease: isYear ? ytd.lease : nowP.lease,
          rate: isYear ? ytd.rate : nowP.rate,
          last: isYear ? ytdYoy.n : lastP.n,
          lastLease: isYear ? ytdYoy.lease : lastP.lease,
          lastRate: isYear ? ytdYoy.rate : lastP.rate,
          yoy: isYear ? ytdYoy.n : nowM.yoyN,
          yoyLease: isYear ? ytdYoy.lease : nowM.yoyLease,
          yoyRate: isYear ? ytdYoy.rate : nowM.yoyRate,
          cityN: cityCount(isYear ? ytdRows : nowP.rows),
          lastCity: isYear ? 0 : cityCount(lastRows),
          yoyCity: cityCount(isYear ? ytdYoyRows : nowM.yoyRows),
          rows: isYear ? ytdRows : nowP.rows
        }
      };
    };
    const prune = node => {
      const kids = (node.kids || []).map(prune).filter(Boolean);
      const n = node.c || {};
      if (node.kind === 'office') {
        const any = (node.months || []).some(x => x.n || x.yoyN) || n.last;
        if (!any) return null;
      }
      if (node.kind === 'city' && !kids.length && !(n.n || n.last || n.yoy)) return null;
      if (node.kind === 'region' && !kids.length) return null;
      return { ...node, kids };
    };
    const root = prune(decorate(cityGrowTree())) || decorate(cityGrowTree());
    const gSort = state[cfg.pfx + 'TblSort'] || '';
    if (gSort) {
      sortUnitTree(root, n => {
        if (gSort === 'name') return n.name;
        if (gSort === 'n' || gSort === 'rate') return n.c.rate;
        if (gSort === 'last') return n.c.lastRate;
        if (gSort === 'd' || gSort === 'lastP') return n.c.rate - n.c.lastRate;
        if (gSort === 'yoy') return n.c.yoyRate;
        if (gSort === 'yoyP') return n.c.rate - n.c.yoyRate;
        return n.c.rate;
      }, state[cfg.pfx + 'TblDir'] || 'desc');
    }
    const open = new Set(state[cfg.pfx + 'Open'] || ['全公司']);
    if (root.id === '__SEL__') {
      open.add('__SEL__');
      if ((root.kids || []).length === 1) open.add(root.kids[0].id);
    }
    const monthOpen = new Set(state[cfg.pfx + 'MonthOpen'] || []);
    if (!findUnitNode(root, state[cfg.pfx + 'Focus'] || '')) state[cfg.pfx + 'Focus'] = root.id;
    const focus = state[cfg.pfx + 'Focus'] || root.id;
    const focusNode = findUnitNode(root, focus) || root;
    const months = focusNode.months;
    const sumThru = (list, thru, key) => list.filter(x => x.m <= thru).reduce((s, x) => s + x[key], 0);
    const thruRate = (list, thru, leaseK, nK) => {
      const n = sumThru(list, thru, nK);
      return n ? sumThru(list, thru, leaseK) / n : 0;
    };
    const fc = focusNode.c;
    const rate = fc.rate, lastRate = fc.lastRate, yoyRate = fc.yoyRate;
    const ytdR = isYear ? rate : thruRate(months, viewM, 'lease', 'n');
    const ytdYoyR = isYear ? yoyRate : thruRate(months, viewM, 'yoyLease', 'yoyN');
    const ytdLeaseN = sumThru(months, viewM, 'lease');
    const ytdTotalN = sumThru(months, viewM, 'n');
    const momPp = (rate - lastRate) * 100;
    const yoyPp = (rate - yoyRate) * 100;
    const ytdPp = (ytdR - ytdYoyR) * 100;
    if ($(cfg.pfx + 'Seg')) $(cfg.pfx + 'Seg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === grain));
    if ($(cfg.pfx + 'StaffBtn')) $(cfg.pfx + 'StaffBtn').classList.toggle('on', !!state[cfg.pfx + 'StaffOpen']);
    $(cfg.pfx + 'Title').textContent = cfg.title;
    $(cfg.pfx + 'Meta').textContent = `${rocY}年${viewM}月 ｜ ${officeLab} ｜ ${typeLab} ｜ ${cfg.formula || (cfg.rateName + '＝' + cfg.piece + '件／' + typeLab)} ｜ 目前單位：${focusNode.name}｜${grain === 'day' ? '趨勢為當月逐日' : grain === 'week' ? '起租日歸月、送審日歸週' : '點柱切換月份'}｜縣市依租賃地址前三字`;
    const lab = isYear ? `1–${viewM}月` : `${viewM}月`;
    const lastLab = `${pm}月`;
    const dash = '—';
    const pctHtml = p => {
      if (p == null || !isFinite(p)) return dash;
      const cls = crabCls(p);
      const t = crabPpTxt(p);
      return cls ? `<span class="${cls}">${t}</span>` : t;
    };
    const rateTxtN = v => `${((v || 0) * 100).toFixed(1)}%`;
    const signedHtml = (n, unit) => {
      const v = Number(n) || 0;
      const cls = crabCls(v);
      const body = `${v > 0 ? '+' : ''}${v.toFixed(1)}${unit || '%'}`;
      return cls ? `<span class="${cls}">${body}</span>` : body;
    };
    $(cfg.pfx + 'Kpis').innerHTML = `
      <div class="card kpi">
        <div class="k">${lab}${esc(cfg.rateName)}</div>
        <div class="v">${rateTxtN(rate)}</div>
        <div class="s">${isYear
          ? `同期${rateTxtN(yoyRate)}（${signedHtml(yoyPp)}）`
          : `上月比 ${pctHtml(momPp)}（${lastLab}${rateTxtN(lastRate)}）`}</div>
      </div>
      <div class="card kpi ${!isYear && momPp < 0 ? 'down' : (!isYear && momPp > 0 ? 'up' : '')}">
        <div class="k">上月成長</div>
        <div class="v">${isYear ? dash : pctHtml(momPp)}</div>
        <div class="s">${isYear ? '年度累計不列上月比' : `${lastLab}${rateTxtN(lastRate)}（${signedHtml(momPp)}）`}</div>
      </div>
      <div class="card kpi ${yoyPp < 0 ? 'down' : (yoyPp > 0 ? 'up' : '')}">
        <div class="k">同期成長</div>
        <div class="v">${pctHtml(yoyPp)}</div>
        <div class="s">同期${rateTxtN(yoyRate)}（${signedHtml(yoyPp)}）</div>
      </div>
      <div class="card kpi">
        <div class="k">1–${viewM}月累計${esc(cfg.rateName)}</div>
        <div class="v">${rateTxtN(ytdR)}</div>
        <div class="s">${esc(cfg.pieceShort)}${fmt(ytdLeaseN)}／${fmt(ytdTotalN)}件（${signedHtml(ytdPp)}）</div>
      </div>`;
    const dCity = fc.cityN - fc.lastCity;
    const yoyCityPct = fc.yoyCity ? (fc.cityN - fc.yoyCity) / fc.yoyCity * 100 : null;
    const markDiff = (txt, n) => crabTd(txt, `${crabCls(n)} ${crabTint(n)}`.trim());
    const dLease = fc.lease - fc.lastLease;
    const yoyLeasePct = fc.yoyLease ? (fc.lease - fc.yoyLease) / fc.yoyLease * 100 : null;
    const dN = fc.n - fc.last;
    const yoyNPct = fc.yoy ? (fc.n - fc.yoy) / fc.yoy * 100 : null;
    const cmpHead = isYear
      ? `<th>比較項目</th><th>1–${viewM}月</th><th>累計差異</th><th>同期1–${viewM}月</th><th>同期比</th>`
      : `<th>比較項目</th><th>${viewM}月</th><th>${pm}月</th><th>差異</th><th>上月比</th><th>同期</th><th>同期比</th>`;
    const yearRows = `
      <tr><td>有業績縣市數</td><td>${fmt(fc.cityN)}</td>${crabTd(crabSigned(fc.cityN - fc.yoyCity) + '市', crabCls(fc.cityN - fc.yoyCity))}<td>${fmt(fc.yoyCity)}</td>${crabTd(fc.yoyCity ? crabPpTxt(yoyCityPct) : dash, crabCls(yoyCityPct))}</tr>
      <tr class="mark"><td>${esc(cfg.rateName)}</td><td>${rateTxtN(rate)}</td>${markDiff(crabPpTxt(yoyPp), yoyPp)}<td>${rateTxtN(yoyRate)}</td>${markDiff(crabPpTxt(yoyPp), yoyPp)}</tr>
      <tr><td>${esc(cfg.pieceN)}</td><td>${fmt(fc.lease)}</td>${crabTd(crabSigned(fc.lease - fc.yoyLease), crabCls(fc.lease - fc.yoyLease))}<td>${fmt(fc.yoyLease)}</td>${crabTd(yoyLeasePct == null ? dash : crabPpTxt(yoyLeasePct), crabCls(yoyLeasePct))}</tr>
      <tr><td>總件數</td><td>${fmt(fc.n)}</td>${crabTd(crabSigned(fc.n - fc.yoy), crabCls(fc.n - fc.yoy))}<td>${fmt(fc.yoy)}</td>${crabTd(yoyNPct == null ? dash : crabPpTxt(yoyNPct), crabCls(yoyNPct))}</tr>`;
    const monthRowsHtml = `
      <tr><td>有業績縣市數</td><td>${fmt(fc.cityN)}</td><td>${fmt(fc.lastCity)}</td>
        ${crabTd(crabSigned(dCity) + '市', crabCls(dCity))}
        ${crabTd(crabMomTxt(fc.cityN, fc.lastCity), crabCls(dCity))}
        <td>${fmt(fc.yoyCity)}</td>${crabTd(fc.yoyCity ? crabPpTxt(yoyCityPct) : dash, crabCls(yoyCityPct))}</tr>
      <tr class="mark"><td>${esc(cfg.rateName)}</td><td>${rateTxtN(rate)}</td><td>${rateTxtN(lastRate)}</td>
        ${markDiff(crabPpTxt(momPp), momPp)}
        ${markDiff(crabPpTxt(momPp), momPp)}
        <td>${rateTxtN(yoyRate)}</td>${markDiff(crabPpTxt(yoyPp), yoyPp)}</tr>
      <tr><td>${esc(cfg.pieceN)}</td><td>${fmt(fc.lease)}</td><td>${fmt(fc.lastLease)}</td>
        ${crabTd(crabSigned(dLease), crabCls(dLease))}
        ${crabTd(crabMomTxt(fc.lease, fc.lastLease), crabCls(dLease))}
        <td>${fmt(fc.yoyLease)}</td>${crabTd(yoyLeasePct == null ? dash : crabPpTxt(yoyLeasePct), crabCls(yoyLeasePct))}</tr>
      <tr><td>總件數</td><td>${fmt(fc.n)}</td><td>${fmt(fc.last)}</td>
        ${crabTd(crabSigned(dN), crabCls(dN))}
        ${crabTd(crabMomTxt(fc.n, fc.last), crabCls(dN))}
        <td>${fmt(fc.yoy)}</td>${crabTd(yoyNPct == null ? dash : crabPpTxt(yoyNPct), crabCls(yoyNPct))}</tr>`;
    $(cfg.pfx + 'CmpTbl').innerHTML = `<table class="crab-tbl"><thead><tr>${cmpHead}</tr></thead><tbody>${isYear ? yearRows : monthRowsHtml}</tbody></table>`;
    const cityNow = citySet(fc.rows);
    const cityMom = citySet(focusNode.lastRows || []);
    const yoyRowsNow = isYear
      ? (focusNode.months || []).filter(x => x.m <= viewM).flatMap(x => x.yoyRows || [])
      : (((focusNode.months || [])[viewM - 1] || {}).yoyRows || []);
    const cityPair = fromSet => {
      const added = [...cityNow].filter(o => !fromSet.has(o)).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
      const dropped = [...fromSet].filter(o => !cityNow.has(o)).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
      return { added, dropped };
    };
    const momCity = cityPair(cityMom);
    const yoyCityDiff = cityPair(citySet(yoyRowsNow));
    const cityMomBit = isYear ? '' : (() => {
      const bits = [];
      if (momCity.dropped.length) bits.push(`減少${momCity.dropped.join('、')}`);
      if (momCity.added.length) bits.push(`新增${momCity.added.join('、')}`);
      return bits.length ? `較${pm}月${bits.join('，')}` : '';
    })();
    const cityYoyBit = (() => {
      const yoyLab2 = isYear ? '去年同期' : '去年同月';
      const bits = [];
      if (yoyCityDiff.dropped.length) bits.push(`減少${yoyCityDiff.dropped.length}市(${yoyCityDiff.dropped.join('、')})`);
      if (yoyCityDiff.added.length) bits.push(`增加${yoyCityDiff.added.length}市(${yoyCityDiff.added.join('、')})`);
      return bits.length ? `較${yoyLab2}${bits.join('，')}` : '';
    })();
    const offBody = [`有業績縣市數${fmt(fc.cityN)}市`, cityMomBit, cityYoyBit].filter(Boolean).join('，') + '。';
    const peak = [...(focusNode.months || []).filter(x => x.m <= viewM)].sort((a, b) => b.rate - a.rate)[0];
    const yoyLab = isYear ? '去年同期' : '去年同月';
    const momBody = `${viewM}月${cfg.rateName}${rateTxtN(rate)}，較${pm}月${crabPpTxt(momPp)}，${cfg.pieceN}${fmt(fc.lease)}件。`;
    const yoyBody = `較${yoyLab}${crabPpTxt(yoyPp)}（同期${rateTxtN(yoyRate)}）。`;
    const ytdBody = `1–${viewM}月累計${cfg.rateName}${rateTxtN(ytdR)}，${cfg.pieceShort}${fmt(ytdLeaseN)}／${fmt(ytdTotalN)}件${peak ? `，單月最高${peak.m}月${rateTxtN(peak.rate)}` : ''}。累計同期比${crabPpTxt(ytdPp)}。`;
    $(cfg.pfx + 'Judge').innerHTML = `<h4>管理結論（${esc(focusNode.name)}）</h4>
      ${isYear ? '' : judgeP('上月比', momBody)}
      ${judgeP('同期比', yoyBody)}
      ${judgeP('單位差異', offBody)}
      ${judgeP('累計', ytdBody)}`;
    const isWeek = grain === 'week';
    const fineGrain = grain === 'day' || isWeek;
    const md = d => `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
    const weeks = settleWeeks(y, viewM);
    const yoyWeeks = settleWeeks(y - 1, viewM);
    const weekDays = w => {
      const a = new Date(w.start.getFullYear(), w.start.getMonth(), w.start.getDate());
      const b = new Date(w.end.getFullYear(), w.end.getMonth(), w.end.getDate());
      return Math.max(1, Math.round((b - a) / 86400000) + 1);
    };
    const wDays = weeks.map(weekDays);
    const monthRowsFg = ((focusNode.months || [])[viewM - 1] || {});
    const hitRows = rows => (rows || []).filter(cfg.isHit);
    const weekRate = (rows, wks) => {
      const tot = bucketWeeks(rows || [], wks);
      const hit = bucketWeeks(hitRows(rows), wks);
      return tot.map((n, i) => n ? hit[i] / n * 100 : 0);
    };
    const weekAct = weekRate(monthRowsFg.rows || [], weeks);
    const weekYoy = weekRate(monthRowsFg.yoyRows || [], yoyWeeks);
    const weekBox = $(cfg.pfx + 'WeekBox');
    if (weekBox) weekBox.classList.toggle('hidden', !isWeek);
    if (isWeek && $(cfg.pfx + 'WeekTbl')) {
      const day0 = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const today = day0(now);
      let curWi = weeks.findIndex(w => day0(w.start) <= today && today <= day0(w.end));
      const allowC = new Set((state.cities || []).map(normCity));
      const allC = !allowC.size || allowC.size === CITIES.length;
      const cityCols = CITIES_NS.filter(c => CITIES.includes(c) && (allC || allowC.has(c)));
      const monthRowsAll = ((root.months || [])[viewM - 1] || {}).rows || [];
      const cityWeek = cityCols.map(city => bucketWeeks(hitRows(monthRowsAll.filter(r => cityOfLease(r) === city)), weeks));
      const twWeek = bucketWeeks(hitRows(monthRowsAll), weeks);
      const allDays = weeks.length
        ? Math.max(1, Math.round((day0(weeks[weeks.length - 1].end) - day0(weeks[0].start)) / 86400000) + 1)
        : 0;
      const cityHead = cityCols.map(c => `<th>${esc(c)}</th>`).join('');
      const cells = arr => arr.map((n, i) => `<td${i === arr.length - 1 ? ' class="hi"' : ''}>${fmt(n)}</td>`).join('');
      const rowNums = i => cityCols.map((_, ci) => cityWeek[ci][i] || 0).concat([twWeek[i] || 0]);
      const allNums = cityCols.map((_, ci) => cityWeek[ci].reduce((s, n) => s + n, 0)).concat([twWeek.reduce((s, n) => s + n, 0)]);
      $(cfg.pfx + 'WeekTbl').innerHTML = `<table class="crab-tbl cg-week-city"><thead><tr>
        <th>週別／日期</th><th>天數</th>${cityHead}<th class="hi">全台合計</th>
      </tr></thead><tbody>${weeks.map((w, i) => `<tr class="${i === curWi ? 'mark' : ''}">
          <td>W${i + 1}　${md(w.start)}–${md(w.end)}</td>
          <td>${fmt(wDays[i])}</td>${cells(rowNums(i))}
        </tr>`).join('')}${weeks.length ? `<tr class="total">
          <td>All　${md(weeks[0].start)}–${md(weeks[weeks.length - 1].end)}</td>
          <td>${fmt(allDays)}</td>${cells(allNums)}
        </tr>` : ''}</tbody></table>`;
      const tbl = $(cfg.pfx + 'WeekTbl').querySelector('table');
      const c1 = tbl && tbl.querySelector('th');
      if (tbl && c1) tbl.style.setProperty('--cg-week-c1', c1.getBoundingClientRect().width + 'px');
    }
    let labels = months.map(x => `${x.m}月`);
    let actual = months.map(x => {
      if (x.m > filterM) return null;
      return isYear ? thruRate(months, x.m, 'lease', 'n') * 100 : x.rate * 100;
    });
    let yoyLine = months.map(x => isYear ? thruRate(months, x.m, 'yoyLease', 'yoyN') * 100 : x.yoyRate * 100);
    if (isWeek) {
      labels = weeks.map((_, i) => 'W' + (i + 1));
      actual = weekAct;
      yoyLine = weekYoy;
    } else if (grain === 'day') {
      const dim = new Date(y, viewM, 0).getDate();
      const actRows = monthRowsFg.rows || [];
      const yoyRowsFg = monthRowsFg.yoyRows || [];
      const dayRate = (list, s, e) => {
        const rows = list.filter(r => startIn(r, s, e));
        const n = rows.length;
        return n ? rows.filter(cfg.isHit).length / n * 100 : 0;
      };
      labels = Array.from({ length: dim }, (_, i) => `${viewM}/${i + 1}`);
      actual = Array.from({ length: dim }, (_, i) => {
        const dt = new Date(y, viewM - 1, i + 1);
        return dayRate(actRows, dt, dt);
      });
      yoyLine = Array.from({ length: dim }, (_, i) => {
        const s = new Date(y - 1, viewM - 1, i + 1);
        return dayRate(yoyRowsFg, s, s);
      });
    }
    $(cfg.pfx + 'ChartTitle').textContent = grain === 'day'
      ? `${viewM}月逐日${cfg.rateName}趨勢`
      : grain === 'week'
        ? `${viewM}月週別${cfg.rateName}趨勢`
        : (isYear ? `1–${viewM}月累計${cfg.rateName}趨勢` : `1–12月${cfg.rateName}趨勢`);
    $(cfg.pfx + 'ChartNote').textContent = isWeek
      ? `深藍柱為${cfg.rateName}（起租日歸月、送審日歸週）、綠線為去年同期；週期表明細為${cfg.pieceN}。`
      : grain === 'day'
        ? `深藍柱為${cfg.rateName}、綠線為去年同期。`
        : `深藍柱為${cfg.rateName}、綠線為去年同期；${filterM < 12 ? `${filterM + 1}–12月尚未結算` : '全年已列入'}。點柱切換月份。`;
    const bandPlugin = {
      id: cfg.pfx + 'Band',
      beforeDraw(chart) {
        if (isYear || fineGrain) return;
        const meta = chart.getDatasetMeta(0);
        const pt = meta && meta.data[viewM - 1];
        if (!pt) return;
        const { ctx, chartArea } = chart;
        const bw = typeof pt.width === 'number' ? pt.width : 24;
        const w = bw + 10;
        ctx.save();
        ctx.fillStyle = '#e8eef6';
        ctx.fillRect(pt.x - w / 2, chartArea.top, w, chartArea.bottom - chartArea.top);
        ctx.restore();
      }
    };
    const fmtPct = v => (Math.round(Number(v) * 10) / 10).toFixed(1);
    const labelPlugin = {
      id: cfg.pfx + 'Labels',
      afterDatasetsDraw(chart) {
        const { ctx, chartArea } = chart;
        chart.data.datasets.forEach((ds, di) => {
          const meta = chart.getDatasetMeta(di);
          if (!meta.visible) return;
          meta.data.forEach((pt, i) => {
            const v = ds.data[i];
            ctx.save();
            ctx.textAlign = 'center';
            ctx.font = '10px Arial, sans-serif';
            if (di === 0 && !fineGrain && i + 1 > filterM) {
              ctx.fillStyle = '#94a3b8';
              ctx.fillText('未結算', pt.x, chartArea.bottom - 6);
              ctx.restore();
              return;
            }
            if (v == null || !pt) { ctx.restore(); return; }
            if (di === 0) {
              ctx.fillStyle = '#fff';
              const base = pt.base != null ? pt.base : chartArea.bottom;
              const h = Math.abs(base - pt.y);
              if (h > 16) {
                ctx.textBaseline = 'middle';
                ctx.fillText(fmtPct(v), pt.x, (pt.y + base) / 2);
              } else {
                ctx.fillStyle = '#1e4a7a';
                ctx.textBaseline = 'bottom';
                ctx.fillText(fmtPct(v), pt.x, pt.y - 4);
              }
            } else {
              ctx.fillStyle = ds.borderColor || '#64748b';
              ctx.fillText(fmtPct(v), pt.x, pt.y - 4);
            }
            ctx.restore();
          });
        });
      }
    };
    const hide = state[cfg.pfx + 'Hide'] || {};
    upsert(cfg.pfx + 'Chart', 'bar', labels, [
      {
        type: 'bar', label: '實績', data: actual, hidden: !!hide['實績'],
        backgroundColor: '#1e4a7a', borderRadius: 3, order: 3,
        barPercentage: fineGrain ? 0.72 : 0.55, categoryPercentage: 0.78, maxBarThickness: fineGrain ? 18 : 26
      },
      {
        type: 'line', label: '同期', data: yoyLine, hidden: !!hide['同期'],
        borderColor: '#22c55e',
        backgroundColor: '#fff', tension: 0.25, pointRadius: 3, pointHoverRadius: 4,
        fill: false, spanGaps: true, borderWidth: 2, order: 1,
        pointBackgroundColor: '#86efac', pointBorderColor: '#22c55e', pointBorderWidth: 2
      }
    ], {
      plugins: { legend: { display: false } },
      layout: { padding: { top: 2, right: 4 } },
      interaction: { mode: 'index', intersect: false },
      onClick: (evt, els) => {
        if (fineGrain || !els.length) return;
        const i = els[0].index + 1;
        if (i > filterM) return;
        state[cfg.pfx + 'Pick'] = i;
        state[cfg.pfx + 'Grain'] = 'month';
        renderCityRateGrow(cfg.kind);
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: fineGrain ? 10 : 11 }, color: '#64748b', maxRotation: 0, autoSkip: true } },
        y: {
          beginAtZero: true, suggestedMax: cfg.yMax,
          grid: { color: '#eef2f7' },
          ticks: { font: { size: 10 }, color: '#94a3b8', callback: v => v + '%' }
        }
      }
    }, [bandPlugin, labelPlugin]);
    if ($(cfg.pfx + 'Legend')) {
      $(cfg.pfx + 'Legend').querySelectorAll(`[data-${cfg.ds}-ds]`).forEach(b => {
        b.classList.toggle('off', !!hide[b.dataset[cfg.ds + 'Ds']]);
      });
    }
    const unitHead = isYear
      ? `${tblTh(cfg.pfx, 'name', '縣市區域')}${tblTh(cfg.pfx, 'n', `1–${viewM}月`)}${tblTh(cfg.pfx, 'd', '累計差異')}${tblTh(cfg.pfx, 'yoy', `同期1–${viewM}月`)}${tblTh(cfg.pfx, 'yoyP', '同期比')}`
      : `${tblTh(cfg.pfx, 'name', '縣市區域')}${tblTh(cfg.pfx, 'n', `${viewM}月`)}${tblTh(cfg.pfx, 'last', `${pm}月`)}${tblTh(cfg.pfx, 'd', '差異')}${tblTh(cfg.pfx, 'lastP', '上月比')}${tblTh(cfg.pfx, 'yoy', '同期')}${tblTh(cfg.pfx, 'yoyP', '同期比')}`;
    const html = [];
    const walk = (node, depth) => {
      const hasKids = node.kids && node.kids.length;
      const isOpen = node.id === '__SEL__' || open.has(node.id);
      const tog = hasKids
        ? `<button type="button" class="unit-tog" data-${cfg.ds}-open="${esc(node.id)}">${isOpen ? '▾' : '▸'}</button>`
        : `<span class="unit-tog-sp"></span>`;
      const on = node.id === focus ? ' on' : '';
      const dPp = (node.c.rate - node.c.lastRate) * 100;
      const yoyP = (node.c.rate - node.c.yoyRate) * 100;
      const ownerNode = node.kind === 'office' ? { id: node.so, name: node.name } : node;
      if (isYear) {
        html.push(`<tr class="${on}" data-${cfg.ds}-focus="${esc(node.id)}">
          ${unitCellHtml(ownerNode, depth, tog)}
          <td class="v num-hit" data-${cfg.ds}-months="${esc(node.id)}">${rateTxtN(node.c.rate)}</td>
          ${crabTd(crabPpTxt(dPp), crabCls(dPp))}
          <td class="v num-hit" data-${cfg.ds}-months="${esc(node.id)}">${rateTxtN(node.c.yoyRate)}</td>
          ${crabTd(crabPpTxt(yoyP), crabCls(yoyP))}
        </tr>`);
      } else {
        html.push(`<tr class="${on}" data-${cfg.ds}-focus="${esc(node.id)}">
          ${unitCellHtml(ownerNode, depth, tog)}
          <td class="v num-hit" data-${cfg.ds}-months="${esc(node.id)}">${rateTxtN(node.c.rate)}</td>
          <td class="v num-hit" data-${cfg.ds}-months="${esc(node.id)}">${rateTxtN(node.c.lastRate)}</td>
          ${crabTd(crabPpTxt(dPp), crabCls(dPp))}
          ${crabTd(crabPpTxt(dPp), crabCls(dPp))}
          <td class="v num-hit" data-${cfg.ds}-months="${esc(node.id)}">${rateTxtN(node.c.yoyRate)}</td>
          ${crabTd(crabPpTxt(yoyP), crabCls(yoyP))}
        </tr>`);
      }
      if (monthOpen.has(node.id)) {
        html.push(`<tr class="crab-mdetail"><td colspan="${isYear ? 5 : 7}"><table class="crab-mini"><thead><tr>
          <th>月</th><th>${esc(cfg.rateName)}</th><th>去年同月</th><th>同期比</th>
        </tr></thead><tbody>${node.months.map(x => {
          const yp = (x.rate - x.yoyRate) * 100;
          return `<tr class="${x.m === viewM ? 'on' : ''}">
            <td>${x.m}月</td><td>${rateTxtN(x.rate)}</td><td>${rateTxtN(x.yoyRate)}</td>
            <td class="${crabCls(yp)}">${crabPpTxt(yp)}</td>
          </tr>`;
        }).join('')}</tbody></table></td></tr>`);
      }
      if (hasKids && isOpen) node.kids.forEach(k => walk(k, depth + 1));
    };
    walk(root, 0);
    if ($(cfg.pfx + 'UnitNote')) {
      $(cfg.pfx + 'UnitNote').textContent = isYear
        ? `點縣市區域查閱｜點數字展開月細｜1–${viewM}月對去年1–${viewM}月｜數字為${cfg.rateName}`
        : `點縣市區域查閱｜點數字展開月細｜上月為${pm}月｜縣市展開為營業處｜數字為${cfg.rateName}`;
    }
    if ($(cfg.pfx + 'UnitTbl')) {
      $(cfg.pfx + 'UnitTbl').innerHTML = `<table class="type-tbl ana-tbl"><thead><tr>${unitHead}</tr></thead><tbody>${html.join('')}</tbody></table>`;
    }
    const rankRows = isYear ? (root.ytdRows || root.c.rows || []) : (((root.months || [])[viewM - 1] || {}).rows || root.c.rows || []);
    renderCityRateRank3($(cfg.pfx + 'OffRank'), rankRows, cfg);
    renderCityRateGrowStaff(cfg, fc.rows || [], focusNode.name || officeLab);
  }
  function renderCityRateGrowStaff(cfg, rows, scopeName) {
    const box = $(cfg.pfx + 'StaffBox');
    if (!box) return;
    bindStaffBox(cfg.pfx + 'StaffBox', cfg.staffKind);
    box.classList.toggle('hidden', !state[cfg.pfx + 'StaffOpen']);
    if (!state[cfg.pfx + 'StaffOpen']) {
      if (state.staffCase && state.staffCase.kind === cfg.staffKind) state.staffCase = null;
      box.innerHTML = '';
      return;
    }
    const map = new Map();
    rows.forEach(r => {
      const name = r.sl || '—';
      const office = r.so || '—';
      const key = office + '\t' + name;
      if (!map.has(key)) map.set(key, { office, name, rows: [] });
      map.get(key).rows.push(r);
    });
    const people = sortStaffPeople([...map.values()].map(p => ({
      ...p, total: p.rows.length, hit: p.rows.filter(cfg.isHit).length
    })), state[cfg.pfx + 'StaffSort'] || 'total', state[cfg.pfx + 'StaffDir'] || 'desc');
    staffPeople[cfg.staffKind] = people;
    box.innerHTML = `
      ${staffHead(esc(scopeName) + ' ｜ ' + esc(cfg.staffHead))}
      <p class="src-staff-k">${esc(cfg.pieceN)} ${fmt(people.reduce((s, p) => s + p.hit, 0))} 件。點數字展開案件明細</p>
      <div class="src-staff-scroll"><table class="src-combo"><thead><tr>
        <th data-sort="office" class="${staffSortMark(cfg.staffKind, 'office')}">業務營業處</th>
        <th data-sort="name" class="${staffSortMark(cfg.staffKind, 'name')}">業務</th>
        <th data-sort="hit" class="${staffSortMark(cfg.staffKind, 'hit')}">${esc(cfg.staffCol)}</th>
        <th data-sort="total" class="${staffSortMark(cfg.staffKind, 'total')}">件數</th>
      </tr></thead><tbody>
        ${people.map(p => `<tr>
          <td>${esc(p.office)}</td><td class="name-hit">${esc(p.name)}</td>
          ${numTd(p.hit, 'hit')}${numTd(p.total, 'total')}
        </tr>`).join('') || '<tr><td colspan="4">無資料</td></tr>'}
      </tbody></table></div>
      ${staffCasePanel(cfg.staffKind)}`;
  }

  function leaseOfficeSet(rows) {
    return new Set((rows || []).filter(isLeaseCt).map(r => r.so).filter(o => SALES_OFFICES.includes(o)));
  }
  function mgmtToLeaseRows(year, month) {
    const start = new Date(year, month - 1, 1);
    const end = monthEnd(new Date(year, month - 1, 1));
    const pool = cachedPool('toLease', () => uniqueById(ROWS.filter(r =>
      passFilters(r, { ignoreType: true }) &&
      r.ft === '代管轉包租' &&
      isPerf(r)
    )));
    return sliceByRange(pool, start, end, null);
  }
  function rateGrowCfg(kind) {
    kind = dashKind(kind);
    if (kind === 'weak') {
      return {
        kind, pfx: 'wkGrow', ds: 'wkgrow',
        title: '政策戶比率達成與成長分析',
        rateName: '政策戶比率', piece: '政策戶', pieceShort: '政策', pieceN: '政策戶件數',
        offN: '有業績營業處數', tgtName: '目標政策戶比率',
        formula: '政策戶比率＝（轉租＋代管中第一類＋第二類）／（轉租＋代管）',
        monthRows: (y, m) => leaseNewRows(new Date(y, m - 1, 1), monthEnd(new Date(y, m - 1, 1)), null, 'weak'),
        isHit: r => isWeak1(r) || isWeak2(r),
        officeSet: salesOfficeSet,
        card4: 'ytd', yMax: 70, staffKind: 'wkGrow',
        staffHead: '政策戶比率業務明細', staffCol: '政策戶件'
      };
    }
    if (kind === 'new') {
      return {
        kind, pfx: 'nwGrow', ds: 'nwgrow',
        title: '新件率達成與成長分析',
        rateName: '新件率', piece: '新件', pieceShort: '新件', pieceN: '新件件數',
        offN: '有業績營業處數', tgtName: '目標新件率',
        formula: '新件率＝轉租與代管中是否帶租約為新件／轉租與代管總簽約件；狀態剔除已停用、暫存',
        monthRows: (y, m) => leaseNewRows(new Date(y, m - 1, 1), monthEnd(new Date(y, m - 1, 1)), null, 'new'),
        isHit: isFreshNew,
        officeSet: salesOfficeSet,
        card4: 'ytd', yMax: 100, staffKind: 'nwGrow',
        staffHead: '新件率業務明細', staffCol: '新件'
      };
    }
    return {
      kind: 'lease', pfx: 'lzGrow', ds: 'lzgrow',
      title: '包租率達成與成長分析',
      rateName: '包租率', piece: '包租', pieceShort: '包租', pieceN: '包租件數',
      offN: '有業績營業處數', tgtName: '目標包租率',
      formula: null,
      monthRows: monthPerf,
      isHit: isLeaseCt,
      officeSet: salesOfficeSet,
      card4: 'yr3', yMax: 70, staffKind: 'lzGrow',
      staffHead: '包租率業務明細', staffCol: '包租件'
    };
  }
  function renderLzGrowAnalysis() { renderRateGrow('lease'); }
  function renderWkGrowAnalysis() { renderRateGrow('weak'); }
  function renderNwGrowAnalysis() { renderRateGrow('new'); }
  function renderRateGrow(kind) {
    const cfg = rateGrowCfg(kind);
    const el = $(cfg.pfx + 'Kpis');
    if (!el) return;
    const y = state.end.getFullYear();
    const filterM = state.end.getMonth() + 1;
    const grain = state[cfg.pfx + 'Grain'] || 'month';
    const isYear = grain === 'year';
    const pick = state[cfg.pfx + 'Pick'] || filterM;
    const viewM = Math.min(isYear ? filterM : pick, filterM);
    const prev = addMonths(new Date(y, viewM - 1, 1), -1);
    const py = prev.getFullYear(), pm = prev.getMonth() + 1;
    const typeLab = leaseTypeShort() || '新媒合';
    const officeLab = ddLabel('office');
    const rocY = y - 1911;
    const tgtRate = dashTarget(cfg.kind);
    const monthsAll = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      return { m, rows: cfg.monthRows(y, m), yoyRows: cfg.monthRows(y - 1, m) };
    });
    const lastYearLast = cfg.monthRows(py, pm);
    const toLeaseAll = cfg.kind === 'lease'
      ? Array.from({ length: 12 }, (_, i) => ({
          m: i + 1,
          rows: mgmtToLeaseRows(y, i + 1),
          yoyRows: mgmtToLeaseRows(y - 1, i + 1)
        }))
      : [];
    const lastToLeaseAll = cfg.kind === 'lease' ? mgmtToLeaseRows(py, pm) : [];
    const keepOf = set => r => !set || set.has(r.so);
    const pack = rows => {
      const n = (rows || []).length;
      const lease = (rows || []).filter(cfg.isHit).length;
      return { n, lease, rate: n ? lease / n : 0, offN: cfg.officeSet(rows).size, rows: rows || [] };
    };
    const decorate = (node) => {
      const kids = (node.kids || []).map(decorate);
      const set = unitOfficeSet(node.id);
      const keep = keepOf(set);
      const mm = monthsAll.map(x => {
        const rows = x.rows.filter(keep);
        const yoyRows = x.yoyRows.filter(keep);
        const a = pack(rows), b = pack(yoyRows);
        return { m: x.m, rows, yoyRows, n: a.n, lease: a.lease, rate: a.rate, yoyN: b.n, yoyLease: b.lease, yoyRate: b.rate };
      });
      const lastRows = lastYearLast.filter(keep);
      const lastP = pack(lastRows);
      const ytdRows = mm.filter(x => x.m <= viewM).flatMap(x => x.rows);
      const ytdYoyRows = mm.filter(x => x.m <= viewM).flatMap(x => x.yoyRows);
      const now = mm[viewM - 1];
      const ytd = pack(ytdRows);
      const ytdYoy = pack(ytdYoyRows);
      const nowP = pack(now.rows);
      const toLeaseN = src => (src || []).filter(keep).length;
      const toNow = cfg.kind === 'lease' ? toLeaseN((toLeaseAll[viewM - 1] || {}).rows) : 0;
      const toLast = cfg.kind === 'lease' ? toLeaseN(lastToLeaseAll) : 0;
      const toYoy = cfg.kind === 'lease' ? toLeaseN((toLeaseAll[viewM - 1] || {}).yoyRows) : 0;
      const toYtd = cfg.kind === 'lease' ? toLeaseAll.filter(x => x.m <= viewM).flatMap(x => x.rows).filter(keep).length : 0;
      const toYtdYoy = cfg.kind === 'lease' ? toLeaseAll.filter(x => x.m <= viewM).flatMap(x => x.yoyRows).filter(keep).length : 0;
      return {
        ...node, kids, months: mm, lastRows, ytdRows,
        c: {
          n: isYear ? ytd.n : nowP.n,
          lease: isYear ? ytd.lease : nowP.lease,
          rate: isYear ? ytd.rate : nowP.rate,
          last: isYear ? ytdYoy.n : lastP.n,
          lastLease: isYear ? ytdYoy.lease : lastP.lease,
          lastRate: isYear ? ytdYoy.rate : lastP.rate,
          yoy: isYear ? ytdYoy.n : now.yoyN,
          yoyLease: isYear ? ytdYoy.lease : now.yoyLease,
          yoyRate: isYear ? ytdYoy.rate : now.yoyRate,
          offN: isYear ? ytd.offN : nowP.offN,
          lastOff: isYear ? 0 : lastP.offN,
          yoyOff: isYear ? ytdYoy.offN : pack(now.yoyRows).offN,
          toLease: isYear ? toYtd : toNow,
          lastToLease: isYear ? toYtdYoy : toLast,
          yoyToLease: isYear ? toYtdYoy : toYoy,
          rows: isYear ? ytdRows : now.rows
        }
      };
    };
    const root = pruneIdleSalesOffices(decorate(scopedUnitTree()), n => n.c && n.c.n) || decorate(scopedUnitTree());
    const rgSort = state[cfg.pfx + 'TblSort'] || '';
    if (rgSort) {
      sortUnitTree(root, n => {
        if (rgSort === 'name') return n.name;
        if (rgSort === 'n' || rgSort === 'rate') return n.c.rate;
        if (rgSort === 'last') return n.c.lastRate;
        if (rgSort === 'd' || rgSort === 'lastP') return n.c.rate - n.c.lastRate;
        if (rgSort === 'yoy') return n.c.yoyRate;
        if (rgSort === 'yoyP') return n.c.rate - n.c.yoyRate;
        return n.c.rate;
      }, state[cfg.pfx + 'TblDir'] || 'desc');
    }
    const open = new Set(state[cfg.pfx + 'Open'] || []);
    const monthOpen = new Set(state[cfg.pfx + 'MonthOpen'] || []);
    if (!findUnitNode(root, state[cfg.pfx + 'Focus'] || '')) state[cfg.pfx + 'Focus'] = root.id;
    const focus = state[cfg.pfx + 'Focus'] || root.id;
    const focusNode = findUnitNode(root, focus) || root;
    const months = focusNode.months;
    const sumThru = (list, thru, key) => list.filter(x => x.m <= thru).reduce((s, x) => s + x[key], 0);
    const thruRate = (list, thru, leaseK, nK) => {
      const n = sumThru(list, thru, nK);
      return n ? sumThru(list, thru, leaseK) / n : 0;
    };
    const fc = focusNode.c;
    const rate = fc.rate, lastRate = fc.lastRate, yoyRate = fc.yoyRate;
    const hit = tgtRate ? rate / tgtRate : 0;
    const lastHit = tgtRate ? lastRate / tgtRate : 0;
    const ytdR = isYear ? rate : thruRate(months, viewM, 'lease', 'n');
    const ytdHit = tgtRate ? ytdR / tgtRate : 0;
    const ytdYoyR = isYear ? yoyRate : thruRate(months, viewM, 'yoyLease', 'yoyN');
    const momPp = (rate - lastRate) * 100;
    const yoyPp = (rate - yoyRate) * 100;
    const ytdPp = (ytdR - ytdYoyR) * 100;
    if ($(cfg.pfx + 'Seg')) $(cfg.pfx + 'Seg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === grain));
    if ($(cfg.pfx + 'StaffBtn')) $(cfg.pfx + 'StaffBtn').classList.toggle('on', !!state[cfg.pfx + 'StaffOpen']);
    $(cfg.pfx + 'Title').textContent = cfg.title;
    $(cfg.pfx + 'Meta').textContent = `${rocY}年${viewM}月 ｜ ${officeLab} ｜ ${typeLab} ｜ ${cfg.formula || (cfg.rateName + '＝' + cfg.piece + '件／' + typeLab)} ｜ 目標 ${ (tgtRate * 100).toFixed(0) }% ｜ 目前單位：${focusNode.name}｜點線切換月份`;
    const lab = isYear ? `1–${viewM}月` : `${viewM}月`;
    const lastLab = `${pm}月`;
    const pctHtml = p => {
      if (p == null || !isFinite(p)) return '—';
      const cls = crabCls(p);
      const t = crabPpTxt(p);
      return cls ? `<span class="${cls}">${t}</span>` : t;
    };
    const rateTxtN = v => `${((v || 0) * 100).toFixed(1)}%`;
    const lastPack = pack(focusNode.lastRows || []);
    const nowMonthPack = pack((months[viewM - 1] || {}).rows || []);
    const momPpCard = (nowMonthPack.rate - lastPack.rate) * 100;
    const yr3N = (fc.rows || []).filter(r => isMgmtCt(r) && isThreeYearTerm(r)).length;
    const ytdLeaseN = sumThru(months, viewM, 'lease');
    const ytdTotalN = sumThru(months, viewM, 'n');
    const kpi4 = cfg.card4 === 'ytd'
      ? `<div class="card kpi">
        <div class="k">1–${viewM}月累計${cfg.rateName}</div>
        <div class="v">${rateTxtN(ytdR)}</div>
        <div class="s">${cfg.pieceShort}${fmt(ytdLeaseN)}／${fmt(ytdTotalN)}件</div>
      </div>`
      : `<div class="card kpi">
        <div class="k">簽三年代管件數</div>
        <div class="v">${fmt(yr3N)}<span class="unit"> 件</span></div>
        <div class="s">占總數 ${rateTxt(yr3N, fc.n, 1)}</div>
      </div>`;
    $(cfg.pfx + 'Kpis').innerHTML = `
      <div class="card kpi">
        <div class="k">${lab}${cfg.rateName}</div>
        <div class="v">${rateTxtN(rate)}</div>
        <div class="s">目標${(tgtRate * 100).toFixed(0)}%（${pctHtml((rate - tgtRate) * 100)}）</div>
      </div>
      <div class="card kpi ${momPpCard < 0 ? 'down' : (momPpCard > 0 ? 'up' : '')}">
        <div class="k">上月成長</div>
        <div class="v">${pctHtml(momPpCard)}</div>
        <div class="s">${lastLab}${rateTxtN(lastPack.rate)}｜${cfg.pieceShort}${fmt(lastPack.lease)}／${fmt(lastPack.n)}件</div>
      </div>
      <div class="card kpi ${yoyPp < 0 ? 'down' : (yoyPp > 0 ? 'up' : '')}">
        <div class="k">同期成長</div>
        <div class="v">${pctHtml(yoyPp)}</div>
        <div class="s">同期${rateTxtN(yoyRate)}｜${cfg.pieceShort}${fmt(fc.yoyLease)}／${fmt(fc.yoy)}件</div>
      </div>
      ${kpi4}`;
    const dash = '—';
    const dOff = fc.offN - fc.lastOff;
    const dLease = fc.lease - fc.lastLease;
    const yoyOffPct = fc.yoyOff ? (fc.offN - fc.yoyOff) / fc.yoyOff * 100 : null;
    const yoyLeasePct = fc.yoyLease ? (fc.lease - fc.yoyLease) / fc.yoyLease * 100 : null;
    const cmpHead = isYear
      ? `<th>比較項目</th><th>1–${viewM}月</th><th>累計差異</th><th>同期1–${viewM}月</th><th>同期比</th>`
      : `<th>比較項目</th><th>${viewM}月</th><th>${pm}月</th><th>差異</th><th>上月比</th><th>同期</th><th>同期比</th>`;
    const yearRows = `
      <tr><td>${cfg.offN}</td><td>${fmt(fc.offN)}</td>${crabTd(crabSigned(fc.offN - fc.yoyOff) + '處', crabCls(fc.offN - fc.yoyOff))}<td>${fmt(fc.yoyOff)}</td>${crabTd(fc.yoyOff ? crabPpTxt(yoyOffPct) : dash, crabCls(yoyOffPct))}</tr>
      <tr class="mark"><td>${cfg.rateName}</td><td>${rateTxtN(rate)}</td>${crabTd(crabPpTxt(yoyPp), crabCls(yoyPp))}<td>${rateTxtN(yoyRate)}</td>${crabTd(crabPpTxt(yoyPp), crabCls(yoyPp))}</tr>
      <tr><td>${cfg.pieceN}</td><td>${fmt(fc.lease)}</td>${crabTd(crabSigned(fc.lease - fc.yoyLease), crabCls(fc.lease - fc.yoyLease))}<td>${fmt(fc.yoyLease)}</td>${crabTd(fc.yoyLease ? crabPpTxt(yoyLeasePct) : dash, crabCls(yoyLeasePct))}</tr>
      <tr><td>總件數</td><td>${fmt(fc.n)}</td>${crabTd(crabSigned(fc.n - fc.yoy), crabCls(fc.n - fc.yoy))}<td>${fmt(fc.yoy)}</td>${crabTd(fc.yoy ? crabPpTxt((fc.n - fc.yoy) / fc.yoy * 100) : dash, crabCls(fc.n - fc.yoy))}</tr>
      <tr><td>${cfg.tgtName}</td><td>${rateTxtN(tgtRate)}</td><td>${dash}</td><td>${rateTxtN(tgtRate)}</td><td>${dash}</td></tr>
      <tr><td>目標達成率</td><td>${rateTxtN(hit)}</td>${crabTd(crabPpTxt((hit - (tgtRate ? yoyRate / tgtRate : 0)) * 100), crabCls(hit - (tgtRate ? yoyRate / tgtRate : 0)))}<td>${rateTxtN(tgtRate ? yoyRate / tgtRate : 0)}</td><td>${dash}</td></tr>${cfg.kind === 'lease' ? `
      <tr><td>代管轉包租</td><td>${fmt(fc.toLease)}</td>${crabTd(crabSigned(fc.toLease - fc.yoyToLease), crabCls(fc.toLease - fc.yoyToLease))}<td>${fmt(fc.yoyToLease)}</td>${crabTd(fc.yoyToLease ? crabPpTxt((fc.toLease - fc.yoyToLease) / fc.yoyToLease * 100) : dash, crabCls(fc.toLease - fc.yoyToLease))}</tr>` : ''}`;
    const monthRowsHtml = `
      <tr><td>${cfg.offN}</td><td>${fmt(fc.offN)}</td><td>${fmt(fc.lastOff)}</td>
        ${crabTd(crabSigned(dOff) + '處', crabCls(dOff))}
        ${crabTd(crabMomTxt(fc.offN, fc.lastOff), crabCls(dOff))}
        <td>${fmt(fc.yoyOff)}</td>${crabTd(fc.yoyOff ? crabPpTxt(yoyOffPct) : dash, crabCls(yoyOffPct))}</tr>
      <tr class="mark"><td>${cfg.rateName}</td><td>${rateTxtN(rate)}</td><td>${rateTxtN(lastRate)}</td>
        ${crabTd(crabPpTxt(momPp), crabCls(momPp))}
        ${crabTd(crabPpTxt(momPp), crabCls(momPp))}
        <td>${rateTxtN(yoyRate)}</td>${crabTd(crabPpTxt(yoyPp), crabCls(yoyPp))}</tr>
      <tr><td>${cfg.pieceN}</td><td>${fmt(fc.lease)}</td><td>${fmt(fc.lastLease)}</td>
        ${crabTd(crabSigned(dLease), crabCls(dLease))}
        ${crabTd(crabMomTxt(fc.lease, fc.lastLease), crabCls(dLease))}
        <td>${fmt(fc.yoyLease)}</td>${crabTd(fc.yoyLease ? crabPpTxt(yoyLeasePct) : dash, crabCls(yoyLeasePct))}</tr>
      <tr><td>總件數</td><td>${fmt(fc.n)}</td><td>${fmt(fc.last)}</td>
        ${crabTd(crabSigned(fc.n - fc.last), crabCls(fc.n - fc.last))}
        ${crabTd(crabMomTxt(fc.n, fc.last), crabCls(fc.n - fc.last))}
        <td>${fmt(fc.yoy)}</td>${crabTd(fc.yoy ? crabPpTxt((fc.n - fc.yoy) / fc.yoy * 100) : dash, crabCls(fc.n - fc.yoy))}</tr>
      <tr><td>${cfg.tgtName}</td><td>${rateTxtN(tgtRate)}</td><td>${rateTxtN(tgtRate)}</td>
        ${crabTd('0.0%', '')}<td>${dash}</td><td>${rateTxtN(tgtRate)}</td><td>${dash}</td></tr>
      <tr><td>目標達成率</td><td>${rateTxtN(hit)}</td><td>${rateTxtN(lastHit)}</td>
        ${crabTd(crabPpTxt((hit - lastHit) * 100), crabCls(hit - lastHit))}
        ${crabTd(crabPpTxt((hit - lastHit) * 100), crabCls(hit - lastHit))}
        <td>${rateTxtN(tgtRate ? yoyRate / tgtRate : 0)}</td>
        ${crabTd(crabPpTxt((hit - (tgtRate ? yoyRate / tgtRate : 0)) * 100), crabCls(hit - (tgtRate ? yoyRate / tgtRate : 0)))}</tr>${cfg.kind === 'lease' ? `
      <tr><td>代管轉包租</td><td>${fmt(fc.toLease)}</td><td>${fmt(fc.lastToLease)}</td>
        ${crabTd(crabSigned(fc.toLease - fc.lastToLease), crabCls(fc.toLease - fc.lastToLease))}
        ${crabTd(crabMomTxt(fc.toLease, fc.lastToLease), crabCls(fc.toLease - fc.lastToLease))}
        <td>${fmt(fc.yoyToLease)}</td>
        ${crabTd(fc.yoyToLease ? crabPpTxt((fc.toLease - fc.yoyToLease) / fc.yoyToLease * 100) : dash, crabCls(fc.toLease - fc.yoyToLease))}</tr>` : ''}`;
    $(cfg.pfx + 'CmpTbl').innerHTML = `<table class="crab-tbl"><thead><tr>${cmpHead}</tr></thead><tbody>${isYear ? yearRows : monthRowsHtml}</tbody></table>`;
    const offNow = cfg.officeSet(fc.rows);
    const offPrev = cfg.officeSet(isYear
      ? (focusNode.months || []).filter(x => x.m <= viewM).flatMap(x => x.yoyRows || [])
      : (focusNode.lastRows || []));
    const offAdded = [...offNow].filter(o => !offPrev.has(o)).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    const offDropped = [...offPrev].filter(o => !offNow.has(o)).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    const offBaseLab = isYear ? '去年同期' : `${pm}月`;
    const offBits = [];
    if (offDropped.length) offBits.push(`減少${offDropped.join('、')}`);
    if (offAdded.length) offBits.push(`新增${offAdded.join('、')}`);
    const offLine = offBits.length
      ? `${cfg.offN}${fmt(fc.offN)}處，較${offBaseLab}${offBits.join('，')}。`
      : `${cfg.offN}${fmt(fc.offN)}處，與${offBaseLab}相同。`;
    const gapPp = (tgtRate - rate) * 100;
    const peakR = [...(focusNode.months || []).filter(x => x.m <= viewM)].sort((a, b) => b.rate - a.rate)[0];
    const momBody = Math.abs(momPp) < 0.05
      ? `${viewM}月${cfg.rateName}與${pm}月持平（${rateTxtN(rate)}）。`
      : `${viewM}月${cfg.rateName}較${pm}月${momPp < 0 ? '降' : '升'}${Math.abs(momPp).toFixed(1)}%（${rateTxtN(rate)}）。`;
    const yoyBody = isYear
      ? `1至${viewM}月${cfg.rateName}${rateTxtN(rate)}，較去年同期${rateTxtN(yoyRate)}${yoyPp >= 0 ? '升' : '降'}${Math.abs(yoyPp).toFixed(1)}%。`
      : `較去年同月${yoyPp >= 0 ? '升' : '降'}${Math.abs(yoyPp).toFixed(1)}%（同期${rateTxtN(yoyRate)}）。`;
    const tgtBody = `${lab}達成率${(hit * 100).toFixed(1)}%，${rate < tgtRate ? `低於目標 ${Math.abs(gapPp).toFixed(1)}%` : `已達或超過 ${(tgtRate * 100).toFixed(0)}% 目標`}。`;
    const ytdBody = `1–${viewM}月累計${cfg.rateName}${rateTxtN(ytdR)}，達成率${(ytdHit * 100).toFixed(1)}%${peakR ? `，單月最高${peakR.m}月${rateTxtN(peakR.rate)}` : ''}。`;
    const offBody = `${offLine}`;
    $(cfg.pfx + 'Judge').innerHTML = `<h4>管理結論（${esc(focusNode.name)}）</h4>
      ${isYear ? '' : judgeP('上月比', momBody)}
      ${judgeP('同期比', yoyBody)}
      ${judgeP('目標比', tgtBody)}
      ${judgeP('單位差異', offBody)}
      ${judgeP('累計', ytdBody)}`;
    const labels = months.map(x => `${x.m}月`);
    const actual = months.map(x => {
      if (x.m > filterM) return null;
      return (isYear ? thruRate(months, x.m, 'lease', 'n') : x.rate) * 100;
    });
    const yoyLine = months.map(x => (isYear ? thruRate(months, x.m, 'yoyLease', 'yoyN') : x.yoyRate) * 100);
    const tgtLine = months.map(() => tgtRate * 100);
    $(cfg.pfx + 'ChartTitle').textContent = isYear ? `1–${viewM}月累計${cfg.rateName}` : `1–12月${cfg.rateName}趨勢`;
    $(cfg.pfx + 'ChartNote').textContent = `藍線為${cfg.rateName}、綠線為去年同期、深藍線為目標 ${(tgtRate * 100).toFixed(0)}%；${filterM < 12 ? `${filterM + 1}–12月以近3月均值推估` : '全年已列入'}。點線切換月份。`;
    const last3Rates = months.filter(x => x.m < filterM && x.m >= filterM - 3).map(x =>
      (isYear ? thruRate(months, x.m, 'lease', 'n') : x.rate) * 100
    );
    const pred = last3Rates.length ? last3Rates.reduce((s, v) => s + v, 0) / last3Rates.length : null;
    const fData = months.map((_, i) => {
      if (i + 1 < filterM) return null;
      if (i + 1 === filterM) return actual[i];
      return pred;
    });
    const bandPlugin = {
      id: cfg.pfx + 'Band',
      beforeDraw(chart) {
        if (isYear) return;
        const meta = chart.getDatasetMeta(1);
        const pt = meta && meta.data[viewM - 1];
        if (!pt) return;
        const { ctx, chartArea } = chart;
        const w = 36;
        ctx.save();
        ctx.fillStyle = 'rgba(59,130,246,.07)';
        ctx.fillRect(pt.x - w / 2, chartArea.top, w, chartArea.bottom - chartArea.top);
        ctx.restore();
      }
    };
    const labelPlugin = {
      id: cfg.pfx + 'Labels',
      afterDatasetsDraw(chart) {
        const { ctx, chartArea } = chart;
        const em = 12;
        chart.data.datasets.forEach((ds, di) => {
          const meta = chart.getDatasetMeta(di);
          if (!meta.visible) return;
          const isPred = ds.label === '預測值';
          meta.data.forEach((pt, i) => {
            const v = ds.data[i];
            if (v == null || !pt) return;
            let below = isPred;
            let y = below ? pt.y + em : pt.y - em;
            if (!below && chartArea && y < chartArea.top + 2) {
              below = true;
              y = pt.y + em;
            }
            ctx.save();
            ctx.fillStyle = ds.borderColor || '#334155';
            ctx.font = '10px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = below ? 'top' : 'bottom';
            ctx.fillText(Number(v).toFixed(1), pt.x, y);
            ctx.restore();
          });
        });
      }
    };
    const tideFill = (ctx) => {
      const { chart } = ctx;
      const area = chart && chart.chartArea;
      if (!area) return 'rgba(59,130,246,0.18)';
      const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
      g.addColorStop(0, 'rgba(37,99,235,0.42)');
      g.addColorStop(0.45, 'rgba(96,165,250,0.22)');
      g.addColorStop(1, 'rgba(191,219,254,0.04)');
      return g;
    };
    const lineOpt = (label, data, color, dash, tide, hidden) => ({
      label, data, hidden: !!hidden,
      borderColor: color,
      backgroundColor: tide ? tideFill : '#fff',
      tension: .35, pointRadius: 4, pointHoverRadius: 5,
      fill: tide ? 'origin' : false, spanGaps: true,
      borderDash: dash && dash.length ? dash : [],
      borderWidth: 2.75,
      pointBackgroundColor: '#fff',
      pointBorderColor: color,
      pointBorderWidth: 2,
      ...(dash && dash.length ? { segment: { borderDash: () => dash } } : {})
    });
    const hide = state[cfg.pfx + 'Hide'] || {};
    upsert(cfg.pfx + 'Chart', 'line', labels, [
      lineOpt('目標', tgtLine, C_TARGET, null, false, hide['目標']),
      lineOpt('實績', actual, C_ACTUAL, null, true, hide['實績']),
      lineOpt('預測值', fData, C_ACTUAL, [8, 6], false, hide['實績']),
      lineOpt('同期', yoyLine, C_YOY, null, false, hide['同期'])
    ], {
      plugins: { legend: { display: false }, filler: { propagate: false } },
      clip: false,
      layout: { padding: { top: 8, right: 8, left: 4, bottom: 2 } },
      interaction: { mode: 'index', intersect: false },
      onClick: (evt, els) => {
        if (!els.length) return;
        const i = els[0].index + 1;
        if (i > filterM) return;
        state[cfg.pfx + 'Pick'] = i;
        state[cfg.pfx + 'Grain'] = 'month';
        renderRateGrow(cfg.kind);
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#94a3b8' }, border: { display: false } },
        y: {
          min: 0, max: cfg.yMax, grid: { color: '#f1f5f9' },
          ticks: { font: { size: 10 }, color: '#94a3b8', callback: v => v + '%' },
          border: { display: false }
        }
      }
    }, [bandPlugin, labelPlugin]);
    if ($(cfg.pfx + 'Legend')) {
      $(cfg.pfx + 'Legend').querySelectorAll(`[data-${cfg.ds}-ds]`).forEach(b => {
        b.classList.toggle('off', !!hide[b.dataset[cfg.ds + 'Ds']]);
      });
    }
    const unitHead = isYear
      ? `${tblTh(cfg.pfx, 'name', '單位／擔當者')}${tblTh(cfg.pfx, 'n', `1–${viewM}月`)}${tblTh(cfg.pfx, 'd', '累計差異')}${tblTh(cfg.pfx, 'yoy', `同期1–${viewM}月`)}${tblTh(cfg.pfx, 'yoyP', '同期比')}`
      : `${tblTh(cfg.pfx, 'name', '單位／擔當者')}${tblTh(cfg.pfx, 'n', `${viewM}月`)}${tblTh(cfg.pfx, 'last', `${pm}月`)}${tblTh(cfg.pfx, 'd', '差異')}${tblTh(cfg.pfx, 'lastP', '上月比')}${tblTh(cfg.pfx, 'yoy', '同期')}${tblTh(cfg.pfx, 'yoyP', '同期比')}`;
    const html = [];
    const walk = (node, depth) => {
      const hasKids = node.kids && node.kids.length;
      const isOpen = node.id === '__SEL__' || open.has(node.id);
      const tog = hasKids
        ? `<button type="button" class="unit-tog" data-${cfg.ds}-open="${node.id}">${isOpen ? '▾' : '▸'}</button>`
        : `<span class="unit-tog-sp"></span>`;
      const on = node.id === focus ? ' on' : '';
      const dPp = (node.c.rate - node.c.lastRate) * 100;
      const yoyP = (node.c.rate - node.c.yoyRate) * 100;
      if (isYear) {
        html.push(`<tr class="${on}" data-${cfg.ds}-focus="${node.id}">
          ${unitCellHtml(node, depth, tog)}
          <td class="v num-hit" data-${cfg.ds}-months="${node.id}">${rateTxtN(node.c.rate)}</td>
          ${crabTd(crabPpTxt(dPp), crabCls(dPp))}
          <td class="v num-hit" data-${cfg.ds}-months="${node.id}">${rateTxtN(node.c.yoyRate)}</td>
          ${crabTd(crabPpTxt(yoyP), crabCls(yoyP))}
        </tr>`);
      } else {
        html.push(`<tr class="${on}" data-${cfg.ds}-focus="${node.id}">
          ${unitCellHtml(node, depth, tog)}
          <td class="v num-hit" data-${cfg.ds}-months="${node.id}">${rateTxtN(node.c.rate)}</td>
          <td class="v num-hit" data-${cfg.ds}-months="${node.id}">${rateTxtN(node.c.lastRate)}</td>
          ${crabTd(crabPpTxt(dPp), crabCls(dPp))}
          ${crabTd(crabPpTxt(dPp), crabCls(dPp))}
          <td class="v num-hit" data-${cfg.ds}-months="${node.id}">${rateTxtN(node.c.yoyRate)}</td>
          ${crabTd(crabPpTxt(yoyP), crabCls(yoyP))}
        </tr>`);
      }
      if (monthOpen.has(node.id)) {
        html.push(`<tr class="crab-mdetail"><td colspan="${isYear ? 5 : 7}"><table class="crab-mini"><thead><tr>
          <th>月</th><th>${cfg.rateName}</th><th>去年同月</th><th>同期比</th>
        </tr></thead><tbody>${node.months.map(x => {
          const yp = (x.rate - x.yoyRate) * 100;
          return `<tr class="${x.m === viewM ? 'on' : ''}">
            <td>${x.m}月</td><td>${rateTxtN(x.rate)}</td><td>${rateTxtN(x.yoyRate)}</td>
            <td class="${crabCls(yp)}">${crabPpTxt(yp)}</td>
          </tr>`;
        }).join('')}</tbody></table></td></tr>`);
      }
      if (hasKids && isOpen) node.kids.forEach(k => walk(k, depth + 1));
    };
    walk(root, 0);
    $(cfg.pfx + 'UnitNote').textContent = isYear
      ? `點單位查閱｜點數字展開月細｜1–${viewM}月對去年1–${viewM}月｜數字為${cfg.rateName}`
      : `點單位查閱｜點數字展開月細｜上月為${pm}月｜數字為${cfg.rateName}`;
    $(cfg.pfx + 'UnitTbl').innerHTML = `<table class="type-tbl ana-tbl"><thead><tr>${unitHead}</tr></thead><tbody>${html.join('')}</tbody></table>`;
    renderOffRateRank3($(cfg.pfx + 'OffRank'), fc.rows || [], cfg.kind);
    renderRateGrowStaff(cfg, (fc.rows || []).filter(cfg.isHit), focusNode.name || officeLab);
  }
  function renderRateGrowStaff(cfg, rows, scopeName) {
    const box = $(cfg.pfx + 'StaffBox');
    if (!box) return;
    bindStaffBox(cfg.pfx + 'StaffBox', cfg.staffKind);
    box.classList.toggle('hidden', !state[cfg.pfx + 'StaffOpen']);
    if (!state[cfg.pfx + 'StaffOpen']) {
      if (state.staffCase && state.staffCase.kind === cfg.staffKind) state.staffCase = null;
      box.innerHTML = '';
      return;
    }
    const map = new Map();
    rows.forEach(r => {
      const name = r.sl || '—';
      const office = r.so || '—';
      const key = office + '\t' + name;
      if (!map.has(key)) map.set(key, { office, name, rows: [] });
      map.get(key).rows.push(r);
    });
    const people = sortStaffPeople([...map.values()].map(p => ({ ...p, total: p.rows.length })), state[cfg.pfx + 'StaffSort'] || 'total', state[cfg.pfx + 'StaffDir'] || 'desc');
    staffPeople[cfg.staffKind] = people;
    box.innerHTML = `
      ${staffHead(esc(scopeName) + ' ｜ ' + cfg.staffHead)}
      <p class="src-staff-k">${cfg.piece} ${fmt(people.reduce((s, p) => s + p.total, 0))} 件。點數字展開案件明細</p>
      <div class="src-staff-scroll"><table class="src-combo"><thead><tr>
        <th data-sort="office" class="${staffSortMark(cfg.staffKind, 'office')}">業務營業處</th>
        <th data-sort="name" class="${staffSortMark(cfg.staffKind, 'name')}">業務</th>
        <th data-sort="total" class="${staffSortMark(cfg.staffKind, 'total')}">${cfg.staffCol}</th>
      </tr></thead><tbody>
        ${people.map(p => `<tr>
          <td>${esc(p.office)}</td><td class="name-hit">${esc(p.name)}</td>
          ${numTd(p.total, 'total')}
        </tr>`).join('') || '<tr><td colspan="3">無資料</td></tr>'}
      </tbody></table></div>
      ${staffCasePanel(cfg.staffKind)}`;
  }

  function fcstScopeOffices() {
    const all = [...SALES_OFFICES];
    const sel = selectedOffices();
    if (!sel) return all;
    return all.filter(o => sel.has(o) || sel.has(crabNormSo(o)));
  }
  function fcstStaffPool(offices) {
    const set = offices instanceof Set ? offices : new Set(offices || []);
    const src = STAFF_HR.length ? STAFF_HR : STAFF;
    return src.filter(s => {
      if (String(s.status || 'NORMAL') !== 'NORMAL') return false;
      if (!['30', '40', '50', '60'].includes(String(s.title))) return false;
      const so = crabNormSo(s.officeName || s.office || '');
      return !set.size || set.has(so);
    });
  }
  function fcstIsPartTime(s) {
    return ['63', '99'].includes(String(s.title));
  }
  function fcstManpowerPool(offices) {
    const set = offices instanceof Set ? offices : new Set(offices || []);
    const src = STAFF_HR.length ? STAFF_HR : STAFF;
    return src.filter(s => {
      if (String(s.status || 'NORMAL') !== 'NORMAL') return false;
      if (!['30', '40', '50', '60', '63', '99'].includes(String(s.title))) return false;
      const so = crabNormSo(s.officeName || s.office || '');
      return !set.size || set.has(so);
    });
  }
  function fcstNameKey(n) {
    return String(n || '').replace(/\s+/g, '').replace(/[（(][^）)]*[）)]/g, '');
  }
  function fcstHireDate(s) {
    const raw = s && (s.reportDate || s.onboardDate || s.hireDate || s.joinDate);
    if (!raw) return null;
    const str = String(raw);
    if (/^\d{4}-/.test(str)) return parseIso(str.slice(0, 10));
    return rocToDate(str);
  }
  function fcstUnder3m(hire, asOf) {
    if (!hire || !asOf) return false;
    const lim = new Date(asOf.getFullYear(), asOf.getMonth() - 3, asOf.getDate());
    return hire > lim;
  }
  function fcstManpowerLines(offices, rows, asOfDate) {
    const staff = fcstManpowerPool(offices);
    const byOff = new Map();
    const byName = new Map();
    (rows || []).forEach(r => {
      const k = fcstNameKey(r.sl);
      if (!k || k === '公司') return;
      const ok = crabNormSo(r.so) + '\t' + k;
      byOff.set(ok, (byOff.get(ok) || 0) + 1);
      byName.set(k, (byName.get(k) || 0) + 1);
    });
    const used = new Set();
    const people = staff.map(s => {
      const k = fcstNameKey(s.name);
      const so = crabNormSo(s.officeName || s.office || '');
      const n = byOff.get(so + '\t' + k) || byName.get(k) || 0;
      used.add(k);
      return { name: s.name, n, pt: fcstIsPartTime(s), hire: fcstHireDate(s) };
    });
    byName.forEach((n, k) => {
      if (used.has(k) || n <= 0) return;
      people.push({ name: k, n, pt: false, hire: null });
    });
    people.sort((a, b) => (b.n - a.n) || a.name.localeCompare(b.name, 'zh-Hant'));
    const bandOf = min => min === 4
      ? people.filter(p => p.n >= 4)
      : people.filter(p => p.n === min);
    const zero = people.filter(p => p.n <= 0);
    const ft = staff.filter(s => !fcstIsPartTime(s)).length;
    const pt = staff.filter(s => fcstIsPartTime(s)).length;
    return [
      `組織人力業績貢獻：正職${fmt(ft)}人、兼職${fmt(pt)}人`,
      `產4件以上${fmt(bandOf(4).length)}位；產3件以上${fmt(bandOf(3).length)}位；產2件以上${fmt(bandOf(2).length)}位；產1件以上${fmt(bandOf(1).length)}位；尚未產件${fmt(zero.length)}位`
    ];
  }
  function fcstKeep(set, r) {
    return set.has(r.so) || set.has(crabNormSo(r.so));
  }
  function skyfunMonthPerf(year, month) {
    return monthLeaseRows(year, month);
  }
  function fcstPack(offices, year, month, isYear) {
    const set = new Set(offices);
    const fromM = isYear ? 1 : month;
    const rows = [];
    let fcst = 0;
    for (let mm = fromM; mm <= month; mm++) {
      skyfunMonthPerf(year, mm).forEach(r => { if (fcstKeep(set, r)) rows.push(r); });
      fcst += sumFcst(set, year, mm);
    }
    const lastRows = [];
    if (isYear) {
      for (let mm = fromM; mm <= month; mm++) {
        skyfunMonthPerf(year - 1, mm).forEach(r => { if (fcstKeep(set, r)) lastRows.push(r); });
      }
    } else {
      const prev = addMonths(new Date(year, month - 1, 1), -1);
      skyfunMonthPerf(prev.getFullYear(), prev.getMonth() + 1).forEach(r => { if (fcstKeep(set, r)) lastRows.push(r); });
    }
    const act = uniqueById(rows).length;
    const last = uniqueById(lastRows).length;
    const staff = fcstStaffPool(set);
    const movers = new Set(rows.map(r => r.sl).filter(s => s && s !== '公司'));
    const active = movers.size;
    const total = staff.length;
    return {
      fcst, act, last, gap: act - fcst, mom: act - last,
      pct: fcst ? act / fcst : null,
      active, total, rate: total ? active / total : 0,
      avg: active ? act / active : 0, rows: uniqueById(rows)
    };
  }
  function fcstOfficesOf(id) {
    const all = fcstScopeOffices();
    const set = unitOfficeSet(!id || id === '營業部' ? '營業部' : id);
    if (!set) return all;
    return all.filter(o => set.has(o));
  }
  function renderFcstAnalysis() {
    if (!$('fcstKpis')) return;
    const y = state.end.getFullYear();
    const m = state.end.getMonth() + 1;
    const grain = state.fcstGrain || 'week';
    const isYear = grain === 'year';
    const isWeek = grain === 'week';
    const typeLab = leaseTypeShort() || '新媒合';
    const offices = fcstScopeOffices();
    const decorate = node => {
      const kids = (node.kids || []).map(decorate);
      let offs;
      if (node.id === '__SEL__' || node.id === '營業部') offs = offices.slice();
      else if (REGIONS[node.id]) offs = offices.filter(o => (REGIONS[node.id] || []).includes(o));
      else offs = offices.filter(o => o === node.id);
      return { ...node, kids, offices: offs, c: fcstPack(offs, y, m, isYear) };
    };
    const leafIds = selectedSalesOfficeLeaves();
    const keepLeaves = new Set(officeFilterKind() === 'offices' ? leafIds : []);
    const rawRoot = officeFilterKind() === 'offices' && leafIds.length
      ? {
          id: '__SEL__', name: '管轄單位加總',
          kids: leafIds.filter(o => offices.includes(o)).map(o => ({ id: o, name: o, kids: [] }))
        }
      : {
          id: '營業部', name: '營業部',
          kids: Object.entries(REGIONS).map(([r, arr]) => ({
            id: r, name: r,
            kids: arr.filter(o => offices.includes(o)).map(o => ({ id: o, name: o, kids: [] }))
          })).filter(n => n.kids.length)
        };
    const prune = node => {
      const kids = (node.kids || []).map(prune).filter(Boolean);
      if (SALES_OFFICE_SET.has(node.id) && !keepLeaves.has(node.id) && !(node.c.fcst || node.c.act)) return null;
      if (REGIONS[node.id] && !kids.length) return null;
      return { ...node, kids };
    };
    const root = prune(decorate(rawRoot)) || decorate(rawRoot);
    const gSort = state.fcstTblSort || '';
    if (gSort) {
      sortUnitTree(root, n => {
        if (gSort === 'name') return n.name;
        if (gSort === 'owner') return displayOwner(n.id, n.name) || '';
        if (gSort === 'fcst') return n.c.fcst;
        if (gSort === 'act') return n.c.act;
        if (gSort === 'pct') return n.c.pct || 0;
        if (gSort === 'gap') return n.c.gap;
        if (gSort === 'last') return n.c.last;
        if (gSort === 'mom') return n.c.mom;
        if (gSort === 'active') return n.c.active;
        if (gSort === 'avg') return n.c.avg;
        return n.c.gap;
      }, state.fcstTblDir || 'desc');
    }
    const open = new Set(state.fcstOpen || ['營業部']);
    if (!findUnitNode(root, state.fcstFocus || '')) state.fcstFocus = root.id;
    const focus = state.fcstFocus || root.id;
    const focusNode = findUnitNode(root, focus) || root;
    const focusOffices = focusNode.offices || fcstOfficesOf(focus);
    const all = focusNode.c || fcstPack(focusOffices, y, m, isYear);
    const done = all.pct == null ? 0 : all.pct;
    const short = all.fcst - all.act;
    const signedHtml = (n, unit) => {
      const v = Math.round(Number(n) || 0);
      const cls = crabCls(v);
      const body = `${v > 0 ? '+' : ''}${fmt(v)}${unit || ''}`;
      return cls ? `<span class="${cls}">${body}</span>` : body;
    };
    const pctTxt = p => p == null || !isFinite(p) ? '—' : (p * 100).toFixed(1) + '%';
    const lastLab = isYear ? '同期' : '上月';
    const lastLabKpi = isYear ? '同期' : '上月';
    if ($('fcstSeg')) $('fcstSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === grain));
    if ($('fcstStaffBtn')) $('fcstStaffBtn').classList.toggle('on', !!state.fcstStaffOpen);
    const periodStart = isYear ? new Date(y, 0, 1) : monthStart(state.end);
    const periodEnd = monthEnd(state.end);
    const grainLab = isWeek ? '週別' : (isYear ? `年度累計1–${m}月` : '月別');
    $('fcstMeta').textContent = `統計期間：${slash(periodStart)}～${slash(periodEnd)}｜${ddLabel('office')}｜${focusNode.name}｜${typeLab}｜${grainLab}`;
    $('fcstKpis').innerHTML = `
      <div class="card kpi">
        <div class="k">${isYear ? '累計實績' : '當月實績'}</div>
        <div class="v">${fmt(all.act)}<span class="unit"> 件</span></div>
        <div class="s">${lastLabKpi}${fmt(all.last)}件｜差異${signedHtml(all.mom, '件')}</div>
      </div>
      <div class="card kpi">
        <div class="k">${isYear ? '累計目標' : '本月目標'}</div>
        <div class="v">${fmt(all.fcst)}<span class="unit"> 件</span></div>
        <div class="s">${short > 0 ? `距目標尚差${fmt(short)}件` : (short < 0 ? `超出目標${fmt(-short)}件` : '已達目標')}</div>
      </div>
      <div class="card kpi">
        <div class="k">目標完成率${all.fcst
          ? `<span class="fcst-hit ${all.act >= all.fcst ? 'ok' : 'no'}">${all.act >= all.fcst ? '已達標' : '未達標'}</span>`
          : ''}</div>
        <div class="v">${(done * 100).toFixed(1)}%</div>
        <div class="s">實績${fmt(all.act)}件 ÷ 目標${fmt(all.fcst)}件</div>
      </div>
      <div class="card kpi">
        <div class="k">實動人力</div>
        <div class="v">${fmt(all.active)}<span class="unit"> 人</span></div>
        <div class="s">總人數${fmt(all.total)}人｜實動率${(all.rate * 100).toFixed(1)}%</div>
      </div>`;
    const dcell = n => crabTd(crabSigned(n), crabCls(n));
    const unitHead = `${tblTh('fcst', 'name', '單位／擔當者')}${tblTh('fcst', 'fcst', '目標')}${tblTh('fcst', 'act', '實績')}${tblTh('fcst', 'gap', '差異')}${tblTh('fcst', 'pct', '達成率')}${tblTh('fcst', 'active', '實動')}${tblTh('fcst', 'avg', '均件')}${tblTh('fcst', 'last', lastLab)}${tblTh('fcst', 'mom', '差異')}`;
    const html = [];
    const walk = (node, depth) => {
      const hasKids = node.kids && node.kids.length;
      const isOpen = node.id === '__SEL__' || open.has(node.id);
      const tog = hasKids
        ? `<button type="button" class="unit-tog" data-fcst-open="${node.id}">${isOpen ? '▾' : '▸'}</button>`
        : `<span class="unit-tog-sp"></span>`;
      const on = node.id === focus ? ' on' : '';
      html.push(`<tr class="${on}" data-fcst-focus="${esc(node.id)}">
        ${unitCellHtml(node, depth, tog)}
        <td class="v">${fmt(node.c.fcst)}</td><td class="v">${fmt(node.c.act)}</td>
        ${dcell(node.c.gap)}<td class="v">${pctTxt(node.c.pct)}</td>
        <td class="v">${fmt(node.c.active)}</td><td class="v">${node.c.avg ? node.c.avg.toFixed(1) : '—'}</td>
        <td class="v">${fmt(node.c.last)}</td>${dcell(node.c.mom)}
      </tr>`);
      if (hasKids && isOpen) node.kids.forEach(k => walk(k, depth + 1));
    };
    walk(root, 0);
    if ($('fcstUnitNote')) $('fcstUnitNote').textContent = '點單位查閱｜目標：Dashboard_營業處預估（業務版）';
    if ($('fcstUnitTbl')) $('fcstUnitTbl').innerHTML = `<table class="type-tbl ana-tbl"><thead><tr>${unitHead}</tr></thead><tbody>${html.join('')}</tbody></table>`;
    const md = d => `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
    const weeks = settleWeeks(y, m);
    const weekDays = w => {
      const a = new Date(w.start.getFullYear(), w.start.getMonth(), w.start.getDate());
      const b = new Date(w.end.getFullYear(), w.end.getMonth(), w.end.getDate());
      return Math.max(1, Math.round((b - a) / 86400000) + 1);
    };
    const days = weeks.map(weekDays);
    const totalDays = days.reduce((s, d) => s + d, 0) || 1;
    const monthFcst = isYear ? all.fcst : sumFcst(new Set(focusOffices), y, m);
    const weekFcst = days.map((d, i) => i < days.length - 1 ? Math.round(monthFcst * d / totalDays) : 0);
    if (weekFcst.length) weekFcst[weekFcst.length - 1] = monthFcst - weekFcst.slice(0, -1).reduce((s, n) => s + n, 0);
    const weekRows = skyfunMonthPerf(y, m).filter(r => fcstKeep(new Set(focusOffices), r));
    const weekAct = bucketWeeks(weekRows, weeks);
    const yoyWeeks = settleWeeks(y - 1, m);
    const yoyRows = skyfunMonthPerf(y - 1, m).filter(r => fcstKeep(new Set(focusOffices), r));
    const weekYoy = weeks.map((_, i) => (bucketWeeks(yoyRows, yoyWeeks)[i] || 0));
    const weekBox = $('fcstWeekBox');
    if (weekBox) weekBox.classList.toggle('hidden', !isWeek);
    const day0 = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const today = day0(now);
    let curWi = weeks.findIndex(w => day0(w.start) <= today && today <= day0(w.end));
    const weekCums = [];
    let runT = 0, runA = 0;
    weeks.forEach((_, i) => {
      runT += weekFcst[i] || 0;
      runA += weekAct[i] || 0;
      weekCums.push({ t: weekFcst[i] || 0, a: weekAct[i] || 0, cumT: runT, cumA: runA });
    });
    if (isWeek && $('fcstWeekTbl')) {
      $('fcstWeekTbl').innerHTML = `<table class="crab-tbl"><thead><tr>
        <th>週別／日期</th><th>天數</th><th>目標</th><th>實績</th><th>差異</th>
        <th class="hi">目標累計</th><th>實績累計</th><th>差異</th><th class="hi">達成率</th>
      </tr></thead><tbody>${weeks.map((w, i) => {
        const c = weekCums[i];
        const gap = c.a - c.t, cgap = c.cumA - c.cumT;
        const rate = c.cumT ? c.cumA / c.cumT : null;
        return `<tr class="${i === curWi ? 'mark' : ''}">
          <td>W${i + 1}　${md(w.start)}–${md(w.end)}</td>
          <td>${fmt(days[i])}</td><td>${fmt(c.t)}</td><td>${fmt(c.a)}</td>${dcell(gap)}
          <td>${fmt(c.cumT)}</td><td>${fmt(c.cumA)}</td>${dcell(cgap)}
          <td>${pctTxt(rate)}</td>
        </tr>`;
      }).join('')}</tbody></table>`;
    }
    let asOf = curWi;
    if (asOf < 0) {
      for (let i = weeks.length - 1; i >= 0; i--) {
        if (day0(weeks[i].end) <= today) { asOf = i; break; }
      }
    }
    const as = asOf >= 0 && weekCums[asOf] ? weekCums[asOf] : { cumT: all.fcst, cumA: all.act };
    const cutoff = weeks.length ? day0(weeks[weeks.length - 1].end) : monthEnd(new Date(y, m - 1, 1));
    const cutoffDay = cutoff.getDate();
    const monthStartD = new Date(y, m - 1, 1);
    let leftDays = 0;
    if (today > cutoff) leftDays = 0;
    else if (today < monthStartD) leftDays = cutoffDay;
    else leftDays = Math.round((cutoff - today) / 86400000) + 1;
    const lag = as.cumT - as.cumA;
    const asRate = as.cumT ? as.cumA / as.cumT : null;
    const stillNeed = Math.max(0, monthFcst - as.cumA);
    const perWeek = leftDays > 0 && stillNeed > 0 ? Math.ceil(stillNeed * 7 / leftDays) : 0;
    const lagTxt = lag > 0 ? `較目標落差${fmt(lag)}件` : (lag < 0 ? `較目標超出${fmt(-lag)}件` : '已達當週累計目標');
    const asOfEnd = asOf >= 0 ? day0(weeks[asOf].end) : cutoff;
    const asOfDate = today < monthStartD ? monthStartD : (today > cutoff ? cutoff : today);
    const contribRows = [];
    const fromM = isYear ? 1 : m;
    for (let mm = fromM; mm <= m; mm++) {
      skyfunMonthPerf(y, mm).forEach(r => {
        if (!fcstKeep(new Set(focusOffices), r)) return;
        if (isWeek && mm === m) {
          const d = submitDateOf(r);
          if (d && d > asOfEnd) return;
        }
        contribRows.push(r);
      });
    }
    const manLines = fcstManpowerLines(focusOffices, uniqueById(contribRows), asOfDate);
    $('fcstJudge').innerHTML = `<h4>管理重點（${esc(focusNode.name)}）</h4>
      <p>${esc(`截至當週，實績累計${fmt(as.cumA)}件，${lagTxt}，達成率${pctTxt(asRate)}，本月結截日${fmt(cutoffDay)}號，剩餘${fmt(leftDays)}天，平均每週須達${fmt(perWeek)}件才可達標。`)}</p>
      ${manLines.map(line => `<p>${esc(line)}</p>`).join('')}`;
    const hide = state.fcstHide || {};
    let labels, actual, yoyLine, tgtLine, chartTitle, chartNote;
    if (isWeek) {
      labels = weeks.map((_, i) => 'W' + (i + 1));
      actual = weekAct;
      yoyLine = weekYoy;
      tgtLine = weekFcst;
      chartTitle = `${m}月週別業績趨勢`;
      chartNote = '深藍柱為實績（起租日歸月、送審日歸週；狀態含已生效／已到期／已解約／審／產編）、綠線為去年同期、灰線為目標（依當月目標按結績天數比例）。';
    } else {
      const months = Array.from({ length: 12 }, (_, i) => i + 1);
      const set = new Set(focusOffices);
      const packs = months.map(mm => ({
        act: mm > m ? null : uniqueById(skyfunMonthPerf(y, mm).filter(r => fcstKeep(set, r))).length,
        yoy: uniqueById(skyfunMonthPerf(y - 1, mm).filter(r => fcstKeep(set, r))).length,
        fcst: sumFcst(set, y, mm)
      }));
      labels = months.map(mm => mm + '月');
      if (isYear) {
        let ca = 0, cy = 0, ct = 0;
        actual = packs.map((p, i) => {
          if (i + 1 > m) return null;
          ca += p.act || 0; return ca;
        });
        yoyLine = packs.map((p, i) => { cy += p.yoy || 0; return i + 1 > m ? cy : cy; });
        tgtLine = packs.map((p, i) => { ct += p.fcst || 0; return ct; });
        chartTitle = `1–${m}月累計趨勢`;
        chartNote = '深藍柱為累計實績、綠線為去年同期累計、灰線為目標累計。';
      } else {
        actual = packs.map((p, i) => i + 1 > m ? null : p.act);
        yoyLine = packs.map(p => p.yoy);
        tgtLine = packs.map(p => p.fcst);
        chartTitle = '1–12月業績趨勢';
        chartNote = `深藍柱為實績、綠線為去年同期、灰線為目標；${m < 12 ? `${m + 1}–12月尚未結算` : '全年已列入'}。`;
      }
    }
    if ($('fcstChartTitle')) $('fcstChartTitle').textContent = chartTitle;
    if ($('fcstChartNote')) $('fcstChartNote').textContent = chartNote;
    const bandPlugin = {
      id: 'fcstBand',
      beforeDraw(chart) {
        if (isWeek || isYear) return;
        const meta = chart.getDatasetMeta(0);
        const pt = meta && meta.data[m - 1];
        if (!pt) return;
        const { ctx, chartArea } = chart;
        const bw = typeof pt.width === 'number' ? pt.width : 24;
        ctx.save();
        ctx.fillStyle = '#e8eef6';
        ctx.fillRect(pt.x - (bw + 10) / 2, chartArea.top, bw + 10, chartArea.bottom - chartArea.top);
        ctx.restore();
      }
    };
    const labelPlugin = {
      id: 'fcstLabels',
      afterDatasetsDraw(chart) {
        const { ctx, chartArea } = chart;
        chart.data.datasets.forEach((ds, di) => {
          const meta = chart.getDatasetMeta(di);
          if (!meta.visible) return;
          meta.data.forEach((pt, i) => {
            const v = ds.data[i];
            ctx.save();
            ctx.textAlign = 'center';
            ctx.font = '10px Arial, sans-serif';
            if (di === 0 && !isWeek && i + 1 > m) {
              ctx.fillStyle = '#94a3b8';
              ctx.fillText('未結算', pt.x, chartArea.bottom - 6);
              ctx.restore();
              return;
            }
            if (v == null || !pt) { ctx.restore(); return; }
            if (di === 0) {
              ctx.fillStyle = '#fff';
              const base = pt.base != null ? pt.base : chartArea.bottom;
              const h = Math.abs(base - pt.y);
              if (h > 16) {
                ctx.textBaseline = 'middle';
                ctx.fillText(fmt(Math.round(v)), pt.x, (pt.y + base) / 2);
              } else {
                ctx.fillStyle = '#1e4a7a';
                ctx.textBaseline = 'bottom';
                ctx.fillText(fmt(Math.round(v)), pt.x, pt.y - 4);
              }
            } else {
              ctx.fillStyle = ds.borderColor || '#64748b';
              ctx.fillText(fmt(Math.round(v)), pt.x, pt.y + (di === 2 ? -14 : -4));
            }
            ctx.restore();
          });
        });
      }
    };
    if ($('fcstChart')) {
      upsert('fcstChart', 'bar', labels, [
        {
          type: 'bar', label: '實績', data: actual, hidden: !!hide['實績'],
          backgroundColor: '#1e4a7a', borderRadius: 3, order: 3,
          barPercentage: isWeek ? 0.55 : 0.55, categoryPercentage: 0.72, maxBarThickness: 26
        },
        {
          type: 'line', label: '同期', data: yoyLine, hidden: !!hide['同期'],
          borderColor: '#22c55e', backgroundColor: '#fff', tension: 0.25, pointRadius: 3, pointHoverRadius: 4,
          fill: false, spanGaps: true, borderWidth: 2, order: 1,
          pointBackgroundColor: '#86efac', pointBorderColor: '#22c55e', pointBorderWidth: 2
        },
        {
          type: 'line', label: '目標', data: tgtLine, hidden: !!hide['目標'],
          borderColor: '#94a3b8', backgroundColor: '#fff', tension: 0.25, pointRadius: 3, pointHoverRadius: 4,
          fill: false, spanGaps: true, borderWidth: 2, order: 0,
          pointBackgroundColor: '#cbd5e1', pointBorderColor: '#94a3b8', pointBorderWidth: 2
        }
      ], {
        plugins: { legend: { display: false } },
        layout: { padding: { top: 2, right: 4 } },
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#64748b' } },
          y: { beginAtZero: true, grid: { color: '#eef2f7' }, ticks: { font: { size: 10 }, color: '#94a3b8' } }
        }
      }, [bandPlugin, labelPlugin]);
    }
    if ($('fcstLegend')) {
      $('fcstLegend').querySelectorAll('[data-fcst-ds]').forEach(b => {
        b.classList.toggle('off', !!hide[b.dataset.fcstDs]);
      });
    }
    renderFcstStaff(focusNode.name, focusOffices);
  }
  function renderFcstStaff(scopeName, offices) {
    const box = $('fcstStaffBox');
    if (!box) return;
    bindStaffBox('fcstStaffBox', 'fcst');
    box.classList.toggle('hidden', !state.fcstStaffOpen);
    if (!state.fcstStaffOpen) {
      if (state.staffCase && state.staffCase.kind === 'fcst') state.staffCase = null;
      box.innerHTML = '';
      return;
    }
    const y = state.end.getFullYear();
    const viewM = state.end.getMonth() + 1;
    const set = new Set(offices || []);
    const map = new Map();
    for (let mm = 1; mm <= 12; mm++) {
      skyfunMonthPerf(y, mm).forEach(r => {
        if (!fcstKeep(set, r)) return;
        const name = r.sl || '—';
        const office = r.so || '—';
        const key = office + '\t' + name;
        if (!map.has(key)) {
          const months = Array(12).fill(0);
          map.set(key, { office, name, rows: [], months });
        }
        const p = map.get(key);
        p.rows.push({ ...r, m: mm });
        p.months[mm - 1] += 1;
      });
    }
    const people = sortStaffPeople([...map.values()].map(p => {
      const row = { office: p.office, name: p.name, rows: p.rows, total: p.rows.length };
      p.months.forEach((n, i) => { row['m' + (i + 1)] = n; });
      return row;
    }), state.fcstStaffSort || 'total', state.fcstStaffDir || 'desc');
    staffPeople.fcst = people;
    const mTh = Array.from({ length: 12 }, (_, i) => {
      const mm = i + 1;
      const cur = mm === viewM ? ' cur' : '';
      return `<th data-sort="m${mm}" class="${staffSortMark('fcst', 'm' + mm)}${cur}">${mm}月</th>`;
    }).join('');
    box.innerHTML = `
      ${staffHead(esc(scopeName) + ' ｜ 營業預估差異業務明細')}
      <p class="src-staff-k">共 ${fmt(people.reduce((s, p) => s + p.total, 0))} 件。點數字展開案件明細，當月以粗體呈現</p>
      <div class="src-staff-scroll"><table class="src-combo fcst-mth"><thead><tr>
        <th data-sort="office" class="${staffSortMark('fcst', 'office')}">業務營業處</th>
        <th data-sort="name" class="${staffSortMark('fcst', 'name')}">業務</th>
        ${mTh}
        <th data-sort="total" class="${staffSortMark('fcst', 'total')}">年度件數</th>
      </tr></thead><tbody>
        ${people.map(p => `<tr>
          <td>${esc(p.office)}</td><td class="name-hit">${esc(p.name)}</td>
          ${Array.from({ length: 12 }, (_, i) => numTd(p['m' + (i + 1)], 'm' + (i + 1), i + 1 === viewM ? 'cur' : '')).join('')}
          ${numTd(p.total, 'total')}
        </tr>`).join('') || '<tr><td colspan="15">無資料</td></tr>'}
      </tbody></table></div>
      ${staffCasePanel('fcst')}`;
  }

  const TYPE_COLS = [
    { id: '新媒合', label: '新媒合(全)', match: ft => isNewMatchFt(ft) },
    { id: '再媒合', label: '再媒合(全)', match: ft => ft === '到期再媒合' || ft === '解約再媒合' },
    { id: '續約', label: '續約', match: ft => ft === '續約' },
    { id: '代管轉包租', label: '代轉包', match: ft => ft === '代管轉包租' },
    { id: '包租轉代管', label: '包轉代', match: ft => ft === '包租轉代管' }
  ];
  const TYPE_PIE = [
    { id: '新媒合', inner: '#3d7a6a', outer: '#c5d9a8', match: ft => ft === '新媒合' },
    { id: '寄居', inner: '#5a9a8a', outer: '#d4e8c8', match: ft => ft.includes('寄居') },
    { id: '電銷', inner: '#7eb89a', outer: '#e0e8c0', match: ft => ft.includes('電銷') },
    { id: '客服', inner: '#a8c9a0', outer: '#eef4d8', match: ft => ft.includes('客服') },
    { id: '跨區', inner: '#c5d9a8', outer: '#f4f8e8', match: ft => ft.includes('跨區') },
    { id: '多元', inner: '#6aab90', outer: '#d8edcc', match: ft => ft.includes('多元') },
    { id: '爬蟲', inner: '#8fc4a8', outer: '#e8f2d8', match: ft => ft.includes('爬蟲') }
  ];
  const TYPE_HEAT = [
    {
      group: '新媒合(全)', cls: 'g-type-new', leafCls: 'leaf-type-new',
      leaves: [
        { id: '新媒合', short: '新媒合' },
        { id: '新媒合-電銷-直', short: '電銷-直' },
        { id: '新媒合-電銷-間', short: '電銷-間' },
        { id: '新媒合-爬蟲', short: '爬蟲' },
        { id: '新媒合-客服-直', short: '客服-直' },
        { id: '新媒合-客服-間', short: '客服-間' },
        { id: '新媒合-寄居蟹轉銜案', short: '寄居轉銜' },
        { id: '新媒合-跨區派案-直', short: '跨區-直' },
        { id: '新媒合-跨區派案-間', short: '跨區-間' },
        { id: '新媒合-多元-直', short: '多元-直' },
        { id: '新媒合-多元-間', short: '多元-間' }
      ]
    },
    {
      group: '再媒合(全)', cls: 'g-type-re', leafCls: 'leaf-type-re',
      leaves: [
        { id: '到期再媒合', short: '到期再媒' },
        { id: '解約再媒合', short: '解約再媒' }
      ]
    }
  ];
  const TYPE_HEAT_LEAVES = TYPE_HEAT.flatMap(g => g.leaves);
  const CASE_COLS = [
    { id: 'sl', label: '業務' },
    { id: 'so', label: '營業處' },
    { id: 'ft', label: '案件類型' },
    { id: 'ct', label: '契約型式' },
    { id: 'st', label: '狀態' },
    { id: 'n', label: '媒合編號' },
    { id: 'city', label: '縣市' },
    { id: 'addr', label: '租賃地址' },
    { id: 'ls', label: '租約起日' },
    { id: 'le', label: '租約迄日' },
    { id: 'i', label: '身分別' },
    { id: 'src', label: '媒合來源' },
    { id: 'house', label: '房屋類型' },
    { id: 'p', label: '期數' },
    { id: 'nl', label: '是否帶租約' }
  ];
  const TYPE_GROUP_COLOR = {
    新媒合: { inner: '#3d7a6a', outer: '#c5d9a8' },
    再媒合: { inner: '#5a9a8a', outer: '#d4e8c8' },
    續約: { inner: '#7eb89a', outer: '#e0e8c0' },
    代轉包: { inner: '#a8c9a0', outer: '#eef4d8' },
    包轉代: { inner: '#c5d9a8', outer: '#f4f8e8' }
  };
  const SRC_HEAT = ['591', '人脈', '通路', '仲介', '其他', '既有'];
  const SRC_GROUPS = [
    { id: '轉介紹', short: '轉介', inner: '#c4a035', outer: '#f3e4a8' },
    { id: '陌生開發', short: '陌生', inner: '#5a5a5a', outer: '#c8c8c8' }
  ];
  const SRC_LEAF_PAL = {
    轉介紹: [
      { inner: '#c4a035', outer: '#f3e4a8' },
      { inner: '#d4b84a', outer: '#f8efc8' },
      { inner: '#b89020', outer: '#ead98a' },
      { inner: '#e0c86a', outer: '#faf4dc' },
      { inner: '#a87c18', outer: '#f0d878' },
      { inner: '#c4a035', outer: '#fff6d8' }
    ],
    陌生開發: [
      { inner: '#3a3a3a', outer: '#d0d0d0' },
      { inner: '#5a5a5a', outer: '#c8c8c8' },
      { inner: '#7a7a7a', outer: '#e0e0e0' },
      { inner: '#4a4a4a', outer: '#b8b8b8' },
      { inner: '#8a8a8a', outer: '#ececec' },
      { inner: '#2e2e2e', outer: '#c0c0c0' }
    ]
  };
  const HOUSE_GROUPS = [
    { id: '獨套', short: '獨套', inner: '#3a3a3a', outer: '#c8c8c8', match: h => /獨立套房/.test(h) },
    { id: '整棟(戶)', short: '整棟(戶)', inner: '#2a5c32', outer: '#8fbf90', match: h => /整棟/.test(h) }
  ];
  const REV_GROUPS = [
    { id: '已生效', short: '已生效', inner: '#1e4a7a', outer: '#9bb8d4' },
    { id: '待產編', short: '待產編', inner: '#3d6a94', outer: '#c5d6e8' },
    { id: '複審', short: '複審', inner: '#5a8ab0', outer: '#d0e0ee' },
    { id: '預審', short: '預審', inner: '#7aa3c4', outer: '#e0ebf4' }
  ];
  const REV_LEAVES = REV_GROUPS.map(g => ({ id: g.id, group: g.id, leaf: g.id, inner: g.inner, outer: g.outer }));
  const HOUSE_BY_N = new Map();
  const HOUSE_BY_ADDR = new Map();
  const MATCH_BY_N = new Map();
  const MATCH_BY_ADDR = new Map();
  function matchIdRank(m) {
    const i = String((m && m.i) || '');
    if (/第一類|第二類|一般戶/.test(i)) return 2;
    if (i && i !== '未設定') return 1;
    return 0;
  }
  function betterMatchRow(a, b) {
    if (!a) return b;
    if (!b) return a;
    const ra = matchIdRank(a), rb = matchIdRank(b);
    if (rb !== ra) return rb > ra ? b : a;
    return String(b.n || '').length > String(a.n || '').length ? b : a;
  }
  (window.MATCH_ROWS || []).forEach(r => {
    const h = String(r.h || '');
    if (r.n) {
      HOUSE_BY_N.set(r.n, h);
      MATCH_BY_N.set(r.n, r);
    }
    if (r.a) {
      HOUSE_BY_ADDR.set(r.a, h);
      HOUSE_BY_ADDR.set(r.a + '|' + (r.ls || ''), h);
      const kAddr = r.a;
      const kLs = r.a + '|' + (r.ls || '');
      const kCt = r.a + '|' + (r.ls || '') + '|' + (r.c || '');
      MATCH_BY_ADDR.set(kAddr, betterMatchRow(MATCH_BY_ADDR.get(kAddr), r));
      MATCH_BY_ADDR.set(kLs, betterMatchRow(MATCH_BY_ADDR.get(kLs), r));
      MATCH_BY_ADDR.set(kCt, r);
    }
  });
  function houseOf(r) {
    return r.h
      || (MATCH_EXTRA_BY_ID.get(r.id) || {}).h
      || (r.n && (MATCH_EXTRA_BY_N.get(r.n) || {}).h)
      || HOUSE_BY_N.get(r.n)
      || HOUSE_BY_ADDR.get((r.addr || '') + '|' + (r.ls || ''))
      || HOUSE_BY_ADDR.get(r.addr)
      || '';
  }
  function houseGroupOf(r) {
    const h = String(houseOf(r)).replace(/（/g, '(').replace(/）/g, ')');
    return HOUSE_GROUPS.find(g => g.match(h)) || null;
  }
  function matchNoIsFull(n) {
    return /[A-Za-z]\dM\d{3}\d{4,}/.test(String(n || ''));
  }
  function matchExtraOf(r) {
    if (r && r.id != null) {
      const byId = MATCH_EXTRA_BY_ID.get(r.id);
      if (byId) return byId;
    }
    const addr = r.addr || '';
    const ls = r.ls || '';
    const ct = r.ct || '';
    const n = r.n || '';
    const byCt = MATCH_BY_ADDR.get(addr + '|' + ls + '|' + ct);
    if (byCt) return byCt;
    const byLs = MATCH_BY_ADDR.get(addr + '|' + ls);
    if (byLs) return byLs;
    if (matchNoIsFull(n)) {
      const extraN = MATCH_EXTRA_BY_N.get(n);
      if (extraN) return extraN;
      const byN = MATCH_BY_N.get(n);
      if (byN && (!byN.a || byN.a === addr)) return byN;
    }
    return null;
  }
  function identityOf(r) {
    const live = r && r.id != null ? (ID_CLASS[r.id] || ID_CLASS[String(r.id)] || '') : '';
    const raw = String((r && r.i) || live || (matchExtraOf(r) || {}).i || '');
    return raw === '未設定' ? '' : raw;
  }
  function isSuiteHouse(r) {
    return /套房/.test(String(houseOf(r)));
  }
  function isWeakId(r) {
    return /第一類|第二類/.test(identityOf(r));
  }
  function leaseCarryOf(r) {
    const m = matchExtraOf(r) || {};
    const live = r && r.id != null ? (NL_CLASS[r.id] || NL_CLASS[String(r.id)] || '') : '';
    const v = r.nl != null && r.nl !== ''
      ? r.nl
      : (r.newLease != null && r.newLease !== ''
        ? r.newLease
        : (r.hasExistingLease != null && r.hasExistingLease !== ''
          ? r.hasExistingLease
          : (live || m.nl)));
    return v == null ? '' : String(v);
  }
  function newLeaseFlag(r) {
    const v = leaseCarryOf(r);
    if (!v) return null;
    return /新件/.test(v);
  }
  function familyFlag(r) {
    const m = matchExtraOf(r) || {};
    const v = r.fam || r.family || m.fam || m.family || '';
    if (v == null || v === '') return null;
    const s = String(v);
    if (/^[123]$/.test(s)) return true;
    if (s === '4' || s === '0' || s === 'null') return false;
    return /新婚|育兒/.test(s);
  }
  function isLeaseMgmt(r) {
    const ct = String(r.ct || '');
    if (ct.includes('轉租')) return false;
    return ct.includes('包租') || ct.includes('代管');
  }
  function reviewOf(r) {
    const st = String(r.st || '');
    let id = null;
    if (st.includes('已生效')) id = '已生效';
    else if (st.includes('產編')) id = '待產編';
    else if (st.includes('複審')) id = '複審';
    else if (st.includes('預審')) id = '預審';
    if (!id) return null;
    const g = REV_GROUPS.find(x => x.id === id);
    return { id, group: id, leaf: id, inner: g.inner, outer: g.outer };
  }
  function revRows(offices, start, end, opts = {}) {
    const key = 'rev:' + (opts.ignoreType ? 'i' : '') + (opts.onlyNew ? 'N' : '') + (opts.onlyWeak ? 'W' : '') + (opts.onlyFresh ? 'F' : '') + (opts.onlyLease ? 'L' : '');
    const pool = cachedPool(key, () => uniqueById(ROWS.filter(r => {
      if (!passFilters(r, { ignoreType: !!opts.ignoreType || !!opts.onlyNew })) return false;
      if (opts.onlyWeak) {
        if (!isPolicyCt(r) || !isWeakId(r)) return false;
      } else if (opts.onlyFresh) {
        if (!isNewCasePerf(r) || !isFreshNew(r)) return false;
      } else {
        if (!isLeaseMgmt(r)) return false;
        if (opts.onlyLease && !isLeaseCt(r)) return false;
      }
      if (opts.onlyNew && !isNewMatchFt(r.ft)) return false;
      return !!reviewOf(r);
    })));
    return sliceByRange(pool, start, end, offices);
  }
  const SRC_LEAVES = SRC_GROUPS.flatMap(g => SRC_HEAT.map((leaf, i) => ({
    id: `${g.id}-${leaf}`, group: g.id, leaf, ...(SRC_LEAF_PAL[g.id][i])
  })));
  function typeRange() {
    if (state.typeGrain === 'year') {
      const y = state.end.getFullYear();
      return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
    }
    return { start: state.start, end: state.end };
  }
  function typeRows(offices, start, end, opts = {}) {
    const key = 'type:' + (opts.ignoreType ? 'i' : '') + (opts.onlyLease ? 'L' : '') + (opts.onlyWeak ? 'W' : '') + (opts.onlyFresh ? 'F' : '');
    const pool = cachedPool(key, () => uniqueById(ROWS.filter(r => {
      if (!passFilters(r, opts)) return false;
      if (opts.onlyLease && !isLeaseCt(r)) return false;
      if (opts.onlyWeak) return isWeakId(r) && isPolicyPerf(r);
      if (opts.onlyFresh) return isFreshNew(r) && isNewCasePerf(r);
      return isPerf(r);
    })));
    return sliceByRange(pool, start, end, offices);
  }
  function typeBarLeaves(filter) {
    if (filter === '總件數') return CASE_LEAVES;
    if (filter === '新媒合') return NEW_CHILDREN;
    if (filter === '再媒合') return ['到期再媒合', '解約再媒合'];
    return [filter];
  }
  function typePal(id) {
    if (id === '新媒合' || id === '新媒合(全)') return TYPE_GROUP_COLOR.新媒合;
    if (id === '再媒合' || id === '再媒合(全)') return TYPE_GROUP_COLOR.再媒合;
    return TYPE_GROUP_COLOR[id] || TYPE_GROUP_COLOR.新媒合;
  }
  function typePieLayers(focusRows, filter) {
    if (filter === '新媒合') {
      const rows = focusRows.filter(r => NEW_CHILDREN.includes(r.ft));
      const inner = TYPE_PIE.map(g => ({
        id: g.id, n: rows.filter(r => g.match(r.ft)).length, inner: g.inner, outer: g.outer
      })).filter(x => x.n);
      const outer = inner.flatMap(g => {
        const pie = TYPE_PIE.find(p => p.id === g.id);
        return TYPE_HEAT[0].leaves.filter(l => pie && pie.match(l.id)).map(l => ({
          id: l.short, n: rows.filter(r => r.ft === l.id).length, inner: g.inner, outer: g.outer
        }));
      }).filter(x => x.n);
      return { inner, outer, total: rows.length };
    }
    if (filter === '再媒合') {
      const rows = focusRows.filter(r => r.ft === '到期再媒合' || r.ft === '解約再媒合');
      const c = typePal('再媒合');
      const outer = TYPE_HEAT[1].leaves.map(l => ({
        id: l.short, n: rows.filter(r => r.ft === l.id).length, inner: c.inner, outer: c.outer
      })).filter(x => x.n);
      const inner = [{ id: '再媒合', n: rows.length, inner: c.inner, outer: c.outer }].filter(x => x.n);
      return { inner, outer, total: rows.length };
    }
    if (filter === '總件數') {
      const inner = TYPE_COLS.map(g => {
        const c = typePal(g.id);
        return { id: g.label, n: focusRows.filter(r => g.match(r.ft)).length, inner: c.inner, outer: c.outer };
      }).filter(x => x.n);
      const extras = [
        { short: '續約', ft: '續約', pal: '續約' },
        { short: '代轉包', ft: '代管轉包租', pal: '代轉包' },
        { short: '包轉代', ft: '包租轉代管', pal: '包轉代' }
      ];
      const outer = [
        ...TYPE_HEAT.flatMap(g => g.leaves.map(l => {
          const pie = TYPE_PIE.find(p => p.match(l.id));
          const c = pie || typePal(g.group.includes('再') ? '再媒合' : '新媒合');
          return { id: l.short, n: focusRows.filter(r => r.ft === l.id).length, inner: c.inner, outer: c.outer };
        })),
        ...extras.map(x => {
          const c = typePal(x.pal);
          return { id: x.short, n: focusRows.filter(r => r.ft === x.ft).length, inner: c.inner, outer: c.outer };
        })
      ].filter(x => x.n);
      return { inner, outer, total: focusRows.length };
    }
    const col = TYPE_COLS.find(c => c.id === filter);
    const c = typePal(col ? col.id : '新媒合');
    const n = focusRows.filter(r => (col || { match: ft => ft === filter }).match(r.ft)).length;
    const slice = { id: col ? col.label : filter, n, inner: c.inner, outer: c.outer };
    return { inner: n ? [slice] : [], outer: n ? [slice] : [], total: n };
  }

  function typeJudgeLines(node, scopeLabel) {
    const c = node.c || {};
    const total = c.total || 0;
    const newN = c['新媒合'] || 0;
    const reN = c['再媒合'] || 0;
    const renew = c['續約'] || 0;
    const toLease = c['代管轉包租'] || 0;
    const toMgmt = c['包租轉代管'] || 0;
    const lines = [];
    if (!total) return [`${scopeLabel}在此期間無符合件數。`];
    const main = newN + renew;
    lines.push(`新媒合與續約合計 ${fmt(main)} 件，占全部 ${revPct(main, total)}%，是主要案件來源。`);
    const again = reN + renew;
    lines.push(`再媒合及續約合計 ${fmt(again)} 件（${revPct(again, total)}%）；建議分列追蹤原有案件的再次媒合與續約作業。`);
    const gap = Math.abs(toLease - toMgmt);
    lines.push(`代管轉包租 ${fmt(toLease)} 件、包租轉代管 ${fmt(toMgmt)} 件，兩類案件量相差 ${fmt(gap)} 件；不直接視為有效戶數淨增加。`);
    return lines;
  }
  function typeClusterLines(node, scopeLabel) {
    const c = node.c || {};
    const peers = revPeers(node);
    const kids = (node.kids || []).filter(k => k.c && k.c.total);
    const pool = peers.length ? peers : kids;
    const lines = [];
    const pick = (key) => [...pool].sort((a, b) => (b.c[key] || 0) - (a.c[key] || 0) || a.name.localeCompare(b.name, 'zh-Hant'))[0];
    const maxNew = pick('新媒合');
    if (maxNew && maxNew.c['新媒合'] && c['新媒合']) {
      lines.push(`${maxNew.name}新媒合 ${fmt(maxNew.c['新媒合'])}件，占${scopeLabel}新媒合 ${revPct(maxNew.c['新媒合'], c['新媒合'])}%。`);
    }
    const topKid = [...kids].sort((a, b) => (b.c.total || 0) - (a.c.total || 0))[0];
    if (topKid && c.total) {
      lines.push(`${topKid.name} ${fmt(topKid.c.total)}件，占${scopeLabel} ${revPct(topKid.c.total, c.total)}%；續約 ${fmt(topKid.c['續約'] || 0)}件。`);
    }
    const maxRe = pick('再媒合');
    if (maxRe && maxRe.c['再媒合'] && c['再媒合']) {
      lines.push(`${maxRe.name}再媒合 ${fmt(maxRe.c['再媒合'])}件，占${scopeLabel}再媒合 ${revPct(maxRe.c['再媒合'], c['再媒合'])}%，宜與續約分列追蹤。`);
    }
    if (!lines.length) lines.push('案件類型分散，依各單位表列逐筆檢視即可。');
    return lines;
  }
  function typeShareBars(items, den, colors, opts = {}) {
    const maxBar = Math.max(...items.map(x => x.n), 1);
    const row = (x, i) => x
      ? `<span class="lab">${esc(x.lab)}</span>
      <span class="track"><i style="width:${(x.n / maxBar) * 100}%;background:${x.color || colors[Math.min(i, colors.length - 1)]}"></i></span>
      <span class="n">${fmt(x.n)}件 / ${revPct(x.n, den)}%</span>`
      : '<span></span><span></span><span></span>';
    let body;
    if (opts.twoCol && items.length > 6) {
      const mid = Math.ceil(items.length / 2);
      const left = items.slice(0, mid);
      const right = items.slice(mid);
      body = `<div class="rev-dist type-new-dist">${left.map((x, i) => row(x, i) + row(right[i], i + mid)).join('')}</div>`;
    } else {
      body = `<div class="rev-dist">${items.map((x, i) => row(x, i)).join('')}</div>`;
    }
    const note = opts.note ? `<p class="note">${esc(opts.note)}</p>` : '';
    return body + note;
  }
  function renderTypeAnalysis() {
    const { start, end } = typeRange();
    const open = new Set(state.typeOpen || []);
    if (charts.chartTypePie) {
      charts.chartTypePie.destroy();
      delete charts.chartTypePie;
    }
    $('typePeriod').textContent = `統計期間：${slash(start)}～${slash(end)}　案件類型：全部案件類型`;
    const countsOf = (rows) => {
      const out = {};
      TYPE_COLS.forEach(c => { out[c.id] = rows.filter(r => c.match(r.ft)).length; });
      out.total = rows.length;
      return out;
    };
    const ownerOf = (id, name) => {
      if (id === '__SEL__') return '—';
      return LOOKUP.owners[id] || LOOKUP.owners[name] || ownerName(unitOfficeSet(id), name) || '—';
    };
    const decorate = (node) => {
      const kids = (node.kids || []).map(decorate);
      const rows = typeRows(unitOfficeSet(node.id), start, end, { ignoreType: true });
      return { ...node, kids, rows, c: countsOf(rows) };
    };
    const root = pruneIdleSalesOffices(decorate(scopedUnitTree()), n => n.c && n.c.total) || decorate(scopedUnitTree());
    const typeKey = state.typeTblSort || '';
    if (typeKey) {
      sortUnitTree(root, n => {
        if (typeKey === 'name') return n.name;
        if (typeKey === 'owner') return ownerOf(n.id, n.name);
        if (typeKey === 'total') return n.c.total;
        return n.c[typeKey];
      }, state.typeTblDir || 'desc');
    }
    if (!findUnitNode(root, state.typeFocus || '')) state.typeFocus = root.id;
    const focus = state.typeFocus || root.id;
    const html = [];
    const walk = (node, depth) => {
      const hasKids = node.kids && node.kids.length;
      const isOpen = node.id === '__SEL__' || open.has(node.id);
      const pad = 6 + depth * 14;
      const tog = hasKids
        ? `<button type="button" class="unit-tog" data-type-open="${node.id}">${isOpen ? '▾' : '▸'}</button>`
        : `<span class="unit-tog-sp"></span>`;
      const on = node.id === focus ? ' on' : '';
      html.push(`<tr class="${on}" data-type-focus="${node.id}">
        ${unitCellHtml(node, depth, tog)}
        <td>${fmt(node.c.total)}</td>
        ${TYPE_COLS.map(c => `<td>${fmt(node.c[c.id])}</td>`).join('')}
      </tr>`);
      if (hasKids && isOpen) node.kids.forEach(k => walk(k, depth + 1));
    };
    walk(root, 0);
    $('typeTable').innerHTML = `<table class="type-tbl ana-tbl"><thead><tr>
      ${tblTh('type', 'name', '單位／擔當者')}${tblTh('type', 'total', '總件數')}${TYPE_COLS.map(c => tblTh('type', c.id, c.label)).join('')}
    </tr></thead><tbody>${html.join('')}</tbody></table>`;

    const findNode = (node, id) => node.id === id ? node : (node.kids || []).reduce((hit, k) => hit || findNode(k, id), null);
    const focusNode = findNode(root, focus) || root;
    const focusRows = focusNode.rows || [];
    const c = focusNode.c;
    const scopeName = focusNode.name || ddLabel('office');
    const newN = c['新媒合'] || 0;
    const reN = c['再媒合'] || 0;
    const renew = c['續約'] || 0;
    $('typeKpis').innerHTML = `
      <div class="card kpi">
        <div class="k">總案件數</div>
        <div class="v">${fmt(c.total)}<span class="unit"> 件</span></div>
        <div class="s">畫面統計母體</div>
      </div>
      <div class="card kpi">
        <div class="k">新媒合</div>
        <div class="v">${fmt(newN)}<span class="unit"> 件</span></div>
        <div class="s">占全部 ${revPct(newN, c.total)}%</div>
      </div>
      <div class="card kpi">
        <div class="k">續約</div>
        <div class="v">${fmt(renew)}<span class="unit"> 件</span></div>
        <div class="s">占全部 ${revPct(renew, c.total)}%</div>
      </div>
      <div class="card kpi">
        <div class="k">再媒合</div>
        <div class="v">${fmt(reN)}<span class="unit"> 件</span></div>
        <div class="s">占全部 ${revPct(reN, c.total)}%</div>
      </div>`;
    const dist = [
      { id: '新媒合', n: newN, color: '#1e4a7a' },
      { id: '續約', n: renew, color: '#6d9fc8' },
      { id: '再媒合', n: reN, color: '#93c5fd' },
      { id: '代管轉包租', n: c['代管轉包租'] || 0, color: '#d97706' },
      { id: '包租轉代管', n: c['包租轉代管'] || 0, color: '#94a3b8' }
    ];
    $('typeDist').innerHTML = typeShareBars(dist.map(x => ({ lab: x.id, n: x.n, color: x.color })), c.total, ['#1e4a7a']);
    const newLeaves = TYPE_HEAT[0].leaves.map(l => ({
      lab: l.short,
      n: focusRows.filter(r => r.ft === l.id).length,
      color: /寄居/.test(l.id) ? '#9e1a32' : undefined
    }));
    const reLeaves = TYPE_HEAT[1].leaves.map(l => ({
      lab: l.short === '到期再媒' ? '到期再媒合' : (l.short === '解約再媒' ? '解約再媒合' : l.short),
      n: focusRows.filter(r => r.ft === l.id).length
    }));
    const newBlues = ['#1e4a7a', '#245c8c', '#2f6aa3', '#3d7a6a', '#4a86b8', '#5a9a8a', '#6d9fc8', '#7eb89a', '#93c5fd', '#a8c9a0', '#b6d4ee'];
    const reBlues = ['#1e4a7a', '#93c5fd'];
    $('typeNewDist').innerHTML = typeShareBars(newLeaves, newN, newBlues, {
      twoCol: true,
      note: `分母為新媒合(全) ${fmt(newN)} 件；占比相對新媒合(全)。`
    });
    $('typeReDist').innerHTML = typeShareBars(reLeaves, reN, reBlues, {
      note: `分母為再媒合(全) ${fmt(reN)} 件；占比相對再媒合(全)。`
    });
    const judge = typeJudgeLines(focusNode, scopeName);
    $('typeJudge').innerHTML = `<h4>管理判讀</h4>${judge.map(t => `<p>${esc(t)}</p>`).join('')}`;
    const cluster = typeClusterLines(focusNode, scopeName);
    $('typeFocusNote').innerHTML = `<h4>單位觀察：依篩選範圍看結構</h4>${cluster.map(t => `<p>${esc(t)}</p>`).join('')}`;
    const unitName = focusNode.name || '全公司';
    const tBtn = $('typeStaffBtn');
    if (tBtn) tBtn.classList.toggle('on', !!state.typeStaffOpen);
    renderTypeStaff(focusRows, unitName);
  }

  function caseSource(r) {
    const extra = matchExtraOf(r) || {};
    const raw = String(r.src || r.ms || r.source || extra.src || '').trim().replace('人脈推廣', '人脈').replace('既有房東客', '既有');
    if (!raw) return null;
    const hit = SRC_LEAVES.find(x => raw === x.id || raw === x.leaf || (raw.includes(x.leaf) && raw.includes(x.group.slice(0, 2))));
    if (hit) return hit;
    const group = raw.includes('陌生') ? '陌生開發' : (raw.includes('轉介') ? '轉介紹' : '');
    if (!group) return null;
    const leaf = SRC_LEAVES.find(x => x.group === group && raw.includes(x.leaf));
    return leaf || SRC_LEAVES.find(x => x.group === group && x.leaf === '其他') || null;
  }
  function srcRange() {
    if (state.srcGrain === 'year') {
      const y = state.end.getFullYear();
      return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
    }
    return { start: state.start, end: state.end };
  }
  function srcBarLeaves(filter) {
    if (filter === '全部' || filter === '轉介紹' || filter === '陌生開發') {
      return SRC_LEAVES.filter(x => filter === '全部' || x.group === filter);
    }
    return SRC_LEAVES.filter(x => x.id === filter);
  }

  function srcLeafN(rows, group, leaf) {
    return rows.filter(r => {
      const s = caseSource(r);
      return s && s.group === group && s.leaf === leaf;
    }).length;
  }
  function srcJudgeLines(node, rows) {
    const c = node.c;
    const lines = [];
    if (!c.total) return ['此範圍目前無來源件數。'];
    const gap = Math.abs(c.refRate - c.coldRate);
    if (gap < 0.08) lines.push('轉介紹與陌生開發比重接近。');
    else if (c.ref > c.cold) lines.push(`轉介紹比重較高，較陌生開發多 ${fmt(c.ref - c.cold)} 件。`);
    else lines.push(`陌生開發比重較高，較轉介紹多 ${fmt(c.cold - c.ref)} 件。`);
    SRC_HEAT.map(leaf => ({
      leaf, n: srcLeafN(rows, '轉介紹', leaf) + srcLeafN(rows, '陌生開發', leaf)
    })).filter(x => x.n).sort((a, b) => b.n - a.n).slice(0, 2).forEach(x => {
      lines.push(`${x.leaf}合計 ${fmt(x.n)} 件，占全部 ${revPct(x.n, c.total)}%。`);
    });
    const peers = revPeers(node).filter(p => p.c && p.c.total >= 8);
    if (peers.length >= 2) {
      const hi = [...peers].sort((a, b) => b.c.refRate - a.c.refRate)[0];
      const lo = [...peers].sort((a, b) => a.c.refRate - b.c.refRate)[0];
      if (hi) lines.push(`${hi.name}轉介紹占比 ${revPct(hi.c.ref, hi.c.total)}%，四區最高。`);
      if (lo && lo !== hi) lines.push(`${lo.name}轉介紹占比 ${revPct(lo.c.ref, lo.c.total)}%，四區最低。`);
    }
    return lines;
  }
  function srcComboLines(node, scopeLabel) {
    const c = node.c;
    const peers = revPeers(node).filter(p => p.c && p.c.total);
    const lines = [];
    const top = [...peers].sort((a, b) => b.c.total - a.c.total)[0];
    if (top) lines.push(`${top.name}：${fmt(top.c.total)} 件，為區域件數最多。`);
    if (top && c.ref) lines.push(`轉介紹 ${fmt(top.c.ref)} 件，占${scopeLabel}轉介紹 ${revPct(top.c.ref, c.ref)}%。`);
    if (top && c.cold) lines.push(`陌生開發 ${fmt(top.c.cold)} 件，占${scopeLabel}陌生開發 ${revPct(top.c.cold, c.cold)}%。`);
    if (!lines.length) lines.push('來源結構分散，依各單位表列檢視即可。');
    return lines;
  }
  function srcTrackLines(node) {
    const peers = revPeers(node).filter(p => p.c && p.c.total >= 8);
    if (peers.length < 2) return ['依各單位來源細項核對填報完整性即可。'];
    const hi = [...peers].sort((a, b) => b.c.refRate - a.c.refRate)[0];
    const lo = [...peers].sort((a, b) => a.c.refRate - b.c.refRate)[0];
    const lines = [];
    if (hi) lines.push(`${hi.name}：檢視可複製的房東客與人脈轉介做法。`);
    if (lo && lo !== hi) lines.push(`${lo.name}：核對來源填報，再檢視轉介案件拓展。`);
    return lines;
  }
  function renderSourceAnalysis() {
    const { start, end } = srcRange();
    const open = new Set(state.srcOpen || []);
    if (charts.chartSrcPie) {
      charts.chartSrcPie.destroy();
      delete charts.chartSrcPie;
    }
    $('srcPeriod').textContent = `統計期間：${slash(start)}～${slash(end)}　${typeFilterNote()}`;
    const ownerOf = (id, name) => displayOwner(id, name) || '—';
    const countsOf = (rows) => {
      const tagged = rows.map(r => caseSource(r));
      const ref = tagged.filter(s => s && s.group === '轉介紹').length;
      const cold = tagged.filter(s => s && s.group === '陌生開發').length;
      const total = rows.length;
      return { ref, cold, total, refRate: total ? ref / total : 0, coldRate: total ? cold / total : 0 };
    };
    const decorate = (node) => {
      const kids = (node.kids || []).map(decorate);
      const rows = typeRows(unitOfficeSet(node.id), start, end);
      return { ...node, kids, rows, c: countsOf(rows) };
    };
    const root = pruneIdleSalesOffices(decorate(scopedUnitTree()), n => n.c && n.c.total) || decorate(scopedUnitTree());
    const srcKey = state.srcTblSort || '';
    if (srcKey) sortUnitTree(root, n => {
      if (srcKey === 'name') return n.name;
      if (srcKey === 'owner') return ownerOf(n.id, n.name);
      if (srcKey === 'ref') return n.c.ref;
      if (srcKey === 'cold') return n.c.cold;
      if (srcKey === 'refRate') return n.c.refRate;
      if (srcKey === 'coldRate') return n.c.coldRate;
      return n.c.total;
    }, state.srcTblDir || 'desc');
    if (!findUnitNode(root, state.srcFocus || '')) state.srcFocus = root.id;
    const focus = state.srcFocus || root.id;
    const html = [];
    const walk = (node, depth) => {
      const hasKids = node.kids && node.kids.length;
      const isOpen = node.id === '__SEL__' || open.has(node.id);
      const tog = hasKids
        ? `<button type="button" class="unit-tog" data-src-open="${node.id}">${isOpen ? '▾' : '▸'}</button>`
        : `<span class="unit-tog-sp"></span>`;
      const on = node.id === focus ? ' on' : '';
      html.push(`<tr class="${on}" data-src-focus="${node.id}">
        ${unitCellHtml(node, depth, tog)}
        <td>${fmt(node.c.total)}</td>
        <td>${fmt(node.c.ref)}</td>
        <td>${fmt(node.c.cold)}</td>
        <td>${Math.round(node.c.refRate * 100)}%</td>
        <td>${Math.round(node.c.coldRate * 100)}%</td>
      </tr>`);
      if (hasKids && isOpen) node.kids.forEach(k => walk(k, depth + 1));
    };
    walk(root, 0);
    $('srcTable').innerHTML = `<table class="type-tbl ana-tbl"><thead><tr>
      ${tblTh('src', 'name', '單位／擔當者')}${tblTh('src', 'total', '總件數')}${tblTh('src', 'ref', '轉介紹')}${tblTh('src', 'cold', '陌生開發')}${tblTh('src', 'refRate', '轉介%')}${tblTh('src', 'coldRate', '陌開%')}
    </tr></thead><tbody>${html.join('')}</tbody></table>`;

    const findNode = (node, id) => node.id === id ? node : (node.kids || []).reduce((hit, k) => hit || findNode(k, id), null);
    const focusNode = findNode(root, focus) || root;
    const focusRows = focusNode.rows || [];
    const c = focusNode.c;
    const scopeName = focusNode.name || ddLabel('office');
    const onlyNew = (state.types || []).length === NEW_CHILDREN.length && NEW_CHILDREN.every(t => state.types.includes(t));
    const diff = Math.abs(c.ref - c.cold);
    const more = c.cold > c.ref ? '陌生開發較多' : (c.ref > c.cold ? '轉介紹較多' : '兩類件數相同');
    $('srcKpis').innerHTML = `
      <div class="card kpi">
        <div class="k">${onlyNew ? '新媒合總數' : '案件總數'}</div>
        <div class="v">${fmt(c.total)}<span class="unit"> 件</span></div>
        <div class="s">附件統計</div>
      </div>
      <div class="card kpi">
        <div class="k">轉介紹</div>
        <div class="v">${fmt(c.ref)}<span class="unit"> 件</span></div>
        <div class="s">占全部 ${revPct(c.ref, c.total)}%</div>
      </div>
      <div class="card kpi">
        <div class="k">陌生開發</div>
        <div class="v">${fmt(c.cold)}<span class="unit"> 件</span></div>
        <div class="s">占全部 ${revPct(c.cold, c.total)}%</div>
      </div>
      <div class="card kpi">
        <div class="k">兩類件數差</div>
        <div class="v">${fmt(diff)}<span class="unit"> 件</span></div>
        <div class="s">${more}</div>
      </div>`;
    const maxPair = Math.max(1, ...SRC_HEAT.map(l => Math.max(srcLeafN(focusRows, '轉介紹', l), srcLeafN(focusRows, '陌生開發', l))));
    $('srcPair').innerHTML = `<div class="src-pair">
      <span class="h">來源細項</span><span class="h">轉介紹</span><span class="h"></span><span class="h">陌生開發</span><span class="h"></span>
      ${SRC_HEAT.map(l => {
        const a = srcLeafN(focusRows, '轉介紹', l);
        const b = srcLeafN(focusRows, '陌生開發', l);
        return `<span class="lab">${esc(l)}</span>
          <span class="track"><i style="width:${(a / maxPair) * 100}%;background:#1e4a7a"></i></span>
          <span class="n">${fmt(a)}</span>
          <span class="track"><i style="width:${(b / maxPair) * 100}%;background:#93c5fd"></i></span>
          <span class="n">${fmt(b)}</span>`;
      }).join('')}
    </div>`;
    const judge = srcJudgeLines(focusNode, focusRows);
    $('srcJudge').innerHTML = `<h4>附件可觀察的來源結構</h4>${judge.map(t => `<p>${esc(t)}</p>`).join('')}`;
    const track = srcTrackLines(focusNode);
    $('srcTrack').innerHTML = `<h4>建議追蹤事項</h4>${track.map(t => `<p>${esc(t)}</p>`).join('')}`;
    const combo = srcComboLines(focusNode, scopeName);
    $('srcFocusNote').innerHTML = `<h4>案件量與來源組合</h4>${combo.map(t => `<p>${esc(t)}</p>`).join('')}`;
    const btn = $('srcStaffBtn');
    if (btn) btn.classList.toggle('on', !!state.srcStaffOpen);
    renderSrcStaff(focusRows, focusNode.name || '全公司');
  }

  function houseRange() {
    if (state.houseGrain === 'year') {
      const y = state.end.getFullYear();
      return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
    }
    return { start: state.start, end: state.end };
  }
  function houseJudgeLines(node) {
    const c = node.c;
    if (!c.total) return ['此範圍目前無案件。'];
    return [
      `先核對分類涵蓋範圍：${fmt(c.total)} 件中有 ${fmt(c.other)} 件未在「獨套、整棟（戶）」欄位呈現。`,
      `尚無法判斷這 ${fmt(c.other)} 件屬其他類型、欄位未填或統計對應問題，應保留差額供追查。`
    ];
  }
  function houseCheckLines(node) {
    const peers = revPeers(node).filter(p => p.c && p.c.total);
    if (!peers.length) return ['依各單位表列核對未分類件數即可。'];
    const mostOther = [...peers].sort((a, b) => b.c.other - a.c.other)[0];
    const lowCover = [...peers].filter(p => p.c.total >= 8).sort((a, b) => a.c.cover - b.c.cover)[0];
    const lines = [];
    if (mostOther) lines.push(`${mostOther.name}：差額 ${fmt(mostOther.c.other)} 件。`);
    if (lowCover) lines.push(`分類涵蓋率 ${revPct(lowCover.c.shown, lowCover.c.total)}%，四個區域中最低。`);
    const second = [...peers].sort((a, b) => b.c.other - a.c.other)[1];
    if (second && second.c.other) lines.push(`${second.name}：差額 ${fmt(second.c.other)} 件，涵蓋率 ${revPct(second.c.shown, second.c.total)}%。`);
    return lines;
  }
  function houseShownLines(node, scopeLabel) {
    const c = node.c;
    const peers = revPeers(node).filter(p => p.c && p.c.shown);
    const topWhole = [...peers].sort((a, b) => b.c.whole - a.c.whole)[0];
    const lines = [];
    if (topWhole) {
      lines.push(`${topWhole.name}整棟（戶）${fmt(topWhole.c.whole)} 件，為四區最多。`);
      if (c.whole) lines.push(`占${scopeLabel}已呈現整棟（戶）${fmt(c.whole)} 件的 ${revPct(topWhole.c.whole, c.whole)}%。`);
    }
    const depts = (node.kids || []).filter(k => k.c && k.c.shown);
    const topDept = [...depts].sort((a, b) => b.c.cover - a.c.cover || b.c.shown - a.c.shown)[0];
    if (topDept) lines.push(`${topDept.name}已呈現 ${fmt(topDept.c.shown)} 件，分類涵蓋率 ${revPct(topDept.c.shown, topDept.c.total)}%。`);
    if (!lines.length) lines.push('已呈現類型分散，依表列逐單位核對即可。');
    return lines;
  }
  function renderHouseAnalysis() {
    const { start, end } = houseRange();
    const open = new Set(state.houseOpen || []);
    if (charts.chartHousePie) {
      charts.chartHousePie.destroy();
      delete charts.chartHousePie;
    }
    $('housePeriod').textContent = `統計期間：${slash(start)}～${slash(end)}　${typeFilterNote()}`;
    const ownerOf = (id, name) => displayOwner(id, name) || '—';
    const countsOf = (rows) => {
      const solo = rows.filter(r => (houseGroupOf(r) || {}).id === '獨套').length;
      const whole = rows.filter(r => (houseGroupOf(r) || {}).id === '整棟(戶)').length;
      const total = rows.length;
      const shown = solo + whole;
      const other = Math.max(0, total - shown);
      return {
        solo, whole, other, shown, total,
        soloRate: total ? solo / total : 0,
        wholeRate: total ? whole / total : 0,
        cover: total ? shown / total : 0
      };
    };
    const decorate = (node) => {
      const kids = (node.kids || []).map(decorate);
      const rows = typeRows(unitOfficeSet(node.id), start, end);
      return { ...node, kids, rows, c: countsOf(rows) };
    };
    const root = pruneIdleSalesOffices(decorate(scopedUnitTree()), n => n.c && n.c.total) || decorate(scopedUnitTree());
    const houseKey = state.houseTblSort || '';
    if (houseKey) sortUnitTree(root, n => {
      if (houseKey === 'name') return n.name;
      if (houseKey === 'owner') return ownerOf(n.id, n.name);
      if (houseKey === 'solo') return n.c.solo;
      if (houseKey === 'whole') return n.c.whole;
      if (houseKey === 'other') return n.c.other;
      if (houseKey === 'cover') return n.c.cover;
      return n.c.total;
    }, state.houseTblDir || 'desc');
    if (!findUnitNode(root, state.houseFocus || '')) state.houseFocus = root.id;
    const focus = state.houseFocus || root.id;
    const html = [];
    const walk = (node, depth) => {
      const hasKids = node.kids && node.kids.length;
      const isOpen = node.id === '__SEL__' || open.has(node.id);
      const tog = hasKids
        ? `<button type="button" class="unit-tog" data-house-open="${node.id}">${isOpen ? '▾' : '▸'}</button>`
        : `<span class="unit-tog-sp"></span>`;
      const on = node.id === focus ? ' on' : '';
      html.push(`<tr class="${on}" data-house-focus="${node.id}">
        ${unitCellHtml(node, depth, tog)}
        <td>${fmt(node.c.total)}</td>
        <td>${fmt(node.c.whole)}</td>
        <td>${fmt(node.c.solo)}</td>
        <td>${fmt(node.c.other)}</td>
        <td>${revPct(node.c.shown, node.c.total)}%</td>
      </tr>`);
      if (hasKids && isOpen) node.kids.forEach(k => walk(k, depth + 1));
    };
    walk(root, 0);
    $('houseTable').innerHTML = `<table class="type-tbl ana-tbl"><thead><tr>
      ${tblTh('house', 'name', '單位／擔當者')}${tblTh('house', 'total', '總件數')}${tblTh('house', 'whole', '整棟(戶)')}${tblTh('house', 'solo', '獨套')}${tblTh('house', 'other', '未於兩類呈現')}${tblTh('house', 'cover', '分類涵蓋率')}
    </tr></thead><tbody>${html.join('')}</tbody></table>`;

    const findNode = (node, id) => node.id === id ? node : (node.kids || []).reduce((hit, k) => hit || findNode(k, id), null);
    const focusNode = findNode(root, focus) || root;
    const c = focusNode.c;
    const scopeName = focusNode.name || ddLabel('office');
    const onlyNew = (state.types || []).length === NEW_CHILDREN.length && NEW_CHILDREN.every(t => state.types.includes(t));
    $('houseKpis').innerHTML = `
      <div class="card kpi">
        <div class="k">${onlyNew ? '新媒合總數' : '案件總數'}</div>
        <div class="v">${fmt(c.total)}<span class="unit"> 件</span></div>
        <div class="s">附件統計母體</div>
      </div>
      <div class="card kpi">
        <div class="k">整棟（戶）</div>
        <div class="v">${fmt(c.whole)}<span class="unit"> 件</span></div>
        <div class="s">占總件數 ${revPct(c.whole, c.total)}%</div>
      </div>
      <div class="card kpi">
        <div class="k">獨套</div>
        <div class="v">${fmt(c.solo)}<span class="unit"> 件</span></div>
        <div class="s">占總件數 ${revPct(c.solo, c.total)}%</div>
      </div>
      <div class="card kpi amber">
        <div class="k">未於兩類呈現</div>
        <div class="v">${fmt(c.other)}<span class="unit"> 件</span></div>
        <div class="s">占總件數 ${revPct(c.other, c.total)}%</div>
      </div>`;
    const distTitle = $('houseDistTitle');
    if (distTitle) distTitle.textContent = `全部案件結構（分母 ${fmt(c.total)} 件）`;
    $('houseDist').innerHTML = typeShareBars([
      { lab: '整棟（戶）', n: c.whole, color: '#1e4a7a' },
      { lab: '獨套', n: c.solo, color: '#6d9fc8' },
      { lab: '未於兩類呈現', n: c.other, color: '#c4a035' }
    ], c.total, ['#1e4a7a']);
    const shownN = c.shown || 1;
    $('houseMix').innerHTML = `<h4>已呈現類型的內部占比（分母 ${fmt(c.shown)} 件）</h4>
      <p>整棟（戶）${fmt(c.whole)} 件，占 ${revPct(c.whole, shownN)}%。</p>
      <p>獨套 ${fmt(c.solo)} 件，占 ${revPct(c.solo, shownN)}%。</p>
      <p>${fmt(c.shown)} 件 = ${fmt(c.whole)} + ${fmt(c.solo)}，僅占總件數 ${revPct(c.shown, c.total)}%。</p>
      <p class="note" style="color:#c47b16">附件圖表的 ${revPct(c.whole, shownN)}% 不等於占全部案件比例。</p>`;
    $('houseJudge').innerHTML = `<h4>管理判讀</h4>${houseJudgeLines(focusNode).map(t => `<p>${esc(t)}</p>`).join('')}`;
    $('houseCheck').innerHTML = `<h4>優先核對單位</h4>${houseCheckLines(focusNode).map(t => `<p>${esc(t)}</p>`).join('')}`;
    $('houseFocusNote').innerHTML = `<h4>已呈現類型的件數分布</h4>${houseShownLines(focusNode, scopeName).map(t => `<p>${esc(t)}</p>`).join('')}`;
    const hBtn = $('houseStaffBtn');
    if (hBtn) hBtn.classList.toggle('on', !!state.houseStaffOpen);
    renderHouseStaff(focusNode.rows || [], focusNode.name || '全公司');
  }
  function fitPieWrap(cardSel) {
    const wrap = document.querySelector(cardSel + ' .type-pie-wrap');
    if (!wrap) return;
    wrap.style.height = wrap.clientWidth + 'px';
    const canvas = wrap.querySelector('canvas');
    if (canvas && charts[canvas.id]) charts[canvas.id].resize();
  }

  function revRange() {
    if (state.revGrain === 'year') {
      const y = state.end.getFullYear();
      return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
    }
    return { start: state.start, end: state.end };
  }
  function revPct(n, d) {
    return d ? (n / d * 100).toFixed(1) : '0.0';
  }
  function revWalkUnits(node, acc) {
    acc.push(node);
    (node.kids || []).forEach(k => revWalkUnits(k, acc));
    return acc;
  }
  function revPeers(node) {
    const regionIds = new Set(Object.keys(REGIONS));
    const regions = [];
    const walk = n => {
      if (regionIds.has(n.id) || regionIds.has(n.name)) regions.push(n);
      (n.kids || []).forEach(walk);
    };
    walk(node);
    if (regions.length >= 2) return regions;
    const kids = (node.kids || []).filter(k => k.c && k.c.total);
    if (kids.length >= 2) return kids;
    return revWalkUnits(node, []).filter(n => n !== node && n.c && n.c.total);
  }
  function revPriorityItems(rows) {
    const stOf = r => String(r.st || '');
    const wait = rows.filter(r => (reviewOf(r) || {}).id === '待產編');
    const passRe = rows.filter(r => {
      const st = stOf(r);
      return st.includes('複審通過') && !st.includes('退件');
    });
    const rejRe = rows.filter(r => stOf(r).includes('複審退件'));
    const rejPre = rows.filter(r => stOf(r).includes('預審退件'));
    const reIng = rows.filter(r => stOf(r).includes('複審中') && !stOf(r).includes('退件'));
    const prePass = rows.filter(r => stOf(r).includes('預審通過') && !stOf(r).includes('退件'));
    const preIng = rows.filter(r => {
      const st = stOf(r);
      return (reviewOf(r) || {}).id === '預審' && !st.includes('退件') && !st.includes('預審通過');
    });
    return [
      { id: '待產編', n: wait.length, hint: '確認產編前置條件，盡快排定完成日。' },
      { id: '複審通過', n: passRe.length, hint: '確認後續產編程序，可視為接近已生效。' },
      { id: '退件', n: rejRe.length + rejPre.length, hint: `複審退件 ${fmt(rejRe.length)}件、預審退件 ${fmt(rejPre.length)}件，追蹤協助。` },
      { id: '複審中', n: reIng.length, hint: '掌握審核進度與補件時程，避免卡關。' },
      { id: '預審通過', n: prePass.length, hint: '盡快送複審，縮短待推進時間。' },
      { id: '預審中', n: preIng.length, hint: '確認財調與文件齊備，加速預審完成。' }
    ].filter(x => x.n > 0).slice(0, 3);
  }
  function revJudgeLines(node, scopeLabel) {
    const c = node.c;
    const peers = revPeers(node);
    const lines = [];
    const desc = revWalkUnits(node, []).filter(n => n !== node && n.c && n.c.pending);
    const poolPend = (peers.length ? peers : desc).filter(n => n.c.pending);
    const maxPend = [...poolPend].sort((a, b) => b.c.pending - a.c.pending || a.name.localeCompare(b.name, 'zh-Hant'))[0];
    if (maxPend && c.pending) {
      lines.push(`優先追蹤${maxPend.name}：${fmt(maxPend.c.pending)}件待推進，占${scopeLabel}未生效案件 ${revPct(maxPend.c.pending, c.pending)}%。`);
    }
    const rated = (peers.length ? peers : desc).filter(p => p.c.total >= 8);
    const pool = rated.length >= 2 ? rated : (peers.length ? peers : desc).filter(p => p.c.total);
    if (pool.length >= 2) {
      const low = [...pool].sort((a, b) => a.c.rate - b.c.rate || b.c.pending - a.c.pending)[0];
      if (low) {
        const where = peers.length >= 2 && Object.keys(REGIONS).includes(low.name) ? '在所選區域中最低' : '在所選可比單位中最低';
        lines.push(`${low.name}生效率 ${revPct(low.c.done, low.c.total)}%，${where}，建議檢視複審及待產編的輔件需求。`);
      }
    }
    if (c.wait) {
      const nextDone = c.done + c.wait;
      lines.push(`情境試算：若 ${fmt(c.wait)}件待產編全數生效，已生效可達 ${fmt(nextDone)}件，生效率達 ${revPct(nextDone, c.total)}%。`);
    } else if (c.re) {
      const nextDone = c.done + c.re;
      lines.push(`情境試算：若 ${fmt(c.re)}件複審全數生效，已生效可達 ${fmt(nextDone)}件，生效率達 ${revPct(nextDone, c.total)}%。`);
    }
    if (!lines.length) lines.push(`${scopeLabel}在此期間無待推進案件，維持已生效節奏即可。`);
    return lines;
  }
  function revClusterLines(node, scopeLabel) {
    const c = node.c;
    const peers = revPeers(node);
    const kids = (node.kids || []).filter(k => k.c && k.c.pending);
    const desc = revWalkUnits(node, []).filter(n => n !== node && n.c && n.c.total);
    const lines = [];
    const maxRe = [...(peers.length ? peers : desc)].sort((a, b) => b.c.re - a.c.re)[0];
    if (maxRe && maxRe.c.re && c.re) {
      lines.push(`${maxRe.name}：複審 ${fmt(maxRe.c.re)}件，占${scopeLabel}複審 ${revPct(maxRe.c.re, c.re)}%。`);
    }
    const topKid = [...kids].sort((a, b) => b.c.pending - a.c.pending)[0];
    if (topKid && c.pending) {
      lines.push(`${topKid.name}待推進 ${fmt(topKid.c.pending)}件，占${scopeLabel}待推進 ${revPct(topKid.c.pending, c.pending)}%。`);
    }
    const deptIds = new Set(['電銷部', '多元開發部', '後勤', '業務支援管理部']);
    const small = (desc.filter(n => deptIds.has(n.id) && n.c.wait && n.c.re)[0]
      || desc.filter(n => n.c.total && n.c.total < 60 && n.c.wait && n.c.re)
        .sort((a, b) => a.c.total - b.c.total)[0]);
    if (small) {
      lines.push(`${small.name}待產編 ${fmt(small.c.wait)}件，與複審 ${fmt(small.c.re)}件可分兩條清單追蹤。`);
    }
    if (!lines.length) lines.push('待推進件數分散，依各單位表列逐筆清點即可。');
    return lines;
  }
  function renderReviewAnalysis() {
    const { start, end } = revRange();
    const open = new Set(state.revOpen || []);
    if (charts.chartRevPie) {
      charts.chartRevPie.destroy();
      delete charts.chartRevPie;
    }
    $('revPeriod').textContent = `統計期間：${slash(start)}～${slash(end)}　${typeFilterNote()}　僅計包租、代管(不含轉租)`;
    const ownerOf = (id, name) => {
      if (id === '__SEL__') return '—';
      return LOOKUP.owners[id] || LOOKUP.owners[name] || ownerName(unitOfficeSet(id), name) || '—';
    };
    const countsOf = (rows) => {
      const tagged = rows.map(reviewOf);
      const done = tagged.filter(s => s && s.id === '已生效').length;
      const wait = tagged.filter(s => s && s.id === '待產編').length;
      const re = tagged.filter(s => s && s.id === '複審').length;
      const pre = tagged.filter(s => s && s.id === '預審').length;
      const total = rows.length;
      const pending = wait + re + pre;
      return { done, wait, re, pre, pending, total, rate: total ? done / total : 0 };
    };
    const decorate = (node) => {
      const kids = (node.kids || []).map(decorate);
      const rows = revRows(unitOfficeSet(node.id), start, end);
      return { ...node, kids, rows, c: countsOf(rows) };
    };
    const root = pruneIdleSalesOffices(decorate(scopedUnitTree()), n => n.c && n.c.total) || decorate(scopedUnitTree());
    const revKey = state.revTblSort || '';
    if (revKey) sortUnitTree(root, n => {
      if (revKey === 'name') return n.name;
      if (revKey === 'owner') return ownerOf(n.id, n.name);
      if (revKey === 'done') return n.c.done;
      if (revKey === 'wait') return n.c.wait;
      if (revKey === 're') return n.c.re;
      if (revKey === 'pre') return n.c.pre;
      if (revKey === 'pending') return n.c.pending;
      if (revKey === 'rate') return n.c.rate;
      return n.c.total;
    }, state.revTblDir || 'desc');
    if (!findUnitNode(root, state.revFocus || '')) state.revFocus = root.id;
    const focus = state.revFocus || root.id;
    const html = [];
    const walk = (node, depth) => {
      const hasKids = node.kids && node.kids.length;
      const isOpen = node.id === '__SEL__' || open.has(node.id);
      const pad = 6 + depth * 14;
      const tog = hasKids
        ? `<button type="button" class="unit-tog" data-rev-open="${node.id}">${isOpen ? '▾' : '▸'}</button>`
        : `<span class="unit-tog-sp"></span>`;
      const on = node.id === focus ? ' on' : '';
      html.push(`<tr class="${on}" data-rev-focus="${node.id}">
        ${unitCellHtml(node, depth, tog)}
        <td>${fmt(node.c.total)}</td>
        <td>${fmt(node.c.done)}</td>
        <td>${fmt(node.c.wait)}</td>
        <td>${fmt(node.c.re)}</td>
        <td>${fmt(node.c.pre)}</td>
        <td>${fmt(node.c.pending)}</td>
        <td>${revPct(node.c.done, node.c.total)}%</td>
      </tr>`);
      if (hasKids && isOpen) node.kids.forEach(k => walk(k, depth + 1));
    };
    walk(root, 0);
    $('revTable').innerHTML = `<table class="type-tbl ana-tbl"><thead><tr>
      ${tblTh('rev', 'name', '單位／擔當者')}${tblTh('rev', 'total', '總件數')}${tblTh('rev', 'done', '已生效')}${tblTh('rev', 'wait', '待產編')}${tblTh('rev', 're', '複審')}${tblTh('rev', 'pre', '預審')}${tblTh('rev', 'pending', '待推進')}${tblTh('rev', 'rate', '生效率')}
    </tr></thead><tbody>${html.join('')}</tbody></table>`;

    const findNode = (node, id) => node.id === id ? node : (node.kids || []).reduce((hit, k) => hit || findNode(k, id), null);
    const focusNode = findNode(root, focus) || root;
    const c = focusNode.c;
    const scopeName = focusNode.name || ddLabel('office');
    const salesN = new Set((focusNode.rows || []).map(r => r.sl).filter(Boolean)).size;
    const pendingShare = revPct(c.pending, c.total);
    const reShare = revPct(c.re, c.pending);
    $('revKpis').innerHTML = `
      <div class="card kpi">
        <div class="k">案件總數</div>
        <div class="v">${fmt(c.total)}<span class="unit"> 件</span></div>
        <div class="s">${fmt(salesN)} 位業務</div>
      </div>
      <div class="card kpi">
        <div class="k">已生效</div>
        <div class="v">${fmt(c.done)}<span class="unit"> 件</span></div>
        <div class="s">案件生效率 ${revPct(c.done, c.total)}%</div>
      </div>
      <div class="card kpi">
        <div class="k">尚待推進</div>
        <div class="v">${fmt(c.pending)}<span class="unit"> 件</span></div>
        <div class="s">占全案 ${pendingShare}%</div>
      </div>
      <div class="card kpi">
        <div class="k">複審案件</div>
        <div class="v">${fmt(c.re)}<span class="unit"> 件</span></div>
        <div class="s">占待推進 ${c.pending ? reShare : '0.0'}%</div>
      </div>`;
    const dist = [
      { id: '已生效', n: c.done, color: '#1e4a7a' },
      { id: '待產編', n: c.wait, color: '#6d9fc8' },
      { id: '複審', n: c.re, color: '#d97706' },
      { id: '預審', n: c.pre, color: '#93c5fd' }
    ];
    const maxBar = Math.max(...dist.map(x => x.n), 1);
    $('revDist').innerHTML = `<div class="rev-dist">${dist.map(x => `
      <span class="lab">${x.id}</span>
      <span class="track"><i style="width:${(x.n / maxBar) * 100}%;background:${x.color}"></i></span>
      <span class="n">${fmt(x.n)}件 / ${revPct(x.n, c.total)}%</span>`).join('')}</div>`;
    const prio = revPriorityItems(focusNode.rows || []);
    $('revPrio').innerHTML = prio.length
      ? prio.map((x, i) => `<div class="rev-prio-item"><b>${String(i + 1).padStart(2, '0')}</b><div><div class="t">${esc(x.id)} ${fmt(x.n)}件</div><div class="h">${esc(x.hint)}</div></div></div>`).join('')
      : '<p>目前沒有待推進狀態可排序。</p>';
    const judge = revJudgeLines(focusNode, scopeName);
    $('revJudge').innerHTML = `<h4>管理判讀</h4>${judge.map(t => `<p>${esc(t)}</p>`).join('')}`;
    const cluster = revClusterLines(focusNode, scopeName);
    $('revFocusNote').innerHTML = `<h4>${c.pending ? '案件集中：先處理量大的積壓' : '案件集中：目前無積壓'}</h4>${cluster.map(t => `<p>${esc(t)}</p>`).join('')}`;
    const btn = $('revStaffBtn');
    if (btn) btn.classList.toggle('on', !!state.revStaffOpen);
    renderRevStaff(focusNode.rows || [], focusNode.name || '全公司');
  }
  function sortStaffPeople(people, key, dir) {
    const sign = dir === 'asc' ? 1 : -1;
    return people.sort((a, b) => {
      const av = a[key], bv = b[key];
      if (typeof av === 'string' || typeof bv === 'string') {
        const cmp = String(av || '').localeCompare(String(bv || ''), 'zh-Hant');
        return (cmp || a.name.localeCompare(b.name, 'zh-Hant')) * sign;
      }
      const d = (Number(av) || 0) - (Number(bv) || 0);
      return (d || a.name.localeCompare(b.name, 'zh-Hant')) * sign;
    });
  }
  function staffSortMark(kind, key) {
    return state[kind + 'StaffSort'] === key ? ' sort-on' : '';
  }
  function setStaffSort(kind, key) {
    if (state[kind + 'StaffSort'] === key) {
      state[kind + 'StaffDir'] = (state[kind + 'StaffDir'] || 'desc') === 'desc' ? 'asc' : 'desc';
    } else {
      state[kind + 'StaffSort'] = key;
      state[kind + 'StaffDir'] = (key === 'name' || key === 'office') ? 'asc' : 'desc';
    }
  }
  function sortCaseRows(rows) {
    const key = state.caseSortKey || 'ls';
    const sign = state.caseSortDir === 'asc' ? 1 : -1;
    const val = r => {
      if (key === 'ls' || key === 'le') return rocToDate(r[key]) ? rocToDate(r[key]).getTime() : 0;
      if (key === 'city') return normCity(r.city);
      if (key === 'i') return identityOf(r);
      if (key === 'nl') return leaseCarryOf(r);
      return r[key] == null ? '' : r[key];
    };
    return [...rows].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sign;
      return String(av).localeCompare(String(bv), 'zh-Hant') * sign;
    });
  }
  function staffHead(title) {
    return `<div class="staff-case-head"><h4>${title}</h4><button type="button" class="tool-btn close-btn" data-close-staff>關閉</button></div>`;
  }
  function tblTh(kind, key, label, extra) {
    return `<th data-tbl-sort="${key}" class="${state[kind + 'TblSort'] === key ? 'sort-on' : ''}${extra ? ' ' + extra : ''}">${label}</th>`;
  }
  function setTblSort(kind, key) {
    if (state[kind + 'TblSort'] === key) {
      state[kind + 'TblDir'] = (state[kind + 'TblDir'] || 'desc') === 'desc' ? 'asc' : 'desc';
    } else {
      state[kind + 'TblSort'] = key;
      state[kind + 'TblDir'] = (key === 'name' || key === 'owner') ? 'asc' : 'desc';
    }
  }
  function sortUnitTree(node, valFn, dir) {
    if (!node.kids || !node.kids.length) return;
    const sign = dir === 'asc' ? 1 : -1;
    node.kids.sort((a, b) => {
      const av = valFn(a), bv = valFn(b);
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av || '').localeCompare(String(bv || ''), 'zh-Hant') * sign;
      }
      return ((Number(av) || 0) - (Number(bv) || 0)) * sign;
    });
    node.kids.forEach(k => sortUnitTree(k, valFn, dir));
  }
  function numTd(n, key, extra) {
    if (!n) return `<td class="v empty ${extra || ''}">—</td>`;
    return `<td class="v num-hit ${extra || ''}" data-k="${esc(key)}">${fmt(n)}</td>`;
  }
  function filterStaffCases(p, kind, k) {
    if (!p) return [];
    if (k === 'total') return p.rows;
    if (kind === 'rev' || kind === 'lzRev' || kind === 'wkRev') {
      if (k === 'donePct') return p.rows.filter(r => (reviewOf(r) || {}).id === '已生效');
      if (k === 'reviewPct') return p.rows.filter(r => {
        const id = (reviewOf(r) || {}).id;
        return id === '待產編' || id === '預審' || id === '複審';
      });
      return p.rows.filter(r => (reviewOf(r) || {}).id === k);
    }
    if (kind === 'crab') {
      if (k === 'non') return p.rows.filter(r => !isCrabFt(r));
      if (k === 'crab') return p.rows.filter(isCrabFt);
    }
    if (kind === 'src') {
      if (k === 'ref') return p.rows.filter(r => (srcLeafOf(r) || {}).group === '轉介紹');
      if (k === 'cold') return p.rows.filter(r => (srcLeafOf(r) || {}).group === '陌生開發');
      const parts = String(k).split('|');
      if (parts.length === 2) return p.rows.filter(r => {
        const s = srcLeafOf(r);
        return s && s.group === parts[0] && s.leaf === parts[1];
      });
    }
    if (kind === 'ar') {
      if (k === 'paid') return p.rows.filter(r => arStatusOf(r) === 'paid');
      if (k === 'open') return p.rows.filter(r => arStatusOf(r) === 'open');
      if (k === 'legal') return p.rows.filter(r => arStatusOf(r) === 'legal');
      if (k === 'b17' || k === 'b814' || k === 'b1529' || k === 'b30') return p.rows.filter(r => arAgeBand(r.days) === k);
      return p.rows;
    }
    if (kind === 'fcst') {
      const mm = /^m(\d+)$/.exec(String(k));
      if (mm) {
        const month = Number(mm[1]);
        return p.rows.filter(r => {
          if (Number(r.m) === month) return true;
          const d = rocToDate(r.ls);
          return d && d.getMonth() + 1 === month;
        });
      }
    }
    if (kind === 'rnGrow') {
      if (k === 'due' || k === 'total') return p.dueRows || p.rows || [];
      if (k === 'keep') return p.keepRows || [];
      if (k === 'done') return p.doneRows || [];
      if (k === 'valid') return p.validRows || [];
      if (k === 'wait') return p.waitRows || [];
      if (k === 'rate') return uniqueById([...(p.dueRows || []), ...(p.keepRows || [])]);
    }
    if ((kind === 'lzCg' || kind === 'wkCg' || kind === 'nwCg') && k === 'hit') {
      const hitFn = kind === 'wkCg' ? (r => isWeak1(r) || isWeak2(r)) : (kind === 'nwCg' ? isFreshNew : isLeaseCt);
      return p.rows.filter(hitFn);
    }
    if (kind === 'house') return p.rows.filter(r => (houseGroupOf(r) || {}).id === k);
    if (kind === 'type' || kind === 'lzType' || kind === 'wkType') {
      if (k === 'newN' || k === '新媒合') return p.rows.filter(r => NEW_CHILDREN.includes(r.ft));
      if (k === 'reN' || k === '再媒合') return p.rows.filter(r => r.ft === '到期再媒合' || r.ft === '解約再媒合');
      if (k === 'renew') return p.rows.filter(r => r.ft === '續約');
      if (k === 'toLease') return p.rows.filter(r => r.ft === '代管轉包租');
      if (k === 'toMgmt') return p.rows.filter(r => r.ft === '包租轉代管');
      if (TYPE_HEAT_LEAVES.some(l => l.id === k)) return p.rows.filter(r => r.ft === k);
      const col = TYPE_COLS.find(c => c.id === k);
      return col ? p.rows.filter(r => col.match(r.ft)) : p.rows;
    }
    return p.rows;
  }
  function caseKeyLabel(kind, k) {
    if (k === 'total') return kind === 'fcst' ? '年度件數' : (kind === 'rnGrow' ? '應續約' : '總件數');
    if (kind === 'rnGrow') {
      if (k === 'due') return '應續約';
      if (k === 'keep') return '包租應存續';
      if (k === 'done') return '已續約';
      if (k === 'valid') return '包租有效件';
      if (k === 'wait') return '待續約';
      if (k === 'rate') return '續約率';
    }
    if (k === 'hit') return kind === 'wkCg' ? '政策戶件' : (kind === 'nwCg' ? '新件' : '包租件');
    {
      const mm = /^m(\d+)$/.exec(String(k));
      if (mm) return mm[1] + '月';
    }
    if (kind === 'ar') {
      const hit = AR_STATUS.find(s => s.id === k) || AR_AGE.find(s => s.id === k);
      if (hit) return hit.lab;
      if (k === 'n' || k === 'amt') return '欠款';
    }
    if (kind === 'src') {
      if (k === 'ref') return '轉介紹';
      if (k === 'cold') return '陌生開發';
      return String(k).replace('|', '-');
    }
    if (kind === 'house') return k === 'solo' ? '獨套' : (k === 'whole' ? '整棟(戶)' : k);
    if (kind === 'rev' || kind === 'lzRev' || kind === 'wkRev') {
      if (k === 'donePct') return '已生效%';
      if (k === 'reviewPct') return '審件中%';
    }
    if (kind === 'crab') {
      if (k === 'non') return '非轉銜';
      if (k === 'crab') return '轉銜';
    }
    if (kind === 'type' || kind === 'lzType' || kind === 'wkType') {
      if (k === 'newN') return '新媒合';
      if (k === 'reN') return '再媒合';
      if (k === 'renew') return '續約';
      if (k === 'toLease') return '代轉包';
      if (k === 'toMgmt') return '包轉代';
      const leaf = TYPE_HEAT_LEAVES.find(l => l.id === k);
      return leaf ? leaf.short : k;
    }
    return k;
  }
  function caseRowsHtml(rows) {
    if (state.staffCase && state.staffCase.kind === 'ar') return arCaseRowsHtml(rows);
    const sorted = sortCaseRows(rows);
    if (!sorted.length) return '<div class="empty">無符合條件的資料</div>';
    const cell = (r, id) => {
      if (id === 'so' && state.staffCase && state.staffCase.kind === 'rnGrow') return esc(rnMgmtOffice(r));
      if (id === 'city') return esc(normCity(r.city));
      if (id === 'ls' || id === 'le') return esc(showDate(r[id]));
      if (id === 'i') return esc(identityOf(r));
      if (id === 'nl') return esc(leaseCarryOf(r));
      if (id === 'addr') return esc(r.addr || r.a || '');
      if (id === 'src') {
        const s = caseSource(r);
        return esc(s ? (s.group === '轉介紹' ? '轉介' : '陌生') + '-' + s.leaf : '');
      }
      if (id === 'house') {
        const h = houseGroupOf(r);
        return esc(h ? h.short : (houseOf(r) || ''));
      }
      return esc(r[id] == null ? '' : r[id]);
    };
    const soLab = state.staffCase && state.staffCase.kind === 'rnGrow' ? '代管營業處' : '營業處';
    return `<table class="staff-case-tbl"><thead><tr>
      ${CASE_COLS.map(c => `<th data-case-sort="${c.id}" class="${state.caseSortKey === c.id ? 'sort-on' : ''}">${c.id === 'so' ? soLab : c.label}</th>`).join('')}
    </tr></thead><tbody>
      ${sorted.map(r => `<tr>${CASE_COLS.map(c => `<td>${cell(r, c.id)}</td>`).join('')}</tr>`).join('')}
    </tbody></table>`;
  }
  function staffCasePanel(kind) {
    const c = state.staffCase;
    if (!c || c.kind !== kind) return '';
    const p = (staffPeople[kind] || []).find(x => x.office === c.office && x.name === c.name);
    const rows = filterStaffCases(p, kind, c.key);
    return `<div class="staff-case">
      <div class="staff-case-head">
        <h4>${esc(c.name)}（${esc(c.office)}）｜${esc(c.label)}　業務案件明細　共${fmt(rows.length)}筆</h4>
        <button type="button" class="tool-btn close-btn" data-close-case>關閉</button>
      </div>
      <div class="staff-case-scroll">${caseRowsHtml(rows)}</div>
    </div>`;
  }
  function handleStaffBoxClick(kind, e) {
    if (e.target.closest('[data-close-staff]')) {
      state[kind + 'StaffOpen'] = false;
      if (state.staffCase && state.staffCase.kind === kind) state.staffCase = null;
      refreshStaffKind(kind);
      return;
    }
    if (e.target.closest('[data-close-case]')) {
      if (state.staffCase && state.staffCase.kind === kind) state.staffCase = null;
      refreshStaffKind(kind);
      return;
    }
    const caseTh = e.target.closest('th[data-case-sort]');
    if (caseTh) {
      const key = caseTh.dataset.caseSort;
      if (state.caseSortKey === key) state.caseSortDir = state.caseSortDir === 'desc' ? 'asc' : 'desc';
      else { state.caseSortKey = key; state.caseSortDir = 'asc'; }
      refreshStaffKind(kind);
      return;
    }
    const th = e.target.closest('th[data-sort]');
    if (th) {
      setStaffSort(kind, th.dataset.sort);
      refreshStaffKind(kind);
      return;
    }
    const nameTd = e.target.closest('td.name-hit');
    if (nameTd) {
      const tr = nameTd.closest('tr');
      const office = (tr.children[0] && tr.children[0].textContent) || '—';
      const name = nameTd.textContent || '—';
      state.staffCase = { kind, office, name, key: 'total', label: '全部' };
      refreshStaffKind(kind);
      return;
    }
    const td = e.target.closest('td.num-hit');
    if (!td) return;
    const tr = td.closest('tr');
    if (!tr) return;
    const office = (tr.children[0] && tr.children[0].textContent) || '—';
    const name = (tr.querySelector('.name-hit') && tr.querySelector('.name-hit').textContent) || (tr.children[1] && tr.children[1].textContent) || '—';
    const key = td.dataset.k;
    state.staffCase = { kind, office, name, key, label: caseKeyLabel(kind, key) };
    refreshStaffKind(kind);
  }
  function refreshStaffKind(kind) {
    if (kind === 'rev') renderReviewAnalysis();
    else if (kind === 'src') renderSourceAnalysis();
    else if (kind === 'house') renderHouseAnalysis();
    else if (kind === 'type') renderTypeAnalysis();
    else if (kind === 'lzType') renderLeaseType('lease');
    else if (kind === 'lzRev') renderLeaseReview('lease');
    else if (kind === 'wkType') renderLeaseType('weak');
    else if (kind === 'wkRev') renderLeaseReview('weak');
    else if (kind === 'nwType') renderLeaseType('new');
    else if (kind === 'nwRev') renderLeaseReview('new');
    else if (kind === 'ar') renderArDash();
    else if (kind === 'crab') renderCrabImpact();
    else if (kind === 'grow') renderGrowAnalysis();
    else if (kind === 'lzGrow') renderLzGrowAnalysis();
    else if (kind === 'wkGrow') renderWkGrowAnalysis();
    else if (kind === 'nwGrow') renderNwGrowAnalysis();
    else if (kind === 'lzCg') renderCityRateGrow('lease');
    else if (kind === 'wkCg') renderCityRateGrow('weak');
    else if (kind === 'nwCg') renderCityRateGrow('new');
    else if (kind === 'rnGrow') renderRnDash();
    else if (kind === 'fcst') renderFcstAnalysis();
    else if (kind === 'cg') renderCityGrowAnalysis();
    else if (kind === 'nat') renderSalesRanks();
  }
  function bindStaffBox(id, kind) {
    const box = $(id);
    if (!box || box.dataset.bound === '1') return;
    box.dataset.bound = '1';
    box.addEventListener('click', e => handleStaffBoxClick(kind, e));
  }
  function tallyStatus(rows, groupId) {
    const m = new Map();
    rows.forEach(r => {
      const t = reviewOf(r);
      if (!t || t.id !== groupId) return;
      const st = String(r.st || '—');
      m.set(st, (m.get(st) || 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant'));
  }
  function renderRevStaff(rows, scopeName, opts) {
    const cfg = Object.assign({ boxId: 'revStaffBox', kind: 'rev', openKey: 'revStaffOpen', title: '業績審件進度業務明細查詢' }, opts || {});
    const box = $(cfg.boxId);
    if (!box) return;
    bindStaffBox(cfg.boxId, cfg.kind);
    const open = !!state[cfg.openKey];
    box.classList.toggle('hidden', !open);
    if (!open) {
      if (state.staffCase && state.staffCase.kind === cfg.kind) state.staffCase = null;
      box.innerHTML = '';
      return;
    }
    const map = new Map();
    rows.forEach(r => {
      const name = r.sl || '—';
      const office = r.so || '—';
      const key = office + '\t' + name;
      if (!map.has(key)) map.set(key, { office, name, rows: [] });
      map.get(key).rows.push(r);
    });
    const people = sortStaffPeople([...map.values()].map(p => {
      const lists = {
        已生效: tallyStatus(p.rows, '已生效'),
        待產編: tallyStatus(p.rows, '待產編'),
        複審: tallyStatus(p.rows, '複審'),
        預審: tallyStatus(p.rows, '預審')
      };
      const done = lists.已生效.reduce((s, x) => s + x[1], 0);
      const wait = lists.待產編.reduce((s, x) => s + x[1], 0);
      const re = lists.複審.reduce((s, x) => s + x[1], 0);
      const pre = lists.預審.reduce((s, x) => s + x[1], 0);
      const total = p.rows.length;
      return {
        ...p, done, wait, re, pre, total, lists,
        donePct: total ? done / total : 0,
        reviewPct: total ? (wait + re + pre) / total : 0
      };
    }), state[cfg.kind + 'StaffSort'] || 'done', state[cfg.kind + 'StaffDir'] || 'desc');
    staffPeople[cfg.kind] = people;
    const total = rows.length;
    const doneN = people.reduce((s, p) => s + p.done, 0);
    const top = [...people].sort((a, b) => b.done - a.done)[0];
    const listCell = (items, n, max, from, to, key) => {
      if (!n) return '<td class="v empty detail">—</td>';
      const t = n / Math.max(max, 1);
      const bg = mixHex(from, to, Math.min(1, 0.15 + t * 0.85));
      const color = t > 0.55 ? '#fff' : '#334155';
      const text = items.map(([k, v]) => `${esc(k)} ${fmt(v)}`).join('、');
      return `<td class="v detail num-hit" data-k="${esc(key)}" style="background:${bg};color:${color}"><span>${text}</span></td>`;
    };
    const maxD = Math.max(1, ...people.map(p => p.done));
    const maxW = Math.max(1, ...people.map(p => p.wait));
    const maxR = Math.max(1, ...people.map(p => p.re));
    const maxP = Math.max(1, ...people.map(p => p.pre));
    box.innerHTML = `
      ${staffHead(esc(scopeName) + ' ｜ ' + cfg.title)}
      <p class="src-staff-k">包租／代管（不含轉租）共${fmt(total)}件，${fmt(people.length)}位業務；已生效${fmt(doneN)}件，占整體${total ? (doneN / total * 100).toFixed(1) : '0.0'}%${top && top.done ? `，已生效最高業務${esc(top.name)}${fmt(top.done)}件` : ''}</p>
      <p class="src-staff-k">點表頭排序；點業務姓名展開案件明細。右側列出該進度全部狀態與件數</p>
      <div class="src-staff-scroll"><table class="src-combo rev-combo"><colgroup>
        <col style="width:9em"><col>
        <col><col><col><col><col><col><col>
        <col><col><col><col>
      </colgroup><thead>
        <tr>
          <th data-sort="office" class="${staffSortMark(cfg.kind, 'office')}">業務營業處</th>
          <th data-sort="name" class="${staffSortMark(cfg.kind, 'name')}">業務</th>
          <th data-sort="done" class="${staffSortMark(cfg.kind, 'done')}">已生效</th>
          <th data-sort="wait" class="${staffSortMark(cfg.kind, 'wait')}">待產編</th>
          <th data-sort="re" class="${staffSortMark(cfg.kind, 're')}">複審</th>
          <th data-sort="pre" class="${staffSortMark(cfg.kind, 'pre')}">預審</th>
          <th data-sort="total" class="${staffSortMark(cfg.kind, 'total')}">總件數</th>
          <th data-sort="donePct" class="${staffSortMark(cfg.kind, 'donePct')}">已生效%</th>
          <th data-sort="reviewPct" class="${staffSortMark(cfg.kind, 'reviewPct')}">審件中%</th>
          <th class="g-rev-a" data-sort="done">已生效</th><th class="g-rev-b" data-sort="wait">待產編</th>
          <th class="g-rev-c" data-sort="re">複審</th><th class="g-rev-d" data-sort="pre">預審</th>
        </tr>
      </thead><tbody>
        ${people.map(p => `<tr>
          <td>${esc(p.office)}</td><td class="name-hit">${esc(p.name)}</td>
          ${numTd(p.done, '已生效')}${numTd(p.wait, '待產編')}${numTd(p.re, '複審')}${numTd(p.pre, '預審')}${numTd(p.total, 'total')}
          <td>${(p.donePct * 100).toFixed(1)}%</td><td>${(p.reviewPct * 100).toFixed(1)}%</td>
          ${listCell(p.lists.已生效, p.done, maxD, '#e8f0f8', '#1e4a7a', '已生效')}
          ${listCell(p.lists.待產編, p.wait, maxW, '#eef4fa', '#3d6a94', '待產編')}
          ${listCell(p.lists.複審, p.re, maxR, '#f2f6fb', '#5a8ab0', '複審')}
          ${listCell(p.lists.預審, p.pre, maxP, '#f6f9fc', '#7aa3c4', '預審')}
        </tr>`).join('') || '<tr><td colspan="11">無資料</td></tr>'}
      </tbody></table></div>
      ${staffCasePanel(cfg.kind)}`;
  }

  function mixHex(a, b, t) {
    const p = x => [parseInt(x.slice(1, 3), 16), parseInt(x.slice(3, 5), 16), parseInt(x.slice(5, 7), 16)];
    const A = p(a), B = p(b);
    return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
  }
  function srcLeafOf(r) {
    const s = caseSource(r);
    return s ? { group: s.group, leaf: s.leaf } : null;
  }
  function renderSrcStaff(rows, scopeName) {
    const box = $('srcStaffBox');
    if (!box) return;
    bindStaffBox('srcStaffBox', 'src');
    box.classList.toggle('hidden', !state.srcStaffOpen);
    if (!state.srcStaffOpen) {
      if (state.staffCase && state.staffCase.kind === 'src') state.staffCase = null;
      box.innerHTML = '';
      return;
    }
    const map = new Map();
    rows.forEach(r => {
      const name = r.sl || '—';
      const office = r.so || '—';
      const key = office + '\t' + name;
      if (!map.has(key)) map.set(key, { office, name, rows: [] });
      map.get(key).rows.push(r);
    });
    const people = sortStaffPeople([...map.values()].map(p => {
      const tagged = p.rows.map(srcLeafOf).filter(Boolean);
      const ref = tagged.filter(s => s.group === '轉介紹').length;
      const cold = tagged.filter(s => s.group === '陌生開發').length;
      const total = p.rows.length;
      const heat = { 轉介紹: {}, 陌生開發: {} };
      SRC_HEAT.forEach(leaf => {
        heat.轉介紹[leaf] = tagged.filter(s => s.group === '轉介紹' && s.leaf === leaf).length;
        heat.陌生開發[leaf] = tagged.filter(s => s.group === '陌生開發' && s.leaf === leaf).length;
      });
      const flat = {};
      SRC_HEAT.forEach(leaf => {
        flat['轉介紹|' + leaf] = heat.轉介紹[leaf];
        flat['陌生開發|' + leaf] = heat.陌生開發[leaf];
      });
      return { ...p, ref, cold, total, refRate: total ? ref / total : 0, coldRate: total ? cold / total : 0, heat, ...flat };
    }), state.srcStaffSort || 'ref', state.srcStaffDir || 'desc');
    staffPeople.src = people;
    const total = rows.length;
    const refN = rows.filter(r => (srcLeafOf(r) || {}).group === '轉介紹').length;
    const netN = rows.filter(r => { const s = srcLeafOf(r); return s && s.group === '轉介紹' && s.leaf === '人脈'; }).length;
    const top = [...people].sort((a, b) => b.ref - a.ref)[0];
    const k1 = `媒合總件數${fmt(total)}件，${fmt(people.length)}位業務`;
    const k2 = `轉介紹件數${fmt(refN)}，占整體${total ? (refN / total * 100).toFixed(1) : '0.0'}%；人脈來源${fmt(netN)}，占轉介紹${refN ? (netN / refN * 100).toFixed(1) : '0.0'}%` +
      (top && top.ref ? `，轉介紹最高業務${top.name}${fmt(top.ref)}件，占個人業績${top.total ? Math.round(top.ref / top.total * 1000) / 10 : 0}%` : '');
    const maxRef = Math.max(1, ...people.flatMap(p => SRC_HEAT.map(l => p.heat.轉介紹[l])));
    const maxCold = Math.max(1, ...people.flatMap(p => SRC_HEAT.map(l => p.heat.陌生開發[l])));
    const cell = (n, max, from, to, key, extra) => {
      const cls = extra || '';
      if (!n) return `<td class="v empty${cls}">—</td>`;
      const t = n / max;
      const bg = mixHex(from, to, Math.min(1, 0.15 + t * 0.85));
      const color = t > 0.55 ? '#fff' : '#334155';
      return `<td class="v num-hit${cls}" data-k="${esc(key)}" style="background:${bg};color:${color}">${fmt(n)}</td>`;
    };
    box.innerHTML = `
      ${staffHead(esc(scopeName) + ' ｜ 媒合來源業務明細查詢')}
      <p class="src-staff-k">${k1}；${k2}</p>
      <p class="src-staff-k">點表頭排序；點業務姓名展開案件明細。色塊越深，該來源件數越多</p>
      <div class="src-staff-scroll"><table class="src-combo src-heat"><thead>
        <tr>
          <th rowspan="2" data-sort="office" class="${staffSortMark('src', 'office')}">業務營業處</th>
          <th rowspan="2" data-sort="name" class="${staffSortMark('src', 'name')}">業務</th>
          <th rowspan="2" data-sort="ref" class="${staffSortMark('src', 'ref')}">轉介紹</th>
          <th rowspan="2" data-sort="cold" class="${staffSortMark('src', 'cold')}">陌生開發</th>
          <th rowspan="2" data-sort="total" class="${staffSortMark('src', 'total')}">總件數</th>
          <th rowspan="2">轉介%</th><th rowspan="2">陌開%</th>
          <th class="g-ref" colspan="${SRC_HEAT.length}">轉介紹</th>
          <th class="g-cold" colspan="${SRC_HEAT.length}">陌生開發</th>
        </tr>
        <tr>${SRC_HEAT.map(l => `<th class="leaf-ref" data-sort="轉介紹|${l}">${l}</th>`).join('')}${SRC_HEAT.map(l => `<th class="leaf-cold" data-sort="陌生開發|${l}">${l}</th>`).join('')}</tr>
      </thead><tbody>
        ${people.map(p => `<tr>
          <td>${esc(p.office)}</td><td class="name-hit">${esc(p.name)}</td>
          ${numTd(p.ref, 'ref')}${numTd(p.cold, 'cold')}${numTd(p.total, 'total')}
          <td>${Math.round(p.refRate * 100)}%</td><td>${Math.round(p.coldRate * 100)}%</td>
          ${SRC_HEAT.map(l => cell(p.heat.轉介紹[l], maxRef, '#fff6d8', '#c4a035', '轉介紹|' + l)).join('')}
          ${SRC_HEAT.map((l, i) => cell(p.heat.陌生開發[l], maxCold, '#f0f0f0', '#4a4a4a', '陌生開發|' + l, i === 0 ? ' split-cold' : '')).join('')}
        </tr>`).join('') || '<tr><td colspan="19">無資料</td></tr>'}
      </tbody></table></div>
      ${staffCasePanel('src')}`;
  }
  function renderHouseStaff(rows, scopeName) {
    const box = $('houseStaffBox');
    if (!box) return;
    bindStaffBox('houseStaffBox', 'house');
    box.classList.toggle('hidden', !state.houseStaffOpen);
    if (!state.houseStaffOpen) {
      if (state.staffCase && state.staffCase.kind === 'house') state.staffCase = null;
      box.innerHTML = '';
      return;
    }
    const map = new Map();
    rows.forEach(r => {
      const name = r.sl || '—';
      const office = r.so || '—';
      const key = office + '\t' + name;
      if (!map.has(key)) map.set(key, { office, name, rows: [] });
      map.get(key).rows.push(r);
    });
    const people = sortStaffPeople([...map.values()].map(p => {
      const solo = p.rows.filter(r => (houseGroupOf(r) || {}).id === '獨套').length;
      const whole = p.rows.filter(r => (houseGroupOf(r) || {}).id === '整棟(戶)').length;
      const total = p.rows.length;
      return { ...p, solo, whole, total, soloRate: total ? solo / total : 0, wholeRate: total ? whole / total : 0 };
    }), state.houseStaffSort || 'total', state.houseStaffDir || 'desc');
    staffPeople.house = people;
    const total = rows.length;
    const soloN = people.reduce((a, p) => a + p.solo, 0);
    const top = [...people].sort((a, b) => b.solo - a.solo)[0];
    const cell = (n, max, from, to, key) => {
      if (!n) return '<td class="v empty">—</td>';
      const t = n / Math.max(max, 1);
      const bg = mixHex(from, to, Math.min(1, 0.15 + t * 0.85));
      const color = t > 0.55 ? '#fff' : '#334155';
      return `<td class="v num-hit" data-k="${esc(key)}" style="background:${bg};color:${color}">${fmt(n)}</td>`;
    };
    const maxS = Math.max(1, ...people.map(p => p.solo));
    const maxW = Math.max(1, ...people.map(p => p.whole));
    box.innerHTML = `
      ${staffHead(esc(scopeName) + ' ｜ 房屋類型業務明細查詢')}
      <p class="src-staff-k">媒合總件數${fmt(total)}件，${fmt(people.length)}位業務；獨套${fmt(soloN)}件，占整體${total ? (soloN / total * 100).toFixed(1) : '0.0'}%${top && top.solo ? `，獨套最高業務${esc(top.name)}${fmt(top.solo)}件` : ''}</p>
      <p class="src-staff-k">點表頭排序；點業務姓名展開案件明細</p>
      <div class="src-staff-scroll"><table class="src-combo"><thead>
        <tr>
          <th data-sort="office" class="${staffSortMark('house', 'office')}">業務營業處</th>
          <th data-sort="name" class="${staffSortMark('house', 'name')}">業務</th>
          <th data-sort="solo" class="${staffSortMark('house', 'solo')}">獨套</th>
          <th data-sort="whole" class="${staffSortMark('house', 'whole')}">整棟(戶)</th>
          <th data-sort="total" class="${staffSortMark('house', 'total')}">總件數</th>
          <th>獨套%</th><th>整棟%</th>
          <th class="g-house-b" data-sort="solo">獨套</th><th class="g-house-a" data-sort="whole">整棟(戶)</th>
        </tr>
      </thead><tbody>
        ${people.map(p => `<tr>
          <td>${esc(p.office)}</td><td class="name-hit">${esc(p.name)}</td>
          ${numTd(p.solo, '獨套')}${numTd(p.whole, '整棟(戶)')}${numTd(p.total, 'total')}
          <td>${Math.round(p.soloRate * 100)}%</td><td>${Math.round(p.wholeRate * 100)}%</td>
          ${cell(p.solo, maxS, '#f0f0f0', '#3a3a3a', '獨套')}
          ${cell(p.whole, maxW, '#d8ead8', '#2a5c32', '整棟(戶)')}
        </tr>`).join('') || '<tr><td colspan="9">無資料</td></tr>'}
      </tbody></table></div>
      ${staffCasePanel('house')}`;
  }
  function renderTypeStaff(rows, scopeName, opts) {
    const cfg = Object.assign({ boxId: 'typeStaffBox', kind: 'type', openKey: 'typeStaffOpen', title: '案件類型業務明細查詢' }, opts || {});
    const box = $(cfg.boxId);
    if (!box) return;
    bindStaffBox(cfg.boxId, cfg.kind);
    const open = !!state[cfg.openKey];
    box.classList.toggle('hidden', !open);
    if (!open) {
      if (state.staffCase && state.staffCase.kind === cfg.kind) state.staffCase = null;
      box.innerHTML = '';
      return;
    }
    const map = new Map();
    rows.forEach(r => {
      const name = r.sl || '—';
      const office = r.so || '—';
      const key = office + '\t' + name;
      if (!map.has(key)) map.set(key, { office, name, rows: [] });
      map.get(key).rows.push(r);
    });
    const people = sortStaffPeople([...map.values()].map(p => {
      const newN = p.rows.filter(r => NEW_CHILDREN.includes(r.ft)).length;
      const reN = p.rows.filter(r => r.ft === '到期再媒合' || r.ft === '解約再媒合').length;
      const renew = p.rows.filter(r => r.ft === '續約').length;
      const toLease = p.rows.filter(r => r.ft === '代管轉包租').length;
      const toMgmt = p.rows.filter(r => r.ft === '包租轉代管').length;
      const total = p.rows.length;
      const heat = {};
      TYPE_HEAT_LEAVES.forEach(l => { heat[l.id] = p.rows.filter(r => r.ft === l.id).length; });
      return { ...p, newN, reN, renew, toLease, toMgmt, total, ...heat };
    }), state[cfg.kind + 'StaffSort'] || 'total', state[cfg.kind + 'StaffDir'] || 'desc');
    staffPeople[cfg.kind] = people;
    const total = rows.length;
    const maxNew = Math.max(1, ...people.flatMap(p => TYPE_HEAT[0].leaves.map(l => p[l.id])));
    const maxRe = Math.max(1, ...people.flatMap(p => TYPE_HEAT[1].leaves.map(l => p[l.id])));
    const cell = (n, max, from, to, key) => {
      if (!n) return '<td class="v empty">—</td>';
      const t = n / max;
      const bg = mixHex(from, to, Math.min(1, 0.15 + t * 0.85));
      const color = t > 0.55 ? '#fff' : '#334155';
      return `<td class="v num-hit" data-k="${esc(key)}" style="background:${bg};color:${color}">${fmt(n)}</td>`;
    };
    const leafHead = TYPE_HEAT.map(g => g.leaves.map(l =>
      `<th class="${g.leafCls}" data-sort="${l.id}">${l.short}</th>`).join('')).join('');
    const colSpan = 8 + TYPE_HEAT_LEAVES.length;
    box.innerHTML = `
      ${staffHead(esc(scopeName) + ' ｜ ' + cfg.title)}
      <p class="src-staff-k">媒合總件數${fmt(total)}件，${fmt(people.length)}位業務。點表頭排序；點業務姓名展開案件明細</p>
      <div class="src-staff-scroll"><table class="src-combo src-heat"><thead>
        <tr>
          <th rowspan="2" data-sort="office" class="${staffSortMark(cfg.kind, 'office')}">業務營業處</th>
          <th rowspan="2" data-sort="name" class="${staffSortMark(cfg.kind, 'name')}">業務</th>
          <th rowspan="2" data-sort="newN" class="${staffSortMark(cfg.kind, 'newN')}">新媒合(全)</th>
          <th rowspan="2" data-sort="reN" class="${staffSortMark(cfg.kind, 'reN')}">再媒合(全)</th>
          <th rowspan="2" data-sort="renew" class="${staffSortMark(cfg.kind, 'renew')}">續約</th>
          <th rowspan="2" data-sort="toLease" class="${staffSortMark(cfg.kind, 'toLease')}">代轉包</th>
          <th rowspan="2" data-sort="toMgmt" class="${staffSortMark(cfg.kind, 'toMgmt')}">包轉代</th>
          <th rowspan="2" data-sort="total" class="${staffSortMark(cfg.kind, 'total')}">總件數</th>
          ${TYPE_HEAT.map(g => `<th class="${g.cls}" colspan="${g.leaves.length}">${g.group}</th>`).join('')}
        </tr>
        <tr>${leafHead}</tr>
      </thead><tbody>
        ${people.map(p => `<tr>
          <td>${esc(p.office)}</td><td class="name-hit">${esc(p.name)}</td>
          ${numTd(p.newN, 'newN')}${numTd(p.reN, 'reN')}${numTd(p.renew, 'renew')}${numTd(p.toLease, 'toLease')}${numTd(p.toMgmt, 'toMgmt')}${numTd(p.total, 'total')}
          ${TYPE_HEAT[0].leaves.map(l => cell(p[l.id], maxNew, '#e8f0f8', '#1e4a7a', l.id)).join('')}
          ${TYPE_HEAT[1].leaves.map(l => cell(p[l.id], maxRe, '#eef4fa', '#5a8ab0', l.id)).join('')}
        </tr>`).join('') || `<tr><td colspan="${colSpan}">無資料</td></tr>`}
      </tbody></table></div>
      ${staffCasePanel(cfg.kind)}`;
  }

  function drawTypeBars(id, labels, data, color) {
    const el = $(id);
    if (!el) return;
    const max = Math.max(1, ...data);
    el.innerHTML = labels.map((lab, i) => `
      <span class="lab">${lab}</span>
      <span class="track"><i style="width:${(data[i] / max) * 100}%;background:${color || '#6d9fc8'}"></i></span>
      <span class="n">${fmt(data[i])}</span>`).join('');
  }
  function drawHBars(id, labels, data, color) {
    const canvas = $(id);
    if (!canvas) return;
    const wrap = canvas.parentElement;
    wrap.style.height = `${Math.max(160, labels.length * 22 + 12)}px`;
    const yW = Math.min(240, Math.max(88, ...labels.map(l => String(l).length * 14 + 16)));
    upsert(id, 'bar', labels, [{
      data, backgroundColor: color || '#6d9fc8', borderRadius: 4,
      barThickness: 8, maxBarThickness: 8, categoryPercentage: 1, barPercentage: 1
    }], {
      indexAxis: 'y',
      clip: false,
      plugins: { legend: { display: false } },
      layout: { padding: { right: 28, top: 2, bottom: 2, left: 0 } },
      scales: {
        x: { display: false, grid: { display: false }, border: { display: false } },
        y: {
          grid: { display: false },
          border: { display: false },
          afterFit(sc) {
            const ctx = sc.chart.ctx;
            ctx.save();
            ctx.font = '12px "Microsoft JhengHei", Arial, sans-serif';
            const w = Math.max(...labels.map(l => ctx.measureText(String(l)).width), 72);
            sc.width = Math.min(240, Math.ceil(w) + 14);
            ctx.restore();
          },
          ticks: { display: false }
        }
      }
    }, [{
      id: 'barN-' + id,
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data) return;
        const left = chart.chartArea.left;
        meta.data.forEach((pt, i) => {
          if (!pt) return;
          ctx.save();
          ctx.fillStyle = '#334155';
          ctx.font = '12px "Microsoft JhengHei", Arial, sans-serif';
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'right';
          ctx.fillText(String(labels[i]), left - 8, pt.y);
          ctx.textAlign = 'left';
          ctx.font = '12px Arial, sans-serif';
          ctx.fillText(fmt(data[i]), pt.x + 6, pt.y);
          ctx.restore();
        });
      }
    }]);
  }

  function arcCenter(chart) {
    const a = chart.chartArea;
    return { x: (a.left + a.right) / 2, y: (a.top + a.bottom) / 2 };
  }
  function contrastInk(hex) {
    const m = String(hex || '').replace('#', '');
    if (m.length !== 6) return '#1e3a8a';
    const r = parseInt(m.slice(0, 2), 16) / 255;
    const g = parseInt(m.slice(2, 4), 16) / 255;
    const b = parseInt(m.slice(4, 6), 16) / 255;
    const lin = c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return L > 0.48 ? '#1e3a8a' : '#fff';
  }
  function drawLayeredDonut(id, { outer, inner, total, centerTitle, centerColor, innerMode }) {
    const tot = total || 1;
    const hasOuter = !!(outer && outer.length);
    const pieSets = hasOuter
      ? [
          {
            data: outer.map(x => x.n),
            backgroundColor: outer.map(x => x.outer || x.inner),
            borderWidth: 0,
            weight: 1
          },
          {
            data: inner.map(x => x.n),
            backgroundColor: inner.map(x => x.inner),
            borderWidth: 0,
            weight: 1
          }
        ]
      : [{
          data: inner.map(x => x.n),
          backgroundColor: inner.map(x => x.inner),
          borderWidth: 0
        }];
    upsert(id, 'doughnut', [], pieSets, {
      cutout: '32%',
      clip: false,
      interaction: { mode: 'nearest', intersect: true },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: () => '',
            label(ctx) {
              const arr = (hasOuter && ctx.datasetIndex === 0) ? outer : inner;
              const item = arr[ctx.dataIndex];
              return item ? `${item.id} ${fmt(item.n)}件` : '';
            }
          }
        }
      },
      layout: { padding: 44 }
    }, [{
      id: 'donutDecor-' + id,
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        const outerMeta = chart.getDatasetMeta(0);
        const innerMeta = chart.data.datasets.length > 1 ? chart.getDatasetMeta(1) : null;
        const FONT = '11px "Microsoft JhengHei", sans-serif';
        ctx.font = FONT;
        const fitTwo = (arc, line1, line2, fill) => {
          const ang = (arc.startAngle + arc.endAngle) / 2;
          const rr = (arc.innerRadius + arc.outerRadius) / 2;
          const x = arc.x + Math.cos(ang) * rr;
          const y = arc.y + Math.sin(ang) * rr;
          ctx.save();
          ctx.fillStyle = fill;
          ctx.font = FONT;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(line1, x, y - 1);
          if (line2) {
            ctx.textBaseline = 'top';
            ctx.fillText(line2, x, y + 1);
          }
          ctx.restore();
        };
        if (innerMeta) {
          innerMeta.data.forEach((arc, i) => {
            const item = inner[i];
            if (!item || !item.n) return;
            const p = item.n / tot;
            if (p < 0.08) return;
            const ink = contrastInk(item.inner);
            if (innerMode === 'namePct') fitTwo(arc, item.id, `${(p * 100).toFixed(1)}%`, ink);
            else fitTwo(arc, `${(p * 100).toFixed(1)}%`, '', ink);
          });
        }
        const outerItems = [];
        outerMeta.data.forEach((arc, i) => {
          const item = (hasOuter ? outer[i] : inner[i]);
          if (!item || !item.n) return;
          const p = item.n / tot;
          const name = item.id;
          const cnt = `${fmt(item.n)}件`;
          const midR = (arc.innerRadius + arc.outerRadius) / 2;
          const arcLen = (arc.endAngle - arc.startAngle) * midR;
          const need = Math.max(ctx.measureText(name).width, ctx.measureText(cnt).width) + 8;
          const band = arc.outerRadius - arc.innerRadius;
          const sliceFill = hasOuter ? (item.outer || item.inner) : item.inner;
          if (arcLen >= need && band >= 22) fitTwo(arc, name, cnt, contrastInk(sliceFill));
          else {
            const ang = (arc.startAngle + arc.endAngle) / 2;
            outerItems.push({
              arc, name, cnt, stroke: item.inner || '#94a3b8', ang,
              right: Math.cos(ang) >= 0,
              y: arc.y + Math.sin(ang) * (arc.outerRadius + 8)
            });
          }
        });
        const GAP = 26;
        const top = 14, bot = chart.height - 14;
        ['left', 'right'].forEach(side => {
          const list = outerItems.filter(x => x.right === (side === 'right')).sort((a, b) => a.y - b.y);
          list.forEach(x => { x.y = Math.max(top, Math.min(bot, x.y)); });
          for (let n = 0; n < 10; n++) {
            for (let i = 1; i < list.length; i++) {
              if (list[i].y - list[i - 1].y < GAP) list[i].y = list[i - 1].y + GAP;
            }
            if (list.length && list[list.length - 1].y > bot) {
              list[list.length - 1].y = bot;
              for (let i = list.length - 2; i >= 0; i--) {
                if (list[i + 1].y - list[i].y < GAP) list[i].y = list[i + 1].y - GAP;
              }
            }
          }
        });
        outerItems.forEach(x => {
          const { arc, name, cnt, stroke, ang, right, y } = x;
          const cos = Math.cos(ang), sin = Math.sin(ang);
          const x1 = arc.x + cos * arc.outerRadius;
          const y1 = arc.y + sin * arc.outerRadius;
          const xSide = right ? chart.width - 8 : 8;
          const xMid = right
            ? Math.min(arc.x + arc.outerRadius + 12, xSide - 4)
            : Math.max(arc.x - arc.outerRadius - 12, xSide + 4);
          ctx.save();
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(xMid, y);
          ctx.lineTo(xSide, y);
          ctx.stroke();
          ctx.fillStyle = '#334155';
          ctx.font = FONT;
          ctx.textAlign = right ? 'right' : 'left';
          ctx.textBaseline = 'bottom';
          ctx.fillText(name, xSide, y - 1);
          ctx.textBaseline = 'top';
          ctx.fillText(cnt, xSide, y + 1);
          ctx.restore();
        });
        const c = arcCenter(chart);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = centerColor || '#365a8a';
        ctx.font = '700 14px "Microsoft JhengHei", sans-serif';
        const title = String(centerTitle || '');
        const maxW = Math.max(72, (chart.getDatasetMeta(chart.data.datasets.length > 1 ? 1 : 0).data[0]?.innerRadius || 50) * 1.6);
        const titleLines = (() => {
          if (ctx.measureText(title).width <= maxW) return [title];
          const mid = Math.ceil(title.length / 2);
          return [title.slice(0, mid), title.slice(mid)];
        })();
        titleLines.forEach((ln, i) => {
          ctx.fillText(ln, c.x, c.y - 22 - (titleLines.length - 1 - i) * 16);
        });
        ctx.font = '700 30px Arial, sans-serif';
        ctx.fillText(fmt(total || 0), c.x, c.y + 8);
        ctx.font = '12px "Microsoft JhengHei", sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText('件', c.x, c.y + 30);
        ctx.restore();
      }
    }]);
  }

  function salesRankRange(grain) {
    if (grain === 'year') {
      const y = state.end.getFullYear();
      return { start: new Date(y, 0, 1), end: monthEnd(new Date(y, state.end.getMonth(), 1)) };
    }
    return { start: state.start, end: state.end };
  }
  function natIsCo(name) {
    const s = String(name || '');
    return !s || s === '—' || /公司/.test(s);
  }
  function natRegionOf(office) {
    const so = crabNormSo(office);
    if (so === '電服部' || so === '電銷部') return '電服部';
    if (so === '業務支援管理部') return '業務支援管理部';
    for (const [reg, arr] of Object.entries(REGIONS)) {
      if (arr.includes(so)) return reg;
    }
    return so || '其他';
  }
  function natTenure(days) {
    if (days == null || !isFinite(days) || days < 0) return '—';
    if (days < 365) return `${Math.round(days)}天`;
    const y = Math.floor(days / 365);
    const m = Math.floor((days % 365) / 30);
    return m ? `${y}年${m}月` : `${y}年`;
  }
  function natFirstSeen() {
    const m = new Map();
    ROWS.forEach(r => {
      const name = r.sl || '';
      if (!name || natIsCo(name)) return;
      const d = rocToDate(r.ls);
      if (!d) return;
      const k = name;
      if (!m.has(k) || d < m.get(k)) m.set(k, d);
    });
    return m;
  }
  function natBand(n, span) {
    if (n >= 10 * span) return '前段';
    if (n >= 5 * span) return '中段';
    if (n >= 1) return '後段';
    return '0件';
  }
  const NAT_PENDING = '<span class="nat-pending">待確認資料來源</span>';
  function natPctTxt(n, den) {
    if (!den) return '—';
    return ((n / den) * 100).toFixed(1) + '%';
  }
  function natStaffOf(name, office) {
    const hr = (office && STAFF_HR_BY_NAME.get(name + '\t' + office)) || STAFF_HR_BY_NAME.get(name) || null;
    const base = STAFF.find(x => x.name === name && (!office || x.officeName === office))
      || STAFF.find(x => x.name === name)
      || null;
    if (hr && base) return { ...base, ...hr };
    return hr || base || null;
  }
  function natStaffTitle(name, office) {
    const s = natStaffOf(name, office);
    if (s && s.titleName) return s.titleName;
    if (!s || s.title == null || s.title === '') return '待確認資料來源';
    const map = {
      '10': '營業區協理', '20': '營業處經理', '25': '儲備處經理',
      '30': '業務協理', '40': '業務經理', '50': '業務副理', '60': '業務主任',
      '62': '管理師', '63': '業務助理', '70': '主管', '73': '行政'
    };
    return map[String(s.title)] || '待確認資料來源';
  }
  function natHireDate(name, office) {
    const s = natStaffOf(name, office);
    if (!s) return null;
    const raw = s.reportDate || s.onboardDate || s.hireDate || s.joinDate || s.hd || s.hire;
    if (!raw) return null;
    const str = String(raw);
    if (/^\d{4}-/.test(str)) return parseIso(str.slice(0, 10));
    return rocToDate(str);
  }
  function natTenureLong(days) {
    if (days == null || !isFinite(days) || days < 0) return null;
    const y = Math.floor(days / 365);
    const rem = days % 365;
    const m = Math.floor(rem / 30);
    const d = rem % 30;
    return `${y}年${m}個月又${d}天`;
  }
  function natFilled(v) {
    const s = String(v == null ? '' : v).trim();
    return !!(s && s !== '—' && s !== '-' && s !== 'null');
  }
  function natAgentKey(s) {
    return String(s == null ? '' : s).replace(/\s*\([^)]*\)\s*$/, '').trim();
  }
  function natArrearsOf(name, office) {
    const key = natAgentKey(name);
    const all = ARREARS.filter(r => natAgentKey(r.agent) === key);
    if (!office) return all;
    const hit = all.filter(r => r.office === office);
    return hit.length ? hit : all;
  }
  function natArrearsPack(rows, lo, hi) {
    const list = rows.filter(r => {
      const d = Number(r.days) || 0;
      return d >= lo && (hi == null || d <= hi);
    });
    return { n: list.length, amt: list.reduce((s, x) => s + (Number(x.amt) || 0), 0) };
  }
  function natArrearsTxt(pack) {
    if (!ARREARS.length) return NAT_PENDING;
    return `${fmt(pack.n)}筆／$${fmt(pack.amt)}`;
  }
  function natArrearsMonth(rows, y, m, lo, hi) {
    const list = rows.filter(r => {
      const d = rocToDate(r.rd);
      return d && d.getFullYear() === y && d.getMonth() + 1 === m;
    });
    return natArrearsPack(list, lo, hi);
  }
  function natLicenses(name, office) {
    const s = natStaffOf(name, office);
    if (!s) return { n: null, broker: null, lease: null };
    const hasKeys = ['brokerNo', 'broker', 'leaseNo', 'leaseMgrNo']
      .some(k => Object.prototype.hasOwnProperty.call(s, k));
    if (!hasKeys) return { n: null, broker: null, lease: null };
    const broker = natFilled(s.brokerNo || s.broker);
    const lease = natFilled(s.leaseNo || s.leaseMgrNo);
    return { n: (broker ? 1 : 0) + (lease ? 1 : 0), broker: broker ? 1 : 0, lease: lease ? 1 : 0 };
  }
  function natPersonYearRows(name, office, y, kind) {
    return uniqueById(ROWS.filter(r => {
      const ok = kind === 'policy' ? isPolicyPerf(r) : isPerf(r);
      if (!ok || !NEW_CHILDREN.includes(r.ft)) return false;
      if ((r.sl || '') !== name) return false;
      if (office && crabNormSo(r.so) !== office) return false;
      const d = rocToDate(r.ls);
      return d && d.getFullYear() === y;
    }));
  }
  function natSrcRef(r) {
    const m = matchExtraOf(r) || {};
    const raw = String(r.src || r.ms || r.source || m.src || '');
    return /轉介/.test(raw);
  }
  function natMonthPack(list, y, m, policyList) {
    const rows = list.filter(r => {
      const d = rocToDate(r.ls);
      return d && d.getFullYear() === y && d.getMonth() + 1 === m;
    });
    const lease = rows.filter(r => String(r.ct || '').includes('包租')).length;
    const mgmt = rows.filter(r => String(r.ct || '').includes('代管')).length;
    const ref = rows.filter(natSrcRef).length;
    const suite = rows.filter(isSuiteHouse).length;
    const policyRows = (policyList || []).filter(r => {
      const d = rocToDate(r.ls);
      return d && d.getFullYear() === y && d.getMonth() + 1 === m;
    });
    const weak = policyRows.filter(isWeakId).length;
    const policyN = policyRows.length;
    const newFlags = rows.map(newLeaseFlag);
    const famFlags = rows.map(familyFlag);
    const hasNew = newFlags.some(v => v != null) || !!MATCH_EXTRA.length;
    const hasFam = famFlags.some(v => v != null) || !!MATCH_EXTRA.length;
    const newN = rows.filter(r => isNewCasePerf(r) && isFreshNew(r)).length;
    const famN = rows.filter(r => familyFlag(r) === true).length;
    return { n: rows.length, lease, mgmt, ref, suite, weak, policyN, newN, famN, hasNew, hasFam, rows };
  }
  function natMonthBounds(y, m) {
    return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0) };
  }
  function natTermDate(r) {
    const m = matchExtraOf(r) || {};
    return rocToDate(r.cd || m.cd || '');
  }
  function natValidInMonth(r, y, m) {
    const { start, end } = natMonthBounds(y, m);
    const ls = rocToDate(r.ls), le = rocToDate(r.le);
    if (!ls || !le) return false;
    if (!(ls <= end && le >= start)) return false;
    const cd = natTermDate(r);
    if (cd && cd < start) return false;
    return true;
  }
  function natRenewDone(st) {
    const s = String(st || '');
    if (/未續約|提前解約|解約中|已解約|尚未設定|未派案/.test(s)) return false;
    return /已生效|複審|產編/.test(s);
  }
  function natRenewOf(name, office) {
    const key = natAgentKey(name);
    const all = RENEWALS.filter(r => natAgentKey(r.ag) === key);
    if (!office) return all;
    const hit = all.filter(r => r.of === office);
    return hit.length ? hit : all;
  }
  function natDueInMonth(list, y, m) {
    return list.filter(r => {
      const d = rocToDate(r.le);
      return d && d.getFullYear() === y && d.getMonth() + 1 === m;
    });
  }
  function natDueInRange(list, y, mFrom, mTo) {
    const a = [];
    for (let m = mFrom; m <= mTo; m++) a.push(...natDueInMonth(list, y, m));
    return a;
  }
  function natOpenLease(name, office, y, m, kind) {
    return uniqueById(ROWS.filter(r => {
      if (kind === '包租' && !String(r.ct || '').includes('包租')) return false;
      if (kind === '轉租' && !String(r.ct || '').includes('轉租')) return false;
      if (kind === '代管' && !String(r.ct || '').includes('代管')) return false;
      const extra = matchExtraOf(r) || {};
      const agent = natAgentKey(extra.eu || r.eu || r.sl || extra.sl || '');
      if (agent !== natAgentKey(name)) return false;
      if (office && crabNormSo(r.so || extra.eo || extra.so) !== office && extra.eo !== office) return false;
      return natValidInMonth(r, y, m);
    }));
  }
  function natHasAnniversary(ls, le, y, m) {
    const start = rocToDate(ls), end = rocToDate(le);
    if (!start || !end) return false;
    for (let yy = start.getFullYear() + 1; yy <= end.getFullYear(); yy++) {
      const d = new Date(yy, start.getMonth(), start.getDate());
      if (d >= end) break;
      if (d.getFullYear() === y && d.getMonth() + 1 === m) return true;
    }
    return false;
  }
  function natSurviveN(name, office, y, mFrom, mTo) {
    let n = 0;
    for (let m = mFrom; m <= mTo; m++) {
      n += natOpenLease(name, office, y, m, '轉租').filter(r => natHasAnniversary(r.ls, r.le, y, m)).length;
    }
    return n;
  }
  function natRenewPack(name, office, y, mFrom, mTo, asOfM) {
    const due = natDueInRange(natRenewOf(name, office), y, mFrom, mTo);
    const done = due.filter(r => natRenewDone(r.st || r.raw));
    const openLease = natOpenLease(name, office, y, asOfM, '包租');
    const surv = natSurviveN(name, office, y, mFrom, mTo);
    const num = done.length + surv;
    const den = due.length + openLease.length;
    return { due: due.length, done: done.length, open: openLease.length, surv, num, den };
  }
  function natRenewTxt(pack) {
    if (!RENEWALS.length) return NAT_PENDING;
    if (!pack.den) return '—';
    return `${fmt(pack.num)} / ${fmt(pack.den)} = ${natPctTxt(pack.num, pack.den)}`;
  }
  const RN_BY_CID = new Map(ROWS.map(r => [r.id, r]));
  const RN_BY_N = new Map();
  ROWS.forEach(r => { if (r.n) RN_BY_N.set(r.n, r); });
  function rnContract(r) {
    return RN_BY_CID.get(r.cid) || (r.n && RN_BY_N.get(r.n)) || null;
  }
  function rnLeTime(r) {
    if (r._leT !== undefined) return r._leT;
    const d = rocToDate(r.le);
    r._leT = d ? d.getTime() : NaN;
    return r._leT;
  }
  function rnMgmtOffice(r) {
    if (r._rnSo) return r._rnSo;
    const c = r.cid || r.id ? (RN_BY_CID.get(r.cid) || r) : r;
    const extra = matchExtraOf(c) || matchExtraOf(r) || {};
    const so = crabNormSo(extra.eo || r.eo || c.eo || r.of || r.so || extra.so || '');
    r._rnSo = so;
    return so;
  }
  function rnCityPeriodOk(r) {
    const c = r.city != null && r.p != null ? r : (rnContract(r) || r);
    if (state.cities.length !== CITIES.length) {
      const city = normCity((c && c.city) || cityOfLease(c) || '');
      if (!state.cities.includes(city)) return false;
    }
    if (state.periods.length !== PERIODS.length) {
      if (!c || !state.periods.includes(c.p)) return false;
    }
    return true;
  }
  function rnRowScope(r, offices) {
    const set = offices === undefined ? selectedOffices() : offices;
    const so = rnMgmtOffice(r);
    if (set && !set.has(so) && !set.has(crabNormSo(so))) return false;
    return rnCityPeriodOk(r);
  }
  function rnActiveRow(r) {
    return !/暫存|已停用|已刪除/.test(r.st || '');
  }
  function rnIsDueCt(r) {
    const ct = String(r.ct || '');
    return ct.includes('轉租') || ct.includes('代管');
  }
  function rnDoneSt(st) {
    const s = String(st || '');
    if (/已停用|暫存/.test(s)) return false;
    return /已生效|複審|產編/.test(s);
  }
  function rnCancelDate(r) {
    const extra = matchExtraOf(r) || {};
    return rocToDateFlex(r.cd || extra.cd || extra.cle || r.cle || '');
  }
  function rnAnniversaries(r) {
    if (r._rnAnn) return r._rnAnn;
    const ls = rocToDate(r.ls), le = rocToDate(r.le);
    if (!ls || !le) { r._rnAnn = []; return r._rnAnn; }
    const out = [];
    for (let n = 1; n <= 2; n++) {
      const d = addMonths(ls, n * 12);
      if (d < le) out.push(d);
    }
    r._rnAnn = out;
    return out;
  }
  function rnInRangeT(t, start, end) {
    return t === t && t >= start.getTime() && t <= end.getTime();
  }
  function rnLeadWindow(queryEnd, leadMonths) {
    const end = monthEnd(addMonths(monthStart(queryEnd), leadMonths));
    const start = monthStart(addMonths(end, -11));
    return { start, end };
  }
  function rnMetricRange(metric, queryStart, queryEnd) {
    if (metric === 'lead1') return rnLeadWindow(queryEnd, 1);
    if (metric === 'lead2') return rnLeadWindow(queryEnd, 2);
    return { start: queryStart, end: queryEnd };
  }
  function rnTgtOf(metric) {
    if (metric === 'lead1') return RENEW_LEAD1_RATE;
    if (metric === 'lead2') return RENEW_LEAD2_RATE;
    return RENEW_TARGET_RATE;
  }
  function rnMetricPrefix(metric) {
    if (metric === 'lead1') return '領先1M';
    if (metric === 'lead2') return '領先2M';
    return '當月';
  }
  function rnMetricFull(metric) {
    if (metric === 'lead1') return '領先1M續約率';
    if (metric === 'lead2') return '領先2M續約率';
    return '當月續約率';
  }
  function rnLeaseKeepValid(r, hitAnn) {
    const cd = rnCancelDate(r);
    const le = rocToDate(r.le);
    if (!cd) return true;
    if (!le) return false;
    const sameYm = cd.getFullYear() === le.getFullYear() && cd.getMonth() === le.getMonth();
    if (!sameYm && cd < le) return false;
    if (sameYm) return hitAnn.some(d => cd.getTime() > d.getTime());
    return true;
  }
  function rnFinishPack(due, keep, valid) {
    const done = due.filter(r => rnDoneSt(r.st || r.raw));
    const miss = due.filter(r => /未續約|未續回/.test(r.st || ''));
    const early = due.filter(r => /提前解約/.test(r.st || ''));
    const keepN = keep.length, validN = valid.length;
    const num = done.length + validN;
    const den = due.length + keepN;
    return {
      due: due.length, done: done.length, keep: keepN, valid: validN,
      open: keepN, surv: validN,
      num, den, rate: den ? num / den : 0,
      dueRows: due, doneRows: done, keepRows: keep, validRows: valid,
      miss: miss.length, early: early.length, missRows: miss, earlyRows: early
    };
  }
  function rnUniverse(start, end) {
    const top = selectedOffices();
    return cachedPool('rnU|' + start.getTime() + '|' + end.getTime(), () => {
      const due = uniqueById(RENEWALS.filter(r => {
        if (!rnActiveRow(r)) return false;
        if (!rnIsDueCt(r)) return false;
        if (!rnRowScope(r, top)) return false;
        return rnInRangeT(rnLeTime(r), start, end);
      }));
      const keep = [];
      const valid = [];
      const leasePool = cachedPool('rnLeaseKeep', () => ROWS.filter(r => String(r.ct || '').includes('包租') && rnActiveRow(r)));
      for (let i = 0; i < leasePool.length; i++) {
        const r = leasePool[i];
        if (!rnRowScope(r, top)) continue;
        const cd = rnCancelDate(r);
        const anns = rnAnniversaries(r).filter(d => {
          if (!rnInRangeT(d.getTime(), start, end)) return false;
          if (cd && cd.getTime() < d.getTime()) return false;
          return true;
        });
        if (!anns.length) continue;
        keep.push(r);
        if (rnLeaseKeepValid(r, anns)) valid.push(r);
      }
      return rnFinishPack(due, uniqueById(keep), uniqueById(valid));
    });
  }
  function rnPackRange(start, end, offices) {
    const uni = rnUniverse(start, end);
    const set = offices;
    if (!set) return uni;
    const hit = r => set.has(rnMgmtOffice(r));
    return rnFinishPack(uni.dueRows.filter(hit), uni.keepRows.filter(hit), uni.validRows.filter(hit));
  }
  function rnPack(y, mFrom, mTo, offices) {
    return rnPackRange(new Date(y, mFrom - 1, 1), monthEnd(new Date(y, mTo - 1, 1)), offices);
  }
  function rnMonthPack(year, month, metric, offices) {
    const q1 = new Date(year, month - 1, 1);
    const q2 = monthEnd(q1);
    const rg = rnMetricRange(metric || 'month', q1, q2);
    return rnPackRange(rg.start, rg.end, offices);
  }
  function rnBucketOffices(uni) {
    const map = {};
    const add = (r, key) => {
      const so = rnMgmtOffice(r);
      if (!so || so === '—') return;
      if (!map[so]) map[so] = { due: [], keep: [], valid: [] };
      map[so][key].push(r);
    };
    (uni.dueRows || []).forEach(r => add(r, 'due'));
    (uni.keepRows || []).forEach(r => add(r, 'keep'));
    (uni.validRows || []).forEach(r => add(r, 'valid'));
    return map;
  }
  function rnMergeMaps(maps) {
    const out = {};
    (maps || []).forEach(map => {
      Object.keys(map || {}).forEach(so => {
        if (!out[so]) out[so] = { due: [], keep: [], valid: [] };
        const x = map[so];
        out[so].due.push.apply(out[so].due, x.due);
        out[so].keep.push.apply(out[so].keep, x.keep);
        out[so].valid.push.apply(out[so].valid, x.valid);
      });
    });
    return out;
  }
  function rnPackFromMap(map, set) {
    const due = [], keep = [], valid = [];
    Object.keys(map || {}).forEach(so => {
      if (set && !set.has(so) && !set.has(crabNormSo(so))) return;
      const x = map[so];
      due.push.apply(due, x.due);
      keep.push.apply(keep, x.keep);
      valid.push.apply(valid, x.valid);
    });
    return rnFinishPack(uniqueById(due), uniqueById(keep), uniqueById(valid));
  }
  function rnWhy(due) {
    const map = new Map();
    (due || []).forEach(r => {
      const st = String(r.st || '');
      if (!st.startsWith('未續約')) return;
      const lab = st.replace(/^未續約-?/, '') || '其他';
      map.set(lab, (map.get(lab) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant'));
  }
  function rnPct2(v) {
    return `${((v || 0) * 100).toFixed(2)}%`;
  }
  function rnPpTxt(n) {
    if (n == null || !isFinite(n)) return '—';
    return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
  }
  function rnOfficeRateList(start, end) {
    const uni = rnUniverse(start, end);
    const map = {};
    const add = (r, key) => {
      const so = rnMgmtOffice(r);
      if (!so || so === '—') return;
      if (selectedOffices() && !selectedOffices().has(so)) return;
      if (!SALES_OFFICES.includes(so) && selectedOffices()) return;
      if (!map[so]) map[so] = { due: [], keep: [], done: [], valid: [] };
      map[so][key].push(r);
    };
    uni.dueRows.forEach(r => add(r, 'due'));
    uni.keepRows.forEach(r => add(r, 'keep'));
    uni.doneRows.forEach(r => add(r, 'done'));
    uni.validRows.forEach(r => add(r, 'valid'));
    return Object.keys(map).map(so => {
      const x = map[so];
      const den = x.due.length + x.keep.length;
      const num = x.done.length + x.valid.length;
      return [so, den ? num / den : 0, den, num];
    }).sort((a, b) => b[1] - a[1] || b[3] - a[3] || a[0].localeCompare(b[0], 'zh-Hant'));
  }
  function rnOverviewRange(metric) {
    return rnMetricRange(metric || state.rnTrendMetric || 'month', state.start, state.end);
  }
  function renderRnKpis() {
    const monthP = rnPackRange(state.start, state.end);
    const leadRg = rnLeadWindow(state.end, 1);
    const leadP = rnPackRange(leadRg.start, leadRg.end);
    const tgtM = RENEW_TARGET_RATE;
    const tgt1 = RENEW_LEAD1_RATE;
    const gapM = (monthP.rate - tgtM) * 100;
    const gap1 = (leadP.rate - tgt1) * 100;
    const pp = (n) => `<span class="${n < 0 ? 'neg' : ''}">${n > 0 ? '+' : ''}${n.toFixed(1)}%</span>`;
    const pM = Math.max(0, Math.min(100, monthP.rate * 100));
    const p1 = Math.max(0, Math.min(100, leadP.rate * 100));
    if (!$('rnKpiRow')) return;
    $('rnKpiRow').innerHTML = `
      <div class="card kpi">
        <div class="k">應續約</div>
        <div class="v">${fmt(monthP.due)}<span class="unit"> 件</span></div>
        <div class="s">租約到期應續回案件</div>
      </div>
      <div class="card kpi">
        <div class="k">已完成續約</div>
        <div class="v">${fmt(monthP.done)}<span class="unit"> 件</span></div>
        <div class="s">已生效續約案件數</div>
      </div>
      <div class="card kpi kpi-rate">
        <div class="main">
          <div class="k">當月續約率</div>
          <div class="v">${(monthP.rate * 100).toFixed(2)}<span class="unit"> %</span></div>
          <div class="s">目標 ${Math.round(tgtM * 100)}%　差異 ${pp(gapM)}</div>
        </div>
        <div class="rate-bar" style="--p:${pM}%"><span>${pM.toFixed(1)}%</span></div>
      </div>
      <div class="card kpi kpi-rate">
        <div class="main">
          <div class="k">領先1M續約率</div>
          <div class="v">${(leadP.rate * 100).toFixed(2)}<span class="unit"> %</span></div>
          <div class="s">目標 ${Math.round(tgt1 * 100)}%　差異 ${pp(gap1)}</div>
        </div>
        <div class="rate-bar" style="--p:${p1}%"><span>${p1.toFixed(1)}%</span></div>
      </div>
      <div class="card kpi">
        <div class="k">未續回、提前解約</div>
        <div class="v">${fmt(monthP.miss + monthP.early)}<span class="unit"> 件</span></div>
        <div class="s">未續回 ${fmt(monthP.miss)} 件 ｜ 提前解約 ${fmt(monthP.early)} 件</div>
      </div>`;
  }
  function renderRnTrend() {
    const metric = state.rnTrendMetric || 'month';
    const g = state.rnTrendGrain || 'month';
    const tgt = rnTgtOf(metric);
    const year = state.end.getFullYear();
    const curM = now.getMonth();
    const metricLab = metric === 'lead1' ? '領先1M續約率' : (metric === 'lead2' ? '領先2M續約率' : '當月續約率');
    if ($('rnTrendTitle')) $('rnTrendTitle').textContent = `全部案件類型 ${metricLab}趨勢圖`;
    if ($('rnTrendMetric')) $('rnTrendMetric').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === metric));
    if ($('rnTrendSeg')) $('rnTrendSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === g));
    const lastFull = lastCompleteMonth(now).end;
    const last3 = [1, 2, 3].map(n => {
      const d = new Date(lastFull.getFullYear(), lastFull.getMonth() - n + 1, 1);
      return rnMonthPack(d.getFullYear(), d.getMonth() + 1, metric).rate * 100;
    });
    const pred = last3.reduce((a, b) => a + b, 0) / 3;
    const pctLabel = {
      id: 'rnPtLabels',
      afterDatasetsDraw(chart) {
        const { ctx, chartArea } = chart;
        const legendBottom = chart.legend && Number.isFinite(chart.legend.bottom) ? chart.legend.bottom : (chartArea ? chartArea.top : 0);
        const em = 12;
        chart.data.datasets.forEach((ds, di) => {
          const meta = chart.getDatasetMeta(di);
          if (!meta.visible) return;
          const isPred = ds.label === '預測值';
          meta.data.forEach((pt, i) => {
            const v = ds.data[i];
            if (v == null || !pt) return;
            let below = isPred;
            let y = below ? pt.y + em : pt.y - em;
            if (!below && y < legendBottom + em) { below = true; y = pt.y + em; }
            if (y < legendBottom + em) return;
            ctx.save();
            ctx.fillStyle = ds.borderColor || '#334155';
            ctx.font = '10px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = below ? 'top' : 'bottom';
            ctx.fillText(Number(v).toFixed(1), pt.x, y);
            ctx.restore();
          });
        });
      }
    };
    const lineOpt = (label, data, color, dash, tide) => ({
      label, data, borderColor: color,
      backgroundColor: '#fff',
      tension: .35, pointRadius: 4, fill: false, spanGaps: true,
      borderDash: dash || [], borderWidth: 2.75,
      pointBackgroundColor: '#fff', pointBorderColor: color, pointBorderWidth: 2
    });
    const yScaleOf = (...series) => {
      const vals = series.flat().filter(v => v != null && isFinite(v));
      if (!vals.length) return { min: 0, max: 100 };
      const lo = Math.min(...vals);
      const hi = Math.max(...vals);
      const pad = Math.max(4, (hi - lo) * 0.18);
      let min = Math.floor((lo - pad) / 10) * 10;
      let max = Math.ceil((hi + pad) / 10) * 10;
      if (max > 100) max = 100;
      if (min < 0) min = 0;
      if (min >= max) min = Math.max(0, max - 10);
      if (max - min < 20) min = Math.max(0, max - 20);
      return { min, max };
    };
    const cleanOptsOf = (ymin, ymax) => ({
      plugins: {
        legend: {
          display: true, position: 'top', align: 'end',
          labels: { usePointStyle: true, pointStyle: 'line', boxWidth: 18, boxHeight: 6, padding: 4, font: { family: 'Arial', size: 11 }, color: '#64748b' }
        }
      },
      clip: false,
      layout: { padding: { top: 4, right: 8, left: 4, bottom: 2 } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'Arial', size: 11 }, color: '#94a3b8' }, border: { display: false } },
        y: { min: ymin, max: ymax, grid: { color: '#f1f5f9' }, ticks: { callback: v => v + '%', font: { family: 'Arial', size: 10 }, color: '#94a3b8' }, border: { display: false } }
      }
    });
    if (g === 'day' || g === 'week') {
      const days = [];
      for (let d = new Date(state.start); d <= state.end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) days.push(new Date(d));
      const buckets = g === 'day'
        ? days.map(d => ({ s: d, e: d, label: (d.getMonth() + 1) + '/' + d.getDate() }))
        : (() => {
            const out = [];
            let i = 0;
            while (i < days.length) {
              const chunk = days.slice(i, i + 7);
              out.push({ s: chunk[0], e: chunk[chunk.length - 1], label: 'W' + (out.length + 1) });
              i += 7;
            }
            return out;
          })();
      const actual = buckets.map(b => rnPackRange(b.s, b.e).rate * 100);
      const yoy = buckets.map(b => rnPackRange(
        new Date(b.s.getFullYear() - 1, b.s.getMonth(), b.s.getDate()),
        new Date(b.e.getFullYear() - 1, b.e.getMonth(), b.e.getDate())
      ).rate * 100);
      if ($('rnTrendNote')) $('rnTrendNote').textContent = (g === 'day' ? '逐日' : '週別') + metricLab + '：依租約迄日／週年日落在該段。目標線 ' + Math.round(tgt * 100) + '%。歸屬代管營業處。';
      const tgtLine = buckets.map(() => tgt * 100);
      const yb = yScaleOf(tgtLine, actual, yoy);
      upsert('rnChartTrend', 'line', buckets.map(b => b.label), [
        lineOpt('目標', tgtLine, C_TARGET),
        lineOpt('本年實績', actual, C_ACTUAL),
        lineOpt('去年同期', yoy, C_YOY)
      ], cleanOptsOf(yb.min, yb.max), [pctLabel]);
      return;
    }
    const labels = Array.from({ length: 12 }, (_, i) => (i + 1) + '月');
    const monthly = labels.map((_, i) => rnMonthPack(year, i + 1, metric));
    const yoyM = labels.map((_, i) => rnMonthPack(year - 1, i + 1, metric));
    const useCum = g === 'year';
    const aData = useCum
      ? labels.map((_, i) => i <= curM
        ? (metric === 'month'
          ? rnPackRange(new Date(year, 0, 1), monthEnd(new Date(year, i, 1))).rate * 100
          : rnMonthPack(year, i + 1, metric).rate * 100)
        : null)
      : monthly.map((s, i) => i <= curM ? s.rate * 100 : null);
    const yData = useCum
      ? labels.map((_, i) => metric === 'month'
        ? rnPackRange(new Date(year - 1, 0, 1), monthEnd(new Date(year - 1, i, 1))).rate * 100
        : rnMonthPack(year - 1, i + 1, metric).rate * 100)
      : yoyM.map(s => s.rate * 100);
    const fData = labels.map((_, i) => {
      if (i < curM) return null;
      if (i === curM) return aData[curM];
      return pred;
    });
    if ($('rnTrendNote')) $('rnTrendNote').textContent = (useCum ? '年度累計' : '月別趨勢') +
      '：' + metricLab + '＝（已續約＋包租有效）／（應續約＋包租應存續）。目標 ' + Math.round(tgt * 100) + '%。領先1M 為查詢月底往後1個月的12個月窗。歸屬代管營業處。';
    const tgtLine = labels.map(() => tgt * 100);
    const yb = yScaleOf(tgtLine, aData, fData, yData);
    upsert('rnChartTrend', 'line', labels, [
      lineOpt('目標', tgtLine, C_TARGET),
      lineOpt('本年各月實績', aData, C_ACTUAL),
      lineOpt('預測值', fData, C_ACTUAL, [8, 6]),
      lineOpt('去年同期', yData, C_YOY)
    ], cleanOptsOf(yb.min, yb.max), [pctLabel]);
  }
  function renderRnOfficeRankInto(el, start, end, asPanel) {
    if (!el) return;
    const arr = rnOfficeRateList(start, end);
    const max = Math.max(...arr.map(x => x[1]), 0.01);
    const rows = arr.map((x, i) => rankRowHtml(i, x[0], (x[1] / max) * 100, (x[1] * 100).toFixed(1) + '%', rankToneRate(x[1], 0.8, 0.5))).join('')
      || '<div class="empty">無符合條件的資料</div>';
    if (asPanel) {
      const cols = [arr.slice(0, 8), arr.slice(8, 16), arr.slice(16, 24)];
      el.innerHTML = `<h4>單位續約率排行榜</h4>
        <p class="note">依篩選單位轄下代管營業處續約率排名</p>
        <div class="off-rank-3">${cols.map((col, ci) => `<div class="rank-list">${col.map((x, i) => {
          const rate = x[1];
          return rankRowHtml(ci * 8 + i, x[0], (rate / max) * 100, (rate * 100).toFixed(1) + '%', rankToneRate(rate, 0.8, 0.5));
        }).join('')}</div>`).join('') || '<div class="empty">無符合條件的資料</div>'}</div>`;
      return;
    }
    el.innerHTML = rows;
  }
  function renderRnRank() {
    const metric = state.rnTrendMetric || 'month';
    const rg = rnOverviewRange(metric);
    if ($('rnRankTitle')) $('rnRankTitle').textContent = '單位續約率排行榜';
    if ($('rnRankNote')) $('rnRankNote').textContent = '依篩選單位轄下代管營業處續約率排名';
    renderRnOfficeRankInto($('rnRankList'), rg.start, rg.end, false);
  }
  function renderRnMonth() {
    const year = state.end.getFullYear();
    const cur = now.getMonth();
    const ytd = cur + 1;
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const pack = months.map(m => ({
      s: rnMonthPack(year, m, 'month'),
      yoy: rnMonthPack(year - 1, m, 'month'),
      prev: m === 1 ? rnMonthPack(year - 1, 12, 'month') : rnMonthPack(year, m - 1, 'month')
    }));
    const ytdS = rnPackRange(new Date(year, 0, 1), monthEnd(new Date(year, ytd - 1, 1)));
    const yrS = rnPackRange(new Date(year, 0, 1), monthEnd(new Date(year, 11, 1)));
    const ytdY = rnPackRange(new Date(year - 1, 0, 1), monthEnd(new Date(year - 1, ytd - 1, 1)));
    const yrY = rnPackRange(new Date(year - 1, 0, 1), monthEnd(new Date(year - 1, 11, 1)));
    const tgt = RENEW_TARGET_RATE;
    const dpp = (a, b) => {
      const n = (a - b) * 100;
      return `<td${n < 0 ? ' class="neg"' : ''}>${n > 0 ? '+' : ''}${n.toFixed(1)}</td>`;
    };
    const curS = pack[cur].s;
    if ($('rnMonthTitle')) $('rnMonthTitle').textContent = '全部案件類型 續約率比較表';
    if ($('rnMonthNote')) $('rnMonthNote').textContent =
      `${cur + 1}月續約率 ${rateTxt(curS.num, curS.den, 1)}（${fmt(curS.num)}／${fmt(curS.den)}），目標 ${Math.round(tgt * 100)}%，差異 ${((curS.rate - tgt) * 100).toFixed(1)}%。`;
    const col = (fn) => months.map((_, i) => fn(pack[i], i)).join('');
    if ($('rnMonthTable')) $('rnMonthTable').innerHTML = `<table class="month-cmp lz-month"><thead><tr><th></th><th>項目</th>${months.map((m, i) => `<th${i === cur ? ' class="cur"' : ''}>${m}月</th>`).join('')}<th>1~${ytd}月</th><th>年度</th></tr></thead><tbody>
      <tr><th rowspan="11">續約</th><td class="item">應續約</td>${col(p => `<td>${fmt(p.s.due)}</td>`)}<td>${fmt(ytdS.due)}</td><td>${fmt(yrS.due)}</td></tr>
      <tr><td class="item">包租應存續案件</td>${col(p => `<td>${fmt(p.s.keep)}</td>`)}<td>${fmt(ytdS.keep)}</td><td>${fmt(yrS.keep)}</td></tr>
      <tr><td class="item">已續約</td>${col(p => `<td>${fmt(p.s.done)}</td>`)}<td>${fmt(ytdS.done)}</td><td>${fmt(yrS.done)}</td></tr>
      <tr><td class="item">包租有效案件</td>${col(p => `<td>${fmt(p.s.valid)}</td>`)}<td>${fmt(ytdS.valid)}</td><td>${fmt(yrS.valid)}</td></tr>
      <tr><td class="item">續約率目標</td>${months.map(() => `<td>${(tgt * 100).toFixed(1)}%</td>`).join('')}<td>${(tgt * 100).toFixed(1)}%</td><td>${(tgt * 100).toFixed(1)}%</td></tr>
      <tr><td class="item">續約率</td>${col(p => `<td>${rateTxt(p.s.num, p.s.den, 1)}</td>`)}<td>${rateTxt(ytdS.num, ytdS.den, 1)}</td><td>${rateTxt(yrS.num, yrS.den, 1)}</td></tr>
      <tr><td class="item">差異%</td>${col(p => dpp(p.s.rate, tgt))}${dpp(ytdS.rate, tgt)}${dpp(yrS.rate, tgt)}</tr>
      <tr class="lz-split"><td class="item">同期續約率</td>${col(p => `<td>${rateTxt(p.yoy.num, p.yoy.den, 1)}</td>`)}<td>${rateTxt(ytdY.num, ytdY.den, 1)}</td><td>${rateTxt(yrY.num, yrY.den, 1)}</td></tr>
      <tr><td class="item">同期比</td>${col(p => dpp(p.s.rate, p.yoy.rate))}${dpp(ytdS.rate, ytdY.rate)}${dpp(yrS.rate, yrY.rate)}</tr>
      <tr><td class="item">上月續約率</td>${col(p => `<td>${rateTxt(p.prev.num, p.prev.den, 1)}</td>`)}${ytd >= 2 ? `<td>${rateTxt(pack[ytd - 2].s.num, pack[ytd - 2].s.den, 1)}</td>` : '<td>—</td>'}<td>—</td></tr>
      <tr><td class="item">差異%</td>${col(p => dpp(p.s.rate, p.prev.rate))}<td>—</td><td>—</td></tr>
    </tbody></table>`;
  }
  function renderRnMap() {
    const rg = rnOverviewRange('month');
    const uni = rnUniverse(rg.start, rg.end);
    const groups = {};
    const put = (r, key) => {
      const city = cityOfLease(rnContract(r) || r) || normCity(r.city);
      if (!city) return;
      if (!groups[city]) groups[city] = { due: [], keep: [], done: [], valid: [] };
      groups[city][key].push(r);
    };
    uni.dueRows.forEach(r => put(r, 'due'));
    uni.keepRows.forEach(r => put(r, 'keep'));
    uni.doneRows.forEach(r => put(r, 'done'));
    uni.validRows.forEach(r => put(r, 'valid'));
    const rates = {};
    Object.keys(groups).forEach(city => {
      const g = groups[city];
      const den = g.due.length + g.keep.length;
      const num = g.done.length + g.valid.length;
      rates[city] = { n: den, lease: num, rate: den ? num / den : 0 };
    });
    const draw = (features) => {
      features.forEach(f => { if (!rates[f.name]) rates[f.name] = { n: 0, lease: 0, rate: 0 }; });
      const max = Math.max(...features.map(f => (rates[f.name] || {}).rate || 0), 0.01);
      const pts = [];
      features.forEach(f => f.polys.forEach(poly => poly.forEach(ring => ring.forEach(p => pts.push(p)))));
      const lons = pts.map(p => p[0]), lats = pts.map(p => p[1]);
      const minLon = Math.min(...lons), maxLon = Math.max(...lons);
      const minLat = Math.min(...lats), maxLat = Math.max(...lats);
      const pad = 3, targetH = 220;
      const s = (targetH - pad * 2) / (maxLat - minLat);
      const W = Math.ceil((maxLon - minLon) * s + pad * 2);
      const H = targetH;
      const project = ([lon, lat]) => [pad + (lon - minLon) * s, pad + (maxLat - lat) * s];
      const paths = features.map(f => {
        const sh = rates[f.name] || { n: 0, rate: 0 };
        const fill = !sh.n ? '#d7dee8' : mixBlue(0.28 + 0.72 * (sh.rate / max));
        const d = f.polys.map(poly => poly.map(ring => ringPath(ring, project)).join('')).join('');
        return `<path fill="${fill}" fill-rule="evenodd" d="${d}"><title>${f.name} ${rateTxt(sh.lease || 0, sh.n, 1)}</title></path>`;
      }).join('');
      if ($('rnMap')) $('rnMap').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="營業據點全台續約率">${paths}</svg>`;
      const ranked = CITIES.map(normCity)
        .map(name => [name, rates[name] || { n: 0, lease: 0, rate: 0 }])
        .sort((a, b) => b[1].rate - a[1].rate || a[0].localeCompare(b[0], 'zh-Hant'));
      if ($('rnMapTitle')) $('rnMapTitle').innerHTML = `營業據點全台續約率 <span class="tw-n">｜ ${fmt(CITIES.length)}處</span>`;
      if ($('rnRank')) $('rnRank').innerHTML = ranked.map((x, i) =>
        `<div class="tw-rank-row"><span class="tw-no">${i + 1}</span><span class="city">${x[0]}</span><span class="cnt">${(x[1].rate * 100).toFixed(1)}%</span></div>`
      ).join('');
    };
    loadTwMap().then(draw).catch(() => { if ($('rnMap')) $('rnMap').innerHTML = '<div class="empty">地圖資料載入失敗</div>'; });
  }
  function rnCmpTh(key, label, extra) {
    const on = (state.rnCmpSort || 'rate') === key ? ' sort-on' : '';
    return `<th data-tbl-sort="${key}" class="${extra || ''}${on}">${label}</th>`;
  }
  function renderRnCmp() {
    const grain = state.rnCmpGrain || 'month';
    const y = state.end.getFullYear();
    const start = grain === 'year' ? new Date(y, 0, 1) : state.start;
    const end = grain === 'year' ? new Date(y, 11, 31) : state.end;
    const lastStart = addMonths(start, -1), lastEnd = addMonths(end, -1);
    const yoyStart = new Date(start.getFullYear() - 1, start.getMonth(), start.getDate());
    const yoyEnd = new Date(end.getFullYear() - 1, end.getMonth(), end.getDate());
    const open = new Set(state.rnCmpOpen || []);
    const tgt = RENEW_TARGET_RATE;
    const metrics = (id) => {
      const offices = unitOfficeSet(id);
      const s = rnPackRange(start, end, offices);
      const last = rnPackRange(lastStart, lastEnd, offices);
      const yoy = rnPackRange(yoyStart, yoyEnd, offices);
      return {
        due: s.due, keep: s.keep, done: s.done, valid: s.valid,
        n: s.den, num: s.num, rate: s.rate,
        gap: (s.rate - tgt) * 100,
        yoyRate: yoy.rate, lastRate: last.rate,
        yoyPp: (s.rate - yoy.rate) * 100,
        lastPp: (s.rate - last.rate) * 100,
        tgt: tgt * 100
      };
    };
    const decorate = (node) => {
      const kids = (node.kids || []).map(decorate);
      return { ...node, kids, m: metrics(node.id) };
    };
    const ownerOf = (id, name) => LOOKUP.owners[id] || LOOKUP.owners[name] || ownerName(unitOfficeSet(id), name) || '—';
    const root = pruneIdleSalesOffices(decorate(scopedUnitTree()), n => n.m && (n.m.n || n.m.due || n.m.keep)) || decorate(scopedUnitTree());
    const sortKey = state.rnCmpSort || '';
    if (sortKey) sortUnitTree(root, n => (sortKey === 'name' ? n.name : (sortKey === 'owner' ? ownerOf(n.id, n.name) : n.m[sortKey])), state.rnCmpDir || 'desc');
    if (!findUnitNode(root, state.rnCmpFocus || '')) state.rnCmpFocus = root.id;
    const focusId = state.rnCmpFocus || root.id;
    const dpp = v => `<span class="${v < 0 ? 'neg' : ''}">${v > 0 ? '+' : ''}${v.toFixed(1)}%</span>`;
    const bar = rate => `<div class="rate-cell"><span class="rate-mini"><i style="width:${Math.max(0, Math.min(100, rate * 100))}%"></i></span><span class="rate-pct">${(rate * 100).toFixed(1)}%</span></div>`;
    const rows = [];
    const walk = (node, depth) => {
      const hasKids = node.kids && node.kids.length;
      const isOpen = node.id === '__SEL__' || open.has(node.id);
      const pad = 6 + depth * 14;
      const tog = hasKids
        ? `<button type="button" class="unit-tog" data-rn-unit="${node.id}">${isOpen ? '▾' : '▸'}</button>`
        : `<span class="unit-tog-sp"></span>`;
      const m = node.m;
      const on = node.id === focusId ? ' on' : '';
      rows.push(`<tr class="${on}" data-rn-cmp-row="${node.id}">
        <td class="left unit-name" style="padding-left:${pad}px">${tog}<span>${node.name}</span></td>
        <td class="left">${ownerOf(node.id, node.name)}</td>
        <td>${fmt(m.due)}</td><td>${fmt(m.keep)}</td><td>${fmt(m.done)}</td><td>${fmt(m.valid)}</td>
        <td class="col-tgt">${(tgt * 100).toFixed(1)}%</td>
        <td class="rate-h">${bar(m.rate)}</td>
        <td class="col-diff">${dpp(m.gap)}</td>
        <td>${(m.yoyRate * 100).toFixed(1)}%</td><td>${cmpChg(m.rate, m.yoyRate)}</td>
        <td>${(m.lastRate * 100).toFixed(1)}%</td><td>${cmpChg(m.rate, m.lastRate)}</td>
      </tr>`);
      if (hasKids && isOpen) node.kids.forEach(k => walk(k, depth + 1));
    };
    walk(root, 0);
    const focusNode = findUnitNode(root, focusId) || root;
    if ($('rnCmpTable')) $('rnCmpTable').innerHTML = `<table class="unit-cmp lz-cmp"><thead><tr>
      ${rnCmpTh('name', '單位')}${rnCmpTh('owner', '擔當者')}${rnCmpTh('due', '應續約')}${rnCmpTh('keep', '包租應存續')}${rnCmpTh('done', '已續約')}${rnCmpTh('valid', '包租有效件')}
      ${rnCmpTh('tgt', '續約率目標', 'col-tgt')}${rnCmpTh('rate', '續約率', 'rate-h')}${rnCmpTh('gap', '差異%', 'col-diff')}
      ${rnCmpTh('yoyRate', '同期續約%')}${rnCmpTh('yoyPp', '同期比')}${rnCmpTh('lastRate', '上月續約%')}${rnCmpTh('lastPp', '上月比')}
    </tr></thead><tbody>${rows.join('')}</tbody></table>`;
    const m = focusNode.m || {};
    const name = focusNode.name || '所選單位';
    if ($('rnCmpJudge')) $('rnCmpJudge').innerHTML = `<h4>智慧分析（${esc(name)}）</h4>
      <p>${esc(`${name}續約率 ${(m.rate * 100).toFixed(1)}%（${fmt(m.num)}／${fmt(m.n)}），目標 ${Math.round(tgt * 100)}%，差異 ${(m.gap > 0 ? '+' : '')}${(m.gap || 0).toFixed(1)}%。`)}</p>
      <p>${esc(`應續約 ${fmt(m.due)}、已續約 ${fmt(m.done)}；包租應存續 ${fmt(m.keep)}、包租有效 ${fmt(m.valid)}。`)}</p>
      <p>${esc(`去年同期 ${(m.yoyRate * 100).toFixed(1)}%，上月 ${(m.lastRate * 100).toFixed(1)}%。歸屬代管營業處，案件類型為全部類別。`)}</p>`;
    const kids = (focusNode.kids || []).filter(k => k.m && k.m.n);
    const hi = [...kids].sort((a, b) => b.m.rate - a.m.rate)[0];
    if ($('rnCmpFocusNote')) $('rnCmpFocusNote').innerHTML = `<h4>單位觀察：下層結構</h4>${
      kids.length
        ? `<p>${esc(hi ? `${hi.name}續約率 ${(hi.m.rate * 100).toFixed(1)}%，為下層最高。` : '下層無可比較單位。')}</p>`
        : '<p>所選範圍目前沒有可展開的下層單位，依本列數字判讀即可。</p>'
    }`;
  }
  function renderRnOverview() {
    const paintKey = filterSig() + '|' + iso(state.start) + '|' + iso(state.end) + '|' + (state.rnTrendMetric || 'month') + '|' + (state.rnTrendGrain || 'month') + '|' + (state.rnCmpGrain || 'month');
    if (dashPaint.renew === paintKey) return;
    renderRnKpis();
    const job = ++dashJob;
    const steps = [renderRnTrend, renderRnRank, renderRnMonth, renderRnMap, renderRnCmp, () => { dashPaint.renew = paintKey; }];
    let i = 0;
    const tick = () => {
      if (job !== dashJob) return;
      steps[i++]();
      if (i < steps.length) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  function renderRnGrowUnits(y, viewM, metric, isYear, pm, py, filterM, focusId) {
    const note = $('rnGrowUnitNote');
    const box = $('rnGrowUnitTbl');
    if (!box) return;
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const mm = months.map(m => ({
      m,
      map: rnBucketOffices(rnMonthPack(y, m, metric)),
      yoyMap: rnBucketOffices(rnMonthPack(y - 1, m, metric))
    }));
    const lastMap = rnBucketOffices(rnMonthPack(py, pm, metric));
    const ytdMaps = mm.filter(x => x.m <= viewM).map(x => x.map);
    const ytdYoyMaps = mm.filter(x => x.m <= viewM).map(x => x.yoyMap);
    const ytdMap = rnMergeMaps(ytdMaps);
    const ytdYoyMap = rnMergeMaps(ytdYoyMaps);
    const decorate = (node) => {
      const kids = (node.kids || []).map(decorate);
      const set = unitOfficeSet(node.id);
      const monthPacks = mm.map(x => ({
        m: x.m,
        p: rnPackFromMap(x.map, set),
        yoy: rnPackFromMap(x.yoyMap, set)
      }));
      const now = isYear ? rnPackFromMap(ytdMap, set) : monthPacks[viewM - 1].p;
      const last = isYear ? rnPackFromMap(ytdYoyMap, set) : rnPackFromMap(lastMap, set);
      return {
        ...node, kids, months: monthPacks,
        c: {
          due: now.due, keep: now.keep, done: now.done, valid: now.valid,
          wait: Math.max(0, now.due - now.done),
          rate: now.rate, lastRate: last.rate,
          lastPp: (now.rate - last.rate) * 100
        }
      };
    };
    const root = pruneIdleSalesOffices(decorate(scopedUnitTree()), n => n.c && (n.c.due || n.c.keep || n.c.done)) || decorate(scopedUnitTree());
    const sortKey = state.rnGrowTblSort || '';
    if (sortKey) {
      sortUnitTree(root, n => {
        if (sortKey === 'name') return n.name;
        return n.c[sortKey];
      }, state.rnGrowTblDir || 'desc');
    }
    const open = new Set(state.rnGrowOpen || []);
    const monthOpen = new Set(state.rnGrowMonthOpen || []);
    const lastLab = isYear ? '同期比' : '上月比';
    const unitHead = `${tblTh('rnGrow', 'name', '單位／擔當者')}${tblTh('rnGrow', 'due', '應續約')}${tblTh('rnGrow', 'keep', '包應續')}${tblTh('rnGrow', 'done', '已續約')}${tblTh('rnGrow', 'valid', '包有效')}${tblTh('rnGrow', 'wait', '待續約')}${tblTh('rnGrow', 'rate', '續約率')}${tblTh('rnGrow', 'lastPp', lastLab)}`;
    const html = [];
    const walk = (node, depth) => {
      const hasKids = node.kids && node.kids.length;
      const isOpen = node.id === '__SEL__' || open.has(node.id);
      const tog = hasKids
        ? `<button type="button" class="unit-tog" data-rngu-open="${node.id}">${isOpen ? '▾' : '▸'}</button>`
        : `<span class="unit-tog-sp"></span>`;
      const on = node.id === focusId ? ' on' : '';
      const c = node.c;
      html.push(`<tr class="${on}" data-rngu-focus="${node.id}">
        ${unitCellHtml(node, depth, tog)}
        <td class="v num-hit" data-rngu-months="${node.id}">${fmt(c.due)}</td>
        <td class="v num-hit" data-rngu-months="${node.id}">${fmt(c.keep)}</td>
        <td class="v num-hit" data-rngu-months="${node.id}">${fmt(c.done)}</td>
        <td class="v num-hit" data-rngu-months="${node.id}">${fmt(c.valid)}</td>
        <td class="v num-hit" data-rngu-months="${node.id}">${fmt(c.wait)}</td>
        <td class="v num-hit" data-rngu-months="${node.id}">${(c.rate * 100).toFixed(1)}%</td>
        ${crabTd(crabPpTxt(c.lastPp), crabCls(c.lastPp))}
      </tr>`);
      if (monthOpen.has(node.id)) {
        html.push(`<tr class="crab-mdetail"><td colspan="8"><table class="crab-mini"><thead><tr>
          <th>月</th><th>應續約</th><th>已續約</th><th>待續約</th><th>續約率</th><th>同期比</th>
        </tr></thead><tbody>${node.months.map(x => {
          const yp = (x.p.rate - x.yoy.rate) * 100;
          const wait = Math.max(0, x.p.due - x.p.done);
          return `<tr class="${x.m === viewM ? 'on' : ''}">
            <td>${x.m}月</td><td>${fmt(x.p.due)}</td><td>${fmt(x.p.done)}</td><td>${fmt(wait)}</td>
            <td>${(x.p.rate * 100).toFixed(1)}%</td>
            <td class="${crabCls(yp)}">${crabPpTxt(yp)}</td>
          </tr>`;
        }).join('')}</tbody></table></td></tr>`);
      }
      if (hasKids && isOpen) node.kids.forEach(k => walk(k, depth + 1));
    };
    walk(root, 0);
    if (note) {
      note.textContent = isYear
        ? `點單位查閱｜點數字展開月細｜1–${viewM}月對去年1–${viewM}月｜數字為續約件數與續約率`
        : `點單位查閱｜點數字展開月細｜上月為${pm}月｜數字為續約件數與續約率`;
    }
    box.innerHTML = `<table class="type-tbl ana-tbl"><thead><tr>${unitHead}</tr></thead><tbody>${html.join('')}</tbody></table>`;
  }
  function renderRnDash() {
    if ($('page-renew') && $('page-renew').classList.contains('hidden')) return;
    if ($('rnKpiRow')) renderRnOverview();
    if (!$('rnGrowKpis')) return;
    const y = state.end.getFullYear();
    const filterM = state.end.getMonth() + 1;
    const grain = state.rnGrowGrain || 'month';
    const metric = state.rnGrowMetric || 'month';
    const isYear = grain === 'year';
    const pick = state.rnGrowPick || filterM;
    const viewM = Math.min(isYear ? filterM : pick, filterM);
    const pm = viewM === 1 ? 12 : viewM - 1;
    const py = viewM === 1 ? y - 1 : y;
    const rocY = y - 1911;
    const tgt = RENEW_TARGET_RATE;
    const metricTgt = rnTgtOf(metric);
    const metricLab = rnMetricFull(metric);
    const qEnd = monthEnd(new Date(y, viewM - 1, 1));
    const tree0 = scopedUnitTree();
    if (!findUnitNode(tree0, state.rnGrowFocus || '')) state.rnGrowFocus = tree0.id || '全公司';
    const focusId = state.rnGrowFocus || tree0.id || '全公司';
    const focusSet = unitOfficeSet(focusId);
    const focusName = (findUnitNode(tree0, focusId) || tree0).name || ddLabel('office');
    const nowP = isYear ? rnPack(y, 1, viewM, focusSet) : rnPack(y, viewM, viewM, focusSet);
    const lastP = isYear ? rnPack(y - 1, 1, viewM, focusSet) : rnPack(py, pm, pm, focusSet);
    const yoyP = isYear ? rnPack(y - 1, 1, viewM, focusSet) : rnPack(y - 1, viewM, viewM, focusSet);
    const ytdP = rnPack(y, 1, viewM, focusSet);
    const monthP = rnPack(y, viewM, viewM, focusSet);
    const lead1w = rnLeadWindow(qEnd, 1);
    const lead2w = rnLeadWindow(qEnd, 2);
    const lead1 = rnPackRange(lead1w.start, lead1w.end, focusSet);
    const lead2 = rnPackRange(lead2w.start, lead2w.end, focusSet);
    const rate = nowP.rate, lastRate = lastP.rate, yoyRate = yoyP.rate, ytdR = ytdP.rate;
    const momPp = (rate - lastRate) * 100;
    const yoyPp = (rate - yoyRate) * 100;
    const gapPp = (rate - tgt) * 100;
    const g1 = (lead1.rate - RENEW_LEAD1_RATE) * 100;
    const g2 = (lead2.rate - RENEW_LEAD2_RATE) * 100;
    const officeLab = ddLabel('office');
    const lab = isYear ? `1–${viewM}月` : `${viewM}月`;
    const pctHtml = p => {
      if (p == null || !isFinite(p)) return '—';
      const cls = crabCls(p);
      const t = crabPpTxt(p);
      return cls ? `<span class="${cls}">${t}</span>` : t;
    };
    if ($('rnGrowMetric')) $('rnGrowMetric').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === metric));
    if ($('rnGrowSeg')) $('rnGrowSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === grain));
    if ($('rnGrowStaffBtn')) $('rnGrowStaffBtn').classList.toggle('on', !!state.rnGrowStaffOpen);
    $('rnGrowTitle').textContent = `${rnMetricPrefix(metric)}續約率達成與成長分析`;
    $('rnGrowMeta').textContent = `${rocY}年${viewM}月 ｜ ${officeLab} ｜ 全部案件類型 ｜ 代管營業處 ｜ 目前單位：${focusName} ｜ 當月目標 ${(tgt * 100).toFixed(0)}% ｜ 領先1M目標 ${(RENEW_LEAD1_RATE * 100).toFixed(0)}% ｜ 點線切換月份`;
    $('rnGrowKpis').innerHTML = `
      <div class="card kpi">
        <div class="k">${lab}續約率</div>
        <div class="v">${rnPct2(rate)}</div>
        <div class="s">目標${(tgt * 100).toFixed(0)}%（${pctHtml(gapPp)}）</div>
      </div>
      <div class="card kpi ${g1 < 0 ? 'down' : (g1 > 0 ? 'up' : '')}">
        <div class="k">領先1M</div>
        <div class="v">${(lead1.rate * 100).toFixed(1)}%</div>
        <div class="s">距${(RENEW_LEAD1_RATE * 100).toFixed(0)}%目標（${pctHtml(g1)}）</div>
      </div>
      <div class="card kpi ${g2 < 0 ? 'down' : (g2 > 0 ? 'up' : '')}">
        <div class="k">領先2M</div>
        <div class="v">${(lead2.rate * 100).toFixed(1)}%</div>
        <div class="s">距${(RENEW_LEAD2_RATE * 100).toFixed(0)}%目標（${pctHtml(g2)}）</div>
      </div>
      <div class="card kpi">
        <div class="k">1–${viewM}月累計續約率</div>
        <div class="v">${(ytdR * 100).toFixed(1)}%</div>
        <div class="s">累計已生效 ${fmt(ytdP.done)}件</div>
      </div>`;
    const cols = [
      { p: monthP, tgt: RENEW_TARGET_RATE },
      { p: lead1, tgt: RENEW_LEAD1_RATE },
      { p: lead2, tgt: RENEW_LEAD2_RATE },
      { p: ytdP, tgt: RENEW_TARGET_RATE }
    ];
    const tdRate = c => `<td>${rnPct2(c.p.rate)}</td>`;
    const tdTgt = c => `<td>${rnPct2(c.tgt)}</td>`;
    const tdGap = c => crabTd(crabPpTxt((c.p.rate - c.tgt) * 100), crabCls((c.p.rate - c.tgt) * 100));
    const tdDen = c => `<td>${fmt(c.p.den)}</td>`;
    const tdNum = c => `<td>${fmt(c.p.num)}</td>`;
    $('rnGrowCmpTbl').innerHTML = `<table class="crab-tbl"><thead><tr>
      <th>比較項目</th><th>${viewM}月續約率</th><th>領先1M續約</th><th>領先2M續約</th><th>1–${viewM}月累計續約率</th>
    </tr></thead><tbody>
      <tr class="mark"><td>續約率</td>${cols.map(tdRate).join('')}</tr>
      <tr><td>目標</td>${cols.map(tdTgt).join('')}</tr>
      <tr><td>差異</td>${cols.map(tdGap).join('')}</tr>
      <tr><td>應續約件數</td>${cols.map(tdDen).join('')}</tr>
      <tr><td>已續約件數</td>${cols.map(tdNum).join('')}</tr>
    </tbody></table>`;
    const ytdGap = (tgt - ytdR) * 100;
    $('rnGrowJudge').innerHTML = `<h4>管理結論（${esc(focusName)}）</h4>
      <p>${esc(`${viewM}月續約率${rnPct2(rate)}，${rate < tgt ? `低於目標${Math.abs(gapPp).toFixed(1)}%` : `已達或超過 ${Math.round(tgt * 100)}% 目標`}。`)}</p>
      <p>${esc(`領先1M ${ (lead1.rate * 100).toFixed(1) }%，${g1 < 0 ? `低於目標${Math.abs(g1).toFixed(1)}%` : `已達或超過 ${(RENEW_LEAD1_RATE * 100).toFixed(0)}% 目標`}；領先2M ${(lead2.rate * 100).toFixed(1)}%，${g2 < 0 ? `低於目標${Math.abs(g2).toFixed(1)}%` : `已達或超過 ${(RENEW_LEAD2_RATE * 100).toFixed(0)}% 目標`}。`)}</p>
      <p>${esc(`1–${viewM}月累計${(ytdR * 100).toFixed(1)}%，距${Math.round(tgt * 100)}%目標仍差${Math.abs(ytdGap).toFixed(1)}%。`)}</p>`;
    renderRnGrowUnits(y, viewM, metric, isYear, pm, py, filterM, focusId);
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const packOf = (yy, m) => (isYear && metric === 'month') ? rnPack(yy, 1, m, focusSet) : rnMonthPack(yy, m, metric, focusSet);
    const actual = months.map(m => (m > filterM ? null : packOf(y, m).rate * 100));
    const yoyLine = months.map(m => packOf(y - 1, m).rate * 100);
    const tgtLine = months.map(() => metricTgt * 100);
    const labels = months.map(m => `${m}月`);
    const last3 = months.filter(m => m < filterM && m >= filterM - 3).map(m => packOf(y, m).rate * 100);
    const pred = last3.length ? last3.reduce((s, v) => s + v, 0) / last3.length : null;
    const fData = months.map((_, i) => {
      if (i + 1 < filterM) return null;
      if (i + 1 === filterM) return actual[i];
      return pred;
    });
    const yScaleOf = (...series) => {
      const vals = series.flat().filter(v => v != null && isFinite(v));
      if (!vals.length) return { min: 0, max: 100 };
      const lo = Math.min(...vals);
      const hi = Math.max(...vals);
      const pad = Math.max(4, (hi - lo) * 0.18);
      let min = Math.floor((lo - pad) / 10) * 10;
      let max = Math.ceil((hi + pad) / 10) * 10;
      if (max > 100) max = 100;
      if (min < 0) min = 0;
      if (min >= max) min = Math.max(0, max - 10);
      if (max - min < 20) min = Math.max(0, max - 20);
      return { min, max };
    };
    const yb = yScaleOf(tgtLine, actual, fData, yoyLine);
    $('rnGrowChartTitle').textContent = (isYear && metric === 'month')
      ? `1–${viewM}月累計續約率`
      : `1–12月${metricLab}趨勢`;
    $('rnGrowChartNote').textContent =
      `藍線為${metricLab}、綠線為去年同期、深藍線為目標 ${(metricTgt * 100).toFixed(0)}%；${filterM < 12 ? `${filterM + 1}–12月以近3月均值推估` : '全年已列入'}。點線切換月份。` +
      `領先1M續約率：統計期間 ${slash(lead1w.start)}～${slash(lead1w.end)}。領先2M續約率：統計期間 ${slash(lead2w.start)}～${slash(lead2w.end)}。已續約採查詢當下狀態，不另以完成日期篩選。`;
    const bandPlugin = {
      id: 'rnGrowBand',
      beforeDraw(chart) {
        if (isYear) return;
        const meta = chart.getDatasetMeta(1);
        const pt = meta && meta.data[viewM - 1];
        if (!pt) return;
        const { ctx, chartArea } = chart;
        ctx.save();
        ctx.fillStyle = 'rgba(59,130,246,.07)';
        ctx.fillRect(pt.x - 18, chartArea.top, 36, chartArea.bottom - chartArea.top);
        ctx.restore();
      }
    };
    const labelPlugin = {
      id: 'rnGrowLabels',
      afterDatasetsDraw(chart) {
        const { ctx, chartArea } = chart;
        const em = 12;
        chart.data.datasets.forEach((ds, di) => {
          const meta = chart.getDatasetMeta(di);
          if (!meta.visible) return;
          const isPred = ds.label === '預測值';
          meta.data.forEach((pt, i) => {
            const v = ds.data[i];
            if (v == null || !pt) return;
            let below = isPred;
            let yy = below ? pt.y + em : pt.y - em;
            if (!below && chartArea && yy < chartArea.top + 2) { below = true; yy = pt.y + em; }
            ctx.save();
            ctx.fillStyle = ds.borderColor || '#334155';
            ctx.font = '10px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = below ? 'top' : 'bottom';
            ctx.fillText(Number(v).toFixed(1), pt.x, yy);
            ctx.restore();
          });
        });
      }
    };
    const tideFill = (ctx) => {
      const { chart } = ctx;
      const area = chart && chart.chartArea;
      if (!area) return 'rgba(59,130,246,0.18)';
      const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
      g.addColorStop(0, 'rgba(37,99,235,0.42)');
      g.addColorStop(0.45, 'rgba(96,165,250,0.22)');
      g.addColorStop(1, 'rgba(191,219,254,0.04)');
      return g;
    };
    const hide = state.rnGrowHide || {};
    const lineOpt = (label, data, color, dash, tide, hidden) => ({
      label, data, hidden: !!hidden,
      borderColor: color,
      backgroundColor: tide ? tideFill : '#fff',
      tension: .35, pointRadius: 4, pointHoverRadius: 5,
      fill: tide ? 'origin' : false, spanGaps: true,
      borderDash: dash && dash.length ? dash : [],
      borderWidth: 2.75,
      pointBackgroundColor: '#fff',
      pointBorderColor: color,
      pointBorderWidth: 2
    });
    upsert('rnGrowChart', 'line', labels, [
      lineOpt('目標', tgtLine, C_TARGET, null, false, hide['目標']),
      lineOpt('實績', actual, C_ACTUAL, null, true, hide['實績']),
      lineOpt('預測值', fData, C_ACTUAL, [8, 6], false, hide['實績']),
      lineOpt('同期', yoyLine, C_YOY, null, false, hide['同期'])
    ], {
      plugins: { legend: { display: false }, filler: { propagate: false } },
      clip: false,
      layout: { padding: { top: 8, right: 8, left: 4, bottom: 2 } },
      interaction: { mode: 'index', intersect: false },
      onClick: (evt, els) => {
        if (!els.length) return;
        const i = els[0].index + 1;
        if (i > filterM) return;
        state.rnGrowPick = i;
        state.rnGrowGrain = 'month';
        renderRnDash();
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#94a3b8' }, border: { display: false } },
        y: {
          min: yb.min, max: yb.max, grid: { color: '#f1f5f9' },
          ticks: { font: { size: 10 }, color: '#94a3b8', callback: v => v + '%' },
          border: { display: false }
        }
      }
    }, [bandPlugin, labelPlugin]);
    if ($('rnGrowLegend')) {
      $('rnGrowLegend').querySelectorAll('[data-rngrow-ds]').forEach(b => {
        b.classList.toggle('off', !!hide[b.dataset.rngrowDs]);
      });
    }
    const rankRg = (isYear && metric === 'month')
      ? { start: new Date(y, 0, 1), end: qEnd }
      : rnMetricRange(metric, new Date(y, viewM - 1, 1), qEnd);
    renderRnOfficeRankInto($('rnGrowOffRank'), rankRg.start, rankRg.end, true);
    const fig1 = uniqueById(ROWS.filter(r => {
      if (!rnRowScope(r)) return false;
      if (r.ft !== '續約') return false;
      if (!/已生效/.test(r.st || '')) return false;
      const d = rocToDate(r.ls);
      return d && d.getFullYear() === y && d.getMonth() + 1 === viewM;
    })).length;
    const att = nowP.dueRows.filter(r => /已生效/.test(r.st || '')).length;
    const early = nowP.dueRows.filter(r => /提前解約/.test(r.st || '')).length;
    $('rnGrowAudit').innerHTML = `<h4>資料核對</h4>
      <p>應續約 ${fmt(nowP.due)}、已續約 ${fmt(nowP.done)}、包租應存續 ${fmt(nowP.keep)}、包租有效 ${fmt(nowP.valid)}。契約已生效續約 ${fmt(fig1)} 件（起租日當月，僅供對照）。</p>
      <p>領先續約率＝（已續約＋包租有效）／（應續約＋包租應存續）。應續約：續約明細、轉租或代管、狀態剔除已停用／暫存、租約迄日落在統計期間。已續約：應續約中狀態含已生效／複審／產編（查詢當下狀態）。包租應存續：契約包租、第1／第2週年日落在期間且早於迄日；週年日前已有解約日者不計入。包租有效：應存續中再依解約日判斷。歸屬代管營業處，案件類型全部類別。</p>`;
    renderRnGrowStaff(nowP);
  }
  function renderRnGrowStaff(pack) {
    const box = $('rnGrowStaffBox');
    if (!box) return;
    bindStaffBox('rnGrowStaffBox', 'rnGrow');
    box.classList.toggle('hidden', !state.rnGrowStaffOpen);
    if (!state.rnGrowStaffOpen) {
      if (state.staffCase && state.staffCase.kind === 'rnGrow') state.staffCase = null;
      box.innerHTML = '';
      return;
    }
    const tag = (r) => {
      const c = rnContract(r) || {};
      return { ...c, ...r, sl: r.ag || c.sl || '', so: rnMgmtOffice({ ...c, ...r }), city: c.city || r.city || '', addr: c.addr || '', p: c.p || '' };
    };
    const map = new Map();
    const add = (r, key) => {
      const row = tag(r);
      const name = row.sl || '—';
      const office = row.so || '—';
      const k = office + '\t' + name;
      if (!map.has(k)) map.set(k, { office, name, due: [], keep: [], done: [], valid: [] });
      map.get(k)[key].push(row);
    };
    (pack.dueRows || []).forEach(r => add(r, 'due'));
    (pack.keepRows || []).forEach(r => add(r, 'keep'));
    (pack.doneRows || []).forEach(r => add(r, 'done'));
    (pack.validRows || []).forEach(r => add(r, 'valid'));
    const people = sortStaffPeople([...map.values()].map(p => {
      const due = uniqueById(p.due);
      const keep = uniqueById(p.keep);
      const done = uniqueById(p.done);
      const valid = uniqueById(p.valid);
      const wait = due.filter(r => !rnDoneSt(r.st || r.raw));
      const den = due.length + keep.length;
      const num = done.length + valid.length;
      return {
        office: p.office, name: p.name,
        due: due.length, keep: keep.length, done: done.length, valid: valid.length,
        wait: wait.length, rate: den ? num / den : 0, total: due.length,
        rows: due, dueRows: due, keepRows: keep, doneRows: done, validRows: valid, waitRows: wait
      };
    }), state.rnGrowStaffSort || 'due', state.rnGrowStaffDir || 'desc');
    staffPeople.rnGrow = people;
    const dueN = people.reduce((s, p) => s + p.due, 0);
    box.innerHTML = `
      ${staffHead('續約明細 ｜ 應到期可續約案件')}
      <p class="src-staff-k">應續約 ${fmt(dueN)} 件。點數字展開案件明細</p>
      <div class="src-staff-scroll"><table class="src-combo"><thead><tr>
        <th data-sort="office" class="${staffSortMark('rnGrow', 'office')}">營業處</th>
        <th data-sort="name" class="${staffSortMark('rnGrow', 'name')}">代管人員</th>
        <th data-sort="due" class="${staffSortMark('rnGrow', 'due')}">應續約</th>
        <th data-sort="keep" class="${staffSortMark('rnGrow', 'keep')}">包租應存續</th>
        <th data-sort="done" class="${staffSortMark('rnGrow', 'done')}">已續約</th>
        <th data-sort="valid" class="${staffSortMark('rnGrow', 'valid')}">包租有效件</th>
        <th data-sort="wait" class="${staffSortMark('rnGrow', 'wait')}">待續約</th>
        <th data-sort="rate" class="${staffSortMark('rnGrow', 'rate')}">續約率</th>
      </tr></thead><tbody>
        ${people.map(p => `<tr>
          <td>${esc(p.office)}</td><td class="name-hit">${esc(p.name)}</td>
          ${numTd(p.due, 'due')}${numTd(p.keep, 'keep')}${numTd(p.done, 'done')}${numTd(p.valid, 'valid')}${numTd(p.wait, 'wait')}
          <td class="v">${(p.rate * 100).toFixed(1)}%</td>
        </tr>`).join('') || '<tr><td colspan="8">無資料</td></tr>'}
      </tbody></table></div>
      ${staffCasePanel('rnGrow')}`;
  }
  function renderNatPerf(allPeople) {
    const box = $('natPerf');
    if (!box) return;
    const name = state.natPerson;
    const office = state.natOffice;
    if (!name) {
      box.innerHTML = `<div class="rev-panel nat-perf">
        <h4>業務績效表</h4>
        <p class="note">請輸入業務姓名關鍵字，或從全台業務分析點選姓名。</p>
      </div>`;
      return;
    }
    const y = state.end.getFullYear();
    const viewM = state.end.getMonth() + 1;
    const asOf = state.end;
    const yearRows = natPersonYearRows(name, office, y);
    const policyYear = natPersonYearRows(name, office, y, 'policy');
    const emptyPack = { n: 0, lease: 0, mgmt: 0, ref: 0, suite: 0, weak: 0, policyN: 0, newN: 0, famN: 0, hasNew: false, hasFam: false, rows: [] };
    const months = Array.from({ length: 12 }, (_, i) => i + 1 > viewM ? emptyPack : natMonthPack(yearRows, y, i + 1, policyYear));
    const ytd = months.slice(0, viewM);
    const ytdN = ytd.reduce((s, x) => s + x.n, 0);
    const ytdLease = ytd.reduce((s, x) => s + x.lease, 0);
    const ytdMgmt = ytd.reduce((s, x) => s + x.mgmt, 0);
    const ytdRef = ytd.reduce((s, x) => s + x.ref, 0);
    const ytdSuite = ytd.reduce((s, x) => s + x.suite, 0);
    const ytdWeak = ytd.reduce((s, x) => s + x.weak, 0);
    const ytdPolicy = ytd.reduce((s, x) => s + (x.policyN || 0), 0);
    const ytdNew = ytd.reduce((s, x) => s + x.newN, 0);
    const ytdFam = ytd.reduce((s, x) => s + x.famN, 0);
    const ytdHasNew = ytd.some(x => x.hasNew);
    const ytdHasFam = ytd.some(x => x.hasFam);
    const hire = natHireDate(name, office);
    const days = hire ? Math.round((asOf - hire) / 86400000) + 1 : null;
    const title = natStaffTitle(name, office);
    const lic = natLicenses(name, office);
    const cur = months[viewM - 1];
    const m1 = viewM >= 2 ? months[viewM - 2] : null;
    const m2 = viewM >= 3 ? months[viewM - 3] : null;
    const firstCase = natFirstSeen().get(name);
    const tenureStart = hire || firstCase;
    const calMonths = tenureStart && tenureStart.getFullYear() === y
      ? Math.max(1, viewM - tenureStart.getMonth())
      : viewM;
    const avg = calMonths ? (ytdN / calMonths) : 0;
    let streak = 0;
    for (let m = viewM - 1; m >= 1; m--) {
      if (months[m - 1].n === 0) streak += 1;
      else break;
    }
    const ranked = [...allPeople].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'zh-Hant'));
    const me = ranked.find(p => p.name === name && p.office === office);
    const natRank = me ? me.rank : '—';
    const officePeers = ranked.filter(p => p.office === office);
    const offRank = me ? officePeers.findIndex(p => p.name === name && p.office === office) + 1 : '—';
    const natN = ranked.length;
    const offN = officePeers.length;
    const share = me && allPeople.reduce((s, p) => s + p.n, 0)
      ? ((me.n / allPeople.reduce((s, p) => s + p.n, 0)) * 100).toFixed(1)
      : '0.0';
    const activeMgmt = uniqueById(ROWS.filter(r => {
      if ((r.sl || '') !== name || crabNormSo(r.so) !== office) return false;
      if (!String(r.ct || '').includes('代管')) return false;
      if (!/已生效/.test(r.st || '')) return false;
      const ls = rocToDate(r.ls);
      const le = rocToDate(r.le);
      if (!ls || ls > asOf) return false;
      if (le && le < asOf) return false;
      return true;
    })).length;
    const maxBar = Math.max(...months.map(x => x.n), 1);
    const cell = (pack, kind) => {
      if (!pack) return '—';
      if (kind === 'n') return fmt(pack.n);
      if (kind === 'lease') return pack.n ? natPctTxt(pack.lease, pack.n) : '—';
      if (kind === 'weak') return natPctTxt(pack.weak, pack.policyN);
      if (kind === 'new') return pack.hasNew ? (pack.n ? natPctTxt(pack.newN, pack.n) : '—') : NAT_PENDING;
      if (kind === 'ref') return pack.n ? natPctTxt(pack.ref, pack.n) : '—';
      if (kind === 'suite') return pack.n ? natPctTxt(pack.suite, pack.n) : '—';
      if (kind === 'fam') return pack.hasFam ? fmt(pack.famN) : NAT_PENDING;
      return NAT_PENDING;
    };
    const ytdCell = kind => {
      if (kind === 'n') return `1至${viewM}月${fmt(ytdN)}件`;
      if (kind === 'lease') return `${fmt(ytdLease)} / ${fmt(ytdN)} = ${natPctTxt(ytdLease, ytdN)}`;
      if (kind === 'weak') return `${fmt(ytdWeak)} / ${fmt(ytdPolicy)} = ${natPctTxt(ytdWeak, ytdPolicy)}`;
      if (kind === 'new') return ytdHasNew ? `${fmt(ytdNew)} / ${fmt(ytdN)} = ${natPctTxt(ytdNew, ytdN)}` : '待確認資料來源';
      if (kind === 'ref') return `${fmt(ytdRef)} / ${fmt(ytdN)} = ${natPctTxt(ytdRef, ytdN)}`;
      if (kind === 'suite') return `${fmt(ytdSuite)} / ${fmt(ytdN)} = ${natPctTxt(ytdSuite, ytdN)}`;
      if (kind === 'fam') return ytdHasFam ? `${fmt(ytdFam)}件` : '待確認資料來源';
      return '待確認資料來源';
    };
    const arrAll = natArrearsOf(name, office);
    const arrCell = (packM, lo, hi) => {
      if (!packM) return '—';
      return natArrearsTxt(natArrearsMonth(arrAll, y, packM, lo, hi));
    };
    const arrYtd = (lo, hi) => {
      const p = natArrearsPack(arrAll, lo, hi);
      if (!ARREARS.length) return '待確認資料來源（催收管理）';
      return `${fmt(p.n)}筆／$${fmt(p.amt)}`;
    };
    const rnCell = (mm, lead) => {
      if (!mm) return '—';
      if (lead) return natRenewTxt(natRenewPack(name, office, y, 1, Math.min(12, mm + 1), mm));
      return natRenewTxt(natRenewPack(name, office, y, mm, mm, mm));
    };
    const rnYtd = lead => {
      if (lead) return natRenewTxt(natRenewPack(name, office, y, 1, Math.min(12, viewM + 1), viewM));
      return natRenewTxt(natRenewPack(name, office, y, 1, viewM, viewM));
    };
    const mLab = m => `${m}月`;
    const tenureTxt = natTenureLong(days);
    const licHtml = lic.n == null
      ? `<div class="v nat-pending">待確認資料來源</div><div class="s">員工資料管理：不動產營業員證號／租賃管理人員證號</div>`
      : `<div class="v">${fmt(lic.n)}<span class="unit"> 張</span></div><div class="s">營業員${fmt(lic.broker)}、租管證${fmt(lic.lease)}</div>`;
    const monthBars = months.map((x, i) => {
      const h = x.n ? Math.max(8, (x.n / maxBar) * 100) : 3;
      const on = i + 1 === viewM ? ' on' : '';
      return `<div class="crab-vcol${on}">
        <div class="crab-vnum">${x.n ? fmt(x.n) : '—'}</div>
        <div class="crab-vpct">${x.n ? natPctTxt(x.mgmt, x.n) : ''}</div>
        <div class="crab-vtrack"><div class="crab-vbar" style="height:${h}%">
          <i class="lease" style="flex:${Math.max(x.n ? x.lease / x.n * 100 : 0, x.lease ? 0.01 : 0.001)}">${x.lease ? fmt(x.lease) : ''}</i>
          <i class="mgmt" style="flex:${Math.max(x.n ? x.mgmt / x.n * 100 : 0, x.mgmt ? 0.01 : 0)}">${x.mgmt ? fmt(x.mgmt) : ''}</i>
        </div></div>
        <div class="crab-vlbl">${i + 1}月</div>
      </div>`;
    }).join('');
    box.innerHTML = `<div class="nat-perf">
      <h4>業務績效表　${esc(name)}</h4>
      <p class="note">${y}年${viewM}月｜${esc(office || '—')}｜年度業績截至${viewM}月</p>
      <div class="rev-board">
        <div class="rev-main">
          <div class="rev-kpis nat-perf-kpis">
            <div class="card kpi"><div class="k">新媒合業績</div><div class="v">${fmt(cur.n)}<span class="unit"> 件</span></div>
              <div class="s">包租${fmt(cur.lease)}／代管${fmt(cur.mgmt)}｜1-${viewM}月${fmt(ytdN)}件</div></div>
            <div class="card kpi"><div class="k">${esc(name)}年資</div>
              ${tenureTxt ? `<div class="v" style="font-size:20px">${esc(tenureTxt)}</div>` : `<div class="v nat-pending">待確認資料來源</div>`}
              <div class="s">${esc(title)}</div></div>
            <div class="card kpi"><div class="k">持有證照數</div>${licHtml}</div>
            <div class="card kpi"><div class="k">檔內有效代管</div><div class="v">${fmt(activeMgmt)}<span class="unit"> 件</span></div>
              <div class="s">依代管，起日≤基準日且已生效</div></div>
          </div>
          <div class="rev-panel">
            <h4>每月新媒合：包租與代管合併</h4>
            <p class="nat-legend"><span><i class="lease"></i>包租</span><span><i class="mgmt"></i>代管</span></p>
            <div class="crab-vbars nat-vbars">${monthBars}</div>
            <p class="note">柱上為當月總件，柱內為包租／代管件數。11月預起租不納入。</p>
          </div>
        </div>
        <div class="rev-side">
          <div class="rev-panel">
            <h4>近3個月關鍵數字與今年度說明</h4>
        <div class="table-scroll"><table class="type-tbl ana-tbl"><thead><tr>
          <th>項目</th><th>${m2 ? mLab(viewM - 2) : '—'}</th><th>${m1 ? mLab(viewM - 1) : '—'}</th><th>${mLab(viewM)}</th><th>今年度成績／說明</th>
        </tr></thead><tbody>
          <tr><td>新媒合件數</td><td>${cell(m2, 'n')}</td><td>${cell(m1, 'n')}</td><td>${cell(cur, 'n')}</td><td>${ytdCell('n')}</td></tr>
          <tr><td>包租率</td><td>${cell(m2, 'lease')}</td><td>${cell(m1, 'lease')}</td><td>${cell(cur, 'lease')}</td><td>${ytdCell('lease')}</td></tr>
          <tr><td>政策戶比</td><td>${cell(m2, 'weak')}</td><td>${cell(m1, 'weak')}</td><td>${cell(cur, 'weak')}</td><td>${ytdCell('weak')}</td></tr>
          <tr><td>新件率</td><td>${cell(m2, 'new')}</td><td>${cell(m1, 'new')}</td><td>${cell(cur, 'new')}</td><td>${ytdCell('new')}</td></tr>
          <tr><td>轉介比</td><td>${cell(m2, 'ref')}</td><td>${cell(m1, 'ref')}</td><td>${cell(cur, 'ref')}</td><td>${ytdCell('ref')}</td></tr>
          <tr><td>套房比</td><td>${cell(m2, 'suite')}</td><td>${cell(m1, 'suite')}</td><td>${cell(cur, 'suite')}</td><td>${ytdCell('suite')}</td></tr>
          <tr><td>婚育件數</td><td>${cell(m2, 'fam')}</td><td>${cell(m1, 'fam')}</td><td>${cell(cur, 'fam')}</td><td>${ytdCell('fam')}</td></tr>
          <tr><td>續約率</td><td>${rnCell(m2 && (viewM - 2), false)}</td><td>${rnCell(m1 && (viewM - 1), false)}</td><td>${rnCell(viewM, false)}</td><td>${rnYtd(false)}</td></tr>
          <tr><td>領先續約率</td><td>${rnCell(m2 && (viewM - 2), true)}</td><td>${rnCell(m1 && (viewM - 1), true)}</td><td>${rnCell(viewM, true)}</td><td>${rnYtd(true)}</td></tr>
          <tr><td>應收／欠租30天以上</td><td>${arrCell(m2 && (viewM - 2), 30, null)}</td><td>${arrCell(m1 && (viewM - 1), 30, null)}</td><td>${arrCell(viewM, 30, null)}</td><td>${arrYtd(30, null)}</td></tr>
          <tr><td>應收／欠租15-29天</td><td>${arrCell(m2 && (viewM - 2), 15, 29)}</td><td>${arrCell(m1 && (viewM - 1), 15, 29)}</td><td>${arrCell(viewM, 15, 29)}</td><td>${arrYtd(15, 29)}</td></tr>
          <tr><td>記過／重大缺失</td><td>${NAT_PENDING}</td><td>${NAT_PENDING}</td><td>${NAT_PENDING}</td><td>待確認資料來源</td></tr>
        </tbody></table></div>
        <p class="note">包租率＝包租件／新媒合；政策戶比＝（轉租＋代管中第一類＋第二類）／（轉租＋代管）；包租未轉租不列入。新件率＝新件（是否帶租約＝新件且不含包租）／新媒合；轉介比＝來源含轉介紹／新媒合；套房比＝房屋類型含套房／新媒合。婚育＝新婚家庭＋育兒家庭。續約率＝（已續約＋包租有效）／（應續約＋包租應存續）；領先1M 為查詢月底往後1個月的12個月窗。應收＝催收查詢列筆數／欠款合計。</p>
          </div>
        </div>
      </div>
      <div class="rev-mid" style="margin-top:10px">
        <div class="rev-panel">
          <h4>排名、月均與未產件提醒</h4>
          <p>${esc(`本月屬${me ? me.band : '—'}（依目前全台分組）；${office || '—'}第${offRank}名／${fmt(offN)}位。`)}</p>
          <p>${esc(`全台第${natRank}名／${fmt(natN)}位；占公司本期${share}%。`)}</p>
          <p>${esc(`到職月至今月${avg.toFixed(1)}件 = ${fmt(ytdN)}件÷${fmt(calMonths)}個日曆月。`)}</p>
          <p>${esc(`完整月份連續未產件：${fmt(streak)}個月；未滿到職月及當月不作定案。`)}</p>
        </div>
        <div class="rev-panel">
          <h4>指標定義（尚未串接者先標示）</h4>
          <p>年資依員工資料管理「報到日期」。證照依不動產營業員證號、租賃管理人員證號（有證號即計1張，先不看到期日）。</p>
          <p>續約：續約明細管理。應續約＝轉租或代管、剔除已停用／暫存、迄日落在統計期間。已續約＝應續約中狀態含已生效／複審／產編（查詢當下）。包租應存續＝包租第1／2週年日落在期間且早於迄日，週年日前已有解約日者不計入。包租有效再依解約日。歸屬代管營業處。領先1M例：2026/10 的統計期間為 2025/12/1～2026/11/30。</p>
          <p>應收：催收管理＞催收查詢。檔內有效代管＝代管且已生效、租約起日≤基準日、迄日未過；解約日落在查詢月當月仍計有效。</p>
        </div>
      </div>
    </div>`;
  }
  function renderSalesRanks() {
    const box = $('natDash');
    if (!box) return;
    const grain = state.salesNatGrain || 'month';
    if ($('salesNatSeg')) $('salesNatSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === grain));
    const { start, end } = salesRankRange(grain);
    const span = grain === 'year' ? (end.getMonth() - start.getMonth() + 1) : 1;
    const rows = uniqueById(ROWS.filter(r => passFilters(r) && isPerf(r) && startIn(r, start, end) && NEW_CHILDREN.includes(r.ft)));
    const firstSeen = natFirstSeen();
    const asOf = end;
    const map = new Map();
    const co = { n: 0, lease: 0, mgmt: 0, crab: 0 };
    rows.forEach(r => {
      const name = r.sl || '—';
      const office = crabNormSo(r.so);
      if (natIsCo(name)) {
        co.n += 1;
        if (String(r.ct || '').includes('包租')) co.lease += 1;
        if (String(r.ct || '').includes('代管')) co.mgmt += 1;
        if (isCrabFt(r)) co.crab += 1;
        return;
      }
      const key = name + '\t' + office;
      if (!map.has(key)) map.set(key, { name, office, n: 0, lease: 0, mgmt: 0, crab: 0, non: 0, done: 0, rows: [] });
      const p = map.get(key);
      p.n += 1;
      p.rows.push(r);
      if (String(r.ct || '').includes('包租')) p.lease += 1;
      if (String(r.ct || '').includes('代管')) p.mgmt += 1;
      if (isCrabFt(r)) p.crab += 1; else p.non += 1;
      if (/已生效/.test(r.st || '')) p.done += 1;
    });
    const people = [...map.values()].map(p => {
      const first = firstSeen.get(p.name);
      const days = first ? Math.round((asOf - first) / 86400000) + 1 : null;
      return { ...p, days, tenure: natTenure(days), band: natBand(p.n, span), region: natRegionOf(p.office) };
    }).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'zh-Hant'));
    let rk = 0, prevN = null;
    people.forEach((p, i) => {
      if (prevN == null || p.n !== prevN) rk = i + 1;
      prevN = p.n;
      p.rank = rk;
    });
    staffPeople.nat = people;
    const bandSel = state.natBand || 'all';
    if ($('natBandSel')) $('natBandSel').value = bandSel;
    const total = rows.length;
    const leaseN = rows.filter(r => String(r.ct || '').includes('包租')).length;
    const mgmtN = rows.filter(r => String(r.ct || '').includes('代管')).length;
    const crabN = rows.filter(isCrabFt).length;
    const front = people.filter(p => p.band === '前段');
    const mid = people.filter(p => p.band === '中段');
    const back = people.filter(p => p.band === '後段');
    const salesN = people.length;
    const sumN = arr => arr.reduce((s, p) => s + p.n, 0);
    const avgN = arr => arr.length ? sumN(arr) / arr.length : 0;
    const frontN = sumN(front), midN = sumN(mid), backN = sumN(back);
    const top = people[0];
    const low = people.filter(p => p.n === 1);
    const staffSales = STAFF.filter(s => s.status === 'NORMAL' && String(s.title) === '60');
    const named = new Set(people.map(p => p.name));
    const zero = staffSales.filter(s => !named.has(s.name) && (!selectedOffices() || selectedOffices().has(s.officeName)));
    const hi = 10 * span, midLo = 5 * span, backHi = 5 * span - 1;
    const mLab = grain === 'year' ? `1–${end.getMonth() + 1}月` : `${end.getMonth() + 1}月`;
    if ($('natNote')) $('natNote').textContent = `比較母體：${fmt(salesN)}位業務${fmt(total - co.n)}件${co.n ? ' + 公司名義' + fmt(co.n) + '件' : ''}，共${fmt(total)}件｜前段≥${hi}件、中段${midLo}至${hi - 1}件、後段1至${backHi}件｜依${mLab}件數分組`;
    const bandRow = (name, gate, arr, n) => `<tr data-nat-band="${name}" class="${bandSel === name ? 'band-on' : ''}">
      <td>${name}</td><td>${gate}</td><td>${fmt(arr.length)}</td>
      <td>${salesN ? ((arr.length / salesN) * 100).toFixed(1) : '0.0'}%</td>
      <td>${fmt(n)}</td><td>${total ? ((n / total) * 100).toFixed(1) : '0.0'}%</td>
      <td>${arr.length ? avgN(arr).toFixed(2) + '件' : '—'}</td>
    </tr>`;
    const viewPeopleAll = bandSel === 'all' ? people : people.filter(p => p.band === bandSel);
    const viewRows = bandSel === 'all' ? rows : viewPeopleAll.flatMap(p => p.rows);
    const viewTotal = viewRows.length;
    const viewLease = viewRows.filter(r => String(r.ct || '').includes('包租')).length;
    const viewMgmt = viewRows.filter(r => String(r.ct || '').includes('代管')).length;
    const viewCrab = viewRows.filter(isCrabFt).length;
    const viewSalesN = viewPeopleAll.length;
    const viewCo = bandSel === 'all' ? co : { n: 0, lease: 0, mgmt: 0, crab: 0 };
    const sortKeyMap = { rank: 'rank', n: 'n', name: 'name', office: 'office', days: 'days', lease: 'lease', mgmt: 'mgmt', band: 'band' };
    const sortKey = sortKeyMap[state.natTblSort] || 'n';
    const viewPeople = sortStaffPeople(viewPeopleAll.slice(), sortKey, state.natTblDir || 'desc');
    const natTh = (key, label) => `<th data-nat-sort="${key}" class="${state.natTblSort === key ? 'sort-on' : ''}">${label}</th>`;
    const rankRows = viewPeople.map(p => {
      const w = p.n ? 100 : 0;
      const pick = state.natPerson === p.name && state.natOffice === p.office ? ' pick' : '';
      return `<tr class="${pick}">
        <td>${p.rank}</td>
        <td class="name-hit" data-nat-person="${esc(p.name)}" data-nat-office="${esc(p.office)}">${esc(p.name)}</td>
        <td>${esc(p.office)}</td><td>${esc(p.tenure)}</td>
        <td><div class="nat-stack"><i class="lease" style="width:${p.n ? (p.lease / p.n) * w : 0}%"></i><i class="mgmt" style="width:${p.n ? (p.mgmt / p.n) * w : 0}%"></i></div></td>
        <td>${fmt(p.n)}</td><td>${fmt(p.lease)}</td><td>${fmt(p.mgmt)}</td><td>${p.band}</td>
      </tr>`;
    }).join('');
    const kpiTotal = viewTotal;
    const kpiSales = viewSalesN;
    const kpiLease = viewLease;
    const kpiMgmt = viewMgmt;
    const kpiCrab = viewCrab;
    const viewTop = viewPeopleAll.slice().sort((a, b) => b.n - a.n)[0];
    const viewLow = viewPeopleAll.filter(p => p.n === 1);
    const viewFront = viewPeopleAll.filter(p => p.band === '前段');
    const viewMid = viewPeopleAll.filter(p => p.band === '中段');
    const viewBack = viewPeopleAll.filter(p => p.band === '後段');
    const sumView = arr => arr.reduce((s, p) => s + p.n, 0);
    const regionOrder = [...Object.keys(REGIONS), '電服部', '業務支援管理部'];
    const regionMap = new Map();
    viewPeopleAll.forEach(p => {
      if (!regionMap.has(p.region)) regionMap.set(p.region, { name: p.region, n: 0, people: 0, front: 0, mid: 0, back: 0 });
      const o = regionMap.get(p.region);
      o.n += p.n; o.people += 1;
      if (p.band === '前段') o.front += 1;
      else if (p.band === '中段') o.mid += 1;
      else if (p.band === '後段') o.back += 1;
    });
    const regions = regionOrder.filter(k => regionMap.has(k)).map(k => regionMap.get(k));
    const maxReg = Math.max(...regions.map(r => r.n), 1);
    const lowBy = new Map();
    viewLow.forEach(p => lowBy.set(p.region, (lowBy.get(p.region) || 0) + 1));
    const lowArr = [...lowBy.entries()].sort((a, b) => b[1] - a[1]);
    const newStaff = viewPeopleAll.filter(p => p.days != null && p.days >= 1 && p.days <= 180);
    const bucket = (a, b) => newStaff.filter(p => p.days >= a && p.days <= b);
    const b1 = bucket(1, 30), b2 = bucket(31, 90), b3 = bucket(91, 180);
    const newZero = zero.length;
    const next = newStaff.filter(p => p.non >= 2 && p.non <= 3).sort((a, b) => b.non - a.non || a.days - b.days).slice(0, 12);
    const frontShare = total ? frontN / total * 100 : 0;
    const frontMidP = salesN ? (front.length + mid.length) / salesN * 100 : 0;
    const bandDist = [
      { id: '前段', n: frontN, color: '#1e4a7a' },
      { id: '中段', n: midN, color: '#6d9fc8' },
      { id: '後段', n: backN, color: '#93c5fd' }
    ];
    const maxBand = Math.max(...bandDist.map(x => x.n), 1);
    box.innerHTML = `
      <div class="rev-board">
        <div class="rev-main">
          <div class="rev-kpis">
            <div class="card kpi"><div class="k">新媒合總量</div><div class="v">${fmt(kpiTotal)}<span class="unit"> 件</span></div><div class="s">含寄居蟹轉銜 ${fmt(kpiCrab)} 件${bandSel !== 'all' ? '｜組別 ' + bandSel : ''}</div></div>
            <div class="card kpi"><div class="k">有業績業務</div><div class="v">${fmt(kpiSales)}<span class="unit"> 位</span></div><div class="s">${viewCo.n ? '另有公司名義' + fmt(viewCo.n) + '件待核，不列人員' : (bandSel === 'all' ? '依目前篩選範圍' : '僅列' + bandSel)}</div></div>
            <div class="card kpi"><div class="k">包租件數</div><div class="v">${fmt(kpiLease)}<span class="unit"> 件</span></div><div class="s">占全部 ${revPct(kpiLease, kpiTotal)}%</div></div>
            <div class="card kpi"><div class="k">代管件數</div><div class="v">${fmt(kpiMgmt)}<span class="unit"> 件</span></div><div class="s">占全部 ${revPct(kpiMgmt, kpiTotal)}%</div></div>
          </div>
          <div class="rev-panel">
            <h4>業績分組結構（前段／中段／後段）</h4>
            <div class="table-scroll"><table class="type-tbl ana-tbl nat-band-tbl"><thead><tr>
              <th>分組</th><th>件數門檻</th><th>人數</th><th>人數占比</th><th>業績件數</th><th>貢獻占比</th><th>平均每人</th>
            </tr></thead><tbody>
              ${bandRow('前段', `${hi}件以上`, front, frontN)}
              ${bandRow('中段', `${midLo}至${hi - 1}件`, mid, midN)}
              ${bandRow('後段', `1至${backHi}件`, back, backN)}
              ${co.n ? `<tr><td>公司名義待核</td><td>不列入人員</td><td>—</td><td>—</td><td>${fmt(co.n)}</td><td>${revPct(co.n, total)}%</td><td>—</td></tr>` : ''}
            </tbody></table></div>
            <div class="rev-dist" style="margin-top:10px">${bandDist.map(x => `
              <span class="lab">${x.id}</span>
              <span class="track"><i style="width:${(x.n / maxBand) * 100}%;background:${x.color}"></i></span>
              <span class="n">${fmt(x.n)}件 / ${revPct(x.n, total)}%</span>`).join('')}</div>
          </div>
          <div class="rev-mid">
            <div class="rev-panel">
              <h4>高貢獻與低件數觀察</h4>
              <p>${esc(viewTop ? `最高：${viewTop.name} ${fmt(viewTop.n)}件，占目前範圍 ${revPct(viewTop.n, kpiTotal)}%。` : '尚無業務件數。')}</p>
              <p>${esc(`前段${fmt(viewFront.length)}人貢獻${revPct(sumView(viewFront), kpiTotal)}%；前中段${fmt(viewFront.length + viewMid.length)}人，占有業績${kpiSales ? ((viewFront.length + viewMid.length) / kpiSales * 100).toFixed(1) : '0.0'}%。`)}</p>
              <p>${esc(`最低有紀錄件數為1件，共${fmt(viewLow.length)}人，占有業績人數${kpiSales ? ((viewLow.length / kpiSales) * 100).toFixed(1) : '0.0'}%。`)}</p>
              <p>${esc(`該${fmt(viewLow.length)}人合計${fmt(sumView(viewLow))}件，占總量${revPct(sumView(viewLow), kpiTotal)}%；無法據此判定能力。`)}</p>
            </div>
            <div class="rev-panel">
              <h4>組別的管理方向</h4>
              <div class="rev-prio-item"><b>01</b><div><div class="t">前段</div><div class="h">辨識轉銜與自行開發，檢視可複製方法。</div></div></div>
              <div class="rev-prio-item"><b>02</b><div><div class="t">中段</div><div class="h">確認接近${hi}件的人員與可推進案件。</div></div></div>
              <div class="rev-prio-item"><b>03</b><div><div class="t">後段</div><div class="h">分看年資、投入時間、來源及待審案件。</div></div></div>
              <div class="rev-prio-item"><b>04</b><div><div class="t">0件</div><div class="h">另需完整在職業務名冊，不以本檔推算。</div></div></div>
            </div>
          </div>
        </div>
        <div class="rev-side">
          <p class="nat-legend"><span><i class="lease"></i>包租</span><span><i class="mgmt"></i>代管</span></p>
          <div class="nat-staff-scroll"><table class="type-tbl ana-tbl nat-staff-tbl"><thead><tr>
            ${natTh('rank', '名次')}${natTh('name', '業務')}${natTh('office', '營業處')}${natTh('days', '年資')}${natTh('n', '件數結構')}${natTh('n', '總數')}${natTh('lease', '包租')}${natTh('mgmt', '代管')}${natTh('band', '組別')}
          </tr></thead><tbody>${rankRows || '<tr><td colspan="9">無資料</td></tr>'}</tbody></table></div>
        </div>
      </div>
      <div class="rev-board">
        <div class="rev-main">
          <div class="rev-panel">
            <h4>區域貢獻（與人數結構一起看）</h4>
            <div class="rev-dist">${regions.map(r => `
              <span class="lab">${esc(r.name)}</span>
              <span class="track"><i style="width:${(r.n / maxReg) * 100}%;background:#1e4a7a"></i></span>
              <span class="n">${fmt(r.n)}件 / ${revPct(r.n, kpiTotal)}%</span>`).join('')}</div>
          </div>
          <div class="rev-mid">
            <div class="rev-panel">
              <h4>最低件數群的分布（每人1件）</h4>
              ${lowArr.map(([k, n]) => `<p>${esc(k)}：${fmt(n)}人，占1件群${viewLow.length ? ((n / viewLow.length) * 100).toFixed(1) : '0.0'}%</p>`).join('') || '<p>目前沒有1件業務。</p>'}
            </div>
            <div class="rev-panel">
              <h4>培育觀察原則</h4>
              <p>先看非轉銜量，避免把公會／電服派入案件全視為新人自行開發能力。</p>
              <p>已生效不等於一次通過；不把短期件數直接年化。</p>
              <p>${esc(`目前範圍${fmt(kpiSales)}位有業績者與首案180天內新進，不是同一個人數分母。`)}</p>
            </div>
          </div>
        </div>
        <div class="rev-side">
          <div class="table-scroll"><table class="type-tbl ana-tbl"><thead><tr>
            <th>區域／部門</th><th>業務人數</th><th>前段</th><th>中段</th><th>後段</th><th>總件數</th><th>人均件</th><th>全台貢獻</th>
          </tr></thead><tbody>
            ${regions.map(r => `<tr>
              <td>${esc(r.name)}</td><td>${fmt(r.people)}</td><td>${fmt(r.front)}</td><td>${fmt(r.mid)}</td><td>${fmt(r.back)}</td>
              <td>${fmt(r.n)}</td><td>${r.people ? (r.n / r.people).toFixed(2) : '—'}</td><td>${revPct(r.n, kpiTotal)}%</td>
            </tr>`).join('')}
            ${viewCo.n ? `<tr><td>公司名義待核</td><td>0</td><td>0</td><td>0</td><td>0</td><td>${fmt(viewCo.n)}</td><td>—</td><td>${revPct(viewCo.n, kpiTotal)}%</td></tr>` : ''}
          </tbody></table></div>
        </div>
      </div>
      <div class="rev-board">
        <div class="rev-main">
          <div class="rev-kpis">
            <div class="card kpi"><div class="k">符合定義新進業務</div><div class="v">${fmt(newStaff.length)}<span class="unit"> 位</span></div><div class="s">首案1至180天｜職稱業務</div></div>
            <div class="card kpi"><div class="k">有${mLab}新媒合紀錄</div><div class="v">${fmt(newStaff.filter(p => p.n).length)}<span class="unit"> 位</span></div><div class="s">占新進 ${newStaff.length ? ((newStaff.filter(p => p.n).length / newStaff.length) * 100).toFixed(1) : '0.0'}%</div></div>
            <div class="card kpi"><div class="k">${mLab}無符合條件紀錄</div><div class="v">${fmt(newZero)}<span class="unit"> 位</span></div><div class="s">在職業務名冊本期0件</div></div>
            <div class="card kpi"><div class="k">新進非轉銜案件</div><div class="v">${fmt(newStaff.reduce((s, p) => s + p.non, 0))}<span class="unit"> 件</span></div><div class="s">另有轉銜 ${fmt(newStaff.reduce((s, p) => s + p.crab, 0))} 件</div></div>
          </div>
          <div class="rev-panel">
            <h4>到職天數與${mLab}表現</h4>
            <div class="table-scroll"><table class="type-tbl ana-tbl"><thead><tr>
              <th>到職天數</th><th>在職新進人數</th><th>有業績人數</th><th>有業績占比</th><th>非轉銜件數</th><th>非轉銜已生效</th>
            </tr></thead><tbody>
              ${[[b1, '1至30天'], [b2, '31至90天'], [b3, '91至180天']].map(([arr, lab]) => `<tr>
                <td>${lab}</td><td>${fmt(arr.length)}</td><td>${fmt(arr.filter(p => p.n).length)}</td>
                <td>${arr.length ? ((arr.filter(p => p.n).length / arr.length) * 100).toFixed(1) : '0.0'}%</td>
                <td>${fmt(arr.reduce((s, p) => s + p.non, 0))}</td>
                <td>${fmt(arr.reduce((s, p) => s + p.done, 0))}</td>
              </tr>`).join('')}
              <tr><td>合計</td><td>${fmt(newStaff.length)}</td><td>${fmt(newStaff.filter(p => p.n).length)}</td>
                <td>${newStaff.length ? ((newStaff.filter(p => p.n).length / newStaff.length) * 100).toFixed(1) : '0.0'}%</td>
                <td>${fmt(newStaff.reduce((s, p) => s + p.non, 0))}</td>
                <td>${fmt(newStaff.reduce((s, p) => s + p.done, 0))}</td></tr>
            </tbody></table></div>
          </div>
          <div class="rev-mid">
            <div class="rev-panel">
              <h4>0件新人的輔導盤點</h4>
              <p>${esc(`在職業務名冊中，本期無新媒合紀錄${fmt(newZero)}人。`)}</p>
              <p>先確認到職日、是否承辦其他案件與有無帶教。</p>
              <p>每位安排首案目標及每週跟進，勿直接列為後段績差。</p>
            </div>
            <div class="rev-panel">
              <h4>建議30天培育追蹤欄位</h4>
              <p>人選、師傅、開發來源、本人實際承辦程度。</p>
              <p>新接續／帶看／簽約件數、非轉銜新媒合。</p>
              <p>首次送件通過情形、缺失類型及補件完成日。</p>
              <p>主管每週盤點；第30天檢視持續產出與品質。</p>
            </div>
          </div>
        </div>
        <div class="rev-side">
          <div class="rev-panel">
            <h4>次梯隊、首案輔導與追蹤安排</h4>
            <p class="note">補足0件新人觀察｜不以年資推定能力或離職風險</p>
            <div class="table-scroll"><table class="type-tbl ana-tbl nat-next-tbl"><thead><tr>
              <th>觀察人選</th><th>營業處</th><th>到職天數</th><th>非轉銜</th><th>轉銜</th><th>非轉銜已生效</th>
            </tr></thead><tbody>
              ${next.map(p => `<tr>
                <td class="name-hit" data-nat-next="${esc(p.name)}" data-nat-office="${esc(p.office)}">${esc(p.name)}</td>
                <td>${esc(p.office)}</td><td>${fmt(p.days)}</td>
                <td>${fmt(p.non)}</td><td>${fmt(p.crab)}</td><td>${fmt(p.done)}</td>
              </tr>`).join('') || '<tr><td colspan="6">目前沒有2至3件非轉銜的新進觀察人選</td></tr>'}
            </tbody></table></div>
            ${staffCasePanel('nat')}
          </div>
        </div>
      </div>
      <p class="note foot-note">年資以本公司系統首案日推估，無法判斷是否為轉職資深業務。分母：人數占比÷${fmt(salesN)}，貢獻占比÷${fmt(total)}。後段為1至${backHi}件，5件列入中段。</p>`;
  }

  function renderLeaseDash(kind) {
    kind = dashKind(kind);
    const page = dashPage(kind);
    if (!$(page) || $(page).classList.contains('hidden')) return;
    const paintKey = filterSig() + '|' + iso(state.start) + '|' + iso(state.end);
    if (dashPaint[kind] === paintKey) return;
    const job = ++dashJob;
    const lab = dashLab(kind);
    const thisRows = leaseNewRows(state.start, state.end, null, kind);
    const lastStart = monthStart(addMonths(state.start, -1));
    const lastRows = leaseNewRows(lastStart, monthEnd(lastStart), null, kind);
    const yoyRows = leaseNewRows(
      new Date(state.start.getFullYear() - 1, state.start.getMonth(), state.start.getDate()),
      new Date(state.end.getFullYear() - 1, state.end.getMonth(), state.end.getDate()),
      null, kind
    );
    const thisS = dashShare(thisRows, kind);
    const lastS = dashShare(lastRows, kind);
    const yoyS = dashShare(yoyRows, kind);
    const yr3 = thisRows.filter(r => isMgmtCt(r) && isThreeYearTerm(r)).length;
    const typeShort = leaseTypeShort() || '新媒合';
    const tgt = dashTarget(kind);
    const gapPp = (thisS.rate - tgt) * 100;
    const yoyPp = (thisS.rate - yoyS.rate) * 100;
    const lastPp = (thisS.rate - lastS.rate) * 100;
    const p = Math.max(0, Math.min(100, thisS.rate * 100));
    const pp = (n) => `<span class="${n < 0 ? 'neg' : ''}">${n > 0 ? '+' : ''}${n.toFixed(1)}%</span>`;
    const crabN = kind === 'weak'
      ? thisRows.filter(r => isWeakId(r) && isCrabFt(r)).length
      : thisRows.filter(r => isLeaseCt(r) && isCrabFt(r)).length;
    const crabLab = kind === 'weak' ? '寄居蟹政策戶' : '寄居蟹包租';
    const mixLine = kind === 'weak'
      ? `第一類${fmt(thisS.w1 || 0)}件，第二類${fmt(thisS.w2 || 0)}件，一般戶${fmt(thisS.mgmt)}件`
      : kind === 'new'
        ? '有效租約數'
        : `包租${fmt(thisS.lease)}件，代管${fmt(thisS.mgmt)}件`;
    const pieceSub = kind === 'new'
      ? '是否帶租約=新件(首次加入社宅案件)'
      : `${crabLab}${fmt(crabN)}件，占${rateTxt(crabN, thisS.lease, 0)}`;
    const pieceTitle = kind === 'weak' ? '政策戶件數' : kind === 'new' ? '新件件數' : '包租件數';
    const rateCard = `
      <div class="card kpi kpi-rate">
        <div class="main">
          <div class="k">${lab.rate}</div>
          <div class="v">${(thisS.rate * 100).toFixed(2)}<span class="unit"> %</span></div>
          <div class="s">目標${dashTgtLabel(kind)}　差異 ${pp(gapPp)}</div>
        </div>
        <div class="rate-bar" style="--p:${p}%"><span>${p.toFixed(1)}%</span></div>
      </div>
      <div class="card kpi">
        <div class="k">${lab.peer}</div>
        <div class="v">${(yoyS.rate * 100).toFixed(2)}<span class="unit"> %</span></div>
        <div class="s">同期比差異 ${pp(yoyPp)}</div>
      </div>
      <div class="card kpi">
        <div class="k">${lab.last}</div>
        <div class="v">${(lastS.rate * 100).toFixed(2)}<span class="unit"> %</span></div>
        <div class="s">上月比差異 ${pp(lastPp)}</div>
      </div>`;
    const yr3Card = kind === 'weak' || kind === 'new' ? '' : `
      <div class="card kpi">
        <div class="k">簽三年代管件數</div>
        <div class="v">${fmt(yr3)}<span class="unit"> 件</span></div>
        <div class="s">占總件數${rateTxt(yr3, thisS.n, 1)}</div>
      </div>`;
    $d(kind, 'KpiRow').innerHTML = `
      <div class="card kpi">
        <div class="k">${esc(typeShort)}總件數</div>
        <div class="v">${fmt(thisS.n)}<span class="unit"> 件</span></div>
        <div class="s">${mixLine}</div>
      </div>
      <div class="card kpi">
        <div class="k">${esc(typeShort)}${pieceTitle}</div>
        <div class="v">${fmt(thisS.lease)}<span class="unit"> 件</span></div>
        <div class="s">${pieceSub}</div>
      </div>
      ${rateCard}${yr3Card}`;
    const steps = [
      () => {
        if (kind === 'lease') { renderLzGrowAnalysis(); renderCityRateGrow('lease'); }
        else if (kind === 'weak') { renderWkGrowAnalysis(); renderCityRateGrow('weak'); }
        else { renderNwGrowAnalysis(); renderCityRateGrow('new'); }
      },
      () => {
        renderLeaseTrend(kind);
        renderLeaseRank(thisRows, kind);
        renderLeaseMonth(kind);
        renderLeaseMap(thisRows, kind);
      },
      () => {
        renderLeaseCmp(kind);
        renderLeaseType(kind);
        renderLeaseReview(kind);
        dashPaint[kind] = paintKey;
      }
    ];
    let si = 0;
    const tick = () => {
      if (job !== dashJob) return;
      steps[si++]();
      if (si < steps.length) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  function leaseMonthShare(year, month, kind) {
    return dashShare(leaseNewRows(new Date(year, month - 1, 1), monthEnd(new Date(year, month - 1, 1)), null, kind), kind);
  }
  function leaseYtdShare(year, throughM, kind) {
    return dashShare(leaseNewRows(new Date(year, 0, 1), monthEnd(new Date(year, throughM - 1, 1)), null, kind), kind);
  }
  function renderLeaseTrend(kind) {
    kind = dashKind(kind);
    const pfx = dashPrefix(kind);
    const lab = dashLab(kind);
    const year = state.end.getFullYear();
    const g = state[pfx + 'TrendGrain'] || 'month';
    const lastFull = lastCompleteMonth(now).end;
    const last3 = [1, 2, 3].map(n => {
      const d = new Date(lastFull.getFullYear(), lastFull.getMonth() - n + 1, 1);
      return dashShare(leaseNewRows(monthStart(d), monthEnd(d), null, kind), kind).rate * 100;
    });
    const pred = last3.reduce((a, b) => a + b, 0) / 3;
    const curM = now.getMonth();
    const pctLabel = {
      id: pfx + 'PtLabels',
      afterDatasetsDraw(chart) {
        const { ctx, chartArea } = chart;
        const legendBottom = chart.legend && Number.isFinite(chart.legend.bottom) ? chart.legend.bottom : (chartArea ? chartArea.top : 0);
        const em = 12;
        chart.data.datasets.forEach((ds, di) => {
          const meta = chart.getDatasetMeta(di);
          if (!meta.visible) return;
          const isPred = ds.label === '預測值';
          meta.data.forEach((pt, i) => {
            const v = ds.data[i];
            if (v == null || !pt) return;
            let below = isPred;
            let y = below ? pt.y + em : pt.y - em;
            if (!below && y < legendBottom + em) {
              below = true;
              y = pt.y + em;
            }
            if (y < legendBottom + em) return;
            ctx.save();
            ctx.fillStyle = ds.borderColor || '#334155';
            ctx.font = '10px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = below ? 'top' : 'bottom';
            ctx.fillText(Number(v).toFixed(1), pt.x, y);
            ctx.restore();
          });
        });
      }
    };
    const tideFill = (ctx) => {
      const { chart } = ctx;
      const area = chart && chart.chartArea;
      if (!area) return 'rgba(59,130,246,0.18)';
      const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
      g.addColorStop(0, 'rgba(37,99,235,0.42)');
      g.addColorStop(0.45, 'rgba(96,165,250,0.22)');
      g.addColorStop(1, 'rgba(191,219,254,0.04)');
      return g;
    };
    const lineOpt = (label, data, color, dash, tide) => ({
      label, data, borderColor: color,
      backgroundColor: tide ? tideFill : '#fff',
      tension: .35, pointRadius: 4, fill: tide ? 'origin' : false, spanGaps: true,
      borderDash: dash || [], borderWidth: 2.75,
      pointBackgroundColor: '#fff', pointBorderColor: color, pointBorderWidth: 2
    });
    const cleanOpts = {
      plugins: {
        filler: { propagate: false },
        legend: {
          display: true, position: 'top', align: 'end',
          labels: { usePointStyle: true, pointStyle: 'line', boxWidth: 18, boxHeight: 6, padding: 4, font: { family: 'Arial', size: 11 }, color: '#64748b' }
        }
      },
      clip: false,
      layout: { padding: { top: 4, right: 8, left: 4, bottom: 2 } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'Arial', size: 11 }, color: '#94a3b8' }, border: { display: false } },
        y: kind === 'lease'
          ? { min: 0, max: 70, grid: { color: '#f1f5f9' }, ticks: { callback: v => v + '%', font: { family: 'Arial', size: 10 }, color: '#94a3b8' }, border: { display: false } }
          : { grid: { color: '#f1f5f9' }, ticks: { stepSize: 10, callback: v => v + '%', font: { family: 'Arial', size: 10 }, color: '#94a3b8' }, border: { display: false } }
      }
    };
    const rateOf = rows => dashShare(rows, kind).rate * 100;
    if (g === 'day' || g === 'week') {
      const buckets = [];
      if (g === 'day') {
        for (let d = new Date(state.start); d <= state.end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
          buckets.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, s: new Date(d), e: new Date(d) });
        }
      } else {
        let cur = new Date(state.start);
        cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() - cur.getDay());
        let n = 1;
        while (cur <= state.end) {
          const s = new Date(Math.max(cur, state.start));
          const wEnd = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 6);
          const e = wEnd < state.end ? wEnd : new Date(state.end);
          buckets.push({ label: 'W' + n, s, e });
          cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 7);
          n += 1;
        }
      }
      const actual = buckets.map(b => rateOf(leaseNewRows(b.s, b.e, null, kind)));
      const yoy = buckets.map(b => rateOf(leaseNewRows(new Date(b.s.getFullYear() - 1, b.s.getMonth(), b.s.getDate()), new Date(b.e.getFullYear() - 1, b.e.getMonth(), b.e.getDate()), null, kind)));
      const target = buckets.map(() => dashTarget(kind) * 100);
      if ($d(kind, 'TrendTitle')) $d(kind, 'TrendTitle').textContent = `${leaseTypeShort() || leaseTypeFull()} ${lab.trend}`;
      $d(kind, 'TrendNote').textContent = (g === 'day' ? '逐日' : '週別') + lab.rate + '：' + lab.note + '目標線固定 ' + dashTgtLabel(kind) + '。';
      upsert(pfx + 'ChartTrend', 'line', buckets.map(b => b.label), [
        lineOpt('目標', target, C_TARGET),
        lineOpt('本年實績', actual, C_ACTUAL, null, true),
        lineOpt('去年同期', yoy, C_YOY)
      ], cleanOpts, [pctLabel]);
      return;
    }
    const labels = Array.from({ length: 12 }, (_, i) => (i + 1) + '月');
    const monthly = labels.map((_, i) => leaseMonthShare(year, i + 1, kind));
    const yoyM = labels.map((_, i) => leaseMonthShare(year - 1, i + 1, kind));
    const actual = monthly.map((s, i) => i <= curM ? s.rate * 100 : null);
    const yoy = yoyM.map(s => s.rate * 100);
    const target = labels.map(() => dashTarget(kind) * 100);
    const useCum = g === 'year';
    const aData = useCum
      ? labels.map((_, i) => i <= curM ? leaseYtdShare(year, i + 1, kind).rate * 100 : null)
      : actual;
    const yData = useCum ? labels.map((_, i) => leaseYtdShare(year - 1, i + 1, kind).rate * 100) : yoy;
    const fData = useCum
      ? labels.map((_, i) => i < curM ? null : (i === curM ? aData[curM] : pred))
      : labels.map((_, i) => {
          if (i < curM) return null;
          if (i === curM) return actual[i];
          return pred;
        });
    if ($d(kind, 'TrendTitle')) $d(kind, 'TrendTitle').textContent = `${leaseTypeShort() || leaseTypeFull()} ${lab.trend}`;
    $d(kind, 'TrendNote').textContent = (useCum ? '年度累計' : '月別趨勢') +
      '：' + lab.note + '目標線固定 ' + dashTgtLabel(kind) + '。實績至本月，之後以近 3 個完整月均值推估。';
    upsert(pfx + 'ChartTrend', 'line', labels, [
      lineOpt('目標', target, C_TARGET),
      lineOpt('本年各月實績', aData, C_ACTUAL, null, true),
      lineOpt('預測值', fData, C_ACTUAL, [8, 6]),
      lineOpt('去年同期', yData, C_YOY)
    ], cleanOpts, [pctLabel]);
  }
  function renderLeaseRank(rows, kind) {
    kind = dashKind(kind);
    const lab = dashLab(kind);
    if ($d(kind, 'RankTitle')) $d(kind, 'RankTitle').textContent = lab.rank;
    if ($d(kind, 'RankNote')) $d(kind, 'RankNote').textContent = `依篩選單位轄下營業處${lab.rate}排名`;
    const map = {};
    (rows || []).forEach(r => {
      if (!(SALES_OFFICES.includes(r.so) || !selectedOffices())) return;
      if (!map[r.so]) map[r.so] = [];
      map[r.so].push(r);
    });
    const arr = Object.entries(map).map(([so, rows]) => {
      const s = dashShare(rows, kind);
      return [so, s.rate, s.n, s.lease];
    }).sort((a, b) => b[1] - a[1] || b[3] - a[3] || a[0].localeCompare(b[0], 'zh-Hant'));
    const max = Math.max(...arr.map(x => x[1]), 0.01);
    const hi = kind === 'new' ? 0.9 : 0.5;
    const lo = kind === 'new' ? 0.7 : 0.3;
    $d(kind, 'RankList').innerHTML = arr.map((x, i) => rankRowHtml(i, x[0], (x[1] / max) * 100, (x[1] * 100).toFixed(1) + '%', rankToneRate(x[1], hi, lo))).join('')
      || '<div class="empty">無符合條件的資料</div>';
  }
  function renderLeaseMonth(kind) {
    kind = dashKind(kind);
    const lab = dashLab(kind);
    const year = state.end.getFullYear();
    const cur = now.getMonth();
    const ytd = cur + 1;
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const pack = months.map(m => {
      const s = leaseMonthShare(year, m, kind);
      const yoy = leaseMonthShare(year - 1, m, kind);
      const prev = m === 1 ? leaseMonthShare(year - 1, 12, kind) : leaseMonthShare(year, m - 1, kind);
      return { s, yoy, prev };
    });
    const ytdS = leaseYtdShare(year, ytd, kind);
    const yrS = leaseYtdShare(year, 12, kind);
    const ytdY = leaseYtdShare(year - 1, ytd, kind);
    const yrY = leaseYtdShare(year - 1, 12, kind);
    const dpp = (a, b) => {
      const n = (a - b) * 100;
      return `<td${n < 0 ? ' class="neg"' : ''}>${n > 0 ? '+' : ''}${n.toFixed(1)}</td>`;
    };
    const curS = pack[cur].s;
    const typeLab = leaseTypeFull();
    if ($d(kind, 'MonthTitle')) $d(kind, 'MonthTitle').textContent = `${typeLab} ${lab.month}`;
    $d(kind, 'MonthNote').textContent =
      `${cur + 1}月${lab.rate} ${rateTxt(curS.lease, curS.n, 1)}（${fmt(curS.lease)}／${fmt(curS.n)}），目標 ${dashTgtLabel(kind)}，差異 ${((curS.rate - dashTarget(kind)) * 100).toFixed(1)}%。`;
    const col = (fn) => months.map((_, i) => fn(pack[i], i)).join('');
    const pieceLab = kind === 'new' ? '新件' : lab.piece.replace('件', '');
    const genRow = kind === 'new' ? '' : `<tr><td class="item">${lab.gen.replace('件', '')}</td>${col(p => `<td>${fmt(p.s.mgmt)}</td>`)}<td>${fmt(ytdS.mgmt)}</td><td>${fmt(yrS.mgmt)}</td></tr>`;
    const span = kind === 'new' ? 9 : 10;
    $d(kind, 'MonthTable').innerHTML = `<table class="month-cmp lz-month"><thead><tr><th></th><th>項目</th>${months.map((m, i) => `<th${i === cur ? ' class="cur"' : ''}>${m}月</th>`).join('')}<th>1~${ytd}月</th><th>年度</th></tr></thead><tbody>
      <tr><th rowspan="${span}">${lab.sec}</th><td class="item">總件數</td>${col(p => `<td>${fmt(p.s.n)}</td>`)}<td>${fmt(ytdS.n)}</td><td>${fmt(yrS.n)}</td></tr>
      <tr><td class="item">${esc(pieceLab)}</td>${col(p => `<td>${fmt(p.s.lease)}</td>`)}<td>${fmt(ytdS.lease)}</td><td>${fmt(yrS.lease)}</td></tr>
      ${genRow}
      <tr><td class="item">${lab.tgt}</td>${months.map(() => `<td>${dashTgtPct(kind)}</td>`).join('')}<td>${dashTgtPct(kind)}</td><td>${dashTgtPct(kind)}</td></tr>
      <tr><td class="item">${lab.act}</td>${col(p => `<td>${rateTxt(p.s.lease, p.s.n, 1)}</td>`)}<td>${rateTxt(ytdS.lease, ytdS.n, 1)}</td><td>${rateTxt(yrS.lease, yrS.n, 1)}</td></tr>
      <tr><td class="item">差異%</td>${col(p => dpp(p.s.rate, dashTarget(kind)))}${dpp(ytdS.rate, dashTarget(kind))}${dpp(yrS.rate, dashTarget(kind))}</tr>
      <tr class="lz-split"><td class="item">${lab.yoyR}</td>${col(p => `<td>${rateTxt(p.yoy.lease, p.yoy.n, 1)}</td>`)}<td>${rateTxt(ytdY.lease, ytdY.n, 1)}</td><td>${rateTxt(yrY.lease, yrY.n, 1)}</td></tr>
      <tr><td class="item">同期比</td>${col(p => dpp(p.s.rate, p.yoy.rate))}${dpp(ytdS.rate, ytdY.rate)}${dpp(yrS.rate, yrY.rate)}</tr>
      <tr><td class="item">${lab.lastR}</td>${col(p => `<td>${rateTxt(p.prev.lease, p.prev.n, 1)}</td>`)}${months.slice(0, ytd).length ? `<td>${rateTxt(pack[Math.max(0, ytd - 2)].s.lease, pack[Math.max(0, ytd - 2)].s.n, 1)}</td>` : '<td>—</td>'}<td>—</td></tr>
      <tr><td class="item">差異%</td>${col(p => dpp(p.s.rate, p.prev.rate))}<td>—</td><td>—</td></tr>
    </tbody></table>`;
  }
  function renderLeaseMap(rows, kind) {
    kind = dashKind(kind);
    const lab = dashLab(kind);
    const groups = {};
    (rows || []).forEach(r => {
      const city = normCity(r.city);
      if (!city) return;
      if (!groups[city]) groups[city] = [];
      groups[city].push(r);
    });
    const rates = {};
    Object.keys(groups).forEach(city => { rates[city] = dashShare(groups[city], kind); });
    const draw = (features) => {
      features.forEach(f => { if (!rates[f.name]) rates[f.name] = { n: 0, lease: 0, rate: 0 }; });
      const max = Math.max(...features.map(f => (rates[f.name] || {}).rate || 0), 0.01);
      const pts = [];
      features.forEach(f => f.polys.forEach(poly => poly.forEach(ring => ring.forEach(p => pts.push(p)))));
      const lons = pts.map(p => p[0]), lats = pts.map(p => p[1]);
      const minLon = Math.min(...lons), maxLon = Math.max(...lons);
      const minLat = Math.min(...lats), maxLat = Math.max(...lats);
      const pad = 3, targetH = 220;
      const s = (targetH - pad * 2) / (maxLat - minLat);
      const W = Math.ceil((maxLon - minLon) * s + pad * 2);
      const H = targetH;
      const project = ([lon, lat]) => [pad + (lon - minLon) * s, pad + (maxLat - lat) * s];
      const paths = features.map(f => {
        const sh = rates[f.name] || { n: 0, rate: 0 };
        const fill = !sh.n ? '#d7dee8' : mixBlue(0.28 + 0.72 * (sh.rate / max));
        const d = f.polys.map(poly => poly.map(ring => ringPath(ring, project)).join('')).join('');
        return `<path fill="${fill}" fill-rule="evenodd" d="${d}"><title>${f.name} ${rateTxt(sh.lease || 0, sh.n, 1)}</title></path>`;
      }).join('');
      $d(kind, 'Map').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${lab.map}">${paths}</svg>`;
      const ranked = CITIES.map(normCity)
        .map(name => [name, rates[name] || { n: 0, lease: 0, rate: 0 }])
        .sort((a, b) => b[1].rate - a[1].rate || a[0].localeCompare(b[0], 'zh-Hant'));
      $d(kind, 'MapTitle').innerHTML = `${lab.map} <span class="tw-n">｜ ${fmt(CITIES.length)}處</span>`;
      $d(kind, 'Rank').innerHTML = ranked.map((x, i) =>
        `<div class="tw-rank-row"><span class="tw-no">${i + 1}</span><span class="city">${x[0]}</span><span class="cnt">${(x[1].rate * 100).toFixed(1)}%</span></div>`
      ).join('');
    };
    loadTwMap().then(draw).catch(() => { $d(kind, 'Map').innerHTML = '<div class="empty">地圖資料載入失敗</div>'; });
  }
  function cmpTh(kind, key, label, extra) {
    const pfx = dashPrefix(kind);
    const on = (state[pfx + 'CmpSort'] || 'rate') === key ? ' sort-on' : '';
    return `<th data-tbl-sort="${key}" class="${extra || ''}${on}">${label}</th>`;
  }
  function renderLeaseCmp(kind) {
    kind = dashKind(kind);
    const pfx = dashPrefix(kind);
    const lab = dashLab(kind);
    const grain = state[pfx + 'CmpGrain'] || 'month';
    const y = state.end.getFullYear();
    const start = grain === 'year' ? new Date(y, 0, 1) : state.start;
    const end = grain === 'year' ? new Date(y, 11, 31) : state.end;
    const lastStart = addMonths(start, -1), lastEnd = addMonths(end, -1);
    const yoyStart = new Date(start.getFullYear() - 1, start.getMonth(), start.getDate());
    const yoyEnd = new Date(end.getFullYear() - 1, end.getMonth(), end.getDate());
    const open = new Set(state[pfx + 'CmpOpen'] || []);
    const metrics = (id) => {
      const offices = unitOfficeSet(id);
      const nowRows = leaseNewRows(start, end, offices, kind);
      const lastRows = leaseNewRows(lastStart, lastEnd, offices, kind);
      const yoyRows = leaseNewRows(yoyStart, yoyEnd, offices, kind);
      const s = dashShare(nowRows, kind);
      const last = dashShare(lastRows, kind);
      const yoy = dashShare(yoyRows, kind);
      return {
        n: s.n, lease: s.lease, mgmt: s.mgmt, rate: s.rate,
        w1: s.w1 || 0, w2: s.w2 || 0,
        gap: (s.rate - dashTarget(kind)) * 100,
        yoyRate: yoy.rate, lastRate: last.rate,
        yoyPp: (s.rate - yoy.rate) * 100,
        lastPp: (s.rate - last.rate) * 100,
        yr3: nowRows.filter(r => isMgmtCt(r) && isThreeYearTerm(r)).length,
        tgt: dashTarget(kind) * 100
      };
    };
    const decorate = (node) => {
      const kids = (node.kids || []).map(decorate);
      return { ...node, kids, m: metrics(node.id) };
    };
    const ownerOf = (id, name) => LOOKUP.owners[id] || LOOKUP.owners[name] || ownerName(unitOfficeSet(id), name) || '—';
    const root = pruneIdleSalesOffices(decorate(scopedUnitTree()), n => n.m && n.m.n) || decorate(scopedUnitTree());
    const sortKey = state[pfx + 'CmpSort'] || '';
    if (sortKey) sortUnitTree(root, n => (sortKey === 'name' ? n.name : (sortKey === 'owner' ? ownerOf(n.id, n.name) : n.m[sortKey])), state[pfx + 'CmpDir'] || 'desc');
    if (!findUnitNode(root, state[pfx + 'CmpFocus'] || '')) state[pfx + 'CmpFocus'] = root.id;
    const focusId = state[pfx + 'CmpFocus'] || root.id;
    const dpp = v => `<span class="${v < 0 ? 'neg' : ''}">${v > 0 ? '+' : ''}${v.toFixed(1)}%</span>`;
    const bar = rate => `<div class="rate-cell"><span class="rate-mini"><i style="width:${Math.max(0, Math.min(100, rate * 100))}%"></i></span><span class="rate-pct">${(rate * 100).toFixed(1)}%</span></div>`;
    const rows = [];
    const walk = (node, depth) => {
      const hasKids = node.kids && node.kids.length;
      const isOpen = node.id === '__SEL__' || open.has(node.id);
      const pad = 6 + depth * 14;
      const tog = hasKids
        ? `<button type="button" class="unit-tog" data-${pfx}-unit="${node.id}">${isOpen ? '▾' : '▸'}</button>`
        : `<span class="unit-tog-sp"></span>`;
      const m = node.m;
      const on = node.id === focusId ? ' on' : '';
      const genTd = kind === 'new' ? '' : `<td class="col-gen">${fmt(m.mgmt)}</td>`;
      rows.push(`<tr class="${on}" data-${pfx}-cmp-row="${node.id}">
        <td class="left unit-name" style="padding-left:${pad}px">${tog}<span>${node.name}</span></td>
        <td class="left">${ownerOf(node.id, node.name)}</td>
        <td>${fmt(m.n)}</td><td>${fmt(m.lease)}</td>${genTd}
        <td class="col-tgt">${dashTgtPct(kind)}</td>
        <td class="rate-h">${bar(m.rate)}</td>
        <td class="col-diff">${dpp(m.gap)}</td>
        <td>${(m.yoyRate * 100).toFixed(1)}%</td><td>${cmpChg(m.rate, m.yoyRate)}</td>
        <td>${(m.lastRate * 100).toFixed(1)}%</td><td>${cmpChg(m.rate, m.lastRate)}</td>
        ${kind === 'weak' || kind === 'new' ? '' : `<td>${fmt(m.yr3)}</td>`}
      </tr>`);
      if (hasKids && isOpen) node.kids.forEach(k => walk(k, depth + 1));
    };
    walk(root, 0);
    const focusNode = findUnitNode(root, focusId) || root;
    const yoyH = lab.yoyH;
    const lastH = lab.lastH;
    const genTh = kind === 'new' ? '' : cmpTh(kind, 'mgmt', lab.gen, 'col-gen');
    const yr3Th = kind === 'weak' || kind === 'new' ? '' : cmpTh(kind, 'yr3', '簽三年代管件數');
    $d(kind, 'CmpTable').innerHTML = `<table class="unit-cmp lz-cmp lz-kind-${kind}"><thead><tr>
      ${cmpTh(kind, 'name', '單位')}${cmpTh(kind, 'owner', '擔當者')}${cmpTh(kind, 'n', '總件數')}${cmpTh(kind, 'lease', lab.piece)}${genTh}
      ${cmpTh(kind, 'tgt', '目標%', 'col-tgt')}${cmpTh(kind, 'rate', lab.rate, 'rate-h')}${cmpTh(kind, 'gap', '差異%', 'col-diff')}
      ${cmpTh(kind, 'yoyRate', yoyH)}${cmpTh(kind, 'yoyPp', '同期比')}${cmpTh(kind, 'lastRate', lastH)}${cmpTh(kind, 'lastPp', '上月比')}
      ${yr3Th}
    </tr></thead><tbody>${rows.join('')}</tbody></table>`;
    renderLeaseCmpIntel(focusNode, kind);
  }
  function leaseCmpJudgeLines(root, kind) {
    const lab = dashLab(kind);
    const m = root.m || {};
    const name = root.name || '所選單位';
    if (!m.n) return [`${name}在此期間無符合件數。`];
    const pp = v => `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
    const lines = [
      `${name}${lab.rate} ${(m.rate * 100).toFixed(1)}%（${fmt(m.lease)}／${fmt(m.n)}），目標 ${dashTgtLabel(kind)}，差異 ${pp(m.gap)}%。`,
      `去年同期 ${(m.yoyRate * 100).toFixed(1)}%，同期比 ${pp(m.yoyPp)}%。`,
      `上月 ${(m.lastRate * 100).toFixed(1)}%，上月比 ${pp(m.lastPp)}%。`
    ];
    if (kind === 'weak') {
      lines.push(`政策戶中第一類 ${fmt(m.w1)} 件、第二類 ${fmt(m.w2)} 件；一般戶 ${fmt(m.mgmt)} 件。`);
    } else if (kind === 'new') {
      lines.push(`新件 ${fmt(m.lease)} 件（是否帶租約＝新件），分母為轉租＋代管 ${fmt(m.n)} 件；已停用、暫存與包租未列入。`);
    } else {
      lines.push(`包租 ${fmt(m.lease)} 件、代管 ${fmt(m.mgmt)} 件；簽三年代管 ${fmt(m.yr3)} 件。`);
    }
    return lines;
  }
  function leaseCmpClusterLines(root, kind) {
    const lab = dashLab(kind);
    const kids = (root.kids || []).filter(k => k.m && k.m.n);
    if (!kids.length) return ['所選範圍目前沒有可展開的下層單位，依本列數字判讀即可。'];
    const byRate = [...kids].sort((a, b) => b.m.rate - a.m.rate || b.m.n - a.m.n || a.name.localeCompare(b.name, 'zh-Hant'));
    const byN = [...kids].sort((a, b) => b.m.n - a.m.n || a.name.localeCompare(b.name, 'zh-Hant'));
    const hi = byRate[0];
    const lo = byRate[byRate.length - 1];
    const top = byN[0];
    const lines = [];
    if (hi) lines.push(`${hi.name}${lab.rate} ${(hi.m.rate * 100).toFixed(1)}%（${fmt(hi.m.lease)}／${fmt(hi.m.n)}），為下層最高。`);
    if (lo && lo !== hi) lines.push(`${lo.name} ${(lo.m.rate * 100).toFixed(1)}%（${fmt(lo.m.lease)}／${fmt(lo.m.n)}），為下層最低。`);
    if (top && root.m && root.m.n) lines.push(`${top.name}總件 ${fmt(top.m.n)} 件，占${root.name} ${revPct(top.m.n, root.m.n)}%。`);
    const below = kids.filter(k => k.m.rate < dashTarget(kind));
    if (below.length) lines.push(`下層 ${fmt(below.length)} 個單位低於目標 ${dashTgtLabel(kind)}，宜優先看件數較多且比率偏低者。`);
    return lines;
  }
  function renderLeaseCmpIntel(root, kind) {
    const name = root.name || '所選單位';
    const judge = $d(kind, 'CmpJudge');
    const note = $d(kind, 'CmpFocusNote');
    if (judge) judge.innerHTML = `<h4>智慧分析（${esc(name)}）</h4>${leaseCmpJudgeLines(root, kind).map(t => `<p>${esc(t)}</p>`).join('')}`;
    if (note) note.innerHTML = `<h4>單位觀察：下層結構</h4>${leaseCmpClusterLines(root, kind).map(t => `<p>${esc(t)}</p>`).join('')}`;
  }
  function renderLeaseType(kind) {
    kind = dashKind(kind);
    const pfx = dashPrefix(kind);
    const lab = dashLab(kind);
    const tk = pfx + 'Type';
    const grain = state[tk + 'Grain'] || 'month';
    const y = state.end.getFullYear();
    const start = grain === 'year' ? new Date(y, 0, 1) : state.start;
    const end = grain === 'year' ? new Date(y, 11, 31) : state.end;
    const open = new Set(state[tk + 'Open'] || []);
    const typeOpt = kind === 'weak'
      ? { ignoreType: true, onlyWeak: true }
      : kind === 'new'
        ? { onlyFresh: true }
        : { ignoreType: true, onlyLease: true };
    $d(kind, 'TypePeriod').textContent = `統計期間：${slash(start)}～${slash(end)}　案件類型：${lab.typeFilter}`;
    const countsOf = (rows) => {
      const out = {};
      TYPE_COLS.forEach(c => { out[c.id] = rows.filter(r => c.match(r.ft)).length; });
      out.total = rows.length;
      return out;
    };
    const decorate = (node) => {
      const kids = (node.kids || []).map(decorate);
      const rows = typeRows(unitOfficeSet(node.id), start, end, typeOpt);
      return { ...node, kids, rows, c: countsOf(rows) };
    };
    const ownerOf = (id, name) => LOOKUP.owners[id] || LOOKUP.owners[name] || ownerName(unitOfficeSet(id), name) || '—';
    const root = pruneIdleSalesOffices(decorate(scopedUnitTree()), n => n.c && n.c.total) || decorate(scopedUnitTree());
    const typeSort = state[tk + 'TblSort'] || '';
    if (typeSort) {
      sortUnitTree(root, n => {
        if (typeSort === 'name') return n.name;
        if (typeSort === 'owner') return ownerOf(n.id, n.name);
        return n.c[typeSort] == null ? n.c.total : n.c[typeSort];
      }, state[tk + 'TblDir'] || 'desc');
    }
    if (!findUnitNode(root, state[tk + 'Focus'] || '')) state[tk + 'Focus'] = root.id;
    const focus = state[tk + 'Focus'] || root.id;
    const html = [];
    const walk = (node, depth) => {
      const hasKids = node.kids && node.kids.length;
      const isOpen = node.id === '__SEL__' || open.has(node.id);
      const tog = hasKids
        ? `<button type="button" class="unit-tog" data-${pfx}-type-open="${node.id}">${isOpen ? '▾' : '▸'}</button>`
        : `<span class="unit-tog-sp"></span>`;
      html.push(`<tr class="${node.id === focus ? 'on' : ''}" data-${pfx}-type-focus="${node.id}">
        ${unitCellHtml(node, depth, tog)}
        <td>${fmt(node.c.total)}</td>
        ${TYPE_COLS.map(c => `<td>${fmt(node.c[c.id])}</td>`).join('')}
      </tr>`);
      if (hasKids && isOpen) node.kids.forEach(k => walk(k, depth + 1));
    };
    walk(root, 0);
    $d(kind, 'TypeTable').innerHTML = `<table class="type-tbl ana-tbl"><thead><tr>
      ${tblTh(tk, 'name', '單位／擔當者')}${tblTh(tk, 'total', '總件數')}${TYPE_COLS.map(c => tblTh(tk, c.id, c.label)).join('')}
    </tr></thead><tbody>${html.join('')}</tbody></table>`;
    const findNode = (node, id) => node.id === id ? node : (node.kids || []).reduce((hit, k) => hit || findNode(k, id), null);
    const focusNode = findNode(root, focus) || root;
    const c = focusNode.c;
    const scopeName = focusNode.name || '全公司';
    const newN = c['新媒合'] || 0, reN = c['再媒合'] || 0, renew = c['續約'] || 0;
    const tag = lab.sec;
    $d(kind, 'TypeKpis').innerHTML = `
      <div class="card kpi"><div class="k">${tag}案件數</div><div class="v">${fmt(c.total)}<span class="unit"> 件</span></div><div class="s">畫面統計母體</div></div>
      <div class="card kpi"><div class="k">${tag}新媒合件數</div><div class="v">${fmt(newN)}<span class="unit"> 件</span></div><div class="s">占全部 ${revPct(newN, c.total)}%</div></div>
      <div class="card kpi"><div class="k">${tag}續約件數</div><div class="v">${fmt(renew)}<span class="unit"> 件</span></div><div class="s">占全部 ${revPct(renew, c.total)}%</div></div>
      <div class="card kpi"><div class="k">${tag}再媒合件數</div><div class="v">${fmt(reN)}<span class="unit"> 件</span></div><div class="s">占全部 ${revPct(reN, c.total)}%</div></div>`;
    const dist = [
      { id: '新媒合', n: newN, color: '#1e4a7a' },
      { id: '續約', n: renew, color: '#6d9fc8' },
      { id: '再媒合', n: reN, color: '#93c5fd' },
      { id: '代管轉包租', n: c['代管轉包租'] || 0, color: '#d97706' },
      { id: '包租轉代管', n: c['包租轉代管'] || 0, color: '#94a3b8' }
    ];
    $d(kind, 'TypeDist').innerHTML = typeShareBars(dist.map(x => ({ lab: x.id, n: x.n, color: x.color })), c.total, ['#1e4a7a']);
    const focusRows = focusNode.rows || [];
    const newLeaves = TYPE_HEAT[0].leaves.map(l => ({ lab: l.short, n: focusRows.filter(r => r.ft === l.id).length, color: /寄居/.test(l.id) ? '#9e1a32' : undefined }));
    const reLeaves = TYPE_HEAT[1].leaves.map(l => ({ lab: l.short === '到期再媒' ? '到期再媒合' : '解約再媒合', n: focusRows.filter(r => r.ft === l.id).length }));
    $d(kind, 'TypeNewDist').innerHTML = typeShareBars(newLeaves, newN, ['#1e4a7a', '#245c8c', '#2f6aa3', '#3d7a6a', '#4a86b8', '#5a9a8a', '#6d9fc8', '#7eb89a', '#93c5fd', '#a8c9a0', '#b6d4ee'], { twoCol: true, note: `分母為${tag}新媒合 ${fmt(newN)} 件。` });
    $d(kind, 'TypeReDist').innerHTML = typeShareBars(reLeaves, reN, ['#1e4a7a', '#93c5fd'], { note: `分母為${tag}再媒合 ${fmt(reN)} 件。` });
    $d(kind, 'TypeJudge').innerHTML = `<h4>管理判讀</h4>${typeJudgeLines(focusNode, scopeName).map(t => `<p>${esc(t)}</p>`).join('')}`;
    $d(kind, 'TypeFocusNote').innerHTML = `<h4>單位觀察：依篩選範圍看結構</h4>${typeClusterLines(focusNode, scopeName).map(t => `<p>${esc(t)}</p>`).join('')}`;
    const tBtn = $d(kind, 'TypeStaffBtn');
    if (tBtn) tBtn.classList.toggle('on', !!state[tk + 'StaffOpen']);
    renderTypeStaff(focusRows, scopeName, { boxId: pfx + 'TypeStaffBox', kind: tk, openKey: tk + 'StaffOpen', title: lab.typeAna + '業務明細查詢' });
  }
  function renderLeaseReview(kind) {
    kind = dashKind(kind);
    const pfx = dashPrefix(kind);
    const lab = dashLab(kind);
    const rk = pfx + 'Rev';
    const grain = state[rk + 'Grain'] || 'month';
    const y = state.end.getFullYear();
    const start = grain === 'year' ? new Date(y, 0, 1) : state.start;
    const end = grain === 'year' ? new Date(y, 11, 31) : state.end;
    const open = new Set(state[rk + 'Open'] || []);
    const revOpt = kind === 'weak'
      ? { onlyWeak: true, onlyNew: true }
      : kind === 'new'
        ? { onlyFresh: true }
        : { onlyLease: true, onlyNew: true };
    $d(kind, 'RevPeriod').textContent = `統計期間：${slash(start)}～${slash(end)}　案件類型：${kind === 'new' ? (leaseTypeFull() || '新媒合(全)') : '新媒合(全)'}　${lab.only}`;
    const countsOf = (rows) => {
      const tagged = rows.map(reviewOf);
      const done = tagged.filter(s => s && s.id === '已生效').length;
      const wait = tagged.filter(s => s && s.id === '待產編').length;
      const re = tagged.filter(s => s && s.id === '複審').length;
      const pre = tagged.filter(s => s && s.id === '預審').length;
      const total = rows.length;
      return { done, wait, re, pre, pending: wait + re + pre, total, rate: total ? done / total : 0 };
    };
    const decorate = (node) => {
      const kids = (node.kids || []).map(decorate);
      const rows = revRows(unitOfficeSet(node.id), start, end, revOpt);
      return { ...node, kids, rows, c: countsOf(rows) };
    };
    const ownerOf = (id, name) => LOOKUP.owners[id] || LOOKUP.owners[name] || ownerName(unitOfficeSet(id), name) || '—';
    const root = pruneIdleSalesOffices(decorate(scopedUnitTree()), n => n.c && n.c.total) || decorate(scopedUnitTree());
    const revSort = state[rk + 'TblSort'] || '';
    if (revSort) {
      sortUnitTree(root, n => {
        if (revSort === 'name') return n.name;
        if (revSort === 'owner') return ownerOf(n.id, n.name);
        return n.c[revSort] == null ? n.c.total : n.c[revSort];
      }, state[rk + 'TblDir'] || 'desc');
    }
    if (!findUnitNode(root, state[rk + 'Focus'] || '')) state[rk + 'Focus'] = root.id;
    const focus = state[rk + 'Focus'] || root.id;
    const html = [];
    const walk = (node, depth) => {
      const hasKids = node.kids && node.kids.length;
      const isOpen = node.id === '__SEL__' || open.has(node.id);
      const tog = hasKids
        ? `<button type="button" class="unit-tog" data-${pfx}-rev-open="${node.id}">${isOpen ? '▾' : '▸'}</button>`
        : `<span class="unit-tog-sp"></span>`;
      html.push(`<tr class="${node.id === focus ? 'on' : ''}" data-${pfx}-rev-focus="${node.id}">
        ${unitCellHtml(node, depth, tog)}
        <td>${fmt(node.c.total)}</td><td>${fmt(node.c.done)}</td><td>${fmt(node.c.wait)}</td>
        <td>${fmt(node.c.re)}</td><td>${fmt(node.c.pre)}</td><td>${fmt(node.c.pending)}</td>
        <td>${revPct(node.c.done, node.c.total)}%</td>
      </tr>`);
      if (hasKids && isOpen) node.kids.forEach(k => walk(k, depth + 1));
    };
    walk(root, 0);
    $d(kind, 'RevTable').innerHTML = `<table class="type-tbl ana-tbl"><thead><tr>
      ${tblTh(rk, 'name', '單位／擔當者')}${tblTh(rk, 'total', '總件數')}${tblTh(rk, 'done', '已生效')}${tblTh(rk, 'wait', '待產編')}${tblTh(rk, 're', '複審')}${tblTh(rk, 'pre', '預審')}${tblTh(rk, 'pending', '待推進')}${tblTh(rk, 'rate', '生效率')}
    </tr></thead><tbody>${html.join('')}</tbody></table>`;
    const findNode = (node, id) => node.id === id ? node : (node.kids || []).reduce((hit, k) => hit || findNode(k, id), null);
    const focusNode = findNode(root, focus) || root;
    const c = focusNode.c;
    const scopeName = focusNode.name || '全公司';
    const salesN = new Set((focusNode.rows || []).map(r => r.sl).filter(Boolean)).size;
    $d(kind, 'RevKpis').innerHTML = `
      <div class="card kpi"><div class="k">案件總數</div><div class="v">${fmt(c.total)}<span class="unit"> 件</span></div><div class="s">${fmt(salesN)} 位業務</div></div>
      <div class="card kpi"><div class="k">已生效</div><div class="v">${fmt(c.done)}<span class="unit"> 件</span></div><div class="s">案件生效率 ${revPct(c.done, c.total)}%</div></div>
      <div class="card kpi"><div class="k">尚待推進</div><div class="v">${fmt(c.pending)}<span class="unit"> 件</span></div><div class="s">占全案 ${revPct(c.pending, c.total)}%</div></div>
      <div class="card kpi"><div class="k">複審案件</div><div class="v">${fmt(c.re)}<span class="unit"> 件</span></div><div class="s">占待推進 ${c.pending ? revPct(c.re, c.pending) : '0.0'}%</div></div>`;
    const dist = [
      { id: '已生效', n: c.done, color: '#1e4a7a' },
      { id: '待產編', n: c.wait, color: '#6d9fc8' },
      { id: '複審', n: c.re, color: '#d97706' },
      { id: '預審', n: c.pre, color: '#93c5fd' }
    ];
    const maxBar = Math.max(...dist.map(x => x.n), 1);
    $d(kind, 'RevDist').innerHTML = `<div class="rev-dist">${dist.map(x => `
      <span class="lab">${x.id}</span>
      <span class="track"><i style="width:${(x.n / maxBar) * 100}%;background:${x.color}"></i></span>
      <span class="n">${fmt(x.n)}件 / ${revPct(x.n, c.total)}%</span>`).join('')}</div>`;
    const prio = revPriorityItems(focusNode.rows || []);
    $d(kind, 'RevPrio').innerHTML = prio.length
      ? prio.map((x, i) => `<div class="rev-prio-item"><b>${String(i + 1).padStart(2, '0')}</b><div><div class="t">${esc(x.id)} ${fmt(x.n)}件</div><div class="h">${esc(x.hint)}</div></div></div>`).join('')
      : '<p>目前沒有待推進狀態可排序。</p>';
    $d(kind, 'RevJudge').innerHTML = `<h4>管理判讀</h4>${revJudgeLines(focusNode, scopeName).map(t => `<p>${esc(t)}</p>`).join('')}`;
    $d(kind, 'RevFocusNote').innerHTML = `<h4>${c.pending ? '案件集中：先處理量大的積壓' : '案件集中：目前無積壓'}</h4>${revClusterLines(focusNode, scopeName).map(t => `<p>${esc(t)}</p>`).join('')}`;
    const rBtn = $d(kind, 'RevStaffBtn');
    if (rBtn) rBtn.classList.toggle('on', !!state[rk + 'StaffOpen']);
    renderRevStaff(focusNode.rows || [], scopeName, { boxId: pfx + 'RevStaffBox', kind: rk, openKey: rk + 'StaffOpen', title: lab.revAna + '業務明細查詢' });
  }

  function arRows() {
    const ct = state.arCt || 'all';
    const offices = selectedOffices();
    return ARREARS.filter(r => {
      if (ct !== 'all' && !String(r.ct || '').includes(ct)) return false;
      if (offices && !offices.has(r.office)) return false;
      return true;
    });
  }
  function arPack(rows) {
    const list = rows || [];
    const out = { n: list.length, amt: 0, tenants: new Set() };
    AR_AGE.forEach(b => { out[b.id] = { n: 0, amt: 0, tenants: new Set() }; });
    AR_STATUS.forEach(s => { out[s.id] = { n: 0, amt: 0 }; });
    list.forEach(r => {
      const amt = Number(r.amt) || 0;
      out.amt += amt;
      out.tenants.add(r.id);
      const band = arAgeBand(r.days);
      out[band].n += 1;
      out[band].amt += amt;
      out[band].tenants.add(r.id);
      const st = arStatusOf(r);
      out[st].n += 1;
      out[st].amt += amt;
    });
    out.tenants = out.tenants.size;
    AR_AGE.forEach(b => { out[b.id].tenants = out[b.id].tenants.size; });
    return out;
  }
  function arCaseRowsHtml(rows) {
    const list = [...(rows || [])].sort((a, b) => (Number(b.days) || 0) - (Number(a.days) || 0));
    if (!list.length) return '<div class="empty">無符合條件的資料</div>';
    return `<table class="staff-case-tbl"><thead><tr>
      <th>催收日</th><th>欠租天數</th><th>金額</th><th>委託形式</th><th>類別</th><th>案件編號</th><th>催收狀態</th>
    </tr></thead><tbody>${list.map(r => `<tr>
      <td>${esc(showDate(r.rd) || r.rd || '')}</td>
      <td>${fmt(r.days)}</td>
      <td>$${fmt(r.amt)}</td>
      <td>${esc(r.ct || '')}</td>
      <td>${esc(r.cat === 'deposit' ? '押金' : '租金')}</td>
      <td>${esc(r.id)}</td>
      <td>${esc((AR_STATUS.find(s => s.id === arStatusOf(r)) || {}).lab || '')}</td>
    </tr>`).join('')}</tbody></table>`;
  }
  function arOpenStaff(name, office, key, label) {
    state.arStaffOpen = true;
    state.staffCase = { kind: 'ar', office: office || '—', name: name || '—', key: key || 'total', label: label || '欠款' };
    renderArDash();
  }
  function renderArStaff(rows, scopeName) {
    const box = $('arStaffBox');
    if (!box) return;
    bindStaffBox('arStaffBox', 'ar');
    const open = !!state.arStaffOpen;
    box.classList.toggle('hidden', !open);
    if (!open) {
      if (state.staffCase && state.staffCase.kind === 'ar') state.staffCase = null;
      box.innerHTML = '';
      return;
    }
    const map = new Map();
    rows.forEach(r => {
      const name = r.agent || '—';
      const office = r.office || '—';
      const key = office + '\t' + name;
      if (!map.has(key)) map.set(key, { office, name, rows: [] });
      map.get(key).rows.push(r);
    });
    const people = sortStaffPeople([...map.values()].map(p => {
      const pk = arPack(p.rows);
      return {
        ...p, n: pk.n, amt: pk.amt, total: pk.n,
        paid: pk.paid.n, open: pk.open.n, legal: pk.legal.n,
        b17: pk.b17.n, b814: pk.b814.n, b1529: pk.b1529.n, b30: pk.b30.n
      };
    }), state.arStaffSort || 'amt', state.arStaffDir || 'desc');
    staffPeople.ar = people;
    const btn = $('arStaffBtn');
    if (btn) btn.classList.toggle('on', true);
    box.innerHTML = `
      ${staffHead(esc(scopeName) + ' ｜ 應收帳款業務明細查詢')}
      <p class="src-staff-k">${fmt(rows.length)}筆，${fmt(people.length)}位業務。點表頭排序；點業務姓名或數字展開明細</p>
      <div class="src-staff-scroll"><table class="src-combo"><thead><tr>
        <th data-sort="office">代管營業處</th>
        <th data-sort="name">業務</th>
        <th data-sort="n">筆數</th>
        <th data-sort="amt">金額</th>
        <th data-sort="paid">已繳款</th>
        <th data-sort="open">未處理完成未繳款</th>
        <th data-sort="legal">預計送法務部</th>
        <th data-sort="b17">1-7天</th>
        <th data-sort="b814">8-14天</th>
        <th data-sort="b1529">15-29天</th>
        <th data-sort="b30">30天以上</th>
      </tr></thead><tbody>
        ${people.map(p => `<tr>
          <td>${esc(p.office)}</td>
          <td class="name-hit ar-hit">${esc(p.name)}</td>
          <td class="num-hit" data-k="n">${fmt(p.n)}</td>
          <td class="num-hit" data-k="amt">$${fmt(p.amt)}</td>
          <td class="num-hit" data-k="paid">${fmt(p.paid)}</td>
          <td class="num-hit" data-k="open">${fmt(p.open)}</td>
          <td class="num-hit" data-k="legal">${fmt(p.legal)}</td>
          <td class="num-hit" data-k="b17">${fmt(p.b17)}</td>
          <td class="num-hit" data-k="b814">${fmt(p.b814)}</td>
          <td class="num-hit" data-k="b1529">${fmt(p.b1529)}</td>
          <td class="num-hit" data-k="b30">${fmt(p.b30)}</td>
        </tr>`).join('') || '<tr><td colspan="11">無資料</td></tr>'}
      </tbody></table></div>
      ${staffCasePanel('ar')}`;
  }
  function renderArDash() {
    if (!$('page-ar') || $('page-ar').classList.contains('hidden')) return;
    const all = arRows();
    const tot = arPack(all);
    const ctLab = state.arCt === 'all' ? '' : (state.arCt || '');
    const title = ctLab ? `${ctLab}約應收帳款總額` : '應收帳款總額';
    const card = (k, v, s) => `<div class="card kpi"><div class="k">${k}</div><div class="v">${v}<span class="unit"> 元</span></div><div class="s">${s}</div></div>`;
    $('arKpiRow').innerHTML = [
      card(title, fmt(tot.amt), `${fmt(tot.n)}筆 ｜ ${fmt(tot.tenants)}個承租戶`),
      ...AR_AGE.map(b => {
        const p = tot.amt ? (tot[b.id].amt / tot.amt * 100) : 0;
        return card(b.lab, fmt(tot[b.id].amt), `${fmt(tot[b.id].n)}筆 ｜ ${fmt(tot[b.id].tenants)}個承租戶 ｜ 占比${p.toFixed(1)}%`);
      })
    ].join('');
    const ownerOf = (id, name) => LOOKUP.owners[id] || LOOKUP.owners[name] || ownerName(unitOfficeSet(id), name) || '—';
    const decorate = (node) => {
      const kids = (node.kids || []).map(decorate);
      const offices = unitOfficeSet(node.id);
      const rows = all.filter(r => !offices || offices.has(r.office));
      return { ...node, kids, rows, m: arPack(rows) };
    };
    const root = pruneIdleSalesOffices(decorate(scopedUnitTree()), n => n.m && n.m.n) || decorate(scopedUnitTree());
    const ageKey = state.arAgeTblSort || '';
    if (ageKey) sortUnitTree(root, n => {
      if (ageKey === 'name') return n.name;
      if (ageKey === 'owner') return ownerOf(n.id, n.name);
      if (ageKey === 'share30') return n.m.amt ? n.m.b30.amt / n.m.amt : 0;
      if (ageKey.endsWith('N')) return (n.m[ageKey.slice(0, -1)] || n.m).n;
      if (n.m[ageKey] && typeof n.m[ageKey] === 'object') return n.m[ageKey].amt;
      return n.m[ageKey];
    }, state.arAgeTblDir || 'desc');
    if (!findUnitNode(root, state.arAgeFocus || '')) state.arAgeFocus = root.id;
    const ageOpen = new Set(state.arAgeOpen || []);
    const ageRows = [];
    const walkAge = (node, depth) => {
      const hasKids = node.kids && node.kids.length;
      const isOpen = node.id === '__SEL__' || ageOpen.has(node.id);
      const pad = 6 + depth * 14;
      const tog = hasKids
        ? `<button type="button" class="unit-tog" data-ar-age-open="${node.id}">${isOpen ? '▾' : '▸'}</button>`
        : `<span class="unit-tog-sp"></span>`;
      const m = node.m;
      const on = node.id === state.arAgeFocus ? ' on' : '';
      const bandCells = AR_AGE.map(b => `<td class="ar-hit" data-ar-band="${b.id}">${fmt(m[b.id].n)}</td><td class="ar-hit" data-ar-band="${b.id}">$${fmt(m[b.id].amt)}</td>`).join('');
      ageRows.push(`<tr class="${on}" data-ar-age-row="${node.id}">
        <td class="left unit-name" style="padding-left:${pad}px">${tog}<span>${esc(node.name)}</span></td>
        <td class="left">${esc(ownerOf(node.id, node.name))}</td>
        <td class="ar-hit" data-ar-band="n">${fmt(m.n)}</td>
        <td class="ar-hit" data-ar-band="amt">$${fmt(m.amt)}</td>
        ${bandCells}
        <td>${m.amt ? ((m.b30.amt / m.amt) * 100).toFixed(1) : '0.0'}%</td>
      </tr>`);
      if (hasKids && isOpen) node.kids.forEach(k => walkAge(k, depth + 1));
    };
    walkAge(root, 0);
    const ageTh = (key, lab) => `<th data-tbl-sort="${key}" class="${state.arAgeTblSort === key ? 'sort-on' : ''}">${lab}</th>`;
    $('arAgeTable').innerHTML = `<table class="unit-cmp lz-cmp ar-age-tbl"><thead><tr>
      ${ageTh('name', '單位')}${ageTh('owner', '擔當者')}${ageTh('n', '筆數')}${ageTh('amt', '欠款金額')}
      ${AR_AGE.map(b => `${ageTh(b.id + 'N', '筆數')}${ageTh(b.id, b.lab)}`).join('')}
      ${ageTh('share30', '30天以上占比')}
    </tr></thead><tbody>${ageRows.join('')}</tbody></table>`;

    const stOpen = new Set(state.arStOpen || []);
    const stKey = state.arStTblSort || '';
    if (stKey) sortUnitTree(root, n => {
      if (stKey === 'name') return n.name;
      if (stKey === 'owner') return ownerOf(n.id, n.name);
      if (stKey === 'paid' || stKey === 'open' || stKey === 'legal') return n.m[stKey].n;
      if (stKey === 'paidAmt' || stKey === 'openAmt' || stKey === 'legalAmt') return n.m[stKey.replace('Amt', '')].amt;
      return n.m.n;
    }, state.arStTblDir || 'desc');
    if (!findUnitNode(root, state.arStFocus || '')) state.arStFocus = root.id;
    const stRows = [];
    const walkSt = (node, depth) => {
      const hasKids = node.kids && node.kids.length;
      const isOpen = node.id === '__SEL__' || stOpen.has(node.id);
      const tog = hasKids
        ? `<button type="button" class="unit-tog" data-ar-st-open="${node.id}">${isOpen ? '▾' : '▸'}</button>`
        : `<span class="unit-tog-sp"></span>`;
      const m = node.m;
      stRows.push(`<tr class="${node.id === state.arStFocus ? 'on' : ''}" data-ar-st-row="${node.id}">
        ${unitCellHtml(node, depth, tog)}
        ${AR_STATUS.map(s => `<td class="ar-hit" data-ar-st="${s.id}">${arMoney(m[s.id].n, m[s.id].amt)}</td>`).join('')}
      </tr>`);
      if (hasKids && isOpen) node.kids.forEach(k => walkSt(k, depth + 1));
    };
    walkSt(root, 0);
    const stTh = (key, lab) => `<th data-tbl-sort="${key}" class="${state.arStTblSort === key ? 'sort-on' : ''}">${lab}</th>`;
    $('arStTable').innerHTML = `<table class="type-tbl ana-tbl"><thead><tr>
      ${stTh('name', '單位／擔當者')}
      ${AR_STATUS.map(s => stTh(s.id, s.lab)).join('')}
    </tr></thead><tbody>${stRows.join('')}</tbody></table>`;

    const focus = findUnitNode(root, state.arStFocus) || root;
    const fm = focus.m;
    const unpaidN = fm.open.n + fm.legal.n;
    const unpaidAmt = fm.open.amt + fm.legal.amt;
    $('arStPeriod').textContent = `資料來源：催收管理＞催收查詢　合約狀態：${state.arCt === 'all' ? '全選' : state.arCt}　單位：${focus.name}`;
    $('arStKpis').innerHTML = AR_STATUS.map(s =>
      `<div class="card kpi"><div class="k">${s.lab}</div><div class="v">${fmt(fm[s.id].n)}<span class="unit"> 筆</span></div><div class="s">${arMoney(fm[s.id].n, fm[s.id].amt)}</div></div>`
    ).join('') + `<div class="card kpi"><div class="k">未收總額</div><div class="v">${fmt(unpaidAmt)}<span class="unit"> 元</span></div><div class="s">${fmt(unpaidN)}筆</div></div>`;
    const pal = { paid: '#16a34a', open: '#0ea5e9', legal: '#1e4a7a' };
    const dist = AR_STATUS.map(s => ({ lab: s.lab, n: fm[s.id].n, color: pal[s.id], id: s.id }));
    $('arStDist').innerHTML = typeShareBars(dist, fm.n, ['#0ea5e9'], { note: '筆數占比；已繳款為金額 0 的催收列，30 天以上未繳列為預計送法務部。' });
    const agePal = { b17: '#2563eb', b814: '#7c3aed', b1529: '#ea580c', b30: '#9f1239' };
    const ageDist = AR_AGE.map(b => ({ lab: b.lab, n: fm[b.id].n, color: agePal[b.id] }));
    if ($('arAgeDist')) {
      $('arAgeDist').innerHTML = typeShareBars(ageDist, fm.n, ['#1e4a7a'], { note: '依欠租天數分組，分母為目前範圍催收筆數。' });
    }
    const topLegal = [...(focus.kids || [])].sort((a, b) => b.m.legal.amt - a.m.legal.amt)[0];
    $('arStJudge').innerHTML = `<h4>管理判讀</h4>
      <p>${esc(focus.name)}未收 ${fmt(unpaidAmt)} 元、${fmt(unpaidN)} 筆；預計送法務部 ${fmt(fm.legal.n)} 筆／$${fmt(fm.legal.amt)}。</p>
      <p>${topLegal ? `${esc(topLegal.name)}預計送法務部金額 $${fmt(topLegal.m.legal.amt)}，為下層最高。` : '目前範圍無下層單位可比較。'}</p>`;
    $('arStFocusNote').innerHTML = `<h4>單位觀察</h4>
      <p>點單位列可切換分析範圍；點狀態數字可開啟該單位業務明細。</p>
      <p>已繳款 ${arMoney(fm.paid.n, fm.paid.amt)}；未處理完成未繳款 ${arMoney(fm.open.n, fm.open.amt)}。</p>`;
    renderArStaff(all, focus.name);

    const debtors = [...all.reduce((m, r) => {
      const id = String(r.id || '—');
      if (!m.has(id)) m.set(id, { id, n: 0, amt: 0, days: 0, office: r.office, agent: r.agent, rows: [] });
      const o = m.get(id);
      o.n += 1;
      o.amt += Number(r.amt) || 0;
      o.days = Math.max(o.days, Number(r.days) || 0);
      o.office = r.office || o.office;
      o.agent = r.agent || o.agent;
      o.rows.push(r);
      return m;
    }, new Map()).values()].sort((a, b) => {
      const dir = state.arDebtorTblDir === 'asc' ? 1 : -1;
      const k = state.arDebtorTblSort || 'amt';
      if (k === 'agent' || k === 'office' || k === 'id') return String(a[k] || '').localeCompare(String(b[k] || ''), 'zh-Hant') * dir;
      return ((a[k] || 0) - (b[k] || 0)) * dir;
    }).slice(0, 20);
    const dTh = (key, lab) => `<th data-tbl-sort="${key}" class="${state.arDebtorTblSort === key ? 'sort-on' : ''}">${lab}</th>`;
    $('arDebtorTable').innerHTML = `<table class="type-tbl ana-tbl"><thead><tr>
      <th>#</th>${dTh('id', '承租案件')}${dTh('office', '代管營業處')}${dTh('agent', '業務')}${dTh('n', '筆數')}${dTh('amt', '金額')}${dTh('days', '最長欠租天數')}
    </tr></thead><tbody>${debtors.map((d, i) => `<tr>
      <td>${i + 1}</td>
      <td class="ar-hit" data-ar-agent="${esc(d.agent)}" data-ar-office="${esc(d.office)}">${esc(d.id)}</td>
      <td>${esc(d.office || '—')}</td>
      <td class="ar-hit" data-ar-agent="${esc(d.agent)}" data-ar-office="${esc(d.office)}">${esc(d.agent || '—')}</td>
      <td class="ar-hit" data-ar-agent="${esc(d.agent)}" data-ar-office="${esc(d.office)}">${fmt(d.n)}</td>
      <td class="ar-hit" data-ar-agent="${esc(d.agent)}" data-ar-office="${esc(d.office)}">$${fmt(d.amt)}</td>
      <td>${fmt(d.days)}</td>
    </tr>`).join('') || '<tr><td colspan="7">無資料</td></tr>'}</tbody></table>`;

    const mgmtRows = all.filter(r => String(r.ct || '').includes('代管'));
    const mgmtTot = mgmtRows.reduce((s, r) => s + (Number(r.amt) || 0), 0);
    const agents = [...mgmtRows.reduce((m, r) => {
      const name = r.agent || '—';
      const office = r.office || '—';
      const key = office + '\t' + name;
      if (!m.has(key)) m.set(key, { name, office, n: 0, amt: 0 });
      const o = m.get(key);
      o.n += 1;
      o.amt += Number(r.amt) || 0;
      return m;
    }, new Map()).values()].sort((a, b) => b.amt - a.amt).slice(0, 12);
    const maxAmt = Math.max(1, ...agents.map(a => a.amt));
    $('arAgentRank').innerHTML = agents.map((a, i) => `
      <div class="ar-agent-row" data-ar-agent="${esc(a.name)}" data-ar-office="${esc(a.office)}">
        <span>${i + 1}</span><span class="ar-hit">${esc(a.name)}</span>
        <span class="track"><i style="width:${(a.amt / maxAmt) * 100}%"></i></span>
        <span>$${fmt(a.amt)}　${mgmtTot ? ((a.amt / mgmtTot) * 100).toFixed(1) : '0.0'}%</span>
      </div>`).join('') || '<p class="note">目前沒有代管欠款資料。</p>';
    const sBtn = $('arStaffBtn');
    if (sBtn) sBtn.classList.toggle('on', !!state.arStaffOpen);
  }

  function twAt(iso) {
    if (!iso) return '無';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '無';
    return d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  }
  function fillDataStamp() {
    const sky = window.SKYFUN_PERF && window.SKYFUN_PERF.fetchedAt;
    const meta = window.CONTRACTS_META || {};
    const stamp = sky || meta.fetchedAt || meta.refreshedAt;
    if ($('updateAt')) $('updateAt').textContent = window.MGR_REPORT_STAMP || twAt(stamp);
    if ($('dataHint')) $('dataHint').textContent = window.MGR_REPORT_NOTICES || '';
  }
  function renderAll() {
    clearDashCache();
    const c = compute();
    fillDataStamp();
    renderKpis(c); renderTrend(); renderMonthCmp(); renderRank(c); renderWeek(); renderMap(c); renderCmp(c); renderGrowAnalysis(); renderFcstAnalysis(); renderCityGrowAnalysis(); renderCrabImpact(); renderReviewAnalysis(); renderTypeAnalysis(); renderSourceAnalysis(); renderHouseAnalysis(); renderSalesRanks();
    renderNatPerf(staffPeople.nat || []);
    renderLeaseDash('lease');
    renderLeaseDash('weak');
    renderLeaseDash('new');
    renderArDash();
    renderRnDash();
  }

  function perfNameList() {
    const seen = new Map();
    STAFF_HR.forEach(s => {
      if (!s.name) return;
      const office = s.officeName || s.office || '';
      const key = s.name + '\t' + office;
      if (!seen.has(key)) seen.set(key, { name: s.name, office, title: s.titleName || '' });
    });
    ROWS.forEach(r => {
      const name = r.sl;
      if (!name) return;
      const office = crabNormSo(r.so);
      const key = name + '\t' + office;
      if (!seen.has(key)) seen.set(key, { name, office, title: '' });
    });
    return [...seen.values()];
  }
  function renderPerfHits() {
    const box = $('perfNameHits');
    const inp = $('perfNameQ');
    if (!box || !inp) return;
    const q = String(inp.value || '').trim();
    state.perfQ = q;
    if (!q) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }
    const hits = perfNameList().filter(p => p.name.includes(q)).slice(0, 20);
    if (!hits.length) {
      box.classList.remove('hidden');
      box.innerHTML = `<button type="button" disabled>找不到「${esc(q)}」</button>`;
      return;
    }
    box.classList.remove('hidden');
    box.innerHTML = hits.map(p => `<button type="button" data-nat-person="${esc(p.name)}" data-nat-office="${esc(p.office)}">${esc(p.name)}<span class="off">${esc(p.office)}${p.title ? '　' + esc(p.title) : ''}</span></button>`).join('');
  }
  function pickPerfPerson(name, office) {
    state.natPerson = name;
    state.natOffice = office;
    const inp = $('perfNameQ');
    if (inp) inp.value = name;
    const hits = $('perfNameHits');
    if (hits) { hits.classList.add('hidden'); hits.innerHTML = ''; }
    renderNatPerf(staffPeople.nat || []);
  }

  renderNav();
  renderFilters();
  $('trendSeg').onclick = e => {
    const g = e.target.dataset.g; if (!g) return;
    state.trendGrain = g;
    $('trendSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === g));
    renderTrend();
  };
  $('cmpSeg').onclick = e => {
    const g = e.target.dataset.g; if (!g) return;
    state.cmpGrain = g;
    $('cmpSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === g));
    renderCmp();
  };
  $('cmpSort').onchange = e => {
    state.cmpSort = e.target.value;
    state.cmpTblSort = e.target.value;
    state.cmpTblDir = 'desc';
    renderCmp();
  };
  $('cmpTable').onclick = e => {
    const sortTh = e.target.closest('th[data-tbl-sort]');
    if (sortTh) {
      setTblSort('cmp', sortTh.dataset.tblSort);
      if (['actual', 'target', 'gap', 'rate'].includes(state.cmpTblSort)) {
        state.cmpSort = state.cmpTblSort;
        const sel = $('cmpSort');
        if (sel) sel.value = state.cmpTblSort;
      }
      renderCmp();
      return;
    }
    const btn = e.target.closest('[data-unit]');
    if (!btn) return;
    const id = btn.dataset.unit;
    const open = new Set(state.cmpOpen || []);
    if (open.has(id)) open.delete(id); else open.add(id);
    state.cmpOpen = [...open];
    renderCmp();
  };
  $('typeSeg').onclick = e => {
    const g = e.target.dataset.g; if (!g) return;
    state.typeGrain = g;
    $('typeSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === g));
    renderTypeAnalysis();
  };
  $('typeStaffBtn').onclick = () => {
    state.typeStaffOpen = !state.typeStaffOpen;
    renderTypeAnalysis();
  };
  $('typeTable').onclick = e => {
    const sortTh = e.target.closest('th[data-tbl-sort]');
    if (sortTh) {
      setTblSort('type', sortTh.dataset.tblSort);
      renderTypeAnalysis();
      return;
    }
    const openBtn = e.target.closest('[data-type-open]');
    if (openBtn) {
      const id = openBtn.dataset.typeOpen;
      const open = new Set(state.typeOpen || []);
      if (open.has(id)) open.delete(id); else open.add(id);
      state.typeOpen = [...open];
      renderTypeAnalysis();
      return;
    }
    const row = e.target.closest('[data-type-focus]');
    if (!row) return;
    state.typeFocus = row.dataset.typeFocus;
    renderTypeAnalysis();
  };
  $('srcSeg').onclick = e => {
    const g = e.target.dataset.g; if (!g) return;
    state.srcGrain = g;
    $('srcSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === g));
    renderSourceAnalysis();
  };
  $('srcTable').onclick = e => {
    const sortTh = e.target.closest('th[data-tbl-sort]');
    if (sortTh) {
      setTblSort('src', sortTh.dataset.tblSort);
      renderSourceAnalysis();
      return;
    }
    const openBtn = e.target.closest('[data-src-open]');
    if (openBtn) {
      const id = openBtn.dataset.srcOpen;
      const open = new Set(state.srcOpen || []);
      if (open.has(id)) open.delete(id); else open.add(id);
      state.srcOpen = [...open];
      renderSourceAnalysis();
      return;
    }
    const row = e.target.closest('[data-src-focus]');
    if (!row) return;
    state.srcFocus = row.dataset.srcFocus;
    renderSourceAnalysis();
  };
  $('srcStaffBtn').onclick = () => {
    state.srcStaffOpen = !state.srcStaffOpen;
    renderSourceAnalysis();
  };
  $('houseStaffBtn').onclick = () => {
    state.houseStaffOpen = !state.houseStaffOpen;
    renderHouseAnalysis();
  };
  $('salesNatSeg').onclick = e => {
    const g = e.target.dataset.g; if (!g) return;
    state.salesNatGrain = g;
    $('salesNatSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === g));
    renderSalesRanks();
  };
  if ($('natBandSel')) $('natBandSel').onchange = e => {
    state.natBand = e.target.value || 'all';
    renderSalesRanks();
  };
  $('natDash').onclick = e => {
    if (e.target.closest('[data-close-case]')) {
      if (state.staffCase && state.staffCase.kind === 'nat') state.staffCase = null;
      renderSalesRanks();
      return;
    }
    const caseTh = e.target.closest('th[data-case-sort]');
    if (caseTh) {
      const key = caseTh.dataset.caseSort;
      if (state.caseSortKey === key) state.caseSortDir = state.caseSortDir === 'desc' ? 'asc' : 'desc';
      else { state.caseSortKey = key; state.caseSortDir = 'asc'; }
      renderSalesRanks();
      return;
    }
    const nextEl = e.target.closest('[data-nat-next]');
    if (nextEl) {
      state.staffCase = { kind: 'nat', office: nextEl.dataset.natOffice, name: nextEl.dataset.natNext, key: 'total', label: '全部' };
      renderSalesRanks();
      return;
    }
    const sortTh = e.target.closest('th[data-nat-sort]');
    if (sortTh) {
      const key = sortTh.dataset.natSort;
      if (state.natTblSort === key) state.natTblDir = (state.natTblDir || 'desc') === 'desc' ? 'asc' : 'desc';
      else {
        state.natTblSort = key;
        state.natTblDir = (key === 'name' || key === 'office' || key === 'band') ? 'asc' : 'desc';
      }
      renderSalesRanks();
      return;
    }
    const person = e.target.closest('[data-nat-person]');
    if (person) {
      pickPerfPerson(person.dataset.natPerson, person.dataset.natOffice);
      state.nav = '業務績效表';
      document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('on', b.dataset.nav === '業務績效表'));
      $('page-cases').classList.add('hidden');
      if ($('page-perf')) $('page-perf').classList.remove('hidden');
      $('page-placeholder').classList.add('hidden');
      renderNatPerf(staffPeople.nat || []);
      return;
    }
    const band = e.target.closest('[data-nat-band]');
    if (!band) return;
    const v = band.dataset.natBand;
    state.natBand = state.natBand === v ? 'all' : v;
    renderSalesRanks();
  };
  $('revSeg').onclick = e => {
    const g = e.target.dataset.g; if (!g) return;
    state.revGrain = g;
    $('revSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === g));
    renderReviewAnalysis();
  };
  $('growSeg').onclick = e => {
    const g = e.target.dataset.g; if (!g) return;
    state.growGrain = g;
    $('growSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === g));
    renderGrowAnalysis();
  };
  $('growStaffBtn').onclick = () => {
    state.growStaffOpen = !state.growStaffOpen;
    renderGrowAnalysis();
  };
  $('fcstSeg').onclick = e => {
    const g = e.target.dataset.g; if (!g) return;
    state.fcstGrain = g;
    $('fcstSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === g));
    renderFcstAnalysis();
  };
  $('fcstStaffBtn').onclick = () => {
    state.fcstStaffOpen = !state.fcstStaffOpen;
    renderFcstAnalysis();
  };
  if ($('fcstLegend')) $('fcstLegend').onclick = e => {
    const btn = e.target.closest('[data-fcst-ds]');
    if (!btn) return;
    const key = btn.dataset.fcstDs;
    state.fcstHide = state.fcstHide || { 目標: false, 同期: false, 實績: false };
    state.fcstHide[key] = !state.fcstHide[key];
    const ch = charts.fcstChart;
    if (ch) {
      const i = ch.data.datasets.findIndex(d => d.label === key);
      if (i >= 0) {
        ch.setDatasetVisibility(i, !state.fcstHide[key]);
        ch.update();
      }
    }
    btn.classList.toggle('off', !!state.fcstHide[key]);
  };
  if ($('fcstUnitTbl')) $('fcstUnitTbl').onclick = e => {
    const sortTh = e.target.closest('th[data-tbl-sort]');
    if (sortTh) {
      setTblSort('fcst', sortTh.dataset.tblSort);
      renderFcstAnalysis();
      return;
    }
    const openBtn = e.target.closest('[data-fcst-open]');
    if (openBtn) {
      const id = openBtn.dataset.fcstOpen;
      const next = new Set(state.fcstOpen || []);
      if (next.has(id)) next.delete(id); else next.add(id);
      state.fcstOpen = [...next];
      renderFcstAnalysis();
      return;
    }
    const row = e.target.closest('[data-fcst-focus]');
    if (!row) return;
    state.fcstFocus = row.dataset.fcstFocus;
    renderFcstAnalysis();
  };
  $('growLegend').onclick = e => {
    const btn = e.target.closest('[data-grow-ds]');
    if (!btn) return;
    const key = btn.dataset.growDs;
    state.growHide = state.growHide || { 目標: false, 同期: false, 實績: false };
    state.growHide[key] = !state.growHide[key];
    const ch = charts.growChart;
    if (ch) {
      const i = ch.data.datasets.findIndex(d => d.label === key);
      if (i >= 0) {
        ch.setDatasetVisibility(i, !state.growHide[key]);
        ch.update();
      }
    }
    btn.classList.toggle('off', !!state.growHide[key]);
  };
  $('growUnitTbl').onclick = e => {
    const sortTh = e.target.closest('th[data-tbl-sort]');
    if (sortTh) {
      setTblSort('grow', sortTh.dataset.tblSort);
      renderGrowAnalysis();
      return;
    }
    const openBtn = e.target.closest('[data-grow-open]');
    if (openBtn) {
      const id = openBtn.dataset.growOpen;
      const next = new Set(state.growOpen || []);
      if (next.has(id)) next.delete(id); else next.add(id);
      state.growOpen = [...next];
      renderGrowAnalysis();
      return;
    }
    const monthTd = e.target.closest('[data-grow-months]');
    if (monthTd) {
      const id = monthTd.dataset.growMonths;
      const next = new Set(state.growMonthOpen || []);
      if (next.has(id)) next.delete(id); else next.add(id);
      state.growMonthOpen = [...next];
      renderGrowAnalysis();
      return;
    }
    const row = e.target.closest('[data-grow-focus]');
    if (!row) return;
    state.growFocus = row.dataset.growFocus;
    renderGrowAnalysis();
  };
  if ($('cgSeg')) $('cgSeg').onclick = e => {
    const g = e.target.dataset.g; if (!g) return;
    state.cityGrowGrain = g;
    $('cgSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === g));
    renderCityGrowAnalysis();
  };
  if ($('cgStaffBtn')) $('cgStaffBtn').onclick = () => {
    state.cgStaffOpen = !state.cgStaffOpen;
    renderCityGrowAnalysis();
  };
  if ($('cgLegend')) $('cgLegend').onclick = e => {
    const btn = e.target.closest('[data-cg-ds]');
    if (!btn) return;
    const key = btn.dataset.cgDs;
    state.cityGrowHide = state.cityGrowHide || { 同期: false, 實績: false };
    state.cityGrowHide[key] = !state.cityGrowHide[key];
    const ch = charts.cgChart;
    if (ch) {
      const i = ch.data.datasets.findIndex(d => d.label === key);
      if (i >= 0) {
        ch.setDatasetVisibility(i, !state.cityGrowHide[key]);
        ch.update();
      }
    }
    btn.classList.toggle('off', !!state.cityGrowHide[key]);
  };
  if ($('cgUnitTbl')) $('cgUnitTbl').onclick = e => {
    const sortTh = e.target.closest('th[data-tbl-sort]');
    if (sortTh) {
      setTblSort('cityGrow', sortTh.dataset.tblSort);
      renderCityGrowAnalysis();
      return;
    }
    const openBtn = e.target.closest('[data-cg-open]');
    if (openBtn) {
      const id = openBtn.dataset.cgOpen;
      const next = new Set(state.cityGrowOpen || []);
      if (next.has(id)) next.delete(id); else next.add(id);
      state.cityGrowOpen = [...next];
      renderCityGrowAnalysis();
      return;
    }
    const monthTd = e.target.closest('[data-cg-months]');
    if (monthTd) {
      const id = monthTd.dataset.cgMonths;
      const next = new Set(state.cityGrowMonthOpen || []);
      if (next.has(id)) next.delete(id); else next.add(id);
      state.cityGrowMonthOpen = [...next];
      renderCityGrowAnalysis();
      return;
    }
    const row = e.target.closest('[data-cg-focus]');
    if (!row) return;
    state.cityGrowFocus = row.dataset.cgFocus;
    renderCityGrowAnalysis();
  };
  const bindRateGrowUi = kind => {
    const cfg = rateGrowCfg(kind);
    const seg = $(cfg.pfx + 'Seg');
    if (seg) seg.onclick = e => {
      const g = e.target.dataset.g; if (!g) return;
      state[cfg.pfx + 'Grain'] = g;
      seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === g));
      renderRateGrow(cfg.kind);
    };
    const staffBtn = $(cfg.pfx + 'StaffBtn');
    if (staffBtn) staffBtn.onclick = () => {
      state[cfg.pfx + 'StaffOpen'] = !state[cfg.pfx + 'StaffOpen'];
      renderRateGrow(cfg.kind);
    };
    const legend = $(cfg.pfx + 'Legend');
    if (legend) legend.onclick = e => {
      const btn = e.target.closest(`[data-${cfg.ds}-ds]`);
      if (!btn) return;
      const key = btn.dataset[cfg.ds + 'Ds'];
      state[cfg.pfx + 'Hide'] = state[cfg.pfx + 'Hide'] || { 目標: false, 同期: false, 實績: false };
      state[cfg.pfx + 'Hide'][key] = !state[cfg.pfx + 'Hide'][key];
      const ch = charts[cfg.pfx + 'Chart'];
      if (ch) {
        const vis = !state[cfg.pfx + 'Hide'][key];
        ch.data.datasets.forEach((d, i) => {
          if (d.label === key || (key === '實績' && d.label === '預測值')) {
            ch.setDatasetVisibility(i, vis);
          }
        });
        ch.update();
      }
      btn.classList.toggle('off', !!state[cfg.pfx + 'Hide'][key]);
    };
    const unitTbl = $(cfg.pfx + 'UnitTbl');
    if (unitTbl) unitTbl.onclick = e => {
      const sortTh = e.target.closest('th[data-tbl-sort]');
      if (sortTh) {
        setTblSort(cfg.pfx, sortTh.dataset.tblSort);
        renderRateGrow(cfg.kind);
        return;
      }
      const openBtn = e.target.closest(`[data-${cfg.ds}-open]`);
      if (openBtn) {
        const id = openBtn.dataset[cfg.ds + 'Open'];
        const next = new Set(state[cfg.pfx + 'Open'] || []);
        if (next.has(id)) next.delete(id); else next.add(id);
        state[cfg.pfx + 'Open'] = [...next];
        renderRateGrow(cfg.kind);
        return;
      }
      const monthTd = e.target.closest(`[data-${cfg.ds}-months]`);
      if (monthTd) {
        const id = monthTd.dataset[cfg.ds + 'Months'];
        const next = new Set(state[cfg.pfx + 'MonthOpen'] || []);
        if (next.has(id)) next.delete(id); else next.add(id);
        state[cfg.pfx + 'MonthOpen'] = [...next];
        renderRateGrow(cfg.kind);
        return;
      }
      const row = e.target.closest(`[data-${cfg.ds}-focus]`);
      if (!row) return;
      state[cfg.pfx + 'Focus'] = row.dataset[cfg.ds + 'Focus'];
      renderRateGrow(cfg.kind);
    };
  };
  bindRateGrowUi('lease');
  bindRateGrowUi('weak');
  bindRateGrowUi('new');
  const bindCityRateGrowUi = kind => {
    const cfg = cityRateGrowCfg(kind);
    const seg = $(cfg.pfx + 'Seg');
    if (seg) seg.onclick = e => {
      const g = e.target.dataset.g; if (!g) return;
      state[cfg.pfx + 'Grain'] = g;
      seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === g));
      renderCityRateGrow(cfg.kind);
    };
    const staffBtn = $(cfg.pfx + 'StaffBtn');
    if (staffBtn) staffBtn.onclick = () => {
      state[cfg.pfx + 'StaffOpen'] = !state[cfg.pfx + 'StaffOpen'];
      renderCityRateGrow(cfg.kind);
    };
    const legend = $(cfg.pfx + 'Legend');
    if (legend) legend.onclick = e => {
      const btn = e.target.closest(`[data-${cfg.ds}-ds]`);
      if (!btn) return;
      const key = btn.dataset[cfg.ds + 'Ds'];
      state[cfg.pfx + 'Hide'] = state[cfg.pfx + 'Hide'] || { 同期: false, 實績: false };
      state[cfg.pfx + 'Hide'][key] = !state[cfg.pfx + 'Hide'][key];
      const ch = charts[cfg.pfx + 'Chart'];
      if (ch) {
        const i = ch.data.datasets.findIndex(d => d.label === key);
        if (i >= 0) {
          ch.setDatasetVisibility(i, !state[cfg.pfx + 'Hide'][key]);
          ch.update();
        }
      }
      btn.classList.toggle('off', !!state[cfg.pfx + 'Hide'][key]);
    };
    const unitTbl = $(cfg.pfx + 'UnitTbl');
    if (unitTbl) unitTbl.onclick = e => {
      const sortTh = e.target.closest('th[data-tbl-sort]');
      if (sortTh) {
        setTblSort(cfg.pfx, sortTh.dataset.tblSort);
        renderCityRateGrow(cfg.kind);
        return;
      }
      const openBtn = e.target.closest(`[data-${cfg.ds}-open]`);
      if (openBtn) {
        const id = openBtn.dataset[cfg.ds + 'Open'];
        const next = new Set(state[cfg.pfx + 'Open'] || []);
        if (next.has(id)) next.delete(id); else next.add(id);
        state[cfg.pfx + 'Open'] = [...next];
        renderCityRateGrow(cfg.kind);
        return;
      }
      const monthTd = e.target.closest(`[data-${cfg.ds}-months]`);
      if (monthTd) {
        const id = monthTd.dataset[cfg.ds + 'Months'];
        const next = new Set(state[cfg.pfx + 'MonthOpen'] || []);
        if (next.has(id)) next.delete(id); else next.add(id);
        state[cfg.pfx + 'MonthOpen'] = [...next];
        renderCityRateGrow(cfg.kind);
        return;
      }
      const row = e.target.closest(`[data-${cfg.ds}-focus]`);
      if (!row) return;
      state[cfg.pfx + 'Focus'] = row.dataset[cfg.ds + 'Focus'];
      renderCityRateGrow(cfg.kind);
    };
  };
  bindCityRateGrowUi('lease');
  bindCityRateGrowUi('weak');
  bindCityRateGrowUi('new');
  if ($('rnTrendMetric')) $('rnTrendMetric').onclick = e => {
    const m = e.target.dataset.m; if (!m) return;
    state.rnTrendMetric = m;
    dashPaint.renew = '';
    renderRnTrend();
    renderRnRank();
  };
  if ($('rnTrendSeg')) $('rnTrendSeg').onclick = e => {
    const g = e.target.dataset.g; if (!g) return;
    state.rnTrendGrain = g;
    dashPaint.renew = '';
    renderRnTrend();
  };
  if ($('rnCmpSeg')) $('rnCmpSeg').onclick = e => {
    const g = e.target.dataset.g; if (!g) return;
    state.rnCmpGrain = g;
    dashPaint.renew = '';
    $('rnCmpSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === g));
    renderRnCmp();
  };
  if ($('rnCmpSort')) $('rnCmpSort').onchange = e => {
    state.rnCmpSort = e.target.value;
    renderRnCmp();
  };
  if ($('rnCmpTable')) $('rnCmpTable').onclick = e => {
    const sortTh = e.target.closest('th[data-tbl-sort]');
    if (sortTh) {
      const key = sortTh.dataset.tblSort;
      if (state.rnCmpSort === key) {
        state.rnCmpDir = (state.rnCmpDir || 'desc') === 'desc' ? 'asc' : 'desc';
      } else {
        state.rnCmpSort = key;
        state.rnCmpDir = (key === 'name' || key === 'owner') ? 'asc' : 'desc';
      }
      const sel = $('rnCmpSort');
      if (sel && [...sel.options].some(o => o.value === key)) sel.value = key;
      renderRnCmp();
      return;
    }
    const btn = e.target.closest('[data-rn-unit]');
    if (btn) {
      const id = btn.getAttribute('data-rn-unit');
      const open = new Set(state.rnCmpOpen || []);
      if (open.has(id)) open.delete(id); else open.add(id);
      state.rnCmpOpen = [...open];
      renderRnCmp();
      return;
    }
    const tr = e.target.closest('tr[data-rn-cmp-row]');
    if (!tr) return;
    state.rnCmpFocus = tr.getAttribute('data-rn-cmp-row');
    renderRnCmp();
  };
  if ($('rnGrowMetric')) $('rnGrowMetric').onclick = e => {
    const m = e.target.dataset.m; if (!m) return;
    state.rnGrowMetric = m;
    $('rnGrowMetric').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
    renderRnDash();
  };
  if ($('rnGrowUnitTbl')) $('rnGrowUnitTbl').onclick = e => {
    const sortTh = e.target.closest('th[data-tbl-sort]');
    if (sortTh) {
      setTblSort('rnGrow', sortTh.dataset.tblSort);
      renderRnDash();
      return;
    }
    const openBtn = e.target.closest('[data-rngu-open]');
    if (openBtn) {
      const id = openBtn.dataset.rnguOpen;
      const next = new Set(state.rnGrowOpen || []);
      if (next.has(id)) next.delete(id); else next.add(id);
      state.rnGrowOpen = [...next];
      renderRnDash();
      return;
    }
    const monthTd = e.target.closest('[data-rngu-months]');
    if (monthTd) {
      const id = monthTd.dataset.rnguMonths;
      const next = new Set(state.rnGrowMonthOpen || []);
      if (next.has(id)) next.delete(id); else next.add(id);
      state.rnGrowMonthOpen = [...next];
      renderRnDash();
      return;
    }
    const row = e.target.closest('[data-rngu-focus]');
    if (!row) return;
    state.rnGrowFocus = row.dataset.rnguFocus;
    renderRnDash();
  };
  if ($('rnGrowSeg')) $('rnGrowSeg').onclick = e => {
    const g = e.target.dataset.g; if (!g) return;
    state.rnGrowGrain = g;
    $('rnGrowSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === g));
    renderRnDash();
  };
  if ($('rnGrowStaffBtn')) $('rnGrowStaffBtn').onclick = () => {
    state.rnGrowStaffOpen = !state.rnGrowStaffOpen;
    renderRnDash();
  };
  if ($('rnGrowLegend')) $('rnGrowLegend').onclick = e => {
    const btn = e.target.closest('[data-rngrow-ds]');
    if (!btn) return;
    const key = btn.dataset.rngrowDs;
    state.rnGrowHide = state.rnGrowHide || { 目標: false, 實績: false, 同期: false };
    state.rnGrowHide[key] = !state.rnGrowHide[key];
    const ch = charts.rnGrowChart;
    if (ch) {
      const vis = !state.rnGrowHide[key];
      ch.data.datasets.forEach((d, i) => {
        if (d.label === key || (key === '實績' && d.label === '預測值')) ch.setDatasetVisibility(i, vis);
      });
      ch.update();
    }
    btn.classList.toggle('off', !!state.rnGrowHide[key]);
  };
  $('crabSeg').onclick = e => {
    const g = e.target.dataset.g; if (!g) return;
    state.crabGrain = g;
    $('crabSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === g));
    renderCrabImpact();
  };
  $('crabStaffBtn').onclick = () => {
    state.crabStaffOpen = !state.crabStaffOpen;
    renderCrabImpact();
  };
  $('crabMonthBars').onclick = e => {
    const col = e.target.closest('[data-crab-m]');
    if (!col) return;
    state.crabPick = Number(col.dataset.crabM);
    state.crabGrain = 'month';
    renderCrabImpact();
  };
  $('crabUnitTbl').onclick = e => {
    const openBtn = e.target.closest('[data-crab-open]');
    if (openBtn) {
      const id = openBtn.dataset.crabOpen;
      const open = new Set(state.crabOpen || []);
      if (open.has(id)) open.delete(id); else open.add(id);
      state.crabOpen = [...open];
      renderCrabImpact();
      return;
    }
    const monthTd = e.target.closest('[data-crab-months]');
    if (monthTd) {
      const id = monthTd.dataset.crabMonths;
      const open = new Set(state.crabMonthOpen || []);
      if (open.has(id)) open.delete(id); else open.add(id);
      state.crabMonthOpen = [...open];
      renderCrabImpact();
      return;
    }
    const row = e.target.closest('[data-crab-focus]');
    if (!row) return;
    state.crabFocus = row.dataset.crabFocus;
    renderCrabImpact();
  };
  $('revTable').onclick = e => {
    const sortTh = e.target.closest('th[data-tbl-sort]');
    if (sortTh) {
      setTblSort('rev', sortTh.dataset.tblSort);
      renderReviewAnalysis();
      return;
    }
    const openBtn = e.target.closest('[data-rev-open]');
    if (openBtn) {
      const id = openBtn.dataset.revOpen;
      const open = new Set(state.revOpen || []);
      if (open.has(id)) open.delete(id); else open.add(id);
      state.revOpen = [...open];
      renderReviewAnalysis();
      return;
    }
    const row = e.target.closest('[data-rev-focus]');
    if (!row) return;
    state.revFocus = row.dataset.revFocus;
    renderReviewAnalysis();
  };
  $('revStaffBtn').onclick = () => {
    state.revStaffOpen = !state.revStaffOpen;
    renderReviewAnalysis();
  };
  $('houseSeg').onclick = e => {
    const g = e.target.dataset.g; if (!g) return;
    state.houseGrain = g;
    $('houseSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === g));
    renderHouseAnalysis();
  };
  $('houseTable').onclick = e => {
    const sortTh = e.target.closest('th[data-tbl-sort]');
    if (sortTh) {
      setTblSort('house', sortTh.dataset.tblSort);
      renderHouseAnalysis();
      return;
    }
    const openBtn = e.target.closest('[data-house-open]');
    if (openBtn) {
      const id = openBtn.dataset.houseOpen;
      const open = new Set(state.houseOpen || []);
      if (open.has(id)) open.delete(id); else open.add(id);
      state.houseOpen = [...open];
      renderHouseAnalysis();
      return;
    }
    const row = e.target.closest('[data-house-focus]');
    if (!row) return;
    state.houseFocus = row.dataset.houseFocus;
    renderHouseAnalysis();
  };
  if ($('perfNameQ')) {
    $('perfNameQ').oninput = () => renderPerfHits();
    $('perfNameQ').onfocus = () => { if ($('perfNameQ').value.trim()) renderPerfHits(); };
  }
  if ($('perfNameHits')) {
    $('perfNameHits').onclick = e => {
      const btn = e.target.closest('[data-nat-person]');
      if (!btn) return;
      pickPerfPerson(btn.dataset.natPerson, btn.dataset.natOffice);
    };
  }
  document.addEventListener('click', e => {
    if (e.target.closest('.perf-search')) return;
    const hits = $('perfNameHits');
    if (hits) hits.classList.add('hidden');
  });
  function bindDashUi(kind) {
    const pfx = dashPrefix(kind);
    const redraw = () => renderLeaseDash(kind);
    const el = (id) => $d(kind, id);
    if (el('TrendSeg')) el('TrendSeg').onclick = e => {
      const g = e.target.dataset.g; if (!g) return;
      state[pfx + 'TrendGrain'] = g;
      el('TrendSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === g));
      renderLeaseTrend(kind);
    };
    if (el('CmpSeg')) el('CmpSeg').onclick = e => {
      const g = e.target.dataset.g; if (!g) return;
      state[pfx + 'CmpGrain'] = g;
      el('CmpSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === g));
      renderLeaseCmp(kind);
    };
    if (el('CmpSort')) el('CmpSort').onchange = e => {
      state[pfx + 'CmpSort'] = e.target.value;
      renderLeaseCmp(kind);
    };
    if (el('CmpTable')) el('CmpTable').onclick = e => {
      const sortTh = e.target.closest('th[data-tbl-sort]');
      if (sortTh) {
        const key = sortTh.dataset.tblSort;
        if (state[pfx + 'CmpSort'] === key) {
          state[pfx + 'CmpDir'] = (state[pfx + 'CmpDir'] || 'desc') === 'desc' ? 'asc' : 'desc';
        } else {
          state[pfx + 'CmpSort'] = key;
          state[pfx + 'CmpDir'] = (key === 'name' || key === 'owner') ? 'asc' : 'desc';
        }
        const sel = el('CmpSort');
        if (sel && [...sel.options].some(o => o.value === key)) sel.value = key;
        renderLeaseCmp(kind);
        return;
      }
      const btn = e.target.closest(`[data-${pfx}-unit]`);
      if (btn) {
        const id = btn.getAttribute(`data-${pfx}-unit`);
        const open = new Set(state[pfx + 'CmpOpen'] || []);
        if (open.has(id)) open.delete(id); else open.add(id);
        state[pfx + 'CmpOpen'] = [...open];
        renderLeaseCmp(kind);
        return;
      }
      const tr = e.target.closest(`tr[data-${pfx}-cmp-row]`);
      if (!tr) return;
      state[pfx + 'CmpFocus'] = tr.getAttribute(`data-${pfx}-cmp-row`);
      renderLeaseCmp(kind);
    };
    if (el('TypeStaffBtn')) el('TypeStaffBtn').onclick = () => {
      state[pfx + 'TypeStaffOpen'] = !state[pfx + 'TypeStaffOpen'];
      renderLeaseType(kind);
    };
    if (el('RevStaffBtn')) el('RevStaffBtn').onclick = () => {
      state[pfx + 'RevStaffOpen'] = !state[pfx + 'RevStaffOpen'];
      renderLeaseReview(kind);
    };
    if (el('TypeSeg')) el('TypeSeg').onclick = e => {
      const g = e.target.dataset.g; if (!g) return;
      state[pfx + 'TypeGrain'] = g;
      el('TypeSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === g));
      renderLeaseType(kind);
    };
    if (el('TypeTable')) el('TypeTable').onclick = e => {
      const sortTh = e.target.closest('th[data-tbl-sort]');
      if (sortTh) { setTblSort(pfx + 'Type', sortTh.dataset.tblSort); renderLeaseType(kind); return; }
      const openBtn = e.target.closest(`[data-${pfx}-type-open]`);
      if (openBtn) {
        const id = openBtn.getAttribute(`data-${pfx}-type-open`);
        const open = new Set(state[pfx + 'TypeOpen'] || []);
        if (open.has(id)) open.delete(id); else open.add(id);
        state[pfx + 'TypeOpen'] = [...open];
        renderLeaseType(kind);
        return;
      }
      const row = e.target.closest(`[data-${pfx}-type-focus]`);
      if (!row) return;
      state[pfx + 'TypeFocus'] = row.getAttribute(`data-${pfx}-type-focus`);
      renderLeaseType(kind);
    };
    if (el('RevSeg')) el('RevSeg').onclick = e => {
      const g = e.target.dataset.g; if (!g) return;
      state[pfx + 'RevGrain'] = g;
      el('RevSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === g));
      renderLeaseReview(kind);
    };
    if (el('RevTable')) el('RevTable').onclick = e => {
      const sortTh = e.target.closest('th[data-tbl-sort]');
      if (sortTh) { setTblSort(pfx + 'Rev', sortTh.dataset.tblSort); renderLeaseReview(kind); return; }
      const openBtn = e.target.closest(`[data-${pfx}-rev-open]`);
      if (openBtn) {
        const id = openBtn.getAttribute(`data-${pfx}-rev-open`);
        const open = new Set(state[pfx + 'RevOpen'] || []);
        if (open.has(id)) open.delete(id); else open.add(id);
        state[pfx + 'RevOpen'] = [...open];
        renderLeaseReview(kind);
        return;
      }
      const row = e.target.closest(`[data-${pfx}-rev-focus]`);
      if (!row) return;
      state[pfx + 'RevFocus'] = row.getAttribute(`data-${pfx}-rev-focus`);
      renderLeaseReview(kind);
    };
  }
  bindDashUi('lease');
  bindDashUi('weak');
  bindDashUi('new');
  if ($('arCtFilter')) $('arCtFilter').onchange = e => { state.arCt = e.target.value; renderArDash(); };
  if ($('arStaffBtn')) $('arStaffBtn').onclick = () => { state.arStaffOpen = !state.arStaffOpen; renderArDash(); };
  function arToggle(setKey, id) {
    const open = new Set(state[setKey] || []);
    if (open.has(id)) open.delete(id); else open.add(id);
    state[setKey] = [...open];
  }
  if ($('arAgeTable')) $('arAgeTable').onclick = e => {
    const sortTh = e.target.closest('th[data-tbl-sort]');
    if (sortTh) { setTblSort('arAge', sortTh.dataset.tblSort); renderArDash(); return; }
    const btn = e.target.closest('[data-ar-age-open]');
    if (btn) { arToggle('arAgeOpen', btn.getAttribute('data-ar-age-open')); renderArDash(); return; }
    const hit = e.target.closest('.ar-hit');
    const tr = e.target.closest('tr[data-ar-age-row]');
    if (!tr) return;
    const id = tr.getAttribute('data-ar-age-row');
    state.arAgeFocus = id;
    state.arStFocus = id;
    if (hit) state.arStaffOpen = true;
    renderArDash();
  };
  if ($('arStTable')) $('arStTable').onclick = e => {
    const sortTh = e.target.closest('th[data-tbl-sort]');
    if (sortTh) { setTblSort('arSt', sortTh.dataset.tblSort); renderArDash(); return; }
    const btn = e.target.closest('[data-ar-st-open]');
    if (btn) { arToggle('arStOpen', btn.getAttribute('data-ar-st-open')); renderArDash(); return; }
    const hit = e.target.closest('.ar-hit');
    const tr = e.target.closest('tr[data-ar-st-row]');
    if (!tr) return;
    const id = tr.getAttribute('data-ar-st-row');
    state.arStFocus = id;
    state.arAgeFocus = id;
    if (hit) state.arStaffOpen = true;
    renderArDash();
  };
  if ($('arDebtorTable')) $('arDebtorTable').onclick = e => {
    const sortTh = e.target.closest('th[data-tbl-sort]');
    if (sortTh) { setTblSort('arDebtor', sortTh.dataset.tblSort); renderArDash(); return; }
    const hit = e.target.closest('[data-ar-agent]');
    if (!hit) return;
    arOpenStaff(hit.getAttribute('data-ar-agent'), hit.getAttribute('data-ar-office'), 'total', '欠款大戶');
  };
  if ($('arAgentRank')) $('arAgentRank').onclick = e => {
    const hit = e.target.closest('[data-ar-agent]');
    if (!hit) return;
    arOpenStaff(hit.getAttribute('data-ar-agent'), hit.getAttribute('data-ar-office'), 'total', '代管業務');
  };
  $('btnQuery').onclick = () => { state.page = 1; renderAll(); };
  function dashApiBases() {
    const here = location.origin;
    const extra = [];
    if (here.indexOf(':8768') < 0) extra.push('http://127.0.0.1:8768');
    if (here.indexOf(':8765') < 0) extra.push('http://127.0.0.1:8765');
    return extra.concat([here]);
  }
  function skyfunPullSnippet() {
    return "(function(){var a=['http://127.0.0.1:8768/skyfun-pull.js','http://127.0.0.1:8765/skyfun-pull.js'];(function n(i){if(i>=a.length)return;fetch(a[i]+'?t='+Date.now()).then(function(r){if(!r.ok)throw 0;return r.text()}).then(function(t){eval(t)}).catch(function(){n(i+1)})})(0)})();";
  }
  async function dashApi(path, opts) {
    const o = opts || {};
    let last = null;
    const bases = dashApiBases();
    for (let i = 0; i < bases.length; i++) {
      try {
        const res = await fetch(bases[i] + path, o);
        if (res.status !== 404) return res;
        last = new Error('找不到更新服務');
      } catch (err) { last = err; }
    }
    throw last || new Error('儀表板服務未開啟');
  }
  async function runDashUpdate() {
    const btn = $('btnUpdate');
    if (!btn || btn.disabled) return;
    if (typeof window.mgrReportRefresh !== 'function') {
      toast('更新服務尚未就緒', 4000);
      return;
    }
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = '更新中…';
    try {
      const res = await window.mgrReportRefresh();
      toast((res && res.message) || '已排入更新，完成前仍顯示上一版', 5000);
    } catch (err) {
      toast((err && err.message) || '更新失敗', 5000);
    }
    if (btn) { btn.disabled = false; btn.textContent = prev; }
  }
  if ($('btnUpdate')) $('btnUpdate').onclick = runDashUpdate;
  renderAll();
})();
