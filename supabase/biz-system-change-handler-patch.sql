-- 行政／管理員待辦：編輯內容與補上傳附件（不改 handler_level）
create or replace function public.biz_system_change_handler_patch(
  p_token text,
  p_id bigint,
  p_data jsonb
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  d jsonb := coalesce(p_data, '{}'::jsonb);
  v_role json;
  v_name text;
  v_role_key text;
  v_row public.biz_system_change%rowtype;
  v_address text := left(trim(coalesce(d->>'address', '')), 200);
  v_match text := left(trim(coalesce(d->>'matchNo', '')), 80);
  v_content text := left(trim(coalesce(d->>'content', '')), 4000);
  v_nodes_in jsonb := coalesce(d->'nodes', '[]'::jsonb);
  v_nodes jsonb := '[]'::jsonb;
  v_atts jsonb := coalesce(d->'attachments', '[]'::jsonb);
  v_clean jsonb := '[]'::jsonb;
  v_item jsonb;
  v_node text;
  v_n int := 0;
  v_note text;
  v_label text;
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
  if v_role_key not in ('admin', 'super') then
    return json_build_object('ok', false, 'error', '僅行政或管理員可補件');
  end if;

  select * into v_row from public.biz_system_change where id = p_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '找不到這筆通報');
  end if;
  if v_row.status <> 'pending' then
    return json_build_object('ok', false, 'error', '此案件目前無法編輯');
  end if;
  if v_row.handler_level not in ('admin', 'super') then
    return json_build_object('ok', false, 'error', '僅待行政／管理員案件可補件');
  end if;
  if v_role_key = 'admin' then
    if v_row.handler_level <> 'admin' then
      return json_build_object('ok', false, 'error', '行政只能編輯待行政案件');
    end if;
    if trim(coalesce(v_row.handler_admin_name, '')) <> ''
       and trim(v_row.handler_admin_name) <> v_name then
      return json_build_object('ok', false, 'error', '僅被指派的行政可補件');
    end if;
  end if;

  if v_address = '' then return json_build_object('ok', false, 'error', '請填物件地址'); end if;
  if v_match = '' then return json_build_object('ok', false, 'error', '請填媒合編號'); end if;
  if v_content = '' then return json_build_object('ok', false, 'error', '請輸入需修改內容'); end if;

  if jsonb_typeof(v_nodes_in) = 'array' then
    for v_item in select * from jsonb_array_elements(v_nodes_in)
    loop
      v_node := trim(coalesce(v_item #>> '{}', ''));
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
      if position('biz-system-change/' in coalesce(v_item->>'url', '')) = 0 then continue; end if;
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

  v_label := case when v_role_key = 'super' then '管理員補件' else '行政補件' end;
  v_note := format('%s｜%s｜%s',
    v_label,
    v_name,
    to_char(timezone('Asia/Taipei', now()), 'YYYY/MM/DD HH24:MI')
  );

  update public.biz_system_change
     set address = v_address,
         match_no = v_match,
         content = v_content,
         nodes = v_nodes,
         attachments = v_clean,
         admin_note = case
           when trim(coalesce(admin_note, '')) = '' then v_note
           else left(admin_note || E'\n' || v_note, 1000)
         end
   where id = p_id
  returning * into v_row;

  return json_build_object(
    'ok', true,
    'row', public.biz_system_change_row_json(v_row)
  );
end;
$function$;

grant execute on function public.biz_system_change_handler_patch(text, bigint, jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
