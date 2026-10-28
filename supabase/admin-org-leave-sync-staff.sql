-- 組織圖選「離職」時，同步把人力明細改成離職 → 點數表不再列出

create or replace function public.admin_org_user_save(p_token text, p_data jsonb, p_updated_at timestamptz, p_leave jsonb default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me text := public.admin_org_editor(p_token);
  v_cur timestamptz;
  v_at timestamptz;
  v_synced int := 0;
  v_leave_name text;
begin
  if v_me is null then
    return json_build_object('ok', false, 'error', '沒有修改組織圖的權限');
  end if;
  if jsonb_typeof(p_data) <> 'object' or jsonb_typeof(p_data -> 'groups') <> 'array'
     or jsonb_typeof(coalesce(p_data -> 'lead', '[]'::jsonb)) <> 'array' or length(p_data::text) > 100000 then
    return json_build_object('ok', false, 'error', '組織圖格式不正確');
  end if;
  select updated_at into v_cur from public.admin_org_chart where id = 1 for update;
  if v_cur is not null and p_updated_at is distinct from v_cur then
    return json_build_object('ok', false, 'error', '組織圖剛被其他人改過，請重新整理後再改');
  end if;
  if p_leave is not null then
    v_leave_name := trim(coalesce(p_leave ->> 'name', ''));
    if v_leave_name = '' or (p_leave ->> 'date') is null then
      return json_build_object('ok', false, 'error', '離職要填姓名與離職日');
    end if;
    insert into public.admin_org_leave (name, group_name, dept, office, joined, leave_date, created_by)
    values (v_leave_name, coalesce(p_leave ->> 'group', ''), coalesce(p_leave ->> 'dept', ''),
      coalesce(p_leave ->> 'office', ''), coalesce(p_leave ->> 'joined', ''), (p_leave ->> 'date')::date, v_me);
    -- 點數表只列人力明細「在職」；組織圖離職要一併改狀態
    update public.admin_points_staff
       set status = '離職'
     where name = v_leave_name
       and status is distinct from '離職';
  end if;
  insert into public.admin_org_chart (id, data, updated_at, updated_by)
  values (1, p_data, now(), v_me)
  on conflict (id) do update set data = excluded.data, updated_at = now(), updated_by = excluded.updated_by
  returning updated_at into v_at;

  v_synced := public.admin_org_sync_staff_from_chart(p_data);

  return json_build_object('ok', true, 'updatedAt', v_at, 'staffSynced', v_synced);
end;
$$;

grant execute on function public.admin_org_user_save(text, jsonb, timestamptz, jsonb) to anon, authenticated;
