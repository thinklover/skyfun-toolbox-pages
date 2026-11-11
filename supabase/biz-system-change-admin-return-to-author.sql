-- 後台「退回」不再把狀態改成 rejected（填寫人無法重送）。
-- 改為與前台退回相同：狀態維持處理中、輪到填寫人，並記住退回前的層級，重送時回到該層。
-- 已套用：biz_system_change_admin_return_to_author。當時唯一一筆 rejected 已改回填寫人。

create or replace function public.biz_system_change_admin_update(
  p_secret text,
  p_id bigint,
  p_status text,
  p_admin_note text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_status text := trim(coalesce(p_status, ''));
  v_note text := left(trim(coalesce(p_admin_note, '')), 1000);
  v_row public.biz_system_change%rowtype;
  v_from text;
  v_reject_line text;
  v_stored text;
  v_msg text;
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  if v_status not in ('pending', 'done', 'rejected') then
    return json_build_object('ok', false, 'error', '狀態不正確');
  end if;

  select * into v_row from public.biz_system_change where id = p_id for update;
  if not found then
    return json_build_object('ok', false, 'error', '找不到這筆通報');
  end if;

  if v_status = 'rejected' then
    if v_row.status = 'pending' and v_row.handler_level = 'author' then
      return json_build_object('ok', false, 'error', '此案件已退回填寫人');
    end if;
    v_from := case
      when v_row.handler_level in ('manager', 'admin', 'super') then v_row.handler_level
      when coalesce(nullif(trim(v_row.reject_return_level), ''), '') in ('manager', 'admin', 'super')
        then trim(v_row.reject_return_level)
      else 'manager'
    end;
    v_reject_line := format('退回填寫人｜後台｜%s｜原因：後台退回，請修改後重新送出',
      to_char(timezone('Asia/Taipei', now()), 'YYYY/MM/DD HH24:MI'));
    v_stored := left(case
      when v_note = '' then v_reject_line
      when position(v_reject_line in v_note) > 0 then v_note
      else v_note || E'\n' || v_reject_line
    end, 1000);

    update public.biz_system_change
       set status = 'pending',
           handler_level = 'author',
           reject_return_level = v_from,
           handled_at = now(),
           handled_by = '後台',
           admin_note = v_stored
     where id = p_id
    returning * into v_row;

    v_msg := format(
      E'↩️ 系統欄位更改通報已退回\n處理人：後台\n地址：%s\n媒合編號：%s\n退回原因：後台退回，請修改後重新送出\n%s',
      v_row.address, v_row.match_no, public.biz_system_change_page_url()
    );
    begin
      perform public.admin_points_line_push(v_row.author_name, v_msg);
    exception when others then
      null;
    end;

    return json_build_object('ok', true, 'row', public.biz_system_change_row_json(v_row));
  end if;

  update public.biz_system_change
     set status = v_status,
         admin_note = v_note,
         handled_at = case when v_status = 'pending' then null else now() end
   where id = p_id
  returning * into v_row;

  return json_build_object('ok', true, 'row', public.biz_system_change_row_json(v_row));
end;
$function$;

grant execute on function public.biz_system_change_admin_update(text, bigint, text, text) to anon, authenticated;
