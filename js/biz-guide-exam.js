/**
 * 業務專區 › 執行要點考試
 * 題庫與行政同一份（GUIDE_EXAM／guide_exam_keys）；每人只抽一組 20 題，
 * 沒滿分就同一組補考到全對；前台公開姓名＋成績。
 */
(function () {
  'use strict';

  const STATE_KEY = 'bizGuideExamState-v1';
  const LETTERS = 'ABCD';
  const ROOT_ID = 'biz-guide-exam-root';
  const BOARD_ID = 'biz-guide-exam-board';

  let exam = null;
  let progress = null;
  let board = null;
  let lastResult = null;
  let timerId = null;
  let submitting = false;
  let mounted = false;

  const data = () => window.GUIDE_EXAM;
  const auth = () => window.skyfunAuth;
  const token = () => auth()?.getToken?.() || '';
  const root = () => document.getElementById(ROOT_ID);
  const boardEl = () => document.getElementById(BOARD_ID);

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
    } catch (_) {}
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
    } catch (_) {}
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

  function scoreTone(score) {
    if (score >= 100) return 'is-full';
    if (score >= 60) return 'is-good';
    if (score > 0) return 'is-low';
    return 'is-zero';
  }
  function hueOf(name) {
    let h = 0;
    for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) % 360;
    return h;
  }

  function myName() {
    try {
      return auth()?.getSession?.()?.name || auth()?.getUser?.()?.name || '';
    } catch (_) {
      return '';
    }
  }

  async function loadProgress() {
    try {
      progress = await rpc('biz_guide_exam_progress', { p_token: token() });
    } catch (e) {
      progress = { error: e.message };
    }
    if (mounted && !exam && !lastResult) renderHome();
  }

  async function loadBoard() {
    const el = boardEl();
    if (!el) return;
    el.innerHTML = '<p class="gx-muted">讀取成績板中…</p>';
    try {
      board = await rpc('biz_guide_exam_board', { p_token: token() });
    } catch (e) {
      board = { error: e.message };
    }
    renderBoard();
  }

  function renderBoard() {
    const el = boardEl();
    if (!el) return;
    if (!board) {
      el.innerHTML = '<p class="gx-muted">讀取成績板中…</p>';
      return;
    }
    if (board.error) {
      el.innerHTML = `<p class="gx-warn">成績板讀取失敗：${esc(board.error)}</p>`;
      return;
    }
    const HIDE_BOARD_NAMES = new Set(['簡為倢']);
    const items = (board.items || [])
      .filter((r) => !HIDE_BOARD_NAMES.has(String(r.name || '').trim()))
      .slice()
      .sort((a, b) => {
      const ap = a.passed ? 1 : 0;
      const bp = b.passed ? 1 : 0;
      if (bp !== ap) return bp - ap;
      return (Number(b.score) || -1) - (Number(a.score) || -1) || String(a.name).localeCompare(String(b.name), 'zh-Hant');
    });
    const me = myName();
    const passedN = items.filter((x) => x.passed).length;
    const body = items
      .map((r, i) => {
        const score = r.score == null ? null : Number(r.score);
        const state = r.passed
          ? ['is-done', '✅ 滿分通過']
          : r.inProgress
            ? ['is-doing', '作答中']
            : score != null
              ? ['is-retake', '待補考']
              : ['is-none', '尚未交卷'];
        return `<tr class="gx-board-row${me && r.name === me ? ' is-me' : ''}">
          <td class="num">${i + 1}</td>
          <td><span class="gx-who"><span class="gx-avatar" style="--h:${hueOf(r.name)}">${esc(String(r.name).slice(0, 1))}</span><b>${esc(r.name)}</b></span></td>
          <td class="gx-score-cell">${score == null ? '<span class="gx-dim">—</span>' : `<b class="gx-score ${scoreTone(score)}">${score}</b><i>分</i>`}</td>
          <td class="num">${r.correct != null ? `${r.correct}／${r.total}` : '—'}</td>
          <td class="num">${r.attempts || 0}</td>
          <td class="num">${r.maxRetake ? `補考 ${r.maxRetake}` : '—'}</td>
          <td>${fmtTime(r.lastAt)}</td>
          <td><span class="gx-board-state ${state[0]}">${state[1]}</span></td>
        </tr>`;
      })
      .join('');
    el.innerHTML = `<div class="gx-board">
      <div class="gx-board-head">
        <div class="gx-stat is-main"><span>已考人數</span><b>${items.length}<i>人</i></b></div>
        <div class="gx-stat is-done"><span>滿分通過</span><b>${passedN}<i>人</i></b></div>
        <div class="gx-stat is-retake"><span>待補考</span><b>${items.length - passedN}<i>人</i></b></div>
      </div>
      <div class="gx-board-wrap"><table class="gx-table gx-board-table">
        <thead><tr><th class="num">#</th><th>姓名</th><th class="gx-score-cell">最近成績</th><th class="num">答對</th><th class="num">考試次數</th><th class="num">補考</th><th>最近交卷</th><th>狀態</th></tr></thead>
        <tbody>${body || '<tr><td colspan="8" class="gx-muted">還沒有人考試，考完會顯示在這裡給大家看。</td></tr>'}</tbody>
      </table></div>
      <p class="gx-muted">全員登入後都看得到姓名與成績；不顯示作答內容與正解。業務每人固定同一組 20 題，補考到滿分為止。</p>
    </div>`;
  }

  function renderHome(message) {
    const el = root();
    if (!el) return;
    const d = data();
    const pr = progress && !progress.error ? progress : null;
    const done = !!(pr && pr.done);
    const pending = !!(pr && pr.pendingRetake);
    const resume = exam && exam.deadline > Date.now();
    const btnText = resume ? '接續作答' : pending ? `開始補考（第 ${pr.retakeNext} 次）` : '開始考試（20 題）';
    const status = !pr
      ? `<p class="gx-muted">${progress?.error ? '進度讀取失敗：' + esc(progress.error) : '讀取進度中…'}</p>`
      : done
        ? `<p class="gx-ok">🎉 已考滿分（${pr.lastCorrect}／${pr.lastTotal}）！不用再考。</p>`
        : pending
          ? `<p class="gx-warn">上次 ${pr.lastCorrect}／${pr.lastTotal}（${pr.lastScore} 分）還沒全對，要用<strong>同一組 20 題</strong>補考到滿分。</p>`
          : `<p class="gx-muted">第一次會從執行要點題庫抽 <b>${d?.perSet || 20} 題</b>；之後補考都是這同一組。</p>`;
    const items = pr?.items || [];
    const hist = items.length
      ? `<div class="gx-hist"><h6>我的考試紀錄</h6><table class="gx-table"><thead><tr><th>時間</th><th>答對</th><th>分數</th><th>結果</th><th>用時</th></tr></thead><tbody>${items
          .map((it) => {
            const sub = it.status === 'submitted';
            return `<tr><td>${fmtTime(it.startedAt)}</td><td>${sub ? `${it.correct}／${it.total}` : '—'}</td><td>${sub && it.score != null ? `<b>${it.score}</b> 分` : '—'}</td><td class="${it.passed ? 'is-pass' : sub ? 'is-fail' : ''}">${!sub ? '未交卷' : it.passed ? '✅ 滿分' : '❌ 需補考'}${it.retake ? `（補考 ${it.retake}）` : ''}</td><td>${sub ? fmtDuration(it.durationSec) : '—'}</td></tr>`;
          })
          .join('')}</tbody></table></div>`
      : '';
    el.innerHTML = `<div class="gx-card" style="grid-template-columns:1fr">
      <div class="gx-rules">
        <p><b>業務｜執行要點線上考試</b>（與行政同一份題庫）</p>
        <ul>
          <li>每人只抽 <b>一組 ${d?.perSet || 20} 題</b>單選，限時 <b>${d?.durationMin || 20} 分鐘</b>。</li>
          <li><b>全部答對才算通過</b>；沒過就用<strong>同一組題目</strong>補考到滿分。</li>
          <li>成績與姓名會顯示在下方成績板，同仁都看得到。</li>
        </ul>
        ${status}
        ${message ? `<p class="gx-warn">${esc(message)}</p>` : ''}
        ${done ? '' : `<button type="button" class="gx-start" data-bgx="start"${pr || resume ? '' : ' disabled'}>${btnText}</button>`}
      </div>
    </div>${hist}`;
  }

  async function startExam() {
    const btn = root()?.querySelector('[data-bgx="start"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '準備考卷中…';
    }
    try {
      const res = await rpc('biz_guide_exam_start', { p_token: token() });
      const skew = Date.now() - new Date(res.serverNow).getTime();
      const saved = loadState();
      if (saved && saved.attemptId === res.attemptId) {
        exam = saved;
      } else {
        const optOrder = {};
        res.qids.forEach((qid) => {
          optOrder[qid] = shuffle((question(qid)?.options || []).map((o) => o.id));
        });
        exam = {
          attemptId: res.attemptId,
          retake: res.retake,
          order: shuffle(res.qids),
          optOrder,
          answers: {}
        };
      }
      exam.skew = skew;
      exam.deadline = new Date(res.deadlineAt).getTime();
      saveState();
      lastResult = null;
      renderExam(res.resumed);
      loadBoard();
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
            return `<label class="gx-opt${on ? ' is-on' : ''}"><input type="radio" name="bgxq-${qid}" value="${esc(oid)}" data-bgx-q="${qid}"${on ? ' checked' : ''}><span class="gx-letter">${LETTERS[k]}</span><span>${esc(o?.text)}</span></label>`;
          })
          .join('');
        return `<div class="gx-q" id="bgxq-${qid}"><p class="gx-q-title"><span class="gx-no">${i + 1}.</span>${esc(q.text)}</p><div class="gx-opts">${opts}</div></div>`;
      })
      .join('');
    el.innerHTML = `<div class="gx-bar">
        <span class="gx-bar-title">業務執行要點${exam.retake ? `（補考 ${exam.retake}）` : '（正考）'}</span>
        <span class="gx-clock" id="bgx-clock">--:--</span>
        <span class="gx-count" id="bgx-count"></span>
        <button type="button" class="gx-submit" data-bgx="submit">交卷</button>
      </div>
      ${resumed ? '<p class="gx-warn">已接續上次未完成的考卷，計時不會重新開始。</p>' : ''}
      <div class="gx-qs">${qs}</div>
      <button type="button" class="gx-submit is-bottom" data-bgx="submit">交卷</button>`;
    updateCount();
    startTimer();
  }

  function updateCount() {
    const el = document.getElementById('bgx-count');
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
      const clock = document.getElementById('bgx-clock');
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
    root()?.querySelectorAll('[data-bgx="submit"]').forEach((b) => {
      b.disabled = true;
      b.textContent = '評分中…';
    });
    try {
      const res = await rpc('biz_guide_exam_submit', {
        p_token: token(),
        p_attempt_id: exam.attemptId,
        p_answers: exam.answers,
        p_auto: !!auto
      });
      stopTimer();
      lastResult = { res, snapshot: exam };
      exam = null;
      clearState();
      renderResult();
      loadProgress();
      loadBoard();
    } catch (e) {
      if (/已交卷|作廢|找不到/.test(e.message)) {
        stopTimer();
        exam = null;
        clearState();
        renderHome('這份考卷已無法交卷（' + e.message + '），請重新開始。');
        return;
      }
      root()?.querySelectorAll('[data-bgx="submit"]').forEach((b) => {
        b.disabled = false;
        b.textContent = '交卷';
      });
      if (!auto) window.alert('交卷失敗：' + e.message + '\n作答已保存在此裝置，請確認網路後再交卷。');
    } finally {
      submitting = false;
    }
  }

  function renderResult() {
    const el = root();
    if (!el || !lastResult) return;
    const { res, snapshot } = lastResult;
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
        <p class="gx-score-tag">${res.passed ? `✅ 滿分通過（${res.score} 分）！` : `❌ ${res.score} 分，還要補考同一組`}</p>
        <p class="gx-muted">用時 ${fmtDuration(res.durationSec)}${res.autoSubmitted ? ' · 時間到自動交卷' : ''} · 成績已寫入公開成績板</p>
        ${res.passed ? '' : `<p class="gx-warn">答錯 ${wrong.length} 題；補考仍是這 ${res.total} 題（順序會重排）。</p>`}
        <div class="gx-score-btns">
          ${res.passed ? '' : `<button type="button" class="gx-start" data-bgx="start">開始補考</button>`}
          <button type="button" class="gx-lite" data-bgx="home">回考試首頁</button>
        </div>
      </div>
    </div>
    <details class="gx-review"${res.passed ? '' : ' open'}><summary>逐題檢討</summary>${list}</details>`;
  }

  function onClick(e) {
    const btn = e.target.closest?.('[data-bgx]');
    if (!btn || !btn.closest('#' + ROOT_ID)) return;
    const act = btn.dataset.bgx;
    if (act === 'start') startExam();
    else if (act === 'submit') submitExam(false);
    else if (act === 'home') {
      lastResult = null;
      renderHome();
    }
  }

  function onChange(e) {
    const t = e.target;
    if (!exam || !t.dataset?.bgxQ || !t.closest('#' + ROOT_ID)) return;
    exam.answers[t.dataset.bgxQ] = t.value;
    saveState();
    root()
      ?.querySelectorAll(`input[name="bgxq-${t.dataset.bgxQ}"]`)
      .forEach((x) => x.closest('.gx-opt')?.classList.toggle('is-on', x.checked));
    updateCount();
  }

  function mount() {
    if (!root() || !data()) return;
    mounted = true;
    if (exam && exam.deadline > Date.now()) renderExam(false);
    else if (lastResult) renderResult();
    else {
      renderHome();
      loadProgress();
    }
    loadBoard();
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

  window.BizGuideExam = { mount, inExam: () => !!exam };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
