-- 處長轉行政：照片、租押金問題、機器人問題（房客／共住人）
alter table public.biz_system_change
  add column if not exists transfer_extra jsonb not null default '{}'::jsonb;

create or replace function public.biz_system_change_row_json(a public.biz_system_change)
returns json
language sql
stable
as $$
  select json_build_object(
    'id', a.id,
    'createdAt', a.created_at,
    'authorName', a.author_name,
    'team', a.team,
    'userId', a.user_id,
    'modifierName', a.modifier_name,
    'modifierTeam', a.modifier_team,
    'handlerLevel', a.handler_level,
    'handlerAdminName', a.handler_admin_name,
    'address', a.address,
    'matchNo', a.match_no,
    'nodes', a.nodes,
    'content', a.content,
    'attachments', a.attachments,
    'transferExtra', coalesce(a.transfer_extra, '{}'::jsonb),
    'status', a.status,
    'adminNote', a.admin_note,
    'handledAt', a.handled_at,
    'handledBy', a.handled_by
  );
$$;

drop function if exists public.biz_system_change_transfer(text, bigint, text, text);

create or replace function public.biz_system_change_transfer(
  p_token text,
  p_id bigint,
  p_to text,
  p_admin_name text default null,
  p_extra jsonb default '{}'::jsonb
)
returns json
language plpgsql
security definer
set search_path to 'public'
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
  v_extra jsonb := coalesce(p_extra, '{}'::jsonb);
  v_deposit boolean := false;
  v_robot boolean := false;
  v_photos jsonb := '[]'::jsonb;
  v_mates jsonb := '[]'::jsonb;
  v_saved jsonb := '{}'::jsonb;
  v_item jsonb;
  v_url text;
  v_n int := 0;
  v_addr text;
  v_tname text;
  v_tid text;
  v_mn text;
  v_mid text;
  v_flags text := '';
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
    if not (v_role_key = 'manager' and v_row.handler_level = 'manager' and trim(v_row.modifier_name) = v_name) then
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

    v_deposit := lower(trim(coalesce(v_extra->>'depositIssue', ''))) in ('true', 't', '1');
    v_robot := lower(trim(coalesce(v_extra->>'robotIssue', ''))) in ('true', 't', '1');

    if jsonb_typeof(v_extra->'photos') = 'array' then
      for v_item in select * from jsonb_array_elements(v_extra->'photos')
      loop
        if v_n >= 5 then exit; end if;
        v_url := left(trim(coalesce(v_item->>'url', '')), 500);
        if v_url = '' or position('biz-system-change/' in v_url) = 0 then continue; end if;
        if coalesce(v_item->>'kind', '') <> 'image'
           and v_url !~* '\.(jpg|jpeg|png|gif|webp)(\?|$)' then
          continue;
        end if;
        v_photos := v_photos || jsonb_build_array(jsonb_build_object(
          'url', v_url,
          'name', left(trim(coalesce(v_item->>'name', '轉交照片')), 120),
          'kind', 'image'
        ));
        v_n := v_n + 1;
      end loop;
    end if;
    if v_deposit and v_n < 1 then
      return json_build_object('ok', false, 'error', '租押金問題請上傳至少一張照片');
    end if;

    v_saved := jsonb_build_object('depositIssue', v_deposit, 'robotIssue', v_robot);
    if v_robot then
      v_addr := left(trim(coalesce(v_extra->>'address', '')), 200);
      v_tname := left(trim(coalesce(v_extra->>'tenantName', '')), 40);
      v_tid := left(trim(coalesce(v_extra->>'tenantId', '')), 20);
      if v_addr = '' then
        return json_build_object('ok', false, 'error', '機器人問題請填物件地址');
      end if;
      if v_tname = '' then
        return json_build_object('ok', false, 'error', '機器人問題請填房客姓名');
      end if;
      if v_tid = '' then
        return json_build_object('ok', false, 'error', '機器人問題請填房客身分證字號');
      end if;
      if jsonb_typeof(v_extra->'roommates') = 'array' then
        for v_item in select * from jsonb_array_elements(v_extra->'roommates')
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
        'address', v_addr,
        'tenantName', v_tname,
        'tenantId', v_tid,
        'roommates', v_mates
      );
    end if;

    if v_deposit then v_flags := v_flags || '租押金問題'; end if;
    if v_robot then
      v_flags := v_flags || case when v_flags = '' then '' else '、' end || '機器人問題';
    end if;

    v_note := format('處長轉行政｜%s → %s｜%s', v_name, v_admin, to_char(timezone('Asia/Taipei', now()), 'YYYY/MM/DD HH24:MI'));
    update public.biz_system_change
       set handler_level = 'admin',
           handler_admin_name = v_admin,
           attachments = coalesce(attachments, '[]'::jsonb) || v_photos,
           admin_note = case
             when trim(coalesce(admin_note, '')) = '' then v_note
             else left(admin_note || E'\n' || v_note, 1000)
           end
     where id = p_id
    returning * into v_row;

    select string_agg(x, '、') into v_nodes_txt
    from jsonb_array_elements_text(coalesce(v_row.nodes, '[]'::jsonb)) t(x);
    v_msg := format(
      E'🛠️ 系統欄位更改通報（行政協辦）\n%s（處長）已轉交案件給您\n地址：%s\n媒合編號：%s\n節點：%s\n內容：%s%s\n%s',
      v_name,
      v_row.address,
      v_row.match_no,
      coalesce(v_nodes_txt, ''),
      left(v_row.content, 800),
      case when v_flags = '' then '' else E'\n類型：' || v_flags || '（詳細資料請至工具箱查看）' end,
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

grant execute on function public.biz_system_change_transfer(text, bigint, text, text, jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
