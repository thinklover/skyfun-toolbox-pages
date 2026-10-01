import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "object-cancel";
const MAX_BYTES = 10 * 1024 * 1024;
const URL_TTL = 7200;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

type Caller = { uid: string | null; admin: boolean };

async function caller(token: string, secret: string): Promise<Caller | null> {
  if (secret && (await isAdmin(secret))) return { uid: null, admin: true };
  const uid = await userId(token);
  return uid ? { uid, admin: false } : null;
}

type FileRow = {
  id: number;
  request_id: number;
  user_id: string | null;
  user_name: string;
  file_path: string;
  file_name: string;
  mime: string;
  size_bytes: number;
  created_at: string;
};

async function withUrls(rows: FileRow[], who: Caller) {
  const urls: Record<string, string> = {};
  const paths = rows.map((r) => r.file_path);
  for (let i = 0; i < paths.length; i += 200) {
    const { data } = await sb.storage.from(BUCKET).createSignedUrls(paths.slice(i, i + 200), URL_TTL);
    (data || []).forEach((d) => {
      if (d.path && d.signedUrl) urls[d.path] = d.signedUrl;
    });
  }
  return rows.map((r) => ({
    id: r.id,
    requestId: r.request_id,
    userName: r.user_name,
    fileName: r.file_name,
    mime: r.mime,
    size: r.size_bytes,
    url: urls[r.file_path] || null,
    createdAt: r.created_at,
    canDelete: who.admin || (!!who.uid && r.user_id === who.uid),
  }));
}

function extOf(type: string) {
  if (type === "application/pdf") return "pdf";
  return type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
}

function asFile(v: FormDataEntryValue | null) {
  return v && typeof v !== "string" && (v as File).size > 0 ? (v as File) : null;
}

function idOf(v: unknown) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function requestExists(id: number) {
  const { data, error } = await sb.from("object_cancel_requests").select("id").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

async function handleUpload(form: FormData) {
  const uid = await userId(String(form.get("token") || ""));
  if (!uid) return fail("請先登入");
  const requestId = idOf(form.get("requestId"));
  if (!requestId) return fail("資料錯誤");
  if (!(await requestExists(requestId))) return fail("找不到這筆申請");
  const file = asFile(form.get("file"));
  if (!file) return fail("請選擇簽呈檔案");
  if (file.size > MAX_BYTES) return fail("檔案太大（上限 10MB）");
  if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(file.type)) return fail("只接受 JPG／PNG／WEBP 圖片或 PDF");
  const fileName = String(form.get("fileName") || file.name || "簽呈").replace(/[\\/:*?"<>|\r\n]/g, "").trim().slice(0, 120) || "簽呈";

  const { data: acc, error: accErr } = await sb.from("toolbox_accounts").select("username, name").eq("id", uid).maybeSingle();
  if (accErr) return fail(accErr.message);

  const path = `${requestId}/${crypto.randomUUID()}.${extOf(file.type)}`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return fail("上傳失敗：" + upErr.message);

  const { data, error } = await sb
    .from("object_cancel_files")
    .insert({
      request_id: requestId,
      user_id: uid,
      user_name: acc?.name || acc?.username || "",
      file_path: path,
      file_name: fileName,
      mime: file.type,
      size_bytes: file.size,
    })
    .select("*")
    .single();
  if (error) {
    await sb.storage.from(BUCKET).remove([path]);
    return fail(error.message);
  }
  const [saved] = await withUrls([data as FileRow], { uid, admin: false });
  return json({ ok: true, file: saved });
}

async function handleFiles(body: Record<string, string>) {
  const who = await caller(String(body.token || ""), String(body.secret || ""));
  if (!who) return fail(body.secret ? "後台密碼錯誤" : "請先登入");
  const requestId = idOf(body.requestId);
  if (!requestId) return fail("資料錯誤");
  const { data, error } = await sb
    .from("object_cancel_files")
    .select("*")
    .eq("request_id", requestId)
    .order("created_at");
  if (error) return fail(error.message);
  return json({ ok: true, files: await withUrls((data || []) as FileRow[], who) });
}

async function handleDeleteFile(body: Record<string, string>) {
  const who = await caller(String(body.token || ""), String(body.secret || ""));
  if (!who) return fail(body.secret ? "後台密碼錯誤" : "請先登入");
  const id = idOf(body.id);
  if (!id) return fail("資料錯誤");
  const { data, error } = await sb.from("object_cancel_files").select("*").eq("id", id).maybeSingle();
  if (error) return fail(error.message);
  if (!data) return json({ ok: true, deleted: false, id });
  const row = data as FileRow;
  if (!who.admin && row.user_id !== who.uid) return fail("只能刪除自己上傳的檔案");
  await sb.from("object_cancel_files").delete().eq("id", id);
  await sb.storage.from(BUCKET).remove([row.file_path]);
  return json({ ok: true, deleted: true, id });
}

function roc(ymd: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || "");
  return m ? `${Number(m[1]) - 1911}/${m[2]}/${m[3]}` : ymd || "";
}

// 臺中市 → 台中；縣保留全名，避免新竹縣／新竹市、嘉義縣／嘉義市混淆
function regionShort(region: string) {
  const s = String(region || "").replace(/臺/g, "台");
  return s.endsWith("市") ? s.slice(0, -1) : s;
}

function taipeiMonth(iso: string) {
  const d = iso ? new Date(iso) : new Date();
  return String(new Date(d.getTime() + 8 * 3600_000).getUTCMonth() + 1).padStart(2, "0");
}

// deno-lint-ignore no-explicit-any
type RequestRow = Record<string, any>;

function cancelMessage(r: RequestRow) {
  const line = "---------";
  return [
    `${regionShort(r.region)}的物件解編`,
    `${taipeiMonth(r.created_at)}月星鴻物件解編轉業者【${r.taker_company}】說明`,
    line,
    `星鴻業務：${r.agent_name}`,
    `租約狀態：${r.object_type}_${r.contract_status}`,
    `租期：${roc(r.lease_start || "")}~${roc(r.lease_end || "")}`,
    `註銷物件地址：${r.address}`,
    line,
    "業務備註：",
    String(r.note || "").trim(),
    line,
    `${r.taker_company}業務：${r.taker_agent}`,
  ].join("\n");
}

async function notifyRequest(r: RequestRow) {
  const [{ data: cfg }, { data: recipients, error: rErr }] = await Promise.all([
    sb.from("line_settings").select("value").eq("key", "channel_access_token").maybeSingle(),
    sb.from("line_bindings").select("line_user_id").eq("notify_object_cancel", true),
  ]);
  if (rErr) throw new Error(rErr.message);
  const to = (recipients || []).map((x) => (x as { line_user_id: string }).line_user_id);
  let error = "";
  if (!cfg?.value) error = "LINE 尚未設定";
  else if (!to.length) error = "尚未設定通知對象";
  else {
    const res = await fetch("https://api.line.me/v2/bot/message/multicast", {
      method: "POST",
      headers: { Authorization: "Bearer " + cfg.value, "Content-Type": "application/json" },
      body: JSON.stringify({ to, messages: [{ type: "text", text: cancelMessage(r).slice(0, 4900) }] }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      error = res.status === 429 ? "LINE 本月訊息額度已用完" : `LINE 推播失敗（${res.status}）${detail.slice(0, 120)}`;
    }
  }
  await sb
    .from("object_cancel_requests")
    .update(error ? { line_error: error } : { line_notified_at: new Date().toISOString(), line_error: "" })
    .eq("id", r.id);
  return { sent: error ? 0 : to.length, error };
}

async function loadRequest(id: number) {
  const { data, error } = await sb.from("object_cancel_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as RequestRow | null;
}

async function handleNotify(body: Record<string, string>) {
  const uid = await userId(String(body.token || ""));
  if (!uid) return fail("請先登入");
  const id = idOf(body.requestId);
  if (!id) return fail("資料錯誤");
  const row = await loadRequest(id);
  if (!row) return fail("找不到這筆申請");
  if (row.user_id !== uid) return fail("只能通知自己送出的申請");
  if (row.line_notified_at) return json({ ok: true, sent: 0, already: true });
  return json({ ok: true, ...(await notifyRequest(row)) });
}

async function handleAdminNotify(body: Record<string, string>) {
  if (!(await isAdmin(String(body.secret || "")))) return fail("後台密碼錯誤");
  const id = idOf(body.id);
  if (!id) return fail("資料錯誤");
  const row = await loadRequest(id);
  if (!row) return fail("找不到這筆申請");
  return json({ ok: true, ...(await notifyRequest(row)) });
}

async function handleAdminDelete(body: Record<string, string>) {
  if (!(await isAdmin(String(body.secret || "")))) return fail("後台密碼錯誤");
  const id = idOf(body.id);
  if (!id) return fail("資料錯誤");
  const { data: files, error: fErr } = await sb.from("object_cancel_files").select("file_path").eq("request_id", id);
  if (fErr) return fail(fErr.message);
  const { data, error } = await sb.from("object_cancel_requests").delete().eq("id", id).select("id");
  if (error) return fail(error.message);
  if (!data?.length) return fail("找不到這筆申請");
  const paths = (files || []).map((f) => (f as { file_path: string }).file_path);
  if (paths.length) await sb.storage.from(BUCKET).remove(paths);
  return json({ ok: true, deleted: true, id });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: CORS });
  try {
    const type = req.headers.get("content-type") || "";
    if (type.includes("multipart/form-data")) {
      const form = await req.formData();
      if (String(form.get("action") || "") === "upload") return await handleUpload(form);
      return fail("未知的動作");
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, string>;
    switch (body.action) {
      case "files":
        return await handleFiles(body);
      case "delete_file":
        return await handleDeleteFile(body);
      case "admin_delete":
        return await handleAdminDelete(body);
      case "notify":
        return await handleNotify(body);
      case "admin_notify":
        return await handleAdminNotify(body);
      default:
        return fail("未知的動作");
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
});
