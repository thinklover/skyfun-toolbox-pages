/**
 * 行政點數表 › 教育訓練 › 執行要點線上考試
 * 每次 20 題、限時 20 分鐘、伺服器評分；全對才通過，沒全對用同一份題目補考，通過後才抽下一份。
 * 由 admin-points.js 在「執行要點」頁放入 #guide-exam-root 後呼叫 GuideExam.mount()。
 */
(function () {
  'use strict';

  const STATE_KEY = 'guideExamState-v1';
  const LETTERS = 'ABCD';

  let exam = null;
  let progress = null;
  let progressLoading = false;
  let overview = null;
  let overviewLoading = false;
  let lastResult = null;
  let timerId = null;
  let submitting = false;
  let view = null;
  const listeners = new Set();

  const data = () => window.GUIDE_EXAM;
  const auth = () => window.skyfunAuth;
  const token = () => auth()?.getToken?.() || '';
  const root = () => document.getElementById('guide-exam-root');

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function rpc(name, args) {
    if (!auth()?.rpc) throw new Error('尚未登入');
    const res = await auth().rpc(name, args);
    if (!res?.ok) {
      const err = new Error(res?.error || '讀取失敗');
      err.res = res;
      throw err;
    }
    return res;
  }

  function randInt(n) {
    if (window.crypto?.getRandomValues) {
      const a = new Uint32Array(1);
      window.crypto.getRandomValues(a);
      return a[0] % n;
    }
    return Math.floor(Math.random() * n);
  }
  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  let byId = null;
  function question(qid) {
    if (!byId) byId = new Map((data()?.questions || []).map((q) => [q.id, q]));
    return byId.get(qid);
  }

  function saveState() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(exam));
    } catch (_) {
      /* 無法存就只留在記憶體 */
    }
  }
  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
    } catch (_) {
      return null;
    }
  }
  function clearState() {
    try {
      localStorage.removeItem(STATE_KEY);
    } catch (_) {
      /* ignore */
    }
  }

  function fmtClock(sec) {
    const s = Math.max(0, Math.round(sec));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  function fmtDuration(sec) {
    if (sec == null) return '—';
    return Math.floor(sec / 60) + ' 分 ' + String(sec % 60).padStart(2, '0') + ' 秒';
  }
  function fmtTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear() - 1911}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
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

  /* ---------- 進度圓餅圖 ---------- */

  function pie(passed, total, caption) {
    const pct = total ? Math.round((passed / total) * 1000) / 10 : 0;
    const deg = total ? (passed / total) * 360 : 0;
    const color = pct >= 100 ? '#16a34a' : '#4f46e5';
    const score = total ? Math.round((passed / total) * 100) : 0;
    return `<div class="gx-pie-wrap">
        <div class="gx-pie" style="background:conic-gradient(${color} 0 ${deg}deg, #e2e8f0 ${deg}deg 360deg)">
          <div class="gx-pie-hole"><b>${pct}%</b><small>${passed}／${total} 題</small></div>
        </div>
        <ul class="gx-pie-legend">
          <li class="gx-pie-score">考試分數 <b style="color:${color}">${score}</b> 分<small>（滿分 100）</small></li>
          <li><i style="background:${color}"></i>已考滿分 ${passed} 題</li>
          <li><i style="background:#e2e8f0"></i>還沒通過 ${Math.max(0, total - passed)} 題</li>
          ${caption ? `<li class="gx-pie-cap">${caption}</li>` : ''}
        </ul>
      </div>`;
  }

  /* ---------- 資料 ---------- */

  async function loadProgress() {
    if (!token() || progressLoading) return;
    progressLoading = true;
    try {
      progress = await rpc('guide_exam_progress', { p_token: token() });
    } catch (e) {
      progress = { error: e.message };
    } finally {
      progressLoading = false;
    }
    if (view?.self && !exam && !lastResult) renderHome();
    notify();
  }

  async function loadOverview(force) {
    if (!token() || overviewLoading || (overview && !force)) return;
    overviewLoading = true;
    try {
      const res = await rpc('guide_exam_overview', { p_token: token() });
      overview = { total: res.total, map: new Map((res.items || []).map((x) => [x.name, x])) };
    } catch (e) {
      overview = { error: e.message, map: new Map() };
    } finally {
      overviewLoading = false;
    }
    renderBoard();
    notify();
  }

  /* ---------- 全員考試成績（處長、組長追蹤用） ---------- */

  let board = null;
  const boardUi = { leader: '', open: '' };
  const boardRoot = () => document.getElementById('guide-exam-board');

  function boardRows() {
    const total = overview?.total || data()?.questions.length || 0;
    const staff = board?.staff || [];
    const seen = new Set();
    const rows = staff.map((s) => {
      seen.add(s.name);
      return { name: s.name, leader: s.leader || '', where: [s.region, s.office].filter(Boolean).join(' '), kind: s.kind || '', row: overview?.map?.get(s.name) };
    });
    if (!board?.leader && !board?.scoped && !boardUi.leader) {
      for (const [name, row] of overview?.map || []) if (!seen.has(name)) rows.push({ name, leader: '', where: '', kind: '', row, extra: true });
    }
    return rows.map((r) => {
      const passed = r.row ? Number(r.row.passed) || 0 : 0;
      const attempts = r.row ? Number(r.row.attempts) || 0 : 0;
      const state = total && passed >= total ? 'done' : r.row?.pendingRetake ? 'retake' : attempts ? 'doing' : 'none';
      const last = (r.row?.history || []).find((h) => h.status === 'submitted' && Number(h.total) > 0);
      return {
        ...r,
        passed,
        total,
        attempts,
        pct: total ? passed / total : 0,
        score: total ? Math.round((passed / total) * 100) : 0,
        last: last ? { score: Math.round((Number(last.correct) / Number(last.total)) * 100), correct: Number(last.correct), total: Number(last.total), passed: !!last.passed, at: last.submittedAt } : null,
        passedSets: r.row ? Number(r.row.passedSets) || 0 : 0,
        state
      };
    });
  }

  function scoreTone(score, attempts) {
    if (score >= 100) return 'is-full';
    if (score >= 60) return 'is-good';
    if (score > 0 || attempts) return 'is-low';
    return 'is-zero';
  }
  function hueOf(name) {
    let h = 0;
    for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) % 360;
    return h;
  }

  const BOARD_STATE = {
    done: ['is-done', '✅ 全部通過'],
    retake: ['is-retake', '⚠️ 待補考'],
    doing: ['is-doing', '進行中'],
    none: ['is-none', '尚未開始']
  };

  function renderBoard() {
    const el = boardRoot();
    if (!el || !board) return;
    if (!overview) {
      el.innerHTML = '<p class="gx-muted">讀取全員考試成績中…</p>';
      return;
    }
    if (overview.error) {
      el.innerHTML = `<p class="gx-warn">全員考試成績讀取失敗：${esc(overview.error)}</p>`;
      return;
    }
    const leader = board.leader != null ? board.leader : boardUi.leader;
    const all = boardRows();
    const rows = all
      .filter((r) => !leader || r.leader === leader)
      .sort((a, b) => b.pct - a.pct || (b.last?.score ?? -1) - (a.last?.score ?? -1) || b.attempts - a.attempts || a.name.localeCompare(b.name, 'zh-Hant'));
    const leaders = [...new Set(all.map((r) => r.leader).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    const count = (st) => rows.filter((r) => r.state === st).length;
    const avg = rows.length ? Math.round((rows.reduce((s, r) => s + r.pct, 0) / rows.length) * 1000) / 10 : 0;
    const avgScore = rows.length ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length) : 0;
    const tested = rows.filter((r) => r.last);
    const avgLast = tested.length ? Math.round(tested.reduce((s, r) => s + r.last.score, 0) / tested.length) : null;
    const filter = board.leader != null
      ? ''
      : `<label class="gx-board-filter">組長 <select data-gx-board-leader><option value="">全部</option>${leaders
          .map((l) => `<option value="${esc(l)}"${l === leader ? ' selected' : ''}>${esc(l)}</option>`)
          .join('')}</select></label>`;
    const body = rows
      .map((r) => {
        const [cls, text] = BOARD_STATE[r.state];
        const pct = Math.round(r.pct * 1000) / 10;
        const open = boardUi.open === r.name;
        const hist = open
          ? `<tr class="gx-board-hist"><td colspan="8">${
              (r.row?.history || []).length
                ? `<table class="gx-table"><thead><tr><th>交卷時間</th><th>份別</th><th>答對</th><th>分數</th><th>結果</th><th>用時</th></tr></thead><tbody>${r.row.history
                    .map((h) => {
                      const sub = h.status === 'submitted';
                      const sc = sub && Number(h.total) ? Math.round((Number(h.correct) / Number(h.total)) * 100) : null;
                      return `<tr><td>${fmtTime(h.submittedAt)}</td><td>第 ${h.setNo} 份${h.retake ? `（補考 ${h.retake}）` : ''}</td><td>${sub ? `${h.correct}／${h.total}` : '—'}</td><td>${sc == null ? '—' : `<b class="gx-sc ${scoreTone(sc)}">${sc}</b> 分`}</td><td class="${h.passed ? 'is-pass' : sub ? 'is-fail' : ''}">${!sub ? '未交卷（作廢）' : h.passed ? '✅ 通過' : '❌ 需補考'}</td><td>${sub ? fmtDuration(h.durationSec) : '—'}${h.autoSubmitted ? '（時間到）' : ''}</td></tr>`;
                    })
                    .join('')}</tbody></table><p class="gx-muted">最近 10 次；不顯示作答內容與答案。</p>`
                : '<p class="gx-muted">還沒有考試紀錄。</p>'
            }</td></tr>`
          : '';
        const tags = `${r.kind === '工讀生' ? '<em class="gx-tag">工讀</em>' : ''}${r.extra ? '<em class="gx-tag is-warn">不在人力明細</em>' : ''}`;
        const last = r.last
          ? `<span class="gx-last"><b class="gx-sc ${scoreTone(r.last.score)}">${r.last.score}</b><i>分</i><small>${r.last.correct}／${r.last.total}・${fmtTime(r.last.at).slice(4)}</small></span>`
          : '<span class="gx-dim">—</span>';
        return `<tr class="gx-board-row${open ? ' is-open' : ''}${board.highlight === r.name ? ' is-me' : ''}" data-gx-board-row="${esc(r.name)}">
            <td><span class="gx-who"><span class="gx-avatar" style="--h:${hueOf(r.name)}">${esc(r.name.slice(0, 1))}</span><span><b>${esc(r.name)}</b>${tags}</span></span></td>
            <td class="gx-leader">${esc(r.leader) || '<span class="gx-dim">—</span>'}</td>
            <td class="gx-score-cell"><b class="gx-score ${scoreTone(r.score, r.attempts)}">${r.score}</b><i>分</i></td>
            <td class="gx-board-prog"><div><span class="gx-board-bar"><i style="width:${Math.min(100, pct)}%"></i></span><b>${pct}%</b><small>${r.passed}／${r.total} 題</small></div></td>
            <td class="num">${r.passedSets || '<span class="gx-dim">0</span>'}</td>
            <td class="num">${r.attempts || '<span class="gx-dim">0</span>'}</td>
            <td>${last}</td>
            <td><span class="gx-board-state ${cls}">${text}</span></td>
          </tr>${hist}`;
      })
      .join('');
    el.innerHTML = `<div class="gx-board">
        <div class="gx-board-head">
          <div class="gx-stat is-main"><span>平均分數</span><b>${avgScore}<i>分</i></b><small>${rows.length} 人 · 平均進度 ${avg}%</small></div>
          <div class="gx-stat"><span>最近一次平均</span><b>${avgLast == null ? '—' : `${avgLast}<i>分</i>`}</b><small>${tested.length} 人考過</small></div>
          <div class="gx-stat is-done"><span>全部通過</span><b>${count('done')}<i>人</i></b></div>
          <div class="gx-stat is-retake"><span>待補考</span><b>${count('retake')}<i>人</i></b></div>
          <div class="gx-stat is-doing"><span>進行中</span><b>${count('doing')}<i>人</i></b></div>
          <div class="gx-stat is-none"><span>尚未開始</span><b>${count('none')}<i>人</i></b></div>
          ${filter}
        </div>
        <div class="gx-board-wrap"><table class="gx-table gx-board-table">
          <thead><tr><th>姓名</th><th>組長</th><th class="gx-score-cell">分數<small>滿分 100</small></th><th>進度</th><th class="num">通過份數</th><th class="num">考試次數</th><th>最近一次考試</th><th>狀態</th></tr></thead>
          <tbody>${body || '<tr><td colspan="8" class="gx-muted">沒有人員</td></tr>'}</tbody>
        </table></div>
        <p class="gx-muted">分數＝已考滿分的題數 ÷ 全部 ${rows[0]?.total || ''} 題 × 100，跟個人頁的考試分數相同；「最近一次考試」是最後一次交卷那份的答對率。點一列可展開最近 10 次成績。所有登入的同仁都看得到。</p>
      </div>`;
  }

  /** 由點數表呼叫：opts.staff 人力明細在職名單；opts.leader 有值時只顯示該組（由外部篩選）；opts.scoped 只列 staff 裡的人 */
  function mountBoard(opts) {
    board = { staff: opts?.staff || [], leader: opts?.leader != null ? opts.leader : null, scoped: !!opts?.scoped, highlight: opts?.highlight || '' };
    renderBoard();
    loadOverview();
  }

  function progressOf(name) {
    const total = overview?.total || data()?.questions.length || 0;
    const row = overview?.map?.get(name);
    return { passed: row ? Number(row.passed) || 0 : 0, total, attempts: row ? Number(row.attempts) || 0 : 0, loaded: !!overview && !overview.error };
  }

  /* ---------- 首頁 ---------- */

  const ADMIN_LINK = '<p class="gx-admin-link"><a href="./admin/guide-exam-dashboard.html" target="_blank" rel="noopener">管理員：查看全部考試成績 ↗</a></p>';

  function renderHome(message) {
    const el = root();
    if (!el || !view) return;
    if (!view.self) {
      const p = progressOf(view.name);
      el.innerHTML = `<div class="gx-card">
          ${pie(p.passed, p.total, p.loaded ? (p.attempts ? `共考 ${p.attempts} 次` : '還沒考過') : '讀取中…')}
          <p class="gx-muted">只有本人登入後可以在這裡考試；這裡顯示 ${esc(view.name)} 的考試進度。</p>
        </div>${ADMIN_LINK}`;
      return;
    }
    const d = data();
    const pr = progress && !progress.error ? progress : null;
    const total = pr?.total || d.questions.length;
    const passed = pr?.passed || 0;
    const done = pr && passed >= total;
    const pending = pr?.pending;
    const resume = exam && exam.deadline > Date.now();
    const btnText = resume ? '接續作答' : pending ? `開始補考（第 ${pending.setNo} 份）` : '開始考試';
    const status = !pr
      ? `<p class="gx-muted">${progress?.error ? '進度讀取失敗：' + esc(progress.error) : '讀取進度中…'}</p>`
      : done
        ? '<p class="gx-ok">🎉 執行要點題目已全部考過滿分！</p>'
        : pending
          ? `<p class="gx-warn">第 ${pending.setNo} 份上次沒有全對，要用同一份 ${pending.total} 題補考（第 ${pending.retake} 次補考），全對才算通過。</p>`
          : `<p class="gx-muted">下一份會從還沒通過的 ${total - passed} 題中抽 ${Math.min(d.perSet, total - passed)} 題。</p>`;
    const items = pr?.items || [];
    const hist = items.length
      ? `<div class="gx-hist"><h6>我的考試紀錄</h6><table class="gx-table"><thead><tr><th>考試時間</th><th>份別</th><th>答對</th><th>分數</th><th>結果</th><th>用時</th></tr></thead><tbody>${items
          .map((it) => {
            const sub = it.status === 'submitted';
            const res = !sub ? '未交卷（作廢）' : it.passed ? '✅ 通過' : '❌ 需補考';
            return `<tr><td>${fmtTime(it.startedAt)}</td><td>第 ${it.setNo} 份${it.retake ? `（補考 ${it.retake}）` : ''}</td><td>${sub ? `${it.correct}／${it.total}` : '—'}</td><td>${sub && it.total ? `<b>${Math.round((it.correct / it.total) * 100)}</b> 分` : '—'}</td><td class="${it.passed ? 'is-pass' : sub ? 'is-fail' : ''}">${res}</td><td>${sub ? fmtDuration(it.durationSec) : '—'}${it.autoSubmitted ? '（時間到）' : ''}</td></tr>`;
          })
          .join('')}</tbody></table></div>`
      : '';
    el.innerHTML = `<div class="gx-card">
        ${pie(passed, total, pr ? `已通過 ${items.filter((x) => x.passed).length} 份` : '')}
        <div class="gx-rules">
          <p><b>執行要點線上考試</b>（社會住宅包租代管第三期至第五期計畫執行要點，共 ${total} 題）</p>
          <ul>
            <li>每次 <b>${d.perSet} 題</b>單選題，限時 <b>${d.durationMin} 分鐘</b>，時間到自動交卷。</li>
            <li><b>全部答對才算通過</b>；沒全對要用<b>同一份題目補考</b>，通過後才會抽下一份。</li>
            <li>通過的題目會計入左邊的進度，考完 ${total} 題就是 100%。</li>
          </ul>
          ${status}
          ${message ? `<p class="gx-warn">${esc(message)}</p>` : ''}
          ${done ? '' : `<button type="button" class="gx-start" data-gx="start"${pr || resume ? '' : ' disabled'}>${btnText}</button>`}
        </div>
      </div>${hist}${ADMIN_LINK}`;
  }

  /* ---------- 作答 ---------- */

  async function startExam() {
    const btn = root()?.querySelector('[data-gx="start"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '準備考卷中…';
    }
    try {
      const res = await rpc('guide_exam_start', { p_token: token() });
      const skew = Date.now() - new Date(res.serverNow).getTime();
      const saved = loadState();
      if (saved && saved.attemptId === res.attemptId) {
        exam = saved;
      } else {
        const optOrder = {};
        res.qids.forEach((qid) => {
          optOrder[qid] = shuffle((question(qid)?.options || []).map((o) => o.id));
        });
        exam = { attemptId: res.attemptId, setNo: res.setNo, retake: res.retake, order: shuffle(res.qids), optOrder, answers: {} };
      }
      exam.skew = skew;
      exam.deadline = new Date(res.deadlineAt).getTime();
      saveState();
      lastResult = null;
      renderExam(res.resumed);
    } catch (e) {
      if (e.res?.done) loadProgress();
      renderHome(e.message);
    }
  }

  function answered() {
    return exam ? exam.order.filter((q) => exam.answers[q]).length : 0;
  }

  function renderExam(resumed) {
    const el = root();
    if (!el || !exam) return;
    const qs = exam.order
      .map((qid, i) => {
        const q = question(qid);
        if (!q) return '';
        const opts = (exam.optOrder[qid] || q.options.map((o) => o.id))
          .map((oid, k) => {
            const o = q.options.find((x) => x.id === oid);
            const on = exam.answers[qid] === oid;
            return `<label class="gx-opt${on ? ' is-on' : ''}"><input type="radio" name="gxq-${qid}" value="${esc(oid)}" data-gx-q="${qid}"${on ? ' checked' : ''}><span class="gx-letter">${LETTERS[k]}</span><span>${esc(o?.text)}</span></label>`;
          })
          .join('');
        return `<div class="gx-q" id="gxq-${qid}"><p class="gx-q-title"><span class="gx-no">${i + 1}.</span>${esc(q.text)}</p><div class="gx-opts">${opts}</div></div>`;
      })
      .join('');
    el.innerHTML = `<div class="gx-bar">
        <span class="gx-bar-title">第 ${exam.setNo} 份${exam.retake ? `（補考 ${exam.retake}）` : ''}</span>
        <span class="gx-clock" id="gx-clock">--:--</span>
        <span class="gx-count" id="gx-count"></span>
        <button type="button" class="gx-submit" data-gx="submit">交卷</button>
      </div>
      ${resumed ? '<p class="gx-warn">已接續上次未完成的考卷，計時不會重新開始。</p>' : ''}
      <div class="gx-qs">${qs}</div>
      <button type="button" class="gx-submit is-bottom" data-gx="submit">交卷</button>`;
    updateCount();
    startTimer();
  }

  function updateCount() {
    const el = document.getElementById('gx-count');
    if (el && exam) el.textContent = `已答 ${answered()}／${exam.order.length}`;
  }

  function remainingSec() {
    return (exam.deadline - (Date.now() - (exam.skew || 0))) / 1000;
  }

  function startTimer() {
    stopTimer();
    const tick = () => {
      if (!exam) return stopTimer();
      const left = remainingSec();
      const clock = document.getElementById('gx-clock');
      if (clock) {
        clock.textContent = '剩 ' + fmtClock(left);
        clock.classList.toggle('is-warn', left <= 300 && left > 60);
        clock.classList.toggle('is-danger', left <= 60);
      }
      if (left <= 0) {
        stopTimer();
        submitExam(true);
      }
    };
    tick();
    timerId = setInterval(tick, 1000);
  }
  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }

  async function submitExam(auto) {
    if (!exam || submitting) return;
    if (!auto) {
      const left = exam.order.length - answered();
      if (!window.confirm(left > 0 ? `還有 ${left} 題未作答，確定要交卷嗎？` : '確定要交卷嗎？')) return;
    }
    submitting = true;
    root()?.querySelectorAll('[data-gx="submit"]').forEach((b) => {
      b.disabled = true;
      b.textContent = '評分中…';
    });
    try {
      const res = await rpc('guide_exam_submit', { p_token: token(), p_attempt_id: exam.attemptId, p_answers: exam.answers, p_auto: !!auto });
      stopTimer();
      lastResult = { res, snapshot: exam };
      exam = null;
      clearState();
      if (progress && !progress.error) progress = { ...progress, passed: res.progress.passed, total: res.progress.total };
      renderResult();
      loadProgress();
      loadOverview(true);
    } catch (e) {
      if (/已交卷|作廢|找不到/.test(e.message)) {
        stopTimer();
        exam = null;
        clearState();
        renderHome('這份考卷已無法交卷（' + e.message + '），請重新開始。');
        return;
      }
      root()?.querySelectorAll('[data-gx="submit"]').forEach((b) => {
        b.disabled = false;
        b.textContent = '交卷';
      });
      if (!auto) window.alert('交卷失敗：' + e.message + '\n作答內容已保存在此裝置，請確認網路後再按一次「交卷」。');
    } finally {
      submitting = false;
    }
  }

  /* ---------- 成績 ---------- */

  function renderResult() {
    const el = root();
    if (!el || !lastResult) return;
    const { res, snapshot } = lastResult;
    const total = res.progress?.total || data().questions.length;
    const passedQ = res.progress?.passed || 0;
    const wrong = snapshot.order.filter((q) => !res.results?.[q]);
    const optText = (q, oid) => {
      const ids = snapshot.optOrder[q.id] || q.options.map((o) => o.id);
      const k = ids.indexOf(oid);
      const o = q.options.find((x) => x.id === oid);
      return o ? `${LETTERS[k] || '?'}. ${o.text}` : '（未作答）';
    };
    const list = snapshot.order
      .map((qid, i) => {
        const q = question(qid);
        const ok = !!res.results?.[qid];
        return `<div class="gx-r ${ok ? 'is-right' : 'is-wrong'}">
            <p class="gx-q-title"><span class="gx-no">${i + 1}.</span>${esc(q?.text)}<span class="gx-r-mark">${ok ? '✔ 答對' : '✘ 答錯'}</span></p>
            ${ok ? '' : `<p class="gx-r-line"><span>你的答案</span>${esc(optText(q, snapshot.answers[qid]))}</p><p class="gx-r-line is-src"><span>回去看</span>執行要點 ${esc(q?.basis)}</p>`}
          </div>`;
      })
      .join('');
    el.innerHTML = `<div class="gx-score ${res.passed ? 'is-pass' : 'is-fail'}">
        <div class="gx-score-main">
          <p class="gx-score-num">${res.correct}<small>／${res.total} 題</small></p>
          <p class="gx-score-tag">${res.passed ? `✅ 第 ${res.setNo} 份通過！` : `❌ 第 ${res.setNo} 份還沒全對，需要補考`}</p>
          <p class="gx-muted">用時 ${fmtDuration(res.durationSec)}${res.autoSubmitted ? ' · 時間到自動交卷' : ''}${res.overtime ? ' · 逾時交卷' : ''} · 成績已記錄</p>
          ${res.passed ? '' : `<p class="gx-warn">答錯 ${wrong.length} 題，補考會用同一份 ${res.total} 題（順序重排），全對才通過。下面列出答錯的題目與條文出處。</p>`}
          <div class="gx-score-btns">
            ${passedQ >= total ? '' : `<button type="button" class="gx-start" data-gx="start">${res.passed ? '考下一份' : '開始補考'}</button>`}
            <button type="button" class="gx-lite" data-gx="home">回考試首頁</button>
          </div>
        </div>
        ${pie(passedQ, total, res.passed ? `這份 ${res.total} 題已計入進度` : '這份沒全對，不計入進度')}
      </div>
      <details class="gx-review"${res.passed ? '' : ' open'}><summary>逐題檢討</summary>${list}</details>`;
  }

  /* ---------- 掛載與事件 ---------- */

  function onClick(e) {
    const row = e.target.closest?.('[data-gx-board-row]');
    if (row && row.closest('#guide-exam-board')) {
      boardUi.open = boardUi.open === row.dataset.gxBoardRow ? '' : row.dataset.gxBoardRow;
      renderBoard();
      return;
    }
    const btn = e.target.closest?.('[data-gx]');
    if (!btn || !btn.closest('#guide-exam-root')) return;
    const act = btn.dataset.gx;
    if (act === 'start') startExam();
    else if (act === 'submit') submitExam(false);
    else if (act === 'home') {
      lastResult = null;
      renderHome();
    }
  }

  function onChange(e) {
    const t = e.target;
    if (t.matches?.('[data-gx-board-leader]')) {
      boardUi.leader = t.value;
      renderBoard();
      return;
    }
    if (!exam || !t.dataset?.gxQ || !t.closest('#guide-exam-root')) return;
    exam.answers[t.dataset.gxQ] = t.value;
    saveState();
    root()
      ?.querySelectorAll(`input[name="gxq-${t.dataset.gxQ}"]`)
      .forEach((x) => x.closest('.gx-opt')?.classList.toggle('is-on', x.checked));
    updateCount();
  }

  /** 由點數表「執行要點」頁呼叫；self＝看的是自己才可以考試 */
  function mount(opts) {
    if (!root() || !data()) return;
    view = { self: !!opts?.self, name: opts?.name || '' };
    if (!view.self) {
      renderHome();
      loadOverview();
      return;
    }
    if (exam && exam.deadline > Date.now()) renderExam(false);
    else if (lastResult) renderResult();
    else {
      renderHome();
      if (!progress || progress.error) loadProgress();
    }
  }

  function whenLoggedIn(cb) {
    let tries = 0;
    const check = () => {
      if (token()) return cb();
      if (++tries < 120) setTimeout(check, 500);
    };
    check();
  }

  function init() {
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    const saved = loadState();
    if (saved?.attemptId) {
      exam = saved;
      if (saved.deadline <= Date.now()) whenLoggedIn(() => submitExam(true));
      else startTimer();
    }
  }

  window.GuideExam = {
    mount,
    mountBoard,
    loadOverview,
    progressOf,
    onChange: (fn) => listeners.add(fn),
    inExam: () => !!exam
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
