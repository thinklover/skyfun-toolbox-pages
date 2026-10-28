/**
 * 行政點數表：個人儀表板用的 SVG 圖表（回傳 HTML 字串）
 */
(function (root) {
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function niceMax(v) {
    if (!(v > 0)) return 1;
    const p = 10 ** Math.floor(Math.log10(v));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }

  function legend(items) {
    return `<div class="apc-legend">${items
      .map((i) => `<span><i class="${i.dash ? 'is-line' : ''}" style="background:${i.color}"></i>${esc(i.name)}</span>`)
      .join('')}</div>`;
  }

  function pickAttrs(pick, i) {
    return pick ? ` data-pick="${esc(pick.id)}" data-pick-i="${i}" role="button" tabindex="0"` : '';
  }

  /**
   * 直條圖＋折線＋參考線
   * @param o { labels, bars:[{name,values,color}], lines:[{name,values,color,dash}], refs:[{value,label,color}], fmt, height, min, max,
   *            lineLabels：折線每點標數值（第一條標在上方、其餘標在下方）,
   *            pick:{ id, active }：每一欄可點，active 為目前選中的欄 }
   */
  function columns(o) {
    const labels = o.labels || [];
    const bars = o.bars || [];
    const lines = o.lines || [];
    const refs = o.refs || [];
    const fmt = o.fmt || ((v) => String(Math.round(v * 10) / 10));
    const H = o.height || 260;
    const gwMin = bars.length > 1 ? 34 : 26;
    const W = Math.max(600, labels.length * gwMin + 100);
    const padL = 46;
    const padR = 54;
    const padT = 18;
    const padB = 30;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const all = [...bars.flatMap((b) => b.values), ...lines.flatMap((l) => l.values), ...refs.map((r) => r.value)].filter((v) => v != null && Number.isFinite(v));
    const max = o.max || niceMax(Math.max(0, ...all));
    const min = o.min || 0;
    const y = (v) => padT + plotH - ((Math.max(min, v) - min) / (max - min)) * plotH;
    const gw = plotW / Math.max(1, labels.length);
    const bw = Math.min(22, (gw * 0.72) / Math.max(1, bars.length));
    const pick = o.pick || null;
    const active = pick && pick.active != null ? pick.active : -1;
    const out = [];
    for (let i = 0; i <= 4; i++) {
      const v = min + ((max - min) / 4) * i;
      out.push(`<line class="apc-grid" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text class="apc-axis" x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${esc(fmt(v))}</text>`);
    }
    if (active >= 0) out.push(`<rect class="apc-pick-bg" x="${padL + gw * active + 2}" y="${padT - 6}" width="${gw - 4}" height="${plotH + 6}" rx="8"/>`);
    const step = Math.ceil(labels.length / 16);
    labels.forEach((l, i) => {
      if (i % step && i !== active) return;
      out.push(`<text class="apc-axis${i === active ? ' is-on' : ''}" x="${padL + gw * (i + 0.5)}" y="${H - 10}" text-anchor="middle">${esc(l)}</text>`);
    });
    bars.forEach((b, bi) => {
      b.values.forEach((v, i) => {
        if (v == null) return;
        const x = padL + gw * i + (gw - bw * bars.length) / 2 + bw * bi;
        const color = typeof b.color === 'function' ? b.color(v, i) : b.color;
        out.push(`<rect x="${x}" y="${y(v)}" width="${bw - 2}" height="${Math.max(0, padT + plotH - y(v))}" rx="2" fill="${color}"><title>${esc(labels[i])} ${esc(b.name)}：${esc(fmt(v))}</title></rect>`);
        if (labels.length <= 14 && v) out.push(`<text class="apc-val" x="${x + (bw - 2) / 2}" y="${y(v) - 4}" text-anchor="middle">${esc(fmt(v))}</text>`);
      });
    });
    lines.forEach((l, li) => {
      const pts = l.values.map((v, i) => (v == null ? null : [padL + gw * (i + 0.5), y(v)]));
      let d = '';
      pts.forEach((p, i) => {
        if (!p) return;
        d += `${d && pts[i - 1] ? 'L' : 'M'}${p[0]},${p[1]} `;
      });
      out.push(`<path d="${d}" fill="none" stroke="${l.color}" stroke-width="2.2"${l.dash ? ' stroke-dasharray="5 4"' : ''}/>`);
      pts.forEach((p, i) => {
        if (!p) return;
        out.push(`<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${l.color}"><title>${esc(labels[i])} ${esc(l.name)}：${esc(fmt(l.values[i]))}</title></circle>`);
        if (o.lineLabels) out.push(`<text class="apc-val" x="${p[0]}" y="${li ? p[1] + 14 : p[1] - 7}" text-anchor="middle" style="fill:${l.color}">${esc(fmt(l.values[i]))}</text>`);
      });
    });
    for (const r of refs) {
      if (r.value > max || r.value < min) continue;
      out.push(`<line x1="${padL}" x2="${W - padR}" y1="${y(r.value)}" y2="${y(r.value)}" stroke="${r.color}" stroke-width="1.5" stroke-dasharray="6 4"/><text class="apc-ref" x="${W - padR + 4}" y="${y(r.value) + 4}" fill="${r.color}">${esc(r.label)}</text>`);
    }
    if (pick) {
      labels.forEach((l, i) => {
        const vals = [...bars, ...lines].map((s) => ({ name: s.name, v: s.values[i] })).filter((x) => x.v != null);
        if (!vals.length) return;
        const tip = `${l}　${vals.map((x) => `${x.name} ${fmt(x.v)}`).join('、')}（點看明細）`;
        out.push(`<rect class="apc-hit" x="${padL + gw * i}" y="${padT - 6}" width="${gw}" height="${plotH + padB + 6}"${pickAttrs(pick, i)}><title>${esc(tip)}</title></rect>`);
      });
    }
    const items = [...bars.map((b) => ({ name: b.name, color: typeof b.color === 'function' ? '#6366f1' : b.color })), ...lines.map((l) => ({ name: l.name, color: l.color, dash: true }))];
    return `<div class="apc-scroll"><svg class="apc-svg apc-svg--cols${pick ? ' is-pickable' : ''}" viewBox="0 0 ${W} ${H}" style="max-width:${W}px">${out.join('')}</svg></div>${items.length > 1 ? legend(items) : ''}`;
  }

  /** 連續點分段（遇到 null 斷開） */
  function runsOf(pts) {
    const runs = [];
    let run = [];
    pts.forEach((p) => {
      if (p) run.push(p);
      else if (run.length) {
        runs.push(run);
        run = [];
      }
    });
    if (run.length) runs.push(run);
    return runs;
  }

  /** 一段連續點的平滑曲線（Catmull-Rom 轉三次貝茲，tension 偏低避免過衝） */
  function curve(run) {
    let d = `M${run[0][0]},${run[0][1]}`;
    for (let i = 0; i < run.length - 1; i++) {
      const p0 = run[i - 1] || run[i];
      const p1 = run[i];
      const p2 = run[i + 1];
      const p3 = run[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 7, p1[1] + (p2[1] - p0[1]) / 7];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 7, p2[1] - (p3[1] - p1[1]) / 7];
      d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
    }
    return d;
  }

  /**
   * 年度趨勢折線（本期 vs 同期）：平滑曲線、第一條線下方漸層、目標虛線＋達標區、右側累計摘要
   * 版面用 width／padL／padR 固定，外面的數字表可用同樣比例對齊月份欄
   * @param o { id, labels, lines:[{name,values,color,area}], target:{value,name}, fmt, min, max, step,
   *            width, height, padL, padR, side:{ title, items:[{label,value,color}], tag:{text,color} }, pick:{ id, active } }
   */
  function trend(o) {
    const labels = o.labels || [];
    const lines = o.lines || [];
    const fmt = o.fmt || ((v) => `${Math.round(v)}%`);
    const t = o.target;
    const W = o.width || 1000;
    const H = o.height || 280;
    const padL = o.padL ?? 56;
    const padR = o.padR ?? 16;
    const padT = 30;
    /* 底部留空畫月份標籤（可用 o.padB／o.showXLabels 覆寫） */
    const showX = o.showXLabels !== false && labels.some((l) => String(l || '').trim());
    const padB = o.padB != null ? o.padB : showX ? 28 : 12;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const gw = plotW / Math.max(1, labels.length);
    const all = lines.flatMap((l) => l.values).filter((v) => v != null && Number.isFinite(v));
    const lo = Math.min(t ? t.value : 100, ...all);
    const min = o.min ?? Math.max(0, Math.floor((lo - 12) / 10) * 10);
    const max = o.max ?? 100;
    const step = o.step || (max - min > 50 ? 20 : 10);
    const xOf = (i) => padL + gw * (i + 0.5);
    const y = (v) => Number((padT + plotH - ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * plotH).toFixed(1));
    const uid = esc(o.id || 'trend');
    const pick = o.pick || null;
    const active = pick && pick.active != null ? pick.active : -1;
    const out = [];
    const first = lines[0];
    if (first) {
      out.push(`<defs><linearGradient id="${uid}-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${first.color}" stop-opacity="0.22"/><stop offset="1" stop-color="${first.color}" stop-opacity="0"/></linearGradient></defs>`);
    }
    labels.forEach((_, i) => {
      if (i % 2) out.push(`<rect class="apc-tr-band" x="${padL + gw * i}" y="${padT}" width="${gw}" height="${plotH}"/>`);
    });
    if (t && t.value <= max) {
      out.push(`<rect class="apc-tr-zone" x="${padL}" y="${y(max)}" width="${plotW}" height="${y(t.value) - y(max)}"/>`);
    }
    const nearGoal = (v) => t && Math.abs(y(v) - y(t.value)) < 14;
    for (let v = min; v <= max + 1e-9; v += step) {
      out.push(`<line class="apc-tr-grid" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/>${nearGoal(v) ? '' : `<text class="apc-tr-axis" x="${padL - 10}" y="${y(v) + 4}" text-anchor="end">${esc(fmt(v))}</text>`}`);
    }
    if (active >= 0) out.push(`<rect class="apc-tr-pick" x="${padL + gw * active + 3}" y="${padT - 22}" width="${gw - 6}" height="${plotH + padB + 22}" rx="10"/>`);
    if (t && t.value <= max) {
      const gy = y(t.value);
      const tag = `${t.name || '目標'} ${fmt(t.value)}`;
      const tw = tag.length * 8 + 14;
      out.push(`<line class="apc-tr-goal" x1="${padL}" x2="${W - padR}" y1="${gy}" y2="${gy}"/>`);
      out.push(`<rect class="apc-tr-goal-tag" x="${padL - tw - 6}" y="${gy - 10}" width="${tw}" height="20" rx="10"/><text class="apc-tr-goal-text" x="${padL - tw / 2 - 6}" y="${gy + 4}" text-anchor="middle">${esc(tag)}</text>`);
    }
    const ptsOf = (l) => l.values.map((v, i) => (v == null || !Number.isFinite(v) ? null : [Number(xOf(i).toFixed(1)), y(v)]));
    const base = padT + plotH;
    [...lines].reverse().forEach((l) => {
      const runs = runsOf(ptsOf(l));
      if (l.area) runs.forEach((r) => out.push(`<path d="${curve(r)} L${r[r.length - 1][0]},${base} L${r[0][0]},${base} Z" fill="url(#${uid}-fill)"/>`));
      runs.forEach((r) => out.push(`<path d="${curve(r)}" fill="none" stroke="${l.color}" stroke-width="${l.area ? 3.2 : 2.4}" stroke-linecap="round" stroke-linejoin="round"${l.dash ? ' stroke-dasharray="6 5"' : ''}/>`));
    });
    labels.forEach((_, i) => {
      const here = lines.map((l, li) => ({ l, li, v: l.values[i] })).filter((x) => x.v != null && Number.isFinite(x.v));
      const sorted = [...here].sort((a, b) => b.v - a.v);
      here.forEach((x) => {
        const py = y(x.v);
        const below = sorted.length > 1 && sorted[sorted.length - 1] === x;
        const on = i === active;
        out.push(`<circle class="apc-tr-dot" cx="${xOf(i)}" cy="${py}" r="${on ? 6 : x.li ? 3.6 : 4.6}" stroke="${x.l.color}"><title>${esc(labels[i])} ${esc(x.l.name)}：${esc(fmt(x.v))}</title></circle>`);
        const text = fmt(x.v);
        if (x.li === 0) {
          const w = text.length * 7.6 + 12;
          const ty = below ? Math.min(base - 10, py + 22) : Math.max(padT - 12, py - 22);
          out.push(`<rect x="${xOf(i) - w / 2}" y="${ty - 10}" width="${w}" height="19" rx="9.5" fill="${x.l.color}"/><text class="apc-tr-pill" x="${xOf(i)}" y="${ty + 4}" text-anchor="middle">${esc(text)}</text>`);
        } else {
          const ty = below ? Math.min(base - 2, py + 19) : Math.max(padT - 8, py - 10);
          out.push(`<text class="apc-tr-val" x="${xOf(i)}" y="${ty}" text-anchor="middle" style="fill:${x.l.color}">${esc(text)}</text>`);
        }
      });
    });
    const s = o.side;
    if (s && padR > 80) {
      const cx = W - padR / 2 + 6;
      out.push(`<line class="apc-tr-sep" x1="${W - padR + 10}" x2="${W - padR + 10}" y1="${padT - 18}" y2="${H - 4}"/>`);
      out.push(`<text class="apc-tr-side-title" x="${cx}" y="${padT - 4}" text-anchor="middle">${esc(s.title || '')}</text>`);
      (s.items || []).forEach((it, k) => {
        const ty = padT + 30 + k * 66;
        out.push(`<text class="apc-tr-side-label" x="${cx}" y="${ty}" text-anchor="middle">${esc(it.label)}</text>`);
        out.push(`<text class="apc-tr-side-value" x="${cx}" y="${ty + 32}" text-anchor="middle" style="fill:${it.color}">${it.value == null ? '-' : esc(fmt(it.value))}</text>`);
      });
      if (s.tag) {
        const ty = padT + 30 + (s.items || []).length * 66;
        const w = s.tag.text.length * 11 + 18;
        out.push(`<rect x="${cx - w / 2}" y="${ty - 4}" width="${w}" height="24" rx="12" fill="${s.tag.bg || '#f1f5f9'}"/><text class="apc-tr-side-tag" x="${cx}" y="${ty + 12}" text-anchor="middle" style="fill:${s.tag.color}">${esc(s.tag.text)}</text>`);
      }
    }
    if (showX) {
      labels.forEach((l, i) => {
        const text = String(l || '').trim();
        if (!text) return;
        const on = i === active;
        out.push(
          `<text class="apc-tr-axis apc-tr-xlabel${on ? ' is-on' : ''}" x="${xOf(i)}" y="${H - 8}" text-anchor="middle">${esc(text)}</text>`
        );
      });
    }
    if (pick) {
      labels.forEach((l, i) => {
        const vals = lines.map((x) => ({ name: x.name, v: x.values[i] })).filter((x) => x.v != null);
        if (!vals.length) return;
        const tip = `${l}　${vals.map((x) => `${x.name} ${fmt(x.v)}`).join('、')}（點看明細）`;
        out.push(`<rect class="apc-hit" x="${padL + gw * i}" y="0" width="${gw}" height="${H}"${pickAttrs(pick, i)}><title>${esc(tip)}</title></rect>`);
      });
    }
    return `<svg class="apc-svg apc-svg--trend${pick ? ' is-pickable' : ''}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${out.join('')}</svg>`;
  }

  /**
   * 環圈圖（各類別占比），parts 依序畫、中間放總數
   * @param o { parts:[{label,value,color}], center, sub, size }
   */
  function pie(o) {
    const parts = (o.parts || []).filter((p) => p.value > 0);
    const total = parts.reduce((s, p) => s + p.value, 0);
    const r = 74;
    const sw = 30;
    const C = 2 * Math.PI * r;
    let acc = 0;
    const segs = parts
      .map((p) => {
        const len = (p.value / total) * C;
        const gap = parts.length > 1 ? Math.min(2.2, len / 3) : 0;
        const seg = `<circle cx="110" cy="110" r="${r}" fill="none" stroke="${p.color}" stroke-width="${sw}" stroke-dasharray="${(len - gap).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 110 110)"><title>${esc(p.label)}：${p.value}（${((p.value / total) * 100).toFixed(1)}%）</title></circle>`;
        acc += len;
        return seg;
      })
      .join('');
    return `<svg class="apc-pie" viewBox="0 0 220 220">
      <circle cx="110" cy="110" r="${r}" fill="none" stroke="#f1f5f9" stroke-width="${sw}"/>${segs}
      <text x="110" y="${o.sub ? 112 : 120}" text-anchor="middle" class="apc-pie-main">${esc(o.center ?? total)}</text>
      ${o.sub ? `<text x="110" y="136" text-anchor="middle" class="apc-pie-sub">${esc(o.sub)}</text>` : ''}
    </svg>`;
  }

  /**
   * 橫條比較（例如各節點：我 vs 全體）
   * @param o { rows:[{label, values:[...], note}], series:[{name,color}], fmt, colorOf(value,row,seriesIndex),
   *            tagOf(row) → { text, tone: 'good'|'bad'|'even' }：標在第一條右側, pick:{ id, active } }
   */
  function hbars(o) {
    const rows = o.rows || [];
    const series = o.series || [];
    const fmt = o.fmt || String;
    const pick = o.pick || null;
    const allMax = niceMax(Math.max(0, ...rows.flatMap((r) => r.values).filter((v) => v != null)));
    const rowMax = (r) => (o.rowScale ? Math.max(0, ...r.values.filter((v) => v != null)) * 1.08 || 1 : allMax);
    const tagCell = (r, si) => {
      if (!o.tagOf) return '';
      const t = si === 0 ? o.tagOf(r) : o.subTagOf ? o.subTagOf(r) : null;
      return t ? `<em class="apc-htag is-${t.tone}">${esc(t.text)}</em>` : '<em></em>';
    };
    const body = rows
      .map(
        (r, i) => `<div class="apc-hrow${pick ? ' is-pick' : ''}${pick && pick.active === i ? ' is-on' : ''}"${pickAttrs(pick, i)}><span class="apc-hlabel">${esc(r.label)}${r.note ? `<small>${esc(r.note)}</small>` : ''}</span><span class="apc-hbars">${series
          .map((s, si) => {
            const v = r.values[si];
            if (v == null) return `<span class="apc-hbar is-empty"><i></i><b>-</b>${tagCell(r, si)}</span>`;
            const color = (o.colorOf && o.colorOf(v, r, si)) || s.color;
            return `<span class="apc-hbar" title="${esc(s.name)}：${esc(fmt(v))}"><i><span style="width:${(v / rowMax(r)) * 100}%;background:${color}"></span></i><b>${esc(fmt(v))}</b>${tagCell(r, si)}</span>`;
          })
          .join('')}</span></div>`
      )
      .join('');
    return `<div class="apc-hchart${o.tagOf ? ' has-tags' : ''}">${body || '<p class="apc-empty">沒有資料</p>'}</div>${series.length > 1 ? legend(series) : ''}`;
  }

  /** 環形儀表（0–100） */
  function donut(o) {
    const v = o.value == null ? null : Math.max(0, Math.min(100, o.value));
    const r = 42;
    const c = 2 * Math.PI * r;
    const marks = (o.marks || [])
      .map((m) => {
        const a = (m / 100) * 2 * Math.PI - Math.PI / 2;
        return `<line x1="${60 + Math.cos(a) * 34}" y1="${60 + Math.sin(a) * 34}" x2="${60 + Math.cos(a) * 54}" y2="${60 + Math.sin(a) * 54}" stroke="#0f172a" stroke-width="2"/>`;
      })
      .join('');
    return `<svg class="apc-donut" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="13"/>
      ${v == null ? '' : `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${o.color || '#4338ca'}" stroke-width="13" stroke-linecap="round" stroke-dasharray="${(v / 100) * c} ${c}" transform="rotate(-90 60 60)"/>`}
      ${marks}
      <text x="60" y="${o.sub ? 60 : 66}" text-anchor="middle" class="apc-donut-main">${esc(o.text ?? (v == null ? '-' : Math.round(v)))}</text>
      ${o.sub ? `<text x="60" y="78" text-anchor="middle" class="apc-donut-sub">${esc(o.sub)}</text>` : ''}
    </svg>`;
  }

  /** 雷達圖（各軸 0–100） */
  function radar(o) {
    const axes = o.axes || [];
    const n = axes.length;
    const cx = 150;
    const cy = 130;
    const R = 92;
    const pt = (i, v) => {
      const a = (i / n) * 2 * Math.PI - Math.PI / 2;
      return [cx + Math.cos(a) * R * (v / 100), cy + Math.sin(a) * R * (v / 100)];
    };
    const rings = [25, 50, 75, 100]
      .map((lv) => `<polygon class="apc-grid" fill="none" points="${axes.map((_, i) => pt(i, lv).join(',')).join(' ')}"/>`)
      .join('');
    const spokes = axes
      .map((a, i) => {
        const [x, y] = pt(i, 100);
        const [lx, ly] = pt(i, 122);
        return `<line class="apc-grid" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/><text class="apc-radar-label" x="${lx}" y="${ly + 4}" text-anchor="middle">${esc(a.label)}</text><text class="apc-radar-val" x="${lx}" y="${ly + 18}" text-anchor="middle">${a.value == null ? '-' : Math.round(a.value)}</text>`;
      })
      .join('');
    const poly = (vals, color, fill) =>
      `<polygon points="${vals.map((v, i) => pt(i, v ?? 0).join(',')).join(' ')}" fill="${fill}" stroke="${color}" stroke-width="2"/>`;
    const base = o.base ? poly(o.base, '#94a3b8', 'rgba(148,163,184,0.15)') : '';
    return `<svg class="apc-svg apc-radar" viewBox="0 0 300 270">${rings}${spokes}${base}${poly(
      axes.map((a) => a.value),
      '#4338ca',
      'rgba(99,102,241,0.28)'
    )}</svg>${o.base ? legend([{ name: o.name || '我', color: '#4338ca' }, { name: o.baseName || '平均', color: '#94a3b8' }]) : ''}`;
  }

  /** 100% 堆疊橫條（例如審核動作占比） */
  function stack(o) {
    const pick = o.pick || null;
    const rows = (o.rows || [])
      .map((r, i) => {
        const total = r.parts.reduce((s, p) => s + (p.value || 0), 0);
        const segs = total
          ? r.parts
              .filter((p) => p.value)
              .map((p) => `<span style="width:${(p.value / total) * 100}%;background:${p.color}" title="${esc(p.label)} ${p.value}（${((p.value / total) * 100).toFixed(1)}%）">${(p.value / total) * 100 >= 8 ? `${esc(p.label)} ${((p.value / total) * 100).toFixed(0)}%` : ''}</span>`)
              .join('')
          : '';
        return `<div class="apc-srow${pick ? ' is-pick' : ''}${pick && pick.active === i ? ' is-on' : ''}"${pickAttrs(pick, i)}><span class="apc-hlabel">${esc(r.label)}<small>${total} 筆</small></span><span class="apc-stack">${segs || '<em>沒有資料</em>'}</span></div>`;
      })
      .join('');
    return `<div class="apc-hchart">${rows}</div>`;
  }

  root.AdminPointsCharts = { columns, trend, pie, hbars, donut, radar, stack, niceMax };
})(window);
