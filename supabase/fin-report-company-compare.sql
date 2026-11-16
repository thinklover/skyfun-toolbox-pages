-- 財務回報送出：需完成公司系統比對（社宅包租必填；其他非商辦類型若帶入也需通過）
-- 已於 Supabase 套用；此檔供追蹤。

create or replace function public.fin_report_submit(p_token text, p_data jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  d jsonb := coalesce(p_data, '{}'::jsonb);
  v_user_name text;
  v_full text := left(trim(coalesce(d->>'fullName', '')), 40);
  v_office text := left(trim(coalesce(d->>'office', '')), 40);
  v_type text := left(trim(coalesce(d->>'issueType', '')), 80);
  v_payload jsonb := coalesce(d->'payload', '{}'::jsonb);
  v_files jsonb := coalesce(d->'files', '[]'::jsonb);
  v_item jsonb;
  v_clean jsonb := '[]'::jsonb;
  v_n int := 0;
  v_id bigint;
  v_msg text;
  v_line json;
  v_line_err text := '';
  v_line_n int := 0;
  v_cmp jsonb;
  v_field jsonb;
  v_key text;
  v_need_cmp boolean := false;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  select trim(coalesce(nullif(a.name, ''), a.username))
    into v_user_name
  from public.toolbox_accounts a where a.id = v_uid;
  if coalesce(v_user_name, '') = '' then
    return json_build_object('ok', false, 'error', '帳號沒有姓名，請聯絡管理員');
  end if;
  if v_full = '' then return json_build_object('ok', false, 'error', '請填姓名全名'); end if;
  if v_office = '' then return json_build_object('ok', false, 'error', '請選案件所屬處所'); end if;
  if v_type not in (
    '社宅包租金流相關(進件、解約或資料異動)',
    '社宅租金及款項處理',
    '社宅催收管理相關問題',
    '補件與資料查詢',
    '金流明細表調閱申請',
    '止付通知',
    '一般宅金流相關(進件、解約)',
    '商辦部'
  ) then
    return json_build_object('ok', false, 'error', '請選擇回報問題');
  end if;

  v_need_cmp := v_type is distinct from '商辦部';
  if v_need_cmp then
    v_cmp := v_payload->'companyCompare';
    if v_cmp is null or jsonb_typeof(v_cmp) <> 'object' then
      return json_build_object('ok', false, 'error', '請先按「比對」核對公司系統後再送出');
    end if;
    if nullif(trim(coalesce(v_cmp->>'comparedAt', '')), '') is null then
      return json_build_object('ok', false, 'error', '比對紀錄不完整，請重新比對');
    end if;
    if coalesce((v_cmp->>'allOk')::boolean, false) is not true then
      return json_build_object('ok', false, 'error', '尚有欄位與公司系統不符，無法送出');
    end if;
    if v_cmp ? 'fields' and jsonb_typeof(v_cmp->'fields') = 'object' then
      for v_key, v_field in
        select key, value from jsonb_each(v_cmp->'fields')
      loop
        if coalesce((v_field->>'ok')::boolean, false) is true then
          continue;
        end if;
        if coalesce((v_field->>'override')::boolean, false) is not true
           or nullif(trim(coalesce(v_field->>'overrideNote', '')), '') is null then
          return json_build_object('ok', false, 'error', '不符欄位須勾選「公司系統資料有誤」並填說明');
        end if;
      end loop;
    end if;
    if coalesce((v_cmp->>'systemDataPendingFix')::boolean, false) then
      v_payload := jsonb_set(v_payload, '{systemDataPendingFix}', 'true'::jsonb, true);
    end if;
  end if;

  if jsonb_typeof(v_files) = 'array' then
    for v_item in select * from jsonb_array_elements(v_files)
    loop
      if v_n >= 20 then exit; end if;
      if nullif(trim(coalesce(v_item->>'url', '')), '') is null
         and nullif(trim(coalesce(v_item->>'path', '')), '') is null then
        continue;
      end if;
      v_clean := v_clean || jsonb_build_array(jsonb_build_object(
        'path', left(trim(coalesce(v_item->>'path', '')), 300),
        'url', left(trim(coalesce(v_item->>'url', '')), 500),
        'name', left(trim(coalesce(v_item->>'name', '附件')), 120),
        'kind', case when coalesce(v_item->>'kind', '') = 'image' then 'image' else 'file' end
      ));
      v_n := v_n + 1;
    end loop;
  end if;

  insert into public.fin_reports (
    user_id, user_name, full_name, office, issue_type, payload
  ) values (
    v_uid, v_user_name, v_full, v_office, v_type, v_payload
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(v_clean)
  loop
    insert into public.fin_report_files (report_id, path, name, kind, public_url)
    values (
      v_id,
      coalesce(v_item->>'path', ''),
      coalesce(v_item->>'name', '附件'),
      coalesce(v_item->>'kind', 'file'),
      coalesce(v_item->>'url', '')
    );
  end loop;

  v_msg := format(
    E'【財務回報】%s\n填表人：%s\n姓名：%s\n處所：%s\n時間：%s\n請至工具箱後台下載附件：\nhttps://toolbox.skyfunsystem.com/admin/fin-report-dashboard.html',
    v_type,
    v_user_name,
    v_full,
    v_office,
    to_char(now() at time zone 'Asia/Taipei', 'YYYY/MM/DD HH24:MI')
  );
  v_line := public.fin_report_push_finance(v_msg);
  v_line_err := coalesce(v_line->>'error', '');
  v_line_n := coalesce((v_line->>'recipients')::int, 0);

  return json_build_object(
    'ok', true,
    'id', v_id,
    'line', json_build_object(
      'ok', v_line_err = '',
      'error', nullif(v_line_err, ''),
      'recipients', v_line_n
    )
  );
end;
$$;

notify pgrst, 'reload schema';
