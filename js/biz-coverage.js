/**
 * 業務專區｜誠信險與工具箱
 * 誠信險投保率 × 工具箱綁定，對照公司系統在職業務，正職／兼職分開。
 */
(function () {
  'use strict';

  const RING = 2 * Math.PI * 42;
  const OFFICES = [
    '北一處', '北二處', '北三處', '北四處', '北五處', '基一處', '宜一處',
    '桃一處', '竹一處', '中一處', '中二處', '中三處', '中四處', '中五處', '中六處',
    '彰一處', '投一處', '嘉一處', '南一處', '南二處', '高一處', '高二處'
  ];
  const REGIONS = [
    { id: 'north', label: '北區', teams: ['北一處', '北二處', '北三處', '北四處', '北五處', '基一處', '宜一處'] },
    { id: 'central', label: '中區', teams: ['桃一處', '竹一處', '中一處', '中二處', '中三處', '中四處', '中五處', '中六處', '彰一處', '投一處', '嘉一處'] },
    { id: 'south', label: '南區', teams: ['南一處', '南二處', '南區（葉建志）'] },
    { id: 'kh', label: '高雄', teams: ['高一處', '高二處'] }
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
    insured: [],
    production: null,
    users: [],
    cases: [],
    calls: new Map(),
    casesLoaded: false,
    caseError: '',
    caseTries: 0,
    gateError: '',
    callError: '',
    openPerson: '',
    kind: 'all',
    openRegion: { ins: '', box: '' },
    openOffice: { ins: '', box: '' }
  };

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

  const GATE_HASH = '97247b836a6dda78d0f933ab0028b358a85051f38074af6dfe65ac91b3638967';
  const GATE_SALT = 'skyfun-coverage-gate:';
  const GATE_KEY = 'skyfun-coverage-gate';

  function gateOpen() {
    try { return sessionStorage.getItem(GATE_KEY) === '1'; } catch (err) { return false; }
  }

  async function gateMatches(raw) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(GATE_SALT + String(raw || '').trim()));
    const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return hex === GATE_HASH;
  }

  function gateHtml() {
    return `<form class="cv-lock" data-cv-gate>
      <p>這兩頁要密碼才能看。</p>
      <input type="password" inputmode="numeric" autocomplete="current-password" required placeholder="請輸入密碼">
      <button type="submit">進入</button>
      ${state.gateError ? `<p class="cv-error">${esc(state.gateError)}</p>` : ''}
    </form>`;
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

  function ringHtml(done, total, tone, label) {
    const known = !state.hrError;
    const pct = known && total ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0;
    const dash = ((pct / 100) * RING).toFixed(1);
    const mid = !known
      ? '<b>無資料</b><span>人事未對上</span>'
      : total
        ? `<b>${pct}<small>%</small></b><span>${done}／${total}</span>`
        : '<b>—</b><span>0 人</span>';
    return `<div class="cv-ring ${tone}${known && pct >= 100 ? ' is-done' : ''}">
      <div class="cv-ring-fig" aria-hidden="true">
        <svg viewBox="0 0 100 100">
          <circle class="cv-track" cx="50" cy="50" r="42"></circle>
          <circle class="cv-bar ${tone === 'ins' ? 'cv-bar--ins' : 'cv-bar--box'}" cx="50" cy="50" r="42" stroke-dasharray="${dash} ${RING.toFixed(1)}"></circle>
        </svg>
        <div class="cv-ring-mid">${mid}</div>
      </div>
      <span class="cv-ring-k">${esc(label)}</span>
    </div>`;
  }

  function scopedPeople() {
    const kind = state.kind === '正職' || state.kind === '兼職' ? state.kind : 'all';
    return state.people.filter((person) => {
      if (kind !== 'all' && person.kind !== kind) return false;
      if (person.office === '業務支援管理部') return false;
      return person.lane !== 'rent';
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

  function personLine(p, extra) {
    const sub = [p.title, p.kind !== '未分類' ? p.kind : '', extra].filter(Boolean).join(' · ');
    return `<div class="cv-person">
      <div class="cv-person-name">${esc(p.name)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>
    </div>`;
  }

  function personHit(person, extra) {
    const on = norm(state.openPerson) === norm(person.name);
    const count = state.casesLoaded ? `新案 ${casesFor(person.name).length}` : '新案讀取中';
    const sub = [person.title, person.kind !== '未分類' ? person.kind : '', extra, count].filter(Boolean).join(' · ');
    return `<button type="button" class="cv-person-hit${on ? ' is-on' : ''}" data-cv-person="${esc(person.name)}" aria-expanded="${on ? 'true' : 'false'}">
      <b>${esc(person.name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}
    </button>`;
  }

  function personBlock(person, extra) {
    const open = norm(state.openPerson) === norm(person.name) && !person.insured;
    return `<div class="cv-person-block${open ? ' is-open' : ''}">
      ${personHit(person, extra)}
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
      if (person.office === '業務支援管理部') return false;
      if (kind !== 'all' && person.kind !== kind) return false;
      return true;
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
      const uninsured = officeRoster(office).filter((person) => !person.insured).map((person) => ({ person }));
      const orphans = state.insured.filter((row) => row.office === office && !state.people.some((person) => norm(person.name) === norm(row.name)));
      const orphanFoot = orphans.length
        ? `<p class="cv-empty">名冊有、人事查無 ${orphans.length} 人：${esc(orphans.map((row) => row.name).join('、'))}</p>`
        : '';
      detail = `<div class="cv-split cv-split--one">${nameColumn('ins', '未投保誠信險', uninsured, '這處都有保', orphanFoot, true)}</div>`;
    } else if (open) {
      const unbound = list.filter((person) => !person.bound).map((person) => ({
        person,
        extra: person.toolboxTeam && person.toolboxTeam !== office ? `工具箱在${person.toolboxTeam}` : ''
      }));
      detail = `<div class="cv-split cv-split--one">${nameColumn('box', '未使用工具箱', unbound, '這處都有綁定', '')}</div>`;
    }
    return `<article class="cv-office${open ? ' is-open' : ''}">
      <button type="button" class="cv-office-hit" data-cv-office="${esc(office)}" data-cv-mode="${mode}" aria-expanded="${open ? 'true' : 'false'}">
        <h3 class="cv-office-name">${esc(office)}<small>${open ? '收合' : '看名單'}</small></h3>
        <div class="cv-rings">${ringHtml(done, stat.total, tone, ringLabel)}</div>
      </button>
      ${detail}
    </article>`;
  }

  function boardHtml(mode) {
    const tone = mode === 'ins' ? 'ins' : 'box';
    const title = mode === 'ins' ? '誠信險' : '工具箱綁定';
    const companyLabel = mode === 'ins' ? '全區投保率' : '全區綁定率';
    const all = tally(scopedPeople(mode));
    const companyDone = mode === 'ins' ? all.insured : all.bound;
    const openId = state.openRegion[mode];
    const regionCards = REGIONS.map((item) => {
      const teams = regionOffices(item, mode);
      if (!teams.length) return '';
      const stat = tally(peopleIn(teams, mode));
      const done = mode === 'ins' ? stat.insured : stat.bound;
      const on = openId === item.id;
      const offices = on
        ? `<div class="cv-flow-break"><div class="cv-offices">${regionOffices(item, mode).map((office) => officeCard(office, mode)).join('')}</div></div>`
        : '';
      return `<button type="button" class="cv-region-hit${on ? ' is-on' : ''}" data-cv-region="${esc(item.id)}" data-cv-mode="${mode}" aria-expanded="${on ? 'true' : 'false'}">
        ${ringHtml(done, stat.total, tone, item.label)}
      </button>${offices}`;
    }).join('');
    return `<section class="cv-board cv-board--${mode}">
      <h3 class="cv-board-title">${title}</h3>
      <div class="cv-flow">
        <article class="cv-company">${ringHtml(companyDone, all.total, tone, companyLabel)}</article>
        ${regionCards}
      </div>
      ${mode === 'ins' ? flagHtml() : ''}
    </section>`;
  }

  function regionOffices(region, mode) {
    return region.teams.filter((team) =>
      OFFICES.includes(team) || ofOffice(team, mode).length || (mode === 'ins' && state.insured.some((row) => row.office === team))
    );
  }

  function renderBody(mode) {
    if (!gateOpen()) return gateHtml();
    const waiting = mode === 'ins'
      ? '正在讀今天早上的誠信險資料…'
      : '正在讀今天早上的工具箱綁定…';
    if (state.loading && !state.loaded) return `<p class="cv-note">${waiting}</p>`;
    if (!token()) return '<p class="cv-error">請先登入工具箱，才能對照公司系統人事。</p>';
    const filters = KINDS.map((k) =>
      `<button type="button" class="cv-filter${state.kind === k.id ? ' is-on' : ''}" data-cv-kind="${esc(k.id)}">${esc(k.label)}</button>`
    ).join('');
    return `<div class="cv-toolbar">
        <div class="cv-filters" role="tablist">${filters}</div>
        <button type="button" class="cv-refresh" data-cv-refresh>重新整理</button>
      </div>
      ${state.error ? `<p class="cv-error">${esc(state.error)}</p>` : ''}
      ${state.hrError ? `<p class="cv-error">人事：${esc(state.hrError)}。比率顯示無資料。</p>` : ''}
      ${mode === 'ins' && state.sheetError ? `<p class="cv-note">名冊：${esc(state.sheetError)}</p>` : ''}
      <div class="cv-boards">
        ${boardHtml(mode)}
      </div>`;
  }

  function flagHtml() {
    const prod = state.production;
    if (!prod) return '';
    const months = prod.months || [];
    const label = months.map((month) => month.label).join('、') || '近兩個月';
    if (prod.error) return `<p class="cv-note">產件：${esc(prod.error)}。未產件與代管 10 件名單暫不列出。</p>`;
    const countOf = new Map((prod.counts || []).map((row) => [norm(row.name), row]));
    const kind = state.kind === '正職' || state.kind === '兼職' ? state.kind : 'all';
    const pool = state.people.filter((person) => kind === 'all' || person.kind === kind);
    const rows = pool.filter((person) => !person.insured).map((person) => {
      const hit = countOf.get(norm(person.name));
      const bag = hit?.months || [0, 0];
      return { person, m1: Number(bag[0]) || 0, m2: Number(bag[1]) || 0, total: Number(hit?.total) || 0 };
    });
    const idle = rows.filter((row) => isBizOrRent(row.person) && row.m1 === 0 && row.m2 === 0);
    const busy = rows.filter((row) => row.total >= 10)
      .sort((a, b) => (b.total - a.total)
        || String(a.person.office).localeCompare(String(b.person.office), 'zh-Hant')
        || String(a.person.name).localeCompare(String(b.person.name), 'zh-Hant'));
    const line = (row, extra) => personBlock(row.person, [row.person.office, extra].filter(Boolean).join(' · '));
    const escrowNote = prod.cumulativeError
      ? `<p class="cv-note">代管：${esc(prod.cumulativeError)}。下列是目前已撈到的。</p>`
      : '';
    return `<div class="cv-flags">
      <section class="cv-flag">
        <h3>連續兩個月未產件又未保<small>${idle.length}</small></h3>
        <p>${esc(label)}都是 0 件，而且沒有投保。只列業務、租管師。</p>
        ${idle.length ? `<div class="cv-flag-list">${idle.map((row) => line(row, '0 件')).join('')}</div>` : '<p class="cv-empty">沒有符合的人。</p>'}
      </section>
      <section class="cv-flag">
        <h3>代管 10 件以上未保<small>${busy.length}</small></h3>
        <p>未投保、累積代管案件 10 件以上。</p>
        ${escrowNote}
        ${busy.length
          ? `<div class="cv-flag-list">${busy.map((row) => line(row, `代管 ${row.total} 件`)).join('')}</div>`
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
    return `<tr data-cv-case="${esc(row.matchNo)}">
      <td><b>${esc(row.matchNo)}</b><small>${esc(row.address || '地址無資料')}</small></td>
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
          : '<p class="cv-empty">115/11/1 起沒有新媒合。</p>';
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
    const locked = !gateOpen();
    pages().forEach(({ mode, el }) => {
      el.classList.toggle('cv-locked', locked);
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
    if (!gateOpen()) {
      state.loading = false;
      render();
      return;
    }
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
    if (state.loaded) void loadCases(t);
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

  async function onGate(event) {
    const form = event.target.closest('[data-cv-gate]');
    if (!form) return;
    event.preventDefault();
    const raw = form.querySelector('input')?.value || '';
    if (!(await gateMatches(raw))) {
      state.gateError = '密碼不對';
      render();
      return;
    }
    try { sessionStorage.setItem(GATE_KEY, '1'); } catch (err) { /* 這個分頁記不住時，下次再問 */ }
    state.gateError = '';
    load(true);
  }

  function bind() {
    pages().forEach(({ el }) => {
      if (el.dataset.cvBound === '1') return;
      el.dataset.cvBound = '1';
      const body = el.querySelector('.cv-body');
      if (body) {
        body.addEventListener('click', onClick);
        body.addEventListener('change', onChange);
        body.addEventListener('submit', onGate);
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
