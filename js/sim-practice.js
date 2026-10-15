/**
 * 行政點數表 › 教育訓練 › 實作：審核模擬系統（物審、房客審核、合約預審）
 * 模擬系統是另一個網站，畫面跟公司系統一樣；題目是公司系統審核過的真實案件、約 2 成完全沒錯、其餘隨機埋 3～5 個錯，
 * 學員在上面標錯並做出判斷，伺服器評分。每門課通過 sim_obj_pass_target() 題算實作完成。
 * 進入前先用工具箱登入換一張 12 小時的模擬系統通行證（sim_obj_session），工具箱登入 token 不會帶到模擬系統。
 * 由 admin-points.js 在課程頁放入 #sim-practice-root[data-course][data-name] 後呼叫 SimPractice.mount()。
 */
(function () {
  'use strict';

  const SIM_BASE = String(window.SKYFUN_SIM_BASE || 'https://skyfun-sim-obj.pages.dev').replace(/\/$/, '');
  /** 每門課的操作說明：清單在哪、可以標哪些頁、用什麼按鈕交卷 */
  const COURSES = {
    obj: {
      steps: [
        '模擬系統的畫面跟公司系統的物件審核一樣，在<b>物件審核清單</b>點案件進去審。',
        '看到有問題的欄位，按左下角「🚩 標錯」再點那個欄位；房東資料、物件資料、安全檢核頁都可以標。',
        '看完後按<b>核准</b>或<b>退回</b>交卷，馬上顯示分數，並標出哪裡有錯、漏掉哪裡、教學影片第幾分鐘有講。'
      ],
      rule: '放行／退回判斷正確'
    },
    tenant: {
      steps: [
        '模擬系統的畫面跟公司系統的房客審核一樣，在<b>房客審核清單</b>按「審核」進去審。',
        '逐項核對房客、家人、代理人資料與身分證、戶籍謄本、存摺；有問題的欄位按左下角「🚩 標錯」再點那個欄位或附件。',
        '看完後到最下面「房客審核流程」：資料正確就勾<b>已送財調</b>儲存；有錯就勾已送財調、審核結果選<b>不符合</b>並寫意見後儲存。儲存就交卷。'
      ],
      rule: '送財調／退件判斷正確'
    },
    pre: {
      steps: [
        '模擬系統的畫面跟公司系統的合約審核一樣，在<b>合約審核清單</b>按「放行」進去審。',
        '逐項核對合約日期、租金、押金、稅費負擔、公證與附件；有問題的欄位按左下角「🚩 標錯」再點那個欄位或附件。',
        '看完後勾確認項目按<b>核准</b>，或在「放行資訊」的意見寫原因按<b>退回</b>交卷，馬上顯示分數與漏掉的地方。'
      ],
      rule: '核准／退回判斷正確'
    }
  };

  /** 依課程分開：overview 是全部同仁的通過題數，mine 是自己的紀錄 */
  const overview = {};
  const overviewLoading = {};
  const mine = {};
  const mineLoading = {};
  let view = null;
  const listeners = new Set();

  const auth = () => window.skyfunAuth;
  const token = () => auth()?.getToken?.() || '';
  const root = () => document.getElementById('sim-practice-root');
  const has = (course) => Object.prototype.hasOwnProperty.call(COURSES, course);

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function fmtTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear() - 1911}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function fmtDuration(sec) {
    if (sec == null) return '—';
    return Math.floor(sec / 60) + ' 分 ' + String(sec % 60).padStart(2, '0') + ' 秒';
  }

  async function rpc(name, args) {
    if (!auth()?.rpc) throw new Error('尚未登入');
    const res = await auth().rpc(name, args);
    if (!res?.ok) throw new Error(res?.error || '讀取失敗');
    return res;
  }

  function notify() {
    listeners.forEach((fn) => {
      try {
        fn();
      } catch (_) {
        /* ignore */
      }
    });
  }

  async function loadCourseOverview(course, force) {
    if (overviewLoading[course] || (overview[course] && !force)) return;
    overviewLoading[course] = true;
    try {
      const res = await rpc('sim_obj_overview', { p_token: token(), p_course: course });
      overview[course] = { target: Number(res.target) || 3, map: new Map((res.items || []).map((x) => [x.name, x])) };
    } catch (e) {
      overview[course] = { error: e.message, target: 3, map: new Map() };
    } finally {
      overviewLoading[course] = false;
    }
  }
  async function loadOverview(force) {
    if (!token()) return;
    const todo = Object.keys(COURSES).filter((c) => !overviewLoading[c] && (force || !overview[c]));
    if (!todo.length) return;
    await Promise.all(todo.map((c) => loadCourseOverview(c, force)));
    render();
    notify();
  }

  async function loadMine(course, force) {
    if (!token() || mineLoading[course] || (mine[course] && !force)) return;
    mineLoading[course] = true;
    try {
      mine[course] = await rpc('sim_obj_progress', { p_token: token(), p_course: course });
    } catch (e) {
      mine[course] = { error: e.message };
    } finally {
      mineLoading[course] = false;
    }
    render();
  }

  /** 給點數表用：某人某課程的實作狀態（只有開放模擬系統的課程 ready） */
  function statusOf(course, name) {
    const ov = overview[course];
    const row = ov?.map?.get(name);
    const target = ov?.target || 3;
    const passes = row ? Number(row.passes) || 0 : 0;
    return {
      ready: has(course),
      loaded: !!ov && !ov.error,
      passes,
      target,
      attempts: row ? Number(row.attempts) || 0 : 0,
      best: row?.best == null ? null : Number(row.best),
      done: has(course) && passes >= target
    };
  }

  function progressBar(course, passes, target) {
    const pct = Math.min(100, Math.round((passes / (target || 1)) * 100));
    const done = passes >= target;
    return `<div class="cx-vstatus"><span class="cx-vbar"><i style="width:${pct}%;background:${done ? '#16a34a' : '#4f46e5'}"></i></span>
      <b>${done ? '✅ 實作完成' : `通過 ${passes}／${target} 題`}</b>
      <small>每題都是公司系統審核過的真實案件，系統會隨機改錯 3～5 處，或完全沒錯（約 2 成）；找出全部錯誤、${COURSES[course].rule}、誤標不超過 1 處，這一題才算通過。</small></div>`;
  }

  function render(message) {
    const el = root();
    if (!el || !view || el.dataset.course !== view.course) return;
    const course = view.course;
    if (!has(course)) {
      el.innerHTML = '<p class="gx-muted">這個課程的實作模擬系統還在建置，目前開放物審、房客審核、合約預審。</p>';
      return;
    }
    if (!view.self) {
      const s = statusOf(course, view.name);
      el.innerHTML = `<div class="gx-card sim-card">
          ${s.loaded ? progressBar(course, s.passes, s.target) : '<p class="gx-muted">實作進度讀取中…</p>'}
          <p class="gx-muted">${s.loaded ? (s.attempts ? `共做 ${s.attempts} 題，最高 ${s.best} 分。` : '還沒做過實作。') : ''}只有本人登入後可以進入模擬系統。</p>
        </div>`;
      return;
    }
    const my = mine[course];
    if (!my) {
      el.innerHTML = '<p class="gx-muted">實作進度讀取中…</p>';
      return;
    }
    if (my.error) {
      el.innerHTML = `<p class="gx-warn">實作進度讀取失敗：${esc(my.error)}</p>`;
      return;
    }
    const items = my.items || [];
    const canUse = my.canUse && Number(my.cases) > 0;
    const why = !my.canUse ? '模擬系統僅開放行政管理部同仁使用。' : !Number(my.cases) ? '這門課的模擬系統還沒有題目，請洽主管。' : '';
    const hist = items.length
      ? `<div class="gx-hist"><h6>我的實作紀錄</h6><table class="gx-table"><thead><tr><th>交卷時間</th><th>分數</th><th>結果</th><th>用時</th></tr></thead><tbody>${items
          .map((it) => `<tr><td>${fmtTime(it.submittedAt)}</td><td><b>${it.score}</b> 分</td><td class="${it.passed ? 'is-pass' : 'is-fail'}">${it.passed ? '✅ 通過' : '❌ 未通過'}</td><td>${fmtDuration(it.durationSec)}</td></tr>`)
          .join('')}</tbody></table></div>`
      : '';
    el.innerHTML = `<div class="gx-card sim-card">
        ${progressBar(course, Number(my.passes) || 0, Number(my.target) || 3)}
        <div class="gx-rules">
          <ul>
            ${COURSES[course].steps.map((s) => `<li>${s}</li>`).join('')}
            <li>在模擬系統做的任何動作都不會影響公司系統。</li>
          </ul>
          ${why ? `<p class="gx-warn">${esc(why)}</p>` : ''}
          ${message ? `<p class="gx-warn">${esc(message)}</p>` : ''}
          ${canUse ? '<button type="button" class="gx-start" data-sim="enter">進入模擬系統</button>' : ''}
        </div>
      </div>${hist}`;
  }

  async function enter(btn) {
    const course = view?.course;
    if (!has(course)) return;
    // 先同步開視窗，等通行證回來再導過去，避免被瀏覽器當成彈出視窗擋掉
    const win = window.open('', '_blank');
    btn.disabled = true;
    btn.textContent = '準備中…';
    try {
      const res = await rpc('sim_obj_session', { p_token: token() });
      const url = `${SIM_BASE}/sim/start.html#t=${encodeURIComponent(res.session)}&n=${encodeURIComponent(res.name || '')}&c=${course}`;
      if (win) {
        win.opener = null;
        win.location.href = url;
      } else window.location.href = url;
      render();
    } catch (e) {
      if (win) win.close();
      render('無法進入模擬系統：' + e.message);
    }
  }

  function mount(opts) {
    if (!root() || !opts?.course) return;
    view = { course: opts.course, self: !!opts.self, name: opts.name || '' };
    render();
    if (!has(view.course)) return;
    if (view.self) loadMine(view.course, false);
    loadOverview(false);
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-sim="enter"]');
    if (btn && btn.closest('#sim-practice-root')) enter(btn);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !Object.keys(overview).length) return;
    loadOverview(true);
    if (view?.self && root()) loadMine(view.course, true);
  });

  window.SimPractice = {
    mount,
    loadOverview,
    statusOf,
    has,
    onChange: (fn) => listeners.add(fn)
  };
})();
