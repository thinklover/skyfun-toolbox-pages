-- 星鴻註銷物件申請：登入者可退回（必填原因）或撤銷退回
create or replace function public.object_cancel_reject(p_token text, p_id bigint, p_reject boolean, p_reason text default '')
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid; v_acc public.toolbox_accounts%rowtype; v_row public.object_cancel_requests%rowtype; v_reason text;
begin
  v_uid := admin_qa_user_id(p_token);
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into v_acc from public.toolbox_accounts where id = v_uid;
  v_reason := left(trim(coalesce(p_reason, '')), 1000);
  if p_reject and v_reason = '' then return json_build_object('ok', false, 'error', '請填寫退回原因'); end if;

  select * into v_row from public.object_cancel_requests where id = p_id for update;
  if not found then return json_build_object('ok', false, 'error', '找不到這筆申請'); end if;
  if p_reject and v_row.status = 'done' then return json_build_object('ok', false, 'error', '已完成的申請不能退回，請先取消「已完成」'); end if;
  if not p_reject and v_row.status <> 'rejected' then return json_build_object('ok', false, 'error', '這筆申請沒有被退回'); end if;

  update public.object_cancel_requests set
    status = case when p_reject then 'rejected' else 'pending' end,
    admin_note = case when p_reject then v_reason else '' end,
    handled_at = case when p_reject then now() else null end,
    done_by = case when p_reject then v_uid else null end,
    done_by_name = case when p_reject then coalesce(nullif(v_acc.name, ''), v_acc.username, '') else '' end
  where id = p_id
  returning * into v_row;
  return json_build_object('ok', true, 'status', v_row.status, 'handledAt', v_row.handled_at, 'doneByName', v_row.done_by_name);
end; $$;

grant execute on function public.object_cancel_reject(text, bigint, boolean, text) to anon, authenticated;
