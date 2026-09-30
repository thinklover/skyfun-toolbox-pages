import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "subsidy-checkin";
const MAX_BYTES = 5 * 1024 * 1024;
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

function taipeiToday() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function validDay(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function weekdayOf(s: string) {
  return new Date(s + "T00:00:00Z").getUTCDay();
}

function daysBetween(a: string, b: string) {
  return (new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000;
}

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

type Row = {
  id: number;
  user_id: string;
  username: string;
  user_name: string;
  team: string;
  day: string;
  note: string;
  photo_path: string | null;
  thumb_path: string | null;
  created_at: string;
  updated_at: string;
};

async function withUrls(rows: Row[]) {
  const paths = [...new Set(rows.flatMap((r) => [r.photo_path, r.thumb_path]).filter(Boolean) as string[])];
  const urls: Record<string, string> = {};
  for (let i = 0; i < paths.length; i += 200) {
    const { data } = await sb.storage.from(BUCKET).createSignedUrls(paths.slice(i, i + 200), URL_TTL);
    (data || []).forEach((d) => {
      if (d.path && d.signedUrl) urls[d.path] = d.signedUrl;
    });
  }
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    username: r.username,
    userName: r.user_name,
    team: r.team,
    day: r.day,
    note: r.note,
    hasPhoto: !!r.photo_path,
    photoUrl: r.photo_path ? urls[r.photo_path] || null : null,
    thumbUrl: r.thumb_path ? urls[r.thumb_path] || null : r.photo_path ? urls[r.photo_path] || null : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

async function removeFiles(paths: (string | null | undefined)[]) {
  const list = paths.filter(Boolean) as string[];
  if (list.length) await sb.storage.from(BUCKET).remove(list);
}

function extOf(type: string) {
  return type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
}

async function uploadFile(path: string, file: File) {
  const { error } = await sb.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw new Error("照片上傳失敗：" + error.message);
}

function asFile(v: FormDataEntryValue | null) {
  return v && typeof v !== "string" && (v as File).size > 0 ? (v as File) : null;
}

async function handleSave(form: FormData) {
  const uid = await userId(String(form.get("token") || ""));
  if (!uid) return fail("請先登入");

  const day = String(form.get("day") || "");
  if (!validDay(day)) return fail("日期格式錯誤");
  const wd = weekdayOf(day);
  if (wd === 0 || wd === 6) return fail("只能上傳週一到週五");
  if (day > taipeiToday()) return fail("不能上傳未來的日期");
  if (day < "2024-01-01") return fail("日期太早");

  const note = String(form.get("note") || "").trim().slice(0, 200);
  const removePhoto = String(form.get("removePhoto") || "") === "1";
  const photo = asFile(form.get("photo"));
  const thumb = asFile(form.get("thumb"));
  for (const f of [photo, thumb]) {
    if (!f) continue;
    if (f.size > MAX_BYTES) return fail("照片太大（上限 5MB）");
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return fail("只接受 JPG／PNG／WEBP 圖片");
  }

  const { data: acc, error: accErr } = await sb
    .from("toolbox_accounts")
    .select("username, name, team")
    .eq("id", uid)
    .maybeSingle();
  if (accErr) return fail(accErr.message);

  const { data: existing, error: exErr } = await sb
    .from("subsidy_checkins")
    .select("*")
    .eq("user_id", uid)
    .eq("day", day)
    .maybeSingle();
  if (exErr) return fail(exErr.message);
  const old = existing as Row | null;

  let photoPath = removePhoto ? null : old?.photo_path ?? null;
  let thumbPath = removePhoto ? null : old?.thumb_path ?? null;
  const stale: (string | null)[] = [];

  if (photo) {
    const key = crypto.randomUUID();
    const p = `${uid}/${day}/${key}.${extOf(photo.type)}`;
    await uploadFile(p, photo);
    let t: string | null = null;
    if (thumb) {
      t = `${uid}/${day}/${key}-t.${extOf(thumb.type)}`;
      try {
        await uploadFile(t, thumb);
      } catch (e) {
        await removeFiles([p]);
        throw e;
      }
    }
    stale.push(old?.photo_path ?? null, old?.thumb_path ?? null);
    photoPath = p;
    thumbPath = t;
  } else if (removePhoto) {
    stale.push(old?.photo_path ?? null, old?.thumb_path ?? null);
  }

  if (!photoPath && !note) {
    if (old) {
      await sb.from("subsidy_checkins").delete().eq("id", old.id);
      await removeFiles([old.photo_path, old.thumb_path]);
      return json({ ok: true, deleted: true, day });
    }
    return fail("請上傳照片或填寫文字");
  }

  const record = {
    user_id: uid,
    username: acc?.username || "",
    user_name: acc?.name || acc?.username || "",
    team: acc?.team || "",
    day,
    note,
    photo_path: photoPath,
    thumb_path: thumbPath,
    updated_at: new Date().toISOString(),
  };
  const { data: saved, error: saveErr } = await sb
    .from("subsidy_checkins")
    .upsert(record, { onConflict: "user_id,day" })
    .select("*")
    .single();
  if (saveErr) {
    if (photo) await removeFiles([photoPath, thumbPath]);
    return fail(saveErr.message);
  }
  await removeFiles(stale);
  const [entry] = await withUrls([saved as Row]);
  return json({ ok: true, entry });
}

async function handleMine(body: Record<string, string>) {
  const uid = await userId(String(body.token || ""));
  if (!uid) return fail("請先登入");
  const from = String(body.from || ""), to = String(body.to || "");
  if (!validDay(from) || !validDay(to) || to < from) return fail("日期範圍錯誤");
  if (daysBetween(from, to) > 62) return fail("一次最多查詢 62 天");
  const { data, error } = await sb
    .from("subsidy_checkins")
    .select("*")
    .eq("user_id", uid)
    .gte("day", from)
    .lte("day", to)
    .order("day");
  if (error) return fail(error.message);
  return json({ ok: true, entries: await withUrls((data || []) as Row[]) });
}

async function handleDelete(body: Record<string, string>) {
  const uid = await userId(String(body.token || ""));
  if (!uid) return fail("請先登入");
  const day = String(body.day || "");
  if (!validDay(day)) return fail("日期格式錯誤");
  const { data, error } = await sb
    .from("subsidy_checkins")
    .select("*")
    .eq("user_id", uid)
    .eq("day", day)
    .maybeSingle();
  if (error) return fail(error.message);
  if (!data) return json({ ok: true, deleted: false, day });
  const row = data as Row;
  await sb.from("subsidy_checkins").delete().eq("id", row.id);
  await removeFiles([row.photo_path, row.thumb_path]);
  return json({ ok: true, deleted: true, day });
}

async function handleAdminList(body: Record<string, string>) {
  if (!(await isAdmin(String(body.secret || "")))) return fail("後台密碼錯誤");
  const from = String(body.from || ""), to = String(body.to || "");
  if (!validDay(from) || !validDay(to) || to < from) return fail("日期範圍錯誤");
  if (daysBetween(from, to) > 190) return fail("一次最多查詢 190 天");
  let q = sb.from("subsidy_checkins").select("*").gte("day", from).lte("day", to);
  if (body.userId) q = q.eq("user_id", String(body.userId));
  const { data, error } = await q.order("user_name").order("day").limit(20000);
  if (error) return fail(error.message);
  const rows = (data || []) as Row[];
  const withLinks = body.urls === "none" ? rows.map((r) => ({
    id: r.id, userId: r.user_id, username: r.username, userName: r.user_name, team: r.team,
    day: r.day, note: r.note, hasPhoto: !!r.photo_path, photoUrl: null, thumbUrl: null,
    createdAt: r.created_at, updatedAt: r.updated_at,
  })) : await withUrls(rows);
  return json({ ok: true, entries: withLinks });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: CORS });
  try {
    const type = req.headers.get("content-type") || "";
    if (type.includes("multipart/form-data")) {
      const form = await req.formData();
      if (String(form.get("action") || "") !== "save") return fail("未知的動作");
      return await handleSave(form);
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, string>;
    switch (body.action) {
      case "mine":
        return await handleMine(body);
      case "delete":
        return await handleDelete(body);
      case "admin_list":
        return await handleAdminList(body);
      default:
        return fail("未知的動作");
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
});
