import { createClient } from "npm:@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const sb = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

const HOW_TO =
  "要接收星鴻工具箱通知，請到工具箱「行政專區 → 星鴻註銷物件申請 → 🔔 主管綁定 LINE」取得 6 位數驗證碼，再傳「綁定 驗證碼」給我（例如：綁定 123456）。";

let cached: Record<string, string> | null = null;
async function settings() {
  if (cached) return cached;
  const { data, error } = await sb.from("line_settings").select("key, value");
  if (error) throw new Error(error.message);
  cached = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  return cached;
}

async function validSignature(raw: string, signature: string, secret: string) {
  if (!signature || !secret) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const expected = btoa(String.fromCharCode(...mac));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

async function lineApi(path: string, token: string, body?: unknown) {
  const res = await fetch("https://api.line.me" + path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: "Bearer " + token, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch { /* non-JSON */ }
  return { ok: res.ok, status: res.status, data };
}

async function reply(token: string, replyToken: string, text: string) {
  if (!replyToken) return;
  await lineApi("/v2/bot/message/reply", token, { replyToken, messages: [{ type: "text", text }] });
}

function bindCodeOf(text: string) {
  const s = text.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).trim();
  const m = /^(?:綁定)?\s*(\d{6})$/.exec(s);
  return m ? m[1] : null;
}

async function bind(code: string, lineUserId: string, token: string) {
  const { data: row, error } = await sb
    .from("line_bind_codes")
    .select("user_id, expires_at")
    .eq("code", code)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    return "驗證碼錯誤或已過期，請回工具箱重新取得驗證碼。";
  }

  const profile = await lineApi("/v2/bot/profile/" + encodeURIComponent(lineUserId), token);
  const lineName = profile.ok ? String(profile.data.displayName || "") : "";

  await sb.from("line_bindings").delete().eq("line_user_id", lineUserId).neq("user_id", row.user_id);
  const { data: existing } = await sb
    .from("line_bindings")
    .select("notify_object_cancel")
    .eq("user_id", row.user_id)
    .maybeSingle();
  const { error: upErr } = await sb.from("line_bindings").upsert({
    user_id: row.user_id,
    line_user_id: lineUserId,
    line_name: lineName,
    notify_object_cancel: existing?.notify_object_cancel ?? false,
    bound_at: new Date().toISOString(),
  });
  if (upErr) throw new Error(upErr.message);
  await sb.from("line_bind_codes").delete().eq("user_id", row.user_id);

  const { data: acc } = await sb.from("toolbox_accounts").select("name, username").eq("id", row.user_id).maybeSingle();
  return "✅ 已綁定工具箱帳號：" + (acc?.name || acc?.username || "") + "\n之後的工具箱通知會傳到這裡。";
}

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { type?: string; userId?: string };
  message?: { type?: string; text?: string };
};

async function forward(url: string, raw: string, signature: string) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-line-signature": signature },
      body: raw,
    });
    if (!res.ok) console.warn("[toolbox-line-webhook] forward HTTP", res.status);
  } catch (e) {
    console.warn("[toolbox-line-webhook] forward failed", e instanceof Error ? e.message : e);
  }
}

async function handle(ev: LineEvent, token: string) {
  if (ev.source?.type !== "user" || !ev.source.userId) return;
  if (ev.type !== "message" || ev.message?.type !== "text") return;
  const text = String(ev.message.text || "");
  const code = bindCodeOf(text);
  if (code) {
    await reply(token, ev.replyToken || "", await bind(code, ev.source.userId, token));
  } else if (/綁定/.test(text)) {
    await reply(token, ev.replyToken || "", HOW_TO);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const raw = await req.text();
  try {
    const cfg = await settings();
    const signature = req.headers.get("x-line-signature") || "";
    if (!(await validSignature(raw, signature, cfg.channel_secret || ""))) {
      return new Response("bad signature", { status: 401 });
    }
    // A Google Apps Script automation also consumes this OA's events, so every verified event must be relayed.
    if (cfg.forward_webhook_url) EdgeRuntime.waitUntil(forward(cfg.forward_webhook_url, raw, signature));
    const payload = JSON.parse(raw || "{}") as { events?: LineEvent[] };
    for (const ev of payload.events || []) {
      try {
        await handle(ev, cfg.channel_access_token || "");
      } catch (e) {
        console.error("[toolbox-line-webhook]", e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    console.error("[toolbox-line-webhook]", e instanceof Error ? e.message : e);
  }
  return new Response("ok");
});
