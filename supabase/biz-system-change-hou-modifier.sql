-- 北四／北五可指定侯思廷為修改人（行政專員組長，非營業處經理）。
-- 姓名用 hex，避免工具傳字時寫錯字。

create or replace function public.biz_system_change_extra_modifier_name()
returns text
language sql
immutable
as $$
  select convert_from(decode('e4beafe6809de5bbb7', 'hex'), 'UTF8');
$$;

create or replace function public.biz_system_change_is_allowed_modifier(p_name text, p_team text default '')
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_name text := left(trim(coalesce(p_name, '')), 40);
  v_team text := left(trim(coalesce(p_team, '')), 40);
  v_ok boolean := false;
begin
  if v_name = '' then
    return false;
  end if;
  if v_name = public.biz_system_change_extra_modifier_name() then
    select exists (
      select 1 from public.toolbox_accounts a
      where a.status = 'active'
        and trim(coalesce(nullif(a.name, ''), a.username)) = v_name
    ) into v_ok;
    return coalesce(v_ok, false);
  end if;
  select exists (
    select 1 from public.toolbox_accounts a
    where a.status = 'active'
      and trim(coalesce(a.job_title, '')) = '營業處經理'
      and trim(coalesce(nullif(a.name, ''), a.username)) = v_name
      and (v_team = '' or trim(coalesce(a.team, '')) = v_team)
  ) into v_ok;
  return coalesce(v_ok, false);
end;
$$;

create or replace function public.biz_system_change_managers(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  return json_build_object(
    'ok', true,
    'managers', coalesce((
      select json_agg(json_build_object(
          'name', x.name,
          'team', x.team
        ) order by x.team, x.name)
      from (
        select distinct
          trim(coalesce(nullif(a.name, ''), a.username)) as name,
          trim(coalesce(a.team, '')) as team
        from public.toolbox_accounts a
        where a.status = 'active'
          and (
            (
              trim(coalesce(a.job_title, '')) = '營業處經理'
              and trim(coalesce(a.team, '')) like '%處'
            )
            or trim(coalesce(nullif(a.name, ''), a.username)) = public.biz_system_change_extra_modifier_name()
          )
      ) x
    ), '[]'::json)
  );
end;
$$;

revoke all on function public.biz_system_change_extra_modifier_name() from public;
revoke all on function public.biz_system_change_is_allowed_modifier(text, text) from public;
grant execute on function public.biz_system_change_extra_modifier_name() to anon, authenticated;
grant execute on function public.biz_system_change_is_allowed_modifier(text, text) to anon, authenticated;
grant execute on function public.biz_system_change_managers(text) to anon, authenticated;


create or replace function public.biz_system_change_submit(p_token text, p_data jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  d jsonb := coalesce(p_data, '{}'::jsonb);
  v_name text;
  v_team text;
  v_address text := left(trim(coalesce(d->>'address', '')), 200);
  v_match text := left(trim(coalesce(d->>'matchNo', '')), 80);
  v_content text := left(trim(coalesce(d->>'content', '')), 4000);
  v_mod_name text := left(trim(coalesce(d->>'modifierName', '')), 40);
  v_mod_team text := left(trim(coalesce(d->>'modifierTeam', '')), 40);
  v_nodes_in jsonb := coalesce(d->'nodes', '[]'::jsonb);
  v_nodes jsonb := '[]'::jsonb;
  v_atts jsonb := coalesce(d->'attachments', '[]'::jsonb);
  v_clean jsonb := '[]'::jsonb;
  v_item jsonb;
  v_node text;
  v_n int := 0;
  v_id bigint;
  v_ok boolean := false;
  v_nodes_txt text := '';
  v_line json;
  v_msg text;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  select trim(coalesce(nullif(a.name, ''), a.username)), trim(coalesce(a.team, ''))
    into v_name, v_team
  from public.toolbox_accounts a where a.id = v_uid;
  if coalesce(v_name, '') = '' then
    return json_build_object('ok', false, 'error', '帳號沒有姓名，請聯絡管理員');
  end if;
  if v_address = '' then return json_build_object('ok', false, 'error', '請填物件地址'); end if;
  if v_match = '' then return json_build_object('ok', false, 'error', '請填媒合編號'); end if;
  if v_content = '' then return json_build_object('ok', false, 'error', '請輸入需修改內容'); end if;
  if v_mod_name = '' then return json_build_object('ok', false, 'error', '請選擇營業處經理');
  end if;
  if v_mod_team = '其他' then
    return json_build_object('ok', false, 'error', '業務只能送給營業處經理修改');
  end if;

  v_ok := public.biz_system_change_is_allowed_modifier(v_mod_name, v_mod_team);
  if not v_ok then
    return json_build_object('ok', false, 'error', '修改人必須是營業處經理');
  end if;
  if v_mod_team = '' then
    select trim(coalesce(a.team, '')) into v_mod_team
    from public.toolbox_accounts a
    where a.status = 'active'
      and trim(coalesce(nullif(a.name, ''), a.username)) = v_mod_name
    order by case when trim(coalesce(a.job_title, '')) = '營業處經理' then 0 else 1 end, a.team
    limit 1;
  end if;

  if jsonb_typeof(v_nodes_in) = 'array' then
    for v_item in select * from jsonb_array_elements(v_nodes_in)
    loop
      v_node := trim(both '"' from v_item::text);
      if v_node in ('物件', '安全檢核表', '房客', '合約')
         and not exists (
           select 1 from jsonb_array_elements_text(v_nodes) t(x) where t.x = v_node
         )
      then
        v_nodes := v_nodes || jsonb_build_array(v_node);
      end if;
    end loop;
  end if;
  if jsonb_array_length(v_nodes) = 0 then
    return json_build_object('ok', false, 'error', '請至少勾選一個需修改節點');
  end if;

  if jsonb_typeof(v_atts) = 'array' then
    for v_item in select * from jsonb_array_elements(v_atts)
    loop
      if v_n >= 5 then exit; end if;
      if nullif(trim(coalesce(v_item->>'url', '')), '') is null then continue; end if;
      v_clean := v_clean || jsonb_build_array(jsonb_build_object(
        'url', left(trim(v_item->>'url'), 500),
        'name', left(trim(coalesce(v_item->>'name', '附件')), 120),
        'kind', case when coalesce(v_item->>'kind', '') = 'image' then 'image' else 'file' end
      ));
      v_n := v_n + 1;
    end loop;
  end if;

  insert into public.biz_system_change (
    user_id, author_name, team, modifier_name, modifier_team, handler_level,
    address, match_no, nodes, content, attachments
  ) values (
    v_uid, v_name, coalesce(v_team, ''), v_mod_name, coalesce(v_mod_team, ''), 'manager',
    v_address, v_match, v_nodes, v_content, v_clean
  )
  returning id into v_id;

  select string_agg(x, '、') into v_nodes_txt
  from jsonb_array_elements_text(v_nodes) t(x);

  v_msg := format(
    E'🛠️ 系統欄位更改通報\n%s（%s）請您協助修改\n地址：%s\n媒合編號：%s\n節點：%s\n內容：%s\n改不了可轉給行政\n%s',
    v_name,
    coalesce(nullif(v_team, ''), '未填處別'),
    v_address,
    v_match,
    coalesce(v_nodes_txt, ''),
    left(v_content, 800),
    public.biz_system_change_page_url()
  );
  v_line := public.admin_points_line_push(v_mod_name, v_msg);

  return json_build_object(
    'ok', true,
    'id', v_id,
    'line', coalesce(v_line, json_build_object('recipients', 0))
  );
end;
$function$;


create or replace function public.biz_system_change_for_me(p_token text)
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
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  v_role := public.biz_system_change_role(v_uid);
  v_name := coalesce(v_role->>'name', '');
  v_role_key := coalesce(v_role->>'role', 'guest');
  if v_name = '' then
    return json_build_object('ok', true, 'rows', '[]'::json, 'transferred', '[]'::json, 'completed', '[]'::json, 'role', v_role);
  end if;
  return json_build_object(
    'ok', true,
    'role', v_role,
    'rows', coalesce((
      select json_agg(public.biz_system_change_row_json(a) order by a.created_at desc, a.id desc)
      from (
        select * from public.biz_system_change x
        where x.status = 'pending'
          and (
            (x.handler_level = 'author' and x.user_id = v_uid)
            or (x.handler_level = 'manager' and trim(x.modifier_name) = v_name)
            or (
              v_role_key = 'admin'
              and x.handler_level = 'admin'
              and trim(coalesce(x.handler_admin_name, '')) = v_name
            )
            or (v_role_key = 'super' and x.handler_level = 'super')
          )
        order by x.created_at desc, x.id desc
        limit 300
      ) a
    ), '[]'::json),
    'transferred', coalesce((
      select json_agg(public.biz_system_change_row_json(a) order by a.created_at desc, a.id desc)
      from (
        select * from public.biz_system_change x
        where x.status in ('pending', 'done', 'rejected')
          and (
            (
              trim(x.modifier_name) = v_name
              and x.handler_level in ('admin', 'super', 'author')
            )
            or (
              v_role_key in ('admin', 'super')
              and trim(coalesce(x.handler_admin_name, '')) = v_name
              and x.handler_level in ('super', 'author')
            )
          )
        order by x.created_at desc, x.id desc
        limit 100
      ) a
    ), '[]'::json),
    'completed', coalesce((
      select json_agg(public.biz_system_change_row_json(a) order by a.handled_at desc nulls last, a.id desc)
      from (
        select * from public.biz_system_change x
        where (
            (x.status = 'done' and trim(coalesce(x.handled_by, '')) = v_name)
            or (
              x.status = 'pending'
              and x.handler_level = 'author'
              and trim(coalesce(x.handled_by, '')) = v_name
            )
          )
        order by x.handled_at desc nulls last, x.id desc
        limit 300
      ) a
    ), '[]'::json)
  );
end;
$function$;


create or replace function public.biz_system_change_transfer(p_token text, p_id bigint, p_to text, p_admin_name text default null)
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
  v_to text := lower(trim(coalesce(p_to, '')));
  v_admin text := left(trim(coalesce(p_admin_name, '')), 40);
  v_row public.biz_system_change%rowtype;
  v_note text;
  v_nodes_txt text := '';
  v_msg text;
  v_line json := json_build_object('recipients', 0);
  v_ok boolean := false;
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
  if v_to not in ('admin', 'super') then
    return json_build_object('ok', false, 'error', '轉單目標不正確');
  end if;

  select * into v_row from public.biz_system_change where id = p_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '找不到這筆通報');
  end if;
  if v_row.status <> 'pending' then
    return json_build_object('ok', false, 'error', '此案件目前無法轉單');
  end if;

  if v_to = 'admin' then
    if not (v_row.handler_level = 'manager' and trim(v_row.modifier_name) = v_name) then
      return json_build_object('ok', false, 'error', '僅承辦處長可轉給行政');
    end if;
    if v_admin = '' then
      return json_build_object('ok', false, 'error', '請選擇要轉交的行政');
    end if;
    select exists (
      select 1 from public.toolbox_accounts a
      where a.status = 'active'
        and trim(coalesce(a.team, '')) = '行政管理部'
        and trim(coalesce(nullif(a.name, ''), a.username)) = v_admin
        and trim(coalesce(nullif(a.name, ''), a.username)) <> '黃怡婷'
        and trim(coalesce(nullif(a.name, ''), a.username)) <> '邱奕棋'
        and trim(coalesce(a.job_title, '')) not in ('工讀生')
    ) into v_ok;
    if not v_ok then
      return json_build_object('ok', false, 'error', '所選行政不在可轉交名單');
    end if;

    v_note := format('處長轉行政｜%s → %s｜%s', v_name, v_admin, to_char(timezone('Asia/Taipei', now()), 'YYYY/MM/DD HH24:MI'));
    update public.biz_system_change
       set handler_level = 'admin',
           handler_admin_name = v_admin,
           admin_note = case
             when trim(coalesce(admin_note, '')) = '' then v_note
             else left(admin_note || E'\n' || v_note, 1000)
           end
     where id = p_id
    returning * into v_row;

    select string_agg(x, '、') into v_nodes_txt
    from jsonb_array_elements_text(coalesce(v_row.nodes, '[]'::jsonb)) t(x);
    v_msg := format(
      E'🛠️ 系統欄位更改通報（行政協辦）\n%s（處長）已轉交案件給您\n地址：%s\n媒合編號：%s\n節點：%s\n內容：%s\n%s',
      v_name,
      v_row.address,
      v_row.match_no,
      coalesce(v_nodes_txt, ''),
      left(v_row.content, 800),
      public.biz_system_change_page_url()
    );
    v_line := public.admin_points_line_push(v_admin, v_msg);
  else
    if not (v_role_key in ('admin', 'super') and v_row.handler_level = 'admin') then
      return json_build_object('ok', false, 'error', '僅行政可轉給管理員');
    end if;
    if v_role_key = 'admin'
       and trim(coalesce(v_row.handler_admin_name, '')) <> ''
       and trim(v_row.handler_admin_name) <> v_name then
      return json_build_object('ok', false, 'error', '僅被指派的行政可轉給管理員');
    end if;
    v_note := format('行政轉管理員｜%s → 黃怡婷｜%s', v_name, to_char(timezone('Asia/Taipei', now()), 'YYYY/MM/DD HH24:MI'));
    update public.biz_system_change
       set handler_level = 'super',
           handler_admin_name = '黃怡婷',
           admin_note = case
             when trim(coalesce(admin_note, '')) = '' then v_note
             else left(admin_note || E'\n' || v_note, 1000)
           end
     where id = p_id
    returning * into v_row;

    select string_agg(x, '、') into v_nodes_txt
    from jsonb_array_elements_text(coalesce(v_row.nodes, '[]'::jsonb)) t(x);
    v_msg := format(
      E'🛠️ 系統欄位需管理員處理\n%s（%s）已轉單給您（黃怡婷）\n地址：%s\n媒合編號：%s\n節點：%s\n內容：%s\n※ 可能含預設租金／押金月份／押金金額等需進階權限項目\n%s',
      v_name,
      coalesce(nullif(v_role->>'team', ''), '行政'),
      v_row.address,
      v_row.match_no,
      coalesce(v_nodes_txt, ''),
      left(v_row.content, 800),
      public.biz_system_change_admin_url()
    );
    v_line := public.admin_points_line_push('黃怡婷', v_msg);
  end if;

  return json_build_object(
    'ok', true,
    'row', public.biz_system_change_row_json(v_row),
    'line', coalesce(v_line, json_build_object('recipients', 0))
  );
end;
$function$;

grant execute on function public.biz_system_change_submit(text, jsonb) to anon, authenticated;
grant execute on function public.biz_system_change_for_me(text) to anon, authenticated;
grant execute on function public.biz_system_change_transfer(text, bigint, text, text) to anon, authenticated;


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
  v_msg text;
  v_ok boolean := false;
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
  v_msg text;
  v_ok boolean := false;
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

  return json_build_object(
    'ok', true,
    'row', public.biz_system_change_row_json(v_row),
    'line', coalesce(v_line, json_build_object('recipients', 0))
  );
end;
$function$;

grant execute on function public.biz_system_change_mark_done(text, bigint) to anon, authenticated;
grant execute on function public.biz_system_change_reject(text, bigint, text) to anon, authenticated;
