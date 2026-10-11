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

  const cache = new Map();
  const ui = { name: '', mode: 'closed', editing: null, draft: null, msg: '', busy: false };
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

  /** 業績月結束前剩幾個工作天（週一～週五，含今天） */
  function workDaysLeft(end) {
    if (!end) return 0;
    const last = new Date(`${end}T00:00:00`);
    let n = 0;
    for (let d = startOfDay(new Date()); d <= last; d = new Date(d.getTime() + DAY_MS)) {
      if (d.getDay() !== 0 && d.getDay() !== 6) n += 1;
    }
    return n;
  }

  /** 依個人分析（personProfile）整理：落後了什麼、建議做法、建議目標 */
  function advice() {
    const pf = ctx.pf;
    if (!pf) return null;
    const fmtDur = window.AdminPointsCore?.formatDuration || ((s) => `${Math.round(s / 60)} 分`);
    const days = workDaysLeft(ctx.end);
    const pt = pf.points || {};
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

    const tips = [];
    const add = (area, text) => tips.push({ area, text });
    if (areas.has('點數產出')) {
      if (pt.avg && pt.total < pt.avg) {
        const gap = Math.ceil(pt.avg - pt.total);
        add('點數產出', days
          ? `本月 ${pt.total} 點，行政平均 ${pt.avg.toFixed(0)} 點，還差 ${gap} 點；剩 ${days} 個工作天，每天要比現在多做約 ${Math.ceil(gap / days)} 點`
          : `本月 ${pt.total} 點，比行政平均 ${pt.avg.toFixed(0)} 點少 ${gap} 點`);
      }
      if (pt.toNext && days) add('點數產出', `距${pt.nextLabel}還差 ${pt.toNext} 點，剩 ${days} 個工作天，平均每天要 ${Math.ceil(pt.toNext / days)} 點`);
      if (pt.avgDays && pt.days < pt.avgDays * 0.85) add('點數產出', '每個上班日都要有產出：開工先清待審清單，不要整天掛零');
      add('點數產出', '每天早上先排好今天要清的件數（物審、房客、預審、複審），中午、下班前各對一次進度');
      const lowItems = (pf.items || []).filter((it) => it.doers >= 2 && it.doersAvg && it.mine < it.doersAvg * 0.85 && it.key !== 'manual' && it.key !== 'qa');
      if (lowItems.length) add('點數產出', `${lowItems.slice(0, 3).map((it) => it.label).join('、')}件數偏少：跟組長確認分案量，或請教做得多的同仁流程`);
    }
    if (areas.has('審核速度')) {
      const slow = (pf.nodes || []).filter((n) => n.count >= 3 && n.diff != null && n.diff > 0).sort((a, b) => b.diff - a.diff);
      if (slow.length) {
        const n = slow[0];
        add('審核速度', `${n.label}平均 ${fmtDur(n.avg)}，全體 ${fmtDur(n.base)}：觀摩做得快的同仁，整理自己的檢查順序`);
      }
      if (pf.speed?.long >= 2) add('審核速度', '案件打開就一次審完再送出，不要開著放；要等資料就先退回或標記，避免超過 1 小時的紀錄');
      add('審核速度', '同一個問題卡超過 10 分鐘就問組長，不要自己耗著');
    }
    if (areas.has('審件品質')) {
      add('審件品質', '抽查錯的案件逐一跟組長確認錯在哪，整理成自己的檢核清單，送出前照清單檢查一次');
      add('審件品質', '不確定的規定回到執行要點找對應條文，並完成執行要點線上考試');
    }
    if (areas.has('客訴紀律')) {
      add('客訴紀律', '跟組長一起檢討客訴案件的原因與回覆方式');
      add('客訴紀律', '回覆民眾前先確認資料與規定，重要案件請組長先看過再回');
    }
    const Core = window.AdminPointsCore;
    const cx = window.CourseExam;
    const gx = window.GuideExam?.progressOf(pf.name);
    const untrained = Core?.trainingState && cx?.statusOf(Core.VIDEO_COURSES[0], pf.name)?.loaded
      ? (pf.training || []).filter((t) => {
          const c = cx.has(t.key) ? cx.statusOf(t.key, pf.name) : null;
          const st = Core.trainingState(t.key, { videoDone: c?.video?.done, examPassed: c?.passed, guideRate: gx?.loaded && gx.total ? gx.passed / gx.total : null });
          return st.steps.some((x) => !x.ok && !x.pending);
        }).map((t) => t.label)
      : [];
    if (untrained.length) add('教育訓練', `影片或考試還沒完成的教育訓練：${untrained.slice(0, 4).join('、')}${untrained.length > 4 ? ` 等 ${untrained.length} 項` : ''}，到點數表教育訓練看完影片、考完試`);

    const targets = [];
    if (areas.has('點數產出') && pt.avg && pt.total < pt.avg) targets.push(`兩週內月累積追到行政平均 ${Math.ceil(pt.avg)} 點`);
    else if (areas.has('點數產出') && pt.toNext) targets.push(`本業績月達到${pt.nextLabel}（${pt.total + pt.toNext} 點）`);
    const slowTop = (pf.nodes || []).filter((n) => n.count >= 3 && n.diff != null && n.diff > 0).sort((a, b) => b.diff - a.diff)[0];
    if (areas.has('審核速度') && slowTop) targets.push(`兩週內${slowTop.label}平均耗時降到 ${fmtDur(slowTop.base)} 以下`);
    if (areas.has('審件品質')) targets.push('下次抽查良率達 95% 以上');
    if (areas.has('客訴紀律')) targets.push('兩週內零客訴');

    return { gaps, dims, tips, target: targets.join('；') };
  }

  function adviceHtml(readonly) {
    const a = advice();
    if (!a) return '';
    const icon = (lv) => (lv === 'bad' ? '🔴' : '🟠');
    const dims = a.dims.length
      ? `<p class="ipl-dims">${a.dims.map((d) => `<span class="${d.score < 50 ? 'is-low' : ''}">${esc(d.label)} <b>${Math.round(d.score)}</b></span>`).join('')}</p>`
      : '';
    const gaps = a.gaps.length
      ? `<ul class="ipl-gaps">${a.gaps.map((g) => `<li>${icon(g.level)} <b>${esc(g.area)}</b>　${esc(g.text)}</li>`).join('')}</ul>`
      : '<p class="ipl-none">目前沒有明顯落後的項目。</p>';
    const tips = a.tips.length
      ? `<ul class="ipl-tips">${a.tips
          .map((t) => (readonly
            ? `<li><span class="ipl-tip"><em>${esc(t.area)}</em>${esc(t.text)}</span></li>`
            : `<li><button type="button" class="ipl-tip" data-ipl-tip="${esc(t.text)}"><em>${esc(t.area)}</em>${esc(t.text)}<i>＋ 加入</i></button></li>`))
          .join('')}</ul>`
      : '';
    const target = !a.target ? '' : readonly
      ? `<p class="ipl-target-text">建議目標：${esc(a.target)}</p>`
      : `<button type="button" class="ipl-chip ipl-chip--target" data-ipl-target="${esc(a.target)}">＋ 建議目標：${esc(a.target)}</button>`;
    return `<div class="ipl-guide">
        <div class="ipl-guide-col">
          <div class="ipl-guide-title">📉 落後了什麼<small>各面向分數（滿分 100）</small></div>
          ${dims}${gaps}
        </div>
        <div class="ipl-guide-col">
          <div class="ipl-guide-title">💡 建議做法<small>${readonly ? '系統依本月資料產生' : '點一下就加入「具體做法」'}</small></div>
          ${tips}${target}
        </div>
      </div>`;
  }

  function field(name, label, rows, value, hint, req) {
    return `<label class="ipl-f"><span>${label}${req ? ' <em>*</em>' : ''}</span><textarea name="${name}" rows="${rows}" maxlength="${name === 'focus' || name === 'target' ? 1000 : 2000}" placeholder="${esc(hint)}">${esc(value || '')}</textarea></label>`;
  }

  function formHtml() {
    const items = cache.get(ctx.name)?.items || [];
    const editing = ui.editing ? items.find((x) => x.id === ui.editing) : null;
    const d = ui.draft || editing || {};
    const prev = editing ? null : items[0];
    const weak = ctx.weak ? ctx.weak.split('、') : [];
    return `<form class="ipl-form" novalidate>
        <div class="ipl-form-title">${editing ? '✏️ 修改改善計畫' : '✍️ 填寫改善計畫'}<small>本次評等 ${esc(ctx.grade)}${ctx.score ? `（${Math.round(Number(ctx.score))} 分）` : ''}；送出後處長、組長都看得到</small></div>
        ${adviceHtml()}
        ${weak.length ? `<p class="ipl-suggest">把落後項目加入「本期要改善的項目」：${weak.map((w) => `<button type="button" class="ipl-chip" data-ipl-chip="${esc(w)}">＋ ${esc(w)}</button>`).join('')}</p>` : ''}
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
        : `改善計畫要由 ${esc(ctx.name)} 本人登入工具箱，在自己的「個人明細」填寫；寫好後會出現在這裡。`;
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
    panel.innerHTML = `${writing ? formHtml() : required() || !ctx.self ? adviceHtml(true) : ''}
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
      ui.msg = '';
      paint();
      $('apt-plan-panel')?.querySelector('textarea')?.focus();
      return;
    }
    if (act === 'list') {
      ui.mode = ui.mode === 'closed' ? 'list' : 'closed';
      paint();
      if (ui.mode === 'list') $('apt-plan-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    if (act === 'cancel') {
      ui.mode = 'list';
      ui.editing = null;
      ui.draft = null;
      ui.msg = '';
      paint();
      return;
    }
    const chip = e.target.closest('[data-ipl-chip]');
    if (chip) {
      const ta = $('apt-plan-panel')?.querySelector('textarea[name="focus"]');
      if (ta && !ta.value.includes(chip.dataset.iplChip)) {
        ta.value = ta.value.trim() ? `${ta.value.trim()}、${chip.dataset.iplChip}` : chip.dataset.iplChip;
        saveDraft(ta.form);
      }
      return;
    }
    const tip = e.target.closest('[data-ipl-tip]');
    if (tip) {
      const ta = $('apt-plan-panel')?.querySelector('textarea[name="actions"]');
      const line = `・${tip.dataset.iplTip}`;
      if (ta && !ta.value.includes(tip.dataset.iplTip)) {
        ta.value = ta.value.trim() ? `${ta.value.trim()}\n${line}` : line;
        saveDraft(ta.form);
      }
      tip.classList.add('is-added');
      const mark = tip.querySelector('i');
      if (mark) mark.textContent = '✓ 已加入';
      return;
    }
    const target = e.target.closest('[data-ipl-target]');
    if (target) {
      const ta = $('apt-plan-panel')?.querySelector('textarea[name="target"]');
      if (ta && !ta.value.includes(target.dataset.iplTarget)) {
        ta.value = ta.value.trim() ? `${ta.value.trim()}；${target.dataset.iplTarget}` : target.dataset.iplTarget;
        saveDraft(ta.form);
      }
      return;
    }
    const edit = e.target.closest('[data-ipl-edit]');
    if (edit) {
      ui.mode = 'form';
      ui.editing = Number(edit.dataset.iplEdit);
      ui.draft = null;
      ui.msg = '';
      paint();
      $('apt-plan-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    const del = e.target.closest('[data-ipl-del]');
    if (del) remove(Number(del.dataset.iplDel), del);
  }

  function onInput(e) {
    const form = e.target.closest?.('.ipl-form');
    if (form) saveDraft(form);
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
