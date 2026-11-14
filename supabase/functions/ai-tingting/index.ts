/**
 * AI婷婷 問答 Edge Function
 * actions: ask | get | list | answer
 *
 * Secrets（Supabase Dashboard → Edge Functions → Secrets，勿寫進 repo）:
 * - GROK_WEBHOOK_URL
 * - GROK_WEBHOOK_KEY
 * - AI_TINGTING_ANSWER_SECRET
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-answer-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RATE_LIMIT = 3;
const RATE_WINDOW_MS = 60_000;
const MAX_Q = 500;

const sb = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

const fail = (error: string, status = 400) => json({ ok: false, error }, status);

function bearer(req: Request) {
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : "";
}

async function resolveUser(token: string) {
  if (!token) return null;
  const { data, error } = await sb.rpc("admin_qa_user_id", { p_token: token });
  if (error) throw new Error(error.message);
  const uid = (data as string | null) || null;
  if (!uid) return null;
  const { data: acc, error: accErr } = await sb
    .from("toolbox_accounts")
    .select("id, name, username")
    .eq("id", uid)
    .maybeSingle();
  if (accErr) throw new Error(accErr.message);
  if (!acc) return null;
  return {
    id: String(acc.id),
    name: String(acc.name || acc.username || "").trim() || "使用者",
  };
}

function functionPublicUrl(req: Request) {
  const envUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  if (envUrl) return `${envUrl}/functions/v1/ai-tingting`;
  try {
    const u = new URL(req.url);
    return `${u.origin}${u.pathname.replace(/\/$/, "")}`;
  } catch {
    return "";
  }
}

async function handleAsk(req: Request, body: Record<string, unknown>) {
  const token = bearer(req);
  const user = await resolveUser(token);
  if (!user) return fail("請先登入", 401);

  const zone = String(body.zone || "").trim();
  if (zone !== "admin" && zone !== "supervisor") {
    return fail("zone 須為 admin 或 supervisor");
  }
  const question = String(body.question || body.text || "").trim();
  if (!question) return fail("請輸入問題");
  if (question.length > MAX_Q) return fail(`問題請勿超過 ${MAX_Q} 字`);

  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count, error: cntErr } = await sb
    .from("ai_tingting_questions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since);
  if (cntErr) return fail(cntErr.message, 500);
  if ((count || 0) >= RATE_LIMIT) {
    return fail("每分鐘最多提問 3 次，請稍後再試", 429);
  }

  const { data: row, error: insErr } = await sb
    .from("ai_tingting_questions")
    .insert({
      user_id: user.id,
      user_name: user.name,
      zone,
      question,
      status: "pending",
      answer: "",
    })
    .select("id")
    .single();
  if (insErr || !row) return fail(insErr?.message || "寫入失敗", 500);

  const webhookUrl = (Deno.env.get("GROK_WEBHOOK_URL") || "").trim();
  const webhookKey = (Deno.env.get("GROK_WEBHOOK_KEY") || "").trim();
  if (!webhookUrl || !webhookKey) {
    await sb
      .from("ai_tingting_questions")
      .update({ status: "failed", answered_at: new Date().toISOString() })
      .eq("id", row.id);
    return fail("伺服器未設定 GROK webhook", 500);
  }

  const payload = {
    source: "toolbox",
    questionId: row.id,
    zone,
    userName: user.name,
    text: question,
    answerUrl: functionPublicUrl(req),
  };

  try {
    const wh = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + webhookKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!wh.ok) {
      const t = await wh.text().catch(() => "");
      console.error("grok webhook failed", wh.status, t.slice(0, 300));
      await sb
        .from("ai_tingting_questions")
        .update({ status: "failed", answered_at: new Date().toISOString() })
        .eq("id", row.id);
      return fail("轉送 AI 失敗，請稍後再試", 502);
    }
  } catch (e) {
    console.error("grok webhook error", e);
    await sb
      .from("ai_tingting_questions")
      .update({ status: "failed", answered_at: new Date().toISOString() })
      .eq("id", row.id);
    return fail("轉送 AI 失敗，請稍後再試", 502);
  }

  return json({ ok: true, questionId: row.id });
}

async function handleGet(req: Request, body: Record<string, unknown>) {
  const token = bearer(req);
  const user = await resolveUser(token);
  if (!user) return fail("請先登入", 401);

  const questionId = String(body.questionId || body.id || "").trim();
  if (!questionId) return fail("缺少 questionId");

  const { data, error } = await sb
    .from("ai_tingting_questions")
    .select("id, status, answer, question, zone, created_at, answered_at")
    .eq("id", questionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail("找不到這筆問答", 404);

  return json({
    ok: true,
    id: data.id,
    status: data.status,
    answer: data.answer || "",
    question: data.question,
    zone: data.zone,
    createdAt: data.created_at,
    answeredAt: data.answered_at,
  });
}

async function handleList(req: Request) {
  const token = bearer(req);
  const user = await resolveUser(token);
  if (!user) return fail("請先登入", 401);

  const { data, error } = await sb
    .from("ai_tingting_questions")
    .select("id, status, answer, question, zone, created_at, answered_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return fail(error.message, 500);

  return json({
    ok: true,
    items: (data || []).map((r) => ({
      id: r.id,
      status: r.status,
      answer: r.answer || "",
      question: r.question,
      zone: r.zone,
      createdAt: r.created_at,
      answeredAt: r.answered_at,
    })),
  });
}

async function handleAnswer(req: Request, body: Record<string, unknown>) {
  const secret = (req.headers.get("x-answer-secret") || "").trim();
  const expected = (Deno.env.get("AI_TINGTING_ANSWER_SECRET") || "").trim();
  if (!expected || secret !== expected) return fail("未授權", 401);

  const questionId = String(body.questionId || body.id || "").trim();
  const answer = String(body.answer || "").trim();
  if (!questionId) return fail("缺少 questionId");
  if (!answer) return fail("缺少 answer");

  const { data, error } = await sb
    .from("ai_tingting_questions")
    .update({
      answer,
      status: "answered",
      answered_at: new Date().toISOString(),
    })
    .eq("id", questionId)
    .select("id, status")
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail("找不到 questionId", 404);

  return json({ ok: true, questionId: data.id, status: data.status });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return fail("僅支援 POST", 405);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail("JSON body 無效");
  }

  const action = String(body.action || "").trim().toLowerCase();
  try {
    if (action === "ask") return await handleAsk(req, body);
    if (action === "get") return await handleGet(req, body);
    if (action === "list") return await handleList(req);
    if (action === "answer") return await handleAnswer(req, body);
    return fail("未知 action（ask / get / list / answer）");
  } catch (e) {
    console.error(e);
    return fail(e instanceof Error ? e.message : "伺服器錯誤", 500);
  }
});
