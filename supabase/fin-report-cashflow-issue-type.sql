-- 財會前台：補件改為金流明細表調閱申請（白名單新增類型；舊「補件與資料查詢」仍保留相容）
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
  v_supp_item text := left(trim(coalesce(v_payload->>'suppItem', '')), 80);
  v_origin_txt text := trim(coalesce(v_payload->>'originSerial', ''));
  v_origin_id bigint;
  v_origin public.fin_reports;
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

  -- 舊版補件流程（若仍有舊前端送出）維持相容
  if v_type = '補件與資料查詢' and v_supp_item = '退件補件/資料補正申請' then
    if v_origin_txt = '' or v_origin_txt !~ '^[0-9]+$' then
      return json_build_object('ok', false, 'error', '請填正確的原申請序號');
    end if;
    v_origin_id := v_origin_txt::bigint;
    select * into v_origin from public.fin_reports where id = v_origin_id;
    if not found then
      return json_build_object('ok', false, 'error', '找不到原申請序號');
    end if;
    if coalesce(v_origin.status, 'submitted') <> 'rejected' then
      return json_build_object('ok', false, 'error', '原申請尚未被財務退件，無法補件');
    end if;
    v_payload := v_payload || jsonb_build_object(
      'originRejectReason', coalesce(v_origin.reject_reason, ''),
      'originIssueType', coalesce(v_origin.issue_type, '')
    );
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
    user_id, user_name, full_name, office, issue_type, payload, status
  ) values (
    v_uid, v_user_name, v_full, v_office, v_type, v_payload, 'submitted'
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

  if v_origin_id is not null then
    update public.fin_reports
    set status = 'resubmitted'
    where id = v_origin_id and status = 'rejected';
  end if;

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

  update public.fin_reports
  set line_error = coalesce(v_line_err, ''),
      line_recipients = coalesce(v_line_n, 0)
  where id = v_id;

  return json_build_object(
    'ok', true,
    'id', v_id,
    'line', json_build_object('recipients', v_line_n, 'error', v_line_err)
  );
end;
$$;

notify pgrst, 'reload schema';
