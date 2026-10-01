import { createClient } from "npm:@supabase/supabase-js@2";

const SCHEMA_VERSION = 2;
const ENDORSEMENT_URL = "https://reurl.cc/0aEyZ9";
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

async function settings() {
  const { data, error } = await sb.from("line_settings").select("key, value");
  if (error) throw new Error(error.message);
  const map = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  return { token: String(map.channel_access_token || ""), groupId: String(map.receipt_group_id || "") };
}

async function userId(token: string) {
  if (!token) return null;
  const { data, error } = await sb.rpc("admin_qa_user_id", { p_token: token });
  if (error) throw new Error(error.message);
  return (data as string | null) || null;
}

const s = (v: unknown) => String(v ?? "").trim();
const norm = (v: unknown) => s(v).replace(/\s+/g, "");

type SubmitFields = {
  rentManagerName: string;
  propertyAddress: string;
  landlordName: string;
  landlordPhone: string;
  deposit: string;
};
type DoneFields = { propertyAddress: string; supervisor: string; result: string; submitRentManagerName: string };

function submitFields(b: Record<string, unknown>): SubmitFields {
  return {
    rentManagerName: s(b.rentManagerName),
    propertyAddress: s(b.propertyAddress),
    landlordName: s(b.landlordName),
    landlordPhone: s(b.landlordPhone),
    deposit: s(b.deposit),
  };
}

function doneFields(b: Record<string, unknown>): DoneFields {
  return {
    propertyAddress: s(b.propertyAddress),
    supervisor: s(b.supervisor),
    result: s(b.result) || "照會完畢",
    submitRentManagerName: s(b.submitRentManagerName),
  };
}

function missing(labels: Record<string, string>, f: Record<string, string>) {
  return Object.keys(labels).filter((k) => !f[k]).map((k) => labels[k]);
}

function submitMessage(f: SubmitFields) {
  return [
    "【領款收據】待主管照會",
    "租管師：" + f.rentManagerName,
    "物件地址：" + f.propertyAddress,
    "房東姓名：" + f.landlordName,
    "房東電話：" + f.landlordPhone,
    "押金：" + f.deposit,
    "",
    "請完成電話照會後填寫登記表：",
    ENDORSEMENT_URL,
    "",
    "照會完畢：請改選「主管照會完畢」，填寫物件地址、照會主管、照會結果、送件租管師姓名。",
  ].join("\n");
}

function doneMessage(f: DoneFields) {
  return [
    "【領款收據】照會結果通知",
    "物件地址：" + f.propertyAddress,
    "送件租管師：" + f.submitRentManagerName,
    "照會主管：" + f.supervisor,
    "照會結果：" + f.result,
    "",
    "可繼續後續領款收據／進件流程。",
  ].join("\n");
}

async function push(text: string) {
  const { token, groupId } = await settings();
  if (!token || !groupId) return "LINE 照會群尚未設定";
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ to: groupId, messages: [{ type: "text", text }] }),
  });
  if (res.ok) return "";
  const detail = await res.text().catch(() => "");
  if (res.status === 429) return "LINE 本月訊息額度已用完";
  return `LINE 推播失敗（${res.status}）${detail.slice(0, 120)}`;
}

async function findPending(match: (r: Record<string, string>) => boolean) {
  const { data, error } = await sb
    .from("receipt_endorsements")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  return (data || []).find(match) as Record<string, string> | undefined;
}

async function handleSubmit(b: Record<string, unknown>) {
  const uid = await userId(s(b.token));
  if (!uid) return json({ ok: false, error: "unauthorized", message: "請先登入工具箱" });
  const repush = !!b.repushOnly;
  const now = new Date().toISOString();

  if (s(b.formType) === "done") {
    const f = doneFields(b);
    const lack = missing(
      { propertyAddress: "物件地址", supervisor: "照會主管", result: "照會結果", submitRentManagerName: "送件租管師姓名" },
      f,
    );
    if (lack.length) return json({ ok: false, error: "missing_fields", message: "請填寫：" + lack.join("、") });
    let id: string | null = null;
    if (!repush) {
      const rec = await findPending((r) =>
        norm(r.property_address) === norm(f.propertyAddress) && norm(r.rent_manager_name) === norm(f.submitRentManagerName)
      );
      if (!rec) {
        return json({
          ok: false,
          error: "case_not_found",
          message: "找不到待照會案件，請確認「物件地址」與「送件租管師姓名」與送件時相同，或先送出「租管師送件」。",
        });
      }
      id = rec.id;
      const { error } = await sb
        .from("receipt_endorsements")
        .update({ status: "done", supervisor: f.supervisor, result: f.result, done_by: uid, done_at: now, updated_at: now })
        .eq("id", id);
      if (error) throw new Error(error.message);
    }
    const err = await push(doneMessage(f));
    if (id) await sb.from("receipt_endorsements").update({ line_error: err }).eq("id", id);
    if (err) return json({ ok: false, error: "line_failed", saved: !repush, canRepush: true, message: (repush ? "" : "已存檔但 ") + err });
    return json({ ok: true, formType: "done", message: repush ? "已重新通知照會群：照會完畢" : "已通知照會群：照會完畢" });
  }

  const f = submitFields(b);
  const lack = missing(
    { rentManagerName: "租管師姓名", propertyAddress: "物件地址", landlordName: "房東姓名", landlordPhone: "房東電話", deposit: "押金" },
    f,
  );
  if (lack.length) return json({ ok: false, error: "missing_fields", message: "請填寫：" + lack.join("、") });

  let id: string | null = null;
  if (!repush) {
    const { data: acc } = await sb.from("toolbox_accounts").select("name, username").eq("id", uid).maybeSingle();
    const row = {
      user_id: uid,
      user_name: acc?.name || acc?.username || "",
      rent_manager_name: f.rentManagerName,
      property_address: f.propertyAddress,
      landlord_name: f.landlordName,
      landlord_phone: f.landlordPhone,
      deposit: f.deposit,
      updated_at: now,
    };
    const existing = await findPending((r) =>
      norm(r.property_address) === norm(f.propertyAddress) && norm(r.landlord_phone) === norm(f.landlordPhone)
    );
    if (existing) {
      id = existing.id;
      const { error } = await sb.from("receipt_endorsements").update(row).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { data, error } = await sb.from("receipt_endorsements").insert(row).select("id").single();
      if (error) throw new Error(error.message);
      id = String(data.id);
    }
  }
  const err = await push(submitMessage(f));
  if (id) await sb.from("receipt_endorsements").update({ line_error: err }).eq("id", id);
  if (err) return json({ ok: false, error: "line_failed", saved: !repush, canRepush: true, message: (repush ? "" : "已存檔但 ") + err });
  return json({ ok: true, formType: "submit", message: repush ? "已重新通知照會群：待主管照會" : "已通知照會群：待主管照會" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: CORS });
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.action === "status") {
      const { token, groupId } = await settings();
      return json({
        ok: true,
        schemaVersion: SCHEMA_VERSION,
        lineConfigured: !!token,
        groupConfigured: !!groupId,
        ready: !!token && !!groupId,
        endorsementFormUrl: ENDORSEMENT_URL,
      });
    }
    if (body.action === "submit") return await handleSubmit(body);
    return json({ ok: false, error: "unknown_action", message: "未知的動作" });
  } catch (e) {
    return json({ ok: false, error: "server_error", message: e instanceof Error ? e.message : String(e) });
  }
});
