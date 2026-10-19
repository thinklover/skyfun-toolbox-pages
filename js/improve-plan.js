/**
 * 行政點數表 › 個人明細：評等旁的「改善計畫」
 * 評等 D 需每兩週填寫一次；本人填寫，所有登入者都看得到（處長、組長追蹤）。
 * admin-points.js 在個人頁頭放入 #apt-plan-root（與 #apt-plan-panel）後呼叫 ImprovePlan.mount()。
 */
(function () {
  'use strict';

  const REQUIRED_GRADES = new Set(['D']);
  const CYCLE_DAYS = 14;
  const DAY_MS = 86400000;

  const TEXT_LIMIT = 300;
  /** 只有「具體做法」限 300 字；「本期要改善的項目」不限字數 */
  const LIMITED_FIELDS = new Set(['actions']);
  const AI_FIELDS = { focus: '本期要改善的項目', actions: '具體做法' };
  const aiUrl = () => String(window.SKYFUN_PETITION_AI_URL || 'https://skyfun-petition-ai.onrender.com').replace(/\/$/, '') + '/api/improve-plan/polish';

  const cache = new Map();
  const ui = { name: '', mode: 'closed', editing: null, draft: null, msg: '', busy: false, ai: {} };
  let ctx = null;

  const $ = (id) => document.getElementById(id);
  const auth = () => window.skyfunAuth;
  const token = () => auth()?.getToken?.() || '';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function rocDate(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear() - 1911}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
  }
  function rocTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${rocDate(d)} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  const md = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  async function rpc(name, args) {
    if (!auth()?.rpc) throw new Error('尚未登入');
    const res = await auth().rpc(name, args);
    if (!res?.ok) throw new Error(res?.error || '連線失敗');
    return res;
  }

  async function load(name, force) {
    if (!name || !token()) return;
    const c = cache.get(name);
    if (c && (c.loading || (!force && c.items))) return;
    cache.set(name, { ...(c || {}), loading: true });
    try {
      const res = await rpc('admin_points_plan_list', { p_token: token(), p_name: name });
      cache.set(name, { items: res.items || [], loading: false });
    } catch (e) {
      cache.set(name, { items: c?.items || null, loading: false, error: e.message });
    }
    if (ctx?.name === name) paint();
  }

  function required() {
    return REQUIRED_GRADES.has(ctx.grade);
  }

  function status(items) {
    const last = items[0] ? new Date(items[0].createdAt) : null;
    if (!required()) {
      if (ctx.grade === '-') return { tone: 'muted', text: '評等資料不足，暫不需要改善計畫' };
      return { tone: 'ok', text: `評等 ${ctx.grade}，不需要改善計畫${last ? `（最近一次 ${md(last)}）` : ''}` };
    }
    if (!last) return { tone: 'bad', text: '評等 D，尚未填寫改善計畫，請盡快填寫' };
    const due = new Date(startOfDay(last).getTime() + CYCLE_DAYS * DAY_MS);
    const days = Math.round((due - startOfDay(new Date())) / DAY_MS);
    if (days < 0) return { tone: 'bad', text: `已逾期 ${-days} 天（上次 ${md(last)}，每兩週要再填一次）` };
    if (days === 0) return { tone: 'warn', text: `今天要再填一次（上次 ${md(last)}）` };
    if (days <= 3) return { tone: 'warn', text: `${md(due)} 前要再填一次（剩 ${days} 天）` };
    return { tone: 'ok', text: `已填寫，下次 ${md(due)} 前再填（上次 ${md(last)}）` };
  }

  function boxHtml() {
    const c = cache.get(ctx.name);
    const items = c?.items || [];
    const loading = !c?.items && !c?.error;
    const st = loading ? { tone: 'muted', text: '讀取中…' } : c?.error && !c.items ? { tone: 'bad', text: `讀取失敗：${c.error}` } : status(items);
    const last = items[0];
    const writeBtn = ctx.self
      ? `<button type="button" class="ipl-btn ipl-btn--main" data-ipl="write">${required() ? '✍️ 填寫改善計畫' : '自主填寫'}</button>`
      : '';
    const listOpen = ui.mode !== 'closed';
    return `<div class="ipl-box ipl-box--${st.tone}${required() ? ' is-required' : ''}">
        <div class="ipl-head"><b>📝 改善計畫</b><span class="ipl-rule">D 以下每兩週一次</span></div>
        <p class="ipl-status">${esc(st.text)}</p>
        ${last ? `<p class="ipl-last">最近：${esc(rocTime(last.createdAt))} · ${esc(String(last.focus).split('\n')[0].slice(0, 40))}</p>` : ''}
        ${ctx.self ? '' : `<p class="ipl-last">由 ${esc(ctx.name)} 本人登入工具箱後填寫</p>`}
        <div class="ipl-btns">${writeBtn}<button type="button" class="ipl-btn" data-ipl="list">${listOpen ? '收合' : `看紀錄（${items.length}）`}</button></div>
      </div>`;
  }

  /** 依個人分析（personProfile）整理落後了什麼；做法要行政自己寫，不提供建議文字 */
  function advice() {
    const pf = ctx.pf;
    if (!pf) return null;
    const areas = new Set(pf.weak.map((w) => w.area));
    const gaps = pf.weak.slice(0, 6).map((w) => ({ level: w.level, area: w.area, text: w.text }));
    const dims = (pf.dims || [])
      .map((d) => ({ label: d.label, score: pf.scores?.[d.key] }))
      .filter((d) => d.score != null);
    const low = dims.filter((d) => d.score < 50).sort((a, b) => a.score - b.score);
    for (const d of low) {
      if (!areas.has(d.label)) {
        areas.add(d.label);
        gaps.push({ level: 'bad', area: d.label, text: `${d.label}分數 ${Math.round(d.score)}／100，是拉低整體評等的主因` });
      }
    }
    return { gaps, dims };
  }

  function adviceHtml() {
    const a = advice();
    if (!a) return '';
    const icon = (lv) => (lv === 'bad' ? '🔴' : '🟠');
    const dims = a.dims.length
      ? `<p class="ipl-dims">${a.dims.map((d) => `<span class="${d.score < 50 ? 'is-low' : ''}">${esc(d.label)} <b>${Math.round(d.score)}</b></span>`).join('')}</p>`
      : '';
    const gaps = a.gaps.length
      ? `<ul class="ipl-gaps">${a.gaps.map((g) => `<li>${icon(g.level)} <b>${esc(g.area)}</b>　${esc(g.text)}</li>`).join('')}</ul>`
      : '<p class="ipl-none">目前沒有明顯落後的項目。</p>';
    return `<div class="ipl-guide ipl-guide--single">
        <div class="ipl-guide-col">
          <div class="ipl-guide-title">📉 落後了什麼<small>各面向分數（滿分 100）；改善項目與做法請自己寫</small></div>
          ${dims}${gaps}
        </div>
      </div>`;
  }

  function countHtml(name, len) {
    if (!LIMITED_FIELDS.has(name)) {
      return `<small class="ipl-count" data-ipl-count="${name}">${len} 字</small>`;
    }
    const tone = len > TEXT_LIMIT ? ' is-over' : len >= TEXT_LIMIT - 30 ? ' is-near' : '';
    return `<small class="ipl-count${tone}" data-ipl-count="${name}">${len}／${TEXT_LIMIT}</small>`;
  }

  function field(name, label, rows, value, hint, req) {
    const text = String(value || '');
    if (!AI_FIELDS[name]) {
      return `<label class="ipl-f"><span>${label}${req ? ' <em>*</em>' : ''}</span><textarea name="${name}" rows="${rows}" maxlength="${name === 'target' ? 1000 : 2000}" placeholder="${esc(hint)}">${esc(text)}</textarea></label>`;
    }
    const st = ui.ai[name] || {};
    const undo = st.original != null && !st.busy
      ? `<button type="button" class="ipl-ai-undo" data-ipl-ai-undo="${name}">↩ 還原</button>`
      : '';
    const maxAttr = LIMITED_FIELDS.has(name) ? ` maxlength="${TEXT_LIMIT}"` : '';
    return `<div class="ipl-f" data-ipl-field="${name}">
        <span class="ipl-f-head"><label for="ipl-f-${name}">${label}${req ? ' <em>*</em>' : ''}</label>
          <span class="ipl-ai"><button type="button" class="ipl-ai-btn" data-ipl-ai="${name}"${st.busy ? ' disabled' : ''}>${st.busy ? '✨ 潤飾中…' : '✨ AI 潤飾'}</button>${undo}</span></span>
        <textarea id="ipl-f-${name}" name="${name}" rows="${rows}"${maxAttr} placeholder="${esc(hint)}">${esc(text)}</textarea>
        <span class="ipl-f-foot"><small class="ipl-ai-msg${st.tone ? ` is-${st.tone}` : ''}">${esc(st.msg || '')}</small>${countHtml(name, text.length)}</span>
      </div>`;
  }

  function formHtml() {
    const items = cache.get(ctx.name)?.items || [];
    const editing = ui.editing ? items.find((x) => x.id === ui.editing) : null;
    const d = ui.draft || editing || {};
    const prev = editing ? null : items[0];
    return `<form class="ipl-form" novalidate>
        <div class="ipl-form-title">${editing ? '✏️ 修改改善計畫' : '✍️ 填寫改善計畫'}<small>本次評等 ${esc(ctx.grade)}${ctx.score ? `（${Math.round(Number(ctx.score))} 分）` : ''}；送出後處長、組長都看得到</small></div>
        ${adviceHtml()}
        <p class="ipl-handwrite">✍️ 「本期要改善的項目」不限字數；「具體做法」請在 ${TEXT_LIMIT} 字內。寫完可以按「✨ AI 潤飾」修飾文字。</p>
        <div class="ipl-grid">
          ${field('focus', '本期要改善的項目', 2, d.focus, '例如：審核速度（物審平均比全體慢 20%）', true)}
          ${field('actions', '具體做法', 3, d.actions, '每天／每週要做什麼，例如：每天上午先清物審待辦、遇到卡關 10 分鐘內找組長', true)}
          ${field('target', '目標與完成日', 2, d.target, '例如：兩週內物審平均耗時降到全體平均以下', false)}
          ${field('review', '上次計畫執行結果', 2, d.review, prev ? `上次目標：${String(prev.target || prev.focus).slice(0, 60)}` : '第一次填寫可以空白', false)}
        </div>
        <div class="ipl-actions">
          <button type="submit" class="ipl-btn ipl-btn--main"${ui.busy ? ' disabled' : ''}>${editing ? '儲存修改' : '送出'}</button>
          <button type="button" class="ipl-btn" data-ipl="cancel">取消</button>
          <span class="ipl-msg${ui.msg ? ' is-err' : ''}" role="status">${esc(ui.msg)}</span>
        </div>
      </form>`;
  }

  function historyHtml() {
    const c = cache.get(ctx.name);
    const items = c?.items || [];
    if (c?.error && !c.items) return `<p class="ipl-empty is-err">讀取失敗：${esc(c.error)}</p>`;
    if (!c?.items) return '<p class="ipl-empty">讀取中…</p>';
    if (!items.length) {
      const who = ctx.self ? '你' : esc(ctx.name);
      const how = ctx.self
        ? '按上方「填寫改善計畫」開始寫，送出後處長、組長都看得到。'
        : `改善計畫要由 ${esc(ctx.name)} 本人登入工具箱，在自己的「個人績效」填寫；寫好後會出現在這裡。`;
      return `<div class="ipl-empty-box">
          <p><b>${who}還沒有改善計畫紀錄。</b>${how}</p>
          <p>每次要寫：① 本期要改善的項目　② 具體做法　③ 目標與完成日　④ 上次計畫執行結果。評等 D 每兩週要再寫一次。</p>
        </div>`;
    }
    return `<ol class="ipl-list">${items
      .map((it) => {
        const perf = it.perfYear && it.perfMonth ? `${it.perfYear - 1911}/${String(it.perfMonth).padStart(2, '0')} 業績月` : '';
        const grade = it.grade ? `當時評等 ${esc(it.grade)}${it.score != null ? `（${Math.round(Number(it.score))} 分）` : ''}` : '';
        const row = (label, v) => (v ? `<div class="ipl-kv"><dt>${label}</dt><dd>${esc(v)}</dd></div>` : '');
        const acts = it.mine
          ? `<span class="ipl-acts"><button type="button" class="ipl-act" data-ipl-edit="${it.id}">修改</button><button type="button" class="ipl-act ipl-act--del" data-ipl-del="${it.id}">刪除</button></span>`
          : '';
        return `<li class="ipl-item">
            <div class="ipl-item-head"><b>${esc(rocTime(it.createdAt))}</b><span>${[grade, perf].filter(Boolean).join(' · ')}</span>${it.updatedAt && it.updatedAt !== it.createdAt ? '<small>（已修改）</small>' : ''}${acts}</div>
            <dl>${row('要改善的項目', it.focus)}${row('具體做法', it.actions)}${row('目標與完成日', it.target)}${row('上次執行結果', it.review)}</dl>
          </li>`;
      })
      .join('')}</ol>`;
  }

  function paint() {
    const box = $('apt-plan-root');
    const panel = $('apt-plan-panel');
    if (!box || !ctx) return;
    box.innerHTML = boxHtml();
    if (!panel) return;
    if (ui.mode === 'closed') {
      panel.innerHTML = '';
      panel.className = '';
      return;
    }
    panel.className = 'ipl-panel';
    const writing = ui.mode === 'form' && ctx.self;
    panel.innerHTML = `${writing ? formHtml() : required() || !ctx.self ? adviceHtml() : ''}
      <div class="ipl-hist-title">改善計畫紀錄<small>${esc(ctx.name)} · 每兩週一次，最新的在最上面</small></div>
      ${historyHtml()}`;
  }

  function saveDraft(form) {
    const fd = new FormData(form);
    ui.draft = { focus: fd.get('focus') || '', actions: fd.get('actions') || '', target: fd.get('target') || '', review: fd.get('review') || '' };
  }

  async function submit(form) {
    if (ui.busy) return;
    saveDraft(form);
    const d = ui.draft;
    if (!String(d.focus).trim()) return fail('請填寫要改善的項目');
    if (!String(d.actions).trim()) return fail('請填寫具體做法');
    for (const [k, label] of Object.entries(AI_FIELDS)) {
      if (LIMITED_FIELDS.has(k) && String(d[k]).trim().length > TEXT_LIMIT) {
        return fail(`「${label}」超過 ${TEXT_LIMIT} 字，請精簡`);
      }
    }
    if (Object.values(ui.ai).some((s) => s.busy)) return fail('AI 潤飾中，請等它完成再送出');
    ui.busy = true;
    ui.msg = '';
    paint();
    try {
      await rpc('admin_points_plan_save', {
        p_token: token(),
        p_id: ui.editing,
        p_data: { ...d, grade: ctx.grade, score: ctx.score, perfYear: ctx.year, perfMonth: ctx.month }
      });
      ui.draft = null;
      ui.editing = null;
      ui.mode = 'list';
      ui.busy = false;
      ui.ai = {};
      await load(ctx.name, true);
    } catch (e) {
      ui.busy = false;
      fail(e.message || '送出失敗');
    }
  }

  function fail(msg) {
    ui.msg = msg;
    paint();
  }

  /** 只重畫單一欄位，避免打斷另一欄正在輸入的內容 */
  function paintField(name) {
    const el = document.querySelector(`#apt-plan-panel [data-ipl-field="${name}"]`);
    if (!el) return;
    const rows = el.querySelector('textarea')?.rows || 3;
    const hint = el.querySelector('textarea')?.placeholder || '';
    const tmp = document.createElement('template');
    tmp.innerHTML = field(name, AI_FIELDS[name], rows, ui.draft?.[name] ?? '', hint, true).trim();
    el.replaceWith(tmp.content.firstChild);
  }

  function setAi(name, patch) {
    ui.ai[name] = { ...(ui.ai[name] || {}), ...patch };
    paintField(name);
  }

  async function aiPolish(name) {
    const form = $('apt-plan-panel')?.querySelector('.ipl-form');
    if (!form || ui.ai[name]?.busy) return;
    saveDraft(form);
    const text = String(ui.draft[name] || '').trim();
    if (!token()) return setAi(name, { msg: '請先登入工具箱', tone: 'err' });
    if (text.replace(/\s+/g, '').length < 5) {
      setAi(name, { msg: '請先用自己的話寫幾句，再按 AI 潤飾', tone: 'err' });
      $('apt-plan-panel')?.querySelector(`textarea[name="${name}"]`)?.focus();
      return;
    }
    if (LIMITED_FIELDS.has(name) && text.length > TEXT_LIMIT) {
      return setAi(name, { msg: `超過 ${TEXT_LIMIT} 字，請先精簡`, tone: 'err' });
    }
    setAi(name, { busy: true, msg: '大約 5～20 秒；AI 服務在休息時第一次要等 30～60 秒…', tone: '' });
    try {
      const res = await fetch(aiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token(), field: name, text }),
        signal: AbortSignal.timeout(150000)
      });
      let data = null;
      try { data = await res.json(); } catch { /* 非 JSON */ }
      if (!data?.ok) throw new Error(data?.error || `AI 暫時無法使用（${res.status}）`);
      if (ui.mode !== 'form') return;
      const st = ui.ai[name] || {};
      ui.draft = { ...(ui.draft || {}), [name]: data.text };
      setAi(name, { busy: false, original: st.original ?? text, msg: '✅ 已潤飾，請確認內容跟你的意思一樣再送出', tone: 'ok' });
    } catch (e) {
      const msg = e.name === 'TimeoutError' ? 'AI 潤飾逾時，請再按一次' : e.message === 'Failed to fetch' ? '連不上 AI 服務，請稍後再試' : e.message;
      setAi(name, { busy: false, msg, tone: 'err' });
    }
  }

  function aiUndo(name) {
    const st = ui.ai[name];
    if (st?.original == null) return;
    ui.draft = { ...(ui.draft || {}), [name]: st.original };
    ui.ai[name] = { msg: '已還原成你原本寫的內容', tone: '' };
    paintField(name);
  }

  async function remove(id, btn) {
    if (!window.confirm('確定刪除這筆改善計畫？刪除後大家都看不到。')) return;
    btn.disabled = true;
    try {
      await rpc('admin_points_plan_delete', { p_token: token(), p_id: id });
      if (ui.editing === id) {
        ui.editing = null;
        ui.draft = null;
        ui.mode = 'list';
      }
      await load(ctx.name, true);
    } catch (e) {
      btn.disabled = false;
      window.alert(e.message || '刪除失敗');
    }
  }

  function inPlan(el) {
    return el.closest?.('#apt-plan-root, #apt-plan-panel');
  }

  function onClick(e) {
    if (!ctx || !inPlan(e.target)) return;
    const act = e.target.closest('[data-ipl]')?.dataset.ipl;
    if (act === 'write') {
      ui.mode = 'form';
      ui.editing = null;
      ui.ai = {};
      ui.msg = '';
      paint();
      $('apt-plan-panel')?.querySelector('textarea')?.focus();
      return;
    }
    if (act === 'list') {
      ui.mode = ui.mode === 'closed' ? 'list' : 'closed';
      paint();
      return;
    }
    if (act === 'cancel') {
      ui.mode = 'list';
      ui.editing = null;
      ui.draft = null;
      ui.ai = {};
      ui.msg = '';
      paint();
      return;
    }
    const aiBtn = e.target.closest('[data-ipl-ai]');
    if (aiBtn) {
      aiPolish(aiBtn.dataset.iplAi);
      return;
    }
    const undo = e.target.closest('[data-ipl-ai-undo]');
    if (undo) {
      aiUndo(undo.dataset.iplAiUndo);
      return;
    }
    const edit = e.target.closest('[data-ipl-edit]');
    if (edit) {
      ui.mode = 'form';
      ui.editing = Number(edit.dataset.iplEdit);
      ui.draft = null;
      ui.ai = {};
      ui.msg = '';
      paint();
      return;
    }
    const del = e.target.closest('[data-ipl-del]');
    if (del) remove(Number(del.dataset.iplDel), del);
  }

  function onInput(e) {
    const form = e.target.closest?.('.ipl-form');
    if (!form) return;
    saveDraft(form);
    const name = e.target.name;
    if (AI_FIELDS[name]) {
      const count = form.querySelector(`[data-ipl-count="${name}"]`);
      if (count) count.outerHTML = countHtml(name, e.target.value.length);
    }
  }

  function onSubmit(e) {
    const form = e.target.closest?.('.ipl-form');
    if (!form) return;
    e.preventDefault();
    submit(form);
  }

  /** 由 admin-points.js 在每次重畫後呼叫；opts.self＝看的是自己才可以填寫 */
  function mount(opts) {
    const box = $('apt-plan-root');
    if (!box) return;
    const ds = box.dataset;
    const next = {
      name: ds.name || '',
      grade: ds.grade || '-',
      score: ds.score ? Number(ds.score) : null,
      year: ds.year ? Number(ds.year) : null,
      month: ds.month ? Number(ds.month) : null,
      weak: ds.weak || '',
      self: !!opts?.self,
      pf: opts?.pf?.name === ds.name ? opts.pf : null,
      end: opts?.end || ''
    };
    if (ui.name !== next.name) {
      ui.name = next.name;
      ui.mode = 'closed';
      ui.editing = null;
      ui.draft = null;
      ui.ai = {};
      ui.msg = '';
    }
    ctx = next;
    paint();
    load(ctx.name);
  }

  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('submit', onSubmit);

  window.ImprovePlan = { mount, reload: () => ctx && load(ctx.name, true) };
})();
