/**
 * 行政點數表：審核時間紀錄 → 點數（純計算，瀏覽器與 node 共用）
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AdminPointsCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const AUTO_ITEMS = [
    { key: 'obj', label: '物審', points: 1 },
    { key: 'tenant', label: '房客', points: 1 },
    { key: 'pre', label: '預審', points: 1 },
    { key: 'rev', label: '複審', points: 1, pointsText: '2點' },
    { key: 'p4', label: '四期產編', points: 1 },
    { key: 'p5', label: '五期產編', points: 2 },
    { key: 'repair', label: '修繕', points: 1 },
    { key: 'mterm', label: '代管解約', points: 1 },
    { key: 'term', label: '包租解約', points: 3 },
    { key: 'lvr', label: '實價登錄', points: 1 }
  ];
  /** 行政QA 由組長依核定點數填 1～4 點，計入「行政QA」欄；其餘計入「手填」欄 */
  const MANUAL_ITEMS = [
    { key: '行政QA', points: 1, maxPoints: 4 },
    { key: '案件意見修正', points: 1 },
    { key: '清冊意見修正', points: 1 }
  ];
  /** 行政自己填的公會意見，每筆 1 點；跟組長補登的同名項目合在同一欄 */
  const OPINION_ITEMS = [
    { kind: 'case', key: '案件意見修正', label: '案件意見修正' },
    { kind: 'roster', key: '清冊意見修正', label: '清冊意見修正' }
  ];
  /** 解約改由媒合管理自動抓取，舊的手填解約不再計點 */
  const RETIRED_MANUAL_ITEMS = new Set(['代管解約', '包租解約']);
  /** 個人技能 8 節點；修繕只計點不列技能 */
  const SKILL_NODES = [
    { key: 'obj', label: '物審' },
    { key: 'tenant', label: '房客' },
    { key: 'pre', label: '預審' },
    { key: 'rev', label: '複審' },
    { key: 'p4', label: '四期產編' },
    { key: 'p5', label: '五期產編' },
    { key: 'term', label: '解約' },
    { key: 'lvr', label: '實價登錄' }
  ];
  /** 行政教育訓練五週課表；不是技能節點的項目（general）只有訓練、沒有實務件數 */
  const TRAINING_EXTRA = { guide: '執行要點', contract: '製作合約', weekly: '週報', repair: '修繕', bonus: '媒合費獎金管理', hr: '人員到職與離職資料輸入', guild: '送公會資料準備', roster: '清冊' };
  const TRAINING_WEEKS = [
    ['guide', 'obj', 'tenant'],
    ['pre', 'rev', 'contract'],
    ['p4', 'p5', 'weekly'],
    ['term', 'repair'],
    ['bonus', 'hr', 'guild']
  ];
  /** 專案課程排在五週之後，每科各自 100 分，不併入訓練總分 */
  const TRAINING_PROJECTS = ['lvr', 'roster'];
  const trainingNode = (key, extra) => {
    const sk = SKILL_NODES.find((n) => n.key === key);
    return sk ? { ...sk, ...extra } : { key, label: TRAINING_EXTRA[key], general: true, ...extra };
  };
  const TRAINING_NODES = [
    ...TRAINING_WEEKS.flatMap((keys, i) => keys.map((key) => trainingNode(key, { week: i + 1 }))),
    ...TRAINING_PROJECTS.map((key) => trainingNode(key, { project: true }))
  ];
  /** 有教學影片＋線上考試的課程 */
  const VIDEO_COURSES = ['obj', 'tenant', 'pre', 'rev'];
  /** 已開放模擬系統實作的課程；其他課程的模擬環境還在建置，實作一律顯示準備中 */
  const PRACTICE_COURSES = ['obj'];
  /** 測試教學影片、題庫與實作用的帳號：人員名單固定列在非行政，不進人力明細與組織圖 */
  const TRAINING_TESTERS = ['簡為倢', '邱奕棋'];
  const isOnDuty = (s) => s.status === '在職' && !TRAINING_TESTERS.includes(s.name);

  /**
   * 教育訓練通過判定
   * 影片課程：看完影片＋考試滿分＋實作完成；執行要點：考試全部滿分；其他項目課程準備中
   * @param st { videoDone, videoPct, examPassed, examBest, practiceDone, guideRate }
   */
  function trainingState(key, st) {
    const s = st || {};
    if (key === 'guide') {
      const rate = s.guideRate == null ? null : Math.min(1, s.guideRate);
      const ok = rate != null && rate >= 1;
      return { ready: true, done: ok, progress: rate || 0, steps: [{ key: 'exam', label: '考試全部滿分', ok }] };
    }
    if (!VIDEO_COURSES.includes(key)) return { ready: false, done: false, progress: 0, steps: [] };
    const practiceReady = PRACTICE_COURSES.includes(key);
    const steps = [
      { key: 'video', label: '看完影片', ok: !!s.videoDone },
      { key: 'exam', label: '考試滿分', ok: !!s.examPassed },
      { key: 'practice', label: '實作', ok: practiceReady && !!s.practiceDone, pending: !practiceReady }
    ];
    const n = steps.filter((x) => x.ok).length;
    return { ready: true, done: n === steps.length, progress: n / steps.length, steps };
  }

  /**
   * 各項分數＝通過條件完成比例 ×100（執行要點依考試進度）；總分＝所有項目平均
   * @param stateOf (key) => trainingState(...)
   */
  function courseScores(stateOf) {
    const labelOf = new Map(TRAINING_NODES.map((n) => [n.key, n.label]));
    const nodeScore = (key) => Math.round((stateOf(key)?.progress || 0) * 100);
    const avg = (list) => (list.length ? list.reduce((s, c) => s + c.score, 0) / list.length : 0);
    const weeks = TRAINING_WEEKS.map((keys, i) => {
      const items = keys.map((key) => ({ key, label: labelOf.get(key), score: nodeScore(key) }));
      return { week: i + 1, items, score: avg(items) };
    });
    const all = weeks.flatMap((w) => w.items);
    const projects = TRAINING_PROJECTS.map((key) => ({ key, label: labelOf.get(key), score: nodeScore(key) }));
    return { weeks, general: all, generalScore: avg(all), projects };
  }
  const STAGE_1 = 250;
  const STAGE_2 = 350;
  const ITEM_POINTS = Object.fromEntries(AUTO_ITEMS.map((i) => [i.key, i.points]));
  /** 點數改制：自 from 日（審核日期）起改用新點數 */
  const POINT_CHANGES = { rev: [{ from: '2026-10-12', points: 2 }] };
  function itemPoints(item, date) {
    const hit = (POINT_CHANGES[item] || []).filter((c) => date >= c.from).pop();
    return hit ? hit.points : ITEM_POINTS[item];
  }
  /** 解約依合約類型分欄：包租、轉租→包租解約（3 點）；代管→代管解約（1 點） */
  const TERM_ITEM_OF = { 包租: 'term', 轉租: 'term', 代管: 'mterm' };
  /**
   * 月累計以表單為準的業績月（key：start|end）：各項件數仍是系統爬取，
   * 跟表單的差額記在 month.adjust（表單校正），只調月合計，不分配到每天。
   */
  const SHEET_TOTALS = {
    '2026-08-29|2026-09-28': {
      source: '09月行政每月行政進度',
      totals: {
        温巧萱: 517, 劉邦禹: 407, 簡旻鈺: 384, 鄭宇峻: 359, 林宥淇: 359, 方靖雯: 277, 何虹邑: 265, 詹佳芸: 258, 林盈家: 258,
        魏汕洝: 256, 郭沛琳: 255, 彭琪婷: 250, 高慈惠: 237, 吳羽涵: 227, 温馨: 209, 吳俐儀: 205, 陳怡伶: 174, 韋宓妤: 165,
        温思琳: 157, 吳若寧: 152, 賴曉嫻: 139, 劉婷昱: 121, 蔡宜秀: 111, 林怡軒: 104, 張庭筠: 87, 王思涵: 73, 韋安俞: 16,
        楊舒喬: 12, 呂佳融: 2, 劉芮蓁: 0,
        梁凌佳: 241, 池禹杉: 88, 彭心緣: 51, 賴加琳: 51, 邱郁庭: 0
      }
    }
  };

  function sheetTotals(start, end) {
    return SHEET_TOTALS[`${start}|${end}`] || null;
  }
  const TENANT_TO_EFFECTIVE = /^(財調中|未財調|已退件|人工審核) → 已生效$/;
  const PERIOD_4 = new Set(['04', '41']);
  const PERIOD_5 = new Set(['05']);

  /** 合約編號：區碼英文＋數字＋英文後三碼，首碼 1 代管／3 包租，後兩碼期別（04 四期、41 增辦四期、05 五期） */
  function contractPeriod(no) {
    const m = String(no || '').match(/[A-Z]\d[A-Z](\d)(\d{2})/);
    if (!m) return null;
    return { kind: m[1], period: m[2] };
  }

  /** 回傳 { item, group } 或 { item: null }；group 用來去重（四期／五期產編同屬產編） */
  function classify(row) {
    const status = String(row.status || '').replace(/\s+/g, ' ').trim();
    if (row.type === 'object') {
      return status === '送審中 → 已生效' ? { item: 'obj', group: 'obj' } : { item: null };
    }
    if (row.type === 'tenant') {
      return TENANT_TO_EFFECTIVE.test(status) ? { item: 'tenant', group: 'tenant' } : { item: null };
    }
    if (row.type !== 'contract') return { item: null };
    if (status === '預審中 → 預審通過') return { item: 'pre', group: 'pre' };
    if (status === '複審中 → 複審通過') return { item: 'rev', group: 'rev' };
    if (status === '已生效 → 已生效') return { item: 'lvr', group: 'lvr' };
    if (status === '待產編 → 已生效') {
      const code = contractPeriod(row.no);
      if (code && PERIOD_4.has(code.period)) return { item: 'p4', group: 'prod' };
      if (code && PERIOD_5.has(code.period)) return { item: 'p5', group: 'prod' };
      return { item: null, group: 'prod', unknownCode: true };
    }
    return { item: null };
  }

  /**
   * 同案件判斷鍵：系統 id；合約另加「編號＋地址」與完整編號。
   * 退件重送時系統會開新 id；產編前編號只有前綴（如 L2M105），需搭配地址才能分辨。
   */
  function caseKeys(row, group) {
    const keys = [`${row.type}|id:${row.targetId}|${group}`];
    if (row.type === 'contract') {
      const no = String(row.no || '').replace(/\s+/g, '');
      const addr = String(row.name || '').replace(/\s+/g, '');
      if (no && addr) keys.push(`contract|no:${no}|addr:${addr}|${group}`);
      if (/[A-Z]\d[A-Z]\d{8,}/.test(no)) keys.push(`contract|no:${no}|${group}`);
    }
    return keys;
  }

  function rowsFromPayload(payload) {
    const fields = payload?.fields || [];
    return (payload?.rows || []).map((arr) => {
      const r = {};
      fields.forEach((f, i) => {
        r[f] = arr[i];
      });
      if (!r.date) r.date = String(r.time || '').slice(0, 10).replace(/\//g, '-');
      return r;
    });
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function isoDate(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /** 業績月：上月 29 日～本月 28 日（month 為 1～12） */
  function perfMonthRange(year, month) {
    const start = new Date(year, month - 2, 29);
    const end = new Date(year, month - 1, 28);
    return { year, month, start: isoDate(start), end: isoDate(end) };
  }

  /** 點數制度自 115 年 9 月業績月起算，之前的月份不顯示也不計入全年 */
  const FIRST_PERF_MONTH = { year: 2026, month: 9 };

  function beforeFirstPerf(year, month) {
    return year * 12 + month < FIRST_PERF_MONTH.year * 12 + FIRST_PERF_MONTH.month;
  }

  function perfMonthOf(date) {
    const d = date instanceof Date ? date : new Date(date);
    let y = d.getFullYear();
    let m = d.getMonth() + 1;
    if (d.getDate() >= 29) {
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    return { year: y, month: m };
  }

  function stageOf(total) {
    if (total >= STAGE_2) return 2;
    if (total >= STAGE_1) return 1;
    return 0;
  }

  function emptyTally() {
    const t = { auto: 0, qa: 0, manual: 0, adjust: 0, total: 0, counts: {}, manualCounts: {}, manualPoints: {} };
    for (const i of AUTO_ITEMS) t.counts[i.key] = 0;
    for (const i of MANUAL_ITEMS) {
      t.manualCounts[i.key] = 0;
      t.manualPoints[i.key] = 0;
    }
    return t;
  }

  /** t.manual 含意見修正；「人工計點」欄只算其餘的手動點數 */
  function opinionPoints(t) {
    return OPINION_ITEMS.reduce((s, i) => s + (t.manualPoints?.[i.key] || 0), 0);
  }

  function otherManual(t) {
    return (t.manual || 0) - opinionPoints(t);
  }

  function opinionManual(list) {
    const item = Object.fromEntries(OPINION_ITEMS.map((i) => [i.kind, i.key]));
    return (list || [])
      .filter((o) => item[o.kind] && o.name && o.date)
      .map((o) => ({ date: o.date, name: o.name, item: item[o.kind], qty: 1, points: 1 }));
  }

  function finish(t) {
    t.total = t.auto + t.qa + t.manual;
    return t;
  }

  /** 不列入任何統計的人：人力明細營業處為「駐府人員」（人力明細本身保留，後台仍可維護） */
  const EXCLUDED_OFFICES = ['駐府人員'];

  function isExcludedStaff(s) {
    return EXCLUDED_OFFICES.includes(String(s?.office || '').trim());
  }

  function excludedNames(staff, extra) {
    return new Set([...(extra || []), ...(staff || []).filter(isExcludedStaff).map((s) => s.name)]);
  }

  /** admin_points_view 回傳值拿掉不列入統計的人；excluded 留著給審核紀錄過濾 */
  function stripExcluded(sb) {
    if (!sb) return sb;
    const names = excludedNames(sb.staff, sb.excluded);
    const out = { ...sb, excluded: [...names] };
    if (!names.size) return out;
    out.staff = (sb.staff || []).filter((s) => !names.has(s.name));
    for (const k of ['incidents', 'checks', 'manual', 'opinions', 'training']) {
      if (Array.isArray(sb[k])) out[k] = sb[k].filter((x) => !names.has(x.name));
    }
    return out;
  }

  /** 審核紀錄、補助審核、解約：拿掉不列入統計的人（依 auditor） */
  function dropExcludedRows(rows, excluded) {
    const names = excluded instanceof Set ? excluded : new Set(excluded || []);
    return names.size ? (rows || []).filter((r) => !names.has(r.auditor)) : rows || [];
  }

  /**
   * @param auditRows  rowsFromPayload 結果
   * @param opts { start, end, staff:[{name,status,kind}], manual:[{date,name,item,qty,points}],
   *               expenses: 補助審核 rowsFromPayload 結果（已生效五類費用，date 為審核日期）,
   *               exclude: 不列入統計的姓名（staff 裡的駐府人員也會自動排除） }
   */
  function compute(auditRows, opts) {
    const start = opts.start;
    const end = opts.end;
    const excluded = excludedNames(opts.staff, opts.exclude);
    const staffList = (opts.staff || []).filter((s) => !excluded.has(s.name));
    auditRows = dropExcludedRows(auditRows, excluded);
    const active = new Map(staffList.filter(isOnDuty).map((s) => [s.name, s]));
    const inactive = new Set(staffList.filter((s) => s.status !== '在職').map((s) => s.name));
    const rosterReady = active.size > 0;

    const sorted = auditRows
      .filter((r) => r.date >= start && r.date <= end)
      .slice()
      .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.id - b.id));

    const seen = new Set();
    const scored = [];
    const duplicates = [];
    const unknownCodes = [];
    const resigned = new Map();
    const skipResigned = (name) => {
      if (!inactive.has(name) || active.has(name)) return false;
      resigned.set(name, (resigned.get(name) || 0) + 1);
      return true;
    };

    for (const r of sorted) {
      const c = classify(r);
      if (!c.group) continue;
      const keys = caseKeys(r, c.group);
      const dup = keys.some((k) => seen.has(k));
      keys.forEach((k) => seen.add(k));
      if (dup) {
        duplicates.push({ ...r, item: c.item });
        continue;
      }
      if (c.unknownCode) {
        unknownCodes.push(r);
        continue;
      }
      if (skipResigned(r.auditor)) continue;
      scored.push({ ...r, item: c.item, points: itemPoints(c.item, r.date) });
    }

    const expenses = dropExcludedRows(opts.expenses, excluded)
      .filter((r) => r.date >= start && r.date <= end)
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
    const seenExpense = new Set();
    for (const r of expenses) {
      if (seenExpense.has(r.id)) continue;
      seenExpense.add(r.id);
      if (skipResigned(r.auditor)) continue;
      scored.push({ ...r, item: 'repair', points: ITEM_POINTS.repair, status: `${r.type}（已生效）`, time: '' });
    }

    const terminations = dropExcludedRows(opts.terminations, excluded)
      .filter((r) => r.date >= start && r.date <= end && r.auditor)
      .slice()
      .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.id - b.id));
    const seenTerm = new Set();
    for (const r of terminations) {
      if (seenTerm.has(r.id)) continue;
      seenTerm.add(r.id);
      const termItem = TERM_ITEM_OF[String(r.contractType || '').trim()];
      if (!termItem || skipResigned(r.auditor)) continue;
      scored.push({
        ...r,
        item: termItem,
        points: itemPoints(termItem, r.date),
        type: 'contract',
        status: `${r.contractType || ''}解約 → 已解約生效`
      });
    }

    /** 行政＝人力明細在職；非行政＝有審核紀錄但不在人力明細 */
    const people = new Map();
    const person = (name) => {
      if (!people.has(name)) {
        people.set(name, {
          name,
          kind: active.get(name)?.kind || '',
          group: !rosterReady || active.has(name) ? '行政' : '非行政',
          month: emptyTally(),
          days: new Map(),
          records: []
        });
      }
      return people.get(name);
    };
    const day = (p, date) => {
      if (!p.days.has(date)) p.days.set(date, emptyTally());
      return p.days.get(date);
    };

    for (const r of scored) {
      const p = person(r.auditor);
      const d = day(p, r.date);
      for (const t of [p.month, d]) {
        t.counts[r.item] += 1;
        t.auto += r.points;
      }
      p.records.push(r);
    }

    for (const m of [...(opts.manual || []), ...opinionManual(opts.opinions)]) {
      if (excluded.has(m.name) || m.date < start || m.date > end || RETIRED_MANUAL_ITEMS.has(m.item) || skipResigned(m.name)) continue;
      const p = person(m.name);
      const pts = Number(m.points) || 0;
      const qty = Number(m.qty) || 1;
      for (const t of [p.month, day(p, m.date)]) {
        if (m.item === '行政QA') {
          t.qa += pts;
          continue;
        }
        t.manual += pts;
        t.manualCounts[m.item] = (t.manualCounts[m.item] || 0) + qty;
        t.manualPoints[m.item] = (t.manualPoints[m.item] || 0) + pts;
      }
    }

    if (rosterReady) {
      for (const [name, s] of active) {
        if (!people.has(name)) person(name);
        people.get(name).kind = s.kind;
      }
    }
    for (const name of TRAINING_TESTERS) person(name);

    const sheet = sheetTotals(start, end);
    if (sheet) for (const name of Object.keys(sheet.totals)) if (!skipResigned(name)) person(name);

    const list = [...people.values()].filter((p) => !excluded.has(p.name));
    for (const p of list) {
      finish(p.month);
      for (const t of p.days.values()) finish(t);
      const target = sheet?.totals[p.name];
      if (target != null && target !== p.month.total) {
        p.month.adjust = target - p.month.total;
        p.month.total = target;
      }
      p.stage = stageOf(p.month.total);
    }
    list.sort((a, b) => b.month.total - a.month.total || a.name.localeCompare(b.name, 'zh-Hant'));

    return {
      start,
      end,
      rosterReady,
      sheet: sheet ? sheet.source : '',
      people: list,
      scoredCount: scored.length,
      duplicates,
      unknownCodes,
      resigned: [...resigned.entries()].sort((a, b) => b[1] - a[1])
    };
  }

  function stageLabel(stage) {
    if (stage === 2) return '第二階段';
    if (stage === 1) return '第一階段';
    return '未達第一階段';
  }

  /** 2026-08-11 → 115年08月 */
  function rocYearMonth(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})/);
    return m ? `${Number(m[1]) - 1911}年${m[2]}月` : '';
  }

  /**
   * 行政人員每月進度：只列人力明細在職者；正職依月累計排名（同分同名次），工讀生另表。
   * @param result compute() 結果
   * @param opts { staff, checks:[{name,checked,correct,date}], asOf?: 只算到這天（週報用；不套表單校正） }
   */
  function monthlyReport(result, opts) {
    const byName = new Map(result.people.map((p) => [p.name, p]));
    const asOf = opts.asOf && opts.asOf < result.end ? opts.asOf : '';
    const pointsOf = (p) => {
      if (!p) return 0;
      if (!asOf) return p.month.total;
      let s = 0;
      for (const [d, t] of p.days) if (d <= asOf) s += t.total;
      return s;
    };
    const checks = new Map();
    for (const c of opts.checks || []) {
      if (asOf && c.date > asOf) continue;
      const t = checks.get(c.name) || { checked: 0, correct: 0 };
      t.checked += Number(c.checked) || 0;
      t.correct += Number(c.correct) || 0;
      checks.set(c.name, t);
    }
    const rows = (opts.staff || [])
      .filter(isOnDuty)
      .map((s) => {
        const points = pointsOf(byName.get(s.name));
        const ck = checks.get(s.name) || { checked: 0, correct: 0 };
        const stage = stageOf(points);
        return {
          name: s.name,
          kind: s.kind,
          region: s.region || '',
          office: s.office || '',
          hire: rocYearMonth(s.hireDate),
          project: s.project || '',
          points,
          stage,
          stageLabel: stageLabel(stage),
          checked: ck.checked,
          correct: ck.correct,
          rate: ck.checked ? ck.correct / ck.checked : null
        };
      });
    const byPoints = (a, b) => b.points - a.points || a.name.localeCompare(b.name, 'zh-Hant');
    const full = rows.filter((r) => r.kind !== '工讀生').sort(byPoints);
    full.forEach((r, i) => {
      r.rank = i > 0 && full[i - 1].points === r.points ? full[i - 1].rank : i + 1;
    });
    const part = rows.filter((r) => r.kind === '工讀生').sort(byPoints);
    return {
      full,
      part,
      counts: {
        full: full.length,
        stage2: full.filter((r) => r.stage === 2).length,
        stage1: full.filter((r) => r.stage === 1).length,
        none: full.filter((r) => r.stage === 0).length
      }
    };
  }

  const REGION_ORDER = ['大台北', '台北', '新北', '基隆', '宜蘭', '桃園', '新竹', '台中', '彰化', '嘉義', '台南', '高雄'];
  function regionRank(r) {
    const i = REGION_ORDER.indexOf(r);
    return i < 0 ? 99 : i;
  }
  const BONUS_STAGE_1 = 2000;
  const BONUS_STAGE_2 = 5000;
  const BONUS_PROJECT_LIST = 3000;
  const BONUS_PROJECT_LVR = 2000;

  function addDays(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return isoDate(d);
  }

  function addMonths(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    const last = new Date(y, m - 1 + n + 1, 0).getDate();
    return isoDate(new Date(y, m - 1 + n, Math.min(d, last)));
  }

  /** 週一起算；回傳業績月內每一週 { start, end } */
  function weeksOf(range) {
    const first = new Date(range.start + 'T00:00:00');
    first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    const out = [];
    for (let s = isoDate(first); s <= range.end; s = addDays(s, 7)) out.push({ start: s, end: addDays(s, 6) });
    return out;
  }

  /** 新人到職滿一個月（以週結束日判斷）才列入考核 */
  function eligibleAt(hireDate, asOf) {
    if (!hireDate) return true;
    return asOf >= addMonths(hireDate, 1);
  }

  /**
   * 預估個人獎金：達 250 點 2,000、350 點 5,000；上個業績月未達 250 點打八折（115年9月制度首月不適用）；
   * 達 250 點另加專案任務獎金（清冊＋公會對接 3,000、實價登錄 2,000）。
   */
  function estimateBonus({ points, project, eligible, hireDate, prevPoints, perf }) {
    if (!eligible) return 0;
    const base = points >= STAGE_2 ? BONUS_STAGE_2 : points >= STAGE_1 ? BONUS_STAGE_1 : 0;
    const discount =
      perf.year * 12 + perf.month > 2026 * 12 + 9 && points >= STAGE_1 && hireDate && hireDate < perf.start && (prevPoints || 0) < STAGE_1;
    let bonus = discount ? base * 0.8 : base;
    if (points >= STAGE_1) {
      if (/清冊[＋+]公會對接/.test(project || '')) bonus += BONUS_PROJECT_LIST;
      if (/實價登錄/.test(project || '')) bonus += BONUS_PROJECT_LVR;
    }
    return bonus;
  }

  /**
   * 組長週報（同試算表欄位）：本週點數／抽查／客訴依週加總，月累積與懲處依業績月。
   * @param opts { staff, checks, incidents, week:{start,end}, perf:{year,month,start,end}, prevTotals: Map|null, leader }
   */
  function weeklyReport(result, opts) {
    const { week, perf } = opts;
    const byName = new Map(result.people.map((p) => [p.name, p]));
    const inWeek = (d) => d >= week.start && d <= week.end;
    const sumBy = (list, name, f) => list.filter((x) => x.name === name).reduce((s, x) => s + (Number(x[f]) || 0), 0);
    const weekChecks = (opts.checks || []).filter((c) => inWeek(c.date));
    const weekIncidents = (opts.incidents || []).filter((c) => inWeek(c.date));
    const monthIncidents = opts.incidents || [];
    const rows = (opts.staff || [])
      .filter((s) => isOnDuty(s) && s.kind !== '工讀生' && (!opts.leader || s.leader === opts.leader))
      .map((s) => {
        const p = byName.get(s.name);
        let weekPoints = 0;
        if (p) for (const [d, t] of p.days) if (inWeek(d)) weekPoints += t.total;
        const points = p?.month.total || 0;
        const stage = stageOf(points);
        const checked = sumBy(weekChecks, s.name, 'checked');
        const correct = sumBy(weekChecks, s.name, 'correct');
        const pens = monthIncidents.filter((x) => x.name === s.name).map((x) => x.penalty);
        const eligible = eligibleAt(s.hireDate, week.end);
        return {
          name: s.name,
          leader: s.leader || '',
          region: s.region || '',
          office: s.office || '',
          hire: rocYearMonth(s.hireDate),
          project: s.project || '',
          weekPoints,
          points,
          stage,
          stageLabel: stageLabel(stage),
          toNext: points < STAGE_1 ? STAGE_1 - points : points < STAGE_2 ? STAGE_2 - points : 0,
          bonus: estimateBonus({
            points,
            project: s.project,
            eligible,
            hireDate: s.hireDate,
            prevPoints: opts.prevTotals?.get(s.name),
            perf
          }),
          bonusPending: points >= STAGE_1 && !opts.prevTotals,
          checked,
          correct,
          rate: checked ? correct / checked : null,
          complaints: sumBy(weekIncidents, s.name, 'complaints'),
          penalty: pens.includes('大過') ? '大過' : pens.includes('小過') ? '小過' : '無',
          eligible,
          eligibleLabel: eligible ? '列入' : '新人首月排除'
        };
      });
    rows.sort((a, b) => regionRank(a.region) - regionRank(b.region) || b.points - a.points || a.name.localeCompare(b.name, 'zh-Hant'));
    const checkedSum = rows.reduce((s, r) => s + r.checked, 0);
    const correctSum = rows.reduce((s, r) => s + r.correct, 0);
    return {
      rows,
      summary: {
        weekPoints: rows.reduce((s, r) => s + r.weekPoints, 0),
        active: rows.length,
        rate: checkedSum ? correctSum / checkedSum : null,
        complaints: rows.reduce((s, r) => s + r.complaints, 0)
      }
    };
  }

  const DURATION_NODES = [
    { key: 'obj', label: '物審' },
    { key: 'tenant', label: '房客' },
    { key: 'pre', label: '預審' },
    { key: 'rev', label: '複審' },
    { key: 'p4', label: '四期產編' },
    { key: 'p5', label: '五期產編' },
    { key: 'px', label: '產編（期別不明）' },
    { key: 'lvr', label: '實價登錄' }
  ];

  /** 耗時依「審核前狀態」分節點；核准、退回、儲存都算一次審核 */
  function durationNode(row) {
    if (row.type === 'object') return 'obj';
    if (row.type === 'tenant') return 'tenant';
    if (row.type !== 'contract') return null;
    const from = String(row.status || '').split('→')[0].replace(/\s+/g, '');
    if (from === '預審中') return 'pre';
    if (from === '複審中') return 'rev';
    if (from === '待產編') {
      const code = contractPeriod(row.no);
      if (code && PERIOD_4.has(code.period)) return 'p4';
      if (code && PERIOD_5.has(code.period)) return 'p5';
      return 'px';
    }
    if (from === '已生效') return 'lvr';
    return null;
  }

  /** 物件／合約地址取縣市（臺統一寫成台）；房客審核沒有地址 */
  function cityOf(addr) {
    const s = String(addr || '')
      .replace(/\s+/g, '')
      .replace(/^\d+/, '')
      .replace(/臺/g, '台');
    const m = s.match(/^(.{2}[縣市])/);
    return m ? m[1] : '';
  }

  /** KPI 報表的 12 個地區（新竹含竹市竹縣、嘉義含嘉市嘉縣） */
  const KPI_REGIONS = ['台北', '新北', '基隆', '宜蘭', '桃園', '新竹', '台中', '彰化', '南投', '嘉義', '台南', '高雄'];
  const KPI_CASE_LETTER = {
    A: '台北', B: '新北', C: '桃園', D: '台中', E: '台南', F: '高雄', G: '基隆', H: '新竹',
    I: '嘉義', J: '新竹', L: '彰化', N: '嘉義', P: '南投', Q: '宜蘭'
  };
  const KPI_CASE_PREFIX = [
    ['星華嘉義', '嘉義'], ['星鴻嘉市', '嘉義'], ['星鴻嘉縣', '嘉義'], ['星鴻竹市', '新竹'], ['星鴻竹縣', '新竹'],
    ['星鴻臺北', '台北'], ['星鴻台北', '台北'], ['星鴻新北', '新北'], ['星鴻基隆', '基隆'], ['星鴻宜蘭', '宜蘭'],
    ['星鴻桃園', '桃園'], ['星鴻臺中', '台中'], ['星鴻台中', '台中'], ['星鴻彰化', '彰化'], ['星鴻南投', '南投'],
    ['星鴻臺南', '台南'], ['星鴻台南', '台南'], ['星鴻高雄', '高雄'], ['星華', '台北']
  ];

  /** 媒合編號（如 星鴻D2M…）→ KPI 地區；認不出回傳空字串 */
  function kpiRegionOfCaseNo(no) {
    const s = String(no || '').replace(/\s+/g, '').toUpperCase();
    const m = s.match(/^[^A-Z0-9]*([A-Z])\d[A-Z]/);
    if (m && KPI_CASE_LETTER[m[1]]) return KPI_CASE_LETTER[m[1]];
    const hit = KPI_CASE_PREFIX.find(([p]) => s.startsWith(p));
    return hit ? hit[1] : '';
  }

  /** 縣市（台北市、新竹縣…）→ KPI 地區；不在 12 區回傳空字串 */
  function kpiRegionOfCity(city) {
    const s = String(city || '').replace(/臺/g, '台').slice(0, 2);
    return KPI_REGIONS.includes(s) ? s : '';
  }

  /** 北／中／南區 → 區內的 KPI 地區（例：中區＝台中、彰化、南投） */
  function kpiRegionsOfAreas(areas) {
    const want = new Set(areas || []);
    const cities = TAKEUP_AREAS.filter((a) => want.has(a.name)).flatMap((a) => a.regions.flatMap(([, list]) => list));
    const hit = new Set(cities.map(kpiRegionOfCity).filter(Boolean));
    return KPI_REGIONS.filter((g) => hit.has(g));
  }

  /** 公會意見的缺失類別（同公會月報；資料庫 admin_points_opinion_cats 要一致） */
  const OPINION_CATEGORIES = {
    case: [
      '資料缺漏、重複(未檢附)', '未附原租約、不完整', '房東/客資料誤繕、過期、缺漏', '編號誤繕、未填(物編客編媒編)',
      '金額/費用誤繕', '日期未填、誤繕', '未蓋章/未簽章(含章糊)', '表單勾選有誤(未勾、勾錯)', '擺放順序有誤',
      '消防三寶(熱水器滅火器偵煙器)', '其他'
    ],
    roster: [
      '資料缺漏、重複(未檢附)', '有檢附資料未KEY經控表', '房東/客資料誤繕', '編號誤繕、未填(物編客編媒編)',
      '金額/費用誤繕', '日期未填、誤繕', '未蓋章/未簽章(含章糊)', '表單勾選有誤(未勾、勾錯)', '擺放順序有誤', '其他'
    ]
  };

  /** 清冊／審件作業良率：（總件數 − 錯誤件數）÷ 總件數 */
  const kpiErrRate = (x) => (x && x.total ? Math.max(0, (x.total - x.err) / x.total) : null);

  /**
   * 清冊／審件作業良率的件數（各地區KPI指標、組長週報共用）：清冊＝表單04＋09，審件＝起租已生效案件，
   * 錯誤＝該公會期數的清冊／案件意見（沒填縣市的案件意見依媒合編號推地區）。
   * @returns { roster, audit：{ 全區|地區: { total, err } }, errors：意見加上 area }
   */
  function kpiQuality(r04, r09, cases, opinions) {
    const regions = ['全區', ...KPI_REGIONS];
    const blank = () => Object.fromEntries(regions.map((g) => [g, { total: 0, err: 0 }]));
    const roster = blank();
    const audit = blank();
    for (const d of [r04, r09]) {
      for (const [region, , , n] of d?.rows || []) {
        if (roster[region]) roster[region].total += n;
        roster['全區'].total += n;
      }
    }
    for (const [region, , n] of cases?.rows || []) {
      audit['全區'].total += n;
      if (audit[region]) audit[region].total += n;
    }
    const errors = (opinions || []).map((o) => ({ ...o, area: o.region || (o.kind === 'case' ? kpiRegionOfCaseNo(o.caseNo) : '') }));
    for (const o of errors) {
      const bucket = o.kind === 'roster' ? roster : audit;
      bucket['全區'].err += 1;
      if (o.area && bucket[o.area]) bucket[o.area].err += 1;
    }
    return { roster, audit, errors };
  }

  /** 人力明細的地區 → KPI 地區（舊資料寫「大台北」的算在台北） */
  function kpiRegionOfStaff(region) {
    const s = String(region || '').trim();
    if (s === '大台北') return '台北';
    return KPI_REGIONS.includes(s) ? s : '';
  }

  /**
   * 第一階段以上達成率：在職正職行政中點數 ≥ 第一階段的人數。
   * col 'all' 用月累計（含表單校正）；col 為週序號時用業績月第一天累計到該週最後一天。
   * @returns get(region | '全區', col) → { hit, total, names:[{name, points}] } 或 null
   */
  function kpiStageReport(result, opts) {
    const byName = new Map(result.people.map((p) => [p.name, p]));
    const weeks = opts.weeks || [];
    const cells = new Map();
    const add = (g, col, name, points) => {
      const k = `${g}|${col}`;
      if (!cells.has(k)) cells.set(k, { hit: 0, total: 0, names: [] });
      const c = cells.get(k);
      c.total += 1;
      if (points >= STAGE_1) c.hit += 1;
      c.names.push({ name, points });
    };
    for (const s of opts.staff || []) {
      if (s.status !== '在職' || s.kind === '工讀生') continue;
      const p = byName.get(s.name);
      const region = kpiRegionOfStaff(s.region);
      const cols = [['all', p ? p.month.total : 0]];
      weeks.forEach((w, i) => {
        let pts = 0;
        if (p) for (const [date, t] of p.days) if (date <= w.end) pts += t.total;
        cols.push([i, pts]);
      });
      for (const [col, pts] of cols) {
        add('全區', col, s.name, pts);
        if (region) add(region, col, s.name, pts);
      }
    }
    return { get: (g, col) => cells.get(`${g}|${col}`) || null };
  }

  /** 縣市由北到南（東部與離島接在最後） */
  const CITY_ORDER = [
    '基隆市', '台北市', '新北市', '宜蘭縣', '桃園市', '新竹市', '新竹縣', '苗栗縣', '台中市', '彰化縣', '南投縣',
    '雲林縣', '嘉義市', '嘉義縣', '台南市', '高雄市', '屏東縣', '花蓮縣', '台東縣', '澎湖縣', '金門縣', '連江縣'
  ];

  function cityRank(city) {
    const i = CITY_ORDER.indexOf(city);
    return i < 0 ? CITY_ORDER.length : i;
  }

  function emptyDuration() {
    const t = { count: 0, sec: 0, avg: null, nodes: {} };
    for (const n of DURATION_NODES) t.nodes[n.key] = { count: 0, sec: 0, avg: null };
    return t;
  }

  function finishDuration(t) {
    t.avg = t.count ? t.sec / t.count : null;
    for (const n of Object.values(t.nodes)) n.avg = n.count ? n.sec / n.count : null;
    return t;
  }

  /**
   * 每人平均耗時（整體與各節點，單位秒）
   * @param opts { start, end, staff }
   */
  function durationReport(auditRows, opts) {
    const staffList = opts.staff || [];
    const active = new Set(staffList.filter(isOnDuty).map((s) => s.name));
    const inactive = new Set(staffList.filter((s) => s.status !== '在職').map((s) => s.name));
    const rosterReady = active.size > 0;
    const people = new Map();
    const cities = new Map();
    const all = emptyDuration();
    let missing = 0;
    for (const r of auditRows) {
      if (r.date < opts.start || r.date > opts.end) continue;
      const node = durationNode(r);
      if (!node) continue;
      const name = String(r.auditor || '').trim();
      if (!name || (inactive.has(name) && !active.has(name))) continue;
      const sec = r.duration == null ? NaN : Number(r.duration);
      if (!Number.isFinite(sec) || sec < 0) {
        missing += 1;
        continue;
      }
      if (!people.has(name)) {
        people.set(name, { name, group: !rosterReady || active.has(name) ? '行政' : '非行政', records: [], ...emptyDuration() });
      }
      const city = r.type === 'tenant' ? '' : cityOf(r.name) || '地址不明';
      people.get(name).records.push({ ...r, node, sec, city });
      const targets = [people.get(name), all];
      if (city) {
        if (!cities.has(city)) cities.set(city, { name: city, ...emptyDuration() });
        targets.push(cities.get(city));
      }
      for (const t of targets) {
        t.count += 1;
        t.sec += sec;
        t.nodes[node].count += 1;
        t.nodes[node].sec += sec;
      }
    }
    return {
      people: [...people.values()].map(finishDuration),
      cities: [...cities.values()].map(finishDuration),
      all: finishDuration(all),
      missing
    };
  }

  const LONG_SEC = 3600;
  /** 速度分只看通識節點（實價登錄是專案，件數多又只有少數人做，不列入） */
  const SPEED_SCORE_NODES = new Set(['obj', 'tenant', 'pre', 'rev', 'p4', 'p5', 'px']);
  /** 整體固定：點數 80%、審件 10%（速度 80%＋品質 20%）、客訴紀律 10% */
  const SCORE_DIMS = [
    { key: 'points', label: '點數產出', weight: 80 },
    { key: 'speed', label: '審核速度', weight: 8 },
    { key: 'quality', label: '審件品質', weight: 2 },
    { key: 'conduct', label: '客訴紀律', weight: 10 }
  ];
  const REVIEW_WEIGHT = 10;

  /** 審件那 10% 在速度、品質之間分：沒抽查全給速度、沒審核全給品質、兩者都沒有就 0 分；整體比例不變 */
  function scoreWeights(scores) {
    const hasSpeed = scores.speed != null;
    const hasQuality = scores.quality != null;
    const w = Object.fromEntries(SCORE_DIMS.map((d) => [d.key, d.weight]));
    if (!hasSpeed || !hasQuality) {
      w.speed = hasSpeed ? REVIEW_WEIGHT : 0;
      w.quality = hasQuality ? REVIEW_WEIGHT : 0;
    }
    return w;
  }

  function overallScore(scores) {
    if (scores.points == null) return null;
    const w = scoreWeights(scores);
    return SCORE_DIMS.reduce((s, d) => s + (scores[d.key] ?? 0) * w[d.key], 0) / 100;
  }

  function reviewScoreOf(scores) {
    const w = scoreWeights(scores);
    const sum = w.speed + w.quality;
    return sum ? ((scores.speed ?? 0) * w.speed + (scores.quality ?? 0) * w.quality) / sum : null;
  }
  /** 樣本太少時不判斷落後或亮點 */
  const MIN_SAMPLE = 3;

  /** 排名換算分數：比較對象中排在自己後面的比例（0–100，同值算一半）；沒有比較對象時給 50 */
  function percentile(mine, others, higherBetter) {
    if (!others.length) return 50;
    let beat = 0;
    for (const v of others) {
      if (v === mine) beat += 0.5;
      else if (higherBetter ? mine > v : mine < v) beat += 1;
    }
    return (beat / others.length) * 100;
  }

  /** values 需含自己（比較群組一定包含本人） */
  function rankAmong(mine, values, higherBetter) {
    return 1 + values.filter((v) => (higherBetter ? v > mine : v < mine)).length;
  }

  function gradeOf(score) {
    if (score == null) return { grade: '-', label: '資料不足' };
    if (score >= 85) return { grade: 'A', label: '優秀' };
    if (score >= 70) return { grade: 'B', label: '良好' };
    if (score >= 50) return { grade: 'C', label: '普通' };
    return { grade: 'D', label: '待加強' };
  }

  function mean(arr) {
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  }

  function median(arr) {
    if (!arr.length) return null;
    const s = arr.slice().sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /** 名次落點：前 1/3 前段、後 1/3 後段 */
  function rankBand(rank, n) {
    if (!rank || !n) return '';
    const r = (rank - 1) / Math.max(1, n - 1);
    return r <= 1 / 3 ? '前段' : r >= 2 / 3 ? '後段' : '中段';
  }

  function pctText(d) {
    return `${Math.round(Math.abs(d) * 100)}%`;
  }

  /**
   * 個人綜合評等：點數、各節點耗時、抽查良率、客訴懲處，跟行政同仁比較。
   * 比較對象＝人力明細在職正職（不含工讀生）；耗時的「全體平均」與耗時分頁相同。
   * @param opts { name, staff, checks, incidents, weeks:[{start,end}] }
   */
  function personProfile(result, dur, opts) {
    const name = opts.name;
    const staffList = opts.staff || [];
    const active = staffList.filter(isOnDuty);
    const peerNames = active.length
      ? active.filter((s) => s.kind !== '工讀生').map((s) => s.name)
      : result.people.filter((p) => p.group === '行政').map((p) => p.name);
    const group = peerNames.includes(name) ? peerNames : [...peerNames, name];
    const others = group.filter((n) => n !== name);
    const byName = new Map(result.people.map((p) => [p.name, p]));
    const durByName = new Map(dur.people.map((p) => [p.name, p]));
    const me = byName.get(name);
    const meDur = durByName.get(name);
    const info = staffList.find((s) => s.name === name) || {};
    const month = (n) => byName.get(n)?.month || emptyTally();
    const activeDays = (n) => [...(byName.get(n)?.days.values() || [])].filter((t) => t.total > 0).length;

    const myPoints = month(name).total;
    const groupPoints = group.map((n) => month(n).total);
    const myDays = activeDays(name);
    const groupDays = group.map(activeDays);
    const perDay = (n) => {
      const d = activeDays(n);
      return d ? month(n).total / d : null;
    };
    const groupPerDay = group.map(perDay).filter((v) => v != null);
    const points = {
      total: myPoints,
      auto: month(name).auto,
      qa: month(name).qa,
      manual: otherManual(month(name)),
      opinion: opinionPoints(month(name)),
      adjust: month(name).adjust || 0,
      stage: stageOf(myPoints),
      toNext: myPoints < STAGE_1 ? STAGE_1 - myPoints : myPoints < STAGE_2 ? STAGE_2 - myPoints : 0,
      nextLabel: myPoints < STAGE_1 ? '第一階段' : myPoints < STAGE_2 ? '第二階段' : '',
      avg: mean(groupPoints),
      max: groupPoints.length ? Math.max(...groupPoints) : 0,
      rank: rankAmong(myPoints, groupPoints, true),
      n: group.length,
      days: myDays,
      avgDays: mean(groupDays),
      perDay: perDay(name),
      avgPerDay: mean(groupPerDay)
    };

    const itemRow = (key, label, get) => {
      const mine = get(name);
      const all = group.map(get);
      const doers = all.filter((v) => v > 0);
      return {
        key,
        label,
        mine,
        avg: mean(all),
        doersAvg: mean(doers),
        doers: doers.length,
        rank: mine > 0 ? rankAmong(mine, doers, true) : null
      };
    };
    const items = [
      ...AUTO_ITEMS.map((i) => itemRow(i.key, i.label, (n) => month(n).counts[i.key] || 0)),
      itemRow('qa', '行政QA（點）', (n) => month(n).qa),
      ...OPINION_ITEMS.map((i) => itemRow(`op-${i.kind}`, i.label, (n) => month(n).manualCounts[i.key] || 0)),
      itemRow('manual', '人工計點（點）', (n) => otherManual(month(n)))
    ];

    const durPeers = group.map((n) => durByName.get(n)).filter(Boolean);
    const myRecords = meDur?.records || [];
    const longOf = (recs) => recs.filter((r) => r.sec >= LONG_SEC).length;
    const nodes = DURATION_NODES.map((n) => {
      const mine = meDur?.nodes[n.key] || { count: 0, avg: null };
      const base = dur.all.nodes[n.key];
      const recs = myRecords.filter((r) => r.node === n.key);
      const peerAvgs = durPeers.filter((p) => p.nodes[n.key].count).map((p) => p.nodes[n.key].avg);
      const otherAvgs = durPeers.filter((p) => p.name !== name && p.nodes[n.key].count).map((p) => p.nodes[n.key].avg);
      return {
        key: n.key,
        label: n.label,
        scored: SPEED_SCORE_NODES.has(n.key),
        count: mine.count,
        avg: mine.avg,
        base: base.avg,
        mid: median(peerAvgs),
        baseCount: base.count,
        diff: mine.avg != null && base.avg ? (mine.avg - base.avg) / base.avg : null,
        score: mine.count ? percentile(mine.avg, otherAvgs, false) : null,
        rank: mine.count ? rankAmong(mine.avg, peerAvgs, false) : null,
        n: peerAvgs.length,
        max: recs.length ? Math.max(...recs.map((r) => r.sec)) : null,
        min: recs.length ? Math.min(...recs.map((r) => r.sec)) : null,
        long: longOf(recs)
      };
    }).filter((n) => n.count || n.baseCount);
    const overallPeers = durPeers.filter((p) => p.count).map((p) => p.avg);
    const allRecords = dur.people.flatMap((p) => p.records);
    const actionCount = (recs) => {
      const m = {};
      for (const r of recs) m[r.action || '其他'] = (m[r.action || '其他'] || 0) + 1;
      return m;
    };
    const speed = {
      count: meDur?.count || 0,
      avg: meDur?.avg ?? null,
      base: dur.all.avg,
      diff: meDur?.avg != null && dur.all.avg ? (meDur.avg - dur.all.avg) / dur.all.avg : null,
      rank: meDur?.count ? rankAmong(meDur.avg, overallPeers, false) : null,
      n: overallPeers.length,
      long: longOf(myRecords),
      longRate: myRecords.length ? longOf(myRecords) / myRecords.length : null,
      baseLongRate: allRecords.length ? longOf(allRecords) / allRecords.length : null,
      actions: actionCount(myRecords),
      baseActions: actionCount(allRecords),
      slowest: myRecords.slice().sort((a, b) => b.sec - a.sec).slice(0, 5)
    };

    const sumFor = (list, n, f) => list.filter((x) => x.name === n).reduce((s, x) => s + (Number(x[f]) || 0), 0);
    const checks = opts.checks || [];
    const incidents = opts.incidents || [];
    const rateOf = (n) => {
      const c = sumFor(checks, n, 'checked');
      return c ? sumFor(checks, n, 'correct') / c : null;
    };
    const groupChecked = group.reduce((s, n) => s + sumFor(checks, n, 'checked'), 0);
    const groupCorrect = group.reduce((s, n) => s + sumFor(checks, n, 'correct'), 0);
    const rates = group.map(rateOf).filter((v) => v != null);
    const myRate = rateOf(name);
    const pens = incidents.filter((x) => x.name === name).map((x) => x.penalty);
    const quality = {
      checked: sumFor(checks, name, 'checked'),
      correct: sumFor(checks, name, 'correct'),
      rate: myRate,
      baseRate: groupChecked ? groupCorrect / groupChecked : null,
      rank: myRate != null ? rankAmong(myRate, rates, true) : null,
      n: rates.length,
      complaints: sumFor(incidents, name, 'complaints'),
      avgComplaints: mean(group.map((n) => sumFor(incidents, n, 'complaints'))),
      penalty: pens.includes('大過') ? '大過' : pens.includes('小過') ? '小過' : '無',
      incidents: incidents.filter((x) => x.name === name)
    };

    const weeks = (opts.weeks || []).map((w) => {
      const sumWeek = (n) => {
        let s = 0;
        for (const [d, t] of byName.get(n)?.days || []) if (d >= w.start && d <= w.end) s += t.total;
        return s;
      };
      return { ...w, mine: sumWeek(name), avg: mean(group.map(sumWeek)) };
    });

    const speedNodes = nodes.filter((n) => n.count);
    const scoredNodes = speedNodes.filter((n) => n.scored);
    const speedScore = scoredNodes.length ? mean(scoredNodes.map((n) => n.score)) : null;
    const scores = {
      points: percentile(myPoints, others.map((n) => month(n).total), true),
      speed: speedScore,
      quality: myRate == null ? null : Math.max(0, Math.min(100, ((myRate - 0.8) / 0.2) * 100)),
      conduct: Math.max(0, 100 - quality.complaints * 15 - (quality.penalty === '大過' ? 80 : quality.penalty === '小過' ? 40 : 0))
    };
    const score = overallScore(scores);

    const weak = [];
    const strong = [];
    const fmt = formatDuration;
    for (const n of scoredNodes) {
      if (n.count < MIN_SAMPLE || n.n < 3) continue;
      const s = Math.round(n.score);
      const place = `同節點第 ${n.rank}／${n.n} 名（${rankBand(n.rank, n.n)}）`;
      const vsMid = n.mid == null ? '' : n.avg > n.mid ? `，比同仁中位數 ${fmt(n.mid)} 慢 ${fmt(n.avg - n.mid)}` : n.avg < n.mid ? `，比同仁中位數 ${fmt(n.mid)} 快 ${fmt(n.mid - n.avg)}` : '，跟同仁中位數差不多';
      const where = `（${n.count} 件）`;
      if (n.score < 35) weak.push({ level: 'bad', area: '審核速度', gap: (50 - n.score) / 50, text: `${n.label}平均 ${fmt(n.avg)}${vsMid}，${place}，速度分 ${s}${where}` });
      else if (n.score < 50) weak.push({ level: 'warn', area: '審核速度', gap: (50 - n.score) / 50, text: `${n.label}平均 ${fmt(n.avg)}${vsMid}，${place}，比多數人慢一點${where}` });
      else if (n.score >= 75) strong.push({ area: '審核速度', gap: (n.score - 50) / 50, text: `${n.label}平均 ${fmt(n.avg)}${vsMid}，${place}，速度分 ${s}${where}` });
    }
    if (points.avg) {
      const d = (myPoints - points.avg) / points.avg;
      const where = `（第 ${points.rank}／${points.n} 名）`;
      if (d <= -0.15) weak.push({ level: 'bad', area: '點數產出', gap: -d, text: `月累積 ${myPoints} 點，比行政平均 ${points.avg.toFixed(1)} 點少 ${pctText(d)}${where}` });
      else if (d < 0) weak.push({ level: 'warn', area: '點數產出', gap: -d, text: `月累積 ${myPoints} 點，略低於行政平均 ${points.avg.toFixed(1)} 點${where}` });
      else if (d >= 0.15) strong.push({ area: '點數產出', gap: d, text: `月累積 ${myPoints} 點，比行政平均多 ${pctText(d)}${where}` });
    }
    if (points.avgDays && myDays < points.avgDays * 0.85) {
      weak.push({ level: 'warn', area: '點數產出', gap: 1 - myDays / points.avgDays, text: `有點數的天數 ${myDays} 天，行政平均 ${points.avgDays.toFixed(1)} 天` });
    }
    if (points.perDay != null && points.avgPerDay && points.perDay < points.avgPerDay * 0.85) {
      weak.push({ level: 'warn', area: '點數產出', gap: 1 - points.perDay / points.avgPerDay, text: `有上班的日子平均每天 ${points.perDay.toFixed(1)} 點，行政平均 ${points.avgPerDay.toFixed(1)} 點` });
    }
    for (const it of items) {
      if (it.mine < MIN_SAMPLE || !it.doersAvg || it.doers < 2) continue;
      const d = (it.mine - it.doersAvg) / it.doersAvg;
      if (d <= -0.15) weak.push({ level: 'warn', area: '點數產出', gap: -d, text: `${it.label} ${it.mine}，有做這項的 ${it.doers} 人平均 ${it.doersAvg.toFixed(1)}（第 ${it.rank}／${it.doers} 名）` });
      else if (d >= 0.15) strong.push({ area: '點數產出', gap: d, text: `${it.label} ${it.mine}，有做這項的人平均 ${it.doersAvg.toFixed(1)}（第 ${it.rank}／${it.doers} 名）` });
    }
    if (myRate != null) {
      if (myRate < 0.9) weak.push({ level: 'bad', area: '審件品質', gap: 0.9 - myRate + 1, text: `審件良率 ${(myRate * 100).toFixed(1)}%，低於 90%（抽查 ${quality.checked} 件、正確 ${quality.correct} 件）` });
      else if (quality.baseRate != null && myRate < quality.baseRate) weak.push({ level: 'warn', area: '審件品質', gap: quality.baseRate - myRate, text: `審件良率 ${(myRate * 100).toFixed(1)}%，低於行政整體 ${(quality.baseRate * 100).toFixed(1)}%` });
      else if (myRate === 1 && quality.checked >= MIN_SAMPLE) strong.push({ area: '審件品質', gap: 1, text: `抽查 ${quality.checked} 件全部正確` });
    }
    if (quality.complaints) weak.push({ level: 'bad', area: '客訴紀律', gap: 2, text: `本業績月客訴 ${quality.complaints} 件` });
    if (quality.penalty !== '無') weak.push({ level: 'bad', area: '客訴紀律', gap: 3, text: `本業績月有${quality.penalty}` });
    if (speed.long >= 2 && speed.baseLongRate != null && speed.longRate > speed.baseLongRate * 1.5) {
      weak.push({ level: 'warn', area: '審核速度', gap: speed.longRate, text: `超過 1 小時的審核 ${speed.long} 筆（占 ${(speed.longRate * 100).toFixed(1)}%，全體 ${(speed.baseLongRate * 100).toFixed(1)}%），多半是開著案件沒有馬上送出` });
    }
    const levelOrder = { bad: 0, warn: 1 };
    weak.sort((a, b) => levelOrder[a.level] - levelOrder[b.level] || b.gap - a.gap);
    strong.sort((a, b) => b.gap - a.gap);

    const skills = SKILL_NODES.map((sk) => {
      const it = items.find((x) => x.key === sk.key);
      const nd = nodes.find((x) => x.key === sk.key);
      return {
        key: sk.key,
        label: sk.label,
        count: it.mine,
        reviews: nd?.count || 0,
        avg: nd?.avg ?? null,
        diff: nd?.diff ?? null,
        speedScore: nd?.score ?? null,
        speedRank: nd?.rank ?? null,
        speedN: nd?.n ?? 0,
        rank: it.rank,
        doers: it.doers
      };
    });
    const training = TRAINING_NODES.map((tn) =>
      tn.general
        ? { key: tn.key, label: tn.label, general: true, week: tn.week, project: tn.project }
        : { ...skills.find((s) => s.key === tn.key), week: tn.week, project: tn.project }
    );

    return {
      name,
      info,
      inGroup: peerNames.includes(name),
      group,
      groupSize: group.length,
      skills,
      training,
      score,
      ...gradeOf(score),
      scores,
      dims: SCORE_DIMS,
      weights: scoreWeights(scores),
      points,
      items,
      nodes,
      speed,
      quality,
      weeks,
      weak,
      strong
    };
  }

  /** 地區承接率：案件依地址縣市分區；房客審核沒有地址，改用房客管理查到的縣市 */
  const TAKEUP_ITEMS = [
    { key: 'obj', label: '物審' },
    { key: 'tenant', label: '房審' },
    { key: 'pre', label: '預審' },
    { key: 'rev', label: '複審' },
    { key: 'p4', label: '四期產編' },
    { key: 'p5', label: '五期產編' },
    { key: 'repair', label: '修繕' },
    { key: 'lvr', label: '實價登錄' }
  ];
  const TAKEUP_AREAS = [
    { name: '北區', regions: [['大台北', ['台北市', '新北市', '基隆市']], ['桃園', ['桃園市']], ['宜蘭', ['宜蘭縣']], ['新竹', ['新竹市', '新竹縣']], ['苗栗', ['苗栗縣']]] },
    { name: '中區', regions: [['台中', ['台中市']], ['彰化', ['彰化縣']], ['南投', ['南投縣']], ['雲林', ['雲林縣']]] },
    { name: '南區', regions: [['嘉義', ['嘉義市', '嘉義縣']], ['台南', ['台南市']], ['高雄', ['高雄市']], ['屏東', ['屏東縣']]] },
    { name: '東部及離島', regions: [['花蓮', ['花蓮縣']], ['台東', ['台東縣']], ['澎湖', ['澎湖縣']], ['金門', ['金門縣']], ['連江', ['連江縣']]] }
  ];
  const TAKEUP_REGION_OF_CITY = new Map(TAKEUP_AREAS.flatMap((a) => a.regions.flatMap(([r, cities]) => cities.map((c) => [c, r]))));
  /** 人力明細部別分成台北／新北／基隆時，歸到承接率的「大台北」 */
  const STAFF_REGION_GROUP = { 台北: '大台北', 新北: '大台北', 基隆: '大台北' };
  const takeupRegionOfStaff = (region) => STAFF_REGION_GROUP[region] || region;

  /** 個人明細誰能看誰：預設只看自己；以下名單可看全部或整區（依人力明細的部別） */
  const VIEW_ALL = new Set(['簡為倢', '邱奕棋', '黃怡婷']);
  const VIEW_AREA = new Map([
    ['侯思廷', '北區'],
    ['李芷琳', '南區']
  ]);

  function areaOfRegion(region) {
    const r0 = takeupRegionOfStaff(region);
    return TAKEUP_AREAS.find((a) => a.regions.some(([r]) => r === r0))?.name || '';
  }

  function isSupervisor(name) {
    return VIEW_ALL.has(String(name || '').trim());
  }

  function canViewPerson(viewer, target, staff) {
    const me = String(viewer || '').trim();
    const who = String(target || '').trim();
    if (!me || !who) return false;
    if (me === who || VIEW_ALL.has(me)) return true;
    const area = VIEW_AREA.get(me);
    if (!area) return false;
    const s = (staff || []).find((x) => x.name === who);
    return !!s && areaOfRegion(s.region) === area;
  }

  /** 小組長抽查：VIEW_ALL 可抽每一組；VIEW_AREA 的人只能抽自己那組（與 Supabase admin_points_spot_draw_save 一致） */
  function spotLeadersFor(viewer, leaders) {
    const me = String(viewer || '').trim();
    if (VIEW_ALL.has(me)) return leaders.slice();
    return VIEW_AREA.has(me) ? leaders.filter((l) => l === me) : [];
  }

  function canSpotCheck(viewer) {
    const me = String(viewer || '').trim();
    return VIEW_ALL.has(me) || VIEW_AREA.has(me);
  }

  /** 各組長管的區（北中南）：依組員（在職、非工讀生）的部別推算；部別與縣市再補上該區 KPI 地區（例：中區沒有南投組員也算南投） */
  function leaderScopes(staff) {
    const areaOf = new Map(TAKEUP_AREAS.flatMap((a) => a.regions.map(([r, cities]) => [r, { area: a.name, cities }])));
    const areaRank = (a) => {
      const i = TAKEUP_AREAS.findIndex((x) => x.name === a);
      return i < 0 ? 99 : i;
    };
    const map = new Map();
    for (const s of staff || []) {
      if (!s.leader || s.status !== '在職' || s.kind === '工讀生') continue;
      if (!map.has(s.leader)) map.set(s.leader, { leader: s.leader, members: 0, regions: new Set() });
      const g = map.get(s.leader);
      g.members += 1;
      if (s.region) g.regions.add(s.region);
    }
    return [...map.values()]
      .map((g) => {
        const staffRegions = [...g.regions];
        const known = staffRegions.map((r) => areaOf.get(takeupRegionOfStaff(r))).filter(Boolean);
        const areas = [...new Set(known.map((k) => k.area))].sort((a, b) => areaRank(a) - areaRank(b));
        const kpiRegions = kpiRegionsOfAreas(areas);
        const regions = [...new Set([...staffRegions, ...kpiRegions])].sort((a, b) => regionRank(a) - regionRank(b));
        const staffCities = new Set(known.flatMap((k) => k.cities));
        const cities = TAKEUP_AREAS.filter((a) => areas.includes(a.name))
          .flatMap((a) => a.regions.flatMap(([, list]) => list))
          .filter((c) => staffCities.has(c) || kpiRegions.includes(kpiRegionOfCity(c)))
          .map((c, i) => [c, KPI_REGIONS.indexOf(kpiRegionOfCity(c)), i])
          .sort((a, b) => (a[1] < 0 ? 99 : a[1]) - (b[1] < 0 ? 99 : b[1]) || a[2] - b[2])
          .map(([c]) => c);
        return { leader: g.leader, members: g.members, regions, areas, cities };
      })
      .sort((a, b) => areaRank(a.areas[0]) - areaRank(b.areas[0]) || a.leader.localeCompare(b.leader, 'zh-Hant'));
  }

  /** 承接率週別：業績月第一天起算，每週到星期五為止（週六～週五） */
  function takeupWeeks(range) {
    const out = [];
    for (let s = range.start; s <= range.end; ) {
      const d = new Date(s + 'T00:00:00');
      const e = addDays(s, (5 - d.getDay() + 7) % 7);
      const end = e < range.end ? e : range.end;
      out.push({ start: s, end });
      s = addDays(end, 1);
    }
    return out;
  }

  /**
   * 各地區行政承接率：行＝人力明細上的人（含已離職、工讀生）審核，非＝其他人審核。
   * 案件判定、去重與點數表相同；解約不列入。
   * 每筆另計入「全區」（含分不到地區的案件）。
   * @param opts { start, end, staff, expenses, tenantCities: Map(房客 targetId → 縣市), regionOf?: 縣市 → 地區 }
   */
  function takeupReport(auditRows, opts) {
    const tenantCities = opts.tenantCities || new Map();
    const regionOf = opts.regionOf || ((city) => TAKEUP_REGION_OF_CITY.get(city));
    const staff = (opts.staff || []).map((s) => ({ ...s, status: '在職' }));
    const res = compute(auditRows, { start: opts.start, end: opts.end, staff, manual: [], expenses: opts.expenses || [], terminations: [] });
    const weeks = takeupWeeks(opts);
    const items = new Set(TAKEUP_ITEMS.map((i) => i.key));
    const cells = new Map();
    const outsiders = new Map();
    const unplaced = { tenant: 0, noAddress: 0 };
    const cell = (k) => {
      if (!cells.has(k)) cells.set(k, { local: 0, other: 0 });
      return cells.get(k);
    };
    for (const p of res.people) {
      const local = p.group === '行政';
      for (const r of p.records) {
        if (!items.has(r.item)) continue;
        const city = r.item === 'tenant' ? tenantCities.get(String(r.targetId)) || '' : cityOf(r.name);
        const region = regionOf(city);
        const w = weeks.findIndex((x) => r.date >= x.start && r.date <= x.end);
        const add = (g) => {
          for (const col of [w, 'all']) {
            for (const item of [r.item, 'total']) cell(`${g}|${item}|${col}`)[local ? 'local' : 'other'] += 1;
          }
        };
        add('全區');
        if (!region) {
          unplaced[r.item === 'tenant' ? 'tenant' : 'noAddress'] += 1;
          continue;
        }
        add(region);
        if (!local) {
          if (!outsiders.has(region)) outsiders.set(region, new Map());
          const m = outsiders.get(region);
          m.set(p.name, (m.get(p.name) || 0) + 1);
        }
      }
    }
    const get = (region, item, col) => {
      const c = cells.get(`${region}|${item}|${col}`);
      if (!c) return null;
      const total = c.local + c.other;
      return { local: c.local, other: c.other, total, rate: total ? c.local / total : null };
    };
    const areas = TAKEUP_AREAS.map((a) => ({
      name: a.name,
      regions: a.regions.map(([r]) => r).filter((r) => cells.has(`${r}|total|all`))
    })).filter((a) => a.regions.length);
    return {
      weeks,
      areas,
      items: TAKEUP_ITEMS,
      get,
      unplaced,
      outsiders: new Map([...outsiders].map(([r, m]) => [r, [...m.entries()].sort((a, b) => b[1] - a[1])]))
    };
  }

  /**
   * 房客審核者地區：房審沒有地址，依房客管理查到的縣市分區；列出每位審核人的房審落在哪些地區。
   * @param opts { start, end, staff, tenantCities: Map(房客 targetId → 縣市) }
   */
  function tenantReviewerReport(auditRows, opts) {
    const tenantCities = opts.tenantCities || new Map();
    const staffNames = new Set((opts.staff || []).map((s) => s.name));
    const staff = (opts.staff || []).map((s) => ({ ...s, status: '在職' }));
    const res = compute(auditRows, { start: opts.start, end: opts.end, staff, manual: [], expenses: [], terminations: [] });
    const rows = [];
    for (const p of res.people) {
      const recs = p.records.filter((r) => r.item === 'tenant');
      if (!recs.length) continue;
      const regions = new Map();
      let unknown = 0;
      for (const r of recs) {
        const region = TAKEUP_REGION_OF_CITY.get(tenantCities.get(String(r.targetId)) || '');
        if (!region) unknown += 1;
        else regions.set(region, (regions.get(region) || 0) + 1);
      }
      const list = [...regions.entries()].sort((a, b) => b[1] - a[1] || regionRank(a[0]) - regionRank(b[0]));
      rows.push({ name: p.name, isStaff: staffNames.has(p.name), total: recs.length, regions: list, main: list[0]?.[0] || '', unknown });
    }
    rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'zh-Hant'));
    return { rows, total: rows.reduce((s, r) => s + r.total, 0), unknown: rows.reduce((s, r) => s + r.unknown, 0) };
  }

  /** 行政每週進度：北中南三區，正職在職行政每週的累積點數（業績月第一天起）與當週抽查良率 */
  const PROGRESS_AREAS = ['北區', '中區', '南區'];
  function weeklyProgress(result, opts) {
    const byName = new Map(result.people.map((p) => [p.name, p]));
    const weeks = opts.weeks || [];
    const asOf = opts.asOf || result.end;
    const rows = (opts.staff || [])
      .filter((s) => isOnDuty(s) && s.kind !== '工讀生')
      .map((s) => {
        const p = byName.get(s.name);
        const cells = weeks.map((w) => {
          if (w.start > asOf) return null;
          const end = w.end < asOf ? w.end : asOf;
          let points = 0;
          if (p) for (const [d, t] of p.days) if (d <= end) points += t.total;
          let checked = 0;
          let correct = 0;
          for (const c of opts.checks || []) {
            if (c.name !== s.name || c.date < w.start || c.date > end) continue;
            checked += Number(c.checked) || 0;
            correct += Number(c.correct) || 0;
          }
          return { points, checked, correct, rate: checked ? correct / checked : null };
        });
        const last = cells.filter(Boolean).pop();
        const points = last ? last.points : 0;
        return {
          name: s.name,
          area: areaOfRegion(s.region) || '其他',
          region: s.region || '',
          hire: rocYearMonth(s.hireDate),
          project: s.project || '',
          points,
          stageLabel: stageLabel(stageOf(points)),
          weeks: cells
        };
      });
    const byPoints = (a, b) => b.points - a.points || a.name.localeCompare(b.name, 'zh-Hant');
    const names = [...PROGRESS_AREAS, ...new Set(rows.map((r) => r.area).filter((a) => !PROGRESS_AREAS.includes(a)))];
    const areas = names
      .map((name) => ({ name, rows: rows.filter((r) => r.area === name).sort((a, b) => regionRank(a.region) - regionRank(b.region) || byPoints(a, b)) }))
      .filter((a) => a.rows.length);
    return { weeks, asOf, areas, total: rows.length };
  }

  /** 系統作業效率：七個作業節點的完成次數、行政占比、耗時中位數與時間分布（耗時排除 0 秒） */
  const EFFICIENCY_NODES = DURATION_NODES.filter((n) => n.key !== 'px');
  function efficiencyReport(auditRows, opts) {
    const admin = new Set((opts.staff || []).flatMap((s) => [s.name, s.leader]).filter(Boolean));
    const seen = new Set();
    const nodes = new Map(EFFICIENCY_NODES.map((n) => [n.key, { key: n.key, label: n.label, count: 0, secs: [] }]));
    const out = { start: opts.start, end: opts.end, total: 0, local: 0, other: 0, zero: 0, under10: 0, timed: 0, lastTime: '' };
    for (const r of auditRows) {
      if (r.date < opts.start || r.date > opts.end) continue;
      if (r.id != null) {
        const k = `${r.type}|${r.id}`;
        if (seen.has(k)) continue;
        seen.add(k);
      }
      const n = nodes.get(durationNode(r));
      if (!n) continue;
      out.total += 1;
      n.count += 1;
      if (admin.has(String(r.auditor || '').trim())) out.local += 1;
      else out.other += 1;
      if (r.time && r.time > out.lastTime) out.lastTime = r.time;
      const sec = r.duration == null || r.duration === '' ? NaN : Number(r.duration);
      if (!Number.isFinite(sec) || sec < 0) continue;
      if (sec === 0) {
        out.zero += 1;
        continue;
      }
      if (sec < 10) out.under10 += 1;
      n.secs.push(sec);
    }
    out.nodes = [...nodes.values()].map((n) => {
      const t = n.secs.length;
      const share = (f) => (t ? n.secs.filter(f).length / t : null);
      return {
        key: n.key,
        label: n.label,
        count: n.count,
        timed: t,
        median: median(n.secs),
        under5: share((s) => s < 300),
        mid: share((s) => s >= 300 && s < 1800),
        over30: share((s) => s >= 1800)
      };
    });
    out.timed = out.nodes.reduce((s, n) => s + n.timed, 0);
    out.localRate = out.total ? out.local / out.total : null;
    return out;
  }

  function formatDuration(sec) {
    if (sec == null || !Number.isFinite(sec)) return '';
    const s = Math.round(sec);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (h) return `${h} 時 ${m} 分`;
    if (m) return `${m} 分 ${r} 秒`;
    return `${r} 秒`;
  }

  return {
    AUTO_ITEMS,
    SKILL_NODES,
    TRAINING_NODES,
    TRAINING_WEEKS,
    TRAINING_PROJECTS,
    VIDEO_COURSES,
    PRACTICE_COURSES,
    TRAINING_TESTERS,
    isOnDuty,
    trainingState,
    courseScores,
    DURATION_NODES,
    durationNode,
    durationReport,
    personProfile,
    scoreWeights,
    overallScore,
    reviewScoreOf,
    formatDuration,
    rankBand,
    cityOf,
    KPI_REGIONS,
    kpiRegionOfCaseNo,
    kpiRegionOfCity,
    kpiErrRate,
    kpiQuality,
    OPINION_CATEGORIES,
    kpiRegionOfStaff,
    kpiRegionsOfAreas,
    kpiStageReport,
    cityRank,
    regionRank,
    leaderScopes,
    canViewPerson,
    isSupervisor,
    canSpotCheck,
    spotLeadersFor,
    weeksOf,
    takeupWeeks,
    takeupReport,
    tenantReviewerReport,
    PROGRESS_AREAS,
    weeklyProgress,
    EFFICIENCY_NODES,
    efficiencyReport,
    areaOfRegion,
    weeklyReport,
    estimateBonus,
    eligibleAt,
    stageLabel,
    rocYearMonth,
    monthlyReport,
    MANUAL_ITEMS,
    OPINION_ITEMS,
    otherManual,
    opinionPoints,
    STAGE_1,
    STAGE_2,
    contractPeriod,
    classify,
    rowsFromPayload,
    perfMonthRange,
    perfMonthOf,
    FIRST_PERF_MONTH,
    beforeFirstPerf,
    stageOf,
    sheetTotals,
    isExcludedStaff,
    stripExcluded,
    dropExcludedRows,
    compute,
    isoDate
  };
});
