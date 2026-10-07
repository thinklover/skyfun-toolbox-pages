import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "petitions";
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 10;
const URL_TTL = 7200;
const SITE_URL = "https://toolbox.skyfunsystem.com/?page=petition";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STAGES = ["manager", "director", "office", "gm"] as const;
type Stage = typeof STAGES[number];
const SUBJECTS = ["人事相關", "獎金辦法", "賠償案件", "薪資出勤", "其他"];
const STAGE_LABEL: Record<string, string> = {
  applicant: "承辦人",
  manager: "部門主管",
  director: "審核（經理／協理）",
  office: "會辦（總經理室）",
  gm: "總經理決行",
  done: "已完成",
  rejected: "已退回",
};

const sb = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}
const fail = (error: string) => json({ ok: false, error });

async function userId(token: string) {
  if (!token) return null;
  const { data, error } = await sb.rpc("admin_qa_user_id", { p_token: token });
  if (error) throw new Error(error.message);
  return (data as string | null) || null;
}

async function isAdmin(secret: string) {
  if (!secret) return false;
  const { data, error } = await sb.rpc("toolbox_check_admin", { p_secret: secret });
  if (error) throw new Error(error.message);
  return data === true;
}

type Account = { id: string; username: string; name: string; team: string; status: string };

async function account(id: string | null) {
  if (!id) return null;
  const { data, error } = await sb.from("toolbox_accounts").select("id, username, name, team, status").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Account | null;
}

const nameOf = (a: Account | null) => (a ? a.name || a.username : "");

const APPROVER_KEYS = { manager: "manager_ids", director: "director_ids", office: "office_ids" } as const;

function parseIds(value: unknown) {
  try {
    const ids = JSON.parse(String(value || "[]"));
    return Array.isArray(ids) ? ids.map((id) => clean(id, 60)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function approverIds() {
  const { data, error } = await sb.from("petition_settings").select("key, value")
    .in("key", [APPROVER_KEYS.manager, APPROVER_KEYS.director, APPROVER_KEYS.office]);
  if (error) throw new Error(error.message);
  const rows = (data || []) as Row[];
  return {
    managers: parseIds(rows.find((r) => r.key === APPROVER_KEYS.manager)?.value),
    directors: parseIds(rows.find((r) => r.key === APPROVER_KEYS.director)?.value),
    offices: parseIds(rows.find((r) => r.key === APPROVER_KEYS.office)?.value),
  };
}

function asFiles(form: FormData) {
  return form.getAll("file").filter((v) => typeof v !== "string" && (v as File).size > 0) as File[];
}

function asSignature(form: FormData) {
  const value = form.get("signature");
  return typeof value !== "string" && value && (value as File).size > 0 ? value as File : null;
}

function idOf(v: unknown) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function extOf(type: string) {
  if (type === "application/pdf") return "pdf";
  return type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
}

function clean(v: unknown, max: number) {
  return String(v ?? "").trim().slice(0, max);
}

function parseContent(value: unknown) {
  let raw: Row = {};
  try { raw = JSON.parse(String(value || "{}")) as Row; } catch { /* validation below */ }
  return {
    category: clean(raw.category, 100),
    closing: ["擬請核示", "敬請核示"].includes(clean(raw.closing, 20)) ? clean(raw.closing, 20) : "擬請核示",
    summary: clean(raw.summary, 5000),
    timeline: clean(raw.timeline, 5000),
    description: clean(raw.description, 8000),
    proposal: clean(raw.proposal, 5000),
    coOffice: clean(raw.coOffice, 500),
    afterApproval: clean(raw.afterApproval, 500) || "奉 核後，影印陳送各會辦單位存照。",
    attachments: clean(raw.attachments, 2000),
    showRespect: raw.showRespect === true,
  };
}

function checkContent(title: string, content: ReturnType<typeof parseContent>) {
  if (!title) return "請填寫完整簽呈主旨";
  if (!SUBJECTS.includes(content.category) && !(content.category.startsWith("其他：") && content.category.length > 3)) {
    return "請選擇簽呈主旨分類；選其他時請輸入分類";
  }
  if (!content.summary) return "請填寫案件摘要";
  if (!content.description) return "請填寫案件說明";
  if (!content.proposal) return "請填寫擬辦事項";
  return "";
}

function checkFiles(files: File[]) {
  if (!files.length) return "請選擇要上傳的簽呈檔案";
  if (files.length > MAX_FILES) return `一次最多上傳 ${MAX_FILES} 個檔案`;
  for (const f of files) {
    if (f.size > MAX_BYTES) return `「${f.name}」太大（單檔上限 10MB）`;
    if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(f.type)) return `「${f.name}」格式不支援，只接受 JPG／PNG／WEBP 圖片或 PDF`;
  }
  return "";
}

function checkSignature(file: File | null) {
  if (!file) return "請先完成電子簽名";
  if (file.type !== "image/png") return "電子簽名格式錯誤";
  if (file.size > 1024 * 1024) return "電子簽名檔案過大";
  return "";
}

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

async function saveFiles(p: Row, stage: string, who: Account, files: File[]) {
  const saved: string[] = [];
  try {
    for (const file of files) {
      const path = `${p.id}/${crypto.randomUUID()}.${extOf(file.type)}`;
      const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error("上傳失敗：" + upErr.message);
      saved.push(path);
      const fileName = (file.name || "簽呈").replace(/[\\/:*?"<>|\r\n]/g, "").trim().slice(0, 120) || "簽呈";
      const { error } = await sb.from("petition_files").insert({
        petition_id: p.id,
        round: p.round,
        stage,
        user_id: who.id,
        user_name: nameOf(who),
        file_path: path,
        file_name: fileName,
        mime: file.type,
        size_bytes: file.size,
      });
      if (error) throw new Error(error.message);
    }
  } catch (e) {
    if (saved.length) {
      await sb.from("petition_files").delete().in("file_path", saved);
      await sb.storage.from(BUCKET).remove(saved);
    }
    throw e;
  }
}

async function saveSignature(p: Row, role: "applicant" | "manager" | "director", who: Account, file: File) {
  const path = `${p.id}/signatures/${p.round}-${role}-${crypto.randomUUID()}.png`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file, { contentType: "image/png", upsert: false });
  if (upErr) throw new Error("電子簽名上傳失敗：" + upErr.message);
  const { error } = await sb.from("petition_signatures").insert({
    petition_id: p.id,
    round: p.round,
    role,
    user_id: who.id,
    user_name: nameOf(who),
    file_path: path,
  });
  if (error) {
    await sb.storage.from(BUCKET).remove([path]);
    throw new Error(error.message);
  }
}

async function logEvent(p: Row, who: Account, action: string, stage: string, note = "") {
  await sb.from("petition_events").insert({
    petition_id: p.id,
    actor_id: who.id,
    actor_name: nameOf(who),
    action,
    stage,
    note: note.slice(0, 1000),
  });
}

async function loadPetition(id: number) {
  const { data, error } = await sb.from("petitions").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Row | null;
}

// 總經理不使用工具箱，office / gm 關卡都由總經理室處理
function approverOf(p: Row): string | null {
  if (p.stage === "manager") return p.manager_id;
  if (p.stage === "director") return p.director_id;
  if (p.stage === "office" || p.stage === "gm") return p.gm_id;
  return null;
}

function rejectedByText(p: Row) {
  return p.rejected_stage === "gm"
    ? `總經理決行（由總經理室 ${p.rejected_by_name} 登錄）`
    : `${STAGE_LABEL[p.rejected_stage] || ""} ${p.rejected_by_name}`;
}

function summary(p: Row, uid: string | null) {
  return {
    id: p.id,
    title: p.title,
    note: p.note,
    content: p.content || {},
    userId: p.user_id,
    userName: p.user_name,
    team: p.team,
    stage: p.stage,
    stageLabel: STAGE_LABEL[p.stage] || p.stage,
    round: p.round,
    managerName: p.manager_name,
    directorName: p.director_name,
    officeName: p.gm_name,
    rejectReason: p.reject_reason,
    rejectedByName: p.rejected_by_name,
    rejectedStage: p.rejected_stage,
    lineError: p.line_error,
    lineNotifiedAt: p.line_notified_at,
    doneAt: p.done_at,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    isMine: !!uid && p.user_id === uid,
    myTurn: !!uid && approverOf(p) === uid,
  };
}

/* ---------- LINE 通知 ---------- */

function stageMessage(p: Row) {
  if (p.stage === "gm") {
    return [
      "【簽呈待總經理決行】",
      `主旨：${p.title}`,
      `承辦人：${p.user_name}${p.team ? `（${p.team}）` : ""}`,
      "",
      "請由總經理室送總經理決行，完成後到工具箱「行政專區 → 簽呈簽核 → 待我簽核」上傳最後版本：",
      SITE_URL,
    ].join("\n");
  }
  const idx = STAGES.indexOf(p.stage as Stage);
  const prev = idx > 0 ? `${STAGE_LABEL[STAGES[idx - 1]]}已完成，輪到您處理。` : p.round > 1 ? "承辦人已修改後重新送出。" : "";
  return [
    "【簽呈待您簽核】",
    `主旨：${p.title}`,
    `承辦人：${p.user_name}${p.team ? `（${p.team}）` : ""}`,
    `目前關卡：${STAGE_LABEL[p.stage]}（第 ${idx + 1} 關／共 4 關）`,
    prev,
    p.stage === "office" ? "請完成會辦，列印含三方電子簽名的簽核頁，再送總經理紙本決行。" : "",
    "",
    p.stage === "office"
      ? "請到工具箱「行政專區 → 簽呈簽核」處理："
      : "請到工具箱「行政專區 → 簽呈簽核」用手機或電腦完成電子簽名：",
    SITE_URL,
  ].filter((s, i, a) => s !== "" || a[i - 1] !== "").join("\n");
}

function rejectMessage(p: Row) {
  return [
    "【簽呈被退回】",
    `主旨：${p.title}`,
    `退回關卡：${rejectedByText(p)}`,
    `退回原因：${p.reject_reason}`,
    "",
    "請修改後到工具箱「行政專區 → 簽呈簽核 → 我的簽呈」重新上傳送出：",
    SITE_URL,
  ].join("\n");
}

function doneMessage(p: Row) {
  return [
    "【簽呈已完成簽核】",
    `主旨：${p.title}`,
    `承辦人：${p.user_name}${p.team ? `（${p.team}）` : ""}`,
    `部門主管 ${p.manager_name} → 審核 ${p.director_name} → 總經理室 ${p.gm_name} → 總經理決行，流程已完成。`,
    "",
    "簽完的檔案可在工具箱「行政專區 → 簽呈簽核」查看：",
    SITE_URL,
  ].join("\n");
}

async function notify(p: Row, kind: "stage" | "reject" | "done", actorId: string | null = null) {
  const targets = kind === "stage"
    ? [approverOf(p)]
    : kind === "reject"
    ? [p.user_id]
    : [p.manager_id, p.director_id, p.gm_id];
  const ids = [...new Set(targets.filter((id) => id && id !== actorId) as string[])];
  if (!ids.length && actorId) {
    await sb.from("petitions").update({ line_error: "" }).eq("id", p.id);
    return { sent: 0, error: "", skipped: true };
  }
  const text = (kind === "stage" ? stageMessage(p) : kind === "reject" ? rejectMessage(p) : doneMessage(p)).slice(0, 4900);

  const [{ data: cfg }, { data: binds, error: bErr }] = await Promise.all([
    sb.from("line_settings").select("value").eq("key", "channel_access_token").maybeSingle(),
    ids.length ? sb.from("line_bindings").select("user_id, line_user_id").in("user_id", ids) : Promise.resolve({ data: [], error: null }),
  ]);
  if (bErr) throw new Error(bErr.message);
  const bound = (binds || []) as { user_id: string; line_user_id: string }[];
  const missing = ids.filter((id) => !bound.some((b) => b.user_id === id));
  const missingNames = missing.length
    ? (await sb.from("toolbox_accounts").select("name, username").in("id", missing)).data?.map((a) => a.name || a.username) || []
    : [];

  let error = "";
  let sent = 0;
  if (!ids.length) error = "沒有通知對象";
  else if (!cfg?.value) error = "LINE 尚未設定";
  else if (bound.length) {
    const res = await fetch("https://api.line.me/v2/bot/message/multicast", {
      method: "POST",
      headers: { Authorization: "Bearer " + cfg.value, "Content-Type": "application/json" },
      body: JSON.stringify({ to: bound.map((b) => b.line_user_id), messages: [{ type: "text", text }] }),
    });
    if (res.ok) sent = bound.length;
    else {
      const detail = await res.text().catch(() => "");
      error = res.status === 429 ? "LINE 本月訊息額度已用完" : `LINE 推播失敗（${res.status}）${detail.slice(0, 120)}`;
    }
  }
  if (!error && missingNames.length) error = `${missingNames.join("、")} 尚未綁定 LINE，收不到通知`;

  await sb.from("petitions").update(
    sent ? { line_notified_at: new Date().toISOString(), line_error: error } : { line_error: error },
  ).eq("id", p.id);
  return { sent, error };
}

/* ---------- 一般使用者動作 ---------- */

async function handleApprovers(body: Row) {
  const uid = await userId(clean(body.token, 200));
  if (!uid) return fail("請先登入");
  const [{ data: accs, error }, { data: binds }, selected] = await Promise.all([
    sb.from("toolbox_accounts").select("id, username, name, team").eq("status", "active").order("team").order("name"),
    sb.from("line_bindings").select("user_id"),
    approverIds(),
  ]);
  if (error) return fail(error.message);
  const boundSet = new Set((binds || []).map((b) => (b as { user_id: string }).user_id));
  const managerSet = new Set(selected.managers);
  const directorSet = new Set(selected.directors);
  const officeSet = new Set(selected.offices);
  const items = (accs || [])
    .filter((a) => (a.id !== uid || managerSet.has(a.id)) && (managerSet.has(a.id) || directorSet.has(a.id) || officeSet.has(a.id)))
    .map((a) => ({
      id: a.id,
      name: a.name || a.username,
      username: a.username,
      team: a.team || "",
      lineBound: boundSet.has(a.id),
      manager: managerSet.has(a.id),
      director: a.id !== uid && directorSet.has(a.id),
      office: a.id !== uid && officeSet.has(a.id),
    }));
  return json({ ok: true, items, meLineBound: boundSet.has(uid) });
}

async function handleSubmit(form: FormData) {
  const uid = await userId(clean(form.get("token"), 200));
  if (!uid) return fail("請先登入");
  const me = await account(uid);
  if (!me) return fail("找不到帳號");
  const title = clean(form.get("title"), 500);
  const note = clean(form.get("note"), 1000);
  const content = parseContent(form.get("content"));
  const contentBad = checkContent(title, content);
  if (contentBad) return fail(contentBad);
  const managerId = clean(form.get("managerId"), 60);
  const directorId = clean(form.get("directorId"), 60);
  const officeId = clean(form.get("officeId"), 60);
  if (!managerId) return fail("請選擇部門主管");
  if (!directorId) return fail("請選擇審核人員");
  if (!officeId) return fail("請選擇總經理室會辦人員");
  if (directorId === uid || officeId === uid) return fail("審核或會辦人員不能選自己");
  if (new Set([managerId, directorId, officeId]).size !== 3) return fail("部門主管、審核人員與會辦人員不能是同一人");
  const files = asFiles(form);
  const bad = files.length ? checkFiles(files) : "";
  if (bad) return fail(bad);
  const signature = asSignature(form);
  const signBad = checkSignature(signature);
  if (signBad) return fail(signBad);

  const [manager, director, office, selected] = await Promise.all([account(managerId), account(directorId), account(officeId), approverIds()]);
  if (!manager || manager.status !== "active") return fail("部門主管帳號不存在或已停用");
  if (!director || director.status !== "active") return fail("審核人員帳號不存在或已停用");
  if (!office || office.status !== "active") return fail("總經理室會辦人員帳號不存在或已停用");
  if (!selected.managers.includes(managerId)) return fail("這個帳號未被後台設定為部門主管");
  if (!selected.directors.includes(directorId)) return fail("這個帳號未被後台設定為審核人員");
  if (!selected.offices.includes(officeId)) return fail("這個帳號未被後台設定為總經理室會辦人員");

  const { data, error } = await sb.from("petitions").insert({
    user_id: uid,
    user_name: nameOf(me),
    team: me.team || "",
    title,
    note,
    content,
    manager_id: manager.id,
    manager_name: nameOf(manager),
    director_id: director.id,
    director_name: nameOf(director),
    gm_id: office.id,
    gm_name: nameOf(office),
    stage: managerId === uid ? "director" : "manager",
  }).select("*").single();
  if (error) return fail(error.message);
  const p = data as Row;
  try {
    await saveFiles(p, "applicant", me, files);
    await saveSignature(p, "applicant", me, signature!);
    if (managerId === uid) await saveSignature(p, "manager", me, signature!);
  } catch (e) {
    await removePetition(p.id);
    return fail(e instanceof Error ? e.message : String(e));
  }
  await logEvent(p, me, "submit", "applicant", note);
  const line = await notify(p, "stage", uid);
  return json({ ok: true, petition: summary(p, uid), line });
}

async function handleApprove(form: FormData) {
  const uid = await userId(clean(form.get("token"), 200));
  if (!uid) return fail("請先登入");
  const id = idOf(form.get("id"));
  if (!id) return fail("資料錯誤");
  const p = await loadPetition(id);
  if (!p) return fail("找不到這份簽呈");
  if (approverOf(p) !== uid) return fail("目前不是輪到你簽核這份簽呈");
  const stage = p.stage as Stage;
  const files = asFiles(form);
  const withGm = stage === "office" && form.get("withGm") === "1";
  if ((stage === "gm" || withGm) && !files.length) return fail("請上傳總經理紙本決行後的檔案");
  const bad = files.length ? checkFiles(files) : "";
  if (bad) return fail(bad);
  const signature = asSignature(form);
  if (stage === "manager" || stage === "director") {
    const signBad = checkSignature(signature);
    if (signBad) return fail(signBad);
  }
  const me = await account(uid);
  if (!me) return fail("找不到帳號");
  const note = clean(form.get("note"), 1000);

  if (stage === "manager" || stage === "director") await saveSignature(p, stage, me, signature!);
  if (files.length) await saveFiles(p, "gm", me, files);
  const next = stage === "manager"
    ? "director"
    : stage === "director"
    ? "office"
    : stage === "office" && !withGm
    ? "gm"
    : "done";
  const patch: Row = { stage: next, updated_at: new Date().toISOString() };
  if (next === "done") patch.done_at = patch.updated_at;
  const { data, error } = await sb.from("petitions").update(patch).eq("id", id).eq("stage", stage).select("*").maybeSingle();
  if (error) return fail(error.message);
  if (!data) return fail("這份簽呈狀態已變更，請重新整理");
  await logEvent(p, me, "approve", stage, note);
  if (withGm) await logEvent(p, me, "approve", "gm");
  const line = await notify(data as Row, next === "done" ? "done" : "stage", uid);
  return json({ ok: true, petition: summary(data as Row, uid), line });
}

async function handleReject(body: Row) {
  const uid = await userId(clean(body.token, 200));
  if (!uid) return fail("請先登入");
  const id = idOf(body.id);
  if (!id) return fail("資料錯誤");
  const reason = clean(body.reason, 1000);
  if (!reason) return fail("請填寫退回原因");
  const p = await loadPetition(id);
  if (!p) return fail("找不到這份簽呈");
  if (approverOf(p) !== uid) return fail("目前不是輪到你簽核這份簽呈");
  const me = await account(uid);
  if (!me) return fail("找不到帳號");
  const { data, error } = await sb.from("petitions").update({
    stage: "rejected",
    reject_reason: reason,
    rejected_by_name: nameOf(me),
    rejected_stage: p.stage,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("stage", p.stage).select("*").maybeSingle();
  if (error) return fail(error.message);
  if (!data) return fail("這份簽呈狀態已變更，請重新整理");
  await logEvent(p, me, "reject", p.stage, reason);
  const line = await notify(data as Row, "reject");
  return json({ ok: true, petition: summary(data as Row, uid), line });
}

async function handleResubmit(form: FormData) {
  const uid = await userId(clean(form.get("token"), 200));
  if (!uid) return fail("請先登入");
  const id = idOf(form.get("id"));
  if (!id) return fail("資料錯誤");
  const p = await loadPetition(id);
  if (!p) return fail("找不到這份簽呈");
  if (p.user_id !== uid) return fail("只能重新送出自己的簽呈");
  if (p.stage !== "rejected") return fail("這份簽呈沒有被退回，不需要重新送出");
  const files = asFiles(form);
  const bad = files.length ? checkFiles(files) : "";
  if (bad) return fail(bad);
  const signature = asSignature(form);
  const signBad = checkSignature(signature);
  if (signBad) return fail(signBad);
  const me = await account(uid);
  if (!me) return fail("找不到帳號");
  const note = clean(form.get("note"), 1000);
  const title = clean(form.get("title"), 500) || p.title;
  const content = form.has("content") ? parseContent(form.get("content")) : p.content;
  const contentBad = checkContent(title, content);
  if (contentBad) return fail(contentBad);
  const round = (p.round || 1) + 1;

  const next = p.manager_id === uid ? "director" : "manager";
  const nextRound = { ...p, round };
  await saveFiles(nextRound, "applicant", me, files);
  await saveSignature(nextRound, "applicant", me, signature!);
  if (p.manager_id === uid) await saveSignature(nextRound, "manager", me, signature!);
  const { data, error } = await sb.from("petitions").update({
    stage: next,
    round,
    reject_reason: "",
    rejected_by_name: "",
    rejected_stage: "",
    title,
    content,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("stage", "rejected").select("*").maybeSingle();
  if (error) return fail(error.message);
  if (!data) return fail("這份簽呈狀態已變更，請重新整理");
  await logEvent(p, me, "resubmit", "applicant", note);
  const line = await notify(data as Row, "stage", uid);
  return json({ ok: true, petition: summary(data as Row, uid), line });
}

async function removePetition(id: number) {
  const [{ data: files }, { data: signatures }] = await Promise.all([
    sb.from("petition_files").select("file_path").eq("petition_id", id),
    sb.from("petition_signatures").select("file_path").eq("petition_id", id),
  ]);
  await sb.from("petitions").delete().eq("id", id);
  const paths = [...(files || []), ...(signatures || [])].map((f) => (f as { file_path: string }).file_path);
  for (let i = 0; i < paths.length; i += 100) await sb.storage.from(BUCKET).remove(paths.slice(i, i + 100));
}

async function handleWithdraw(body: Row) {
  const uid = await userId(clean(body.token, 200));
  if (!uid) return fail("請先登入");
  const id = idOf(body.id);
  if (!id) return fail("資料錯誤");
  const p = await loadPetition(id);
  if (!p) return fail("找不到這份簽呈");
  if (p.user_id !== uid) return fail("只能撤回自己的簽呈");
  if (p.stage === "done") return fail("已完成簽核的簽呈不能撤回");
  await removePetition(id);
  return json({ ok: true, deleted: true, id });
}

async function handleList(body: Row) {
  const uid = await userId(clean(body.token, 200));
  if (!uid) return fail("請先登入");
  const cols = "*";
  const [mine, related] = await Promise.all([
    sb.from("petitions").select(cols).eq("user_id", uid).order("created_at", { ascending: false }).limit(100),
    sb.from("petitions").select(cols).or(`manager_id.eq.${uid},director_id.eq.${uid},gm_id.eq.${uid}`)
      .order("updated_at", { ascending: false }).limit(200),
  ]);
  if (mine.error) return fail(mine.error.message);
  if (related.error) return fail(related.error.message);
  const rel = (related.data || []) as Row[];
  return json({
    ok: true,
    mine: ((mine.data || []) as Row[]).map((p) => summary(p, uid)),
    todo: rel.filter((p) => approverOf(p) === uid).map((p) => summary(p, uid)),
    related: rel.filter((p) => approverOf(p) !== uid).map((p) => summary(p, uid)),
  });
}

async function detailOf(p: Row, uid: string | null) {
  const [{ data: files, error: fErr }, { data: events, error: eErr }, { data: signatures, error: sErr }] = await Promise.all([
    sb.from("petition_files").select("*").eq("petition_id", p.id).order("created_at"),
    sb.from("petition_events").select("*").eq("petition_id", p.id).order("created_at"),
    sb.from("petition_signatures").select("*").eq("petition_id", p.id).order("created_at"),
  ]);
  if (fErr) throw new Error(fErr.message);
  if (eErr) throw new Error(eErr.message);
  if (sErr) throw new Error(sErr.message);
  const rows = (files || []) as Row[];
  const signRows = (signatures || []) as Row[];
  const stored = [...rows, ...signRows];
  const urls: Record<string, string> = {};
  for (let i = 0; i < stored.length; i += 200) {
    const { data } = await sb.storage.from(BUCKET).createSignedUrls(stored.slice(i, i + 200).map((r) => r.file_path), URL_TTL);
    (data || []).forEach((d) => {
      if (d.path && d.signedUrl) urls[d.path] = d.signedUrl;
    });
  }
  return {
    ...summary(p, uid),
    files: rows.map((r) => ({
      id: r.id,
      round: r.round,
      stage: r.stage,
      stageLabel: STAGE_LABEL[r.stage] || r.stage,
      userName: r.user_name,
      fileName: r.file_name,
      mime: r.mime,
      size: r.size_bytes,
      url: urls[r.file_path] || null,
      createdAt: r.created_at,
    })),
    signatures: signRows.map((r) => ({
      round: r.round,
      role: r.role,
      roleLabel: STAGE_LABEL[r.role] || r.role,
      userName: r.user_name,
      url: urls[r.file_path] || null,
      createdAt: r.created_at,
    })),
    events: ((events || []) as Row[]).map((e) => ({
      action: e.action,
      stage: e.stage,
      stageLabel: STAGE_LABEL[e.stage] || e.stage,
      actorName: e.actor_name,
      note: e.note,
      createdAt: e.created_at,
    })),
  };
}

async function handleDetail(body: Row) {
  const uid = await userId(clean(body.token, 200));
  if (!uid) return fail("請先登入");
  const id = idOf(body.id);
  if (!id) return fail("資料錯誤");
  const p = await loadPetition(id);
  if (!p) return fail("找不到這份簽呈");
  if (![p.user_id, p.manager_id, p.director_id, p.gm_id].includes(uid)) return fail("你沒有權限查看這份簽呈");
  return json({ ok: true, petition: await detailOf(p, uid) });
}

/* ---------- 後台 ---------- */

async function requireAdmin(body: Row) {
  return await isAdmin(clean(body.secret, 200));
}

async function handleAdminList(body: Row) {
  if (!(await requireAdmin(body))) return fail("後台密碼錯誤");
  const stage = clean(body.stage, 20);
  const q = clean(body.query, 100);
  let query = sb.from("petitions").select("*").order("created_at", { ascending: false }).limit(500);
  if (stage === "pending") query = query.in("stage", ["manager", "director", "office", "gm"]);
  else if (stage) query = query.eq("stage", stage);
  if (q) {
    const like = `%${q.replace(/[%,()]/g, "")}%`;
    query = query.or(`title.ilike.${like},user_name.ilike.${like},team.ilike.${like},manager_name.ilike.${like},director_name.ilike.${like},gm_name.ilike.${like}`);
  }
  const { data, error } = await query;
  if (error) return fail(error.message);
  return json({ ok: true, items: ((data || []) as Row[]).map((p) => summary(p, null)) });
}

async function handleAdminDetail(body: Row) {
  if (!(await requireAdmin(body))) return fail("後台密碼錯誤");
  const id = idOf(body.id);
  if (!id) return fail("資料錯誤");
  const p = await loadPetition(id);
  if (!p) return fail("找不到這份簽呈");
  return json({ ok: true, petition: await detailOf(p, null) });
}

async function handleAdminSettings(body: Row) {
  if (!(await requireAdmin(body))) return fail("後台密碼錯誤");
  const [{ data: accounts, error }, { data: binds }, selected] = await Promise.all([
    sb.from("toolbox_accounts").select("id, username, name, team").eq("status", "active").order("team").order("name"),
    sb.from("line_bindings").select("user_id"),
    approverIds(),
  ]);
  if (error) return fail(error.message);
  const boundSet = new Set((binds || []).map((b) => (b as { user_id: string }).user_id));
  const managerSet = new Set(selected.managers);
  const directorSet = new Set(selected.directors);
  const officeSet = new Set(selected.offices);
  return json({
    ok: true,
    activeAccounts: (accounts || []).length,
    lineBound: boundSet.size,
    accounts: (accounts || []).map((a) => ({
      id: a.id,
      username: a.username,
      name: a.name || a.username,
      team: a.team || "",
      lineBound: boundSet.has(a.id),
      manager: managerSet.has(a.id),
      director: directorSet.has(a.id),
      office: officeSet.has(a.id),
    })),
  });
}

async function handleAdminSaveApprovers(body: Row) {
  if (!(await requireAdmin(body))) return fail("後台密碼錯誤");
  const managers = [...new Set(Array.isArray(body.managers) ? body.managers.map((id: unknown) => clean(id, 60)).filter(Boolean) : [])];
  const directors = [...new Set(Array.isArray(body.directors) ? body.directors.map((id: unknown) => clean(id, 60)).filter(Boolean) : [])];
  const offices = [...new Set(Array.isArray(body.offices) ? body.offices.map((id: unknown) => clean(id, 60)).filter(Boolean) : [])];
  if (!managers.length) return fail("請至少勾選一位部門主管");
  if (!directors.length) return fail("請至少勾選一位審核人員");
  if (!offices.length) return fail("請至少勾選一位總經理室會辦人員");
  const all = [...new Set([...managers, ...directors, ...offices])];
  const { data: active, error: accError } = await sb.from("toolbox_accounts").select("id").eq("status", "active").in("id", all);
  if (accError) return fail(accError.message);
  if ((active || []).length !== all.length) return fail("選取名單中包含不存在或已停用的帳號，請重新整理");
  const now = new Date().toISOString();
  const { error } = await sb.from("petition_settings").upsert([
    { key: APPROVER_KEYS.manager, value: JSON.stringify(managers), updated_at: now },
    { key: APPROVER_KEYS.director, value: JSON.stringify(directors), updated_at: now },
    { key: APPROVER_KEYS.office, value: JSON.stringify(offices), updated_at: now },
  ]);
  if (error) return fail(error.message);
  return json({ ok: true, managers, directors, offices });
}

async function handleAdminNotify(body: Row) {
  if (!(await requireAdmin(body))) return fail("後台密碼錯誤");
  const id = idOf(body.id);
  if (!id) return fail("資料錯誤");
  const p = await loadPetition(id);
  if (!p) return fail("找不到這份簽呈");
  const kind = p.stage === "done" ? "done" : p.stage === "rejected" ? "reject" : "stage";
  return json({ ok: true, ...(await notify(p, kind)) });
}

async function handleAdminDelete(body: Row) {
  if (!(await requireAdmin(body))) return fail("後台密碼錯誤");
  const id = idOf(body.id);
  if (!id) return fail("資料錯誤");
  if (!(await loadPetition(id))) return fail("找不到這份簽呈");
  await removePetition(id);
  return json({ ok: true, deleted: true, id });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: CORS });
  try {
    const type = req.headers.get("content-type") || "";
    if (type.includes("multipart/form-data")) {
      const form = await req.formData();
      switch (String(form.get("action") || "")) {
        case "submit":
          return await handleSubmit(form);
        case "approve":
          return await handleApprove(form);
        case "resubmit":
          return await handleResubmit(form);
        default:
          return fail("未知的動作");
      }
    }
    const body = (await req.json().catch(() => ({}))) as Row;
    switch (body.action) {
      case "approvers":
        return await handleApprovers(body);
      case "list":
        return await handleList(body);
      case "detail":
        return await handleDetail(body);
      case "reject":
        return await handleReject(body);
      case "withdraw":
        return await handleWithdraw(body);
      case "admin_list":
        return await handleAdminList(body);
      case "admin_detail":
        return await handleAdminDetail(body);
      case "admin_settings":
        return await handleAdminSettings(body);
      case "admin_save_approvers":
        return await handleAdminSaveApprovers(body);
      case "admin_notify":
        return await handleAdminNotify(body);
      case "admin_delete":
        return await handleAdminDelete(body);
      default:
        return fail("未知的動作");
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
});
