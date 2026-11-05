/**
 * 業務專區｜獎金辦法知悉儀表板
 * 首頁：個人完成進度（展開／收合）＋各區（北／中／南／高雄展開營業處）→ 明細
 * 知悉勾選僅能在預覽滑到底後打勾
 */
(function () {
  'use strict';

  const RING_LEN = 2 * Math.PI * 42;
  const WM =
    (window.SkyfunPolicyDocGate && window.SkyfunPolicyDocGate.WM) ||
    '星鴻內部文件｜僅供內部參考｜禁止外流｜違者須自負法律責任';
  const TEAM_ORDER = [
    '北一處', '北二處', '北三處', '基一處', '宜一處',
    '桃一處', '竹一處', '中一處', '中二處', '中三處', '中四處', '中五處', '中六處',
    '彰一處', '嘉一處', '南一處', '南二處', '高一處', '高二處'
  ];
  const REGIONS = [
    { id: 'north', label: '北區', teams: ['北一處', '北二處', '北三處', '基一處', '宜一處'] },
    { id: 'central', label: '中區', teams: ['桃一處', '竹一處', '中一處', '中二處', '中三處', '中四處', '中五處', '中六處', '彰一處', '嘉一處'] },
    { id: 'south', label: '南區', teams: ['南一處', '南二處'] },
    { id: 'kh', label: '高雄', teams: ['高一處', '高二處'] }
  ];

  const state = {
    view: 'home', // home | people
    personalOpen: false,
    regionOpen: '',
    loaded: false,
    loading: false,
    isSales: false,
    acks: {},
    busy: {},
    error: '',
    dashReady: false,
    dashUsers: [],
    dashAcks: {},
    dashDoc: '',
    dashRegion: '',
    dashTeam: '',
    teamOpen: '',
    dashOnlyMissing: true,
    dashError: '',
    dashLoading: false,
    previewModal: false,
    previewDocId: '',
    previewReachedEnd: false
  };

  function data() {
    return window.SKYFUN_BIZ_BONUS || { title: '業務獎金辦法', docs: [] };
  }

  function docs() {
    return data().docs || [];
  }

  function findDoc(id) {
    return docs().find((d) => d.id === id) || null;
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  }

  function token() {
    return window.skyfunAuth?.getToken?.() || '';
  }

  function when(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(d);
  }

  function root() {
    return document.getElementById('page-business-bonus');
  }

  function teamRank(team) {
    const t = String(team || '').trim();
    const i = TEAM_ORDER.indexOf(t);
    return i >= 0 ? i : 900;
  }

  function findRegion(id) {
    return REGIONS.find((r) => r.id === id) || null;
  }

  function teamList(regionId) {
    const region = findRegion(regionId);
    const allow = region ? new Set(region.teams) : null;
    const map = {};
    state.dashUsers.forEach((u) => {
      const t = u.team || '未填處別';
      if (allow && !allow.has(t)) return;
      map[t] = (map[t] || 0) + 1;
    });
    return Object.keys(map)
      .sort((a, b) => {
        const d = teamRank(a) - teamRank(b);
        return d || a.localeCompare(b, 'zh-Hant');
      })
      .map((t) => ({ team: t, n: map[t] }));
  }

  function usersOfTeam(team) {
    return state.dashUsers.filter((u) => (u.team || '未填處別') === team);
  }

  function usersOfRegion(regionId) {
    const region = findRegion(regionId);
    if (!region) return state.dashUsers.slice();
    const allow = new Set(region.teams);
    return state.dashUsers.filter((u) => allow.has(u.team || ''));
  }

  function userDoneAll(u) {
    const m = state.dashAcks[u.id] || {};
    return docs().every((d) => !!m[d.id]);
  }

  function userDoneDoc(u, docId) {
    return !!(state.dashAcks[u.id] || {})[docId];
  }

  function myAckDoneCount() {
    return docs().filter((d) => !!state.acks[d.id]).length;
  }

  function gaugeHtml(opts) {
    const id = opts.id || '';
    const label = opts.label || '';
    const done = opts.done || 0;
    const total = opts.total || 0;
    const nav = opts.nav || '';
    const team = opts.team || '';
    const region = opts.region || '';
    const meta = opts.meta || `已勾 <b>${done}</b>／應勾 <b>${total}</b>`;
    const pct = total ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0;
    const tone = pct >= 100 ? 'is-done' : pct > 0 ? 'is-doing' : 'is-todo';
    const dash = ((pct / 100) * RING_LEN).toFixed(1);
    const status =
      opts.status ||
      (pct >= 100 ? '全數完成' : pct > 0 ? '進行中' : '尚未開始');
    const attrs = [
      `type="button"`,
      `class="bb-gauge ${tone}${opts.wide ? ' bb-gauge--wide' : ''}${opts.stack ? ' bb-gauge--stack' : ''}${opts.active ? ' is-active' : ''}"`,
      `title="${esc(label)}"`,
      nav ? `data-bb-nav="${esc(nav)}"` : '',
      id ? `data-bb-doc="${esc(id)}"` : '',
      team ? `data-bb-team="${esc(team)}"` : '',
      region ? `data-bb-region="${esc(region)}"` : '',
      opts.expanded != null ? `aria-expanded="${opts.expanded ? 'true' : 'false'}"` : ''
    ].filter(Boolean).join(' ');
    return `<button ${attrs}>
      <span class="bb-gauge-ring" aria-hidden="true">
        <svg viewBox="0 0 100 100">
          <circle class="bb-gauge-track" cx="50" cy="50" r="42"></circle>
          <circle class="bb-gauge-bar" cx="50" cy="50" r="42" stroke-dasharray="${dash} ${RING_LEN.toFixed(1)}"></circle>
        </svg>
        <b><span class="bb-gauge-fig"><span class="bb-gauge-pct">${pct}<small>%</small></span><span class="bb-gauge-frac">${done}<small>／${total}</small></span></span></b>
      </span>
      <span class="bb-gauge-text">
        <span class="bb-gauge-label">${opts.labelHtml || esc(label)}</span>
        <span class="bb-gauge-meta">${meta}</span>
        <small>${esc(status)}</small>
      </span>
    </button>`;
  }

  function breadcrumb() {
    const region = findRegion(state.dashRegion);
    const bits = [`<button type="button" class="bb-crumb" data-bb-nav="home">知悉儀表板</button>`];
    if (state.view === 'people' && region) {
      bits.push('<span class="bb-crumb-sep">›</span>');
      bits.push(
        `<button type="button" class="bb-crumb" data-bb-nav="offices" data-bb-region="${esc(region.id)}">${esc(region.label)}</button>`
      );
      bits.push('<span class="bb-crumb-sep">›</span>');
      bits.push(`<span class="bb-crumb is-here">${esc(state.dashTeam || '營業處')}</span>`);
    }
    return `<nav class="bb-breadcrumbs" aria-label="層級">${bits.join('')}</nav>`;
  }

  function renderRegionOffices(regionId) {
    const region = findRegion(regionId);
    const teams = teamList(regionId);
    if (!region) return '';
    if (!teams.length) {
      return `<p class="bb-hint">此區尚無業務資料。</p>`;
    }
    const openTeam = teams.some((t) => t.team === state.teamOpen) ? state.teamOpen : '';
    return `<div class="bb-region-offices" aria-label="${esc(region.label)}各營業處">
      <p class="bb-region-offices-tip">${esc(region.label)}各營業處｜點營業處展開業務名單，再點一次收合</p>
      <div class="bb-gauges bb-gauges--offices">
        ${teams
          .map((t) => {
            const list = usersOfTeam(t.team);
            const done = list.filter(userDoneAll).length;
            const open = openTeam === t.team;
            const card = gaugeHtml({
              label: t.team,
              done,
              total: list.length,
              nav: 'toggle-team',
              team: t.team,
              region: regionId,
              active: open,
              expanded: open,
              status: open ? '點一下收合' : '點一下展開',
              meta: '已全勾／業務人數'
            });
            if (!open) return card;
            return `${card}<div class="bb-office-people">
              <div class="bb-sec-head">
                <h3 class="bb-sec-title">${esc(t.team)}｜業務名單</h3>
                <div class="bb-dash-toolbar" style="margin:0">
                  <label class="bb-hint" style="margin:0;display:flex;align-items:center;gap:0.3rem">
                    <input type="checkbox" id="bb-dash-missing" ${state.dashOnlyMissing ? 'checked' : ''}> 只看還沒勾完
                  </label>
                  <button type="button" class="bb-btn bb-btn--main" id="bb-dash-export">匯出 CSV</button>
                </div>
              </div>
              ${peopleRows(list)}
            </div>`;
          })
          .join('')}
      </div>
    </div>`;
  }

  function wmGridHtml() {
    return Array.from({ length: 24 }, () => `<span>${esc(WM)}</span>`).join('');
  }

  function ackFooter(doc) {
    if (!doc) return '';
    const at = state.acks[doc.id];
    const busy = !!state.busy[doc.id];
    const reached = !!state.previewReachedEnd || !!at;
    const canTick = state.loaded && state.isSales && !at && !busy && reached;
    let tip = '';
    if (at) tip = `<small>${esc(when(at))}</small>`;
    else if (!state.isSales && state.loaded) tip = '<small>非營業處業務免勾</small>';
    else if (state.isSales && !reached) tip = '<small>請先滑到檔案最下方再勾選</small>';
    return `<div class="bb-preview-ack">
      <label class="bb-check${canTick || at ? '' : ' is-off'}">
        <span><input type="checkbox" data-bb-ack="${esc(doc.id)}" ${at ? 'checked' : ''} ${!canTick || at || busy ? 'disabled' : ''}> 已閱畢知悉</span>
        ${tip}
      </label>
    </div>`;
  }

  function renderPersonalDocs() {
    return `<div class="bb-docs bb-docs--accordion" aria-label="辦法清單">
      ${docs()
        .map((d, i) => {
          const at = state.acks[d.id];
          return `
        <article class="bb-doc-card" id="bb-doc-${esc(d.id)}">
          <header class="bb-doc-head">
            <div>
              <h4>${i + 1}. ${esc(d.title)}</h4>
              <p class="bb-doc-meta">${esc(d.version || '')}${d.moneyHint ? ' · ' + esc(d.moneyHint) : ''}</p>
              <p class="bb-doc-ackst">${at ? `已勾 · ${esc(when(at))}` : '尚未勾選｜請預覽後滑到底勾選'}</p>
            </div>
            <div class="bb-preview-actions">
              <button type="button" class="bb-btn bb-btn--main" data-bb-preview="${esc(d.id)}">📄 預覽浮水印檔</button>
            </div>
          </header>
        </article>`;
        })
        .join('')}
    </div>`;
  }

  function renderPreviewModal() {
    if (!state.previewModal) return '';
    const doc = findDoc(state.previewDocId);
    if (!doc || !doc.file) return '';
    return `
      <div class="bb-modal" id="bb-preview-modal" role="dialog" aria-modal="true" aria-labelledby="bb-preview-title">
        <div class="bb-modal-backdrop" data-bb-preview-close></div>
        <div class="bb-modal-panel">
          <header class="bb-modal-head">
            <div>
              <h3 id="bb-preview-title">${esc(doc.title)}</h3>
              <p class="bb-doc-meta">預覽含浮水印｜${esc(doc.version || '')}｜請滑到最下方勾選知悉</p>
            </div>
            <div class="bb-preview-actions">
              <button type="button" class="bb-btn" data-bb-preview-close aria-label="關閉">關閉</button>
            </div>
          </header>
          <div class="bb-modal-scroll" id="bb-preview-scroll">
            <div class="bb-preview-stage">
              <iframe src="${esc(doc.file)}#toolbar=0" title="${esc(doc.title)} 浮水印預覽"></iframe>
              <div class="bb-wm" aria-hidden="true"><div class="bb-wm-grid">${wmGridHtml()}</div></div>
              <p class="bb-wm-note">預覽含浮水印｜星鴻內部文件｜禁止外流</p>
            </div>
            ${ackFooter(doc)}
          </div>
        </div>
      </div>`;
  }

  function unlockAckIfNeeded() {
    const sc = document.getElementById('bb-preview-scroll');
    if (!sc || state.previewReachedEnd) return;
    if (sc.scrollHeight - sc.scrollTop - sc.clientHeight <= 24) {
      state.previewReachedEnd = true;
      const foot = sc.querySelector('.bb-preview-ack');
      const doc = findDoc(state.previewDocId);
      if (foot && doc) foot.outerHTML = ackFooter(doc);
    }
  }

  function bindPreviewScroll() {
    const sc = document.getElementById('bb-preview-scroll');
    if (!sc) return;
    sc.addEventListener('scroll', unlockAckIfNeeded, { passive: true });
    requestAnimationFrame(() => {
      unlockAckIfNeeded();
      if (sc.scrollHeight <= sc.clientHeight + 8) {
        state.previewReachedEnd = true;
        const foot = sc.querySelector('.bb-preview-ack');
        const doc = findDoc(state.previewDocId);
        if (foot && doc) foot.outerHTML = ackFooter(doc);
      }
    });
  }

  function openPreview(docId) {
    const doc = findDoc(docId);
    if (!doc || !doc.file) return;
    state.previewDocId = docId;
    state.previewModal = true;
    state.previewReachedEnd = !!state.acks[docId];
  }

  function closePreview() {
    state.previewModal = false;
    state.previewDocId = '';
    state.previewReachedEnd = false;
  }

  function peopleRows(list) {
    if (!list.length) return `<p class="bb-hint">沒有符合的業務。</p>`;
    const allDocs = docs();
    const missing = list.filter((u) => !userDoneAll(u));
    const done = list.filter((u) => userDoneAll(u));
    const show = state.dashOnlyMissing ? missing : missing.concat(done);
    if (!show.length) {
      return `<p class="bb-hint is-ok">此營業處已全部勾完。</p>`;
    }
    return `
      <div class="bb-people-stats">未勾完 <b>${missing.length}</b> 人｜已全勾 <b>${done.length}</b> 人｜共 ${list.length} 人</div>
      <ul class="bb-people">
        ${show
          .map((u) => {
            const ok = userDoneAll(u);
            const m = state.dashAcks[u.id] || {};
            const n = allDocs.filter((d) => !!m[d.id]).length;
            const detail = allDocs
              .map((d) => {
                const at = m[d.id];
                return `<span class="bb-person-doc${at ? ' is-ok' : ''}">${esc(d.title)}${at ? ' · ' + esc(when(at)) : ' · 未勾'}</span>`;
              })
              .join('');
            return `<li class="bb-person${ok ? ' is-done' : ' is-miss'}">
              <div class="bb-person-top">
                <span class="bb-person-name">${esc(u.name)}</span>
                <span class="bb-person-st">${ok ? '已全勾' : `已勾 ${n}/${allDocs.length}`}</span>
              </div>
              <div class="bb-person-docs">${detail}</div>
            </li>`;
          })
          .join('')}
      </ul>`;
  }

  function renderHome() {
    const allDocs = docs();
    const mineDone = myAckDoneCount();
    return `
      <div class="bb-home-stack" aria-label="知悉儀表板入口">
        <section class="bb-home-sec bb-home-sec--personal" aria-label="個人進度">
          <h4 class="bb-home-sec-title">個人進度</h4>
          <p class="bb-stats">點卡片展開／收合六個辦法；預覽滑到底才可勾選知悉。</p>
          <div class="bb-home-personal">
            ${gaugeHtml({
              label: '個人完成進度',
              done: mineDone,
              total: allDocs.length,
              nav: 'toggle-personal',
              wide: true,
              active: state.personalOpen,
              expanded: state.personalOpen,
              meta: state.isSales
                ? `已勾／辦法${state.personalOpen ? ' · 再點一次收合' : ' · 點擊展開'}`
                : `辦法份數（非業務免勾）${state.personalOpen ? ' · 再點一次收合' : ' · 點擊展開'}`
            })}
            ${state.personalOpen ? renderPersonalDocs() : ''}
          </div>
        </section>
        <section class="bb-home-sec bb-home-sec--regions" aria-label="各區完成進度">
          <h4 class="bb-home-sec-title">各區完成進度</h4>
          <p class="bb-stats">北／中／南／高雄｜點區域卡向下展開營業處，再點一次收合。</p>
          <div class="bb-gauges bb-gauges--regions">
            ${REGIONS.map((r) => {
              const list = usersOfRegion(r.id);
              const done = list.filter(userDoneAll).length;
              const open = state.regionOpen === r.id;
              return gaugeHtml({
                label: r.label,
                labelHtml: `<span class="bb-gauge-kicker">${esc(r.label)}</span><span class="bb-gauge-sub">完成進度</span>`,
                done,
                total: list.length,
                nav: 'toggle-region',
                region: r.id,
                stack: true,
                active: open,
                expanded: open,
                meta: '已全勾／業務人數',
                status: open ? '點擊收合' : '點擊展開'
              });
            }).join('')}
          </div>
          ${state.regionOpen ? renderRegionOffices(state.regionOpen) : ''}
        </section>
      </div>`;
  }

  function renderPeople() {
    const list = usersOfTeam(state.dashTeam);
    return `
      ${breadcrumb()}
      <div class="bb-sec-head">
        <h3 class="bb-sec-title">${esc(state.dashTeam)}｜知悉明細</h3>
        <div class="bb-dash-toolbar" style="margin:0">
          <label class="bb-hint" style="margin:0;display:flex;align-items:center;gap:0.3rem">
            <input type="checkbox" id="bb-dash-missing" ${state.dashOnlyMissing ? 'checked' : ''}> 只看還沒勾完
          </label>
          <button type="button" class="bb-btn bb-btn--main" id="bb-dash-export">匯出 CSV</button>
        </div>
      </div>
      ${peopleRows(list)}`;
  }

  function renderDash() {
    if (!token()) {
      return `<section class="bb-dash-block"><h3 class="bb-sec-title">知悉儀表板</h3><p class="bb-hint">請先登入工具箱後查看完成率與預覽辦法。</p></section>`;
    }
    if (state.dashLoading && !state.dashReady) {
      return `<section class="bb-dash-block"><h3 class="bb-sec-title">知悉儀表板</h3><p class="bb-hint">讀取知悉儀表板中…</p></section>`;
    }
    if (state.dashError && !state.dashReady) {
      return `<section class="bb-dash-block"><h3 class="bb-sec-title">知悉儀表板</h3><p class="bb-hint is-error">${esc(state.dashError)}</p></section>`;
    }

    let body = '';
    if (state.view === 'people') body = renderPeople();
    else body = renderHome();

    return `
      <section class="bb-dash-block">
        <div class="bb-sec-head">
          <h3 class="bb-sec-title">知悉儀表板</h3>
          <div class="bb-dash-toolbar" style="margin:0">
            <button type="button" class="bb-btn" id="bb-dash-refresh">${state.dashLoading ? '更新中…' : '重新整理'}</button>
          </div>
        </div>
        ${state.error ? `<p class="bb-hint is-error">${esc(state.error)}</p>` : ''}
        ${!state.isSales && state.loaded ? '<p class="bb-hint">本區知悉由營業處業務打勾；你可預覽浮水印檔與查看完成率。</p>' : ''}
        ${body}
      </section>
      ${renderPreviewModal()}`;
  }

  function scrollBoxes(el) {
    const boxes = [];
    let n = el && el.parentElement;
    while (n) {
      const s = getComputedStyle(n);
      if (/(auto|scroll)/.test(s.overflowY)) boxes.push(n);
      n = n.parentElement;
    }
    boxes.push(document.scrollingElement || document.documentElement);
    return boxes;
  }

  function render() {
    const el = root();
    if (!el) return;
    const body = el.querySelector('#bb-body');
    if (!body) return;
    const saved = scrollBoxes(body).map((box) => ({ box, top: box.scrollTop, left: box.scrollLeft }));
    body.innerHTML = renderDash();
    const keep = () => {
      saved.forEach(({ box, top, left }) => {
        box.scrollTop = top;
        box.scrollLeft = left;
      });
    };
    keep();
    requestAnimationFrame(keep);
    if (state.previewModal) bindPreviewScroll();
  }

  async function loadMine() {
    const t = token();
    if (!t || !window.skyfunAuth?.rpc) {
      state.loaded = false;
      render();
      return;
    }
    if (state.loading) return;
    state.loading = true;
    state.error = '';
    render();
    try {
      const res = await window.skyfunAuth.rpc('toolbox_biz_bonus_ack_mine', { p_token: t });
      if (!res?.ok) throw new Error(res?.error || '讀取失敗');
      state.loaded = true;
      state.isSales = !!res.isSales;
      state.acks = {};
      (res.acks || []).forEach((a) => {
        state.acks[a.id] = a.at;
      });
    } catch (e) {
      state.error = '知悉紀錄讀取失敗：' + (e.message || e);
    } finally {
      state.loading = false;
      render();
    }
  }

  async function ack(id) {
    state.busy[id] = true;
    render();
    try {
      const res = await window.skyfunAuth.rpc('toolbox_biz_bonus_ack_set', {
        p_token: token(),
        p_doc_id: id
      });
      if (!res?.ok) throw new Error(res?.error || '儲存失敗');
      state.acks[id] = res.at || new Date().toISOString();
      state.error = '';
      loadDash();
    } catch (e) {
      state.error = '打勾失敗：' + (e.message || e);
    } finally {
      delete state.busy[id];
      render();
    }
  }

  async function loadDash() {
    const t = token();
    if (!t || !window.skyfunAuth?.rpc) {
      state.dashReady = false;
      state.dashError = '請先登入工具箱';
      render();
      return;
    }
    state.dashLoading = true;
    state.dashError = '';
    render();
    try {
      const res = await window.skyfunAuth.rpc('toolbox_biz_bonus_ack_dash', { p_token: t });
      if (!res?.ok) throw new Error(res?.error || '讀取失敗');
      state.dashReady = true;
      state.dashUsers = res.users || [];
      state.dashAcks = {};
      (res.acks || []).forEach((k) => {
        (state.dashAcks[k.userId] = state.dashAcks[k.userId] || {})[k.id] = k.at;
      });
    } catch (e) {
      state.dashReady = false;
      state.dashError = e.message || String(e);
    } finally {
      state.dashLoading = false;
      render();
    }
  }

  function csvEscape(v) {
    const s = String(v ?? '');
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function exportCsv() {
    const list = usersOfTeam(state.dashTeam);
    const allDocs = docs();
    const lines = [['營業處', '姓名', '辦法', '狀態', '時間']];
    list.forEach((u) => {
      const m = state.dashAcks[u.id] || {};
      allDocs.forEach((d) => {
        const at = m[d.id];
        lines.push([
          state.dashTeam,
          u.name || '',
          d.title,
          at ? '已勾' : '未勾',
          at ? new Date(at).toLocaleString('zh-TW') : ''
        ]);
      });
    });
    const body = lines.map((row) => row.map(csvEscape).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + body], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '業務獎金知悉-' + (state.dashTeam || '全部') + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function goHome() {
    state.view = 'home';
    state.dashDoc = '';
    state.dashTeam = '';
    state.teamOpen = '';
    closePreview();
  }

  function goOffices(regionId) {
    state.view = 'home';
    state.dashRegion = regionId || state.dashRegion || '';
    state.regionOpen = state.dashRegion;
    state.dashTeam = '';
    state.dashDoc = '';
    closePreview();
  }

  function goPeople(team, regionId) {
    state.view = 'people';
    state.dashTeam = team || '';
    state.dashRegion = regionId || state.dashRegion || '';
    if (state.dashRegion) state.regionOpen = state.dashRegion;
    state.dashDoc = '';
  }

  function onBodyClick(e) {
    if (e.target.closest('[data-bb-preview-close]')) {
      closePreview();
      render();
      return;
    }
    const previewBtn = e.target.closest('[data-bb-preview]');
    if (previewBtn) {
      openPreview(previewBtn.getAttribute('data-bb-preview') || '');
      render();
      return;
    }
    const nav = e.target.closest('[data-bb-nav]');
    if (nav) {
      const kind = nav.getAttribute('data-bb-nav') || '';
      const docId = nav.getAttribute('data-bb-doc') || '';
      const team = nav.getAttribute('data-bb-team') || '';
      const region = nav.getAttribute('data-bb-region') || '';
      if (kind === 'home') goHome();
      else if (kind === 'toggle-personal') state.personalOpen = !state.personalOpen;
      else if (kind === 'toggle-region') {
        const next = state.regionOpen === region ? '' : region;
        if (next !== state.regionOpen) state.teamOpen = '';
        state.regionOpen = next;
        state.dashRegion = state.regionOpen;
      }
      else if (kind === 'toggle-team') {
        state.view = 'home';
        state.dashRegion = region || state.dashRegion;
        state.regionOpen = state.dashRegion;
        state.teamOpen = state.teamOpen === team ? '' : team;
        state.dashTeam = state.teamOpen;
      }
      else if (kind === 'offices') goOffices(region);
      else if (kind === 'people') goPeople(team, region);
      else if (kind === 'preview' && docId) openPreview(docId);
      render();
      return;
    }
    if (e.target.closest('#bb-dash-refresh')) {
      loadDash();
      return;
    }
    if (e.target.closest('#bb-dash-export')) {
      exportCsv();
    }
  }

  function onBodyChange(e) {
    const box = e.target.closest('input[data-bb-ack]');
    if (box && box.checked) {
      ack(box.getAttribute('data-bb-ack'));
      return;
    }
    if (e.target.id === 'bb-dash-missing') {
      state.dashOnlyMissing = !!e.target.checked;
      render();
    }
  }

  function refreshAll() {
    loadMine();
    loadDash();
  }

  function bind() {
    const el = root();
    if (!el || el.dataset.bbBound === '1') return;
    el.dataset.bbBound = '1';
    const body = el.querySelector('#bb-body');
    if (body) {
      body.addEventListener('click', onBodyClick);
      body.addEventListener('change', onBodyChange);
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.previewModal) {
        closePreview();
        render();
      }
    });
    document.addEventListener('skyfun-auth-ready', () => {
      if (!el.classList.contains('hidden')) refreshAll();
    });
    new MutationObserver(() => {
      if (!el.classList.contains('hidden')) refreshAll();
    }).observe(el, { attributes: true, attributeFilter: ['class'] });

    render();
    if (token()) refreshAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
