/**
 * 行政成長羅盤：個人評等＋成長階段＋改善建議
 * 資料：星鴻審核時間紀錄、補助審核、解約（Worker）＋人力明細、抽查、客訴、訓練、執行要點考試（Supabase）
 */
(function () {
  'use strict';

  const Core = window.AdminPointsCore;
  const RPA_BASE = String(window.SKYFUN_RPA_BASE || 'https://skyfun-arrears-rpa.dahwork123.workers.dev').replace(/\/$/, '');
  const AUTH_KEY = 'skyfun-toolbox-auth-supabase-v1';
  const GOAL_KEY = 'skyfun-growth-goals-v1';
  const DAY_MS = 86400000;
  const $ = (id) => document.getElementById(id);

  const state = { months: [], monthKey: '', person: '', cache: new Map(), exam: null, whyOpen: false };
  /** root／msg：獨立頁是 #gc-root，嵌在行政點數表個人明細時是 mount() 傳入的容器 */
  const ui = { root: null, msg: null, embedded: false, open: null };
  let client = null;
  let loadSeq = 0;

  /* ---------- 基本工具 ---------- */

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
  function session() {
    try {
      return JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
    } catch {
      return null;
    }
  }
  const token = () => session()?.supabaseToken || '';
  const myName = () => String(session()?.user?.name || '').trim();
  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  const round = (v) => (v == null ? null : Math.round(v));
  const fmtDur = (s) => Core.formatDuration(s) || '—';
  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  function median(arr) {
    if (!arr.length) return null;
    const s = arr.slice().sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function percentileOf(v, others) {
    if (!others.length) return 50;
    let beat = 0;
    for (const o of others) beat += o < v ? 1 : o === v ? 0.5 : 0;
    return (beat / others.length) * 100;
  }
  function gradeOf(score) {
    if (score == null) return { grade: '-', label: '資料不足' };
    if (score >= 85) return { grade: 'A', label: '優秀' };
    if (score >= 70) return { grade: 'B', label: '良好' };
    if (score >= 50) return { grade: 'C', label: '普通' };
    return { grade: 'D', label: '待加強' };
  }
  function addDays(iso, n) {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + n);
    return Core.isoDate(d);
  }
  function daysBetween(a, b) {
    return Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / DAY_MS);
  }
  function monthsSince(iso) {
    if (!iso) return null;
    const h = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(h.getTime())) return null;
    const n = new Date();
    return Math.max(0, (n.getFullYear() - h.getFullYear()) * 12 + n.getMonth() - h.getMonth() - (n.getDate() < h.getDate() ? 1 : 0));
  }
  function tenureText(m) {
    if (m == null) return '年資未填';
    const y = Math.floor(m / 12);
    const r = m % 12;
    return y ? `年資 ${y} 年${r ? ` ${r} 個月` : ''}` : `年資 ${r} 個月`;
  }
  function workDaysLeft(end) {
    let n = 0;
    const last = new Date(`${end}T00:00:00`);
    const t = new Date();
    for (let d = new Date(t.getFullYear(), t.getMonth(), t.getDate()); d <= last; d = new Date(d.getTime() + DAY_MS)) {
      if (d.getDay() !== 0 && d.getDay() !== 6) n += 1;
    }
    return n;
  }
  function say(text, kind) {
    const el = ui.msg;
    if (!el) return;
    el.textContent = text || '';
    el.className = `gc-msg${kind ? ` is-${kind}` : ''}${text ? '' : ' hidden'}`;
  }

  /* ---------- 資料 ---------- */

  function sb() {
    if (client) return client;
    const c = window.SKYFUN_SUPABASE || {};
    client = window.supabase.createClient(String(c.url || '').trim(), String(c.anonKey || '').trim());
    return client;
  }
  async function rpc(name, args) {
    const { data, error } = await sb().rpc(name, Object.assign({ p_token: token() }, args || {}));
    if (error) throw new Error(error.message || '資料庫連線失敗');
    if (data && data.ok === false) throw new Error(data.error || '讀取失敗');
    return data;
  }
  async function fetchWorker(path, label, r) {
    let res;
    try {
      res = await fetch(`${RPA_BASE}${path}?start=${r.start}&end=${r.end}`, { headers: { 'X-Skyfun-Session': token() } });
    } catch {
      throw new Error('連不到星鴻資料服務，請稍後再試');
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) throw new Error(data?.error || `${label}讀取失敗（HTTP ${res.status}）`);
    return data;
  }

  function monthOptions() {
    const list = [];
    let { year, month } = Core.perfMonthOf(new Date());
    for (let i = 0; i < 6; i++) {
      if (list.length && Core.beforeFirstPerf(year, month)) break;
      list.push(Core.perfMonthRange(year, month));
      month -= 1;
      if (month < 1) {
        month = 12;
        year -= 1;
      }
    }
    return list;
  }
  const keyOf = (r) => `${r.year}-${r.month}`;
  function currentRange() {
    return state.months.find((m) => keyOf(m) === state.monthKey) || state.months[0];
  }
  function prevRange(r) {
    let { year, month } = r;
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    return Core.beforeFirstPerf(year, month) ? null : Core.perfMonthRange(year, month);
  }

  async function loadMonth(r) {
    const key = keyOf(r);
    if (state.cache.has(key)) return state.cache.get(key);
    const job = (async () => {
      const [audit, expenses, term, data] = await Promise.all([
        fetchWorker('/admin-points/audit-log', '審核時間紀錄', r),
        fetchWorker('/admin-points/expenses', '補助審核', r),
        fetchWorker('/admin-points/terminations', '解約', r).catch((e) => ({ fields: [], rows: [], error: e.message })),
        rpc('admin_points_view', { p_start: r.start, p_end: r.end })
      ]);
      const auditRows = Core.rowsFromPayload(audit);
      const staff = data.staff || [];
      const result = Core.compute(auditRows, {
        start: r.start,
        end: r.end,
        staff,
        manual: data.manual || [],
        opinions: data.opinions || [],
        expenses: Core.rowsFromPayload(expenses),
        terminations: Core.rowsFromPayload(term)
      });
      const dur = Core.durationReport(auditRows, { start: r.start, end: r.end, staff });
      const today = Core.isoDate(new Date());
      const calc = { range: r, data, staff, result, dur, weeks: Core.weeksOf(r).filter((w) => w.start <= today), profiles: new Map(), termError: term.error || '' };
      for (const s of peers(staff)) calc.profiles.set(s.name, profileOf(calc, s.name));
      return calc;
    })();
    state.cache.set(key, job);
    try {
      return await job;
    } catch (e) {
      state.cache.delete(key);
      throw e;
    }
  }
  function peers(staff) {
    return staff.filter((s) => s.status === '在職' && s.kind !== '工讀生');
  }
  function profileOf(calc, name) {
    if (calc.profiles.has(name)) return calc.profiles.get(name);
    return Core.personProfile(calc.result, calc.dur, {
      name,
      staff: calc.staff,
      checks: calc.data.checks || [],
      incidents: calc.data.incidents || [],
      weeks: calc.weeks
    });
  }
  /** 歷年業務廣度：Worker 逐月補抓，沒抓完就再叫一次（每次約補 10 個月） */
  async function loadHistory() {
    if (state.history?.loading || state.history?.done) return;
    state.history = { ...(state.history || {}), loading: true };
    for (let i = 0; i < 8; i++) {
      try {
        const res = await fetchWorker('/admin-points/skill-history', '歷年業務紀錄', {});
        const map = new Map();
        for (const [who, node, n] of res.rows || []) (map.get(who) || map.set(who, {}).get(who))[node] = n;
        state.history = { loading: !res.done, done: !!res.done, end: res.end, earliest: res.earliest, map, first: new Map(res.first || []) };
        if (state.cur) render();
        if (res.done || (!res.crawled && !res.busy)) break;
        if (res.busy) await new Promise((r) => setTimeout(r, 5000));
      } catch (e) {
        state.history = { ...(state.history || {}), loading: false, error: e.message };
        if (state.cur) render();
        break;
      }
    }
    if (state.history.loading) state.history.loading = false;
  }

  async function loadExam() {
    if (state.exam) return;
    state.exam = { loading: true, map: new Map() };
    try {
      const [res, course] = await Promise.all([rpc('guide_exam_overview'), rpc('course_exam_overview').catch(() => null)]);
      state.exam = {
        total: Number(res.total) || 0,
        map: new Map((res.items || []).map((x) => [x.name, x])),
        course: new Map((course?.items || []).map((x) => [`${x.course}|${x.name}`, x])),
        video: new Map((course?.videos || []).map((x) => [`${x.course}|${x.name}`, x]))
      };
    } catch (e) {
      state.exam = { error: e.message, map: new Map() };
    }
  }

  /* ---------- 分析模型 ---------- */

  const AXES = [
    { key: 'points', label: '產出', hint: '本月點數在行政同仁中的名次換算' },
    { key: 'speed', label: '速度', hint: '通識節點審核耗時各自在同仁中的名次換算，實價登錄不計' },
    { key: 'quality', label: '品質', hint: '組長抽查良率：80% 以下 0 分、100% 滿分' },
    { key: 'conduct', label: '紀律', hint: '沒有客訴與懲處就是滿分' },
    { key: 'learn', label: '學習', hint: '秘書通識課程總分：執行要點 30%（依考試進度）＋其餘 7 項各 10%（看完影片、考試滿分、實作完成各占 1／3；不計入評等）' }
  ];
  /** 歷年經手幾件以上算「已上手」 */
  const PRACTICE_MIN = 5;
  const AREA_AXIS = { 點數產出: 'points', 審核速度: 'speed', 審件品質: 'quality', 客訴紀律: 'conduct' };
  const STAGES = [
    { icon: '🌱', name: '起步期', desc: '熟悉流程，先求正確' },
    { icon: '🌿', name: '上手期', desc: '能獨立完成主要案件' },
    { icon: '🌳', name: '穩定期', desc: '產出、品質穩定，能獨當一面' },
    { icon: '⛰️', name: '專精期', desc: '多項業務都熟，又快又準' },
    { icon: '🧭', name: '傳承期', desc: '能帶人、能改善流程的標竿' }
  ];

  function learnOf(calc, name) {
    const nodes = Core.TRAINING_NODES;
    const ex = state.exam && !state.exam.loading && !state.exam.error ? state.exam : null;
    const row = ex?.map.get(name);
    const passed = row ? Number(row.passed) || 0 : 0;
    const total = ex?.total || 0;
    const examRate = total ? Math.min(1, passed / total) : null;
    const stateOf = (key) => Core.trainingState(key, {
      videoDone: !!ex?.video?.get(`${key}|${name}`)?.completedAt,
      examPassed: !!ex?.course?.get(`${key}|${name}`)?.passed,
      guideRate: examRate
    });
    const done = new Set(nodes.filter((n) => stateOf(n.key).done).map((n) => n.key));
    return {
      nodes: nodes.map((n) => ({ ...n, done: done.has(n.key), todo: stateOf(n.key).steps.some((x) => !x.ok && !x.pending) })),
      trained: done.size,
      examLoaded: !!ex,
      passed,
      total,
      attempts: row ? Number(row.attempts) || 0 : 0,
      pendingRetake: !!row?.pendingRetake,
      examDone: !!total && passed >= total,
      score: ex ? Math.round(Core.courseScores(stateOf).generalScore) : null
    };
  }
  function axisValues(calc, pf) {
    return { points: pf.scores.points, speed: pf.scores.speed, quality: pf.scores.quality, conduct: pf.scores.conduct, learn: learnOf(calc, pf.name).score };
  }
  function scoreWith(pf, key, value) {
    return Core.overallScore({ ...pf.scores, [key]: value });
  }
  function mentorSkills(pf) {
    return pf.skills.filter((s) => s.count >= 5 && s.rank && s.rank <= 2 && s.doers >= 3 && (s.diff == null || s.diff <= 0));
  }
  function mentorsOf(calc, key, except) {
    return [...calc.profiles.values()].filter((p) => p.name !== except && mentorSkills(p).some((s) => s.key === key)).map((p) => p.name);
  }

  function samePeriod(calc, prev, name) {
    const today = Core.isoDate(new Date());
    const cur = calc.result.people.find((p) => p.name === name);
    const curPoints = cur?.month.total || 0;
    if (!prev) return { curPoints, prevPoints: null };
    const elapsed = daysBetween(calc.range.start, today < calc.range.end ? today : calc.range.end);
    const cut = addDays(prev.range.start, elapsed);
    const p = prev.result.people.find((x) => x.name === name);
    let prevPoints = 0;
    for (const [d, t] of p?.days || []) if (d <= cut) prevPoints += t.total;
    return { curPoints, prevPoints, cut, elapsed: elapsed + 1, finished: today > calc.range.end };
  }

  function buildModel(calc, prev, name) {
    const pf = profileOf(calc, name);
    const prevPf = prev ? profileOf(prev, name) : null;
    const info = calc.staff.find((s) => s.name === name) || {};
    const learn = learnOf(calc, name);
    const axes = axisValues(calc, pf);
    const list = [...calc.profiles.values()];
    const team = {};
    for (const a of AXES) team[a.key] = median(list.map((p) => axisValues(calc, p)[a.key]).filter((v) => v != null));
    const scores = list.filter((p) => p.score != null).map((p) => ({ name: p.name, score: p.score }));
    const others = scores.filter((s) => s.name !== name).map((s) => s.score);
    const position = pf.score == null ? null : percentileOf(pf.score, others);
    const hist = state.history?.map?.get(name) || {};
    const end = state.history?.end || '';
    const recent = {};
    for (const c of [calc, prev]) {
      for (const r of c?.result.people.find((p) => p.name === name)?.records || []) {
        if (r.item === 'term' || !end || r.date > end) recent[r.item] = (recent[r.item] || 0) + 1;
      }
    }
    const skills = pf.skills.map((s) => {
      const total = (hist[s.key] || 0) + (recent[s.key] || 0);
      return { ...s, total, practiced: total >= PRACTICE_MIN };
    });
    const mentor = [...new Map([...mentorSkills(pf), ...(prevPf ? mentorSkills(prevPf) : [])].map((s) => [s.key, s])).values()];
    const m = { calc, prev, name, pf, prevPf, info, learn, axes, team, scores, position, skills, mentor, tenure: monthsSince(info.hireDate), since: state.history?.first?.get(name) || '' };
    m.band = bandOf(position);
    m.stage = stageOf(m);
    m.strengths = strengthsOf(m);
    m.focus = focusOf(m);
    m.trend = samePeriod(calc, prev, name);
    return m;
  }

  function bandOf(p) {
    if (p == null) return { key: 'none', name: '資料不足', text: '本月資料還不夠，先不比較' };
    if (p >= 75) return { key: 'lead', name: '領航群', text: '團隊前 25%' };
    if (p >= 25) return { key: 'core', name: '中堅群', text: '團隊中間 50%' };
    return { key: 'grow', name: '成長群', text: '團隊後 25%，進步空間最大' };
  }

  const SENIOR_MONTHS = 24;

  /** 階段看「能力」（年資、業務廣度、品質、帶人），不看當月點數；當月表現由評等呈現；到職滿 2 年直接列傳承期 */
  function stageOf(m) {
    const { pf, prevPf, skills, learn, tenure, mentor } = m;
    const practiced = skills.filter((s) => s.practiced).length;
    const rate = pf.quality.rate ?? prevPf?.quality.rate ?? null;
    const speed = Math.max(pf.scores.speed ?? 0, prevPf?.scores.speed ?? 0);
    const penalty = [pf, prevPf].some((p) => p && p.quality.penalty !== '無');
    const months = (n) => tenure == null || tenure >= n;
    const steps = [
      [],
      [
        { label: '到職滿 1 個月', ok: months(1) },
        { label: `至少 2 項業務有實際經手（歷年經手 ${PRACTICE_MIN} 件以上算一項，目前 ${practiced} 項）`, ok: practiced >= 2 }
      ],
      [
        { label: '到職滿 3 個月', ok: months(3) },
        { label: `至少 4 項業務有實際經手（目前 ${practiced} 項）`, ok: practiced >= 4 },
        { label: rate == null ? '抽查良率 90% 以上（還沒有抽查紀錄，先不扣）' : `抽查良率 90% 以上（目前 ${pct(rate)}）`, ok: rate == null || rate >= 0.9 }
      ],
      [
        { label: '到職滿 6 個月', ok: months(6) },
        { label: `至少 6 項業務有實際經手（目前 ${practiced} 項）`, ok: practiced >= 6 },
        { label: `又快又準：速度分數 50 以上（目前 ${Math.round(speed)}），或抽查良率 95% 以上`, ok: speed >= 50 || (rate != null && rate >= 0.95) },
        { label: '近兩個月沒有懲處', ok: !penalty }
      ],
      [
        { label: `到職滿 1 年（${tenureText(tenure)}；滿 2 年不看其他條件，直接列傳承期）`, ok: tenure != null && tenure >= 12 },
        { label: `至少 2 項可以帶人的專長（目前 ${mentor.length} 項）`, ok: mentor.length >= 2 },
        { label: learn.examLoaded ? `執行要點考試全部通過（${learn.passed}／${learn.total} 題）` : '執行要點考試全部通過（讀取中）', ok: learn.examDone }
      ]
    ];
    const cases = skills.reduce((s, x) => s + x.total, 0);
    if (tenure != null && tenure >= SENIOR_MONTHS) return { level: STAGES.length - 1, steps, practiced, cases, need: [], senior: true };
    if (cases < 10 && months(3)) return { level: null, steps, practiced, cases, need: [] };
    let level = 0;
    for (let i = 1; i < steps.length; i++) {
      if (steps[i].every((c) => c.ok)) level = i;
      else break;
    }
    return { level, steps, practiced, cases, need: steps[level + 1] || [] };
  }

  function strengthsOf(m) {
    const out = [];
    if (m.mentor.length) out.push(`${m.mentor.map((s) => s.label).join('、')}又多又快，是可以帶新人的專長`);
    const ranked = AXES.filter((a) => m.axes[a.key] != null).sort((a, b) => m.axes[b.key] - m.axes[a.key]);
    for (const a of ranked.filter((x) => x.key !== 'conduct' && m.axes[x.key] >= 70).slice(0, 2)) {
      const t = m.team[a.key];
      out.push(`${a.label} ${round(m.axes[a.key])} 分${t != null && m.axes[a.key] > t ? `，高於團隊中位數 ${round(t)}` : ''}`);
    }
    if (m.tenure != null && m.tenure >= 12) out.push(`${tenureText(m.tenure)}的經驗，是團隊最需要的判斷力`);
    if (m.stage.practiced >= 6) out.push(`經手過 ${m.stage.practiced} 種業務，是少數的全方位行政`);
    for (const s of m.pf.strong) out.push(s.text);
    if (m.pf.points.days && m.pf.points.avgDays && m.pf.points.days >= m.pf.points.avgDays) out.push(`本月已有 ${m.pf.points.days} 天有產出，出勤產出很穩定`);
    if (!m.pf.quality.complaints && m.pf.quality.penalty === '無') out.push('本月零客訴、零懲處，服務讓人放心');
    if (!out.length && ranked.length) out.push(`目前最穩的是「${ranked[0].label}」（${round(m.axes[ranked[0].key])} 分），先守住它`);
    return out.slice(0, 4);
  }

  function focusOf(m) {
    const { pf, calc, learn } = m;
    const pt = pf.points;
    const days = workDaysLeft(calc.range.end);
    const items = [];
    const make = (key, title) => {
      const value = key === 'learn' ? learn.score : pf.scores[key];
      const target = 60;
      let impact = '';
      if (key !== 'learn' && pf.score != null && value != null && value < target) {
        const after = scoreWith(pf, key, target);
        const g1 = gradeOf(after);
        impact = g1.grade !== pf.grade ? `${title}追到 ${target} 分，評等可從 ${pf.grade} 升到 ${g1.grade}` : `${title}追到 ${target} 分，整體分數約 +${Math.max(1, Math.round(after - pf.score))}`;
      }
      return { key, title, value, why: pf.weak.filter((w) => AREA_AXIS[w.area] === key).slice(0, 3).map((w) => ({ level: w.level, text: w.text })), goal: '', plans: [], impact, gain: key !== 'learn' && value != null ? scoreWith(pf, key, Math.max(value, target)) - (pf.score ?? 0) : 0 };
    };

    const used = new Set();
    const consider = (key) => {
      if (used.has(key)) return;
      used.add(key);
      const f = make(key, AXES.find((a) => a.key === key).label);
      if (key === 'points') {
        if (pt.avg && pt.total < pt.avg) {
          const gap = Math.ceil(pt.avg - pt.total);
          f.goal = days ? `業績月結束前追到行政平均 ${Math.ceil(pt.avg)} 點：還差 ${gap} 點、剩 ${days} 個工作天，每天多做約 ${Math.ceil(gap / days)} 點` : `下個業績月追到行政平均 ${Math.ceil(pt.avg)} 點`;
        } else if (pt.toNext) f.goal = `本業績月達到${pt.nextLabel}（還差 ${pt.toNext} 點）`;
        else f.goal = '維持目前的產出節奏';
        f.plans.push('如果早上開工，就先清 5 件待審案件，再回訊息與電話');
        if (pt.avgPerDay) f.plans.push(`如果到中午還不到 ${Math.ceil(pt.avgPerDay / 2)} 點，就主動跟組長說可以多分案`);
        const low = pf.items.filter((it) => !['qa', 'manual'].includes(it.key) && it.mine >= 3 && it.doers >= 2 && it.doersAvg && it.mine < it.doersAvg * 0.85);
        for (const it of low.slice(0, 2)) {
          const who = mentorsOf(calc, it.key, m.name).slice(0, 2);
          f.plans.push(`${it.label}只有 ${it.mine} 件（有做的人平均 ${it.doersAvg.toFixed(0)} 件）：跟組長確認分案量${who.length ? `，或請教 ${who.join('、')}` : ''}`);
        }
      } else if (key === 'speed') {
        const slow = pf.nodes.filter((n) => n.count >= 3 && n.diff != null && n.diff > 0).sort((a, b) => b.diff - a.diff)[0];
        f.goal = slow ? `${slow.label}平均耗時從 ${fmtDur(slow.avg)} 降到 ${fmtDur(slow.base)} 以內` : '各節點耗時維持在全體平均以內';
        f.plans.push('如果打開案件發現缺資料，就立刻退件或標註，不讓案件開著');
        f.plans.push('如果同一個問題卡超過 10 分鐘，就先問組長，不要自己耗著');
        if (slow) {
          const who = mentorsOf(calc, slow.key, m.name).slice(0, 2);
          f.plans.push(`${slow.label}${who.length ? `觀摩 ${who.join('、')} 的檢查順序` : '整理自己的檢查順序'}，寫成 3 步驟照著做`);
        }
      } else if (key === 'quality') {
        f.goal = '下次抽查良率 95% 以上';
        f.plans.push('如果要按送出，就先照自己的 3 點檢核清單看一次');
        f.plans.push('如果抽查有錯，就當天跟組長花 5 分鐘確認錯在哪，記進檢核清單');
      } else if (key === 'conduct') {
        f.goal = '下個業績月零客訴';
        f.plans.push('如果要回覆民眾有爭議的問題，就先請組長看過再回');
        f.plans.push('每件客訴跟組長檢討 10 分鐘：發生什麼、下次怎麼說');
      } else if (key === 'learn') {
        const left = learn.examLoaded ? learn.nodes.filter((n) => n.todo && n.key !== 'guide').map((n) => n.label) : [];
        f.goal = learn.examLoaded && !learn.examDone ? `執行要點考試通過 ${learn.total} 題（目前 ${learn.passed} 題）` : left.length ? `完成教育訓練：${left.slice(0, 3).join('、')}` : '保持學習進度';
        if (learn.examLoaded && !learn.examDone) f.plans.push('如果這週有 30 分鐘空檔，就考一份執行要點考試');
        if (left.length) f.plans.push(`到點數表教育訓練看完影片、考完試：${left.slice(0, 4).join('、')}${left.length > 4 ? ` 等 ${left.length} 項` : ''}`);
      }
      items.push(f);
    };

    for (const w of pf.weak) if (AREA_AXIS[w.area]) consider(AREA_AXIS[w.area]);
    for (const a of AXES) {
      const v = a.key === 'learn' ? learn.score : pf.scores[a.key];
      if (v != null && v < 60) consider(a.key);
    }
    const lv = (f) => (f.why.some((w) => w.level === 'bad') ? 0 : 1);
    items.sort((a, b) => lv(a) - lv(b) || b.gain - a.gain);
    return items;
  }

  /* ---------- 圖形 ---------- */

  function bar(mine, base, max, better) {
    const w = (v) => (max ? Math.max(2, Math.min(100, (v / max) * 100)) : 0);
    const tone = base == null || mine == null ? '' : better === 'low' ? (mine <= base ? 'is-good' : 'is-bad') : mine >= base ? 'is-good' : 'is-bad';
    return `<span class="gc-bar"><i class="${tone}" style="width:${mine == null ? 0 : w(mine)}%"></i>${base != null ? `<em style="left:${w(base)}%"></em>` : ''}</span>`;
  }

  function weekChart(pf) {
    const weeks = pf.weeks || [];
    if (!weeks.length) return '<p class="gc-muted">本業績月還沒開始。</p>';
    const max = Math.max(1, ...weeks.map((w) => Math.max(w.mine, w.avg || 0)));
    return `<div class="gc-weeks">${weeks
      .map((w, i) => `<div class="gc-week"><div class="gc-week-bars"><i class="is-me" style="height:${(w.mine / max) * 100}%" title="你 ${w.mine} 點"></i><i class="is-team" style="height:${((w.avg || 0) / max) * 100}%" title="平均 ${(w.avg || 0).toFixed(1)} 點"></i></div><b>${w.mine}</b><small>第 ${i + 1} 週</small></div>`)
      .join('')}</div><p class="gc-legend"><span class="is-me"></span>你的週點數　<span class="is-team"></span>行政平均</p>`;
  }

  /* ---------- 畫面：總覽 ---------- */

  const UNKNOWN_STAGE = { icon: '❔', name: '暫不判定', desc: '星鴻上經手的案件太少' };

  function hero(m) {
    const { pf, info, stage } = m;
    const st = stage.level == null ? UNKNOWN_STAGE : STAGES[stage.level];
    const prevGrade = m.prevPf?.grade && m.prevPf.grade !== '-' ? m.prevPf.grade : '';
    const delta = m.prevPf?.score != null && pf.score != null ? Math.round(pf.score - m.prevPf.score) : null;
    const meta = [info.region, info.office, info.leader ? `組長 ${info.leader}` : '', tenureText(m.tenure)].filter(Boolean).join(' · ');
    return `<section class="gc-card gc-hero">
        <div class="gc-hero-who">
          <span class="gc-avatar">${esc(m.name.slice(-2))}</span>
          <div><h2>${esc(m.name)}</h2><p class="gc-muted">${esc(meta)}</p></div>
        </div>
        <div class="gc-hero-stage">
          <span class="gc-stage-icon">${st.icon}</span>
          <div><small>成長階段</small><b>${st.name}</b><p>${st.desc}</p></div>
        </div>
        <div class="gc-hero-grade gc-grade-${pf.grade === '-' ? 'na' : pf.grade}">
          <span class="gc-grade">${pf.grade}</span>
          <div><small>本月評等</small><b>${pf.label}${pf.score != null ? ` · ${Math.round(pf.score)} 分` : ''}</b>
          <p>${prevGrade ? `上月 ${prevGrade}${delta != null ? `（${delta >= 0 ? '+' : ''}${delta} 分）` : ''}` : m.prev === undefined ? '上月讀取中…' : '上月無資料'}</p></div>
        </div>
        <div class="gc-hero-band gc-band-${m.band.key}">
          <small>在團隊的位置</small><b>${m.band.name}</b><p>${m.band.text}</p>
        </div>
      </section>`;
  }

  function strengthCard(m) {
    return `<section class="gc-card gc-strength">
        <h3>💪 你的長處</h3>
        <ul class="gc-list">${m.strengths.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
        <p class="gc-muted">先看做得好的地方：長處是改善的起點，也是你可以分享給團隊的經驗。</p>
      </section>`;
  }

  /** 本月重點＋改善步驟合在一張卡：只給最優先的一件，做法直接勾選 */
  function focusCard(m) {
    const f = m.focus[0];
    if (!f) {
      const need = m.stage.need.filter((c) => !c.ok);
      return `<section class="gc-card gc-focus is-ok">
          <h3>🎯 本月重點</h3>
          <p class="gc-focus-title">各項都在水準以上 👍</p>
          ${need.length && m.stage.level != null ? `<p>想往「${STAGES[m.stage.level + 1].name}」前進，還差：</p><ul class="gc-list">${need.map((c) => `<li>${esc(c.label)}</li>`).join('')}</ul>` : '<p>你已經在最高階段，歡迎擔任導師、分享你的做法。</p>'}
        </section>`;
    }
    const chosen = new Set(goalStore()[goalKey(m)] || []);
    const others = m.focus.slice(1);
    return `<section class="gc-card gc-focus">
        <h3>🎯 本月只要先顧好一件事</h3>
        <p class="gc-focus-title">${esc(f.title)}${f.value != null ? `<small>目前 ${round(f.value)} 分</small>` : ''}</p>
        ${f.why.length ? `<ul class="gc-whys">${f.why.map((w) => `<li>${w.level === 'bad' ? '🔴' : '🟠'} ${esc(w.text)}</li>`).join('')}</ul>` : ''}
        <p class="gc-goal">🏁 ${esc(f.goal)}</p>
        <p class="gc-pick-hint">勾 1～2 個你願意試兩週的做法（自己選的最容易做到）：</p>
        <ul class="gc-pick">${f.plans
          .map((p, j) => {
            const id = `${f.key}-${j}`;
            return `<li><label><input type="checkbox" data-goal="${esc(id)}"${chosen.has(id) ? ' checked' : ''}> ${esc(p)}</label></li>`;
          })
          .join('')}</ul>
        ${f.impact ? `<p class="gc-impact">📈 ${esc(f.impact)}</p>` : ''}
        ${others.length ? `<details class="gc-more"><summary>其他還可以加強的（${others.length} 項，先顧好上面這件就好）</summary><ul class="gc-list">${others.map((o) => `<li><b>${esc(o.title)}</b>：${esc(o.goal)}</li>`).join('')}</ul></details>` : ''}
      </section>`;
  }

  /** 五個面向一行一個：分數條（線＝團隊中位數）＋一句重點；嵌在個人明細時可直接跳到對應分頁 */
  function axesCard(m) {
    const { pf, learn: l } = m;
    const pt = pf.points;
    const sp = pf.speed;
    const q = pf.quality;
    const facts = {
      points: { text: `本月 ${pt.total} 點（行政平均 ${pt.avg != null ? pt.avg.toFixed(1) : '—'}）${pt.toNext ? `，距${pt.nextLabel}還差 ${pt.toNext} 點` : ''}`, view: 'points' },
      speed: { text: !sp.count ? '本月沒有審核紀錄' : pf.scores.speed == null ? '本月沒有通識節點審核' : `通識節點速度分 ${round(pf.scores.speed)} 分，依各節點名次換算（${sp.count} 筆，平均 ${fmtDur(sp.avg)}）`, view: 'review' },
      quality: { text: q.rate != null ? `抽查良率 ${pct(q.rate)}（${q.checked} 件）` : '本月還沒抽查', view: 'review' },
      conduct: { text: `客訴 ${q.complaints} 件、懲處 ${q.penalty}`, view: 'conduct' },
      learn: { text: l.examLoaded ? `執行要點考試 ${l.passed}／${l.total} 題、訓練通過 ${l.trained}／${l.nodes.length} 項` : '考試進度讀取中…', view: 'training' }
    };
    const rows = AXES.map((a) => {
      const v = m.axes[a.key];
      const f = facts[a.key];
      const tone = v == null ? 'is-na' : v >= 70 ? 'is-good' : v >= 50 ? 'is-mid' : 'is-low';
      return `<li class="gc-axis">
          <b>${a.label}</b>
          <span class="gc-axis-score ${tone}">${v == null ? '—' : round(v)}</span>
          ${bar(v, m.team[a.key], 100)}
          <small>${esc(f.text)}</small>
          ${ui.embedded ? `<button type="button" class="gc-link" data-pview="${f.view}">明細 →</button>` : ''}
        </li>`;
    }).join('');
    return `<section class="gc-card">
        <h3>🧭 五個面向</h3>
        <ul class="gc-axes">${rows}</ul>
        <p class="gc-muted">分數 0–100，條上的線是團隊中位數。評等＝點數 80%＋審件 10%（速度 8%＋品質 2%）＋客訴紀律 10%；學習不計入評等，但影響成長階段。</p>
      </section>`;
  }

  function historyNote(m) {
    const h = state.history;
    const since = m.since ? `，${m.name} 最早的審核紀錄在 ${m.since.replace('-', ' 年 ')} 月` : '';
    if (!h || (h.loading && !h.map)) return '　歷年紀錄讀取中…';
    if (h.error && !h.map) return `　歷年紀錄暫時讀不到（${h.error}），先用最近兩個業績月計算。`;
    const range = h.earliest ? `${h.earliest.replace('-', '/')} 起` : '';
    return `　歷年紀錄${range}${h.done ? '' : '（還在往前補抓）'}${since}；解約只算最近兩個業績月。`;
  }

  function skillStrip(m) {
    return `<div class="gc-skills gc-skills--mini">${m.skills
      .map((s) => {
        const mentor = m.mentor.some((x) => x.key === s.key);
        return `<div class="gc-skill${s.practiced ? ' is-on' : ''}${mentor ? ' is-mentor' : ''}" title="${esc(s.label)} 歷年 ${s.total} 件"><b>${esc(s.label)}</b><span>${s.total.toLocaleString('en-US')} 件</span><em>${mentor ? '可帶人' : s.practiced ? '已上手' : '可以學'}</em></div>`;
      })
      .join('')}</div>`;
  }

  function stageMap(m) {
    const lv = m.stage.level;
    const next = lv == null ? null : STAGES[lv + 1];
    const tail = lv == null
      ? `<p class="gc-next">${state.history?.done ? '歷年' : '目前讀到的'}星鴻審核紀錄裡，經手的案件只有 ${m.stage.cases} 件，資料太少，先不判定階段。如果你主要負責其他業務（例如帶人、專案、臨櫃），請組長補登手填點數或跟主管說明。</p>`
      : next
        ? `<div class="gc-next"><b>升到「${next.name}」還需要：</b><ul class="gc-checks">${m.stage.need.map((c) => `<li class="${c.ok ? 'is-ok' : ''}">${c.ok ? '✅' : '⬜'} ${esc(c.label)}</li>`).join('')}</ul></div>`
        : `<p class="gc-next">🎉 ${m.stage.senior ? `${tenureText(m.tenure)}，到職滿 2 年的資深同仁直接列為傳承期。` : '你已經是傳承期，'}團隊需要你的經驗：可以擔任新人導師、一起訂檢核清單。</p>`;
    return `<section class="gc-card">
        <h3>🗺️ 成長階段地圖</h3>
        <ol class="gc-ladder">${STAGES.map((s, i) => `<li class="${lv != null && i < lv ? 'is-done' : i === lv ? 'is-now' : ''}"><span>${s.icon}</span><b>${s.name}</b><small>${s.desc}</small>${i === lv ? '<em>你在這裡</em>' : ''}</li>`).join('')}</ol>
        ${tail}
        <h4>會的業務（歷年累計）</h4>
        ${skillStrip(m)}
        <p class="gc-muted">階段看的是「能力廣度、品質、年資、帶人」，不是只比件數；資深同仁的經驗會在這裡被看見。${historyNote(m)}</p>
      </section>`;
  }

  function trendCard(m) {
    const t = m.trend;
    let body;
    if (m.prev === undefined) body = '<p class="gc-muted">上個月資料讀取中…</p>';
    else if (t.prevPoints == null) body = '<p class="gc-muted">上個月還沒有點數制度，下個月開始就能跟自己比。</p>';
    else {
      const d = t.curPoints - t.prevPoints;
      const label = t.finished ? '整個業績月' : `前 ${t.elapsed} 天`;
      body = `<div class="gc-trend">
          <div><small>上月同期（${label}）</small><b>${t.prevPoints}</b><span>點</span></div>
          <div class="gc-trend-arrow ${d >= 0 ? 'is-up' : 'is-down'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(d)}</div>
          <div><small>本月（${label}）</small><b>${t.curPoints}</b><span>點</span></div>
        </div>
        <p class="gc-trend-note">${d > 0 ? `比上個月同期多 ${d} 點，有在進步 👏` : d === 0 ? '跟上個月同期一樣，穩定維持' : `比上個月同期少 ${-d} 點，看看是案量變少，還是哪裡卡住了`}</p>`;
    }
    return `<section class="gc-card">
        <h3>📈 跟自己比</h3>
        ${body}
        <h4>本月每週點數</h4>
        ${weekChart(m.pf)}
      </section>`;
  }

  function whyCard() {
    return `<details class="gc-card gc-why-card"${state.whyOpen ? ' open' : ''} data-why>
        <summary>🤔 這對我有什麼用？（第一次看請點開）</summary>
        <div class="gc-why-grid">
          <div><b>你的經驗看得見</b><p>不是只比件數。品質、速度、能做幾種業務、能不能帶人，都算進成長階段。</p></div>
          <div><b>先跟自己比</b><p>首頁先看你比上個月同期進步多少，名次只用「群組」呈現，不公開排第幾。</p></div>
          <div><b>一次只改一件</b><p>系統只挑影響最大的一件事給你，附具體做法，不會丟一堆缺點。</p></div>
          <div><b>目標你自己選</b><p>改善步驟可以自己勾選要挑戰哪一個，一次挑 1～2 個就好。</p></div>
          <div><b>算法全部公開</b><p>每個分數怎麼來都寫在明細裡，有疑問可以直接對資料。</p></div>
          <div><b>換得到東西</b><p>點數階段連動獎金；專精、傳承期的同仁優先擔任導師、參與修訂流程。</p></div>
        </div>
      </details>`;
  }

  function page(m) {
    return `${hero(m)}
      <div class="gc-grid2 gc-grid2--focus">
        <div class="gc-stack">
          ${strengthCard(m)}
          ${trendCard(m)}
        </div>
        ${focusCard(m)}
      </div>
      <div class="gc-grid2">
        ${stageMap(m)}
        ${axesCard(m)}
      </div>
      ${whyCard()}`;
  }

  /* ---------- 嵌在個人明細：摘要卡＋點開在下方展開（可收起），樣式沿用點數表的圖表卡 ---------- */

  const TILES = [
    { key: 'focus', icon: '🎯', title: '本月只要先顧好一件事', card: focusCard },
    { key: 'axes', icon: '🧭', title: '五個面向', card: axesCard },
    { key: 'stage', icon: '🗺️', title: '成長階段地圖', card: stageMap },
    { key: 'trend', icon: '📈', title: '跟自己比', card: trendCard },
    { key: 'strength', icon: '💪', title: '你的長處', card: strengthCard }
  ];

  function tileSummary(key, m) {
    const big = (html, sub) => `<p class="gc-tile-big">${html}${sub ? `<small>${sub}</small>` : ''}</p>`;
    const text = (html) => `<p class="gc-tile-text">${html}</p>`;
    if (key === 'focus') {
      const f = m.focus[0];
      return f ? big(esc(f.title), f.value != null ? `目前 ${round(f.value)} 分` : '') + text(`🏁 ${esc(f.goal)}`) : big('各項都在水準以上 👍') + text('想往下一階段前進，打開看還差什麼');
    }
    if (key === 'axes') {
      const rows = AXES.map((a) => {
        const v = m.axes[a.key];
        const tone = v == null ? 'is-na' : v >= 70 ? 'is-good' : v >= 50 ? 'is-mid' : 'is-low';
        return `<li><span>${a.label}</span><b class="gc-axis-score ${tone}">${v == null ? '—' : round(v)}</b></li>`;
      }).join('');
      return `<ul class="gc-tile-axes">${rows}</ul>${text(`在團隊的位置：<b>${esc(m.band.name)}</b>`)}`;
    }
    if (key === 'stage') {
      const lv = m.stage.level;
      const st = lv == null ? UNKNOWN_STAGE : STAGES[lv];
      const next = lv == null ? null : STAGES[lv + 1];
      const left = m.stage.need.filter((c) => !c.ok).length;
      const grade = m.pf.grade === '-' ? '' : `本月評等 ${m.pf.grade}（${m.pf.label}）`;
      return big(`${st.icon} ${st.name}`, grade) + text(lv == null ? '資料太少，先不判定階段' : next ? `升到「${next.name}」還差 <b>${left}</b> 項` : '已是最高階段，歡迎擔任導師');
    }
    if (key === 'trend') {
      const t = m.trend;
      if (m.prev === undefined) return text('上個月資料讀取中…');
      if (t.prevPoints == null) return text('上個月還沒有點數制度，下個月開始就能跟自己比');
      const d = t.curPoints - t.prevPoints;
      return big(`${t.curPoints} 點 <span class="gc-tile-delta ${d >= 0 ? 'is-up' : 'is-down'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(d)}</span>`) + text(`上月同期 ${t.prevPoints} 點（${t.finished ? '整個業績月' : `前 ${t.elapsed} 天`}）`);
    }
    if (key === 'strength') {
      if (!m.strengths.length) return text('本月還沒有特別突出的項目，先顧好本月重點');
      return big(`${m.strengths.length} 項做得好`) + text(esc(m.strengths[0]));
    }
    return '';
  }

  function embedPage(m) {
    const tiles = TILES.filter((t) => t.key !== 'axes' && t.key !== 'stage').map((t) => {
      const open = ui.open === t.key;
      const panel = open
        ? `<section class="apt-pick-panel gc-tile-panel" id="gc-tile-panel">
            <header><h4>${t.icon} ${t.title}</h4><button type="button" class="apt-pick-close" data-gc-close>▲ 點一下收起</button></header>
            ${t.card(m)}
            <button type="button" class="apt-pick-foot" data-gc-close>▲ 看完了，點一下收起</button>
          </section>`
        : '';
      return `<div class="apt-chart apt-chart--pick gc-tile${open ? ' is-picked' : ''}" role="button" tabindex="0" aria-expanded="${open}" data-gc-open="${t.key}">
          <h5>${t.icon} ${t.title}</h5>
          <div class="gc-tile-sum">${tileSummary(t.key, m)}</div>
          <p class="apt-card-hint">${open ? '👇 內容在下方，點一下「收起」關閉' : '👆 點一下看完整內容'}</p>
        </div>${panel}`;
    }).join('');
    return `<h4 class="apt-sec-title">🧭 成長羅盤<small>成長階段與五個面向；下方卡片點開看完整內容，看完可以收起</small></h4>
      <div class="gc-grid2 gc-embed-main">${stageMap(m)}${axesCard(m)}</div>
      <div class="apt-charts gc-tiles">${tiles}</div>
      ${whyCard()}`;
  }

  function goalStore() {
    try {
      return JSON.parse(localStorage.getItem(GOAL_KEY) || '{}');
    } catch {
      return {};
    }
  }
  const goalKey = (m) => `${m.name}|${keyOf(m.calc.range)}`;

  /* ---------- 版面 ---------- */

  function render() {
    const root = ui.root;
    const calc = state.cur;
    if (!calc || !root?.isConnected) return;
    const prev = state.prev === undefined ? undefined : state.prev;
    const m = buildModel(calc, prev || null, state.person);
    if (prev === undefined) m.prev = undefined;
    const r = calc.range;
    root.innerHTML = `<p class="gc-range">${r.month} 月業績（${r.start}～${r.end}）${calc.termError ? `　⚠️ 解約資料暫時讀不到，解約點數先不計` : ''}</p>
      ${ui.embedded ? embedPage(m) : page(m)}`;
  }

  function fillPeople() {
    const calc = state.cur;
    const me = myName();
    const names = peers(calc.staff)
      .map((s) => s.name)
      .filter((n) => Core.canViewPerson(me, n, calc.staff))
      .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    if (me && !names.includes(me) && calc.staff.some((s) => s.name === me)) names.unshift(me);
    if (!state.person || !names.includes(state.person)) state.person = names.includes(me) ? me : names[0] || '';
    $('gc-person').innerHTML = names.map((n) => `<option value="${esc(n)}"${n === state.person ? ' selected' : ''}>${esc(n)}${n === me ? '（我）' : ''}</option>`).join('');
  }

  async function load() {
    const seq = ++loadSeq;
    const r = currentRange();
    const reload = $('gc-reload');
    if (reload) reload.disabled = true;
    say(`讀取 ${r.month} 月業績資料中…第一次約需 5～10 秒`);
    try {
      loadExam().then(() => state.cur && render());
      loadHistory();
      const cur = await loadMonth(r);
      if (seq !== loadSeq) return;
      state.cur = cur;
      state.prev = undefined;
      if (!ui.embedded) fillPeople();
      say('');
      render();
      const pr = prevRange(r);
      const prev = pr ? await loadMonth(pr).catch(() => null) : null;
      if (seq !== loadSeq) return;
      state.prev = prev;
      render();
    } catch (e) {
      if (seq === loadSeq) say(String(e.message || e), 'err');
    } finally {
      if (reload && seq === loadSeq) reload.disabled = false;
    }
  }

  function bindPage() {
    $('gc-month').addEventListener('change', (e) => {
      state.monthKey = e.target.value;
      load();
    });
    $('gc-person').addEventListener('change', (e) => {
      state.person = e.target.value;
      render();
    });
    $('gc-reload').addEventListener('click', () => {
      state.cache.clear();
      state.exam = null;
      load();
    });
  }

  function bindRoot(root) {
    root.addEventListener('toggle', (e) => {
      if (e.target.matches?.('[data-why]')) state.whyOpen = e.target.open;
    }, true);
    const toggleTile = (key) => {
      ui.open = key && ui.open !== key ? key : null;
      render();
      if (ui.open) root.querySelector('#gc-tile-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-gc-close]')) return toggleTile(null);
      const tile = e.target.closest('[data-gc-open]');
      if (tile) toggleTile(tile.dataset.gcOpen);
    });
    root.addEventListener('keydown', (e) => {
      const tile = e.target.closest?.('[data-gc-open]');
      if (!tile || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      toggleTile(tile.dataset.gcOpen);
    });
    root.addEventListener('change', (e) => {
      const box = e.target.closest('[data-goal]');
      if (!box || !state.cur) return;
      const checked = [...root.querySelectorAll('[data-goal]:checked')].map((x) => x.dataset.goal);
      if (checked.length > 2) {
        box.checked = false;
        say('一次挑 1～2 個就好，先取消一個再選', 'warn');
        setTimeout(() => say(''), 3000);
        return;
      }
      const all = goalStore();
      all[`${state.person}|${keyOf(state.cur.range)}`] = checked;
      localStorage.setItem(GOAL_KEY, JSON.stringify(all));
    });
  }

  function init() {
    if (!$('gc-root')) return;
    if (!token()) {
      $('gc-login').classList.remove('hidden');
      return;
    }
    ui.root = $('gc-root');
    ui.msg = $('gc-msg');
    state.months = monthOptions();
    state.monthKey = keyOf(state.months[0]);
    $('gc-month').innerHTML = state.months.map((m) => `<option value="${keyOf(m)}">${m.year - 1911} 年 ${m.month} 月</option>`).join('');
    $('gc-tools').classList.remove('hidden');
    bindPage();
    bindRoot(ui.root);
    load();
  }

  /** 嵌入行政點數表個人明細：人員與業績月跟著點數表走；同一個月已讀過就直接畫，不重抓 */
  function mount(el, opts) {
    if (!el) return;
    el.classList.add('gc-embed');
    if (!token()) {
      el.innerHTML = '<p class="gc-msg is-warn">請先登入工具箱</p>';
      return;
    }
    el.innerHTML = '<p class="gc-msg hidden"></p><div class="gc-root"></div>';
    ui.embedded = true;
    ui.root = el.querySelector('.gc-root');
    ui.msg = el.querySelector('.gc-msg');
    bindRoot(ui.root);
    if (state.person !== opts.person) ui.open = null;
    state.person = opts.person;
    const r = Core.perfMonthRange(opts.year, opts.month);
    state.months = [r];
    const sameMonth = state.monthKey === keyOf(r);
    state.monthKey = keyOf(r);
    if (sameMonth && state.cur && keyOf(state.cur.range) === state.monthKey) {
      render();
      return;
    }
    state.cur = null;
    load();
  }

  window.GrowthCompass = { mount };
  init();
})();
