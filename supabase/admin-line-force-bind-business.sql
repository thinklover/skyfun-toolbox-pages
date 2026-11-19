-- 帳號後台：一次對「業務處＋已核准＋未綁 LINE」設強制綁定
-- 2026-11-19
-- 依賴：toolbox_accounts.force_line_bind、line_bindings、toolbox_check_admin

create or replace function public.toolbox_admin_force_line_bind_business(p_secret text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int := 0;
  v_teams text[] := array[
    '北一處', '北二處', '北三處', '基一處', '桃一處', '竹一處', '宜一處',
    '中一處', '中二處', '中三處', '中四處', '中五處', '中六處', '彰一處', '嘉一處',
    '南一處', '南二處', '高一處', '高二處'
  ];
begin
  if not toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;

  update public.toolbox_accounts a
  set force_line_bind = true
  where a.status = 'active'
    and coalesce(a.force_line_bind, false) = false
    and a.team = any (v_teams)
    and not exists (
      select 1 from public.line_bindings b where b.user_id = a.id
    );

  get diagnostics v_updated = row_count;

  return json_build_object(
    'ok', true,
    'updated', v_updated,
    'message', case
      when v_updated = 0 then '目前沒有未綁 LINE 的業務需要強制'
      else '已對 ' || v_updated::text || ' 位未綁 LINE 的業務設為下次強制綁定'
    end
  );
end;
$$;

grant execute on function public.toolbox_admin_force_line_bind_business(text)
  to anon, authenticated;
