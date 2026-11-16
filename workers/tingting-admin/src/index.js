var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/kbdoc.js
var ENTRY_HEAD = /^(#{2,4}) ((?:KB|TB)-\d+)\s+(.+)$/;
var ANY_HEAD = /^#{1,6} /;
function segment(text) {
  const lines = (text || "").split("\n");
  const segs = [];
  let cur = null;
  let section = "";
  let part = 0;
  const push = /* @__PURE__ */ __name(() => {
    if (cur) segs.push(cur);
  }, "push");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const em = line.match(ENTRY_HEAD);
    if (em) {
      push();
      cur = { type: "entry", lines: [line], id: em[2], level: em[1].length, section, part: em[2].startsWith("KB-") ? 1 : 2 };
      continue;
    }
    if (ANY_HEAD.test(line)) {
      if (/^## 第一部/.test(line)) part = 1;
      else if (/^## 第二部/.test(line)) part = 2;
      const h = line.replace(/^#+\s*/, "").trim();
      if (!/^目錄$/.test(h) && !/^第[一二]部/.test(h)) section = h;
      push();
      cur = { type: "gap", lines: [line] };
      continue;
    }
    if (!cur) cur = { type: "gap", lines: [] };
    cur.lines.push(line);
  }
  push();
  const out = [];
  for (const s of segs) {
    if (s.type === "entry") {
      let end = s.lines.length;
      while (end > 1 && (s.lines[end - 1] === "" || /^-{3,}\s*$/.test(s.lines[end - 1]))) end--;
      const trail = s.lines.slice(end);
      s.lines = s.lines.slice(0, end);
      out.push(s);
      if (trail.length) out.push({ type: "gap", lines: trail, trailing: true });
    } else out.push(s);
  }
  return out.map((s, i) => ({ ...s, text: s.lines.join("\n") + (i < out.length - 1 ? "\n" : "") }));
}
__name(segment, "segment");
function join(segs) {
  return segs.map((s) => s.text).join("");
}
__name(join, "join");
function entryInfo(seg) {
  const block = seg.lines.join("\n");
  const head = seg.lines[0].match(ENTRY_HEAD);
  const statusM = block.match(/^- 狀態：(.+)$/m);
  const updatedM = block.match(/^- 最後更新：(.+)$/m);
  const qM = block.match(/\*\*常見問法：\*\*\s*(.+)$/m);
  return {
    id: seg.id,
    part: seg.part,
    level: seg.level,
    section: seg.section,
    title: head ? head[3].trim() : "",
    status: statusM ? statusM[1].trim() : "",
    updated: updatedM ? updatedM[1].trim() : "",
    questions: qM ? qM[1].trim() : "",
    block
  };
}
__name(entryInfo, "entryInfo");
function parseForm(block) {
  const lines = block.split("\n");
  const head = lines[0].match(ENTRY_HEAD);
  if (!head) return null;
  let i = 1;
  while (i < lines.length && lines[i] === "") i++;
  let questions = null;
  if (i < lines.length && /^\*\*常見問法：\*\*/.test(lines[i])) {
    questions = lines[i].replace(/^\*\*常見問法：\*\*\s?/, "");
    i++;
    while (i < lines.length && lines[i] === "") i++;
  }
  if (i >= lines.length || lines[i] !== "**\u7B54\u6848\uFF1A**") return null;
  i++;
  let m = lines.length;
  while (m > i && /^- /.test(lines[m - 1])) m--;
  const meta = lines.slice(m);
  if (!meta.length) return null;
  const answer = lines.slice(i, m).join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
  const form = { level: head[1].length, id: head[2], title: head[3], questions, answer, meta };
  return buildBlock(form) === block ? form : null;
}
__name(parseForm, "parseForm");
function buildBlock(f) {
  const out = [`${"#".repeat(f.level)} ${f.id} ${String(f.title).trim()}`, ""];
  if (f.questions !== null && f.questions !== void 0 && String(f.questions).trim() !== "") out.push(`**\u5E38\u898B\u554F\u6CD5\uFF1A** ${String(f.questions).trim()}`.replace(/\s+$/, ""), "");
  out.push("**\u7B54\u6848\uFF1A**", "");
  if (f.answer) out.push(String(f.answer).replace(/\r/g, "").replace(/^\n+|\n+$/g, ""), "");
  out.push(...f.meta);
  return out.join("\n");
}
__name(buildBlock, "buildBlock");
function setMeta(meta, key, value, { addIfMissing = false, after = "\u72C0\u614B" } = {}) {
  const prefix = `- ${key}\uFF1A`;
  const idx = meta.findIndex((l) => l.startsWith(prefix));
  if (idx >= 0) {
    const copy2 = meta.slice();
    copy2[idx] = prefix + value;
    return copy2;
  }
  if (!addIfMissing) return meta;
  const a = meta.findIndex((l) => l.startsWith(`- ${after}\uFF1A`));
  const copy = meta.slice();
  copy.splice(a >= 0 ? a + 1 : copy.length, 0, prefix + value);
  return copy;
}
__name(setMeta, "setMeta");
function setStatusInBlock(block, status) {
  if (/^- 狀態：.*$/m.test(block)) return block.replace(/^- 狀態：.*$/m, `- \u72C0\u614B\uFF1A${status}`);
  return block.replace(/\n*$/, "") + `
- \u72C0\u614B\uFF1A${status}`;
}
__name(setStatusInBlock, "setStatusInBlock");
function setUpdatedInBlock(block, date) {
  if (/^- 最後更新：.*$/m.test(block)) return block.replace(/^- 最後更新：.*$/m, `- \u6700\u5F8C\u66F4\u65B0\uFF1A${date}`);
  return block;
}
__name(setUpdatedInBlock, "setUpdatedInBlock");
function nextId(segs, prefix) {
  let max = 0;
  for (const s of segs) if (s.type === "entry" && s.id.startsWith(prefix + "-")) max = Math.max(max, Number(s.id.slice(3)));
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}
__name(nextId, "nextId");
function newBlock({ part, id, title, questions, answer, status, today, extraMeta }) {
  const level = part === 1 ? 4 : 2;
  const meta = part === 1 ? ["- \u56DE\u7B54\u8005\uFF1A", `- \u72C0\u614B\uFF1A${status}`, `- \u6700\u5F8C\u66F4\u65B0\uFF1A${today}`, "- \u4F86\u6E90\uFF1A\u5F8C\u53F0\u65B0\u589E"] : ["- \u4F86\u6E90\u6A94\uFF1A\u5F8C\u53F0\u65B0\u589E", `- \u72C0\u614B\uFF1A${status}`, `- \u6700\u5F8C\u66F4\u65B0\uFF1A${today}`];
  if (part === 1 && extraMeta?.answerer) meta[0] = `- \u56DE\u7B54\u8005\uFF1A${extraMeta.answerer}`;
  return buildBlock({ level, id, title, questions: questions ?? "", answer, meta });
}
__name(newBlock, "newBlock");

// src/ui.js
var HTML = '<!doctype html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="robots" content="noindex">\n<title>AI\u5A77\u5A77 \u5F8C\u53F0</title>\n<style>\n:root{--bg:#f6f7f9;--card:#fff;--ink:#1d2330;--mute:#6b7280;--line:#e5e7eb;--pri:#c2410c;--pri2:#fff7ed;--ok:#15803d;--warn:#b45309;--bad:#b91c1c;--blue:#2563eb}\n*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 -apple-system,BlinkMacSystemFont,"PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif}\nheader{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:12px;padding:10px 16px;flex-wrap:wrap}\nheader h1{font-size:17px;margin:0;font-weight:700}header h1 span{color:var(--pri)}\nnav{display:flex;gap:4px;flex-wrap:wrap}nav button{border:0;background:none;padding:7px 12px;border-radius:8px;font-size:15px;color:var(--mute);cursor:pointer}\nnav button.on{background:var(--pri2);color:var(--pri);font-weight:600}\n.sp{flex:1}main{max-width:1100px;margin:0 auto;padding:16px}\n.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:14px}\n.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}\ninput,select,textarea{font:inherit;border:1px solid var(--line);border-radius:8px;padding:8px 10px;background:#fff;color:inherit;max-width:100%}\ntextarea{width:100%;min-height:160px;resize:vertical}input[type=search]{flex:1;min-width:180px}\n.btn{border:1px solid var(--line);background:#fff;border-radius:8px;padding:8px 14px;cursor:pointer;font:inherit}\n.btn.pri{background:var(--pri);border-color:var(--pri);color:#fff}.btn.bad{color:var(--bad);border-color:#fecaca}.btn:disabled{opacity:.5}\n.btn.sm{padding:4px 10px;font-size:13px}\n.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}\n.stat{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px}.stat b{display:block;font-size:22px}.stat small{color:var(--mute)}\n.list .it{padding:12px 4px;border-top:1px solid var(--line);cursor:pointer}.list .it:hover{background:#fafafa}\n.id{font-family:ui-monospace,Menlo,monospace;font-size:13px;color:var(--blue);margin-right:6px}\n.tag{display:inline-block;font-size:12px;padding:1px 8px;border-radius:99px;background:#eef2ff;color:#3730a3;margin-left:4px;white-space:nowrap}\n.tag.\u78BA\u8A8D{background:#dcfce7;color:var(--ok)}.tag.\u5F85\u78BA\u8A8D{background:#fee2e2;color:var(--bad)}.tag.\u63A8\u5B9A{background:#fef3c7;color:var(--warn)}\n.tag.\u672A\u8655\u7406{background:#fef3c7;color:var(--warn)}.tag.\u5DF2\u88DC\u9032\u77E5\u8B58\u5EAB{background:#dcfce7;color:var(--ok)}.tag.\u4E0D\u7528\u88DC{background:#f3f4f6;color:#4b5563}\n.list .it.static{cursor:default}.list .it.static:hover{background:transparent}\n.mute{color:var(--mute);font-size:13px}.snip{color:var(--mute);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\nlabel{display:block;font-size:13px;color:var(--mute);margin:10px 0 4px}label input,label select{display:block;width:100%;margin-top:4px}\n.modal{position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:flex-start;justify-content:center;padding:4vh 10px;z-index:20;overflow:auto}\n.modal .card{width:min(860px,100%);margin:0}\npre{white-space:pre-wrap;word-break:break-word;background:#fafafa;border:1px solid var(--line);border-radius:8px;padding:12px;font-size:14px;max-height:55vh;overflow:auto}\n.note{background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a;border-radius:10px;padding:10px 12px;font-size:14px}\n.warnbox{background:#fffbeb;border:1px solid #fde68a;color:#78350f;border-radius:10px;padding:10px 12px;font-size:14px}\ntable{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left}th{color:var(--mute);font-weight:500}\ntd.n,th.n{text-align:right;font-variant-numeric:tabular-nums}\n.seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}.seg button{border:0;background:#fff;padding:6px 12px;cursor:pointer;font:inherit}.seg button.on{background:var(--ink);color:#fff}\n.chart{width:100%;overflow-x:auto}.chart svg{display:block}\n#toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:10px 16px;border-radius:10px;display:none;z-index:50;max-width:90vw}\n.login{max-width:360px;margin:12vh auto}\n.tabs2{display:flex;gap:6px;margin-bottom:10px}\n.kmwrap{position:relative;height:calc(100vh - 150px);min-height:480px;background:#0b1020;border-radius:12px;overflow:hidden;border:1px solid #1e293b;color:#e2e8f0}\n.kmbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}\n.kmbar input[type=search]{max-width:360px}\n.kmleg{position:absolute;left:10px;top:10px;z-index:3;background:rgba(15,23,42,.88);border:1px solid #1e293b;border-radius:10px;padding:8px 10px;font-size:13px;max-height:calc(100% - 20px);overflow:auto;min-width:190px}\n.kmleg .li{display:flex;align-items:center;gap:6px;padding:2px 4px;border-radius:6px;cursor:pointer;white-space:nowrap}.kmleg .li:hover{background:#1e293b}.kmleg .li.off{opacity:.35}\n.kmleg .li.on{background:#334155}.kmleg i{display:inline-block;width:10px;height:10px;border-radius:50%;flex:none}.kmleg .n{margin-left:auto;color:#94a3b8;padding-left:10px}\n.kmside{position:absolute;right:0;top:0;bottom:0;width:min(420px,92%);z-index:4;background:rgba(15,23,42,.97);border-left:1px solid #1e293b;padding:14px;overflow:auto;display:none}\n.kmside pre{background:#0f172a;border-color:#1e293b;color:#e2e8f0;max-height:none}\n.kmside .btn{background:#1e293b;color:#e2e8f0;border-color:#334155}.kmside .btn.pri{background:var(--pri);border-color:var(--pri);color:#fff}\n.kmside a{color:#93c5fd;cursor:pointer;text-decoration:none}.kmside .mute{color:#94a3b8}\n.kmhint{position:absolute;right:10px;bottom:8px;z-index:2;font-size:12px;color:#64748b}\n.kmload{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#94a3b8;z-index:5}\n@media(max-width:600px){main{padding:10px}.card{padding:12px}header{padding:8px 10px}}\n</style>\n</head>\n<body>\n<div id="app"></div>\n<div id="toast"></div>\n<script>\nconst $=(s,r=document)=>r.querySelector(s);const esc=s=>String(s??"").replace(/[&<>"\']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",\'"\':"&quot;","\'":"&#39;"}[c]));\nconst fmt=n=>Number(n||0).toLocaleString("zh-TW");\nfunction toast(m,ms=2600){const t=$("#toast");t.textContent=m;t.style.display="block";clearTimeout(t._h);t._h=setTimeout(()=>t.style.display="none",ms)}\nasync function api(path,opt={}){const r=await fetch(path,{...opt,headers:{"content-type":"application/json","x-admin":"1",...(opt.headers||{})},credentials:"same-origin"});\n const d=await r.json().catch(()=>({error:"\u56DE\u61C9\u683C\u5F0F\u932F\u8AA4"}));if(r.status===401&&path!=="/api/login"){renderLogin();throw new Error("\u672A\u767B\u5165")}if(!r.ok)throw Object.assign(new Error(d.error||("\u932F\u8AA4 "+r.status)),{data:d});return d}\nconst S={tab:"kb",q:"",status:"",part:"",kb:null,ukind:"gemini",range:"7d",uq:"",ustatus:""};\n\nfunction renderLogin(){document.getElementById("app").innerHTML=`<div class="login card"><h2 style="margin-top:0">AI\u5A77\u5A77 \u5F8C\u53F0</h2><p class="mute">\u8ACB\u8F38\u5165\u7BA1\u7406\u5BC6\u78BC</p>\n<form id="lf"><input id="pw" type="password" autocomplete="current-password" placeholder="\u5BC6\u78BC" style="width:100%"><div style="height:10px"></div><button class="btn pri" style="width:100%">\u767B\u5165</button><p id="le" style="color:var(--bad)"></p></form></div>`;\n $("#lf").onsubmit=async e=>{e.preventDefault();try{await api("/api/login",{method:"POST",body:JSON.stringify({password:$("#pw").value})});shell()}catch(err){$("#le").textContent=err.message}}}\n\nfunction shell(){document.getElementById("app").innerHTML=`<header><h1><span>AI\u5A77\u5A77</span> \u5F8C\u53F0</h1><nav>\n<button data-t="kb">\u77E5\u8B58\u5EAB</button><button data-t="map">\u77E5\u8B58\u5730\u5716</button><button data-t="unanswered">\u672A\u6536\u9304\u554F\u984C</button><button data-t="usage">\u7528\u91CF</button><button data-t="hist">\u7248\u672C\u7D00\u9304</button></nav><div class="sp"></div><button class="btn sm" id="lo">\u767B\u51FA</button></header><main id="main"></main>`;\n document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{S.tab=b.dataset.t;route()});$("#lo").onclick=async()=>{await api("/api/logout",{method:"POST"});renderLogin()};route()}\nfunction route(){document.querySelectorAll("nav button").forEach(b=>b.classList.toggle("on",b.dataset.t===S.tab));$("#main").style.maxWidth=S.tab==="map"?"none":"";if(S.tab!=="map"&&KM.fg){KM.fg._destructor&&KM.fg._destructor();KM.fg=null}({map:viewMap,kb:viewKb,unanswered:viewUnanswered,usage:viewUsage,hist:viewHist})[S.tab]()}\n\n// ---------- \u77E5\u8B58\u5EAB ----------\nasync function viewKb(){const m=$("#main");m.innerHTML=`<div class="card"><div class="row"><input type="search" id="q" placeholder="\u641C\u5C0B\u7DE8\u865F\uFF08KB-001\uFF09\u6216\u95DC\u9375\u5B57\uFF0C\u7A7A\u683C\u5206\u9694\u591A\u500B\u5B57" value="${esc(S.q)}">\n<select id="part"><option value="">\u5168\u90E8</option><option value="1">\u7B2C\u4E00\u90E8 KB\uFF08\u5A77\u5A77\u554F\u7B54\uFF09</option><option value="2">\u7B2C\u4E8C\u90E8 TB\uFF08\u5DE5\u5177\u7BB1\uFF09</option></select>\n<select id="st"><option value="">\u6240\u6709\u72C0\u614B</option></select><button class="btn pri" id="add">\uFF0B \u65B0\u589E\u689D\u76EE</button></div><div id="kbmeta" class="mute" style="margin-top:8px"></div></div>\n<div id="kbstats" class="stats" style="margin-bottom:14px"></div><div class="card"><div id="kbl" class="list mute">\u8F09\u5165\u4E2D\u2026</div></div>`;\n $("#part").value=S.part;let tm;$("#q").oninput=e=>{clearTimeout(tm);tm=setTimeout(()=>{S.q=e.target.value;loadKb()},250)};\n $("#part").onchange=e=>{S.part=e.target.value;loadKb()};$("#st").onchange=e=>{S.status=e.target.value;loadKb()};$("#add").onclick=()=>editor(null);loadKb()}\nasync function loadKb(){if(!$("#kbl"))return;let d;try{d=await api(`/api/kb?q=${encodeURIComponent(S.q)}&status=${encodeURIComponent(S.status)}&part=${S.part}`)}catch(e){if($("#kbl"))$("#kbl").textContent=e.message;return}\n if(!$("#kbl"))return;S.kb=d;if(d.missing){$("#kbl").innerHTML=`<div class="warnbox">R2 \u88E1\u9084\u6C92\u6709\u77E5\u8B58\u5EAB\uFF08kb/kb.md\uFF09\u3002\u8ACB\u5148\u5728\u96FB\u8166\u4E0A\u57F7\u884C line-bridge-tingting/scripts/sync-kb.sh \u4E0A\u50B3\u4E3B\u6A94\u3002</div>`;return}\n const st=$("#st");if(st.options.length<=1){Object.entries(d.counts.status).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>st.add(new Option(`${k}\uFF08${v}\uFF09`,k)));st.value=S.status}\n $("#kbstats").innerHTML=[["\u5168\u90E8\u689D\u76EE",d.counts.total],["\u7B2C\u4E00\u90E8 KB",d.counts.kb],["\u7B2C\u4E8C\u90E8 TB",d.counts.tb],["\u78BA\u8A8D",d.counts.status["\u78BA\u8A8D"]||0],["\u5F85\u78BA\u8A8D",d.counts.status["\u5F85\u78BA\u8A8D"]||0],["\u63A8\u5B9A",d.counts.status["\u63A8\u5B9A"]||0]].map(([a,b])=>`<div class="stat"><small>${a}</small><b>${fmt(b)}</b></div>`).join("");\n $("#kbmeta").textContent=d.meta?`${d.meta.source==="admin"?"\u6700\u5F8C\u7531\u5F8C\u53F0\u66F4\u65B0":"\u6700\u5F8C\u5F9E\u96FB\u8166\u4E3B\u6A94\u540C\u6B65"}\uFF1A${String(d.meta.updatedAt).replace("T"," ").slice(0,16)}\uFF08\u53F0\u5317\u6642\u9593\uFF09${d.meta.note?"\uFF08"+d.meta.note+"\uFF09":""}`:"\u5C1A\u672A\u7531\u5F8C\u53F0\u4FEE\u6539\u904E\uFF08\u76EE\u524D\u5167\u5BB9\u4F86\u81EA\u96FB\u8166\u4E3B\u6A94\u540C\u6B65\uFF09";\n const rows=d.entries.slice(0,300);$("#kbl").classList.remove("mute");\n $("#kbl").innerHTML=`<div class="mute" style="margin-bottom:6px">\u7B26\u5408 ${fmt(d.total)} \u7B46${d.total>300?"\uFF0C\u53EA\u986F\u793A\u524D 300 \u7B46\uFF0C\u8ACB\u518D\u7E2E\u5C0F\u641C\u5C0B":""}</div>`+(rows.map(e=>`<div class="it" data-id="${e.id}"><div><span class="id">${e.id}</span>${esc(e.title)}<span class="tag ${esc(e.status)}">${esc(e.status||"\u672A\u6A19")}</span></div><div class="snip">${esc(e.section)} \xB7 ${esc(e.snippet)}</div></div>`).join("")||"<p class=mute>\u6C92\u6709\u7B26\u5408\u7684\u689D\u76EE</p>");\n document.querySelectorAll("#kbl .it").forEach(el=>el.onclick=()=>viewEntry(el.dataset.id))}\nfunction modal(html){const w=document.createElement("div");w.className="modal";w.innerHTML=`<div class="card">${html}</div>`;document.body.appendChild(w);w.onclick=e=>{if(e.target===w)w.remove()};return w}\nconst STATUSES=["\u78BA\u8A8D","\u5F85\u78BA\u8A8D","\u63A8\u5B9A","\u4F9D\u689D\u6587\u5224\u5B9A"];\nasync function viewEntry(id){let e;try{e=await api("/api/kb/entry/"+id)}catch(err){toast(err.message);return}\n const w=modal(`<div class="row"><span class="id">${e.id}</span><b style="flex:1">${esc(e.title)}</b><button class="btn sm" id="x">\u95DC\u9589</button></div>\n<div class="mute" style="margin:6px 0">${e.part===1?"\u7B2C\u4E00\u90E8":"\u7B2C\u4E8C\u90E8"} \xB7 ${esc(e.section)} \xB7 \u6700\u5F8C\u66F4\u65B0 ${esc(e.updated||"\u672A\u6A19")}</div>\n<div class="row" style="margin:8px 0"><span class="mute">\u72C0\u614B</span><select id="qs">${statusOpts(e.status)}</select><button class="btn sm" id="qsb">\u6539\u72C0\u614B</button><div class="sp"></div>\n<button class="btn" id="ed">\u7DE8\u8F2F</button><button class="btn bad" id="del">\u522A\u9664</button></div><pre>${esc(e.block)}</pre>`);\n $("#x",w).onclick=()=>w.remove();$("#ed",w).onclick=()=>{w.remove();editor(e)};\n $("#qsb",w).onclick=async()=>{try{await save({action:"status",id:e.id,status:$("#qs",w).value,etag:e.etag});w.remove();viewEntry(e.id)}catch(err){toast(err.message)}};\n $("#del",w).onclick=async()=>{if(!confirm(`\u78BA\u5B9A\u522A\u9664 ${e.id}\u300C${e.title}\u300D\uFF1F\\n\u522A\u9664\u524D\u7684\u7248\u672C\u6703\u81EA\u52D5\u5099\u4EFD\uFF0C\u53EF\u5728\u300C\u7248\u672C\u7D00\u9304\u300D\u9084\u539F\u3002`))return;try{await save({action:"delete",id:e.id,etag:e.etag});w.remove()}catch(err){toast(err.message)}}}\nfunction statusOpts(cur){const s=[...STATUSES];if(cur&&!s.includes(cur))s.unshift(cur);return s.map(x=>`<option ${x===cur?"selected":""}>${esc(x)}</option>`).join("")}\nasync function save(body){const r=await api("/api/kb/save",{method:"POST",body:JSON.stringify(body)});toast(r.unchanged?"\u6C92\u6709\u8B8A\u66F4":`\u5DF2\u5132\u5B58\uFF1A${r.note}\uFF08\u5DF2\u5099\u4EFD\u820A\u7248\uFF09`);loadKb();return r}\nfunction editor(e){const isNew=!e;const f=e&&e.form;const kb=S.kb;\n const secs=(kb&&kb.sections||[]);\n const w=modal(`<div class="row"><b style="flex:1">${isNew?"\u65B0\u589E\u689D\u76EE":"\u7DE8\u8F2F "+e.id}</b><button class="btn sm" id="x">\u53D6\u6D88</button></div>\n${isNew?`<label>\u653E\u5728\u54EA\u4E00\u90E8<select id="fp"><option value="1">\u7B2C\u4E00\u90E8 KB\uFF08\u5A77\u5A77\u554F\u7B54\uFF0C\u512A\u5148\uFF09</option><option value="2">\u7B2C\u4E8C\u90E8 TB\uFF08\u5DE5\u5177\u7BB1\uFF09</option></select></label><label>\u5206\u985E\uFF08\u653E\u5728\u6B64\u5206\u985E\u6700\u5F8C\uFF09<select id="fs"></select></label>`:""}\n${!isNew?`<div class="tabs2"><span class="seg"><button id="m1" class="${f?"on":""}" ${f?"":"disabled"}>\u8868\u55AE</button><button id="m2" class="${f?"":"on"}">\u539F\u59CB Markdown</button></span></div>`:""}\n<div id="formv"><label>\u984C\u76EE<input id="ft" value="${esc(f?f.title:"")}"></label>\n<label>\u5E38\u898B\u554F\u6CD5\uFF08\u7528\u300C\uFF0F\u300D\u5206\u9694\uFF09<input id="fq" value="${esc(f&&f.questions||"")}"></label>\n<label>\u7B54\u6848<textarea id="fa" style="min-height:200px">${esc(f?f.answer:"")}</textarea></label>\n<div class="row"><label style="flex:1">\u72C0\u614B<select id="fst">${statusOpts(e?e.status:"\u78BA\u8A8D")}</select></label>${isNew?`<label style="flex:1" id="fanl">\u56DE\u7B54\u8005\uFF08\u7B2C\u4E00\u90E8\uFF09<input id="fan" placeholder="\u4F8B\u5982\uFF1A\u9EC3\u5A77\u5A77"></label>`:""}</div>\n${f?`<div class="mute">\u5176\u4ED6\u6B04\u4F4D\uFF08\u56DE\u7B54\u8005\u3001\u4F86\u6E90\u7B49\uFF09\u4FDD\u6301\u4E0D\u8B8A\uFF1B\u300C\u6700\u5F8C\u66F4\u65B0\u300D\u6703\u81EA\u52D5\u6539\u6210\u4ECA\u5929\u3002</div>`:""}</div>\n<div id="rawv" style="display:none"><div class="mute">\u7B2C\u4E00\u884C\u6A19\u984C\u8207\u7DE8\u865F\u4E0D\u53EF\u6539\uFF1B\u8ACB\u4FDD\u7559\u300C**\u7B54\u6848\uFF1A**\u300D\u8207\u300C- \u72C0\u614B\uFF1A\u300D\u7B49\u6B04\u4F4D\u683C\u5F0F\u3002\u5167\u5BB9\u88E1\u4E0D\u8981\u6709\u4EE5 # \u958B\u982D\u7684\u884C\u3002</div><textarea id="fr" style="min-height:340px;font-family:ui-monospace,Menlo,monospace;font-size:13px">${esc(e?e.block:"")}</textarea></div>\n<div class="row" style="margin-top:12px"><div class="sp"></div><button class="btn pri" id="sv">\u5132\u5B58</button></div>`);\n let mode=(!isNew&&!f)?"raw":"form";const setMode=m=>{mode=m;$("#formv",w).style.display=m==="form"?"":"none";$("#rawv",w).style.display=m==="raw"?"":"none";if($("#m1",w)){$("#m1",w).classList.toggle("on",m==="form");$("#m2",w).classList.toggle("on",m==="raw")}};setMode(mode);\n if(!isNew){if($("#m1",w))$("#m1",w).onclick=()=>setMode("form");$("#m2",w).onclick=()=>setMode("raw")}\n if(isNew){const fill=()=>{const p=Number($("#fp",w).value);$("#fs",w).innerHTML=secs.filter(s=>s.part===p).map(s=>`<option>${esc(s.name)}</option>`).join("");$("#fanl",w).style.display=p===1?"":"none";const sel=$("#fs",w);if(sel.options.length)sel.selectedIndex=sel.options.length-1};$("#fp",w).onchange=fill;fill()}\n $("#x",w).onclick=()=>w.remove();\n $("#sv",w).onclick=async()=>{const b=$("#sv",w);b.disabled=true;try{let body;\n  if(isNew)body={action:"add",part:$("#fp",w).value,section:$("#fs",w).value,title:$("#ft",w).value,questions:$("#fq",w).value,answer:$("#fa",w).value,status:$("#fst",w).value,answerer:$("#fan",w).value,etag:kb.etag};\n  else if(mode==="raw")body={action:"update",id:e.id,raw:$("#fr",w).value,etag:e.etag};\n  else body={action:"update",id:e.id,title:$("#ft",w).value,questions:$("#fq",w).value,answer:$("#fa",w).value,status:$("#fst",w).value,etag:e.etag};\n  const r=await save(body);w.remove();if(r.id)viewEntry(r.id)}catch(err){toast(err.message,4000);b.disabled=false}}}\n\n\n// ---------- \u77E5\u8B58\u5730\u5716 ----------\nconst KM={data:null,fg:null,hub:true,part:"",q:"",focus:"",only:"",sel:null,nb:new Map(),hover:null};\nconst KM_COLORS=["#60a5fa","#f472b6","#34d399","#fbbf24","#a78bfa","#f87171","#22d3ee","#a3e635","#fb923c","#e879f9","#2dd4bf","#facc15","#818cf8","#94a3b8"];\nfunction kmColor(g){const ks=Object.keys(KM.data.groups).sort((a,b)=>KM.data.groups[b]-KM.data.groups[a]);const i=ks.indexOf(g);return KM_COLORS[(i<0?13:i)%KM_COLORS.length]}\nfunction kmLib(){return window.ForceGraph?Promise.resolve():new Promise((ok,no)=>{const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/force-graph@1.52.0/dist/force-graph.min.js";s.onload=ok;s.onerror=()=>no(new Error("\u5716\u5F62\u5143\u4EF6\u8F09\u5165\u5931\u6557\uFF0C\u8ACB\u6AA2\u67E5\u7DB2\u8DEF\u5F8C\u91CD\u65B0\u6574\u7406"));document.head.appendChild(s)})}\nasync function viewMap(){const m=$("#main");m.innerHTML=`<div class="kmbar"><input type="search" id="kmq" placeholder="\u641C\u5C0B\u984C\u76EE\u3001\u7DE8\u865F\u6216\u5206\u985E\uFF0C\u6309 Enter \u8DF3\u5230\u7B2C\u4E00\u7B46" value="${esc(KM.q)}">\n<select id="kmp"><option value="">\u5168\u90E8</option><option value="1">\u7B2C\u4E00\u90E8 KB\uFF08\u5A77\u5A77\u554F\u7B54\uFF09</option><option value="2">\u7B2C\u4E8C\u90E8 TB\uFF08\u5DE5\u5177\u7BB1\uFF09</option></select>\n<label style="display:flex;align-items:center;gap:4px;margin:0;color:var(--ink);font-size:14px"><input type="checkbox" id="kmh" style="display:inline;width:auto;margin:0" ${KM.hub?"checked":""}>\u986F\u793A\u5206\u985E\u4E2D\u5FC3</label>\n<button class="btn sm" id="kmdup">\u7591\u4F3C\u91CD\u8907\u6E05\u55AE</button><button class="btn sm" id="kmfit">\u5168\u90E8\u7F6E\u4E2D</button><span id="kmst" class="mute"></span></div>\n<div class="kmwrap" id="kmw"><div class="kmload" id="kml">\u8F09\u5165\u77E5\u8B58\u5730\u5716\u4E2D\u2026</div><div class="kmleg" id="kmleg"></div><div id="kmc"></div><div class="kmside" id="kms"></div><div class="kmhint">\u6EFE\u8F2A\u7E2E\u653E\u30FB\u62D6\u66F3\u5E73\u79FB\u30FB\u9EDE\u7BC0\u9EDE\u770B\u5167\u5BB9</div></div>`;\n $("#kmp").value=KM.part;\n try{await kmLib();KM.data=await api("/api/kb/graph")}catch(e){$("#kml").textContent=e.message;return}\n if(S.tab!=="map")return;\n if(KM.data.missing){$("#kml").textContent="R2 \u88E1\u9084\u6C92\u6709\u77E5\u8B58\u5EAB\uFF08kb/kb.md\uFF09\u3002";return}\n $("#kml").remove();\n let tm;$("#kmq").oninput=e=>{clearTimeout(tm);tm=setTimeout(()=>{KM.q=e.target.value.trim();kmSearch()},200)};\n $("#kmq").onkeydown=e=>{if(e.key==="Enter"){KM.q=e.target.value.trim();kmSearch();const n=kmGraph().nodes.find(n=>n._hit);if(n)kmPick(n)}};\n $("#kmp").onchange=e=>{KM.part=e.target.value;kmBuild()};$("#kmh").onchange=e=>{KM.hub=e.target.checked;kmBuild()};\n $("#kmfit").onclick=()=>KM.fg&&KM.fg.zoomToFit(600,40);$("#kmdup").onclick=kmDupList;\n kmBuild()}\nfunction kmGraph(){return KM.fg?KM.fg.graphData():{nodes:[],links:[]}}\nfunction kmBuild(){const D=KM.data;const el=$("#kmc");if(!el)return;\n const keep=n=>!KM.part||String(n.part)===KM.part;\n const nodes=D.nodes.filter(keep).map(n=>({...n}));const ids=new Set(nodes.map(n=>n.id));\n const links=D.links.filter(l=>ids.has(l.source)&&ids.has(l.target)).map(l=>({...l}));\n if(KM.hub){const secs=D.sections.filter(s=>!KM.part||String(s.part)===KM.part);\n  for(const s of secs)nodes.push({id:"\xA7"+s.name,hub:true,title:s.name,section:s.name,group:s.group,count:s.count,part:s.part});\n  for(const n of nodes)if(!n.hub)links.push({source:n.id,target:"\xA7"+n.section,hubl:true})}\n KM.nb=new Map();for(const l of links){if(l.hubl)continue;(KM.nb.get(l.source)||KM.nb.set(l.source,[]).get(l.source)).push([l.target,l]);(KM.nb.get(l.target)||KM.nb.set(l.target,[]).get(l.target)).push([l.source,l])}\n const W=$("#kmw");\n if(!KM.fg){KM.fg=new ForceGraph(el).backgroundColor("#0b1020").nodeId("id").nodeRelSize(1).autoPauseRedraw(false)\n  .nodeLabel(n=>n.hub?`<b>${esc(n.title)}</b>\uFF08${n.count} \u689D\uFF09`:`<b>${esc(n.id)}</b> ${esc(n.title)}<br><span style="opacity:.7">${esc(n.section)} \xB7 ${esc(n.status)}</span>`)\n  .nodeCanvasObject(kmDraw).nodePointerAreaPaint((n,c,ctx)=>{ctx.fillStyle=c;ctx.beginPath();ctx.arc(n.x,n.y,n.hub?(14+Math.sqrt(n.count||1)*2.2):5,0,7);ctx.fill()})\n  .linkColor(l=>kmLinkColor(l)).linkWidth(l=>l.dup?2:l.hubl?.3:(kmLinkOn(l)?1.6:.2+l.w*1.2)).linkLineDash(l=>l.dup?[3,2]:null)\n  .onNodeClick(n=>kmPick(n)).onBackgroundClick(()=>kmPick(null)).onNodeHover(n=>{KM.hover=n||null;W.style.cursor=n?"pointer":""})\n  .cooldownTime(20000).d3AlphaDecay(.025).d3VelocityDecay(.35);\n  KM.fg.d3Force("charge").strength(n=>n.hub?-480:-30).distanceMax(560);\n  KM.fg.d3Force("link").distance(l=>l.hubl?46:l.dup?10:58*(1-l.w)+20).strength(l=>l.hubl?.38:l.dup?.6:.12+l.w*.45);\n  let fitted=false;KM.fg.onEngineStop(()=>{if(!fitted){fitted=true;KM.fg.zoomToFit(600,40)}});setTimeout(()=>{if(!fitted&&KM.fg){fitted=true;KM.fg.zoomToFit(800,40)}},4000);\n  new ResizeObserver(()=>{if(KM.fg&&$("#kmw"))KM.fg.width(W.clientWidth).height(W.clientHeight)}).observe(W)}\n KM.fg.width(W.clientWidth).height(W.clientHeight).graphData({nodes,links});\n KM.sel=null;kmSearch();kmLegend()}\nfunction kmLinkOn(l){const s=KM.sel;if(!s)return false;const a=l.source.id||l.source,b=l.target.id||l.target;return a===s.id||b===s.id}\nfunction kmLinkColor(l){if(l.dup)return"rgba(232,121,249,.85)";if(l.hubl)return"rgba(148,163,184,.1)";if(kmLinkOn(l))return"rgba(255,255,255,.8)";return KM.sel||KM.q||KM.focus||KM.only?"rgba(148,163,184,.05)":`rgba(148,163,184,${.06+l.w*.28})`}\nfunction kmLit(n){if(KM.sel){if(n===KM.sel)return true;return(KM.nb.get(KM.sel.id)||[]).some(([id])=>id===n.id)||(n.hub&&KM.sel.section===n.section)}\n if(KM.q)return!!n._hit;if(KM.only==="pending")return!!n.pending;if(KM.only==="dup")return!!n.dup;if(KM.focus)return n.group===KM.focus;return true}\nfunction kmDraw(n,ctx,scale){const lit=kmLit(n);const col=kmColor(n.group);\n if(n.hub){const r=11+Math.sqrt(n.count||1)*2.35;const showLab=scale>.32||lit||(n.count||0)>=6||n===KM.hover;\n  ctx.save();\n  ctx.globalAlpha=lit?.28:.07;ctx.beginPath();ctx.arc(n.x,n.y,r*2.55,0,7);ctx.fillStyle=col;ctx.fill();\n  ctx.globalAlpha=lit?.45:.12;ctx.beginPath();ctx.arc(n.x,n.y,r*1.65,0,7);ctx.fillStyle=col;ctx.fill();\n  ctx.globalAlpha=lit?1:.2;ctx.beginPath();ctx.arc(n.x,n.y,r,0,7);ctx.fillStyle=col;ctx.fill();\n  ctx.globalAlpha=lit?.4:.12;ctx.beginPath();ctx.arc(n.x-r*.32,n.y-r*.32,Math.max(2.2,r*.38),0,7);ctx.fillStyle="#fff";ctx.fill();\n  ctx.globalAlpha=lit?1:.25;ctx.lineWidth=1.2/scale+.4;ctx.strokeStyle="rgba(15,23,42,.75)";ctx.beginPath();ctx.arc(n.x,n.y,r,0,7);ctx.stroke();\n  if(showLab){const fs=Math.max(12.5/scale,4.2);const t=n.title.length>20?n.title.slice(0,20)+"\u2026":n.title;ctx.font="700 "+fs+"px sans-serif";ctx.textAlign="left";ctx.textBaseline="middle";ctx.lineWidth=3.4/scale;ctx.strokeStyle="rgba(11,16,32,.92)";ctx.strokeText(t,n.x+r+7/scale,n.y);ctx.fillStyle="#f8fafc";ctx.fillText(t,n.x+r+7/scale,n.y)}\n  ctx.restore();return}\n ctx.globalAlpha=lit?1:.13;const r=(n.part===1?3.4:2.6)+(n._hit&&KM.q?1.2:0);\n ctx.beginPath();ctx.arc(n.x,n.y,r,0,7);ctx.fillStyle=n._hit&&KM.q?"#fde047":col;ctx.fill();\n if(n.pending){ctx.lineWidth=1.4;ctx.strokeStyle="#fb923c";ctx.beginPath();ctx.arc(n.x,n.y,r+1.8,0,7);ctx.stroke()}\n if(n.dup){ctx.lineWidth=1.2;ctx.setLineDash([1.5,1.2]);ctx.strokeStyle="#e879f9";ctx.beginPath();ctx.arc(n.x,n.y,r+(n.pending?3.4:1.8),0,7);ctx.stroke();ctx.setLineDash([])}\n if(n===KM.sel){ctx.lineWidth=1.6;ctx.strokeStyle="#fff";ctx.beginPath();ctx.arc(n.x,n.y,r+4.5,0,7);ctx.stroke()}\n if(lit&&(scale>2.4||n===KM.sel||n===KM.hover||(KM.sel&&scale>1.1))){const fs=Math.max(10/scale,1.4);ctx.font=fs+"px sans-serif";ctx.textAlign="left";ctx.textBaseline="middle";const t=n.id+" "+(n.title.length>22?n.title.slice(0,22)+"\u2026":n.title);ctx.lineWidth=2.5/scale;ctx.strokeStyle="rgba(11,16,32,.9)";ctx.strokeText(t,n.x+r+2,n.y);ctx.fillStyle="#e2e8f0";ctx.fillText(t,n.x+r+2,n.y)}\n ctx.globalAlpha=1}\nfunction kmSearch(){const terms=KM.q.toLowerCase().split(/\\s+/).filter(Boolean);let c=0;for(const n of kmGraph().nodes){n._hit=!!terms.length&&!n.hub&&terms.every(t=>`${n.id} ${n.title} ${n.section}`.toLowerCase().includes(t));if(n._hit)c++}\n const D=KM.data,g=kmGraph();$("#kmst")&&($("#kmst").textContent=`${fmt(g.nodes.filter(n=>!n.hub).length)} \u689D\u30FB${fmt(g.links.filter(l=>!l.hubl).length)} \u689D\u95DC\u806F${terms.length?`\u30FB\u641C\u5C0B\u7B26\u5408 ${c} \u689D`:""}\u30FB\u66F4\u65B0\u65BC ${String(D.builtAt||"").replace("T"," ").slice(0,16)}\uFF08\u53F0\u5317\u6642\u9593\uFF09`)}\nfunction kmLegend(){const D=KM.data;const nodes=kmGraph().nodes.filter(n=>!n.hub);const cnt={};nodes.forEach(n=>cnt[n.group]=(cnt[n.group]||0)+1);\n const ks=Object.keys(D.groups).sort((a,b)=>D.groups[b]-D.groups[a]).filter(k=>cnt[k]);const pend=nodes.filter(n=>n.pending).length;const ids=new Set(nodes.map(n=>n.id));const dp=D.dups.filter(d=>ids.has(d.a)&&ids.has(d.b)).length;\n $("#kmleg").innerHTML=`<div style="font-weight:600;margin-bottom:4px">\u5206\u985E\uFF08\u9EDE\u4E00\u4E0B\u805A\u7126\uFF09</div>`+ks.map(k=>`<div class="li ${KM.focus===k?"on":KM.focus?"off":""}" data-g="${esc(k)}"><i style="background:${kmColor(k)}"></i>${esc(k)}<span class="n">${cnt[k]}</span></div>`).join("")+\n `<div style="border-top:1px solid #1e293b;margin:6px 0"></div><div class="li ${KM.only==="pending"?"on":""}" data-o="pending"><i style="border:2px solid #fb923c;background:none"></i>\u5F85\u78BA\u8A8D<span class="n">${pend}</span></div><div class="li ${KM.only==="dup"?"on":""}" data-o="dup"><i style="border:2px dotted #e879f9;background:none"></i>\u7591\u4F3C\u91CD\u8907\uFF08\u5C0D\uFF09<span class="n">${dp}</span></div>`;\n $("#kmleg").querySelectorAll("[data-g]").forEach(e=>e.onclick=()=>{KM.focus=KM.focus===e.dataset.g?"":e.dataset.g;KM.only="";KM.sel=null;kmLegend();kmSide(null);if(KM.focus){const ns=kmGraph().nodes.filter(n=>n.group===KM.focus);KM.fg.zoomToFit(600,60,n=>ns.includes(n))}});\n $("#kmleg").querySelectorAll("[data-o]").forEach(e=>e.onclick=()=>{KM.only=KM.only===e.dataset.o?"":e.dataset.o;KM.focus="";KM.sel=null;kmLegend();kmSide(null)})}\nfunction kmPick(n){if(n&&n.hub){KM.sel=null;KM.focus=n.group===KM.focus?"":n.group;kmLegend();kmSide(null);const ns=kmGraph().nodes.filter(x=>x.section===n.section);KM.fg.zoomToFit(600,80,x=>ns.includes(x));return}\n KM.sel=n||null;kmSide(n);if(n){KM.fg.centerAt(n.x,n.y,500);if(KM.fg.zoom()<2.2)KM.fg.zoom(2.6,500)}}\nasync function kmSide(n){const s=$("#kms");if(!s)return;if(!n){s.style.display="none";return}s.style.display="block";s.innerHTML=`<div class="mute">\u8F09\u5165\u4E2D\u2026</div>`;\n let e;try{e=await api("/api/kb/entry/"+n.id)}catch(err){s.innerHTML=`<div class="mute">${esc(err.message)}</div>`;return}if(KM.sel!==n)return;\n const nb=(KM.nb.get(n.id)||[]).map(([id,l])=>({id,l,node:KM.data.nodes.find(x=>x.id===id)})).filter(x=>x.node).sort((a,b)=>b.l.w-a.l.w);\n s.innerHTML=`<div class="row"><span class="id" style="color:#93c5fd">${esc(e.id)}</span><div class="sp"></div><button class="btn sm" id="kmx">\u95DC\u9589</button></div>\n<div style="font-weight:700;font-size:16px;margin:6px 0">${esc(e.title)}</div><div class="mute" style="margin-bottom:8px">${e.part===1?"\u7B2C\u4E00\u90E8":"\u7B2C\u4E8C\u90E8"} \xB7 ${esc(e.section)} \xB7 <span class="tag ${esc(e.status)}">${esc(e.status||"\u672A\u6A19")}</span>${e.updated?" \xB7 \u6700\u5F8C\u66F4\u65B0 "+esc(e.updated):""}</div>\n<div class="row" style="margin-bottom:10px"><button class="btn pri sm" id="kmed">\u7DE8\u8F2F\u9019\u689D</button><button class="btn sm" id="kmop">\u958B\u555F\u689D\u76EE\uFF08\u6539\u72C0\u614B\uFF0F\u522A\u9664\uFF09</button></div>\n${nb.some(x=>x.l.dup)?`<div class="warnbox" style="margin-bottom:10px">\u548C\u4EE5\u4E0B\u689D\u76EE\u5167\u5BB9\u975E\u5E38\u76F8\u4F3C\uFF0C\u53EF\u80FD\u91CD\u8907\u6216\u4E92\u76F8\u77DB\u76FE\uFF0C\u8ACB\u6BD4\u5C0D\uFF1A${nb.filter(x=>x.l.dup).map(x=>`<a data-j="${x.id}">${x.id}</a>\uFF08\u76F8\u4F3C\u5EA6 ${Math.round(x.l.w*100)}%\uFF09`).join("\u3001")}</div>`:""}\n<pre>${esc(e.block)}</pre>${nb.length?`<div style="font-weight:600;margin:10px 0 4px">\u76F8\u95DC\u689D\u76EE</div>${nb.map(x=>`<div style="padding:3px 0"><a data-j="${x.id}">${x.id}</a> ${esc(x.node.title)} <span class="mute">${Math.round(x.l.w*100)}%</span></div>`).join("")}`:""}`;\n $("#kmx",s).onclick=()=>kmPick(null);$("#kmed",s).onclick=()=>editor(e);$("#kmop",s).onclick=()=>viewEntry(e.id);\n s.querySelectorAll("a[data-j]").forEach(a=>a.onclick=()=>{const t=kmGraph().nodes.find(x=>x.id===a.dataset.j);if(t)kmPick(t);else toast("\u6B64\u689D\u76EE\u4E0D\u5728\u76EE\u524D\u7BE9\u9078\u7BC4\u570D")})}\nfunction kmDupList(){const D=KM.data;const T=id=>(D.nodes.find(n=>n.id===id)||{}).title||"";\n const w=modal(`<div class="row"><b style="flex:1">\u7591\u4F3C\u91CD\u8907\u7684\u689D\u76EE\uFF08${D.dups.length} \u5C0D\uFF09</b><button class="btn sm" id="x">\u95DC\u9589</button></div><p class="mute">\u6587\u5B57\u76F8\u4F3C\u5EA6\u5F88\u9AD8\u7684\u5169\u689D\uFF0C\u53EF\u80FD\u662F\u91CD\u8907\u6216\u6578\u5B57\u4E0D\u540C\u7684\u76F8\u8FD1\u984C\u76EE\u3002\u9EDE\u4E00\u4E0B\u5728\u5730\u5716\u4E0A\u67E5\u770B\u3002</p>\n${D.dups.length?`<table>${D.dups.map(d=>`<tr data-a="${d.a}" style="cursor:pointer"><td class="n">${Math.round(d.sim*100)}%</td><td><span class="id">${d.a}</span>${esc(T(d.a))}<br><span class="id">${d.b}</span>${esc(T(d.b))}</td></tr>`).join("")}</table>`:"<p>\u6C92\u6709\u767C\u73FE\u3002</p>"}`);\n $("#x",w).onclick=()=>w.remove();w.querySelectorAll("tr[data-a]").forEach(r=>r.onclick=()=>{w.remove();const n=kmGraph().nodes.find(x=>x.id===r.dataset.a);if(n)kmPick(n);else toast("\u6B64\u689D\u76EE\u4E0D\u5728\u76EE\u524D\u7BE9\u9078\u7BC4\u570D")})}\n\n// ---------- \u672A\u6536\u9304\u554F\u984C ----------\nasync function viewUnanswered(){const m=$("#main");m.innerHTML=`<div class="note" style="margin-bottom:14px">\u984C\u76EE\u7531 AI\u5A77\u5A77 \u56DE\u7B54\u4E0D\u51FA\u4F86\u6642\u81EA\u52D5\u8A18\u9304\uFF0C\u6BCF\u6B21\u8A18\u9304\u5F8C\u540C\u6B65\u4E0A\u4F86\u3002</div>\n<div class="card"><div class="row"><input type="search" id="uq" placeholder="\u641C\u5C0B\u984C\u76EE\u6216\u5099\u8A3B" value="${esc(S.uq)}">\n<select id="ust"><option value="">\u5168\u90E8\u72C0\u614B</option><option value="\u672A\u8655\u7406">\u672A\u8655\u7406</option><option value="\u5DF2\u88DC\u9032\u77E5\u8B58\u5EAB">\u5DF2\u88DC\u9032\u77E5\u8B58\u5EAB</option><option value="\u4E0D\u7528\u88DC">\u4E0D\u7528\u88DC</option></select></div></div>\n<div id="ustats" class="stats" style="margin-bottom:14px"></div><div class="card"><div id="ul" class="list mute">\u8F09\u5165\u4E2D\u2026</div></div>`;\n $("#ust").value=S.ustatus;let tm;$("#uq").oninput=e=>{clearTimeout(tm);tm=setTimeout(()=>{S.uq=e.target.value;loadUnanswered()},250)};\n $("#ust").onchange=e=>{S.ustatus=e.target.value;loadUnanswered()};loadUnanswered()}\nasync function loadUnanswered(){const box=$("#ul");if(!box)return;let d;try{d=await api("/api/unanswered")}catch(e){box.textContent=e.message;return}\n if(d.missing){box.innerHTML=`<div class="warnbox">R2 \u88E1\u9084\u6C92\u6709\u672A\u6536\u9304\u6E05\u55AE\uFF08kb/unanswered.md\uFF09\u3002\u8ACB\u5148\u5728\u96FB\u8166\u4E0A\u57F7\u884C line-bridge-tingting/scripts/sync-unanswered.sh \u6216 sync-kb.sh \u4E0A\u50B3\u3002</div>`;$("#ustats").innerHTML="";return}\n const c=d.counts||{};$("#ustats").innerHTML=[["\u5168\u90E8",c.total||0],["\u672A\u8655\u7406",c["\u672A\u8655\u7406"]||0],["\u5DF2\u88DC\u9032\u77E5\u8B58\u5EAB",c["\u5DF2\u88DC\u9032\u77E5\u8B58\u5EAB"]||0],["\u4E0D\u7528\u88DC",c["\u4E0D\u7528\u88DC"]||0]].map(([a,b])=>`<div class="stat"><small>${a}</small><b>${fmt(b)}</b></div>`).join("");\n const q=(S.uq||"").trim().toLowerCase();const terms=q.split(/\\s+/).filter(Boolean);\n let rows=d.items||[];\n if(S.ustatus)rows=rows.filter(x=>x.status===S.ustatus);\n if(terms.length)rows=rows.filter(x=>{const hay=`${x.date} ${x.time} ${x.question} ${x.extra} ${x.kbId} ${x.note}`.toLowerCase();return terms.every(t=>hay.includes(t))});\n box.classList.remove("mute");\n if(!rows.length){box.innerHTML=`<p class="mute">${(d.items||[]).length?"\u6C92\u6709\u7B26\u5408\u7684\u984C\u76EE":"\u76EE\u524D\u6C92\u6709\u672A\u6536\u9304\u554F\u984C\u3002"}</p>`;return}\n box.innerHTML=`<div class="mute" style="margin-bottom:6px">\u986F\u793A ${fmt(rows.length)} \u7B46\uFF08\u5171 ${fmt((d.items||[]).length)} \u7B46\uFF09</div>`+rows.map(it=>{\n  const when=esc(it.date)+(it.time?" "+esc(it.time):"");\n  const extra=it.extra?`<div class="mute" style="margin-top:4px">${esc(it.extra)}</div>`:"";\n  const meta=[it.kbId?`\u5DF2\u5C0D\u61C9 ${esc(it.kbId)}`:"",it.note?esc(it.note):"",it.updatedAt?("\u66F4\u65B0\u65BC "+esc(String(it.updatedAt).replace("T"," ").replace("+08:00",""))):""].filter(Boolean).join(" \xB7 ");\n  const reset=it.status!=="\u672A\u8655\u7406"?`<button class="btn sm" data-act="\u672A\u8655\u7406" data-id="${esc(it.id)}">\u6539\u56DE\u672A\u8655\u7406</button>`:"";\n  return `<div class="it static" data-id="${esc(it.id)}"><div class="row" style="margin-bottom:4px"><span class="mute">${when}</span><span class="tag ${esc(it.status)}">${esc(it.status)}</span></div><div>${esc(it.question)}</div>${extra}${meta?`<div class="mute" style="margin-top:4px">${meta}</div>`:""}<div class="row" style="margin-top:8px"><input class="kbio" placeholder="KB/TB \u7DE8\u865F\uFF08\u9078\u586B\uFF09" value="${esc(it.kbId||"")}" style="width:160px"><button class="btn sm pri" data-act="\u5DF2\u88DC\u9032\u77E5\u8B58\u5EAB" data-id="${esc(it.id)}">\u5DF2\u88DC\u9032\u77E5\u8B58\u5EAB</button><button class="btn sm" data-act="\u4E0D\u7528\u88DC" data-id="${esc(it.id)}">\u4E0D\u7528\u88DC</button>${reset}<div class="sp"></div><button class="btn sm bad" data-del="${esc(it.id)}">\u522A\u9664</button></div></div>`;\n }).join("");\n box.querySelectorAll("button[data-act]").forEach(b=>b.onclick=()=>setUnansweredStatus(b.dataset.id,b.dataset.act,b.closest(".it")));\n box.querySelectorAll("button[data-del]").forEach(b=>b.onclick=async()=>{if(!confirm("\u78BA\u5B9A\u522A\u9664\u9019\u984C\uFF1F\u522A\u9664\u5F8C\u4E0D\u6703\u518D\u51FA\u73FE\u5728\u6E05\u55AE\u88E1\u3002"))return;try{await api("/api/unanswered?id="+b.dataset.del,{method:"DELETE"});toast("\u5DF2\u522A\u9664");loadUnanswered()}catch(e){toast(e.message,4000)}})}\nasync function setUnansweredStatus(id,status,row){const kbId=row?($(".kbio",row)||{}).value||"":"";\n try{await api("/api/unanswered/status",{method:"POST",body:JSON.stringify({id,status,kbId})});toast(status==="\u672A\u8655\u7406"?"\u5DF2\u6539\u56DE\u672A\u8655\u7406":`\u5DF2\u6A19\u70BA${status}`);loadUnanswered()}catch(e){toast(e.message,4000)}}\n\n// ---------- \u7248\u672C\u7D00\u9304 ----------\nasync function viewHist(){const m=$("#main");m.innerHTML=`<div class="card"><h3 style="margin-top:0">\u7248\u672C\u7D00\u9304</h3><p class="mute">\u6BCF\u6B21\u5728\u5F8C\u53F0\u5132\u5B58\u524D\uFF0C\u7CFB\u7D71\u6703\u628A\u300C\u88AB\u53D6\u4EE3\u7684\u820A\u7248\u672C\u300D\u5B8C\u6574\u5099\u4EFD\u4E00\u4EFD\u3002\u6309\u300C\u6AA2\u8996\u300D\u53EF\u770B\u548C\u73FE\u5728\u7684\u5DEE\u7570\uFF0C\u518D\u6C7A\u5B9A\u662F\u5426\u9084\u539F\u3002\u9084\u539F\u672C\u8EAB\u4E5F\u6703\u5148\u5099\u4EFD\u76EE\u524D\u7248\u672C\u3002</p><div id="hl">\u8F09\u5165\u4E2D\u2026</div></div>`;\n const d=await api("/api/kb/history");$("#hl").innerHTML=d.items.length?`<table><tr><th>\u5099\u4EFD\u6642\u9593</th><th>\u7576\u6642\u52D5\u4F5C</th><th></th></tr>${d.items.map(i=>`<tr><td>${esc((i.savedAt||"").replace("T"," ").replace("+08:00",""))}</td><td>${esc(i.note)}\uFF08\u6B64\u52D5\u4F5C\u4E4B\u524D\u7684\u7248\u672C\uFF09</td><td><button class="btn sm" data-k="${esc(i.key)}">\u6AA2\u8996</button></td></tr>`).join("")}</table>`:"<p class=mute>\u9084\u6C92\u6709\u5099\u4EFD\u3002</p>";\n document.querySelectorAll("#hl button").forEach(b=>b.onclick=()=>histView(b.dataset.k))}\nasync function histView(key){const d=await api("/api/kb/history/view?key="+encodeURIComponent(key));const kb=await api("/api/kb?q=__none__");\n const w=modal(`<div class="row"><b style="flex:1">\u7248\u672C ${esc(key.replace("kb/history/",""))}</b><button class="btn sm" id="x">\u95DC\u9589</button></div><p>\u6B64\u7248\u672C\u5171 ${fmt(d.entries)} \u689D\u3002${d.sameAsCurrent?"<b>\u8207\u76EE\u524D\u5167\u5BB9\u5B8C\u5168\u76F8\u540C\u3002</b>":`\u8207\u76EE\u524D\u76F8\u6BD4\u6709 ${d.diffCount} \u689D\u4E0D\u540C\uFF1A`}</p>\n${d.diff.length?`<table>${d.diff.map(x=>`<tr><td class="id">${x.id}</td><td>${esc(x.change)}</td></tr>`).join("")}</table>`:""}<div class="row" style="margin-top:12px"><div class="sp"></div><button class="btn pri" id="rs" ${d.sameAsCurrent?"disabled":""}>\u9084\u539F\u6210\u9019\u500B\u7248\u672C</button></div>`);\n $("#x",w).onclick=()=>w.remove();$("#rs",w).onclick=async()=>{if(!confirm("\u78BA\u5B9A\u9084\u539F\uFF1F\u76EE\u524D\u7248\u672C\u6703\u5148\u81EA\u52D5\u5099\u4EFD\u3002"))return;try{await api("/api/kb/restore",{method:"POST",body:JSON.stringify({key,etag:kb.etag})});toast("\u5DF2\u9084\u539F");w.remove();viewHist()}catch(err){toast(err.message,4000)}}}\n\n// ---------- \u7528\u91CF ----------\nfunction viewUsage(){const m=$("#main");m.innerHTML=`<div class="card row"><span class="seg" id="uk"><button data-k="gemini">Gemini</button><button data-k="grok">Grok Bot</button></span><div class="sp"></div>\n<span class="seg" id="ur"><button data-r="today">\u4ECA\u5929</button><button data-r="7d">7 \u5929</button><button data-r="30d">30 \u5929</button><button data-r="month">\u672C\u6708</button></span></div><div id="ub">\u8F09\u5165\u4E2D\u2026</div>`;\n const sync=()=>{document.querySelectorAll("#uk button").forEach(b=>b.classList.toggle("on",b.dataset.k===S.ukind));document.querySelectorAll("#ur button").forEach(b=>b.classList.toggle("on",b.dataset.r===S.range))};\n document.querySelectorAll("#uk button").forEach(b=>b.onclick=()=>{S.ukind=b.dataset.k;sync();loadUsage()});document.querySelectorAll("#ur button").forEach(b=>b.onclick=()=>{S.range=b.dataset.r;sync();loadUsage()});sync();loadUsage()}\nfunction bars(days,series,h=170){const W=Math.max(320,days.length*34),pad=34,ch=h-40;let max=Math.max(4,...days.map(d=>series.reduce((s,x)=>s+(x.get(d)||0),0)));{const m=Math.pow(10,Math.floor(Math.log10(max/4)));max=Math.ceil(max/4/m)*m*4}const bw=Math.max(8,(W-pad-10)/days.length-6);\n let g=`<svg width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" font-size="11" fill="#6b7280">`;for(let i=0;i<=4;i++){const y=10+ch-ch*i/4;g+=`<line x1="${pad}" x2="${W}" y1="${y}" y2="${y}" stroke="#eee"/><text x="${pad-4}" y="${y+4}" text-anchor="end">${fmt(Math.round(max*i/4))}</text>`}\n days.forEach((d,i)=>{const x=pad+6+i*((W-pad-10)/days.length);let y=10+ch;series.forEach(s=>{const v=s.get(d)||0;const bh=ch*v/max;y-=bh;if(v)g+=`<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="2" fill="${s.color}"><title>${d.date} ${s.name}\uFF1A${fmt(v)}</title></rect>`});\n if(days.length<=31&&(days.length<=10||i%Math.ceil(days.length/10)===0))g+=`<text x="${x+bw/2}" y="${h-14}" text-anchor="middle">${d.date.slice(5)}</text>`});return `<div class="chart">${g}</svg></div>`+`<div class="row mute" style="font-size:13px">${series.map(s=>`<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${s.color}"></span> ${s.name}</span>`).join("")}</div>`}\nconst OUT={answered:"Gemini \u76F4\u63A5\u56DE\u7B54",escalated:"\u8F49\u7D66 Grok\uFF08\u7B54\u4E0D\u51FA\uFF09",error:"\u932F\u8AA4",unknown:"\u672A\u6A19"};\nconst REASON={escalate:"Gemini \u5224\u65B7\u8981\u8F49",gemini_empty:"Gemini \u6C92\u56DE\u5167\u5BB9",gemini_error:"Gemini \u932F\u8AA4",gemini_timeout:"Gemini \u903E\u6642",gemini_quota:"Gemini \u984D\u5EA6\u7528\u5B8C",no_gemini_key:"\u672A\u8A2D\u5B9A Gemini \u91D1\u9470",tingting:"\u5A77\u5A77\u672C\u4EBA\u8A0A\u606F",quote_media:"\u5F15\u7528\u5716\u7247\uFF0F\u6A94\u6848",kb_admin:"\u8981\u6C42\u52A0\u77E5\u8B58\u5EAB",not_question:"\u4E0D\u662F\u554F\u984C\uFF08\u9592\u804A\u7B49\uFF09",image:"\u5716\u7247",file:"\u6A94\u6848",audio:"\u8A9E\u97F3",video:"\u5F71\u7247",sticker:"\u8CBC\u5716",join:"\u52A0\u5165\u7FA4\u7D44",leave:"\u96E2\u958B\u7FA4\u7D44",memberJoined:"\u6210\u54E1\u52A0\u5165",memberLeft:"\u6210\u54E1\u96E2\u958B",follow:"\u52A0\u597D\u53CB",unfollow:"\u5C01\u9396",non_text:"\u975E\u6587\u5B57\u8A0A\u606F",non_message:"\u975E\u8A0A\u606F\u4E8B\u4EF6"};\nfunction kv(obj,map={}){const e=Object.entries(obj||{}).sort((a,b)=>b[1]-a[1]);const t=e.reduce((s,x)=>s+x[1],0);return e.length?`<table>${e.map(([k,v])=>`<tr><td>${esc(map[k]||k)} <span class="mute">${map[k]?esc(k):""}</span></td><td class="n">${fmt(v)}</td><td class="n mute">${t?Math.round(v*100/t):0}%</td></tr>`).join("")}</table>`:"<p class=mute>\u6C92\u6709\u8CC7\u6599</p>"}\nfunction merge(days,f){const o={};days.forEach(d=>Object.entries(d[f]||{}).forEach(([k,v])=>o[k]=(o[k]||0)+v));return o}\nasync function loadUsage(){const ub=$("#ub");ub.innerHTML="<div class=card>\u8F09\u5165\u4E2D\u2026</div>";let d;try{d=await api(`/api/usage?kind=${S.ukind}&range=${S.range}`)}catch(e){ub.innerHTML=`<div class=card>${esc(e.message)}</div>`;return}\n const days=d.days;const part=d.partial?`<div class="warnbox" style="margin-bottom:14px">\u8CC7\u6599\u91CF\u8F03\u5927\uFF0C\u9019\u6B21\u53EA\u7B97\u4E86\u4E00\u90E8\u5206\uFF0C\u8ACB\u7A0D\u5F8C\u91CD\u65B0\u6574\u7406\u4E00\u6B21\u3002</div>`:"";\n const rng=`<div class="mute" style="margin-bottom:8px">\u671F\u9593\uFF1A${d.start} \uFF5E ${d.end}\uFF08\u53F0\u5317\u6642\u9593\uFF09</div>`;\n if(S.ukind==="gemini"){const T=k=>days.reduce((s,x)=>s+(x[k]||0),0);const calls=T("calls");const ln=T("latencyN");const lat=ln?Math.round(T("latencySum")/ln):0;const oc=merge(days,"outcomes");\n  ub.innerHTML=part+rng+`<div class="stats" style="margin-bottom:14px">${[["\u547C\u53EB\u6B21\u6578",fmt(calls)],["\u76F4\u63A5\u56DE\u7B54",fmt(oc.answered||0)],["\u8F49\u7D66 Grok",fmt(oc.escalated||0)],["\u932F\u8AA4",fmt(oc.error||0)],["\u7E3D tokens",fmt(T("totalTokens"))],["\u5E73\u5747\u56DE\u61C9",lat?(lat/1000).toFixed(1)+" \u79D2":"\u2014"]].map(([a,b])=>`<div class="stat"><small>${a}</small><b>${b}</b></div>`).join("")}</div>\n  ${calls?"":`<div class="note" style="margin-bottom:14px">\u9019\u6BB5\u671F\u9593\u9084\u6C92\u6709 Gemini \u7528\u91CF\u7D00\u9304\u3002\u7D00\u9304\u7531 LINE \u8F49\u767C\u7A0B\u5F0F\u5BEB\u5165\uFF0C\u4E0A\u7DDA\u5F8C\u624D\u6703\u958B\u59CB\u7D2F\u7A4D\u3002</div>`}\n  <div class="card"><h3 style="margin-top:0">\u6BCF\u65E5\u547C\u53EB\u6B21\u6578</h3>${bars(days,[{name:"\u76F4\u63A5\u56DE\u7B54",color:"#16a34a",get:x=>x.outcomes?.answered},{name:"\u8F49\u7D66 Grok",color:"#f59e0b",get:x=>x.outcomes?.escalated},{name:"\u932F\u8AA4",color:"#dc2626",get:x=>x.outcomes?.error},{name:"\u5176\u4ED6",color:"#9ca3af",get:x=>(x.calls||0)-(x.outcomes?.answered||0)-(x.outcomes?.escalated||0)-(x.outcomes?.error||0)}])}</div>\n  <div class="card"><h3 style="margin-top:0">\u6BCF\u65E5 tokens</h3>${bars(days,[{name:"\u8F38\u5165 (prompt)",color:"#2563eb",get:x=>x.promptTokens},{name:"\u8F38\u51FA (candidates)",color:"#c2410c",get:x=>x.candidatesTokens},{name:"\u5176\u4ED6\uFF08\u601D\u8003\u7B49\uFF0Ctotal \u6263\u9664\u524D\u5169\u9805\uFF09",color:"#a78bfa",get:x=>Math.max(0,(x.totalTokens||0)-(x.promptTokens||0)-(x.candidatesTokens||0))}])}\n  <table style="margin-top:10px"><tr><th>\u65E5\u671F</th><th class="n">\u6B21\u6578</th><th class="n">\u8F38\u5165</th><th class="n">\u8F38\u51FA</th><th class="n">\u7E3D\u8A08</th><th class="n">\u5E73\u5747\u79D2</th></tr>${days.slice().reverse().map(x=>`<tr><td>${x.date}</td><td class="n">${fmt(x.calls)}</td><td class="n">${fmt(x.promptTokens)}</td><td class="n">${fmt(x.candidatesTokens)}</td><td class="n">${fmt(x.totalTokens)}</td><td class="n">${x.latencyN?(x.latencySum/x.latencyN/1000).toFixed(1):"\u2014"}</td></tr>`).join("")}</table></div>\n  <div class="stats"><div class="card"><h3 style="margin-top:0">\u7D50\u679C</h3>${kv(oc,OUT)}</div><div class="card"><h3 style="margin-top:0">\u6A21\u578B</h3>${kv(merge(days,"models"))}</div><div class="card"><h3 style="margin-top:0">\u4F86\u6E90</h3>${kv(merge(days,"chatTypes"),{user:"\u79C1\u8A0A",group:"\u7FA4\u7D44",room:"\u591A\u4EBA\u804A\u5929\u5BA4"})}</div></div>\n  <div class="note">Gemini \u8D70 LINE \u7684 reply\uFF08\u56DE\u8986\uFF09\u65B9\u5F0F\uFF0C\u4E0D\u4F54 LINE \u6BCF\u6708\u63A8\u64AD\u984D\u5EA6\u3002Gemini \u7684\u8CBB\u7528\u8207\u514D\u8CBB\u984D\u5EA6\u8ACB\u5230 Google AI Studio \u67E5\u770B\uFF1B\u9019\u88E1\u53EA\u7D71\u8A08\u6B21\u6578\u548C tokens\u3002</div>`}\n else{const total=days.reduce((s,x)=>s+(x.count||0),0);let share={items:[]};try{share=await api("/api/grok-share")}catch{}\n  ub.innerHTML=part+rng+`<div class="warnbox" style="margin-bottom:14px"><b>Grok Bot \u4F54\u6BCF\u9031\u7528\u91CF\u4E0A\u9650\u7684\u767E\u5206\u6BD4\uFF0C\u7121\u6CD5\u81EA\u52D5\u8B80\u53D6\u3002</b>\u8ACB\u5728 Grok Bot App \u7684\u300CUsage &amp; Billing\uFF08\u7528\u91CF\u8207\u5E33\u55AE\uFF09\u300D\u67E5\u770B\uFF0C\u9700\u8981\u7684\u8A71\u53EF\u4EE5\u624B\u52D5\u8A18\u5728\u4E0B\u65B9\u3002\u9019\u88E1\u7D71\u8A08\u7684\u662F\u300C\u8F49\u7D66 Grok Bot \u8655\u7406\u7684\u6B21\u6578\u300D\u3002</div>\n  <div class="stats" style="margin-bottom:14px"><div class="stat"><small>\u8F49\u7D66 Grok Bot \u6B21\u6578</small><b>${fmt(total)}</b></div><div class="stat"><small>\u5E73\u5747\u6BCF\u5929</small><b>${days.length?(total/days.length).toFixed(1):0}</b></div></div>\n  ${total?"":`<div class="note" style="margin-bottom:14px">\u9019\u6BB5\u671F\u9593\u9084\u6C92\u6709\u8F49\u7D66 Grok Bot \u7684\u7D00\u9304\u3002\u7D00\u9304\u7531 LINE \u8F49\u767C\u7A0B\u5F0F\u5BEB\u5165\uFF0C\u4E0A\u7DDA\u5F8C\u624D\u6703\u958B\u59CB\u7D2F\u7A4D\u3002</div>`}\n  <div class="card"><h3 style="margin-top:0">\u6BCF\u65E5\u8F49\u7D66 Grok Bot \u6B21\u6578</h3>${bars(days,[{name:"\u6B21\u6578",color:"#7c3aed",get:x=>x.count}])}</div>\n  <div class="card"><h3 style="margin-top:0">\u8F49\u9001\u539F\u56E0</h3>${kv(merge(days,"reasons"),REASON)}</div>\n  <div class="card"><h3 style="margin-top:0">\u624B\u52D5\u8A18\u9304\uFF1AGrok Bot \u6BCF\u9031\u7528\u91CF %</h3><div class="row"><input type="date" id="sd"><input type="number" id="sp" placeholder="\u4F8B\u5982 35" min="0" max="100" step="0.1" style="width:110px"><span>%</span><input id="sn" placeholder="\u5099\u8A3B\uFF08\u9078\u586B\uFF09" style="flex:1;min-width:140px"><button class="btn pri" id="ss">\u8A18\u4E0B</button></div>\n  ${share.items.length?`<table style="margin-top:10px"><tr><th>\u65E5\u671F</th><th class="n">%</th><th>\u5099\u8A3B</th><th></th></tr>${share.items.map(i=>`<tr><td>${i.date}</td><td class="n">${i.percent}</td><td>${esc(i.note)}</td><td><button class="btn sm bad" data-d="${i.date}">\u522A</button></td></tr>`).join("")}</table>`:`<p class="mute">\u9084\u6C92\u6709\u624B\u52D5\u7D00\u9304\u3002</p>`}</div>\n  <div class="note">LINE \u63A8\u64AD\u984D\u5EA6\uFF1AGrok Bot \u7684\u56DE\u8986\u8D70 LINE push\uFF08\u63A8\u64AD\uFF09\uFF0C\u6BCF\u5247\u90FD\u7B97\u9032 LINE \u5B98\u65B9\u5E33\u865F\u7684\u6BCF\u6708\u984D\u5EA6\uFF08\u50B3\u5230\u7FA4\u7D44\u6642\uFF0C\u4F9D\u7FA4\u7D44\u4EBA\u6578\u8A08\u7B97\uFF09\u3002\u5269\u9918\u984D\u5EA6\u8ACB\u5230 LINE Official Account Manager \u67E5\u770B\u3002</div>`;\n  $("#sd").value=new Date(Date.now()+8*3600e3).toISOString().slice(0,10);\n  $("#ss").onclick=async()=>{try{await api("/api/grok-share",{method:"POST",body:JSON.stringify({date:$("#sd").value,percent:$("#sp").value,note:$("#sn").value})});toast("\u5DF2\u8A18\u4E0B");loadUsage()}catch(e){toast(e.message)}};\n  document.querySelectorAll("button[data-d]").forEach(b=>b.onclick=async()=>{if(!confirm("\u522A\u9664\u9019\u7B46\u624B\u52D5\u7D00\u9304\uFF1F"))return;await api("/api/grok-share?date="+b.dataset.d,{method:"DELETE"});loadUsage()})}}\n\napi("/api/me").then(shell).catch(()=>{});\n<\/script>\n</body>\n</html>\n';

// src/unanswered.js
function parseUnanswered(md) {
  const items = [];
  const lines = String(md || "").replace(/\r/g, "").split("\n");
  lines.forEach((raw, i) => {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("|")) return;
    const body = trimmed.replace(/^[-*]\s+/, "");
    const m = body.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}))?(.*)$/);
    if (!m) return;
    const date = m[1];
    const time = m[2] ? String(m[2]).replace(/^(\d):/, "0$1") : "";
    const key = (m[3] || "").trim().replace(/^[：:]\s*/, "");
    if (!key) return;
    const { question, extra } = splitQuestion(key);
    items.push({ date, time, question: question || key, extra, key, lineNo: i + 1 });
  });
  items.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.time && b.time && a.time !== b.time) return a.time < b.time ? 1 : -1;
    return b.lineNo - a.lineNo;
  });
  return items;
}
__name(parseUnanswered, "parseUnanswered");
function splitQuestion(key) {
  let rest = key;
  const extra = [];
  const lead = rest.match(/^(（[^）]*）)\s*[：:]?\s*/);
  if (lead && /群組|引用|私訊|1\s*:\s*1|LINE/.test(lead[1])) {
    extra.push(lead[1].replace(/^（|）$/g, ""));
    rest = rest.slice(lead[0].length).trim().replace(/^[：:]\s*/, "");
  }
  const arrow = rest.match(/\s*→\s*(.+)$/);
  if (arrow) {
    extra.push(arrow[1].trim());
    rest = rest.slice(0, arrow.index).trim();
  }
  const answered = rest.match(/（已由婷婷[^）]*）\s*$/);
  if (answered) {
    extra.push(answered[0].replace(/^（|）$/g, ""));
    rest = rest.slice(0, answered.index).trim();
  }
  return { question: rest, extra: extra.join("\uFF1B") };
}
__name(splitQuestion, "splitQuestion");
async function unansweredId(date, key) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${date}
${key}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
__name(unansweredId, "unansweredId");
var UNANSWERED_STATUSES = ["\u672A\u8655\u7406", "\u5DF2\u88DC\u9032\u77E5\u8B58\u5EAB", "\u4E0D\u7528\u88DC"];

// src/kbgraph.js
var GROUPS = [
  ["\u8003\u984C\u8207\u8A66\u984C", /考題|試題/],
  ["LINE \u7FA4\u7D44\u88DC\u5145", /群組補充/],
  ["\u50AC\u6536\u8207\u6CD5\u52D9", /催收|存證|調解|本票|強制執行|家訪/],
  ["\u89E3\u7D04\u3001\u9EDE\u4EA4\u8207\u7E8C\u7D04", /解約|點交|契約變更|續約/],
  ["\u9032\u4EF6\u3001\u5BE9\u4EF6\u8207\u9001\u5BE9", /進件|審件|送審|案件類型|簽呈/],
  ["\u5408\u7D04\u8207\u5BE6\u50F9\u767B\u9304", /合約|實價登錄/],
  ["\u88DC\u52A9\u3001\u79DF\u91D1\u8207\u7A05\u52D9", /補助|租補|租金|公證|稅務|信任租/],
  ["\u7269\u4EF6\u8207\u623F\u6771\u623F\u5BA2", /物件|房客|房東|場勘/],
  ["\u734E\u91D1\u3001\u8003\u6838\u8207\u7E3E\u6548", /獎金|業績|考核|KPI|計點|QA制度|週會/],
  ["\u7CFB\u7D71\u8207\u8A66\u7B97\u8868", /系統|試算表/],
  ["\u4EBA\u4E8B\u8207\u884C\u653F", /人事|離職|行政/],
  ["\u898F\u7AE0\u8207\u8981\u9EDE", /執行要點|公會|期數|詞典/],
  ["\u696D\u52D9\u8207\u79DF\u7BA1", /業務|租管|591/]
];
function groupOf(section) {
  for (const [name, re] of GROUPS) if (re.test(section || "")) return name;
  return "\u5176\u4ED6";
}
__name(groupOf, "groupOf");
function plain(info) {
  const body = info.block.split("\n").slice(1).filter((l) => l && !/^- (回答者|狀態|最後更新|來源|來源檔)：/.test(l)).join(" ").replace(/\*\*(常見問法|答案)：\*\*/g, " ");
  return `${info.title} ${info.title} ${info.questions} ${body}`;
}
__name(plain, "plain");
function bigrams(text) {
  const t = String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ");
  const m = /* @__PURE__ */ new Map();
  for (const w of t.split(" ")) {
    if (!w) continue;
    if (/^[a-z0-9]+$/.test(w)) {
      if (w.length > 1) m.set(w, (m.get(w) || 0) + 1);
      continue;
    }
    for (let i = 0; i < w.length - 1; i++) {
      const g = w.slice(i, i + 2);
      m.set(g, (m.get(g) || 0) + 1);
    }
  }
  return m;
}
__name(bigrams, "bigrams");
function buildGraph(infos, { k = 3, minSim = 0.12, dupSim = 0.8 } = {}) {
  const N = infos.length;
  const tfs = infos.map((e) => bigrams(plain(e)));
  const df = /* @__PURE__ */ new Map();
  for (const tf of tfs) for (const g of tf.keys()) df.set(g, (df.get(g) || 0) + 1);
  const maxDf = Math.max(20, N * 0.12);
  const post = /* @__PURE__ */ new Map();
  tfs.forEach((tf, i) => {
    const v = [];
    let norm = 0;
    for (const [g, c] of tf) {
      const d = df.get(g);
      if (d < 2 || d > maxDf) continue;
      const w = (1 + Math.log(c)) * Math.log(N / d);
      v.push([g, w]);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [g, w] of v) {
      let p = post.get(g);
      if (!p) post.set(g, p = []);
      p.push(i, w / norm);
    }
  });
  const sims = Array.from({ length: N }, () => []);
  const acc = new Float64Array(N);
  const touched = [];
  for (let i = 0; i < N; i++) {
    for (const [g] of tfs[i]) {
      const p = post.get(g);
      if (!p) continue;
      let wi = 0;
      for (let j = 0; j < p.length; j += 2) if (p[j] === i) {
        wi = p[j + 1];
        break;
      }
      if (!wi) continue;
      for (let j = 0; j < p.length; j += 2) {
        const o = p[j];
        if (o <= i) continue;
        if (acc[o] === 0) touched.push(o);
        acc[o] += wi * p[j + 1];
      }
    }
    for (const o of touched) {
      const s = acc[o];
      acc[o] = 0;
      if (s >= minSim) {
        sims[i].push([o, s]);
        sims[o].push([i, s]);
      }
    }
    touched.length = 0;
  }
  const edges = /* @__PURE__ */ new Map();
  const dups = [];
  for (let i = 0; i < N; i++) {
    sims[i].sort((a, b) => b[1] - a[1]);
    for (const [o, s] of sims[i].slice(0, k)) {
      const key = i < o ? `${i}-${o}` : `${o}-${i}`;
      if (!edges.has(key)) edges.set(key, { s: i < o ? i : o, t: i < o ? o : i, w: Math.round(s * 1e3) / 1e3 });
    }
    for (const [o, s] of sims[i]) if (o > i && s >= dupSim) dups.push({ a: infos[i].id, b: infos[o].id, sim: Math.round(s * 1e3) / 1e3 });
  }
  for (const d of dups) {
    const i = infos.findIndex((e) => e.id === d.a), o = infos.findIndex((e) => e.id === d.b);
    const key = `${i}-${o}`;
    if (edges.has(key)) edges.get(key).dup = true;
    else edges.set(key, { s: i, t: o, w: d.sim, dup: true });
  }
  dups.sort((a, b) => b.sim - a.sim);
  const dupIds = new Set(dups.flatMap((d) => [d.a, d.b]));
  const nodes = infos.map((e) => ({
    id: e.id,
    title: e.title,
    part: e.part,
    section: e.section,
    group: groupOf(e.section),
    status: e.status || "\u672A\u6A19",
    pending: /待確認/.test(e.status || "") || /待確認/.test(e.title),
    dup: dupIds.has(e.id)
  }));
  const sections = {};
  const groups = {};
  for (const n of nodes) {
    sections[n.section] = sections[n.section] || { name: n.section, group: n.group, part: n.part, count: 0 };
    sections[n.section].count++;
    groups[n.group] = (groups[n.group] || 0) + 1;
  }
  return {
    nodes,
    links: [...edges.values()].map((e) => ({ source: nodes[e.s].id, target: nodes[e.t].id, w: e.w, ...e.dup ? { dup: true } : {} })),
    sections: Object.values(sections),
    groups,
    dups,
    params: { k, minSim, dupSim }
  };
}
__name(buildGraph, "buildGraph");

// src/index.js
var KB_KEY = "kb/kb.md";
var META_KEY = "kb/meta.json";
var UNANSWERED_KEY = "kb/unanswered.md";
var UNANSWERED_STATUS_KEY = "kb/unanswered-status.json";
var COOKIE = "tt_admin";
var SESSION_DAYS = 7;
var enc = new TextEncoder();
var json = /* @__PURE__ */ __name((data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } }), "json");
function taipei(ms = Date.now()) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const g = /* @__PURE__ */ __name((t) => p.find((x) => x.type === t).value, "g");
  const date = `${g("year")}-${g("month")}-${g("day")}`;
  return { date, iso: `${date}T${g("hour")}:${g("minute")}:${g("second")}+08:00`, compact: `${g("year")}${g("month")}${g("day")}-${g("hour")}${g("minute")}${g("second")}` };
}
__name(taipei, "taipei");
function addDays(date, n) {
  const d = /* @__PURE__ */ new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
__name(addDays, "addDays");
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(hmac, "hmac");
async function safeEqual(a, b) {
  const k = "cmp";
  const [x, y] = await Promise.all([hmac(k, String(a)), hmac(k, String(b))]);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.min(x.length, y.length); i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0 && String(a).length === String(b).length;
}
__name(safeEqual, "safeEqual");
function sessionSecret(env) {
  return (env.SESSION_SECRET || "") + "|" + (env.ADMIN_PASSWORD || "");
}
__name(sessionSecret, "sessionSecret");
async function makeSession(env) {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const body = `v1.${exp}`;
  return `${body}.${await hmac(sessionSecret(env), body)}`;
}
__name(makeSession, "makeSession");
async function checkSession(req, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const c = req.headers.get("cookie") || "";
  const m = c.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [v, exp, sig] = m[1].split(".");
  if (v !== "v1" || !exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(sessionSecret(env), `${v}.${exp}`));
}
__name(checkSession, "checkSession");
var cache = { etag: null, text: null, segs: null };
var graphCache = { etag: null, ver: null, data: null };
async function loadKb(env) {
  const head = await env.MEDIA.head(KB_KEY);
  if (!head) return { missing: true };
  if (cache.etag === head.etag && cache.segs) return { ...cache };
  const obj = await env.MEDIA.get(KB_KEY);
  if (!obj) return { missing: true };
  const text = await obj.text();
  cache = { etag: obj.etag, text, segs: segment(text), uploaded: obj.uploaded };
  return { ...cache };
}
__name(loadKb, "loadKb");
async function saveKb(env, { baseEtag, newText, oldText, note }) {
  const t = taipei();
  const histKey = `kb/history/${t.compact}-${String(Date.now() % 1e3).padStart(3, "0")}-${crypto.randomUUID().slice(0, 4)}.md`;
  await env.MEDIA.put(histKey, oldText, { httpMetadata: { contentType: "text/markdown; charset=utf-8" }, customMetadata: { note: encodeURIComponent(note || ""), savedAt: t.iso, replacedEtag: baseEtag } });
  const put = await env.MEDIA.put(KB_KEY, newText, { onlyIf: { etagMatches: baseEtag }, httpMetadata: { contentType: "text/markdown; charset=utf-8" } });
  if (!put) {
    await env.MEDIA.delete(histKey);
    return { conflict: true };
  }
  const kbEntries = segment(newText).filter((x) => x.type === "entry").length;
  await env.MEDIA.put(META_KEY, JSON.stringify({ updatedAt: t.iso, source: "admin", note: note || "", etag: put.etag, history: histKey, kbEntries }), { httpMetadata: { contentType: "application/json" } });
  cache = { etag: null, text: null, segs: null };
  return { ok: true, etag: put.etag, history: histKey, kbEntries };
}
__name(saveKb, "saveKb");
function listEntries(segs) {
  return segs.filter((s) => s.type === "entry").map((s) => entryInfo(s));
}
__name(listEntries, "listEntries");
async function listAll(env, prefix) {
  const keys = [];
  let cursor;
  do {
    const r = await env.MEDIA.list({ prefix, cursor, limit: 1e3 });
    keys.push(...r.objects.map((o) => o.key));
    cursor = r.truncated ? r.cursor : void 0;
  } while (cursor);
  return keys;
}
__name(listAll, "listAll");
function emptyAgg(kind) {
  return kind === "gemini" ? { calls: 0, promptTokens: 0, candidatesTokens: 0, totalTokens: 0, latencySum: 0, latencyN: 0, outcomes: {}, models: {}, chatTypes: {} } : { count: 0, reasons: {} };
}
__name(emptyAgg, "emptyAgg");
function addRec(kind, a, r) {
  if (kind === "gemini") {
    a.calls++;
    a.promptTokens += Number(r.promptTokens) || 0;
    a.candidatesTokens += Number(r.candidatesTokens) || 0;
    a.totalTokens += Number(r.totalTokens) || 0;
    if (Number.isFinite(Number(r.latencyMs)) && r.latencyMs !== null) {
      a.latencySum += Number(r.latencyMs);
      a.latencyN++;
    }
    const o = r.outcome || "unknown";
    a.outcomes[o] = (a.outcomes[o] || 0) + 1;
    const m = r.model || "unknown";
    a.models[m] = (a.models[m] || 0) + 1;
    const c = r.chatType || "unknown";
    a.chatTypes[c] = (a.chatTypes[c] || 0) + 1;
  } else {
    a.count++;
    const k = r.reason || "unknown";
    a.reasons[k] = (a.reasons[k] || 0) + 1;
  }
}
__name(addRec, "addRec");
async function dayAgg(env, kind, date, today, budget) {
  const rollKey = `usage/rollup/${kind}/${date}.json`;
  const keys = await listAll(env, `usage/${kind}/${date}/`);
  if (!keys.length) return { date, ...emptyAgg(kind), partial: false };
  if (date < today) {
    const cached = await env.MEDIA.get(rollKey);
    if (cached) {
      const c = await cached.json();
      if (c.records === keys.length) return { ...c, cached: true };
    }
  }
  const agg = emptyAgg(kind);
  let partial = false;
  for (let i = 0; i < keys.length; i += 40) {
    if (budget.left <= 0) {
      partial = true;
      break;
    }
    const batch = keys.slice(i, Math.min(i + 40, i + budget.left));
    budget.left -= batch.length;
    const objs = await Promise.all(batch.map((k) => env.MEDIA.get(k).then((o) => o ? o.json() : null).catch(() => null)));
    for (const r of objs) if (r) addRec(kind, agg, r);
  }
  const out = { date, ...agg, records: keys.length, partial };
  if (date < today && !partial) {
    await env.MEDIA.put(rollKey, JSON.stringify(out), { httpMetadata: { contentType: "application/json" } });
  }
  return out;
}
__name(dayAgg, "dayAgg");
async function usage(env, kind, range) {
  const today = taipei().date;
  let start = today;
  if (range === "7d") start = addDays(today, -6);
  else if (range === "30d") start = addDays(today, -29);
  else if (range === "month") start = today.slice(0, 8) + "01";
  const days = [];
  for (let d = start; d <= today; d = addDays(d, 1)) days.push(d);
  const budget = { left: 800 };
  const rows = [];
  for (const d of days) rows.push(await dayAgg(env, kind, d, today, budget));
  return { kind, range, start, end: today, days: rows, partial: rows.some((r) => r.partial) };
}
__name(usage, "usage");
async function loadUnansweredStatus(env) {
  const o = await env.MEDIA.get(UNANSWERED_STATUS_KEY);
  if (!o) return {};
  const data = await o.json().catch(() => null);
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}
__name(loadUnansweredStatus, "loadUnansweredStatus");
async function listUnanswered(env) {
  const obj = await env.MEDIA.get(UNANSWERED_KEY);
  if (!obj) return { missing: true, items: [], counts: { total: 0, \u672A\u8655\u7406: 0, \u5DF2\u88DC\u9032\u77E5\u8B58\u5EAB: 0, \u4E0D\u7528\u88DC: 0 } };
  const parsed = parseUnanswered(await obj.text());
  const store = await loadUnansweredStatus(env);
  const items = [];
  for (const it of parsed) {
    const id = await unansweredId(it.date, it.key);
    const rec = store[id] && typeof store[id] === "object" ? store[id] : {};
    if (rec.deleted) continue;
    const status = UNANSWERED_STATUSES.includes(rec.status) ? rec.status : "\u672A\u8655\u7406";
    items.push({
      id,
      date: it.date,
      time: it.time || "",
      question: it.question,
      extra: it.extra || "",
      status,
      kbId: rec.kbId || "",
      note: rec.note || "",
      updatedAt: rec.updatedAt || ""
    });
  }
  const counts = { total: items.length, \u672A\u8655\u7406: 0, \u5DF2\u88DC\u9032\u77E5\u8B58\u5EAB: 0, \u4E0D\u7528\u88DC: 0 };
  for (const it of items) counts[it.status] = (counts[it.status] || 0) + 1;
  return { missing: false, items, counts, uploaded: obj.uploaded || null };
}
__name(listUnanswered, "listUnanswered");
var index_default = {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;
    const sec = { "x-frame-options": "DENY", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" };
    if (p === "/" || p === "/index.html") {
      return new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...sec } });
    }
    if (p === "/api/login" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      await new Promise((r) => setTimeout(r, 400));
      if (!env.ADMIN_PASSWORD || !await safeEqual(body.password || "", env.ADMIN_PASSWORD)) return json({ error: "\u5BC6\u78BC\u932F\u8AA4" }, 401);
      const tok = await makeSession(env);
      return json({ ok: true }, 200, { "set-cookie": `${COOKIE}=${tok}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}` });
    }
    if (p === "/api/logout") {
      return json({ ok: true }, 200, { "set-cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
    }
    if (!p.startsWith("/api/")) return new Response("Not found", { status: 404 });
    if (!await checkSession(req, env)) return json({ error: "\u672A\u767B\u5165" }, 401);
    if (req.method !== "GET" && req.headers.get("x-admin") !== "1") return json({ error: "bad request" }, 400);
    try {
      return await api(req, env, url, p);
    } catch (e) {
      console.error("api error", p, e && e.stack);
      return json({ error: "\u4F3A\u670D\u5668\u932F\u8AA4\uFF1A" + (e && e.message) }, 500);
    }
  }
};
async function api(req, env, url, p) {
  const method = req.method;
  if (p === "/api/me") return json({ ok: true });
  if (p === "/api/kb" && method === "GET") {
    const kb = await loadKb(env);
    if (kb.missing) return json({ missing: true, entries: [] });
    const meta = await env.MEDIA.get(META_KEY).then((o) => o ? o.json() : null).catch(() => null);
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const status = url.searchParams.get("status") || "";
    const part = url.searchParams.get("part") || "";
    const all = listEntries(kb.segs);
    const counts = { total: all.length, kb: all.filter((e) => e.part === 1).length, tb: all.filter((e) => e.part === 2).length, status: {} };
    for (const e of all) counts.status[e.status || "\u672A\u6A19"] = (counts.status[e.status || "\u672A\u6A19"] || 0) + 1;
    let rows = all;
    if (part) rows = rows.filter((e) => String(e.part) === part);
    if (status) rows = rows.filter((e) => (e.status || "\u672A\u6A19") === status);
    if (q) {
      const terms = q.split(/\s+/).filter(Boolean);
      rows = rows.filter((e) => {
        const hay = `${e.id} ${e.title} ${e.block}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      });
    }
    const sections = [];
    for (const e of all) if (!sections.find((s) => s.name === e.section && s.part === e.part)) sections.push({ name: e.section, part: e.part });
    return json({
      etag: kb.etag,
      meta,
      counts,
      sections,
      total: rows.length,
      entries: rows.map(({ block, ...r }) => ({ ...r, snippet: snippet(block, q) }))
    });
  }
  if (p === "/api/kb/graph" && method === "GET") {
    const kb = await loadKb(env);
    if (kb.missing) return json({ missing: true, nodes: [], links: [] });
    const ver = "v1";
    if (graphCache.etag === kb.etag && graphCache.ver === ver) return json(graphCache.data);
    const ckey = `cache/kb-graph/${ver}-${String(kb.etag).replace(/[^\w-]/g, "")}.json`;
    let data = await env.MEDIA.get(ckey).then((o) => o ? o.json() : null).catch(() => null);
    if (!data) {
      data = { etag: kb.etag, builtAt: taipei().iso, ...buildGraph(listEntries(kb.segs)) };
      await env.MEDIA.put(ckey, JSON.stringify(data), { httpMetadata: { contentType: "application/json; charset=utf-8" } }).catch(() => {
      });
    }
    graphCache = { etag: kb.etag, ver, data };
    return json(data);
  }
  const em = p.match(/^\/api\/kb\/entry\/((?:KB|TB)-\d+)$/);
  if (em && method === "GET") {
    const kb = await loadKb(env);
    if (kb.missing) return json({ error: "R2 \u5C1A\u7121\u77E5\u8B58\u5EAB" }, 404);
    const seg = kb.segs.find((s) => s.type === "entry" && s.id === em[1]);
    if (!seg) return json({ error: "\u627E\u4E0D\u5230\u689D\u76EE" }, 404);
    const info = entryInfo(seg);
    return json({ etag: kb.etag, ...info, form: parseForm(info.block) });
  }
  if (p === "/api/kb/save" && method === "POST") {
    const b = await req.json();
    const kb = await loadKb(env);
    if (kb.missing) return json({ error: "R2 \u5C1A\u7121\u77E5\u8B58\u5EAB" }, 404);
    if (b.etag !== kb.etag) return json({ error: "\u77E5\u8B58\u5EAB\u5DF2\u88AB\u5176\u4ED6\u4EBA\u6216\u7A0B\u5F0F\u66F4\u65B0\uFF0C\u8ACB\u91CD\u65B0\u8F09\u5165\u5F8C\u518D\u6539\u3002", conflict: true }, 409);
    const today = taipei().date;
    const segs = kb.segs.map((s) => ({ ...s }));
    let note = "";
    let targetId = b.id;
    if (b.action === "update" || b.action === "status") {
      const i = segs.findIndex((s) => s.type === "entry" && s.id === b.id);
      if (i < 0) return json({ error: "\u627E\u4E0D\u5230\u689D\u76EE" }, 404);
      const oldBlock = segs[i].lines.join("\n");
      let block;
      if (b.action === "status") {
        block = setUpdatedInBlock(setStatusInBlock(oldBlock, clean(b.status)), today);
        note = `${b.id} \u72C0\u614B\u6539\u70BA ${b.status}`;
      } else if (b.raw !== void 0) {
        block = String(b.raw).replace(/\r/g, "").replace(/\n+$/, "");
        const head = block.split("\n")[0].match(/^(#{2,4}) ((?:KB|TB)-\d+)\s+(.+)$/);
        if (!head || head[2] !== b.id) return json({ error: `\u7B2C\u4E00\u884C\u5FC5\u9808\u662F\u6A19\u984C\uFF0C\u4F8B\u5982\u300C${"#".repeat(segs[i].level)} ${b.id} \u984C\u76EE\u300D\uFF0C\u4E14\u7DE8\u865F\u4E0D\u53EF\u6539\u3002` }, 400);
        note = `${b.id} \u539F\u59CB\u5167\u5BB9\u4FEE\u6539`;
      } else {
        const form = parseForm(oldBlock);
        if (!form) return json({ error: "\u6B64\u689D\u76EE\u683C\u5F0F\u7279\u6B8A\uFF0C\u8ACB\u7528\u300C\u539F\u59CB Markdown\u300D\u7DE8\u8F2F\u3002" }, 400);
        let meta = setMeta(form.meta, "\u72C0\u614B", clean(b.status || ""), { addIfMissing: true });
        meta = setMeta(meta, "\u6700\u5F8C\u66F4\u65B0", today, { addIfMissing: b.id.startsWith("KB-") });
        block = buildBlock({ ...form, title: clean(b.title), questions: form.questions === null && !b.questions ? null : clean(b.questions || ""), answer: String(b.answer || "").replace(/\r/g, ""), meta });
        note = `${b.id} \u4FEE\u6539`;
      }
      if (/^#{1,6} /m.test(block.split("\n").slice(1).join("\n"))) return json({ error: "\u5167\u5BB9\u4E2D\u4E0D\u53EF\u4EE5\u6709\u4EE5 # \u958B\u982D\u7684\u6A19\u984C\u884C\uFF0C\u6703\u628A\u689D\u76EE\u5207\u58DE\u3002" }, 400);
      if (block === oldBlock) return json({ ok: true, unchanged: true });
      segs[i] = { ...segs[i], text: block + (segs[i].text.endsWith("\n") ? "\n" : "") };
    } else if (b.action === "delete") {
      const i = segs.findIndex((s) => s.type === "entry" && s.id === b.id);
      if (i < 0) return json({ error: "\u627E\u4E0D\u5230\u689D\u76EE" }, 404);
      segs.splice(i, 1);
      if (segs[i] && segs[i].type === "gap" && segs[i].trailing) segs.splice(i, 1);
      note = `${b.id} \u522A\u9664`;
    } else if (b.action === "add") {
      const part = Number(b.part) === 2 ? 2 : 1;
      const id = nextId(segs, part === 1 ? "KB" : "TB");
      targetId = id;
      if (!clean(b.title) || !String(b.answer || "").trim()) return json({ error: "\u984C\u76EE\u8207\u7B54\u6848\u5FC5\u586B" }, 400);
      const block = newBlock({ part, id, title: clean(b.title), questions: clean(b.questions || ""), answer: String(b.answer).replace(/\r/g, ""), status: clean(b.status || "\u78BA\u8A8D"), today, extraMeta: { answerer: clean(b.answerer || "") } });
      if (/^#{1,6} /m.test(block.split("\n").slice(1).join("\n"))) return json({ error: "\u5167\u5BB9\u4E2D\u4E0D\u53EF\u4EE5\u6709\u4EE5 # \u958B\u982D\u7684\u6A19\u984C\u884C\u3002" }, 400);
      let at = -1;
      segs.forEach((s, k) => {
        if (s.type === "entry" && s.part === part && (!b.section || s.section === b.section)) at = k;
      });
      if (at < 0) segs.forEach((s, k) => {
        if (s.type === "entry" && s.part === part) at = k;
      });
      if (at < 0) return json({ error: "\u627E\u4E0D\u5230\u63D2\u5165\u4F4D\u7F6E" }, 400);
      const ref = segs[at];
      let insertAt = at + 1;
      let sep = "\n";
      if (segs[insertAt] && segs[insertAt].type === "gap" && segs[insertAt].trailing) {
        sep = segs[insertAt].text;
        insertAt++;
      }
      const level = ref.level;
      const fixed = block.replace(/^#+ /, "#".repeat(level) + " ");
      if (sep === "") segs.splice(insertAt, 0, { type: "gap", text: "\n" }, { type: "entry", text: fixed + "\n" });
      else segs.splice(insertAt, 0, { type: "entry", text: fixed + "\n" }, { type: "gap", text: sep });
      note = `\u65B0\u589E ${id}`;
    } else {
      return json({ error: "unknown action" }, 400);
    }
    const newText = join(segs);
    const before = listEntries(kb.segs).length;
    const after = segment(newText).filter((s) => s.type === "entry").length;
    const expected = before + (b.action === "add" ? 1 : b.action === "delete" ? -1 : 0);
    if (after !== expected) return json({ error: `\u683C\u5F0F\u6AA2\u67E5\u5931\u6557\uFF08\u689D\u76EE\u6578 ${after}\uFF0C\u9810\u671F ${expected}\uFF09\uFF0C\u672A\u5132\u5B58\u3002` }, 400);
    const r = await saveKb(env, { baseEtag: kb.etag, newText, oldText: kb.text, note });
    if (r.conflict) return json({ error: "\u77E5\u8B58\u5EAB\u525B\u88AB\u66F4\u65B0\uFF0C\u8ACB\u91CD\u65B0\u8F09\u5165\u3002", conflict: true }, 409);
    return json({ ...r, id: targetId, note });
  }
  if (p === "/api/kb/history" && method === "GET") {
    const r = await env.MEDIA.list({ prefix: "kb/history/", limit: 1e3, include: ["customMetadata"] });
    const items = r.objects.map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded, note: decodeURIComponent(o.customMetadata?.note || ""), savedAt: o.customMetadata?.savedAt || "" })).sort((a, b) => a.key < b.key ? 1 : -1);
    return json({ items });
  }
  if (p === "/api/kb/history/view" && method === "GET") {
    const key = url.searchParams.get("key") || "";
    if (!/^kb\/history\/[\w.-]+\.md$/.test(key)) return json({ error: "bad key" }, 400);
    const o = await env.MEDIA.get(key);
    if (!o) return json({ error: "not found" }, 404);
    const text = await o.text();
    const kb = await loadKb(env);
    const cur = kb.missing ? [] : listEntries(kb.segs);
    const old = segment(text).filter((s) => s.type === "entry").map(entryInfo);
    const curMap = new Map(cur.map((e) => [e.id, e.block]));
    const oldMap = new Map(old.map((e) => [e.id, e.block]));
    const diff = [];
    for (const [id, blk] of oldMap) {
      if (!curMap.has(id)) diff.push({ id, change: "\u73FE\u5728\u5DF2\u522A\u9664\uFF08\u9084\u539F\u5F8C\u6703\u56DE\u4F86\uFF09" });
      else if (curMap.get(id) !== blk) diff.push({ id, change: "\u5167\u5BB9\u4E0D\u540C" });
    }
    for (const id of curMap.keys()) if (!oldMap.has(id)) diff.push({ id, change: "\u73FE\u5728\u65B0\u589E\u7684\uFF08\u9084\u539F\u5F8C\u6703\u6D88\u5931\uFF09" });
    return json({ key, entries: old.length, diff: diff.slice(0, 200), diffCount: diff.length, sameAsCurrent: !kb.missing && text === kb.text });
  }
  if (p === "/api/kb/restore" && method === "POST") {
    const b = await req.json();
    if (!/^kb\/history\/[\w.-]+\.md$/.test(b.key || "")) return json({ error: "bad key" }, 400);
    const kb = await loadKb(env);
    if (kb.missing) return json({ error: "R2 \u5C1A\u7121\u77E5\u8B58\u5EAB" }, 404);
    if (b.etag !== kb.etag) return json({ error: "\u77E5\u8B58\u5EAB\u5DF2\u66F4\u65B0\uFF0C\u8ACB\u91CD\u65B0\u8F09\u5165\u3002", conflict: true }, 409);
    const o = await env.MEDIA.get(b.key);
    if (!o) return json({ error: "\u627E\u4E0D\u5230\u7248\u672C" }, 404);
    const text = await o.text();
    if (segment(text).filter((s) => s.type === "entry").length === 0) return json({ error: "\u6B64\u7248\u672C\u6C92\u6709\u4EFB\u4F55\u689D\u76EE\uFF0C\u4E0D\u9084\u539F\u3002" }, 400);
    const r = await saveKb(env, { baseEtag: kb.etag, newText: text, oldText: kb.text, note: `\u9084\u539F ${b.key.replace("kb/history/", "")}` });
    if (r.conflict) return json({ error: "\u77E5\u8B58\u5EAB\u525B\u88AB\u66F4\u65B0\uFF0C\u8ACB\u91CD\u65B0\u8F09\u5165\u3002", conflict: true }, 409);
    return json(r);
  }
  if (p === "/api/usage" && method === "GET") {
    const kind = url.searchParams.get("kind") === "grok" ? "grok" : "gemini";
    const range = ["today", "7d", "30d", "month"].includes(url.searchParams.get("range")) ? url.searchParams.get("range") : "7d";
    return json(await usage(env, kind, range));
  }
  if (p === "/api/grok-share" && method === "GET") {
    const keys = (await listAll(env, "usage/grok-share/")).sort().reverse().slice(0, 30);
    const items = (await Promise.all(keys.map((k) => env.MEDIA.get(k).then((o) => o ? o.json() : null).catch(() => null)))).filter(Boolean);
    return json({ items });
  }
  if (p === "/api/grok-share" && method === "POST") {
    const b = await req.json();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || "") ? b.date : taipei().date;
    const percent = Number(b.percent);
    if (!Number.isFinite(percent) || percent < 0 || percent > 1e3) return json({ error: "\u8ACB\u586B 0\u2013100 \u7684\u767E\u5206\u6BD4\u6578\u5B57" }, 400);
    const rec = { date, percent, note: clean(b.note || "").slice(0, 300), enteredAt: taipei().iso };
    await env.MEDIA.put(`usage/grok-share/${date}.json`, JSON.stringify(rec), { httpMetadata: { contentType: "application/json" } });
    return json({ ok: true, rec });
  }
  if (p === "/api/grok-share" && method === "DELETE") {
    const date = url.searchParams.get("date") || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "bad date" }, 400);
    await env.MEDIA.delete(`usage/grok-share/${date}.json`);
    return json({ ok: true });
  }
  if (p === "/api/unanswered" && method === "GET") {
    return json(await listUnanswered(env));
  }
  if (p === "/api/unanswered/status" && method === "POST") {
    const b = await req.json().catch(() => ({}));
    const id = String(b.id || "");
    if (!/^[a-f0-9]{16}$/.test(id)) return json({ error: "\u7DE8\u865F\u4E0D\u6B63\u78BA" }, 400);
    const status = String(b.status || "");
    if (!UNANSWERED_STATUSES.includes(status)) return json({ error: "\u72C0\u614B\u8ACB\u9078\u300C\u672A\u8655\u7406\u300D\u300C\u5DF2\u88DC\u9032\u77E5\u8B58\u5EAB\u300D\u6216\u300C\u4E0D\u7528\u88DC\u300D\u3002" }, 400);
    const kbId = clean(b.kbId || "");
    if (kbId && !/^(KB|TB)-\d+$/i.test(kbId)) return json({ error: "\u77E5\u8B58\u5EAB\u7DE8\u865F\u683C\u5F0F\u61C9\u70BA KB-123 \u6216 TB-123" }, 400);
    const note = clean(b.note || "").slice(0, 300);
    const store = await loadUnansweredStatus(env);
    const rec = { status, updatedAt: taipei().iso };
    if (kbId) rec.kbId = kbId.toUpperCase();
    if (note) rec.note = note;
    store[id] = rec;
    await env.MEDIA.put(UNANSWERED_STATUS_KEY, JSON.stringify(store), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
    return json({ ok: true, rec });
  }
  if (p === "/api/unanswered" && method === "DELETE") {
    const id = String(url.searchParams.get("id") || "");
    if (!/^[a-f0-9]{16}$/.test(id)) return json({ error: "\u7DE8\u865F\u4E0D\u6B63\u78BA" }, 400);
    const store = await loadUnansweredStatus(env);
    store[id] = { deleted: true, updatedAt: taipei().iso };
    await env.MEDIA.put(UNANSWERED_STATUS_KEY, JSON.stringify(store), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
    return json({ ok: true });
  }
  return json({ error: "not found" }, 404);
}
__name(api, "api");
function clean(s) {
  return String(s || "").replace(/[\r\n]+/g, " ").trim();
}
__name(clean, "clean");
function snippet(block, q) {
  const body = block.split("\n").slice(1).filter((l) => l && !/^- /.test(l) && !/^\*\*/.test(l)).join(" ");
  if (!q) return body.slice(0, 90);
  const t = q.split(/\s+/)[0];
  const i = body.toLowerCase().indexOf(t);
  return i < 0 ? body.slice(0, 90) : (i > 30 ? "\u2026" : "") + body.slice(Math.max(0, i - 30), i + 60);
}
__name(snippet, "snippet");
export {
  index_default as default
};
//# sourceMappingURL=index.js.map