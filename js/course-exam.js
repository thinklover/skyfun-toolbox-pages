/**
 * 行政點數表 › 教育訓練 › 課程影片線上考試（物審、房客、預審）
 * 每個課程一份 20 題、限時 20 分鐘、伺服器評分；全部答對才通過，沒全對就用同一份題目重考（題目與選項順序重排）。
 * 由 admin-points.js 在課程頁放入 #course-exam-root[data-course] 後呼叫 CourseExam.mount()。
 */
(function () {
  'use strict';

  const STATE_PREFIX = 'courseExamState-v1-';
  const LETTERS = 'ABCD';

  const exams = {};
  const progress = {};
  const progressLoading = {};
  const results = {};
  let overview = null;
  let overviewLoading = false;
  let timerId = null;
  let submitting = false;
  let view = null;
  const listeners = new Set();

  const data = (course) => window.COURSE_EXAM?.[course];
  const auth = () => window.skyfunAuth;
  const token = () => auth()?.getToken?.() || '';
  const root = () => (view?.rootEl?.isConnected ? view.rootEl : document.getElementById('course-exam-root'));
  const ROOT_SEL = '#course-exam-root, [data-cx-root]';
  /** 週會小考（kind: 'meeting'）出自簡報，沒有教學影片 */
  const isMeeting = (d) => d?.kind === 'meeting';

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

  function question(course, qid) {
    return (data(course)?.questions || []).find((q) => q.id === qid);
  }

  function saveState(course) {
    try {
      localStorage.setItem(STATE_PREFIX + course, JSON.stringify(exams[course]));
    } catch (_) {
      /* 無法存就只留在記憶體 */
    }
  }
  function loadState(course) {
    try {
      return JSON.parse(localStorage.getItem(STATE_PREFIX + course) || 'null');
    } catch (_) {
      return null;
    }
  }
  function clearState(course) {
    try {
      localStorage.removeItem(STATE_PREFIX + course);
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
  const scoreOf = (correct, total) => (total ? Math.round((correct / total) * 100) : 0);

  function notify() {
    listeners.forEach((fn) => {
      try {
        fn();
      } catch (_) {
        /* ignore */
      }
    });
  }

  /* ---------- 分數圓環 ---------- */

  function ring(score, passed, caption, label = '最高分') {
    const color = passed ? '#16a34a' : score == null ? '#cbd5e1' : '#4f46e5';
    const deg = ((score || 0) / 100) * 360;
    return `<div class="gx-pie-wrap">
        <div class="gx-pie" style="background:conic-gradient(${color} 0 ${deg}deg, #e2e8f0 ${deg}deg 360deg)">
          <div class="gx-pie-hole"><b>${score == null ? '—' : score}</b><small>${score == null ? '還沒考' : '分'}</small></div>
        </div>
        <ul class="gx-pie-legend">
          <li class="gx-pie-score">考試分數 <b style="color:${color}">${score == null ? '—' : score}</b> 分<small>（${label}，滿分 100）</small></li>
          <li><i style="background:${passed ? '#16a34a' : '#e2e8f0'}"></i>${passed ? '已滿分通過' : '尚未通過（要 100 分）'}</li>
          ${caption ? `<li class="gx-pie-cap">${caption}</li>` : ''}
        </ul>
      </div>`;
  }

  /* ---------- 資料 ---------- */

  async function loadProgress(course) {
    if (!token() || progressLoading[course]) return;
    progressLoading[course] = true;
    try {
      progress[course] = await rpc('course_exam_progress', { p_token: token(), p_course: course });
    } catch (e) {
      progress[course] = { error: e.message };
    } finally {
      progressLoading[course] = false;
    }
    if (view?.self && view.course === course && !exams[course] && !results[course]) renderHome();
    notify();
  }

  async function loadOverview(force) {
    if (!token() || overviewLoading || (overview && !force)) return;
    overviewLoading = true;
    try {
      const res = await rpc('course_exam_overview', { p_token: token() });
      const map = new Map();
      (res.items || []).forEach((x) => map.set(`${x.course}|${x.name}`, x));
      const videos = new Map();
      (res.videos || []).forEach((x) => videos.set(`${x.course}|${x.name}`, x));
      overview = { totals: res.totals || {}, map, videos };
    } catch (e) {
      overview = { error: e.message, map: new Map(), videos: new Map(), totals: {} };
    } finally {
      overviewLoading = false;
    }
    if (view && !view.self && !exams[view.course]) renderHome();
    notify();
  }

  /** 給點數表用：某人某課程的考試狀態 */
  function statusOf(course, name) {
    const row = overview?.map?.get(`${course}|${name}`);
    const total = Number(overview?.totals?.[course]) || data(course)?.questions.length || 0;
    return {
      loaded: !!overview && !overview.error,
      passed: !!row?.passed,
      attempts: row ? Number(row.attempts) || 0 : 0,
      best: row?.best == null ? null : scoreOf(Number(row.best), Number(row.total) || total),
      total,
      video: videoInfo(course, name)
    };
  }

  /* ---------- 首頁 ---------- */

  function renderHome(message) {
    const el = root();
    if (!el || !view) return;
    const d = data(view.course);
    if (!d) {
      el.innerHTML = '<p class="gx-muted">這個課程的考試題目準備中。</p>';
      return;
    }
    if (!view.self) {
      const s = statusOf(view.course, view.name);
      el.innerHTML = `<div class="gx-card">
          ${ring(s.best, s.passed, s.loaded ? (s.attempts ? `共考 ${s.attempts} 次` : '還沒考過') : '讀取中…')}
          <p class="gx-muted">${esc(view.name)} 的教學影片：${s.loaded ? (s.video.done ? '✅ 已看完' : `觀看進度 ${s.video.pct}%`) : '讀取中…'}</p>
          <p class="gx-muted">只有本人登入後可以在這裡考試；這裡顯示 ${esc(view.name)} 的考試狀態。</p>
        </div>`;
      return;
    }
    const pr = progress[view.course] && !progress[view.course].error ? progress[view.course] : null;
    const total = Number(pr?.total) || d.questions.length;
    const done = !!pr?.passed;
    const ex = exams[view.course];
    const resume = ex && ex.deadline > Date.now();
    const items = pr?.items || [];
    const best = pr?.best == null ? null : scoreOf(Number(pr.best), total);
    const btnText = resume ? '接續作答' : items.length ? '開始重考' : '開始考試';
    const status = !pr
      ? `<p class="gx-muted">${progress[view.course]?.error ? '狀態讀取失敗：' + esc(progress[view.course].error) : '讀取狀態中…'}</p>`
      : done
        ? `<p class="gx-ok">🎉 ${esc(d.title)}考試已滿分通過！</p>`
        : items.length
          ? `<p class="gx-warn">上次沒有全對，重考一樣是這 ${total} 題（順序重排），全部答對才算通過。</p>`
          : '<p class="gx-muted">建議先看完「教材影片」再開始考試。</p>';
    const hist = items.length
      ? `<div class="gx-hist"><h6>我的考試紀錄</h6><table class="gx-table"><thead><tr><th>考試時間</th><th>次別</th><th>答對</th><th>分數</th><th>結果</th><th>用時</th></tr></thead><tbody>${items
          .map((it) => {
            const sub = it.status === 'submitted';
            const res = !sub ? '未交卷（作廢）' : it.passed ? '✅ 通過' : '❌ 需重考';
            return `<tr><td>${fmtTime(it.startedAt)}</td><td>第 ${Number(it.retake) + 1} 次</td><td>${sub ? `${it.correct}／${it.total}` : '—'}</td><td>${sub ? `<b>${scoreOf(it.correct, it.total)}</b> 分` : '—'}</td><td class="${it.passed ? 'is-pass' : sub ? 'is-fail' : ''}">${res}</td><td>${sub ? fmtDuration(it.durationSec) : '—'}${it.autoSubmitted ? '（時間到）' : ''}</td></tr>`;
          })
          .join('')}</tbody></table></div>`
      : '';
    el.innerHTML = `<div class="gx-card">
        ${ring(best, done, pr ? (items.length ? `共考 ${items.filter((x) => x.status === 'submitted').length} 次` : '還沒考過') : '')}
        <div class="gx-rules">
          <p><b>${esc(d.title)}線上考試</b>（題目出自${esc(d.video)}，共 ${total} 題）</p>
          <ul>
            <li>共 <b>${total} 題</b>單選題，限時 <b>${d.durationMin} 分鐘</b>，時間到自動交卷。</li>
            <li><b>全部答對（100 分）才算通過</b>；沒全對就用同一份題目重考，次數不限。</li>
            <li>${isMeeting(d) ? '答錯的題目會標示簡報第幾張，可以回去看那一張。' : '答錯的題目會標示影片時間點，可以回去看那一段。'}</li>
          </ul>
          ${status}
          ${message ? `<p class="gx-warn">${esc(message)}</p>` : ''}
          ${done ? '' : `<button type="button" class="gx-start" data-cx="start"${pr || resume ? '' : ' disabled'}>${btnText}</button>`}
        </div>
      </div>${hist}`;
  }

  /* ---------- 作答 ---------- */

  async function startExam() {
    const course = view?.course;
    if (!course) return;
    const btn = root()?.querySelector('[data-cx="start"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '準備考卷中…';
    }
    try {
      const res = await rpc('course_exam_start', { p_token: token(), p_course: course });
      const skew = Date.now() - new Date(res.serverNow).getTime();
      const saved = loadState(course);
      let ex;
      if (saved && saved.attemptId === res.attemptId) ex = saved;
      else {
        const optOrder = {};
        res.qids.forEach((qid) => {
          optOrder[qid] = shuffle((question(course, qid)?.options || []).map((o) => o.id));
        });
        ex = { course, attemptId: res.attemptId, retake: res.retake, order: shuffle(res.qids), optOrder, answers: {} };
      }
      ex.skew = skew;
      ex.deadline = new Date(res.deadlineAt).getTime();
      exams[course] = ex;
      saveState(course);
      results[course] = null;
      renderExam(res.resumed);
    } catch (e) {
      if (e.res?.done) loadProgress(course);
      renderHome(e.message);
    }
  }

  const answered = (ex) => (ex ? ex.order.filter((q) => ex.answers[q]).length : 0);

  function renderExam(resumed) {
    const el = root();
    const ex = exams[view?.course];
    if (!el || !ex) return;
    const qs = ex.order
      .map((qid, i) => {
        const q = question(ex.course, qid);
        if (!q) return '';
        const opts = (ex.optOrder[qid] || q.options.map((o) => o.id))
          .map((oid, k) => {
            const o = q.options.find((x) => x.id === oid);
            const on = ex.answers[qid] === oid;
            return `<label class="gx-opt${on ? ' is-on' : ''}"><input type="radio" name="cxq-${qid}" value="${esc(oid)}" data-cx-q="${qid}"${on ? ' checked' : ''}><span class="gx-letter">${LETTERS[k]}</span><span>${esc(o?.text)}</span></label>`;
          })
          .join('');
        return `<div class="gx-q"><p class="gx-q-title"><span class="gx-no">${i + 1}.</span>${esc(q.text)}</p><div class="gx-opts">${opts}</div></div>`;
      })
      .join('');
    el.innerHTML = `<div class="gx-bar">
        <span class="gx-bar-title">${esc(data(ex.course)?.title)}考試 · 第 ${Number(ex.retake) + 1} 次</span>
        <span class="gx-clock" id="cx-clock">--:--</span>
        <span class="gx-count" id="cx-count"></span>
        <button type="button" class="gx-submit" data-cx="submit">交卷</button>
      </div>
      ${resumed ? '<p class="gx-warn">已接續上次未完成的考卷，計時不會重新開始。</p>' : ''}
      <div class="gx-qs">${qs}</div>
      <button type="button" class="gx-submit is-bottom" data-cx="submit">交卷</button>`;
    updateCount();
    startTimer();
  }

  function updateCount() {
    const el = document.getElementById('cx-count');
    const ex = exams[view?.course];
    if (el && ex) el.textContent = `已答 ${answered(ex)}／${ex.order.length}`;
  }

  const remainingSec = (ex) => (ex.deadline - (Date.now() - (ex.skew || 0))) / 1000;

  function startTimer() {
    stopTimer();
    const tick = () => {
      const now = Date.now();
      Object.values(exams).forEach((ex) => {
        if (ex && !ex.autoTried && ex.deadline - (now - (ex.skew || 0)) <= 0) {
          ex.autoTried = true;
          submitExam(ex.course, true);
        }
      });
      const ex = exams[view?.course];
      const clock = document.getElementById('cx-clock');
      if (ex && clock) {
        const left = remainingSec(ex);
        clock.textContent = '剩 ' + fmtClock(left);
        clock.classList.toggle('is-warn', left <= 300 && left > 60);
        clock.classList.toggle('is-danger', left <= 60);
      }
      if (!Object.values(exams).some(Boolean)) stopTimer();
    };
    tick();
    timerId = setInterval(tick, 1000);
  }
  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }

  async function submitExam(course, auto) {
    const ex = exams[course];
    if (!ex || submitting) return;
    if (!auto) {
      const left = ex.order.length - answered(ex);
      if (!window.confirm(left > 0 ? `還有 ${left} 題未作答，確定要交卷嗎？` : '確定要交卷嗎？')) return;
    }
    submitting = true;
    const here = view?.course === course;
    if (here) {
      root()?.querySelectorAll('[data-cx="submit"]').forEach((b) => {
        b.disabled = true;
        b.textContent = '評分中…';
      });
    }
    try {
      const res = await rpc('course_exam_submit', { p_token: token(), p_attempt_id: ex.attemptId, p_answers: ex.answers, p_auto: !!auto });
      results[course] = { res, snapshot: ex };
      exams[course] = null;
      clearState(course);
      if (view?.course === course) renderResult();
      loadProgress(course);
      loadOverview(true);
    } catch (e) {
      if (/已交卷|作廢|找不到/.test(e.message)) {
        exams[course] = null;
        clearState(course);
        if (view?.course === course) renderHome('這份考卷已無法交卷（' + e.message + '），請重新開始。');
        return;
      }
      if (here) {
        root()?.querySelectorAll('[data-cx="submit"]').forEach((b) => {
          b.disabled = false;
          b.textContent = '交卷';
        });
      }
      if (!auto) window.alert('交卷失敗：' + e.message + '\n作答內容已保存在此裝置，請確認網路後再按一次「交卷」。');
    } finally {
      submitting = false;
    }
  }

  /* ---------- 成績 ---------- */

  function renderResult() {
    const el = root();
    const r = results[view?.course];
    if (!el || !r) return;
    const { res, snapshot } = r;
    const d = data(snapshot.course);
    const wrong = snapshot.order.filter((q) => !res.results?.[q]);
    const optText = (q, oid) => {
      const ids = snapshot.optOrder[q.id] || q.options.map((o) => o.id);
      const k = ids.indexOf(oid);
      const o = q.options.find((x) => x.id === oid);
      return o ? `${LETTERS[k] || '?'}. ${o.text}` : '（未作答）';
    };
    const list = snapshot.order
      .map((qid, i) => {
        const q = question(snapshot.course, qid);
        const ok = !!res.results?.[qid];
        return `<div class="gx-r ${ok ? 'is-right' : 'is-wrong'}">
            <p class="gx-q-title"><span class="gx-no">${i + 1}.</span>${esc(q?.text)}<span class="gx-r-mark">${ok ? '✔ 答對' : '✘ 答錯'}</span></p>
            ${ok ? '' : `<p class="gx-r-line"><span>你的答案</span>${esc(optText(q, snapshot.answers[qid]))}</p><p class="gx-r-line is-src"><span>回去看</span>${esc(d?.video)} ${esc(q?.at)}${isMeeting(d) ? '' : ' 附近'}</p>`}
          </div>`;
      })
      .join('');
    const score = scoreOf(res.correct, res.total);
    el.innerHTML = `<div class="gx-score ${res.passed ? 'is-pass' : 'is-fail'}">
        <div class="gx-score-main">
          <p class="gx-score-num">${score}<small> 分（答對 ${res.correct}／${res.total} 題）</small></p>
          <p class="gx-score-tag">${res.passed ? `✅ ${esc(d?.title)}考試通過！` : '❌ 還沒全對，需要重考'}</p>
          <p class="gx-muted">用時 ${fmtDuration(res.durationSec)}${res.autoSubmitted ? ' · 時間到自動交卷' : ''}${res.overtime ? ' · 逾時交卷' : ''} · 成績已記錄</p>
          ${res.passed ? '' : `<p class="gx-warn">答錯 ${wrong.length} 題，重考一樣是這 ${res.total} 題（順序重排），全對才通過。下面列出答錯的題目與${isMeeting(d) ? '簡報頁數' : '影片時間點'}。</p>`}
          <div class="gx-score-btns">
            ${res.passed ? '' : '<button type="button" class="gx-start" data-cx="start">開始重考</button>'}
            <button type="button" class="gx-lite" data-cx="home">回考試首頁</button>
          </div>
        </div>
        ${ring(score, res.passed, res.passed ? '已滿分通過' : '這次沒全對', '這次')}
      </div>
      <details class="gx-review"${res.passed ? '' : ' open'}><summary>逐題檢討</summary>${list}</details>`;
  }

  /* ---------- 教學影片（R2 私有影片＋觀看進度） ---------- */

  const VIDEO_BASE = String(window.SKYFUN_TRAINING_VIDEO_BASE || 'https://skyfun-training-video.dahwork123.workers.dev').replace(/\/$/, '');
  const SEG = 10;
  const DONE_PCT = 95;
  const videoRoot = () => document.getElementById('course-video-root');
  let vid = null;

  function videoInfo(course, name) {
    const v = overview?.videos?.get(`${course}|${name}`);
    return { loaded: !!overview && !overview.error, pct: v ? Number(v.pct) || 0 : 0, done: !!v?.completedAt };
  }

  /** 從 0 秒開始連續看過的位置（第一次觀看只能拖到這裡，不能跳過沒看過的段落） */
  function reachSec(v) {
    let i = 0;
    while (v.segs.has(i)) i++;
    return i * SEG;
  }

  function videoPct(v) {
    const total = Math.ceil((v.duration || 0) / SEG);
    return total ? Math.min(100, Math.floor((v.segs.size * 100) / total)) : 0;
  }

  function renderVideoStatus() {
    const el = document.getElementById('cx-vstatus');
    if (!el || !vid) return;
    const pct = videoPct(vid);
    const done = vid.done || pct >= DONE_PCT;
    el.innerHTML = `<span class="cx-vbar"><i style="width:${pct}%;background:${done ? '#16a34a' : '#4f46e5'}"></i></span>
      <b>${done ? '✅ 已看完' : `觀看進度 ${pct}%`}</b>
      <small>${done ? '可以重複觀看複習' : `看過 ${DONE_PCT}% 以上算看完；第一次觀看不能快轉到還沒看過的地方${vid.saveError ? `（進度回存失敗：${esc(vid.saveError)}）` : ''}`}</small>`;
  }

  async function saveVideo(force) {
    if (!vid || !vid.dirty || vid.saving) return;
    if (!force && Date.now() - vid.savedAt < 15000) return;
    vid.saving = true;
    vid.dirty = false;
    try {
      const res = await rpc('course_video_save', { p_token: token(), p_course: vid.course, p_segs: [...vid.segs], p_duration: Math.round(vid.duration) });
      vid.saveError = '';
      if (res.completedAt && !vid.done) {
        vid.done = true;
        loadOverview(true);
      }
    } catch (e) {
      vid.dirty = true;
      vid.saveError = e.message;
    } finally {
      vid.saving = false;
      vid.savedAt = Date.now();
      renderVideoStatus();
    }
  }

  function bindVideo(el) {
    let last = el.currentTime;
    el.addEventListener('loadedmetadata', () => {
      vid.duration = el.duration || vid.duration;
      const resume = Math.min(reachSec(vid), Math.max(0, (vid.duration || 0) - 5));
      if (!vid.done && resume > 0) el.currentTime = resume;
      renderVideoStatus();
    });
    el.addEventListener('timeupdate', () => {
      const t = el.currentTime;
      if (!el.seeking && !el.paused && t >= last && t - last < 3) {
        for (let s = Math.floor(last / SEG); s <= Math.floor(t / SEG); s++) {
          if (!vid.segs.has(s)) {
            vid.segs.add(s);
            vid.dirty = true;
          }
        }
        renderVideoStatus();
        saveVideo(false);
      }
      last = t;
    });
    el.addEventListener('seeking', () => {
      const limit = reachSec(vid) + 2;
      if (!vid.done && el.currentTime > limit) {
        el.currentTime = Math.max(0, limit - 2);
        const tip = document.getElementById('cx-vtip');
        if (tip) {
          tip.textContent = '第一次觀看不能快轉到還沒看過的地方，已跳回你看到的位置。';
          clearTimeout(tip._t);
          tip._t = setTimeout(() => (tip.textContent = ''), 4000);
        }
      }
      last = el.currentTime;
    });
    el.addEventListener('pause', () => saveVideo(true));
    el.addEventListener('ended', () => {
      const lastSeg = Math.ceil((vid.duration || 0) / SEG) - 1;
      if (lastSeg >= 0 && reachSec(vid) >= lastSeg * SEG) {
        vid.segs.add(lastSeg);
        vid.dirty = true;
      }
      saveVideo(true);
    });
  }

  // 字幕要用 fetch 轉成 blob：直接用跨網域 track 需要整支影片也走 CORS
  async function addSubtitles(video, course, ticket) {
    try {
      const r = await fetch(`${VIDEO_BASE}/v/${course}.vtt?t=${encodeURIComponent(ticket)}`);
      if (!r.ok) return;
      const url = URL.createObjectURL(new Blob([await r.text()], { type: 'text/vtt' }));
      const track = document.createElement('track');
      Object.assign(track, { kind: 'subtitles', label: '中文字幕', srclang: 'zh-Hant', src: url, default: true });
      video.append(track);
      track.addEventListener('load', () => { track.track.mode = 'showing'; });
      track.track.mode = 'showing';
    } catch { /* 沒字幕照常播放 */ }
  }

  function renderOtherVideo(el, course, name, tries = 0) {
    const v = videoInfo(course, name);
    const status = !v.loaded
      ? '觀看進度讀取中…'
      : v.done
        ? '✅ 已看完'
        : `觀看進度 ${v.pct}%`;
    el.innerHTML = `<div class="cx-vstatus"><span class="cx-vbar"><i style="width:${v.pct}%;background:${v.done ? '#16a34a' : '#4f46e5'}"></i></span>
        <b>${esc(name)}｜${status}</b>
        <small>影片只能用本人帳號觀看，進度記在各自帳號。</small></div>`;
    if (!v.loaded && tries < 20) {
      loadOverview();
      setTimeout(() => {
        if (videoRoot() === el && el.dataset.course === course) renderOtherVideo(el, course, name, tries + 1);
      }, 800);
    }
  }

  async function mountVideo(opts) {
    const el = videoRoot();
    if (!el) return;
    const course = el.dataset.course;
    if (opts && opts.self === false && opts.name) {
      if (vid) saveVideo(true);
      renderOtherVideo(el, course, opts.name);
      return;
    }
    if (vid && vid.course === course && vid.el && el.contains(vid.el)) return;
    if (vid && vid.course === course && vid.el) {
      el.innerHTML = '';
      el.append(vid.wrap);
      renderVideoStatus();
      return;
    }
    if (vid) saveVideo(true);
    if (!token()) {
      el.innerHTML = '<p class="gx-muted">登入後才能觀看教學影片。</p>';
      return;
    }
    el.innerHTML = '<p class="gx-muted">影片載入中…</p>';
    try {
      const res = await rpc('course_video_ticket', { p_token: token(), p_course: course });
      if (videoRoot()?.dataset.course !== course) return;
      vid = { course, segs: new Set(res.segs || []), duration: Number(res.duration) || 0, done: !!res.completedAt, dirty: false, saving: false, savedAt: 0, saveError: '' };
      const wrap = document.createElement('div');
      wrap.innerHTML = `<div class="apt-video-frame is-native"><video controls playsinline preload="metadata" controlslist="nodownload" disablepictureinpicture oncontextmenu="return false" src="${esc(`${VIDEO_BASE}/v/${course}.mp4?t=${encodeURIComponent(res.ticket)}`)}"></video></div>
        <div class="cx-vstatus" id="cx-vstatus"></div><p class="cx-vtip" id="cx-vtip"></p>`;
      vid.wrap = wrap;
      vid.el = wrap.querySelector('video');
      vid.el.addEventListener('error', () => {
        const s = document.getElementById('cx-vtip');
        if (s) s.textContent = '影片無法播放：可能還沒上傳，或觀看連結已過期，請重新整理頁面。';
      });
      bindVideo(vid.el);
      el.innerHTML = '';
      el.append(wrap);
      renderVideoStatus();
      addSubtitles(vid.el, course, res.ticket);
    } catch (e) {
      el.innerHTML = `<p class="gx-warn">影片載入失敗：${esc(e.message)}</p>`;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveVideo(true);
  });

  /* ---------- 掛載與事件 ---------- */

  function onClick(e) {
    const btn = e.target.closest?.('[data-cx]');
    if (!btn || !btn.closest(ROOT_SEL)) return;
    const act = btn.dataset.cx;
    if (act === 'start') startExam();
    else if (act === 'submit') submitExam(view?.course, false);
    else if (act === 'home') {
      results[view.course] = null;
      renderHome();
    }
  }

  function onChange(e) {
    const t = e.target;
    const ex = exams[view?.course];
    if (!ex || !t.dataset?.cxQ || !t.closest(ROOT_SEL)) return;
    ex.answers[t.dataset.cxQ] = t.value;
    saveState(ex.course);
    root()
      ?.querySelectorAll(`input[name="cxq-${t.dataset.cxQ}"]`)
      .forEach((x) => x.closest('.gx-opt')?.classList.toggle('is-on', x.checked));
    updateCount();
  }

  /** 由點數表課程頁呼叫；self＝看的是自己才可以考試；opts.root＝自備的掛載點（週會小考，不載影片） */
  function mount(opts) {
    if (!opts?.root) mountVideo(opts);
    if (!(opts?.root || document.getElementById('course-exam-root')) || !data(opts?.course)) return;
    view = { course: opts.course, self: !!opts.self, name: opts.name || '', rootEl: opts.root || null };
    if (!view.self) {
      renderHome();
      loadOverview();
      return;
    }
    const ex = exams[view.course];
    if (ex && ex.deadline > Date.now()) renderExam(false);
    else if (results[view.course]) renderResult();
    else {
      renderHome();
      if (!progress[view.course] || progress[view.course].error) loadProgress(view.course);
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
    let any = false;
    Object.keys(window.COURSE_EXAM || {}).forEach((course) => {
      const saved = loadState(course);
      if (!saved?.attemptId) return;
      exams[course] = saved;
      any = true;
      if (saved.deadline <= Date.now()) {
        saved.autoTried = true;
        whenLoggedIn(() => submitExam(course, true));
      }
    });
    if (any) startTimer();
  }

  window.CourseExam = {
    mount,
    loadOverview,
    statusOf,
    has: (course) => !!data(course),
    onChange: (fn) => listeners.add(fn),
    inExam: () => Object.values(exams).some(Boolean)
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
