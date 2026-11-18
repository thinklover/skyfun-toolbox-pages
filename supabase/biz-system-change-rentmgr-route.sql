-- 租管師專區通報：不經處長，直接送到行政組織圖「租賃管理部」行政；handler_level=admin

create or replace function public.biz_system_change_rentmgr_admin_rows()
returns table(name text, dept text, office text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    left(trim(coalesce(p->>'name', '')), 40) as name,
    left(trim(coalesce(p->>'dept', '')), 40) as dept,
    left(trim(coalesce(p->>'office', '')), 40) as office
  from public.admin_org_chart c
  cross join lateral jsonb_array_elements(coalesce(c.data->'groups', '[]'::jsonb)) g
  cross join lateral jsonb_array_elements(coalesce(g->'people', '[]'::jsonb)) p
  where c.id = 1
    and trim(coalesce(p->>'office', '')) = '租賃管理部'
    and trim(coalesce(p->>'status', '')) <> '待補'
    and trim(coalesce(p->>'name', '')) <> ''
    and trim(coalesce(p->>'name', '')) !~ '^(待補|從缺)$';
$$;

create or replace function public.biz_system_change_is_rentmgr_admin(p_name text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.biz_system_change_rentmgr_admin_rows() r
    where r.name = left(trim(coalesce(p_name, '')), 40)
  );
$$;

create or replace function public.biz_system_change_rentmgr_admins(p_token text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  return json_build_object(
    'ok', true,
    'admins', coalesce((
      select json_agg(json_build_object(
        'name', x.name,
        'team', x.dept,
        'dept', x.dept,
        'office', x.office
      ) order by
        case x.dept
          when '大台北' then 1 when '台北' then 2 when '新北' then 3 when '基隆' then 4
          when '宜蘭' then 5 when '桃園' then 6 when '新竹' then 7 when '苗栗' then 8
          when '台中' then 9 when '彰化' then 10 when '南投' then 11 when '雲林' then 12
          when '嘉義' then 13 when '台南' then 14 when '高雄' then 15 else 99
        end,
        x.name
      )
      from (
        select distinct on (r.name) r.name, r.dept, r.office
        from public.biz_system_change_rentmgr_admin_rows() r
        order by r.name, r.dept
      ) x
    ), '[]'::json)
  );
end;
$$;

revoke all on function public.biz_system_change_rentmgr_admin_rows() from public;
revoke all on function public.biz_system_change_is_rentmgr_admin(text) from public;
grant execute on function public.biz_system_change_is_rentmgr_admin(text) to anon, authenticated;
grant execute on function public.biz_system_change_rentmgr_admins(text) to anon, authenticated;

create or replace function public.biz_system_change_submit(p_token text, p_data jsonb)
returns json
language plpgsql
security definer
set search_path to 'public'
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
  v_route text := lower(trim(coalesce(d->>'route', '')));
  v_rentmgr boolean := v_route in ('rentmgr', 'rentmanager');
  v_nodes_in jsonb := coalesce(d->'nodes', '[]'::jsonb);
  v_nodes jsonb := '[]'::jsonb;
  v_atts jsonb := coalesce(d->'attachments', '[]'::jsonb);
  v_clean jsonb := '[]'::jsonb;
  v_item jsonb;
  v_node text;
  v_n int := 0;
  v_img int := 0;
  v_id bigint;
  v_ok boolean := false;
  v_nodes_txt text := '';
  v_line json;
  v_msg text;
  v_deposit boolean := lower(trim(coalesce(d->>'depositIssue', ''))) in ('true', 't', '1');
  v_robot boolean := lower(trim(coalesce(d->>'robotIssue', ''))) in ('true', 't', '1');
  v_saved jsonb := '{}'::jsonb;
  v_mates jsonb := '[]'::jsonb;
  v_tname text;
  v_tid text;
  v_mn text;
  v_mid text;
  v_flags text := '';
  v_level text := 'manager';
  v_handler_admin text := '';
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
  if v_mod_name = '' then
    return json_build_object('ok', false, 'error',
      case when v_rentmgr then '請選擇租賃管理部行政' else '請選擇營業處經理' end);
  end if;

  if v_rentmgr then
    if not public.biz_system_change_is_rentmgr_admin(v_mod_name) then
      return json_build_object('ok', false, 'error', '修改人必須是該地區租賃管理部行政');
    end if;
    if v_mod_team = '' then
      select r.dept into v_mod_team
      from public.biz_system_change_rentmgr_admin_rows() r
      where r.name = v_mod_name
      order by r.dept
      limit 1;
    end if;
    v_mod_team := coalesce(nullif(v_mod_team, ''), '租賃管理部');
    v_level := 'admin';
    v_handler_admin := v_mod_name;
  else
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
      if coalesce(v_item->>'kind', '') = 'image'
         or left(trim(v_item->>'url'), 500) ~* '\.(jpg|jpeg|png|gif|webp)(\?|$)' then
        v_img := v_img + 1;
      end if;
    end loop;
  end if;

  if v_deposit and v_img < 1 then
    return json_build_object('ok', false, 'error', '租押金問題需上傳中心系統租金評定試算畫面');
  end if;

  v_saved := jsonb_build_object('depositIssue', v_deposit, 'robotIssue', v_robot);
  if v_rentmgr then
    v_saved := v_saved || jsonb_build_object('route', 'rentmgr');
  end if;
  if v_robot then
    v_tname := left(trim(coalesce(d->>'tenantName', '')), 40);
    v_tid := left(trim(coalesce(d->>'tenantId', '')), 20);
    if v_tname = '' then
      return json_build_object('ok', false, 'error', '機器人問題請填房客姓名');
    end if;
    if v_tid = '' then
      return json_build_object('ok', false, 'error', '機器人問題請填房客身分證字號');
    end if;
    if jsonb_typeof(d->'roommates') = 'array' then
      for v_item in select * from jsonb_array_elements(d->'roommates')
      loop
        v_mn := left(trim(coalesce(v_item->>'name', '')), 40);
        v_mid := left(trim(coalesce(v_item->>'idNo', '')), 20);
        if v_mn = '' and v_mid = '' then continue; end if;
        if v_mn = '' or v_mid = '' then
          return json_build_object('ok', false, 'error', '共住人要同時填姓名與身分證字號');
        end if;
        if jsonb_array_length(v_mates) >= 8 then
          return json_build_object('ok', false, 'error', '共住人最多 8 人');
        end if;
        v_mates := v_mates || jsonb_build_array(jsonb_build_object('name', v_mn, 'idNo', v_mid));
      end loop;
    end if;
    v_saved := v_saved || jsonb_build_object(
      'address', v_address,
      'tenantName', v_tname,
      'tenantId', v_tid,
      'roommates', v_mates
    );
  end if;
  if v_deposit then v_flags := '租押金問題'; end if;
  if v_robot then
    v_flags := v_flags || case when v_flags = '' then '' else '、' end || '機器人問題';
  end if;

  insert into public.biz_system_change (
    user_id, author_name, team, modifier_name, modifier_team, handler_level, handler_admin_name,
    address, match_no, nodes, content, attachments, transfer_extra
  ) values (
    v_uid, v_name, coalesce(v_team, ''), v_mod_name, coalesce(v_mod_team, ''), v_level, v_handler_admin,
    v_address, v_match, v_nodes, v_content, v_clean, v_saved
  )
  returning id into v_id;

  select string_agg(x, '、') into v_nodes_txt
  from jsonb_array_elements_text(v_nodes) t(x);

  if v_rentmgr then
    v_msg := format(
      chr(128736) || chr(65039) || E' 系統欄位更改通報（租管）\n%s（%s）請您協助修改\n地址：%s\n媒合編號：%s\n節點：%s\n內容：%s%s\n改不了可轉給管理員\n%s',
      v_name,
      coalesce(nullif(v_team, ''), '租賃管理部'),
      v_address,
      v_match,
      coalesce(v_nodes_txt, ''),
      left(v_content, 800),
      case when v_flags = '' then '' else E'\n類型：' || v_flags || '（房客資料請至工具箱查看）' end,
      public.biz_system_change_page_url()
    );
  else
    v_msg := format(
      chr(128736) || chr(65039) || E' 系統欄位更改通報\n%s（%s）請您協助修改\n地址：%s\n媒合編號：%s\n節點：%s\n內容：%s%s\n改不了可轉給行政\n%s',
      v_name,
      coalesce(nullif(v_team, ''), '未填處別'),
      v_address,
      v_match,
      coalesce(v_nodes_txt, ''),
      left(v_content, 800),
      case when v_flags = '' then '' else E'\n類型：' || v_flags || '（房客資料請至工具箱查看）' end,
      public.biz_system_change_page_url()
    );
  end if;
  v_line := public.admin_points_line_push(v_mod_name, v_msg);

  return json_build_object(
    'ok', true,
    'id', v_id,
    'line', coalesce(v_line, json_build_object('recipients', 0))
  );
end;
$function$;

create or replace function public.biz_system_change_resubmit(p_token text, p_id bigint, p_data jsonb)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  d jsonb := coalesce(p_data, '{}'::jsonb);
  v_row public.biz_system_change%rowtype;
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
  v_note text;
  v_nodes_txt text := '';
  v_line json;
  v_msg text;
  v_name text;
  v_return text;
  v_notify text := '';
  v_return_label text := '';
  v_rentmgr boolean := false;
  v_handler_admin text := '';
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;

  select * into v_row from public.biz_system_change where id = p_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '找不到這筆通報');
  end if;
  if v_row.user_id <> v_uid then
    return json_build_object('ok', false, 'error', '只能修改自己的通報');
  end if;
  if not (v_row.status = 'pending' and v_row.handler_level = 'author') then
    return json_build_object('ok', false, 'error', '此案件目前無法重新送出');
  end if;

  select trim(coalesce(nullif(a.name, ''), a.username)) into v_name
  from public.toolbox_accounts a where a.id = v_uid;

  v_rentmgr := coalesce(v_row.transfer_extra->>'route', '') = 'rentmgr'
    or lower(trim(coalesce(d->>'route', ''))) in ('rentmgr', 'rentmanager');

  if v_mod_name <> '' then
    if v_rentmgr then
      if not public.biz_system_change_is_rentmgr_admin(v_mod_name) then
        return json_build_object('ok', false, 'error', '請選擇租賃管理部行政');
      end if;
    elsif not public.biz_system_change_is_allowed_modifier(v_mod_name, v_mod_team) then
      return json_build_object('ok', false, 'error', '請選擇營業處經理');
    end if;
  end if;
  if v_address = '' then return json_build_object('ok', false, 'error', '請填物件地址'); end if;
  if v_match = '' then return json_build_object('ok', false, 'error', '請填媒合編號'); end if;
  if v_content = '' then return json_build_object('ok', false, 'error', '請輸入需修改內容'); end if;

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
  else
    v_clean := coalesce(v_row.attachments, '[]'::jsonb);
  end if;

  v_handler_admin := trim(coalesce(v_row.handler_admin_name, ''));

  if v_mod_name <> '' then
    if v_rentmgr then
      v_return := 'admin';
      v_notify := v_mod_name;
      v_return_label := v_mod_name;
      v_handler_admin := v_mod_name;
      if v_mod_team = '' then
        select r.dept into v_mod_team
        from public.biz_system_change_rentmgr_admin_rows() r
        where r.name = v_mod_name
        order by r.dept
        limit 1;
      end if;
      v_mod_team := coalesce(nullif(v_mod_team, ''), '租賃管理部');
    else
      v_return := 'manager';
      v_notify := v_mod_name;
      v_return_label := v_mod_name;
    end if;
  else
    v_return := case
      when coalesce(nullif(trim(v_row.reject_return_level), ''), '') in ('manager', 'admin', 'super')
        then trim(v_row.reject_return_level)
      when trim(coalesce(v_row.handler_admin_name, '')) <> '' then 'admin'
      when v_rentmgr then 'admin'
      else 'manager'
    end;

    if v_return = 'admin' then
      v_notify := trim(coalesce(v_row.handler_admin_name, v_row.modifier_name, ''));
      v_return_label := coalesce(nullif(v_notify, ''), '行政');
      v_handler_admin := coalesce(nullif(trim(coalesce(v_row.handler_admin_name, '')), ''), v_notify);
    elsif v_return = 'super' then
      v_notify := '黃怡婷';
      v_return_label := '管理員';
    else
      v_return := 'manager';
      v_notify := trim(coalesce(v_row.modifier_name, ''));
      v_return_label := coalesce(nullif(v_notify, ''), '營業處經理');
    end if;
  end if;

  v_note := format('填寫人重新送出｜%s → %s｜%s',
    coalesce(v_name, ''),
    v_return_label,
    to_char(timezone('Asia/Taipei', now()), 'YYYY/MM/DD HH24:MI')
  );

  update public.biz_system_change
     set address = v_address,
         match_no = v_match,
         content = v_content,
         nodes = v_nodes,
         attachments = v_clean,
         modifier_name = case when v_mod_name <> '' then v_mod_name else modifier_name end,
         modifier_team = case when v_mod_name <> '' then v_mod_team else modifier_team end,
         handler_admin_name = case
           when v_return = 'admin' then coalesce(nullif(v_handler_admin, ''), handler_admin_name)
           else handler_admin_name
         end,
         transfer_extra = case
           when v_rentmgr then coalesce(transfer_extra, '{}'::jsonb) || jsonb_build_object('route', 'rentmgr')
           else transfer_extra
         end,
         status = 'pending',
         handler_level = v_return,
         reject_return_level = null,
         handled_at = null,
         handled_by = '',
         admin_note = case
           when trim(coalesce(admin_note, '')) = '' then v_note
           else left(admin_note || E'\n' || v_note, 1000)
         end
   where id = p_id
  returning * into v_row;

  select string_agg(x, '、') into v_nodes_txt
  from jsonb_array_elements_text(v_nodes) t(x);

  v_msg := format(
    E'🛠️ 系統欄位更改通報（重新送出）\n%s 已依退回原因修改後再送\n地址：%s\n媒合編號：%s\n節點：%s\n內容：%s\n請重新審核\n%s',
    coalesce(v_name, '填寫人'),
    v_address,
    v_match,
    coalesce(v_nodes_txt, ''),
    left(v_content, 800),
    public.biz_system_change_page_url()
  );
  if v_notify <> '' then
    v_line := public.admin_points_line_push(v_notify, v_msg);
  else
    v_line := json_build_object('recipients', 0);
  end if;

  return json_build_object(
    'ok', true,
    'row', public.biz_system_change_row_json(v_row),
    'returnLevel', v_return,
    'notifyName', v_notify,
    'line', coalesce(v_line, json_build_object('recipients', 0))
  );
end;
$function$;
