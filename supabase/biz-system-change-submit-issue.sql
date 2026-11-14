-- 業務提出通報時勾選租押金問題／機器人問題
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
      if coalesce(v_item->>'kind', '') = 'image'
         or left(trim(v_item->>'url'), 500) ~* '\.(jpg|jpeg|png|gif|webp)(\?|$)' then
        v_img := v_img + 1;
      end if;
    end loop;
  end if;

  if v_deposit and v_img < 1 then
    return json_build_object('ok', false, 'error', '租押金問題請上傳至少一張照片');
  end if;

  v_saved := jsonb_build_object('depositIssue', v_deposit, 'robotIssue', v_robot);
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
    user_id, author_name, team, modifier_name, modifier_team, handler_level,
    address, match_no, nodes, content, attachments, transfer_extra
  ) values (
    v_uid, v_name, coalesce(v_team, ''), v_mod_name, coalesce(v_mod_team, ''), 'manager',
    v_address, v_match, v_nodes, v_content, v_clean, v_saved
  )
  returning id into v_id;

  select string_agg(x, '、') into v_nodes_txt
  from jsonb_array_elements_text(v_nodes) t(x);

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
  v_line := public.admin_points_line_push(v_mod_name, v_msg);

  return json_build_object(
    'ok', true,
    'id', v_id,
    'line', coalesce(v_line, json_build_object('recipients', 0))
  );
end;
$function$;

notify pgrst, 'reload schema';
