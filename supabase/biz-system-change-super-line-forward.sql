-- 管理員按「已修改完畢」或「退回」時，除填寫人外，再 LINE 通知承辦行政與處經理。
-- 轉給管理員後 handler_admin_name 會改成黃怡婷，行政姓名留在「行政轉管理員｜姓名 →」紀錄。

create or replace function public.biz_system_change_super_forward_line(
  p_row public.biz_system_change,
  p_kind text,
  p_actor text,
  p_reason text default ''
) returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_admin text := '';
  v_mgr text := trim(coalesce(p_row.modifier_name, ''));
  v_name text;
  v_seen text[] := array[]::text[];
  v_msg text;
  v_line json;
  v_total int := 0;
  v_err text := '';
  v_author text := trim(coalesce(p_row.author_name, ''));
  v_actor text := trim(coalesce(p_actor, ''));
begin
  select s.who into v_admin
  from (
    select (m)[1] as who, row_number() over () as rn
    from regexp_matches(coalesce(p_row.admin_note, ''), '行政轉管理員｜([^｜]+?) →', 'g') m
  ) s
  order by s.rn desc
  limit 1;
  v_admin := trim(coalesce(v_admin, ''));
  if v_admin = '' and trim(coalesce(p_row.handler_admin_name, '')) not in ('', '黃怡婷') then
    v_admin := trim(p_row.handler_admin_name);
  end if;

  if p_kind = 'reject' then
    v_msg := format(
      E'↩️ 管理員已退回系統欄位更改\n管理員：%s\n地址：%s\n媒合編號：%s\n退回原因：%s\n%s',
      v_actor, p_row.address, p_row.match_no, left(coalesce(p_reason, ''), 300),
      public.biz_system_change_page_url()
    );
  else
    v_msg := format(
      E'✅ 管理員已通過系統欄位更改\n管理員：%s 已標記完成\n地址：%s\n媒合編號：%s\n%s',
      v_actor, p_row.address, p_row.match_no,
      public.biz_system_change_page_url()
    );
  end if;

  foreach v_name in array array[v_admin, v_mgr]
  loop
    v_name := trim(coalesce(v_name, ''));
    if v_name = '' or v_name = v_actor or v_name = v_author or v_name = any(v_seen) then
      continue;
    end if;
    v_seen := v_seen || v_name;
    v_line := public.admin_points_line_push(v_name, v_msg);
    v_total := v_total + coalesce((v_line->>'recipients')::int, 0);
    if coalesce((v_line->>'recipients')::int, 0) = 0 and coalesce(v_line->>'error', '') <> '' then
      v_err := v_line->>'error';
    end if;
  end loop;

  return json_build_object(
    'recipients', v_total,
    'error', case when v_total > 0 then '' else v_err end
  );
end;
$function$;

revoke all on function public.biz_system_change_super_forward_line(public.biz_system_change, text, text, text) from public, anon, authenticated;

create or replace function public.biz_system_change_mark_done(p_token text, p_id bigint)
returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  v_role json;
  v_name text;
  v_role_key text;
  v_row public.biz_system_change%rowtype;
  v_line json;
  v_fwd json;
  v_msg text;
  v_ok boolean := false;
  v_recipients int;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  v_role := public.biz_system_change_role(v_uid);
  v_name := coalesce(v_role->>'name', '');
  v_role_key := coalesce(v_role->>'role', 'guest');
  if v_name = '' then
    return json_build_object('ok', false, 'error', '帳號沒有姓名');
  end if;

  select * into v_row from public.biz_system_change where id = p_id;
  if not found then
    return json_build_object('ok', false, 'error', '找不到這筆通報');
  end if;
  if v_row.status = 'done' then
    return json_build_object('ok', true, 'row', public.biz_system_change_row_json(v_row), 'already', true);
  end if;
  if v_row.status <> 'pending' then
    return json_build_object('ok', false, 'error', '此案件目前無法標記完成');
  end if;

  v_ok :=
    (v_row.handler_level = 'manager' and trim(v_row.modifier_name) = v_name)
    or (
      v_role_key = 'admin'
      and v_row.handler_level = 'admin'
      and (trim(coalesce(v_row.handler_admin_name, '')) = '' or trim(v_row.handler_admin_name) = v_name)
    )
    or (v_role_key = 'super' and v_row.handler_level in ('admin', 'super'));
  if not v_ok then
    return json_build_object('ok', false, 'error', '目前輪到的處理人才可按已修改完畢');
  end if;

  update public.biz_system_change
     set status = 'done',
         handled_at = now(),
         handled_by = v_name,
         admin_note = case
           when trim(coalesce(admin_note, '')) = '' then '已標記完成'
           else admin_note
         end
   where id = p_id
  returning * into v_row;

  v_msg := format(
    E'✅ 系統欄位已修改完畢\n您通報的案件已由 %s 標記完成\n地址：%s\n媒合編號：%s\n%s',
    v_name, v_row.address, v_row.match_no,
    public.biz_system_change_page_url()
  );
  v_line := public.admin_points_line_push(v_row.author_name, v_msg);
  if v_role_key = 'super' then
    v_fwd := public.biz_system_change_super_forward_line(v_row, 'done', v_name, '');
    v_recipients := coalesce((v_line->>'recipients')::int, 0) + coalesce((v_fwd->>'recipients')::int, 0);
    v_line := json_build_object(
      'recipients', v_recipients,
      'error', case
        when v_recipients > 0 then ''
        else coalesce(nullif(v_line->>'error', ''), nullif(v_fwd->>'error', ''), '')
      end
    );
  end if;

  return json_build_object(
    'ok', true,
    'row', public.biz_system_change_row_json(v_row),
    'line', coalesce(v_line, json_build_object('recipients', 0))
  );
end;
$function$;

create or replace function public.biz_system_change_reject(p_token text, p_id bigint, p_reason text)
returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  v_role json;
  v_name text;
  v_role_key text;
  v_row public.biz_system_change%rowtype;
  v_reason text := left(trim(coalesce(p_reason, '')), 500);
  v_from text;
  v_note text;
  v_line json;
  v_fwd json;
  v_msg text;
  v_ok boolean := false;
  v_recipients int;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  v_role := public.biz_system_change_role(v_uid);
  v_name := coalesce(v_role->>'name', '');
  v_role_key := coalesce(v_role->>'role', 'guest');
  if v_name = '' then
    return json_build_object('ok', false, 'error', '帳號沒有姓名');
  end if;
  if v_reason = '' then
    return json_build_object('ok', false, 'error', '請填寫退件原因');
  end if;

  select * into v_row from public.biz_system_change where id = p_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '找不到這筆通報');
  end if;
  if v_row.status <> 'pending' then
    return json_build_object('ok', false, 'error', '此案件目前無法退件');
  end if;
  if v_row.handler_level = 'author' then
    return json_build_object('ok', false, 'error', '此案件已退回填寫人');
  end if;

  v_ok :=
    (v_row.handler_level = 'manager' and trim(v_row.modifier_name) = v_name)
    or (
      v_role_key = 'admin'
      and v_row.handler_level = 'admin'
      and (trim(coalesce(v_row.handler_admin_name, '')) = '' or trim(v_row.handler_admin_name) = v_name)
    )
    or (v_role_key = 'super' and v_row.handler_level in ('admin', 'super'));
  if not v_ok then
    return json_build_object('ok', false, 'error', '目前輪到的處理人才可退件');
  end if;

  v_from := case
    when v_row.handler_level in ('manager', 'admin', 'super') then v_row.handler_level
    else 'manager'
  end;

  v_note := format('退回填寫人｜%s｜%s｜原因：%s',
    v_name,
    to_char(timezone('Asia/Taipei', now()), 'YYYY/MM/DD HH24:MI'),
    v_reason
  );

  update public.biz_system_change
     set status = 'pending',
         handler_level = 'author',
         reject_return_level = v_from,
         handled_at = now(),
         handled_by = v_name,
         admin_note = case
           when trim(coalesce(admin_note, '')) = '' then v_note
           else left(admin_note || E'\n' || v_note, 1000)
         end
   where id = p_id
  returning * into v_row;

  v_msg := format(
    E'↩️ 系統欄位更改通報已退回\n處理人：%s\n地址：%s\n媒合編號：%s\n退回原因：%s\n請修改後重新送出\n%s',
    v_name, v_row.address, v_row.match_no, v_reason,
    public.biz_system_change_page_url()
  );
  v_line := public.admin_points_line_push(v_row.author_name, v_msg);
  if v_role_key = 'super' then
    v_fwd := public.biz_system_change_super_forward_line(v_row, 'reject', v_name, v_reason);
    v_recipients := coalesce((v_line->>'recipients')::int, 0) + coalesce((v_fwd->>'recipients')::int, 0);
    v_line := json_build_object(
      'recipients', v_recipients,
      'error', case
        when v_recipients > 0 then ''
        else coalesce(nullif(v_line->>'error', ''), nullif(v_fwd->>'error', ''), '')
      end
    );
  end if;

  return json_build_object(
    'ok', true,
    'row', public.biz_system_change_row_json(v_row),
    'line', coalesce(v_line, json_build_object('recipients', 0))
  );
end;
$function$;

grant execute on function public.biz_system_change_mark_done(text, bigint) to anon, authenticated;
grant execute on function public.biz_system_change_reject(text, bigint, text) to anon, authenticated;

notify pgrst, 'reload schema';
