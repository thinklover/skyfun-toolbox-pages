-- 離職交接 v2：行政／業務雙流程、三方簽核、後端結案阻擋、稽核
-- 保留 toolbox_handover_progress（見 handover-progress.sql），不刪舊資料。
-- 本檔待負責人確認後再套用遠端；開發分支僅提交檔案。

-- ========== 表 ==========
create table if not exists public.toolbox_handover_case (
  id bigserial primary key,
  kind text not null check (kind in ('admin', 'biz')),
  leave_type text not null default 'resign'
    check (leave_type in ('resign', 'leave_without_pay')),
  status text not null default 'draft'
    check (status in (
      'draft', 'transferor_done', 'receiver_review', 'manager_review', 'returned', 'closed'
    )),
  filled_at date,
  unit text not null default '行政管理部',
  region text not null default '',
  transferor_name text not null,
  transferor_phone text not null default '',
  transferor_address text not null default '',
  leave_date date,
  last_work_date date,
  receiver_name text not null default '',
  manager_name text not null default '',
  transferor_user_id uuid references public.toolbox_accounts(id) on delete set null,
  receiver_user_id uuid references public.toolbox_accounts(id) on delete set null,
  manager_user_id uuid references public.toolbox_accounts(id) on delete set null,
  return_reason text not null default '',
  locked boolean not null default false,
  transferor_confirmed_at timestamptz,
  receiver_confirmed_at timestamptz,
  manager_confirmed_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references public.toolbox_accounts(id) on delete set null,
  account_need_disable boolean not null default true,
  account_disabled_by text not null default '',
  account_disabled_at timestamptz,
  account_disable_evidence text not null default '',
  meta jsonb not null default '{}'::jsonb,
  created_by uuid references public.toolbox_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint toolbox_handover_case_biz_no_lwp check (
    kind <> 'biz' or leave_type = 'resign'
  )
);

create index if not exists toolbox_handover_case_kind_status_idx
  on public.toolbox_handover_case (kind, status, updated_at desc);
create index if not exists toolbox_handover_case_transferor_idx
  on public.toolbox_handover_case (transferor_name);

create table if not exists public.toolbox_handover_item (
  id bigserial primary key,
  case_id bigint not null references public.toolbox_handover_case(id) on delete cascade,
  section text not null,
  item_key text not null,
  label text not null default '',
  result text not null default 'unset'
    check (result in ('unset', 'yes', 'no', 'na', 'done', 'pending')),
  qty text not null default '',
  path_note text not null default '',
  progress_note text not null default '',
  handover_person text not null default '',
  remark text not null default '',
  need_disable boolean not null default false,
  disabled_verified boolean not null default false,
  disabled_by text not null default '',
  disabled_at timestamptz,
  disabled_evidence text not null default '',
  receiver_ok boolean not null default false,
  receiver_note text not null default '',
  manager_ok boolean not null default false,
  manager_note text not null default '',
  sort_order int not null default 0,
  unique (case_id, section, item_key)
);

create index if not exists toolbox_handover_item_case_idx
  on public.toolbox_handover_item (case_id, sort_order);

create table if not exists public.toolbox_handover_matter (
  id bigserial primary key,
  case_id bigint not null references public.toolbox_handover_case(id) on delete cascade,
  match_no text not null default '',
  address text not null default '',
  landlord text not null default '',
  tenant text not null default '',
  lease_start text not null default '',
  lease_end text not null default '',
  rent text not null default '',
  case_type text not null default '',
  expense_type text not null default '',
  amount text not null default '',
  apply_date text not null default '',
  subsidy_status text not null default '',
  contract_active boolean not null default true,
  handover_done boolean not null default false,
  status_snapshot text not null default '',
  source text not null default 'manual',
  pending_verify boolean not null default true,
  checks jsonb not null default '{}'::jsonb,
  current_status text not null default '',
  todos text not null default '',
  receiver_name text not null default '',
  due_date date,
  phone_check_ok boolean not null default false,
  phone_check_note text not null default '',
  phone_check_at timestamptz,
  phone_check_by text not null default '',
  receiver_ok boolean not null default false,
  manager_ok boolean not null default false,
  migrated_from text not null default '',
  sort_order int not null default 0,
  unique (case_id, match_no, address)
);

create index if not exists toolbox_handover_matter_case_idx
  on public.toolbox_handover_matter (case_id, sort_order);

create table if not exists public.toolbox_handover_attachment (
  id bigserial primary key,
  case_id bigint not null references public.toolbox_handover_case(id) on delete cascade,
  item_id bigint references public.toolbox_handover_item(id) on delete set null,
  matter_id bigint references public.toolbox_handover_matter(id) on delete set null,
  kind text not null default 'evidence',
  name text not null default '',
  storage_path text not null default '',
  url text not null default '',
  visible_roles text[] not null default array['transferor','receiver','manager','admin'],
  uploaded_by uuid references public.toolbox_accounts(id) on delete set null,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.toolbox_handover_event (
  id bigserial primary key,
  case_id bigint not null references public.toolbox_handover_case(id) on delete cascade,
  action text not null,
  actor_id uuid,
  actor_name text not null default '',
  before_val jsonb,
  after_val jsonb,
  created_at timestamptz not null default now()
);

create index if not exists toolbox_handover_event_case_idx
  on public.toolbox_handover_event (case_id, created_at desc);

create table if not exists public.toolbox_handover_liability_doc (
  id bigserial primary key,
  case_id bigint not null references public.toolbox_handover_case(id) on delete cascade,
  title text not null default '行政疏失責任同意書',
  attachment_id bigint references public.toolbox_handover_attachment(id) on delete set null,
  note text not null default '',
  signed_noted boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.toolbox_handover_case enable row level security;
alter table public.toolbox_handover_item enable row level security;
alter table public.toolbox_handover_matter enable row level security;
alter table public.toolbox_handover_attachment enable row level security;
alter table public.toolbox_handover_event enable row level security;
alter table public.toolbox_handover_liability_doc enable row level security;

revoke all on public.toolbox_handover_case from public, anon, authenticated;
revoke all on public.toolbox_handover_item from public, anon, authenticated;
revoke all on public.toolbox_handover_matter from public, anon, authenticated;
revoke all on public.toolbox_handover_attachment from public, anon, authenticated;
revoke all on public.toolbox_handover_event from public, anon, authenticated;
revoke all on public.toolbox_handover_liability_doc from public, anon, authenticated;

-- 稽核不可改刪（僅 insert via RPC）
create or replace function public.toolbox_handover_event_no_mutate()
returns trigger language plpgsql as $$
begin
  raise exception '稽核紀錄不可修改或刪除';
end;
$$;

drop trigger if exists toolbox_handover_event_no_update on public.toolbox_handover_event;
create trigger toolbox_handover_event_no_update
  before update or delete on public.toolbox_handover_event
  for each row execute function public.toolbox_handover_event_no_mutate();

-- ========== 輔助 ==========
create or replace function public.toolbox_handover_actor(p_token text)
returns table(uid uuid, uname text, uteam text, utitle text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
begin
  if v_uid is null then
    return;
  end if;
  return query
  select a.id,
    trim(coalesce(nullif(a.name, ''), a.username)),
    trim(coalesce(a.team, '')),
    trim(coalesce(a.job_title, ''))
  from public.toolbox_accounts a where a.id = v_uid;
end;
$$;

create or replace function public.toolbox_handover_log(
  p_case bigint, p_action text, p_uid uuid, p_name text, p_before jsonb, p_after jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.toolbox_handover_event(case_id, action, actor_id, actor_name, before_val, after_val)
  values (p_case, p_action, p_uid, coalesce(p_name, ''), p_before, p_after);
end;
$$;

create or replace function public.toolbox_handover_role_of(
  p_case public.toolbox_handover_case, p_name text
) returns text language plpgsql stable as $$
begin
  if p_name <> '' and trim(p_case.transferor_name) = p_name then return 'transferor'; end if;
  if p_name <> '' and trim(p_case.receiver_name) = p_name then return 'receiver'; end if;
  if p_name <> '' and trim(p_case.manager_name) = p_name then return 'manager'; end if;
  if p_case.unit = '行政管理部' or p_name = '黃怡婷' then return 'admin'; end if;
  return 'other';
end;
$$;

-- 行政預設細項種子
create or replace function public.toolbox_handover_seed_admin_items(p_case bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  rows text[][] := array[
    array['01','seal_table','保管印鑑：業者/公會印鑑管理表與數量','1'],
    array['01','hw_pc','硬體：電腦主機（數量）','2'],
    array['01','hw_monitor','硬體：螢幕（數量）','3'],
    array['01','hw_laptop','硬體：筆電（數量）','4'],
    array['01','hw_kb_mouse','硬體：鍵盤／滑鼠（數量）','5'],
    array['01','hw_phone','硬體：話機／公務手機（數量）','6'],
    array['01','hw_cert','硬體：工商憑證卡／讀卡機／門禁卡（數量）','7'],
    array['01','prop_uniform','公司財產：制服／鑰匙／文具（數量）','8'],
    array['02','files_roster','文件：清冊檔案存放路徑','10'],
    array['02','files_cashflow','文件：包租金流暫存檔路徑','11'],
    array['02','files_official','文件：收發公文／公文字號留存','12'],
    array['02','files_contracts','文件：各式合約路徑','13'],
    array['03','acct_skyfun','帳號：星鴻系統權限關閉（須核實停用證據）','20'],
    array['03','acct_moi','帳號：營建署帳號註銷（須簽停用申請書）','21'],
    array['03','acct_edoc','帳號：電子公文帳號密碼移轉修改（只記已移轉，不存密碼）','22'],
    array['03','comm_line','通訊：公會/公司 LINE 退群確認','23'],
    array['03','comm_official','通訊：官方帳號','24'],
    array['03','comm_email','通訊：Email 帳號與密碼修改確認（不存明文密碼）','25'],
    array['04','guild_contact','公會對接：注意事項與對接人員／週期流程','30'],
    array['04','guild_forms','公會：例行表單與時限（週報／送件／清冊／發票）','31'],
    array['04','guild_schedule','公會：送件期程表／電子公文','32'],
    array['04','guild_copy','公會：代調謄本注意事項','33'],
    array['04','guild_rename','公會：出租人承租人更換存摺或更名文件差異','34'],
    array['05','case_subsidy_done','案件：審核中補助/補件是否完成','40'],
    array['05','case_vendor_repair','案件：外包廠商修繕群組是否完成','41'],
    array['05','case_resubmit_p5','案件：退件後是否於5期系統重新送件成功','42'],
    array['05','case_300_no','300億：管理案件是否皆有案號','43'],
    array['05','case_300_upload','300億：產編後是否於委外專區補上合約並留存共槽','44'],
    array['05','case_lease_login','登錄：租賃住宅服務業資訊提供登錄','45'],
    array['06','todo_periodic','待辦：定期作業交辦','50'],
    array['06','todo_groups','待辦：各式回報群組','51'],
    array['06','todo_projects','待辦：對接窗口專案進度及未完事項','52'],
    array['06','todo_other','待辦：其他職務內容','53']
  ];
  r text[];
begin
  foreach r slice 1 in array rows loop
    insert into public.toolbox_handover_item(case_id, section, item_key, label, sort_order, need_disable)
    values (
      p_case, r[1], r[2], r[3], r[4]::int,
      r[2] in ('acct_skyfun', 'acct_moi')
    )
    on conflict (case_id, section, item_key) do nothing;
  end loop;
end;
$$;

-- ========== JSON 序列化 ==========
create or replace function public.toolbox_handover_case_json(c public.toolbox_handover_case)
returns json language sql stable as $$
  select json_build_object(
    'id', c.id,
    'kind', c.kind,
    'leaveType', c.leave_type,
    'status', c.status,
    'filledAt', c.filled_at,
    'unit', c.unit,
    'region', c.region,
    'transferorName', c.transferor_name,
    'transferorPhone', c.transferor_phone,
    'transferorAddress', c.transferor_address,
    'leaveDate', c.leave_date,
    'lastWorkDate', c.last_work_date,
    'receiverName', c.receiver_name,
    'managerName', c.manager_name,
    'returnReason', c.return_reason,
    'locked', c.locked,
    'transferorConfirmedAt', c.transferor_confirmed_at,
    'receiverConfirmedAt', c.receiver_confirmed_at,
    'managerConfirmedAt', c.manager_confirmed_at,
    'closedAt', c.closed_at,
    'accountNeedDisable', c.account_need_disable,
    'accountDisabledBy', c.account_disabled_by,
    'accountDisabledAt', c.account_disabled_at,
    'accountDisableEvidence', c.account_disable_evidence,
    'meta', c.meta,
    'createdAt', c.created_at,
    'updatedAt', c.updated_at
  );
$$;

create or replace function public.toolbox_handover_item_json(i public.toolbox_handover_item)
returns json language sql stable as $$
  select json_build_object(
    'id', i.id,
    'caseId', i.case_id,
    'section', i.section,
    'itemKey', i.item_key,
    'label', i.label,
    'result', i.result,
    'qty', i.qty,
    'pathNote', i.path_note,
    'progressNote', i.progress_note,
    'handoverPerson', i.handover_person,
    'remark', i.remark,
    'needDisable', i.need_disable,
    'disabledVerified', i.disabled_verified,
    'disabledBy', i.disabled_by,
    'disabledAt', i.disabled_at,
    'disabledEvidence', i.disabled_evidence,
    'receiverOk', i.receiver_ok,
    'receiverNote', i.receiver_note,
    'managerOk', i.manager_ok,
    'managerNote', i.manager_note,
    'sortOrder', i.sort_order
  );
$$;

create or replace function public.toolbox_handover_matter_json(m public.toolbox_handover_matter)
returns json language sql stable as $$
  select json_build_object(
    'id', m.id,
    'caseId', m.case_id,
    'matchNo', m.match_no,
    'address', m.address,
    'landlord', m.landlord,
    'tenant', m.tenant,
    'leaseStart', m.lease_start,
    'leaseEnd', m.lease_end,
    'rent', m.rent,
    'caseType', m.case_type,
    'expenseType', m.expense_type,
    'amount', m.amount,
    'applyDate', m.apply_date,
    'subsidyStatus', m.subsidy_status,
    'contractActive', m.contract_active,
    'handoverDone', m.handover_done,
    'statusSnapshot', m.status_snapshot,
    'source', m.source,
    'pendingVerify', m.pending_verify,
    'checks', m.checks,
    'currentStatus', m.current_status,
    'todos', m.todos,
    'receiverName', m.receiver_name,
    'dueDate', m.due_date,
    'phoneCheckOk', m.phone_check_ok,
    'phoneCheckNote', m.phone_check_note,
    'phoneCheckAt', m.phone_check_at,
    'phoneCheckBy', m.phone_check_by,
    'receiverOk', m.receiver_ok,
    'managerOk', m.manager_ok,
    'migratedFrom', m.migrated_from,
    'sortOrder', m.sort_order
  );
$$;

-- ========== 結案阻擋 ==========
create or replace function public.toolbox_handover_collect_blockers(p_case bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c public.toolbox_handover_case%rowtype;
  blockers jsonb := '[]'::jsonb;
  n int;
begin
  select * into c from public.toolbox_handover_case where id = p_case;
  if not found then
    return '["找不到交接案件"]'::jsonb;
  end if;

  if trim(c.transferor_name) = '' then
    blockers := blockers || '["缺移交人姓名"]'::jsonb;
  end if;
  if trim(c.receiver_name) = '' then
    blockers := blockers || '["缺接手人"]'::jsonb;
  end if;
  if trim(c.manager_name) = '' then
    blockers := blockers || '["缺單位主管"]'::jsonb;
  end if;
  if trim(c.transferor_name) = trim(c.receiver_name)
     or trim(c.transferor_name) = trim(c.manager_name)
     or trim(c.receiver_name) = trim(c.manager_name) then
    blockers := blockers || '["移交人／接手人／主管不可為同一人"]'::jsonb;
  end if;
  if c.transferor_confirmed_at is null then
    blockers := blockers || '["移交人尚未完成填報確認"]'::jsonb;
  end if;
  if c.receiver_confirmed_at is null then
    blockers := blockers || '["接手人尚未逐項確認"]'::jsonb;
  end if;
  if c.manager_confirmed_at is null then
    blockers := blockers || '["單位主管尚未複核"]'::jsonb;
  end if;

  if c.account_need_disable and (
    trim(c.account_disabled_by) = '' or c.account_disabled_at is null or trim(c.account_disable_evidence) = ''
  ) then
    blockers := blockers || '["帳號停用僅勾選不足：需執行人、時間與證據"]'::jsonb;
  end if;

  -- 未完成：unset／pending；no 且無進度說明也擋；na 需理由；停用項需核實
  select count(*) into n from public.toolbox_handover_item i
  where i.case_id = p_case
    and (
      i.result in ('unset', 'pending')
      or (i.result = 'no' and length(trim(i.progress_note)) = 0)
      or (i.result = 'na' and length(trim(i.remark)) = 0)
      or (i.result not in ('yes', 'done', 'na', 'no'))
      or (i.need_disable and not i.disabled_verified)
    );
  if n > 0 then
    blockers := blockers || jsonb_build_array('尚有 ' || n || ' 項細項未完成檢核（含停用未核實）');
  end if;

  select count(*) into n from public.toolbox_handover_item i
  where i.case_id = p_case and not i.receiver_ok;
  if n > 0 then
    blockers := blockers || jsonb_build_array('尚有 ' || n || ' 項細項未經接手人確認');
  end if;

  select count(*) into n from public.toolbox_handover_matter m
  where m.case_id = p_case and not m.handover_done;
  if n > 0 then
    blockers := blockers || jsonb_build_array('尚有 ' || n || ' 件逐案交接檢核未完成（履約中可完成交接，二者分開）');
  end if;

  select count(*) into n from public.toolbox_handover_matter m
  where m.case_id = p_case and m.handover_done and (
    length(trim(m.receiver_name)) = 0
    or (
      -- 有未完成子檢核時不可只靠接手人／期限放行
      coalesce(m.checks->>'incomplete', 'false') = 'true'
    )
  );
  if n > 0 then
    blockers := blockers || jsonb_build_array('逐案缺接手人或仍有未完成子檢核卻標已交接');
  end if;

  if c.kind = 'biz' then
    select count(*) into n from public.toolbox_handover_matter m
    where m.case_id = p_case and m.handover_done and not m.phone_check_ok;
    if n > 0 then
      blockers := blockers || jsonb_build_array('業務案尚有 ' || n || ' 件未經主管電話照會確認');
    end if;
  end if;

  return blockers;
end;
$$;

-- ========== RPCs ==========
create or replace function public.toolbox_handover_case_create(
  p_token text,
  p_kind text,
  p_transferor text,
  p_data jsonb default '{}'::jsonb
) returns json language plpgsql security definer set search_path = public as $$
declare
  a record;
  v_kind text := trim(coalesce(p_kind, ''));
  v_name text := left(trim(coalesce(p_transferor, '')), 40);
  v_leave text := coalesce(nullif(trim(p_data->>'leaveType'), ''), 'resign');
  v_id bigint;
  c public.toolbox_handover_case%rowtype;
begin
  select * into a from public.toolbox_handover_actor(p_token);
  if a.uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  if v_kind not in ('admin', 'biz') then return json_build_object('ok', false, 'error', 'kind 不正確'); end if;
  if v_name = '' then return json_build_object('ok', false, 'error', '請填移交人姓名'); end if;
  if v_kind = 'biz' then v_leave := 'resign'; end if;
  if v_leave not in ('resign', 'leave_without_pay') then
    return json_build_object('ok', false, 'error', '離職類型不正確');
  end if;

  insert into public.toolbox_handover_case(
    kind, leave_type, transferor_name, transferor_phone, transferor_address,
    unit, region, receiver_name, manager_name, filled_at, leave_date, last_work_date,
    transferor_user_id, created_by, meta
  ) values (
    v_kind, v_leave, v_name,
    left(trim(coalesce(p_data->>'transferorPhone', '')), 40),
    left(trim(coalesce(p_data->>'transferorAddress', '')), 200),
    case when v_kind = 'admin' then coalesce(nullif(trim(p_data->>'unit'), ''), '行政管理部') else coalesce(nullif(trim(p_data->>'unit'), ''), '') end,
    left(trim(coalesce(p_data->>'region', '')), 40),
    left(trim(coalesce(p_data->>'receiverName', '')), 40),
    left(trim(coalesce(p_data->>'managerName', '')), 40),
    nullif(p_data->>'filledAt', '')::date,
    nullif(p_data->>'leaveDate', '')::date,
    nullif(p_data->>'lastWorkDate', '')::date,
    a.uid, a.uid, coalesce(p_data->'meta', '{}'::jsonb)
  ) returning id into v_id;

  if v_kind = 'admin' then
    perform public.toolbox_handover_seed_admin_items(v_id);
  end if;

  perform public.toolbox_handover_log(v_id, 'create', a.uid, a.uname, null, jsonb_build_object('kind', v_kind, 'transferor', v_name));
  select * into c from public.toolbox_handover_case where id = v_id;
  return json_build_object('ok', true, 'case', public.toolbox_handover_case_json(c));
end;
$$;

create or replace function public.toolbox_handover_case_get(p_token text, p_id bigint)
returns json language plpgsql security definer set search_path = public as $$
declare
  a record;
  c public.toolbox_handover_case%rowtype;
  role text;
  items json;
  matters json;
  atts json;
  events json;
  liabs json;
begin
  select * into a from public.toolbox_handover_actor(p_token);
  if a.uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into c from public.toolbox_handover_case where id = p_id;
  if not found then return json_build_object('ok', false, 'error', '找不到案件'); end if;
  role := public.toolbox_handover_role_of(c, a.uname);

  select coalesce(json_agg(public.toolbox_handover_item_json(i) order by i.sort_order, i.id), '[]'::json)
    into items from public.toolbox_handover_item i where i.case_id = p_id;
  select coalesce(json_agg(public.toolbox_handover_matter_json(m) order by m.sort_order, m.id), '[]'::json)
    into matters from public.toolbox_handover_matter m where m.case_id = p_id;
  select coalesce(json_agg(json_build_object(
    'id', t.id, 'kind', t.kind, 'name', t.name, 'url', t.url,
    'itemId', t.item_id, 'matterId', t.matter_id, 'uploadedAt', t.uploaded_at
  ) order by t.id), '[]'::json)
    into atts from public.toolbox_handover_attachment t
    where t.case_id = p_id and role = any(t.visible_roles);
  select coalesce(json_agg(json_build_object(
    'id', e.id, 'action', e.action, 'actorName', e.actor_name,
    'before', e.before_val, 'after', e.after_val, 'createdAt', e.created_at
  ) order by e.id desc), '[]'::json)
    into events from (
      select * from public.toolbox_handover_event where case_id = p_id order by id desc limit 100
    ) e;
  select coalesce(json_agg(json_build_object(
    'id', l.id, 'title', l.title, 'note', l.note, 'signedNoted', l.signed_noted, 'attachmentId', l.attachment_id
  )), '[]'::json)
    into liabs from public.toolbox_handover_liability_doc l where l.case_id = p_id;

  return json_build_object(
    'ok', true,
    'role', role,
    'case', public.toolbox_handover_case_json(c),
    'items', items,
    'matters', matters,
    'attachments', atts,
    'events', events,
    'liabilityDocs', liabs,
    'blockers', public.toolbox_handover_collect_blockers(p_id)
  );
end;
$$;

create or replace function public.toolbox_handover_case_list(p_token text, p_kind text default '')
returns json language plpgsql security definer set search_path = public as $$
declare
  a record;
  v_kind text := trim(coalesce(p_kind, ''));
  rows json;
begin
  select * into a from public.toolbox_handover_actor(p_token);
  if a.uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select coalesce(json_agg(public.toolbox_handover_case_json(c) order by c.updated_at desc), '[]'::json)
    into rows
  from (
    select * from public.toolbox_handover_case x
    where (v_kind = '' or x.kind = v_kind)
      and (
        trim(x.transferor_name) = a.uname
        or trim(x.receiver_name) = a.uname
        or trim(x.manager_name) = a.uname
        or a.uteam = '行政管理部'
        or a.uname = '黃怡婷'
      )
    order by x.updated_at desc
    limit 100
  ) c;
  return json_build_object('ok', true, 'rows', rows);
end;
$$;

create or replace function public.toolbox_handover_case_update(
  p_token text, p_id bigint, p_data jsonb
) returns json language plpgsql security definer set search_path = public as $$
declare
  a record;
  c public.toolbox_handover_case%rowtype;
  before jsonb;
  role text;
begin
  select * into a from public.toolbox_handover_actor(p_token);
  if a.uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into c from public.toolbox_handover_case where id = p_id for update;
  if not found then return json_build_object('ok', false, 'error', '找不到案件'); end if;
  if c.locked or c.status = 'closed' then
    return json_build_object('ok', false, 'error', '已鎖定或已結案，請先退回重簽');
  end if;
  role := public.toolbox_handover_role_of(c, a.uname);
  if role not in ('transferor', 'admin') and c.status not in ('draft', 'returned') then
    return json_build_object('ok', false, 'error', '目前狀態僅移交人可改基本資料');
  end if;
  before := public.toolbox_handover_case_json(c)::jsonb;

  update public.toolbox_handover_case set
    region = coalesce(nullif(trim(p_data->>'region'), ''), region),
    unit = coalesce(nullif(trim(p_data->>'unit'), ''), unit),
    transferor_phone = coalesce(p_data->>'transferorPhone', transferor_phone),
    transferor_address = coalesce(p_data->>'transferorAddress', transferor_address),
    receiver_name = coalesce(nullif(trim(p_data->>'receiverName'), ''), receiver_name),
    manager_name = coalesce(nullif(trim(p_data->>'managerName'), ''), manager_name),
    filled_at = coalesce(nullif(p_data->>'filledAt', '')::date, filled_at),
    leave_date = coalesce(nullif(p_data->>'leaveDate', '')::date, leave_date),
    last_work_date = coalesce(nullif(p_data->>'lastWorkDate', '')::date, last_work_date),
    leave_type = case
      when kind = 'biz' then 'resign'
      when coalesce(p_data->>'leaveType', '') in ('resign', 'leave_without_pay') then p_data->>'leaveType'
      else leave_type end,
    account_need_disable = coalesce((p_data->>'accountNeedDisable')::boolean, account_need_disable),
    account_disabled_by = coalesce(p_data->>'accountDisabledBy', account_disabled_by),
    account_disabled_at = coalesce(nullif(p_data->>'accountDisabledAt', '')::timestamptz, account_disabled_at),
    account_disable_evidence = coalesce(p_data->>'accountDisableEvidence', account_disable_evidence),
    updated_at = now()
  where id = p_id
  returning * into c;

  perform public.toolbox_handover_log(p_id, 'update_case', a.uid, a.uname, before, public.toolbox_handover_case_json(c)::jsonb);
  return json_build_object('ok', true, 'case', public.toolbox_handover_case_json(c));
end;
$$;

create or replace function public.toolbox_handover_item_save(
  p_token text, p_item_id bigint, p_data jsonb
) returns json language plpgsql security definer set search_path = public as $$
declare
  a record;
  i public.toolbox_handover_item%rowtype;
  c public.toolbox_handover_case%rowtype;
  before jsonb;
  role text;
begin
  select * into a from public.toolbox_handover_actor(p_token);
  if a.uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into i from public.toolbox_handover_item where id = p_item_id for update;
  if not found then return json_build_object('ok', false, 'error', '找不到細項'); end if;
  select * into c from public.toolbox_handover_case where id = i.case_id;
  if c.locked or c.status = 'closed' then
    return json_build_object('ok', false, 'error', '已鎖定，請退回後再改');
  end if;
  role := public.toolbox_handover_role_of(c, a.uname);
  before := public.toolbox_handover_item_json(i)::jsonb;

  if role in ('transferor', 'admin') and c.status in ('draft', 'returned', 'transferor_done') then
    update public.toolbox_handover_item set
      result = case when coalesce(p_data->>'result', '') in ('unset','yes','no','na','done','pending')
        then p_data->>'result' else result end,
      qty = coalesce(p_data->>'qty', qty),
      path_note = coalesce(p_data->>'pathNote', path_note),
      progress_note = coalesce(p_data->>'progressNote', progress_note),
      handover_person = coalesce(p_data->>'handoverPerson', handover_person),
      remark = coalesce(p_data->>'remark', remark),
      disabled_verified = coalesce((p_data->>'disabledVerified')::boolean, disabled_verified),
      disabled_by = coalesce(p_data->>'disabledBy', disabled_by),
      disabled_at = coalesce(nullif(p_data->>'disabledAt', '')::timestamptz, disabled_at),
      disabled_evidence = coalesce(p_data->>'disabledEvidence', disabled_evidence)
    where id = p_item_id returning * into i;
  elsif role = 'receiver' and c.status in ('transferor_done', 'receiver_review') then
    update public.toolbox_handover_item set
      receiver_ok = coalesce((p_data->>'receiverOk')::boolean, receiver_ok),
      receiver_note = coalesce(p_data->>'receiverNote', receiver_note)
    where id = p_item_id returning * into i;
  elsif role = 'manager' and c.status in ('receiver_review', 'manager_review') then
    update public.toolbox_handover_item set
      manager_ok = coalesce((p_data->>'managerOk')::boolean, manager_ok),
      manager_note = coalesce(p_data->>'managerNote', manager_note)
    where id = p_item_id returning * into i;
  else
    return json_build_object('ok', false, 'error', '無權限或狀態不允許修改此細項');
  end if;

  perform public.toolbox_handover_log(c.id, 'save_item', a.uid, a.uname, before, public.toolbox_handover_item_json(i)::jsonb);
  return json_build_object('ok', true, 'item', public.toolbox_handover_item_json(i));
end;
$$;

create or replace function public.toolbox_handover_matter_upsert(
  p_token text, p_case_id bigint, p_data jsonb
) returns json language plpgsql security definer set search_path = public as $$
declare
  a record;
  c public.toolbox_handover_case%rowtype;
  m public.toolbox_handover_matter%rowtype;
  v_id bigint := nullif(p_data->>'id', '')::bigint;
  role text;
  before jsonb;
  checks jsonb;
  handover_done boolean;
begin
  select * into a from public.toolbox_handover_actor(p_token);
  if a.uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into c from public.toolbox_handover_case where id = p_case_id for update;
  if not found then return json_build_object('ok', false, 'error', '找不到案件'); end if;
  if c.locked or c.status = 'closed' then
    return json_build_object('ok', false, 'error', '已鎖定');
  end if;
  role := public.toolbox_handover_role_of(c, a.uname);
  checks := coalesce(p_data->'checks', '{}'::jsonb);
  -- 不可因有接手人／期限就視為完成；需 checks.complete = true 且無 incomplete
  handover_done := coalesce((p_data->>'handoverDone')::boolean, false)
    and coalesce(checks->>'complete', 'false') = 'true'
    and coalesce(checks->>'incomplete', 'false') <> 'true';

  if v_id is not null then
    select * into m from public.toolbox_handover_matter where id = v_id and case_id = p_case_id for update;
    if not found then return json_build_object('ok', false, 'error', '找不到逐案'); end if;
    before := public.toolbox_handover_matter_json(m)::jsonb;
    if role in ('transferor', 'admin') then
      update public.toolbox_handover_matter set
        match_no = coalesce(p_data->>'matchNo', match_no),
        address = coalesce(p_data->>'address', address),
        landlord = coalesce(p_data->>'landlord', landlord),
        tenant = coalesce(p_data->>'tenant', tenant),
        lease_start = coalesce(p_data->>'leaseStart', lease_start),
        lease_end = coalesce(p_data->>'leaseEnd', lease_end),
        rent = coalesce(p_data->>'rent', rent),
        case_type = coalesce(p_data->>'caseType', case_type),
        expense_type = coalesce(p_data->>'expenseType', expense_type),
        amount = coalesce(p_data->>'amount', amount),
        apply_date = coalesce(p_data->>'applyDate', apply_date),
        subsidy_status = coalesce(p_data->>'subsidyStatus', subsidy_status),
        contract_active = coalesce((p_data->>'contractActive')::boolean, contract_active),
        status_snapshot = coalesce(p_data->>'statusSnapshot', status_snapshot),
        source = coalesce(p_data->>'source', source),
        pending_verify = coalesce((p_data->>'pendingVerify')::boolean, pending_verify),
        checks = checks,
        current_status = coalesce(p_data->>'currentStatus', current_status),
        todos = coalesce(p_data->>'todos', todos),
        receiver_name = coalesce(p_data->>'receiverName', receiver_name),
        due_date = coalesce(nullif(p_data->>'dueDate', '')::date, due_date),
        handover_done = handover_done
      where id = v_id returning * into m;
    elsif role = 'receiver' then
      update public.toolbox_handover_matter set
        receiver_ok = coalesce((p_data->>'receiverOk')::boolean, receiver_ok)
      where id = v_id returning * into m;
    elsif role = 'manager' then
      update public.toolbox_handover_matter set
        manager_ok = coalesce((p_data->>'managerOk')::boolean, manager_ok),
        phone_check_ok = coalesce((p_data->>'phoneCheckOk')::boolean, phone_check_ok),
        phone_check_note = coalesce(p_data->>'phoneCheckNote', phone_check_note),
        phone_check_at = case when coalesce((p_data->>'phoneCheckOk')::boolean, phone_check_ok)
          then coalesce(phone_check_at, now()) else phone_check_at end,
        phone_check_by = case when coalesce((p_data->>'phoneCheckOk')::boolean, false)
          then a.uname else phone_check_by end
      where id = v_id returning * into m;
    else
      return json_build_object('ok', false, 'error', '無權限');
    end if;
  else
    if role not in ('transferor', 'admin') then
      return json_build_object('ok', false, 'error', '僅移交人可新增逐案');
    end if;
    insert into public.toolbox_handover_matter(
      case_id, match_no, address, landlord, tenant, lease_start, lease_end, rent, case_type,
      expense_type, amount, apply_date, subsidy_status, contract_active, status_snapshot,
      source, pending_verify, checks, current_status, todos, receiver_name, due_date, handover_done
    ) values (
      p_case_id,
      left(trim(coalesce(p_data->>'matchNo', '')), 80),
      left(trim(coalesce(p_data->>'address', '')), 200),
      left(trim(coalesce(p_data->>'landlord', '')), 40),
      left(trim(coalesce(p_data->>'tenant', '')), 40),
      left(trim(coalesce(p_data->>'leaseStart', '')), 20),
      left(trim(coalesce(p_data->>'leaseEnd', '')), 20),
      left(trim(coalesce(p_data->>'rent', '')), 20),
      left(trim(coalesce(p_data->>'caseType', '')), 40),
      left(trim(coalesce(p_data->>'expenseType', '')), 40),
      left(trim(coalesce(p_data->>'amount', '')), 40),
      left(trim(coalesce(p_data->>'applyDate', '')), 20),
      left(trim(coalesce(p_data->>'subsidyStatus', '')), 40),
      coalesce((p_data->>'contractActive')::boolean, true),
      left(trim(coalesce(p_data->>'statusSnapshot', '')), 40),
      left(trim(coalesce(p_data->>'source', 'manual')), 40),
      coalesce((p_data->>'pendingVerify')::boolean, true),
      checks,
      left(trim(coalesce(p_data->>'currentStatus', '')), 500),
      left(trim(coalesce(p_data->>'todos', '')), 1000),
      left(trim(coalesce(p_data->>'receiverName', '')), 40),
      nullif(p_data->>'dueDate', '')::date,
      handover_done
    ) returning * into m;
    before := null;
  end if;

  perform public.toolbox_handover_log(p_case_id, 'upsert_matter', a.uid, a.uname, before, public.toolbox_handover_matter_json(m)::jsonb);
  return json_build_object('ok', true, 'matter', public.toolbox_handover_matter_json(m));
end;
$$;

create or replace function public.toolbox_handover_submit_transferor(p_token text, p_id bigint)
returns json language plpgsql security definer set search_path = public as $$
declare
  a record; c public.toolbox_handover_case%rowtype; role text;
begin
  select * into a from public.toolbox_handover_actor(p_token);
  if a.uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into c from public.toolbox_handover_case where id = p_id for update;
  if not found then return json_build_object('ok', false, 'error', '找不到案件'); end if;
  role := public.toolbox_handover_role_of(c, a.uname);
  if role <> 'transferor' then return json_build_object('ok', false, 'error', '僅移交人可送出填報'); end if;
  if c.status not in ('draft', 'returned') then
    return json_build_object('ok', false, 'error', '狀態不允許送出');
  end if;
  if trim(c.receiver_name) = '' or trim(c.manager_name) = '' then
    return json_build_object('ok', false, 'error', '請先指定接手人與單位主管');
  end if;
  if trim(c.transferor_name) in (trim(c.receiver_name), trim(c.manager_name))
     or trim(c.receiver_name) = trim(c.manager_name) then
    return json_build_object('ok', false, 'error', '三方不可為同一人');
  end if;
  update public.toolbox_handover_case set
    status = 'transferor_done',
    transferor_confirmed_at = now(),
    return_reason = '',
    updated_at = now()
  where id = p_id returning * into c;
  perform public.toolbox_handover_log(p_id, 'submit_transferor', a.uid, a.uname, null, jsonb_build_object('status', c.status));
  return json_build_object('ok', true, 'case', public.toolbox_handover_case_json(c));
end;
$$;

create or replace function public.toolbox_handover_confirm_receiver(p_token text, p_id bigint)
returns json language plpgsql security definer set search_path = public as $$
declare
  a record; c public.toolbox_handover_case%rowtype; n int;
begin
  select * into a from public.toolbox_handover_actor(p_token);
  if a.uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into c from public.toolbox_handover_case where id = p_id for update;
  if not found then return json_build_object('ok', false, 'error', '找不到案件'); end if;
  if public.toolbox_handover_role_of(c, a.uname) <> 'receiver' then
    return json_build_object('ok', false, 'error', '僅接手人可確認（禁止代簽）');
  end if;
  if c.status not in ('transferor_done', 'receiver_review') then
    return json_build_object('ok', false, 'error', '請等移交人送出後再確認');
  end if;
  select count(*) into n from public.toolbox_handover_item where case_id = p_id and not receiver_ok;
  if n > 0 then return json_build_object('ok', false, 'error', '尚有細項未勾選接手確認', 'left', n); end if;
  select count(*) into n from public.toolbox_handover_matter where case_id = p_id and not receiver_ok;
  if n > 0 then return json_build_object('ok', false, 'error', '尚有逐案未勾選接手確認', 'left', n); end if;

  update public.toolbox_handover_case set
    status = 'manager_review',
    receiver_confirmed_at = now(),
    updated_at = now()
  where id = p_id returning * into c;
  perform public.toolbox_handover_log(p_id, 'confirm_receiver', a.uid, a.uname, null, jsonb_build_object('status', c.status));
  return json_build_object('ok', true, 'case', public.toolbox_handover_case_json(c));
end;
$$;

create or replace function public.toolbox_handover_confirm_manager(p_token text, p_id bigint)
returns json language plpgsql security definer set search_path = public as $$
declare
  a record; c public.toolbox_handover_case%rowtype; n int;
begin
  select * into a from public.toolbox_handover_actor(p_token);
  if a.uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into c from public.toolbox_handover_case where id = p_id for update;
  if not found then return json_build_object('ok', false, 'error', '找不到案件'); end if;
  if public.toolbox_handover_role_of(c, a.uname) <> 'manager' then
    return json_build_object('ok', false, 'error', '僅單位主管可複核（禁止代簽）');
  end if;
  if c.status <> 'manager_review' then
    return json_build_object('ok', false, 'error', '請等接手人確認後再複核');
  end if;
  if c.kind = 'biz' then
    select count(*) into n from public.toolbox_handover_matter
    where case_id = p_id and handover_done and not phone_check_ok;
    if n > 0 then
      return json_build_object('ok', false, 'error', '請完成逐案電話照會', 'left', n);
    end if;
  end if;
  update public.toolbox_handover_case set
    manager_confirmed_at = now(),
    updated_at = now()
  where id = p_id returning * into c;
  perform public.toolbox_handover_log(p_id, 'confirm_manager', a.uid, a.uname, null, jsonb_build_object('status', c.status));
  return json_build_object('ok', true, 'case', public.toolbox_handover_case_json(c));
end;
$$;

create or replace function public.toolbox_handover_return(
  p_token text, p_id bigint, p_reason text
) returns json language plpgsql security definer set search_path = public as $$
declare
  a record; c public.toolbox_handover_case%rowtype; role text; reason text := left(trim(coalesce(p_reason, '')), 500);
begin
  select * into a from public.toolbox_handover_actor(p_token);
  if a.uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  if reason = '' then return json_build_object('ok', false, 'error', '退回必須填理由'); end if;
  select * into c from public.toolbox_handover_case where id = p_id for update;
  if not found then return json_build_object('ok', false, 'error', '找不到案件'); end if;
  if c.status = 'closed' then return json_build_object('ok', false, 'error', '已結案不可退回'); end if;
  role := public.toolbox_handover_role_of(c, a.uname);
  if role not in ('receiver', 'manager', 'admin') then
    return json_build_object('ok', false, 'error', '無權退回');
  end if;
  update public.toolbox_handover_case set
    status = 'draft',
    locked = false,
    return_reason = reason,
    transferor_confirmed_at = null,
    receiver_confirmed_at = null,
    manager_confirmed_at = null,
    updated_at = now()
  where id = p_id returning * into c;
  update public.toolbox_handover_item set receiver_ok = false, manager_ok = false where case_id = p_id;
  update public.toolbox_handover_matter set receiver_ok = false, manager_ok = false where case_id = p_id;
  perform public.toolbox_handover_log(p_id, 'return', a.uid, a.uname, null, jsonb_build_object('reason', reason));
  return json_build_object('ok', true, 'case', public.toolbox_handover_case_json(c));
end;
$$;

create or replace function public.toolbox_handover_close(p_token text, p_id bigint)
returns json language plpgsql security definer set search_path = public as $$
declare
  a record; c public.toolbox_handover_case%rowtype; blockers jsonb; role text;
begin
  select * into a from public.toolbox_handover_actor(p_token);
  if a.uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into c from public.toolbox_handover_case where id = p_id for update;
  if not found then return json_build_object('ok', false, 'error', '找不到案件'); end if;
  role := public.toolbox_handover_role_of(c, a.uname);
  if role not in ('manager', 'admin') then
    return json_build_object('ok', false, 'error', '僅主管或行政可結案');
  end if;
  if c.status <> 'manager_review' or c.manager_confirmed_at is null then
    return json_build_object('ok', false, 'error', '須主管複核後才能結案', 'blockers', public.toolbox_handover_collect_blockers(p_id));
  end if;
  blockers := public.toolbox_handover_collect_blockers(p_id);
  if jsonb_array_length(blockers) > 0 then
    return json_build_object('ok', false, 'error', '未完成檢核，系統不得離職結案', 'blockers', blockers);
  end if;
  update public.toolbox_handover_case set
    status = 'closed', locked = true, closed_at = now(), closed_by = a.uid, updated_at = now()
  where id = p_id returning * into c;
  perform public.toolbox_handover_log(p_id, 'close', a.uid, a.uname, null, jsonb_build_object('status', 'closed'));
  return json_build_object('ok', true, 'case', public.toolbox_handover_case_json(c));
end;
$$;

create or replace function public.toolbox_handover_liability_link(
  p_token text, p_case_id bigint, p_note text default '', p_attachment_id bigint default null
) returns json language plpgsql security definer set search_path = public as $$
declare
  a record; v_id bigint;
begin
  select * into a from public.toolbox_handover_actor(p_token);
  if a.uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  if not exists(select 1 from public.toolbox_handover_case where id = p_case_id) then
    return json_build_object('ok', false, 'error', '找不到案件');
  end if;
  insert into public.toolbox_handover_liability_doc(case_id, note, attachment_id, signed_noted)
  values (p_case_id, left(trim(coalesce(p_note, '')), 500), p_attachment_id, false)
  returning id into v_id;
  perform public.toolbox_handover_log(p_case_id, 'liability_link', a.uid, a.uname, null, jsonb_build_object('id', v_id));
  return json_build_object('ok', true, 'id', v_id, 'requiredForClose', false);
end;
$$;

-- 舊進度遷移（不刪舊表）
create or replace function public.toolbox_handover_migrate_v1(p_token text, p_kind text, p_person text)
returns json language plpgsql security definer set search_path = public as $$
declare
  a record;
  v_kind text := trim(coalesce(p_kind, ''));
  v_person text := trim(coalesce(p_person, ''));
  v_case bigint;
  r record;
  n int := 0;
begin
  select * into a from public.toolbox_handover_actor(p_token);
  if a.uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  if v_kind not in ('admin', 'biz') or v_person = '' then
    return json_build_object('ok', false, 'error', '參數不正確');
  end if;

  select id into v_case from public.toolbox_handover_case
  where kind = v_kind and transferor_name = v_person and coalesce(meta->>'migratedFrom', '') = 'v1'
  order by id limit 1;

  if v_case is null then
    insert into public.toolbox_handover_case(kind, transferor_name, created_by, meta, status)
    values (v_kind, v_person, a.uid, jsonb_build_object('migratedFrom', 'v1'), 'draft')
    returning id into v_case;
    if v_kind = 'admin' then
      perform public.toolbox_handover_seed_admin_items(v_case);
    end if;
  end if;

  for r in
    select * from public.toolbox_handover_progress
    where kind = v_kind and person = v_person
  loop
    insert into public.toolbox_handover_matter(
      case_id, match_no, address, receiver_name, checks, current_status, source,
      pending_verify, migrated_from, handover_done, contract_active
    ) values (
      v_case,
      left(r.match_no, 80),
      case when r.match_no like 'addr:%' then substr(r.match_no, 6) else '' end,
      r.receiver,
      coalesce(r.checks, '{}'::jsonb) || jsonb_build_object('complete', 'false', 'incomplete', 'true', 'legacyNote', r.note),
      '舊進度待補細項',
      'legacy_v1',
      true,
      'v1',
      false,
      true
    )
    on conflict (case_id, match_no, address) do update set
      receiver_name = excluded.receiver_name,
      checks = excluded.checks;
    n := n + 1;
  end loop;

  perform public.toolbox_handover_log(v_case, 'migrate_v1', a.uid, a.uname, null, jsonb_build_object('rows', n));
  return json_build_object('ok', true, 'caseId', v_case, 'migratedRows', n);
end;
$$;

grant execute on function public.toolbox_handover_case_create(text, text, text, jsonb) to anon, authenticated;
grant execute on function public.toolbox_handover_case_get(text, bigint) to anon, authenticated;
grant execute on function public.toolbox_handover_case_list(text, text) to anon, authenticated;
grant execute on function public.toolbox_handover_case_update(text, bigint, jsonb) to anon, authenticated;
grant execute on function public.toolbox_handover_item_save(text, bigint, jsonb) to anon, authenticated;
grant execute on function public.toolbox_handover_matter_upsert(text, bigint, jsonb) to anon, authenticated;
grant execute on function public.toolbox_handover_submit_transferor(text, bigint) to anon, authenticated;
grant execute on function public.toolbox_handover_confirm_receiver(text, bigint) to anon, authenticated;
grant execute on function public.toolbox_handover_confirm_manager(text, bigint) to anon, authenticated;
grant execute on function public.toolbox_handover_return(text, bigint, text) to anon, authenticated;
grant execute on function public.toolbox_handover_close(text, bigint) to anon, authenticated;
grant execute on function public.toolbox_handover_liability_link(text, bigint, text, bigint) to anon, authenticated;
grant execute on function public.toolbox_handover_migrate_v1(text, text, text) to anon, authenticated;
grant execute on function public.toolbox_handover_collect_blockers(bigint) to anon, authenticated;
