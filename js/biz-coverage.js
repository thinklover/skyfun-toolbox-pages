/**
 * 業務專區｜誠信險與工具箱
 * 誠信險投保率 × 工具箱綁定，對照公司系統在職業務，正職／兼職分開。
 */
(function () {
  'use strict';
  var FORCE_DEPLOY_ESCROW_STAFF = '20261107f';

  const COVER_GOAL = 100;
  const OFFICES = [
    '北一處', '北二處', '北三處', '北四處', '北五處', '基一處', '宜一處',
    '桃一處', '竹一處', '中一處', '中二處', '中三處', '中四處', '中五處', '中六處',
    '彰一處', '投一處', '嘉一處', '南一處', '南二處', '高一處', '高二處'
  ];
  const REGIONS = [
    { id: 'north', label: '北區', tone: 'north', places: '台北・新北・基隆・宜蘭', teams: ['北一處', '北二處', '北三處', '北四處', '北五處', '基一處', '宜一處'] },
    { id: 'central', label: '中區', tone: 'mid', places: '桃園・新竹・台中・彰化・南投・嘉義', teams: ['桃一處', '竹一處', '中一處', '中二處', '中三處', '中四處', '中五處', '中六處', '彰一處', '投一處', '嘉一處'] },
    { id: 'south', label: '南區', tone: 'south', places: '台南', teams: ['南一處', '南二處', '南區（葉建志）'] },
    { id: 'kh', label: '高雄', tone: 'kh', places: '高雄', teams: ['高一處', '高二處'] }
  ];
  const KINDS = [
    { id: 'all', label: '全部' },
    { id: '正職', label: '正職' },
    { id: '兼職', label: '兼職' }
  ];

  const state = {
    loading: false,
    loaded: false,
    error: '',
    hrError: '',
    sheetError: '',
    people: [],
    hrAllNames: [],
    insured: [],
    production: null,
    users: [],
    cases: [],
    calls: new Map(),
    casesLoaded: false,
    caseError: '',
    caseTries: 0,
    callError: '',
    openPerson: '',
    kind: 'all',
    openRegion: { ins: '', box: '' },
    openOffice: { ins: '', box: '' },
    rateHistory: [],
    rateHistoryError: '',
    rateHistoryLoaded: false,
    /** day｜week｜month：由每日快照彙整 */
    rateTrendRange: 'day',
    /** 點全區投保率／綁定率才展開五線圖 */
    rateTrendOpen: false,
    /** 第二排序：代管件數；desc=多→少、asc=少→多（第一排序固定營業處北→南） */
    idleSortDir: 'desc',
    busySortDir: 'desc'
  };

  const TREND_SERIES = [
    { id: '', name: '全區', color: '#0f766e' },
    { id: 'north', name: '北區', color: '#2563eb' },
    { id: 'central', name: '中區', color: '#d97706' },
    { id: 'south', name: '南區', color: '#059669' },
    { id: 'kh', name: '高雄', color: '#c026d3' }
  ];

  const CALL_FIELDS = [
    ['landlordDone', '房東電訪完畢'],
    ['tenantDone', '房客電訪完畢'],
    ['serviceDone', '服務狀況'],
    ['paymentDone', '款項收付'],
    ['anomalyDone', '有無異常']
  ];

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function norm(s) {
    return String(s || '')
      .replace(/\s+/g, '')
      .replace(/[（(].*$/, '')
      .replace(/廸/g, '迪')
      .replace(/峯/g, '峰')
      .replace(/啓/g, '啟')
      .replace(/爲/g, '為')
      .trim();
  }

  function token() {
    return window.skyfunAuth?.getToken?.() || '';
  }

  /** 誠信險／工具箱綁定：已取消頁面密碼，登入即可看 */
  function gateOpen() {
    return true;
  }

  function rpaBase() {
    return String(window.SKYFUN_RPA_BASE || 'https://skyfun-arrears-rpa.dahwork123.workers.dev').replace(/\/$/, '');
  }

  function pages() {
    return [
      { mode: 'ins', el: document.getElementById('page-business-coverage') },
      { mode: 'box', el: document.getElementById('page-business-toolbox') }
    ].filter((page) => page.el);
  }

  function viewer() {
    const user = window.skyfunAuth?.getUser?.() || {};
    return {
      name: String(user.name || '').trim(),
      team: String(user.team || '').trim(),
      title: String(user.jobTitle || user.job_title || '').trim()
    };
  }

  function officeKey(value) {
    return String(value || '').replace(/\s+/g, '').replace(/營業處|管理部/g, '');
  }

  function canCheck() {
    const title = viewer().title;
    return title === '營業處經理' || title === '儲備處經理' || title === '儲備營業處經理';
  }

  function casesFor(name) {
    const key = norm(name);
    return state.cases
      .filter((row) => norm(row.salesName) === key)
      .sort((a, b) => String(a.leaseStart || '9999').localeCompare(String(b.leaseStart || '9999'))
        || String(a.matchNo).localeCompare(String(b.matchNo)));
  }

  function rocDate(iso) {
    const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return '—';
    return `${Number(match[1]) - 1911}/${match[2]}/${match[3]}`;
  }

  function clock(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear() - 1911}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function ringPct(done, total) {
    if (state.hrError || !total) return null;
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  }

  /** 與行政點數良率同一套：≥90% 綠、≥80% 黃、其餘紅 */
  function coverColor(pct) {
    if (pct == null) return '#94a3b8';
    if (pct >= 90) return '#16a34a';
    if (pct >= 80) return '#f59e0b';
    return '#dc2626';
  }

  function coverDonut(done, total) {
    const known = !state.hrError;
    const pct = known ? ringPct(done, total) : null;
    const text = !known ? '無資料' : pct == null ? '—' : pct >= 100 ? '100%' : `${pct}%`;
    const CH = window.AdminPointsCharts;
    if (CH && typeof CH.donut === 'function') {
      return CH.donut({
        value: pct,
        text,
        sub: `目標 ${COVER_GOAL}%`,
        color: coverColor(pct),
        marks: [COVER_GOAL]
      });
    }
    const r = 42;
    const c = 2 * Math.PI * r;
    const dash = pct == null ? 0 : (pct / 100) * c;
    const a = (COVER_GOAL / 100) * 2 * Math.PI - Math.PI / 2;
    return `<svg class="apc-donut" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="13"/>
      ${pct == null ? '' : `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${coverColor(pct)}" stroke-width="13" stroke-linecap="round" stroke-dasharray="${dash} ${c}" transform="rotate(-90 60 60)"/>`}
      <line x1="${60 + Math.cos(a) * 34}" y1="${60 + Math.sin(a) * 34}" x2="${60 + Math.cos(a) * 54}" y2="${60 + Math.sin(a) * 54}" stroke="#0f172a" stroke-width="2"/>
      <text x="60" y="60" text-anchor="middle" class="apc-donut-main">${esc(text)}</text>
      <text x="60" y="78" text-anchor="middle" class="apc-donut-sub">目標 ${COVER_GOAL}%</text>
    </svg>`;
  }

  function ringHtml(done, total, modeTone, label) {
    return `<div class="cv-ring ${modeTone || ''}">
      <div class="cv-ring-fig" aria-hidden="true">${coverDonut(done, total)}</div>
      ${label ? `<span class="cv-ring-k">${esc(label)}</span>` : ''}
    </div>`;
  }

  function gaugeHtml(done, total, modeTone, label, meta, extraClass) {
    const known = !state.hrError;
    const pct = ringPct(done, total);
    return `<div class="cv-gauge${extraClass ? ` ${extraClass}` : ''}">
      <span class="cv-gauge-ring">${coverDonut(done, total)}</span>
      <div class="cv-gauge-text">
        <span class="cv-gauge-label">${esc(label)}</span>
        <span class="cv-gauge-meta">${known && total != null ? `<b>${done}</b>／${total} 人` : '無資料'}${meta ? ` · ${esc(meta)}` : ''}</span>
        <small>${known && pct != null ? `完成率 ${pct}% · 目標 ${COVER_GOAL}%` : '人事未對上'}</small>
      </div>
    </div>`;
  }

  function isBizOffice(office) {
    const o = String(office || '').trim();
    if (!o || /業務支援|行政管理|管理部|財務|會計|客服|資訊|總務|租賃管理/.test(o)) return false;
    return OFFICES.includes(o) || REGIONS.some((r) => r.teams.includes(o));
  }

  /** 誠信險／工具箱綁定不列入 */
  const EXCLUDE_NAMES = new Set(['尤聖權']);

  function scopedPeople() {
    const kind = state.kind === '正職' || state.kind === '兼職' ? state.kind : 'all';
    return state.people.filter((person) => {
      if (kind !== 'all' && person.kind !== kind) return false;
      if (person.lane === 'rent') return false;
      const name = String(person.name || '').trim();
      if (EXCLUDE_NAMES.has(norm(name))) return false;
      if (name === '公司' || name === '本公司' || name === '星鴻') return false;
      return isBizOffice(person.office);
    });
  }

  function isBizOrRent(person) {
    const title = String(person.title || '');
    return /業務/.test(title) || /租管師|租賃管理師/.test(title);
  }

  function ofOffice(office, mode) {
    return scopedPeople(mode).filter((p) => p.office === office);
  }

  function tally(list) {
    return {
      total: list.length,
      insured: list.filter((p) => p.insured).length,
      bound: list.filter((p) => p.bound).length
    };
  }

  /** 代管＝累積代管已生效件數（與新媒合分開） */
  function escrowTotal(name) {
    const prod = state.production;
    if (!prod || !Array.isArray(prod.counts)) return null;
    const hit = prod.counts.find((row) => norm(row.name) === norm(name));
    if (hit) return Number(hit.total) || 0;
    return prod.cumulativeError ? null : 0;
  }

  /** 新案＝115/11/1 起新媒合（coverage-new-cases），不是代管累計 */
  function newMatchCount(name) {
    if (!state.casesLoaded) return null;
    if (state.caseError && !(state.cases || []).length) return null;
    return casesFor(name).length;
  }

  function personSub(person, extraBits) {
    const bits = [
      person.title,
      person.kind !== '未分類' ? person.kind : '',
      person.office
    ];
    const neu = newMatchCount(person.name);
    if (neu == null) bits.push(state.casesLoaded ? '新媒合無資料' : '新媒合讀取中');
    else bits.push(`新案 ${neu}`);
    [].concat(extraBits || []).filter(Boolean).forEach((bit) => bits.push(bit));
    return bits.filter(Boolean).join(' · ');
  }

  function personLine(person, extraBits) {
    const sub = personSub(person, extraBits);
    return `<div class="cv-person">
      <div class="cv-person-name">${esc(person.name)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>
    </div>`;
  }

  function personHit(person, extraBits) {
    const on = norm(state.openPerson) === norm(person.name);
    const sub = personSub(person, extraBits);
    return `<button type="button" class="cv-person-hit${on ? ' is-on' : ''}" data-cv-person="${esc(person.name)}" aria-expanded="${on ? 'true' : 'false'}">
      <b>${esc(person.name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}
    </button>`;
  }

  function personBlock(person, extraBits) {
    const open = norm(state.openPerson) === norm(person.name) && !person.insured;
    return `<div class="cv-person-block${open ? ' is-open' : ''}">
      ${personHit(person, extraBits)}
      ${open ? casePanel(person) : ''}
    </div>`;
  }

  function nameColumn(tone, title, people, emptyText, foot, clickable) {
    const rows = people.map((p) => (
      clickable ? personBlock(p.person || p, p.extra || '') : personLine(p.person || p, p.extra || '')
    )).join('');
    return `<section class="cv-col cv-col--${tone}">
      <h4>${esc(title)}<small>${people.length}</small></h4>
      ${rows || `<p class="cv-empty">${esc(emptyText)}</p>`}
      ${foot || ''}
    </section>`;
  }

  function peopleIn(teams, mode) {
    const set = new Set(teams);
    return scopedPeople(mode).filter((person) => set.has(person.office));
  }

  function officeRoster(office) {
    const kind = state.kind === '正職' || state.kind === '兼職' ? state.kind : 'all';
    return state.people.filter((person) => {
      if (person.office !== office) return false;
      if (!isBizOffice(person.office)) return false;
      const name = String(person.name || '').trim();
      if (EXCLUDE_NAMES.has(norm(name))) return false;
      if (name === '公司' || name === '本公司' || name === '星鴻') return false;
      if (kind !== 'all' && person.kind !== kind) return false;
      return person.lane !== 'rent';
    });
  }

  function officeCard(office, mode) {
    const list = ofOffice(office, mode);
    const stat = tally(list);
    const open = state.openOffice[mode] === office;
    const tone = mode === 'ins' ? 'ins' : 'box';
    const done = mode === 'ins' ? stat.insured : stat.bound;
    const ringLabel = mode === 'ins' ? '誠信險投保' : '工具箱綁定';
    let detail = '';
    if (open && mode === 'ins') {
      const roster = officeRoster(office);
      const insured = roster.filter((person) => person.insured).map((person) => ({ person }));
      const uninsured = roster.filter((person) => !person.insured).map((person) => ({ person }));
      /* 投保／查無都只比姓名，不看處別 */
      const hrNames = new Set(
        (state.hrAllNames.length ? state.hrAllNames : state.people.map((p) => p.name)).map((n) => norm(n))
      );
      const orphanNames = [];
      const orphanSeen = new Set();
      state.insured.forEach((row) => {
        if (row.office !== office) return;
        const name = norm(row.name);
        if (!name || orphanSeen.has(name) || hrNames.has(name)) return;
        orphanSeen.add(name);
        orphanNames.push(row.name);
      });
      const orphanFoot = orphanNames.length
        ? `<p class="cv-empty">名冊有、人事查無 ${orphanNames.length} 人：${esc(orphanNames.join('、'))}</p>`
        : '';
      detail = `<div class="cv-split">
        ${nameColumn('ok', '已投保誠信險', insured, '這處尚無已投保', '', false)}
        ${nameColumn('ins', '未投保誠信險', uninsured, '這處都有保', orphanFoot, true)}
      </div>`;
    } else if (open) {
      const bound = list.filter((person) => person.bound).map((person) => ({ person }));
      const unbound = list.filter((person) => !person.bound).map((person) => ({
        person,
        extra: person.toolboxTeam && person.toolboxTeam !== office ? `工具箱在${person.toolboxTeam}` : ''
      }));
      detail = `<div class="cv-split">
        ${nameColumn('ok', '已使用工具箱', bound, '這處尚無已綁定', '', false)}
        ${nameColumn('box', '未使用工具箱', unbound, '這處都有綁定', '', false)}
      </div>`;
    }
    const pct = ringPct(done, stat.total);
    return `<article class="cv-office${open ? ' is-open' : ''}">
      <button type="button" class="cv-office-hit" data-cv-office="${esc(office)}" data-cv-mode="${mode}" aria-expanded="${open ? 'true' : 'false'}">
        <span class="cv-office-top">
          <span class="cv-office-id"><b>${esc(office)}</b><i>${open ? '收合' : '看名單'}</i></span>
          <span class="cv-office-stat"><strong>${pct == null ? '—' : `${pct}%`}</strong><small>${done}／${stat.total}</small></span>
        </span>
        <div class="cv-rings">${ringHtml(done, stat.total, tone, ringLabel)}</div>
      </button>
      ${detail}
    </article>`;
  }

  function peopleForSnapshot() {
    return state.people.filter((person) => {
      if (person.lane === 'rent') return false;
      const name = String(person.name || '').trim();
      if (name === '公司' || name === '本公司' || name === '星鴻') return false;
      return isBizOffice(person.office);
    });
  }

  function taipeiDayIso() {
    const date = new Date(Date.now() + 8 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 10);
  }

  function rocShortDay(iso) {
    const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return String(iso || '');
    return `${Number(match[2])}/${Number(match[3])}`;
  }

  function parseIsoDay(iso) {
    const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }

  function mondayKey(iso) {
    const d = parseIsoDay(iso);
    if (!d) return String(iso || '');
    const dow = d.getUTCDay(); // 0=Sun
    const offset = dow === 0 ? -6 : 1 - dow;
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  }

  function monthKey(iso) {
    const match = String(iso || '').match(/^(\d{4})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}` : String(iso || '');
  }

  function weekLabel(mondayIso) {
    const start = parseIsoDay(mondayIso);
    if (!start) return rocShortDay(mondayIso) + '週';
    const end = new Date(start.getTime());
    end.setUTCDate(end.getUTCDate() + 6);
    const a = `${start.getUTCMonth() + 1}/${start.getUTCDate()}`;
    const b = `${end.getUTCMonth() + 1}/${end.getUTCDate()}`;
    return `${a}–${b}`;
  }

  function monthLabel(ym) {
    const match = String(ym || '').match(/^(\d{4})-(\d{2})/);
    if (!match) return String(ym || '');
    const roc = Number(match[1]) - 1911;
    return `${roc}/${Number(match[2])}`;
  }

  function regionSnapshotOf(row, regionId) {
    if (!regionId) {
      return {
        insPct: row.insPct == null ? null : Number(row.insPct),
        boxPct: row.boxPct == null ? null : Number(row.boxPct)
      };
    }
    const bag = row && row.regions && row.regions[regionId];
    if (!bag) return { insPct: null, boxPct: null };
    return {
      insPct: bag.insPct == null ? null : Number(bag.insPct),
      boxPct: bag.boxPct == null ? null : Number(bag.boxPct)
    };
  }

  /** 區間彙整：取該週／月最後一筆快照（比率為時點值）；regionId 空＝全區 */
  function rateHistoryBuckets(days, range, regionId) {
    const list = Array.isArray(days) ? days.slice() : [];
    list.sort((a, b) => String(a.day).localeCompare(String(b.day)));
    if (range === 'day' || !range) {
      return list.map((row) => {
        const pct = regionSnapshotOf(row, regionId);
        return {
          key: row.day,
          label: rocShortDay(row.day),
          insPct: pct.insPct,
          boxPct: pct.boxPct,
          day: row.day
        };
      });
    }
    const map = new Map();
    list.forEach((row) => {
      const key = range === 'week' ? mondayKey(row.day) : monthKey(row.day);
      map.set(key, row);
    });
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, row]) => {
        const pct = regionSnapshotOf(row, regionId);
        return {
          key,
          label: range === 'week' ? weekLabel(key) : monthLabel(key),
          insPct: pct.insPct,
          boxPct: pct.boxPct,
          day: row.day
        };
      });
  }

  function liveRegionSnapshots() {
    const pool = peopleForSnapshot();
    const out = {};
    REGIONS.forEach((region) => {
      const list = pool.filter((person) => region.teams.includes(person.office));
      const stat = tally(list);
      out[region.id] = {
        total: stat.total,
        insDone: stat.insured,
        boxDone: stat.bound,
        insPct: ringPct(stat.insured, stat.total),
        boxPct: ringPct(stat.bound, stat.total)
      };
    });
    return out;
  }

  function mergeLiveRegionsIntoHistory(days) {
    const list = Array.isArray(days) ? days.slice() : [];
    const today = taipeiDayIso();
    const live = liveRegionSnapshots();
    const idx = list.findIndex((row) => String(row.day) === today);
    if (idx < 0) return list;
    const row = Object.assign({}, list[idx]);
    row.regions = Object.assign({}, row.regions || {}, live);
    list[idx] = row;
    return list;
  }

  function rateTrendRangeBar() {
    const cur = state.rateTrendRange === 'week' || state.rateTrendRange === 'month'
      ? state.rateTrendRange
      : 'day';
    const opts = [
      ['day', '日'],
      ['week', '周'],
      ['month', '月']
    ];
    return `<div class="cv-trend-range" role="group" aria-label="圖表區間">
      ${opts.map(([id, label]) =>
        `<button type="button" class="cv-trend-range-btn${cur === id ? ' is-on' : ''}" data-cv-trend-range="${id}">${label}</button>`
      ).join('')}
    </div>`;
  }

  function rateTrendHtml(mode) {
    if (!state.rateTrendOpen) return '';
    const metric = mode === 'box' ? 'box' : 'ins';
    const metricLabel = metric === 'box' ? '綁定率' : '投保率';
    const rawDays = state.rateHistory || [];
    if (!state.rateHistoryLoaded) {
      return `<section class="cv-zone cv-trend-zone is-open">
        <h4 class="cv-sec-title">${esc(metricLabel)}變化<small>讀取中</small></h4>
        <p class="cv-note">正在讀每日快照…</p>
      </section>`;
    }
    if (state.rateHistoryError && !rawDays.length) {
      return `<section class="cv-zone cv-trend-zone is-open">
        <div class="cv-trend-head">
          <h4 class="cv-sec-title">${esc(metricLabel)}變化</h4>
          <button type="button" class="cv-trend-close" data-cv-trend-toggle>收合</button>
        </div>
        <p class="cv-note">${esc(state.rateHistoryError)}</p>
      </section>`;
    }
    if (!rawDays.length) {
      return `<section class="cv-zone cv-trend-zone is-open">
        <div class="cv-trend-head">
          <h4 class="cv-sec-title">${esc(metricLabel)}變化<small>每日自動留點</small></h4>
          ${rateTrendRangeBar()}
          <button type="button" class="cv-trend-close" data-cv-trend-toggle>收合</button>
        </div>
        <p class="cv-note">今天起會開始累積；打開本頁就會寫入當日全區與各區比率。</p>
      </section>`;
    }
    const range = state.rateTrendRange === 'week' || state.rateTrendRange === 'month'
      ? state.rateTrendRange
      : 'day';
    const days = mergeLiveRegionsIntoHistory(rawDays);
    const baseBuckets = rateHistoryBuckets(days, range, '');
    const labels = baseBuckets.map((row) => row.label);
    const lines = TREND_SERIES.map((series, idx) => {
      const buckets = rateHistoryBuckets(days, range, series.id);
      const byKey = new Map(buckets.map((row) => [row.key, row]));
      const values = baseBuckets.map((row) => {
        const hit = byKey.get(row.key);
        if (!hit) return null;
        const v = metric === 'box' ? hit.boxPct : hit.insPct;
        return v == null ? null : Number(v);
      });
      return {
        name: series.name,
        values,
        color: series.color,
        area: idx === 0,
        thick: idx === 0,
        dash: false
      };
    });
    const hasPoint = lines.some((line) => line.values.some((v) => v != null));
    const allVals = lines.flatMap((line) => line.values).filter((v) => v != null && Number.isFinite(v));
    let yMin = 0;
    let yMax = 100;
    let yStep = 20;
    if (allVals.length) {
      const lo = Math.min(...allVals);
      const hi = Math.max(...allVals);
      const span = Math.max(8, hi - lo);
      const pad = Math.max(4, span * 0.22);
      yMin = Math.max(0, Math.floor((lo - pad) / 5) * 5);
      yMax = Math.min(100, Math.ceil((hi + pad) / 5) * 5);
      if (yMax - yMin < 12) {
        yMin = Math.max(0, yMin - 5);
        yMax = Math.min(100, yMax + 5);
      }
      const yRange = yMax - yMin;
      yStep = yRange <= 20 ? 5 : yRange <= 40 ? 10 : 20;
    }
    const rankRows = TREND_SERIES.map((series, idx) => {
      const vals = lines[idx].values;
      let last = null;
      let prev = null;
      for (let i = vals.length - 1; i >= 0; i -= 1) {
        if (vals[i] == null) continue;
        if (last == null) last = vals[i];
        else { prev = vals[i]; break; }
      }
      const delta = last != null && prev != null ? last - prev : null;
      return { series, last, delta };
    })
      .filter((row) => row.last != null)
      .sort((a, b) => b.last - a.last);
    const latestChips = rankRows.map((row, rank) => {
      const gap = Math.max(0, COVER_GOAL - row.last);
      const deltaCls = row.delta == null ? 'is-flat' : row.delta > 0 ? 'is-up' : row.delta < 0 ? 'is-down' : 'is-flat';
      const deltaTxt = row.delta == null
        ? '—'
        : `${row.delta > 0 ? '+' : ''}${Math.round(row.delta)}`;
      return `<article class="cv-trend-rank" style="--leg:${esc(row.series.color)}">
        <span class="cv-trend-rank-n">#${rank + 1}</span>
        <div class="cv-trend-rank-main">
          <b>${esc(row.series.name)}</b>
          <strong>${Math.round(row.last)}%</strong>
        </div>
        <em class="cv-trend-delta ${deltaCls}">${esc(deltaTxt)}</em>
        <span class="cv-trend-bar" aria-hidden="true"><i style="width:${Math.max(4, Math.min(100, row.last))}%"></i></span>
        <small class="cv-trend-gap">距目標還差 ${Math.round(gap)}%</small>
      </article>`;
    }).join('');
    const CH = window.AdminPointsCharts;
    const chart = !hasPoint
      ? '<p class="cv-note">尚無可用快照點。</p>'
      : CH && typeof CH.trend === 'function'
        ? CH.trend({
          id: 'cv-rate-trend-5-' + metric + '-' + range,
          labels,
          lines,
          // 目標 100% 不畫進縮放後的 Y，以免把差異壓扁；改在排名卡顯示距目標
          fmt: (v) => `${Math.round(v)}%`,
          min: yMin,
          max: yMax,
          step: yStep,
          pointLabels: 'last',
          width: 960,
          height: 320,
          padL: 52,
          padR: 28,
          padT: 28
        })
        : '<p class="cv-note">圖表元件讀不到。</p>';
    const rangeHint = range === 'week'
      ? `五區${metricLabel} · 每周最後快照（${labels.length} 週）· Y 軸依資料縮放`
      : range === 'month'
        ? `五區${metricLabel} · 每月最後快照（${labels.length} 月）· Y 軸依資料縮放`
        : `五區${metricLabel} · 每日快照（${labels.length} 點）· Y 軸依資料縮放`;
    return `<section class="cv-zone cv-trend-zone is-open">
      <div class="cv-trend-head">
        <h4 class="cv-sec-title">${esc(metricLabel)}變化<small>${esc(rangeHint)}</small></h4>
        ${rateTrendRangeBar()}
        <button type="button" class="cv-trend-close" data-cv-trend-toggle>收合</button>
      </div>
      <div class="cv-trend-legend" aria-hidden="true">
        ${TREND_SERIES.map((s) =>
          `<span class="cv-trend-leg" style="--leg:${esc(s.color)}">${esc(s.name)}</span>`
        ).join('')}
      </div>
      <div class="cv-trend-latest cv-trend-latest--rank">${latestChips || '<p class="cv-note">尚無最新比率。</p>'}</div>
      <div class="cv-trend-chart cv-trend-chart--wide">${chart}</div>
    </section>`;
  }

  function boardHtml(mode) {
    const tone = mode === 'ins' ? 'ins' : 'box';
    const title = mode === 'ins' ? '誠信險' : '工具箱綁定';
    const companyLabel = mode === 'ins' ? '全區投保率' : '全區綁定率';
    const all = tally(scopedPeople(mode));
    const companyDone = mode === 'ins' ? all.insured : all.bound;
    const openId = state.openRegion[mode];
    const openRegion = REGIONS.find((item) => item.id === openId) || null;
    const regionCards = REGIONS.map((item) => {
      const teams = regionOffices(item, mode);
      if (!teams.length) return '';
      const stat = tally(peopleIn(teams, mode));
      const done = mode === 'ins' ? stat.insured : stat.bound;
      const on = openId === item.id;
      const dim = openId && !on;
      const pct = ringPct(done, stat.total);
      const officePills = teams.length
        ? `<span class="cv-region-offices">${teams.map((office) => `<i>${esc(office)}</i>`).join('')}</span>`
        : '<span class="cv-region-offices"><em class="cv-region-none">這區沒有營業處</em></span>';
      return `<button type="button" class="cv-region-card cv-region-card--${item.tone}${on ? ' is-on' : ''}${dim ? ' is-dim' : ''}" data-cv-region="${esc(item.id)}" data-cv-mode="${mode}" aria-expanded="${on ? 'true' : 'false'}">
        <span class="cv-region-top">
          <span class="cv-region-avatar" aria-hidden="true">${esc(item.label.slice(0, 1))}</span>
          <span class="cv-region-id"><b>${esc(item.label)}</b><i class="cv-area-pill">${esc(item.label)}</i></span>
          <span class="cv-region-stat"><strong>${pct == null ? '—' : `${pct}%`}</strong><small>${done}／${stat.total} 人</small></span>
        </span>
        ${dim ? '' : officePills}
        ${dim ? '' : `<span class="cv-region-foot">
          <span class="cv-region-places" title="${esc(item.places || '')}">📍 ${esc(item.places || '—')}</span>
          ${on ? '<span class="cv-region-back">✕ 看全部</span>' : ''}
        </span>`}
      </button>`;
    }).join('');
    const offices = openRegion
      ? `<section class="cv-zone">
          <h4 class="cv-sec-title">${esc(openRegion.label)}營業處<small>點處別看未${mode === 'ins' ? '投保' : '綁定'}名單</small></h4>
          <div class="cv-offices">${regionOffices(openRegion, mode).map((office) => officeCard(office, mode)).join('')}</div>
        </section>`
      : '';
    const cols = REGIONS.filter((item) => regionOffices(item, mode).length)
      .map((item) => (!openId ? 'minmax(0, 1fr)' : item.id === openId ? 'minmax(0, 2.2fr)' : 'minmax(0, 0.85fr)'))
      .join(' ');
    return `<section class="cv-board cv-board--${mode}">
      <div class="cv-sub-bar">
        <span class="cv-sub-note"><b>${esc(title)}</b> · ${companyLabel} <b>${ringPct(companyDone, all.total) == null ? '無資料' : `${ringPct(companyDone, all.total)}%`}</b>（${companyDone}／${all.total}） · 點上方區域卡片可展開營業處</span>
      </div>
      <section class="cv-zone">
        <h4 class="cv-sec-title">${esc(companyLabel)}<small>全區總覽 · 點下方卡片可看五區${mode === 'ins' ? '投保' : '綁定'}變化圖</small></h4>
        <div class="cv-gauges">
          <button type="button" class="cv-gauge-hit${state.rateTrendOpen ? ' is-on' : ''}" data-cv-trend-toggle aria-expanded="${state.rateTrendOpen ? 'true' : 'false'}">
            ${gaugeHtml(companyDone, all.total, tone, companyLabel, '全區', 'cv-gauge--wide')}
            <span class="cv-gauge-hit-hint">${state.rateTrendOpen ? '點一下收合變化圖' : '點開看全區＋北中南高雄五條線'}</span>
          </button>
        </div>
      </section>
      ${rateTrendHtml(mode)}
      <section class="cv-zone">
        <h4 class="cv-sec-title">各區進度<small>${openRegion ? '再點一次選中的卡片回到全部' : '點卡片只看該區'}</small></h4>
        <div class="cv-region-cards${openId ? ' has-pick' : ''}" style="grid-template-columns:${cols || 'repeat(4, minmax(0, 1fr))'}">${regionCards}</div>
      </section>
      ${offices}
      ${mode === 'ins' ? flagHtml() : ''}
    </section>`;
  }

  function regionOffices(region, mode) {
    return region.teams.filter((team) =>
      OFFICES.includes(team) || ofOffice(team, mode).length || (mode === 'ins' && state.insured.some((row) => row.office === team))
    );
  }

  function renderBody(mode) {
    const waiting = mode === 'ins'
      ? '正在讀今天早上的誠信險資料…'
      : '正在讀今天早上的工具箱綁定…';
    if (state.loading && !state.loaded) return `<p class="cv-note">${waiting}</p>`;
    if (!token()) return '<p class="cv-error">請先登入工具箱，才能對照公司系統人事。</p>';
    const filters = KINDS.map((k) =>
      `<button type="button" class="cv-pill${state.kind === k.id ? ' is-on' : ''}" data-cv-kind="${esc(k.id)}">${esc(k.label)}</button>`
    ).join('');
    return `<div class="cv-toolbar">
        <div class="cv-pills" role="tablist">${filters}</div>
        <button type="button" class="cv-refresh" data-cv-refresh>重新整理</button>
      </div>
      ${state.error ? `<p class="cv-error">${esc(state.error)}</p>` : ''}
      ${state.hrError ? `<p class="cv-error">人事：${esc(state.hrError)}。比率顯示無資料。</p>` : ''}
      ${mode === 'ins' && state.sheetError ? `<p class="cv-note">名冊：${esc(state.sheetError)}</p>` : ''}
      <div class="cv-boards">
        ${boardHtml(mode)}
      </div>`;
  }

  function officeSortRank(office) {
    const o = String(office || '').trim();
    const idx = OFFICES.indexOf(o);
    if (idx >= 0) return idx;
    /* 南區別名等：盡量排在南區附近 */
    if (/南區/.test(o)) {
      const south = OFFICES.indexOf('南一處');
      return south >= 0 ? south : OFFICES.length;
    }
    return OFFICES.length + 1;
  }

  function sortIdleRows(list, dir) {
    const sign = dir === 'asc' ? 1 : -1;
    return list.slice().sort((a, b) => {
      const off = officeSortRank(a.person.office) - officeSortRank(b.person.office);
      if (off) return off;
      const ea = escrowTotal(a.person.name);
      const eb = escrowTotal(b.person.name);
      const na = ea == null ? -1 : ea;
      const nb = eb == null ? -1 : eb;
      if (na !== nb) return (na - nb) * sign;
      return String(a.person.name || '').localeCompare(String(b.person.name || ''), 'zh-Hant');
    });
  }

  function sortBusyRows(list, dir) {
    const sign = dir === 'asc' ? 1 : -1;
    return list.slice().sort((a, b) => {
      const off = officeSortRank(a.person.office) - officeSortRank(b.person.office);
      if (off) return off;
      if (a.total !== b.total) return (a.total - b.total) * sign;
      return String(a.person.name || '').localeCompare(String(b.person.name || ''), 'zh-Hant');
    });
  }

  function sortToggleHtml(which, dir, secondaryLabel) {
    const arrow = dir === 'asc' ? '少→多' : '多→少';
    return `<div class="cv-sort-bar">
      <button type="button" class="cv-sort-btn" data-cv-sort="${which}" aria-pressed="${dir === 'asc' ? 'true' : 'false'}">
        排序：營業處（北→南） → ${esc(secondaryLabel)} · <b>${arrow}</b><small>點一下切換件數</small>
      </button>
    </div>`;
  }

  function flagActionHtml(which) {
    return `<div class="cv-flag-actions">
      <button type="button" class="cv-flag-act" data-cv-flag-copy="${which}">複製</button>
      <button type="button" class="cv-flag-act" data-cv-flag-xlsx="${which}">匯出 Excel</button>
    </div>`;
  }

  function buildFlagLists() {
    const prod = state.production;
    if (!prod || prod.error) return null;
    const months = prod.months || [];
    const label = months.map((month) => month.label).join('、') || '近兩個月';
    const countOf = new Map((prod.counts || []).map((row) => [norm(row.name), row]));
    const pool = scopedPeople();
    const rows = pool.filter((person) => !person.insured).map((person) => {
      const hit = countOf.get(norm(person.name));
      const bag = hit?.months || [0, 0];
      return { person, m1: Number(bag[0]) || 0, m2: Number(bag[1]) || 0, total: Number(hit?.total) || 0 };
    });
    const idle = sortIdleRows(
      rows.filter((row) => isBizOrRent(row.person) && row.m1 === 0 && row.m2 === 0),
      state.idleSortDir
    );
    const busy = sortBusyRows(
      rows.filter((row) => row.total >= 10),
      state.busySortDir
    );
    return { prod, label, idle, busy };
  }

  function flagFlatRows(which) {
    const pack = buildFlagLists();
    if (!pack) return [];
    const list = which === 'busy' ? pack.busy : pack.idle;
    return list.map((row) => {
      const neu = newMatchCount(row.person.name);
      const escrow = escrowTotal(row.person.name);
      return {
        name: row.person.name || '',
        title: row.person.title || '',
        kind: row.person.kind || '',
        office: row.person.office || '',
        newCases: neu == null ? '' : neu,
        escrow: escrow == null ? '' : escrow,
        m1: row.m1,
        m2: row.m2,
        total: row.total
      };
    });
  }

  function csvEscape(v) {
    const s = String(v ?? '');
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function flagSheetTitle(which) {
    return which === 'busy' ? '代管10件以上未保' : '連續兩個月未產件又未保';
  }

  function flagCopyText(which) {
    const rows = flagFlatRows(which);
    const title = flagSheetTitle(which);
    if (!rows.length) return title + '\n（沒有符合的人）';
    const head = which === 'busy'
      ? ['姓名', '職稱', '身分別', '營業處', '新案', '代管件數']
      : ['姓名', '職稱', '身分別', '營業處', '新案', '代管件數', '近兩月產件'];
    const lines = [title, head.join('\t')];
    rows.forEach((r) => {
      if (which === 'busy') {
        lines.push([r.name, r.title, r.kind, r.office, r.newCases, r.escrow].join('\t'));
      } else {
        lines.push([r.name, r.title, r.kind, r.office, r.newCases, r.escrow, '0'].join('\t'));
      }
    });
    return lines.join('\n');
  }

  function downloadFlagExcel(which) {
    const rows = flagFlatRows(which);
    const title = flagSheetTitle(which);
    const head = which === 'busy'
      ? ['姓名', '職稱', '身分別', '營業處', '新案', '代管件數']
      : ['姓名', '職稱', '身分別', '營業處', '新案', '代管件數', '近兩月產件'];
    const lines = [head];
    rows.forEach((r) => {
      if (which === 'busy') lines.push([r.name, r.title, r.kind, r.office, r.newCases, r.escrow]);
      else lines.push([r.name, r.title, r.kind, r.office, r.newCases, r.escrow, 0]);
    });
    const body = lines.map((row) => row.map(csvEscape).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + body], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = title + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function copyFlagList(which) {
    const text = flagCopyText(which);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        window.prompt('請手動複製：', text);
        return;
      }
      const btn = document.querySelector(`[data-cv-flag-copy="${which}"]`);
      if (btn) {
        const old = btn.textContent;
        btn.textContent = '已複製';
        setTimeout(() => { btn.textContent = old; }, 1200);
      }
    } catch (_) {
      window.prompt('請手動複製：', text);
    }
  }

  function flagHtml() {
    const prod = state.production;
    if (!prod) return '';
    if (prod.error) return `<p class="cv-note">產件：${esc(prod.error)}。未產件與代管 10 件名單暫不列出。</p>`;
    const pack = buildFlagLists();
    if (!pack) return '';
    const { label, idle, busy } = pack;
    const line = (row, extraBits) => personBlock(row.person, extraBits);
    const escrowNote = prod.cumulativeError
      ? `<p class="cv-note">代管：${esc(prod.cumulativeError)}。下列是目前已撈到的。</p>`
      : '';
    return `<div class="cv-flags">
      <section class="cv-flag">
        <div class="cv-flag-head">
          <h3>連續兩個月未產件又未保<small>${idle.length}</small></h3>
          ${idle.length ? flagActionHtml('idle') : ''}
        </div>
        <p>${esc(label)}產件都是 0（認列產件，不是新媒合），而且沒有投保。只列業務、租管師。人名下的「新案」另算 115/11/1 起新媒合。</p>
        <p class="cv-note">第一排序：營業處北→南；第二排序：代管件數（暫代未產件時間，可切換多／少）。</p>
        ${idle.length ? sortToggleHtml('idle', state.idleSortDir, '代管件數（暫代未產件時間）') : ''}
        ${idle.length ? `<div class="cv-flag-list">${idle.map((row) => line(row, [`近兩月產件 0`])).join('')}</div>` : '<p class="cv-empty">沒有符合的人。</p>'}
      </section>
      <section class="cv-flag">
        <div class="cv-flag-head">
          <h3>代管 10 件以上未保<small>${busy.length}</small></h3>
          ${busy.length ? flagActionHtml('busy') : ''}
        </div>
        <p>未投保、累積代管案件 10 件以上。人名下的「新案」另算 115/11/1 起新媒合，與代管件數分開。</p>
        ${escrowNote}
        ${busy.length ? sortToggleHtml('busy', state.busySortDir, '代管件數') : ''}
        ${busy.length
          ? `<div class="cv-flag-list">${busy.map((row) => line(row)).join('')}</div>`
          : '<p class="cv-empty">沒有符合的人。</p>'}
      </section>
    </div>`;
  }

  function scriptHtml() {
    return `<section class="cv-script">
      <h4>處長電訪範本</h4>
      <div class="cv-script-body">
        <p><b>開場說明</b>「您好，請問是○○先生／女士嗎？我是星鴻社會住宅○○營業處的處長○○。公司近期進行服務確認，想向您了解幾個狀況，大約耽誤您2～3分鐘，請問現在方便嗎？」</p>
        <p><b>1. 確認服務狀況</b>「目前主要是哪一位業務協助您呢？平常有事情需要協助時，是否聯繫得到，業務也有回覆或協助處理？」</p>
        <p><b>2. 確認款項收付</b>「租金、押金的金額及收付款對象，是否都與契約約定一致？有沒有不清楚或需要我們協助確認的地方？」</p>
        <p><b>3. 確認有無異常</b>「服務過程中，有沒有被要求支付事先沒有說明的費用？另外，有沒有向業務反映過，但一直沒有處理的事情？」</p>
        <p><b>結束說明</b>「謝謝您撥空協助確認。若有需要處理的事項，我會記錄並追蹤，再向您回覆。」</p>
      </div>
    </section>`;
  }

  function partyCell(name, phone) {
    return `<td class="cv-party"><b>${esc(name || '—')}</b><small>${esc(phone || '電話無資料')}</small></td>`;
  }

  function checkFieldHtml(key, label, saved, editable) {
    const time = key === 'landlordDone' ? clock(saved.landlordAt) : key === 'tenantDone' ? clock(saved.tenantAt) : '';
    return `<label class="cv-check">
      <input type="checkbox" data-cv-field="${key}"${saved[key] ? ' checked' : ''}${editable ? '' : ' disabled'}>
      <span>${esc(label)}${time ? `<small class="cv-when">${esc(time)}</small>` : ''}</span>
    </label>`;
  }

  function caseRowHtml(row) {
    const saved = state.calls.get(row.matchNo) || {};
    const editable = canCheck();
    const extension = state.extDraft && state.extDraft[row.matchNo] != null
      ? state.extDraft[row.matchNo]
      : (saved.extension || '');
    const checks = CALL_FIELDS.map(([key, label]) => checkFieldHtml(key, label, saved, editable)).join('');
    const label = row.matchLabel || row.matchNo;
    return `<tr data-cv-case="${esc(row.matchNo)}">
      <td><b>${esc(label)}</b><small>${esc(row.address || '地址無資料')}</small></td>
      <td>${esc(rocDate(row.leaseStart))}</td>
      ${partyCell(row.landlordName, row.landlordPhone)}
      ${partyCell(row.tenantName, row.tenantPhone)}
      <td><input class="cv-ext" type="text" data-cv-field="extension" inputmode="numeric" maxlength="8" placeholder="輸入分機" value="${esc(extension)}"${editable ? '' : ' disabled'}></td>
      <td class="cv-checks">
        <p class="cv-check-hint">確認無誤請打勾</p>
        ${checks}
      </td>
      <td><textarea class="cv-remark" data-cv-field="note" rows="4" maxlength="500" placeholder="填寫電訪狀況"${editable ? '' : ' disabled'}>${esc(saved.note || '')}</textarea></td>
    </tr>`;
  }

  function casePanel(person) {
    if (!person || person.insured) return '';
    const rows = casesFor(person.name);
    const mine = canCheck();
    const me = viewer();
    const note = mine
      ? '分機直接輸入。勾房東、房客電訪完畢，各自記下當下時間。再點一次名字可收合。'
      : `只有營業處經理、儲備處經理可以填。你現在是${me.team || '未分處'} ${me.title || '未設職稱'}。`;
    const body = state.caseError
      ? `<p class="cv-empty">無資料。${esc(state.caseError)}</p>`
      : !state.casesLoaded
        ? '<p class="cv-empty">正在讀早上更新的案件…</p>'
        : rows.length
          ? `<div class="cv-table-wrap"><table class="cv-table">
              <thead><tr><th>案件</th><th>起租</th><th>房東</th><th>房客</th><th>分機</th><th>電訪勾選</th><th>備註</th></tr></thead>
              <tbody>${rows.map(caseRowHtml).join('')}</tbody>
            </table></div>`
          : '<p class="cv-empty">115/11/1 起沒有新媒合（只認預審通過／複審通過／複審退件／待產編／已生效；不含再媒合／續約／一般宅／電服／爬蟲）。</p>';
    return `<section class="cv-cases">
      <p class="cv-cases-note">${note}</p>
      ${scriptHtml()}
      ${state.callError ? `<p class="cv-error">${esc(state.callError)}</p>` : ''}
      ${body}
    </section>`;
  }

  function scrollBoxes(el) {
    const boxes = [];
    let n = el && el.parentElement;
    while (n) {
      const style = getComputedStyle(n);
      if (/(auto|scroll)/.test(style.overflowY)) boxes.push(n);
      n = n.parentElement;
    }
    boxes.push(document.scrollingElement || document.documentElement);
    return boxes;
  }

  function render() {
    pages().forEach(({ mode, el }) => {
      el.classList.remove('cv-locked');
      const body = el.querySelector('.cv-body');
      if (!body) return;
      const saved = scrollBoxes(body).map((box) => ({ box, top: box.scrollTop, left: box.scrollLeft }));
      body.innerHTML = renderBody(mode);
      const keep = () => saved.forEach(({ box, top, left }) => {
        box.scrollTop = top;
        box.scrollLeft = left;
      });
      keep();
      requestAnimationFrame(keep);
    });
  }

  function joinPeople(hrPeople, insured, users) {
    const insuredNames = new Set(insured.map((row) => norm(row.name)));
    const bound = new Map();
    users.forEach((user) => {
      const name = norm(user.name);
      if (name && !bound.has(name)) bound.set(name, user.team || '');
    });
    return (hrPeople || []).map((person) => {
      const name = norm(person.name);
      return {
        name: person.name,
        office: person.office || '未分處',
        title: person.title || '',
        kind: person.kind || '未分類',
        insured: insuredNames.has(name),
        bound: bound.has(name),
        toolboxTeam: bound.get(name) || '',
        lane: person.lane || ''
      };
    });
  }

  async function load(force) {
    const t = token();
    if (!t) {
      state.loaded = false;
      state.error = '';
      render();
      return;
    }
    if (state.loading) return;
    if (state.loaded && !force) return;
    state.loading = true;
    state.error = '';
    render();
    try {
      const [rosterRes, dashRes, callRes] = await Promise.all([
        fetch(`${rpaBase()}/api/hr/coverage-roster`, { headers: { 'X-Skyfun-Session': t } }),
        window.skyfunAuth?.rpc ? window.skyfunAuth.rpc('toolbox_biz_bonus_ack_dash', { p_token: t }) : Promise.resolve(null),
        window.skyfunAuth?.rpc ? window.skyfunAuth.rpc('biz_coverage_call_list', { p_token: t }) : Promise.resolve(null)
      ]);
      const roster = await rosterRes.json().catch(() => ({}));
      if (!rosterRes.ok || !roster.ok) throw new Error(roster.error || '人事對照讀不到');
      if (dashRes && !dashRes.ok) throw new Error(dashRes.error || '工具箱名單讀不到');
      state.hrError = roster.hrError || '';
      state.sheetError = roster.sheetError || '';
      state.insured = roster.insured || [];
      state.hrAllNames = roster.hrAllNames || [];
      state.production = roster.production || { months: [], counts: [], error: '產件無資料' };
      state.users = (dashRes && dashRes.users) || [];
      state.people = joinPeople(roster.people || [], state.insured, state.users);
      if (callRes && callRes.ok === false) state.callError = callRes.error || '電訪紀錄讀不到';
      state.calls = new Map(((callRes && callRes.rows) || []).map((row) => [row.matchNo, row]));
      state.loaded = true;
    } catch (err) {
      state.error = err.message || String(err);
      state.loaded = false;
    } finally {
      state.loading = false;
      render();
    }
    if (state.loaded) {
      void loadCases(t);
      void syncRateHistory(t);
    }
  }

  async function syncRateHistory(t) {
    const tokenNow = t || token();
    if (!tokenNow || !state.loaded || state.hrError) return;
    const all = tally(peopleForSnapshot());
    const payload = {
      day: taipeiDayIso(),
      total: all.total,
      insDone: all.insured,
      boxDone: all.bound,
      insPct: ringPct(all.insured, all.total),
      boxPct: ringPct(all.bound, all.total),
      regions: liveRegionSnapshots()
    };
    try {
      if (payload.insPct != null || payload.boxPct != null) {
        await fetch(`${rpaBase()}/api/hr/coverage-rate-snapshot`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Skyfun-Session': tokenNow
          },
          body: JSON.stringify(payload)
        });
      }
      const histRes = await fetch(`${rpaBase()}/api/hr/coverage-rate-history`, {
        headers: { 'X-Skyfun-Session': tokenNow }
      });
      const hist = await histRes.json().catch(() => ({}));
      if (!histRes.ok || !hist.ok) throw new Error(hist.error || '比率歷史讀不到');
      state.rateHistory = hist.days || [];
      state.rateHistoryError = '';
      state.rateHistoryLoaded = true;
    } catch (err) {
      state.rateHistoryError = err.message || String(err);
      state.rateHistoryLoaded = true;
    }
    render();
  }

  async function loadCases(t) {
    try {
      const caseRes = await fetch(`${rpaBase()}/api/hr/coverage-new-cases`, { headers: { 'X-Skyfun-Session': t } });
      const cases = await caseRes.json().catch(() => ({}));
      if (!caseRes.ok || !cases.ok) {
        state.caseError = cases.error || '新媒合讀不到';
        state.casesLoaded = true;
      } else if (cases.pending) {
        state.caseError = '';
        state.casesLoaded = false;
        if ((state.caseTries || 0) < 8) {
          state.caseTries = (state.caseTries || 0) + 1;
          setTimeout(() => { if (token()) void loadCases(token()); }, 4000);
        } else {
          state.caseError = '案件名單還沒讀完，請再按一次重新整理';
        }
      } else {
        state.cases = cases.cases || [];
        state.caseError = cases.error || '';
        state.casesLoaded = true;
        state.caseTries = 0;
      }
    } catch (err) {
      state.caseError = err.message || String(err);
      state.casesLoaded = true;
    }
    render();
  }

  function onClick(event) {
    if (event.target.closest('.cv-cases')) return;
    const kind = event.target.closest('[data-cv-kind]');
    if (kind) {
      state.kind = kind.getAttribute('data-cv-kind') || 'all';
      render();
      return;
    }
    if (event.target.closest('[data-cv-refresh]')) {
      state.loaded = false;
      load(true);
      return;
    }
    const sortBtn = event.target.closest('[data-cv-sort]');
    if (sortBtn) {
      const which = sortBtn.getAttribute('data-cv-sort');
      if (which === 'idle') {
        state.idleSortDir = state.idleSortDir === 'desc' ? 'asc' : 'desc';
      } else if (which === 'busy') {
        state.busySortDir = state.busySortDir === 'desc' ? 'asc' : 'desc';
      }
      render();
      return;
    }
    const copyBtn = event.target.closest('[data-cv-flag-copy]');
    if (copyBtn) {
      copyFlagList(copyBtn.getAttribute('data-cv-flag-copy') || 'idle');
      return;
    }
    const xlsxBtn = event.target.closest('[data-cv-flag-xlsx]');
    if (xlsxBtn) {
      downloadFlagExcel(xlsxBtn.getAttribute('data-cv-flag-xlsx') || 'idle');
      return;
    }
    const trendToggle = event.target.closest('[data-cv-trend-toggle]');
    if (trendToggle) {
      state.rateTrendOpen = !state.rateTrendOpen;
      render();
      return;
    }
    const rangeBtn = event.target.closest('[data-cv-trend-range]');
    if (rangeBtn) {
      const next = rangeBtn.getAttribute('data-cv-trend-range');
      if (next === 'day' || next === 'week' || next === 'month') {
        state.rateTrendRange = next;
        render();
      }
      return;
    }
    const regionBtn = event.target.closest('[data-cv-region]');
    if (regionBtn) {
      const mode = regionBtn.getAttribute('data-cv-mode') === 'box' ? 'box' : 'ins';
      const id = regionBtn.getAttribute('data-cv-region') || '';
      state.openRegion[mode] = state.openRegion[mode] === id ? '' : id;
      state.openOffice[mode] = '';
      render();
      return;
    }
    const personBtn = event.target.closest('[data-cv-person]');
    if (personBtn && !personBtn.hasAttribute('data-cv-person-close')) {
      const name = personBtn.getAttribute('data-cv-person') || '';
      state.openPerson = norm(state.openPerson) === norm(name) ? '' : name;
      state.callError = '';
      render();
      return;
    }
    if (event.target.closest('[data-cv-person-close]')) {
      state.openPerson = '';
      state.callError = '';
      render();
      return;
    }
    const office = event.target.closest('[data-cv-office]');
    if (!office) return;
    const mode = office.getAttribute('data-cv-mode') === 'box' ? 'box' : 'ins';
    const name = office.getAttribute('data-cv-office') || '';
    state.openOffice[mode] = state.openOffice[mode] === name ? '' : name;
    render();
  }

  function readCase(tr) {
    const matchNo = tr.getAttribute('data-cv-case') || '';
    const row = state.cases.find((item) => item.matchNo === matchNo);
    if (!row) return null;
    const field = (key) => tr.querySelector(`[data-cv-field="${key}"]`);
    const saved = {
      extension: String(field('extension')?.value || '').trim(),
      note: String(field('note')?.value || '').trim(),
      landlordDone: !!field('landlordDone')?.checked,
      tenantDone: !!field('tenantDone')?.checked,
      serviceDone: !!field('serviceDone')?.checked,
      paymentDone: !!field('paymentDone')?.checked,
      anomalyDone: !!field('anomalyDone')?.checked
    };
    return { row, saved };
  }

  async function onChange(event) {
    const tr = event.target.closest('[data-cv-case]');
    if (!tr) return;
    const packed = readCase(tr);
    if (!packed) return;
    if (packed.saved.extension && !/^\d{1,8}$/.test(packed.saved.extension)) {
      state.extDraft = state.extDraft || {};
      state.extDraft[packed.row.matchNo] = packed.saved.extension;
      state.callError = '分機請填數字';
      render();
      return;
    }
    if (state.extDraft) delete state.extDraft[packed.row.matchNo];
    state.callError = '';
    try {
      const data = await window.skyfunAuth.rpc('biz_coverage_call_save', {
        p_token: token(),
        p_data: {
          matchNo: packed.row.matchNo,
          salesName: packed.row.salesName,
          office: packed.row.office,
          address: packed.row.address,
          leaseStart: packed.row.leaseStart,
          landlordName: packed.row.landlordName,
          tenantName: packed.row.tenantName,
          ...packed.saved
        }
      });
      if (!data?.ok) throw new Error(data?.error || '儲存失敗');
      if (data.row) state.calls.set(data.row.matchNo, data.row);
    } catch (err) {
      state.callError = err.message || String(err);
    }
    render();
  }

  function bind() {
    pages().forEach(({ el }) => {
      if (el.dataset.cvBound === '1') return;
      el.dataset.cvBound = '1';
      const body = el.querySelector('.cv-body');
      if (body) {
        body.addEventListener('click', onClick);
        body.addEventListener('change', onChange);
      }
      new MutationObserver(() => {
        if (!el.classList.contains('hidden')) load(false);
      }).observe(el, { attributes: true, attributeFilter: ['class'] });
    });
    document.addEventListener('skyfun-auth-ready', () => {
      if (!pages().some(({ el }) => !el.classList.contains('hidden'))) return;
      if (state.loaded) render();
      else load(false);
    });
    render();
    if (token() && pages().some(({ el }) => !el.classList.contains('hidden'))) load(false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
