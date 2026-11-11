-- 填寫人重送可改選營業處經理；有選就回到該處長，不再固定送回退件人。

create or replace function public.biz_system_change_resubmit(p_token text, p_id bigint, p_data jsonb)
returns json
language plpgsql
security definer
set search_path = public
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

  if v_mod_name <> '' and not public.biz_system_change_is_allowed_modifier(v_mod_name, v_mod_team) then
    return json_build_object('ok', false, 'error', '請選擇營業處經理');
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

  if v_mod_name <> '' then
    v_return := 'manager';
    v_notify := v_mod_name;
    v_return_label := v_mod_name;
  else
    v_return := case
      when coalesce(nullif(trim(v_row.reject_return_level), ''), '') in ('manager', 'admin', 'super')
        then trim(v_row.reject_return_level)
      when trim(coalesce(v_row.handler_admin_name, '')) <> '' then 'admin'
      else 'manager'
    end;

    if v_return = 'admin' then
      v_notify := trim(coalesce(v_row.handler_admin_name, ''));
      v_return_label := coalesce(nullif(v_notify, ''), '行政');
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

grant execute on function public.biz_system_change_resubmit(text, bigint, jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
