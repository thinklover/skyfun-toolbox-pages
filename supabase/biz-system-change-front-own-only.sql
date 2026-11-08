-- 前台案件儀表板：已完成／退件只顯示「自己經手」
-- 行政管理部／管理員不再於前台一次撈全部已完成；全員一覽請用後台。
-- 待處理：行政只看 handler_level=admin，管理員只看 super（不再丟全部 pending）。

create or replace function public.biz_system_change_for_me(p_token text)
returns json
language plpgsql
security definer
set search_path to public
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
            or (v_role_key = 'manager' and x.handler_level = 'manager' and trim(x.modifier_name) = v_name)
            or (v_role_key = 'admin' and x.handler_level = 'admin')
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
              v_role_key = 'manager'
              and trim(x.modifier_name) = v_name
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

grant execute on function public.biz_system_change_for_me(text) to anon, authenticated;
