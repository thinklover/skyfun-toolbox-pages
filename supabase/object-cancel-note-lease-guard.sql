-- 註銷物件：業務備註至少 100 字、須寫關懷／挽留；租期防呆（不可离谱日期）

create or replace function public.object_cancel_submit(p_token text, p_data jsonb)
returns json language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid; v_acc public.toolbox_accounts%rowtype; v_row public.object_cancel_requests%rowtype;
  d jsonb := coalesce(p_data, '{}'::jsonb);
  v_start date; v_end date; k text;
  v_note text;
  v_note_len int;
  v_max date := (current_date + interval '5 years')::date;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into v_acc from public.toolbox_accounts where id = v_uid;

  foreach k in array array['dept', 'applicant', 'agentName', 'region', 'objectType', 'contractStatus',
    'leaseStart', 'leaseEnd', 'address', 'note', 'takerCompany', 'takerAgent'] loop
    if nullif(trim(coalesce(d ->> k, '')), '') is null then
      return json_build_object('ok', false, 'error', '還有欄位沒填');
    end if;
  end loop;

  if d ->> 'dept' not in ('北一處', '北二處', '北三處', '北四處', '北五處', '桃一處', '宜一處', '基一處', '彰一處', '投一處',
    '竹一處', '中一處', '中二處', '中三處', '中四處', '中五處', '中六處', '嘉一處', '南一處', '南二處', '高一處', '高二處', '租賃管理部') then
    return json_build_object('ok', false, 'error', '申請處所不正確');
  end if;
  if d ->> 'region' not in ('新北市', '臺北市', '桃園市', '宜蘭縣', '基隆市', '臺中市', '新竹市', '新竹縣', '彰化縣',
    '南投縣', '嘉義市', '嘉義縣', '臺南市', '高雄市') then
    return json_build_object('ok', false, 'error', '物件所在區域不正確');
  end if;
  if d ->> 'objectType' not in ('代管物件', '包租物件') then
    return json_build_object('ok', false, 'error', '物件型態不正確');
  end if;

  begin
    v_start := (d ->> 'leaseStart')::date;
    v_end := (d ->> 'leaseEnd')::date;
  exception when others then
    return json_build_object('ok', false, 'error', '日期格式不正確');
  end;

  if v_start < date '2010-01-01' or v_end < date '2010-01-01' then
    return json_build_object('ok', false, 'error', '租約日期不合理（不可早於 2010/01/01），請改填實際租約起迄日');
  end if;
  if v_start > v_max or v_end > v_max then
    return json_build_object('ok', false, 'error', '租約日期不合理（日期過遠），請再確認');
  end if;
  if v_end < v_start then
    return json_build_object('ok', false, 'error', '租約到期日不能早於租約開始日期');
  end if;
  if v_end > (v_start + interval '20 years')::date then
    return json_build_object('ok', false, 'error', '租期超過 20 年，請再確認起迄日是否填錯');
  end if;

  v_note := trim(d ->> 'note');
  v_note_len := char_length(regexp_replace(v_note, '\s', '', 'g'));
  if v_note_len < 100 then
    return json_build_object('ok', false, 'error', format('業務備註至少要 100 字（目前 %s 字）', v_note_len));
  end if;
  if v_note !~ '關懷|挽留|慰留|協調|溝通|勸說|無法挽留|未挽留|沒挽留|沒有挽留|有挽留|未能挽留|無法協調' then
    return json_build_object('ok', false, 'error', '業務備註必須寫到「有無關懷或挽留」（含無法挽留）');
  end if;

  insert into public.object_cancel_requests (user_id, username, user_name, team, dept, applicant, agent_name, region,
    object_type, contract_status, lease_start, lease_end, address, note, taker_company, taker_agent)
  values (v_uid, v_acc.username, coalesce(nullif(v_acc.name, ''), v_acc.username), coalesce(v_acc.team, ''),
    d ->> 'dept', left(trim(d ->> 'applicant'), 50), left(trim(d ->> 'agentName'), 50), d ->> 'region',
    d ->> 'objectType', left(trim(d ->> 'contractStatus'), 200), v_start, v_end, left(trim(d ->> 'address'), 200),
    left(v_note, 2000), left(trim(d ->> 'takerCompany'), 100), left(trim(d ->> 'takerAgent'), 50))
  returning * into v_row;

  return json_build_object('ok', true, 'id', v_row.id, 'createdAt', v_row.created_at);
end; $$;

grant execute on function public.object_cancel_submit(text, jsonb) to anon, authenticated;
