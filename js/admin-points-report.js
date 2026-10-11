/**
 * 行政績效月報／週報（給主管看）：計算＋輸出 HTML、Excel、文字摘要；瀏覽器與 node 共用
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./admin-points-core.js'));
  else root.AdminPointsReport = factory(root.AdminPointsCore);
})(typeof self !== 'undefined' ? self : this, function (Core) {
  /** 速度比較只看通識節點；實價登錄是專案，件數多又只有少數人做 */
  const CMP_NODES = Core.DURATION_NODES.filter((n) => n.key !== 'lvr');
  const CMP_MIN = 5;
  const LONG_SEC = 3600;
  const fmtDur = Core.formatDuration;

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
  const md = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
  const rocDate = (iso) => `${Number(iso.slice(0, 4)) - 1911}/${md(iso)}`;
  const pctText = (v, digits = 1) => (v == null ? '—' : `${(v * 100).toFixed(digits)}%`);
  const num = (v) => (v == null ? '—' : Number.isInteger(v) ? String(v) : v.toFixed(1));

  function change(cur, prev) {
    return cur != null && prev ? (cur - prev) / prev : null;
  }

  function durAgg(records) {
    const recs = records.filter((r) => CMP_NODES.some((n) => n.key === r.node));
    const out = { count: recs.length, sec: 0, long: 0, avg: null, median: null, nodes: {} };
    for (const n of CMP_NODES) out.nodes[n.key] = { count: 0, sec: 0, avg: null };
    for (const r of recs) {
      out.sec += r.sec;
      if (r.sec >= LONG_SEC) out.long += 1;
      out.nodes[r.node].count += 1;
      out.nodes[r.node].sec += r.sec;
    }
    out.avg = out.count ? out.sec / out.count : null;
    if (out.count) {
      const s = recs.map((r) => r.sec).sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      out.median = s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }
    for (const n of Object.values(out.nodes)) n.avg = n.count ? n.sec / n.count : null;
    return out;
  }

  /**
   * 同一人兩期做的節點組合可能不同，直接比平均會失真：
   * 用本期各節點件數當權重，算「上期用同樣組合要花多久」，再跟本期實際比。負數＝變快。
   */
  function mixChange(cur, prev) {
    let actual = 0;
    let expected = 0;
    let n = 0;
    for (const node of CMP_NODES) {
      const c = cur.nodes[node.key];
      const p = prev.nodes[node.key];
      if (!c.count || !p.count) continue;
      actual += c.sec;
      expected += c.count * p.avg;
      n += c.count;
    }
    return n >= CMP_MIN && expected ? (actual - expected) / expected : null;
  }

  function uniqById(list) {
    const m = new Map();
    for (const x of list) m.set(x.id ?? `${x.date}|${x.name}|${x.note}`, x);
    return [...m.values()];
  }

  function worstPenalty(list) {
    const p = list.map((x) => x.penalty);
    return p.includes('大過') ? '大過' : p.includes('小過') ? '小過' : '無';
  }

  /**
   * @param o {
   *   type: 'month' | 'week',
   *   title, periodLabel, prevLabel,
   *   period: { start, end }, prev: { start, end },
   *   cur: { range, result, auditRows, sb }, before: { range, result, auditRows, sb }  // 本業績月與上個業績月
   *   asOf
   * }
   */
  function build(o) {
    const isMonth = o.type === 'month';
    const sb = o.cur.sb || {};
    const allStaff = sb.staff || [];
    const staff = allStaff.filter((s) => s.status === '在職' && s.kind !== '工讀生');
    const rows = uniqById([...(o.cur.auditRows || []), ...(o.before.auditRows || [])]);
    const durOf = (p) => Core.durationReport(rows, { start: p.start, end: p.end, staff: allStaff });
    const dCur = durOf(o.period);
    const dPrev = durOf(o.prev);
    const recs = (dur, name) => dur.people.find((p) => p.name === name)?.records || [];
    const inP = (p) => (x) => x.date >= p.start && x.date <= p.end;
    const checks = uniqById([...(sb.checks || []), ...(o.before.sb?.checks || [])]);
    const incidents = uniqById([...(sb.incidents || []), ...(o.before.sb?.incidents || [])]);
    const byName = (result) => new Map((result?.people || []).map((p) => [p.name, p]));
    const curPeople = byName(o.cur.result);
    const prevPeople = byName(o.before.result);
    const daySum = (name, p) => {
      let s = 0;
      for (const m of [curPeople, prevPeople]) for (const [d, t] of m.get(name)?.days || []) if (d >= p.start && d <= p.end) s += t.total;
      return s;
    };
    const pointsOf = (name, which) => {
      if (isMonth) return (which === 'cur' ? curPeople : prevPeople).get(name)?.month.total || 0;
      return daySum(name, which === 'cur' ? o.period : o.prev);
    };

    let profiles = new Map();
    if (isMonth) {
      const dMonth = Core.durationReport(o.cur.auditRows || [], { start: o.cur.range.start, end: o.cur.range.end, staff: allStaff });
      for (const s of staff) {
        profiles.set(s.name, Core.personProfile(o.cur.result, dMonth, { name: s.name, staff: allStaff, checks: sb.checks || [], incidents: sb.incidents || [], weeks: [] }));
      }
    }

    const people = staff.map((s) => {
      const aCur = durAgg(recs(dCur, s.name));
      const aPrev = durAgg(recs(dPrev, s.name));
      const ck = checks.filter((c) => c.name === s.name && inP(o.period)(c));
      const ckPrev = checks.filter((c) => c.name === s.name && inP(o.prev)(c));
      const inc = incidents.filter((x) => x.name === s.name && inP(o.period)(x));
      const checked = ck.reduce((t, c) => t + (Number(c.checked) || 0), 0);
      const correct = ck.reduce((t, c) => t + (Number(c.correct) || 0), 0);
      const monthPoints = curPeople.get(s.name)?.month.total || 0;
      const pf = profiles.get(s.name);
      return {
        name: s.name,
        leader: s.leader || '',
        region: s.region || '',
        office: s.office || '',
        project: s.project || '',
        points: pointsOf(s.name, 'cur'),
        prevPoints: pointsOf(s.name, 'prev'),
        monthPoints,
        stageLabel: Core.stageLabel(Core.stageOf(monthPoints)),
        toNext: monthPoints < Core.STAGE_1 ? Core.STAGE_1 - monthPoints : monthPoints < Core.STAGE_2 ? Core.STAGE_2 - monthPoints : 0,
        grade: pf ? pf.grade : '',
        score: pf?.score ?? null,
        dur: aCur,
        durPrev: aPrev,
        durChange: mixChange(aCur, aPrev),
        checked,
        correct,
        rate: checked ? correct / checked : null,
        prevChecked: ckPrev.reduce((t, c) => t + (Number(c.checked) || 0), 0),
        prevCorrect: ckPrev.reduce((t, c) => t + (Number(c.correct) || 0), 0),
        complaints: inc.reduce((t, x) => t + (Number(x.complaints) || 0), 0),
        penalty: worstPenalty(inc)
      };
    });
    people.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'zh-Hant'));
    people.forEach((p, i) => {
      p.rank = i > 0 && people[i - 1].points === p.points ? people[i - 1].rank : i + 1;
    });

    const totalOf = (list, label) => {
      const cur = durAgg(list.flatMap((p) => recs(dCur, p.name)));
      const prev = durAgg(list.flatMap((p) => recs(dPrev, p.name)));
      const sum = (f) => list.reduce((t, p) => t + (p[f] || 0), 0);
      const n = list.length;
      const checked = sum('checked');
      const prevChecked = sum('prevChecked');
      const prevComplaints = incidents.filter((x) => inP(o.prev)(x) && list.some((p) => p.name === x.name)).reduce((t, x) => t + (Number(x.complaints) || 0), 0);
      return {
        label,
        n,
        points: sum('points'),
        prevPoints: sum('prevPoints'),
        perHead: n ? sum('points') / n : null,
        prevPerHead: n ? sum('prevPoints') / n : null,
        dur: cur,
        durPrev: prev,
        durChange: change(cur.avg, prev.avg),
        checked,
        correct: sum('correct'),
        rate: checked ? sum('correct') / checked : null,
        prevRate: prevChecked ? sum('prevCorrect') / prevChecked : null,
        complaints: sum('complaints'),
        prevComplaints,
        stageUp: list.filter((p) => p.monthPoints >= Core.STAGE_1).length,
        prevStageUp: list.filter((p) => (prevPeople.get(p.name)?.month.total || 0) >= Core.STAGE_1).length
      };
    };
    const total = totalOf(people, '全體行政');
    const leaders = [...new Set(people.map((p) => p.leader).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    const groups = leaders.map((l) => totalOf(people.filter((p) => p.leader === l), l));
    const noLeader = people.filter((p) => !p.leader);
    if (noLeader.length) groups.push(totalOf(noLeader, '未分組'));

    const kpis = [
      { key: 'points', label: isMonth ? '總點數' : '本週總點數', cur: total.points, prev: total.prevPoints, fmt: num, better: 'up' },
      { key: 'perHead', label: '人均點數', cur: total.perHead, prev: total.prevPerHead, fmt: num, better: 'up' },
      ...(isMonth ? [{ key: 'stage', label: `達 ${Core.STAGE_1} 點人數`, cur: total.stageUp, prev: total.prevStageUp, fmt: num, better: 'up' }] : []),
      { key: 'count', label: '審核件數', cur: total.dur.count, prev: total.durPrev.count, fmt: num, better: null },
      { key: 'avg', label: '平均審一件', cur: total.dur.avg, prev: total.durPrev.avg, fmt: fmtDur, better: 'down' },
      { key: 'median', label: '中位數', cur: total.dur.median, prev: total.durPrev.median, fmt: fmtDur, better: 'down' },
      { key: 'long', label: '超過 1 小時比例', cur: total.dur.count ? total.dur.long / total.dur.count : null, prev: total.durPrev.count ? total.durPrev.long / total.durPrev.count : null, fmt: (v) => pctText(v), better: 'down' },
      { key: 'rate', label: '審件良率', cur: total.rate, prev: total.prevRate, fmt: (v) => pctText(v), better: 'up', note: `抽查 ${total.checked} 件` },
      { key: 'complaints', label: '客訴件數', cur: total.complaints, prev: total.prevComplaints, fmt: num, better: 'down' }
    ];
    for (const k of kpis) k.change = k.key === 'rate' || k.key === 'long' ? (k.cur != null && k.prev != null ? k.cur - k.prev : null) : change(k.cur, k.prev);

    const nodes = CMP_NODES.map((n) => ({
      key: n.key,
      label: n.label,
      cur: total.dur.nodes[n.key],
      prev: total.durPrev.nodes[n.key],
      change: change(total.dur.nodes[n.key].avg, total.durPrev.nodes[n.key].avg)
    })).filter((n) => n.cur.count || n.prev.count);

    const fails = checks
      .filter((c) => inP(o.period)(c) && (Number(c.correct) || 0) < (Number(c.checked) || 0) && people.some((p) => p.name === c.name))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map((c) => ({ date: c.date, name: c.name, note: String(c.note || '').replace(/^小組長抽查｜/, ''), by: c.createdBy || '' }));
    const incidentList = incidents
      .filter((x) => inP(o.period)(x) && people.some((p) => p.name === x.name) && ((Number(x.complaints) || 0) > 0 || (x.penalty && x.penalty !== '無')))
      .map((x) => ({ date: x.date, name: x.name, complaints: Number(x.complaints) || 0, penalty: x.penalty || '無', note: x.note || '' }));

    const rated = people.filter((p) => p.durChange != null);
    const improved = rated.filter((p) => p.durChange <= -0.05).sort((a, b) => a.durChange - b.durChange);
    const declined = rated.filter((p) => p.durChange >= 0.1).sort((a, b) => b.durChange - a.durChange);
    const watch = [];
    for (const p of people) {
      const why = [];
      if (p.grade === 'D') why.push('綜合評等 D');
      if (p.rate != null && p.rate < 0.9) why.push(`良率 ${pctText(p.rate)}`);
      if (p.complaints) why.push(`客訴 ${p.complaints} 件`);
      if (p.penalty !== '無') why.push(p.penalty);
      if (p.durChange != null && p.durChange >= 0.3) why.push(`審核變慢 ${Math.round(p.durChange * 100)}%`);
      if (why.length) watch.push({ name: p.name, leader: p.leader, why });
    }
    const grades = isMonth
      ? ['A', 'B', 'C', 'D', '-'].map((g) => ({ grade: g, names: people.filter((p) => p.grade === g).map((p) => p.name) }))
      : [];

    const rep = {
      type: o.type,
      title: o.title,
      periodLabel: o.periodLabel,
      prevLabel: o.prevLabel,
      period: o.period,
      prev: o.prev,
      asOf: o.asOf,
      total,
      kpis,
      nodes,
      groups,
      people,
      improved,
      declined,
      watch,
      fails,
      incidents: incidentList,
      grades
    };
    rep.bullets = bullets(rep);
    return rep;
  }

  function changeWord(ch, better, pct = true) {
    if (ch == null) return '';
    const v = pct ? Math.round(Math.abs(ch) * 100) : Math.round(Math.abs(ch) * 1000) / 10;
    if (v < (pct ? 1 : 0.1)) return '持平';
    const unit = pct ? '%' : ' 個百分點';
    if (better === 'down') return ch < 0 ? `改善 ${v}${unit}` : `退步 ${v}${unit}`;
    if (better === 'up') return ch > 0 ? `成長 ${v}${unit}` : `下滑 ${v}${unit}`;
    return ch > 0 ? `增加 ${v}${unit}` : `減少 ${v}${unit}`;
  }

  function bullets(rep) {
    const t = rep.total;
    const k = Object.fromEntries(rep.kpis.map((x) => [x.key, x]));
    const out = [];
    out.push(`${rep.periodLabel}行政 ${t.n} 人，總點數 ${t.points} 點（人均 ${num(t.perHead)}），比${rep.prevLabel}${changeWord(k.points.change, 'up') || '—'}。`);
    if (t.dur.avg != null) {
      const faster = rep.nodes.filter((n) => n.change != null && n.change <= -0.01).map((n) => n.label);
      const slower = rep.nodes.filter((n) => n.change != null && n.change >= 0.01).map((n) => n.label);
      const how = t.durPrev.avg ? `，比${rep.prevLabel}${t.dur.avg <= t.durPrev.avg ? '快' : '慢'} ${fmtDur(Math.abs(t.dur.avg - t.durPrev.avg))}（${changeWord(k.avg.change, 'down')}）` : '';
      out.push(`審核 ${t.dur.count} 件，平均審一件 ${fmtDur(t.dur.avg)}${how}。${faster.length ? `變快：${faster.join('、')}。` : ''}${slower.length ? `變慢：${slower.join('、')}。` : ''}`);
    }
    out.push(t.checked ? `抽查 ${t.checked} 件、正確 ${t.correct} 件，審件良率 ${pctText(t.rate)}${rep.fails.length ? `；未通過 ${rep.fails.length} 件（明細見下表）` : '，全部通過'}。` : '本期尚無審件抽查紀錄。');
    out.push(t.complaints || rep.incidents.length ? `客訴 ${t.complaints} 件${rep.incidents.some((x) => x.penalty !== '無') ? `，懲處：${rep.incidents.filter((x) => x.penalty !== '無').map((x) => `${x.name}${x.penalty}`).join('、')}` : ''}。` : '本期無客訴、無懲處。');
    if (rep.improved.length) out.push(`審核速度進步最多：${rep.improved.slice(0, 3).map((p) => `${p.name}（快 ${Math.round(-p.durChange * 100)}%）`).join('、')}。`);
    if (rep.declined.length) out.push(`審核速度退步較多：${rep.declined.slice(0, 3).map((p) => `${p.name}（慢 ${Math.round(p.durChange * 100)}%）`).join('、')}。`);
    const top = rep.people.filter((p) => p.points > 0).slice(0, 3);
    if (top.length) out.push(`點數前三：${top.map((p) => `${p.name} ${p.points} 點`).join('、')}。`);
    if (rep.grades.length) {
      const d = rep.grades.find((g) => g.grade === 'D');
      out.push(`綜合評等：${rep.grades.filter((g) => g.grade !== '-' && g.names.length).map((g) => `${g.grade} ${g.names.length} 人`).join('、') || '—'}${d?.names.length ? `；D 級（需改善計畫）：${d.names.join('、')}` : ''}。`);
    }
    if (rep.watch.length) out.push(`需關注：${rep.watch.map((w) => `${w.name}（${w.why.join('、')}）`).join('；')}。`);
    return out;
  }

  /* ---------- HTML ---------- */

  function tone(ch, better) {
    if (ch == null || !better) return '';
    if (Math.abs(ch) < 0.005) return 'is-even';
    return (better === 'down' ? ch < 0 : ch > 0) ? 'is-good' : 'is-bad';
  }

  function kpiTag(k) {
    if (k.change == null) return '<em class="br-tag">—</em>';
    const pp = k.key === 'rate' || k.key === 'long';
    const word = changeWord(k.change, k.better || null, !pp);
    const arrow = k.change > 0 ? '▲' : k.change < 0 ? '▼' : '';
    return `<em class="br-tag ${tone(k.change, k.better)}">${word === '持平' ? '持平' : `${arrow} ${esc(word)}`}</em>`;
  }

  function nodeBars(rep) {
    if (!rep.nodes.length) return '<p class="br-muted">兩期都沒有審核紀錄</p>';
    const max = Math.max(...rep.nodes.flatMap((n) => [n.cur.avg || 0, n.prev.avg || 0])) || 1;
    const w = (v) => `${Math.max(1.5, (v / max) * 100)}%`;
    return `<div class="br-nodes">${rep.nodes
      .map((n) => {
        const t = tone(n.change, 'down') || 'is-even';
        const verdict =
          n.change == null
            ? '只有一期有資料'
            : Math.abs(n.change) < 0.01
              ? '持平'
              : `${n.change < 0 ? '快了' : '慢了'} ${fmtDur(Math.abs(n.cur.avg - n.prev.avg))}（${Math.round(Math.abs(n.change) * 100)}%）`;
        const line = (label, a, cls) => `<div class="br-nline"><span>${esc(label)}</span><span class="br-ntrack">${a.avg != null ? `<i class="${cls}" style="width:${w(a.avg)}"></i>` : ''}</span><span class="br-nval"><b>${a.avg != null ? esc(fmtDur(a.avg)) : '—'}</b><small>${a.count} 件</small></span></div>`;
        return `<div class="br-node"><div class="br-nhead"><b>${esc(n.label)}</b><em class="${t}">${esc(verdict)}</em></div>${line(rep.prevLabel, n.prev, 'is-prev')}${line(rep.periodLabel, n.cur, t)}</div>`;
      })
      .join('')}</div>`;
  }

  function signed(n) {
    return n > 0 ? `+${n}` : String(n);
  }

  function changeCell(ch, better) {
    if (ch == null) return '<td class="br-muted">—</td>';
    const v = Math.round(Math.abs(ch) * 100);
    if (v < 1) return '<td>持平</td>';
    const good = better === 'down' ? ch < 0 : ch > 0;
    const word = better === 'down' ? (ch < 0 ? '快' : '慢') : ch > 0 ? '+' : '−';
    return `<td class="${good ? 'is-good' : 'is-bad'}">${better === 'down' ? `${word} ${v}%` : `${word}${v}%`}</td>`;
  }

  function html(rep) {
    const isMonth = rep.type === 'month';
    const kpis = rep.kpis
      .map((k) => `<div class="br-kpi"><span>${esc(k.label)}</span><b>${k.cur == null ? '—' : esc(k.fmt(k.cur))}</b><small>${esc(rep.prevLabel)} ${k.prev == null ? '—' : esc(k.fmt(k.prev))}${k.note ? `｜${esc(k.note)}` : ''}</small>${kpiTag(k)}</div>`)
      .join('');
    const groupRows = rep.groups
      .map(
        (g) => `<tr><td class="br-l"><b>${esc(g.label)}</b></td><td>${g.n}</td><td><b>${g.points}</b></td><td>${g.prevPoints}</td>${changeCell(change(g.points, g.prevPoints), 'up')}<td>${num(g.perHead)}</td>
          <td>${g.dur.avg != null ? esc(fmtDur(g.dur.avg)) : '—'}</td>${changeCell(g.durChange, 'down')}<td>${g.dur.count}</td><td>${g.checked ? `${pctText(g.rate)}<small>（${g.correct}/${g.checked}）</small>` : '—'}</td><td>${g.complaints || 0}</td></tr>`
      )
      .join('');
    const personRows = rep.people
      .map(
        (p) => `<tr><td>${p.rank}</td><td class="br-l"><b>${esc(p.name)}</b></td><td>${esc(p.leader)}</td><td>${esc(p.region)}</td>
          <td><b>${p.points}</b></td><td>${p.prevPoints}</td><td class="${p.points > p.prevPoints ? 'is-good' : p.points < p.prevPoints ? 'is-bad' : ''}">${signed(p.points - p.prevPoints)}</td>
          ${isMonth ? `<td>${esc(p.stageLabel)}</td><td class="g-${esc(p.grade)}">${esc(p.grade || '—')}${p.score != null ? `<small>${Math.round(p.score)}</small>` : ''}</td>` : `<td>${p.monthPoints}</td><td>${p.toNext ? `差 ${p.toNext}` : '已達第二階段'}</td>`}
          <td>${p.dur.avg != null ? esc(fmtDur(p.dur.avg)) : '—'}<small>${p.dur.count} 件</small></td>${changeCell(p.durChange, 'down')}
          <td>${p.checked ? `${pctText(p.rate)}<small>（${p.correct}/${p.checked}）</small>` : '—'}</td><td>${p.complaints || ''}</td><td>${p.penalty === '無' ? '' : esc(p.penalty)}</td></tr>`
      )
      .join('');
    const failRows = rep.fails.map((f) => `<tr><td>${esc(rocDate(f.date))}</td><td><b>${esc(f.name)}</b></td><td class="br-l br-wrap">${esc(f.note)}</td><td>${esc(f.by)}</td></tr>`).join('');
    const incRows = rep.incidents.map((x) => `<tr><td>${esc(rocDate(x.date))}</td><td><b>${esc(x.name)}</b></td><td>${x.complaints}</td><td>${esc(x.penalty)}</td><td class="br-l br-wrap">${esc(x.note)}</td></tr>`).join('');
    const grades = rep.grades.length
      ? `<h3 class="br-h">綜合評等分布</h3><div class="br-grades">${rep.grades
          .filter((g) => g.names.length)
          .map((g) => `<div class="br-grade g-${esc(g.grade)}"><b>${g.grade === '-' ? '資料不足' : g.grade}</b><span>${g.names.length} 人</span><small>${g.names.map(esc).join('、')}</small></div>`)
          .join('')}</div>`
      : '';
    return `<div class="br-sheet">
      <div class="br-title">${esc(rep.title)}</div>
      <div class="br-info">本期：${esc(rocDate(rep.period.start))}–${esc(rocDate(rep.period.end))}　｜　比較：${esc(rep.prevLabel)}（${esc(rocDate(rep.prev.start))}–${esc(rocDate(rep.prev.end))}）　｜　資料截至：${esc(rocDate(rep.asOf))}　｜　對象：在職正職行政 ${rep.total.n} 人</div>
      <h3 class="br-h">重點摘要</h3>
      <ul class="br-bullets">${rep.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
      <h3 class="br-h">關鍵指標｜${esc(rep.periodLabel)} vs ${esc(rep.prevLabel)}<small>綠色＝變好、紅色＝變差</small></h3>
      <div class="br-kpis">${kpis}</div>
      <h3 class="br-h">各節點平均審一件要多久<small>灰色＝${esc(rep.prevLabel)}、彩色＝${esc(rep.periodLabel)}；長條越短越快</small></h3>
      ${nodeBars(rep)}
      ${grades}
      <h3 class="br-h">各組比較</h3>
      <table class="br-table"><thead><tr><th>組長</th><th>人數</th><th>點數</th><th>${esc(rep.prevLabel)}</th><th>點數變化</th><th>人均點數</th><th>平均審一件</th><th>速度變化</th><th>審核件數</th><th>審件良率</th><th>客訴</th></tr></thead>
        <tbody>${groupRows}<tr class="br-total"><td class="br-l"><b>全體</b></td><td>${rep.total.n}</td><td><b>${rep.total.points}</b></td><td>${rep.total.prevPoints}</td>${changeCell(change(rep.total.points, rep.total.prevPoints), 'up')}<td>${num(rep.total.perHead)}</td><td>${rep.total.dur.avg != null ? esc(fmtDur(rep.total.dur.avg)) : '—'}</td>${changeCell(rep.total.durChange, 'down')}<td>${rep.total.dur.count}</td><td>${rep.total.checked ? pctText(rep.total.rate) : '—'}</td><td>${rep.total.complaints}</td></tr></tbody></table>
      <h3 class="br-h">人員明細<small>依${esc(rep.periodLabel)}點數排序；速度變化以同一人${esc(rep.prevLabel)}同節點比較（本期各節點至少合計 ${CMP_MIN} 件才比）</small></h3>
      <table class="br-table"><thead><tr><th>排名</th><th>姓名</th><th>組長</th><th>地區</th><th>點數</th><th>${esc(rep.prevLabel)}</th><th>增減</th>${isMonth ? '<th>月度級距</th><th>綜合評等</th>' : '<th>月累積</th><th>距下一階段</th>'}<th>平均審一件</th><th>速度變化</th><th>審件良率</th><th>客訴</th><th>懲處</th></tr></thead>
        <tbody>${personRows || '<tr><td colspan="15">沒有在職正職行政</td></tr>'}</tbody></table>
      ${rep.watch.length ? `<h3 class="br-h">需關注人員</h3><ul class="br-bullets">${rep.watch.map((w) => `<li><b>${esc(w.name)}</b>${w.leader ? `（${esc(w.leader)}組）` : ''}：${esc(w.why.join('、'))}</li>`).join('')}</ul>` : ''}
      <h3 class="br-h">審件抽查未通過明細<small>${rep.fails.length} 件</small></h3>
      ${rep.fails.length ? `<table class="br-table"><thead><tr><th>日期</th><th>姓名</th><th>內容／原因</th><th>登錄人</th></tr></thead><tbody>${failRows}</tbody></table>` : '<p class="br-muted">本期抽查全部通過或尚未抽查。</p>'}
      ${rep.incidents.length ? `<h3 class="br-h">客訴／懲處明細</h3><table class="br-table"><thead><tr><th>日期</th><th>姓名</th><th>客訴</th><th>懲處</th><th>備註</th></tr></thead><tbody>${incRows}</tbody></table>` : ''}
    </div>`;
  }

  /* ---------- 文字（貼 LINE） ---------- */

  function text(rep) {
    return [`【${rep.title}】`, `${rocDate(rep.period.start)}–${rocDate(rep.period.end)}（比較${rep.prevLabel}）`, '', ...rep.bullets.map((b, i) => `${i + 1}. ${b}`)].join('\n');
  }

  /* ---------- Excel ---------- */

  function workbook(rep, XLSX) {
    const isMonth = rep.type === 'month';
    const border = { style: 'thin', color: { rgb: '94A3B8' } };
    const box = { top: border, bottom: border, left: border, right: border };
    const font = (o) => Object.assign({ name: 'Microsoft JhengHei', sz: 11 }, o);
    const center = { horizontal: 'center', vertical: 'center', wrapText: true };
    const S = {
      title: { font: font({ bold: true, sz: 16, color: { rgb: 'FFFFFF' } }), fill: { fgColor: { rgb: '0B1F44' } } },
      info: { font: font({ bold: true }), fill: { fgColor: { rgb: 'FBF3E4' } } },
      head: { font: font({ bold: true }), fill: { fgColor: { rgb: 'D9EAD3' } }, alignment: center, border: box },
      cell: { font: font(), alignment: center, border: box },
      left: { font: font(), alignment: { vertical: 'center', wrapText: true }, border: box },
      good: { font: font({ bold: true, color: { rgb: '15803D' } }), alignment: center, border: box },
      bad: { font: font({ bold: true, color: { rgb: 'B91C1C' } }), alignment: center, border: box },
      text: { font: font(), alignment: { vertical: 'top', wrapText: true } }
    };
    const c = (v, s = S.cell, z) => (v == null || v === '' ? { v: '', t: 's', s } : typeof v === 'number' ? { v, t: 'n', s, ...(z ? { z } : {}) } : { v: String(v), t: 's', s });
    const head = (list) => list.map((t) => c(t, S.head));
    const chg = (ch, better) => {
      if (ch == null) return c('—');
      const good = better === 'down' ? ch < 0 : ch > 0;
      return c(ch, Math.abs(ch) < 0.005 ? S.cell : good ? S.good : S.bad, '+0%;-0%;0%');
    };
    const sheet = (aoa, cols, merges) => {
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = cols.map((wch) => ({ wch }));
      if (merges) ws['!merges'] = merges;
      return ws;
    };
    const wb = XLSX.utils.book_new();

    const sum = [];
    const merges = [];
    const line = (t, s) => {
      merges.push({ s: { r: sum.length, c: 0 }, e: { r: sum.length, c: 4 } });
      sum.push([c(t, s), c('', s), c('', s), c('', s), c('', s)]);
    };
    line(rep.title, S.title);
    line(`本期 ${rocDate(rep.period.start)}–${rocDate(rep.period.end)}｜比較 ${rep.prevLabel}｜資料截至 ${rocDate(rep.asOf)}｜在職正職行政 ${rep.total.n} 人`, S.info);
    sum.push([]);
    sum.push(head(['指標', rep.periodLabel, rep.prevLabel, '變化', '說明']));
    for (const k of rep.kpis) {
      const pp = k.key === 'rate' || k.key === 'long';
      const isDur = k.key === 'avg' || k.key === 'median';
      const val = (v) => (v == null ? c('—') : isDur ? c(fmtDur(v)) : pp ? c(v, S.cell, '0.0%') : c(Math.round(v * 10) / 10));
      const ch = k.change == null ? c('—') : c(changeWord(k.change, k.better || null, !pp), k.better ? (tone(k.change, k.better) === 'is-good' ? S.good : tone(k.change, k.better) === 'is-bad' ? S.bad : S.cell) : S.cell);
      sum.push([c(k.label, S.left), val(k.cur), val(k.prev), ch, c(k.note || '', S.left)]);
    }
    sum.push([]);
    line('重點摘要', S.info);
    for (const b of rep.bullets) {
      merges.push({ s: { r: sum.length, c: 0 }, e: { r: sum.length, c: 4 } });
      sum.push([c(`• ${b}`, S.text)]);
    }
    const wsSum = sheet(sum, [18, 16, 16, 16, 30], merges);
    wsSum['!rows'] = sum.map((r, i) => (i === 0 ? { hpt: 28 } : i >= sum.length - rep.bullets.length ? { hpt: 36 } : {}));
    XLSX.utils.book_append_sheet(wb, wsSum, '摘要');

    const nodeAoa = [head(['節點', `${rep.prevLabel}平均`, `${rep.prevLabel}件數`, `${rep.periodLabel}平均`, `${rep.periodLabel}件數`, '變化'])];
    for (const n of rep.nodes) {
      nodeAoa.push([c(n.label), c(n.prev.avg != null ? fmtDur(n.prev.avg) : '—'), c(n.prev.count), c(n.cur.avg != null ? fmtDur(n.cur.avg) : '—'), c(n.cur.count), chg(n.change, 'down')]);
    }
    XLSX.utils.book_append_sheet(wb, sheet(nodeAoa, [12, 14, 10, 14, 10, 10]), '節點耗時');

    const gAoa = [head(['組長', '人數', '點數', `${rep.prevLabel}點數`, '點數變化', '人均點數', '平均審一件', '速度變化', '審核件數', '抽查件數', '良率', '客訴'])];
    for (const g of [...rep.groups, rep.total]) {
      gAoa.push([c(g === rep.total ? '全體' : g.label), c(g.n), c(g.points), c(g.prevPoints), chg(change(g.points, g.prevPoints), 'up'), c(g.perHead != null ? Math.round(g.perHead * 10) / 10 : null), c(g.dur.avg != null ? fmtDur(g.dur.avg) : '—'), chg(g.durChange, 'down'), c(g.dur.count), c(g.checked), g.rate == null ? c('—') : c(g.rate, S.cell, '0.0%'), c(g.complaints)]);
    }
    XLSX.utils.book_append_sheet(wb, sheet(gAoa, [10, 6, 8, 10, 10, 10, 13, 10, 10, 9, 9, 6]), '各組比較');

    const pHead = ['排名', '姓名', '組長', '地區', '營業處', '點數', `${rep.prevLabel}點數`, '增減', ...(isMonth ? ['月度級距', '綜合評等', '評分'] : ['月累積', '距下一階段']), '平均審一件', '審核件數', '速度變化', '抽查件數', '正確件數', '良率', '客訴', '懲處'];
    const pAoa = [head(pHead)];
    for (const p of rep.people) {
      pAoa.push([
        c(p.rank), c(p.name), c(p.leader), c(p.region), c(p.office), c(p.points), c(p.prevPoints), c(p.points - p.prevPoints, p.points > p.prevPoints ? S.good : p.points < p.prevPoints ? S.bad : S.cell, '+0;-0;0'),
        ...(isMonth ? [c(p.stageLabel), c(p.grade || '—'), c(p.score != null ? Math.round(p.score) : null)] : [c(p.monthPoints), c(p.toNext ? p.toNext : '已達')]),
        c(p.dur.avg != null ? fmtDur(p.dur.avg) : '—'), c(p.dur.count), chg(p.durChange, 'down'), c(p.checked), c(p.correct), p.rate == null ? c('—') : c(p.rate, S.cell, '0.0%'), c(p.complaints), c(p.penalty === '無' ? '' : p.penalty)
      ]);
    }
    XLSX.utils.book_append_sheet(wb, sheet(pAoa, [6, 9, 9, 9, 12, 7, 10, 7, ...(isMonth ? [12, 9, 6] : [8, 10]), 12, 9, 9, 9, 9, 8, 6, 6]), '人員明細');

    const fAoa = [head(['日期', '姓名', '內容／原因', '登錄人'])];
    for (const f of rep.fails) fAoa.push([c(rocDate(f.date)), c(f.name), c(f.note, S.left), c(f.by)]);
    if (!rep.fails.length) fAoa.push([c('本期抽查全部通過或尚未抽查', S.left)]);
    XLSX.utils.book_append_sheet(wb, sheet(fAoa, [10, 9, 60, 12]), '抽查未通過');

    if (rep.incidents.length) {
      const iAoa = [head(['日期', '姓名', '客訴', '懲處', '備註'])];
      for (const x of rep.incidents) iAoa.push([c(rocDate(x.date)), c(x.name), c(x.complaints), c(x.penalty), c(x.note, S.left)]);
      XLSX.utils.book_append_sheet(wb, sheet(iAoa, [10, 9, 6, 6, 50]), '客訴懲處');
    }
    return wb;
  }

  return { build, html, text, workbook, CMP_MIN };
});
