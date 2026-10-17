import { createClient } from "npm:@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const sb = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

const HOW_TO =
  "要接收星鴻工具箱通知，請到工具箱「行政專區 → 星鴻註銷物件申請 → 🔔 主管綁定 LINE」取得 6 位數驗證碼，再傳「綁定 驗證碼」給我（例如：綁定 123456）。";

const OPS_NAME = "簡為倢";

let cached: Record<string, string> | null = null;
async function settings() {
  if (cached) return cached;
  const { data, error } = await sb.from("line_settings").select("key, value");
  if (error) throw new Error(error.message);
  cached = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  return cached;
}

function bustSettings() {
  cached = null;
}

async function upsertSetting(key: string, value: string) {
  const { error } = await sb.from("line_settings").upsert({ key, value });
  if (error) throw new Error(error.message);
  bustSettings();
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
  return { ok: res.ok, status: res.status, data, text };
}

async function reply(token: string, replyToken: string, text: string) {
  if (!replyToken) return;
  await lineApi("/v2/bot/message/reply", token, { replyToken, messages: [{ type: "text", text }] });
}

async function pushText(token: string, to: string, text: string) {
  return lineApi("/v2/bot/message/push", token, {
    to,
    messages: [{ type: "text", text: String(text || "").slice(0, 5000) }],
  });
}

function bindCodeOf(text: string) {
  const s = text.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).trim();
  const m = /^(?:綁定)?\s*(\d{6})$/.exec(s);
  return m ? m[1] : null;
}

function parseJsonIds(raw: string | undefined) {
  try {
    const v = JSON.parse(String(raw || "[]"));
    return Array.isArray(v) ? v.map((x) => String(x || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function resolveOpsAlertIds(cfg: Record<string, string>) {
  const ids = new Set(parseJsonIds(cfg.ops_alert_user_ids));
  const names = new Set([...parseJsonIds(cfg.ops_alert_names), OPS_NAME]);
  if (names.size) {
    const { data } = await sb
      .from("toolbox_accounts")
      .select("id, name")
      .in("name", [...names]);
    const userIds = (data || []).map((r) => r.id);
    if (userIds.length) {
      const { data: binds } = await sb.from("line_bindings").select("line_user_id").in("user_id", userIds);
      for (const b of binds || []) {
        const id = String(b.line_user_id || "").trim();
        if (id) ids.add(id);
      }
    }
  }
  return [...ids];
}

async function saveOpsAlertUser(lineUserId: string, lineName: string) {
  const cfg = await settings();
  const ids = new Set(parseJsonIds(cfg.ops_alert_user_ids));
  ids.add(lineUserId);
  await upsertSetting("ops_alert_user_ids", JSON.stringify([...ids]));
  const names = new Set(parseJsonIds(cfg.ops_alert_names));
  names.add(OPS_NAME);
  if (lineName) names.add(lineName);
  await upsertSetting("ops_alert_names", JSON.stringify([...names]));
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
  const text = String(ev.message.text || "").trim();
  const code = bindCodeOf(text);
  if (code) {
    await reply(token, ev.replyToken || "", await bind(code, ev.source.userId, token));
    return;
  }
  if (text === "設為資料告警" || text === "綁定資料告警") {
    const profile = await lineApi("/v2/bot/profile/" + encodeURIComponent(ev.source.userId), token);
    const lineName = profile.ok ? String(profile.data.displayName || "") : "";
    await saveOpsAlertUser(ev.source.userId, lineName || OPS_NAME);
    await reply(
      token,
      ev.replyToken || "",
      `✅ 已設定資料告警${lineName ? `（${lineName}）` : ""}。\n之後每天早上 8 點更新行政／清冊／審件資料若失敗（含額度不夠），會 LINE 通知你。`,
    );
    return;
  }
  if (/綁定/.test(text)) {
    await reply(token, ev.replyToken || "", HOW_TO);
  }
}

/** Worker 晨間更新失敗時呼叫：用萬能小幫手推播給告警對象 */
async function handleOpsAlertPush(req: Request) {
  const cfg = await settings();
  const secret = req.headers.get("x-ops-secret") || "";
  const expected = String(cfg.ops_alert_secret || Deno.env.get("OPS_ALERT_SECRET") || "").trim();
  if (!expected || secret !== expected) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const body = await req.json().catch(() => ({})) as { text?: string };
  const text = String(body.text || "").trim();
  if (!text) {
    return new Response(JSON.stringify({ ok: false, error: "empty" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const token = cfg.channel_access_token || "";
  if (!token) {
    return new Response(JSON.stringify({ ok: false, error: "no line token" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
  const ids = await resolveOpsAlertIds(cfg);
  if (!ids.length) {
    return new Response(JSON.stringify({ ok: false, error: "no ops targets" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  const sent: string[] = [];
  const errors: string[] = [];
  for (const to of ids) {
    const r = await pushText(token, to, text);
    if (r.ok) sent.push(to);
    else errors.push(`${to}:${r.status}`);
  }
  return new Response(JSON.stringify({ ok: sent.length > 0, sent: sent.length, errors }), {
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  if (req.headers.get("x-ops-alert") === "1") {
    try {
      return await handleOpsAlertPush(req);
    } catch (e) {
      console.error("[toolbox-line-webhook] ops-alert", e instanceof Error ? e.message : e);
      return new Response(JSON.stringify({ ok: false, error: "server" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }
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
