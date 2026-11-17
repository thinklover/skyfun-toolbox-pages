-- 會議計分：加減分紀錄頁列出有獎金的月份紀錄
create or replace function public.msb_bonus_list(p_token text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := public.msb_require_user(p_token);
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  return json_build_object(
    'ok', true,
    'rows', coalesce((
      select json_agg(json_build_object(
        'id', ms.id,
        'periodMonth', ms.period_month,
        'personId', ms.person_id,
        'personName', coalesce(nullif(trim(p.name), ''), ms.name, ''),
        'bonus', ms.bonus,
        'bonusStatus', coalesce(ms.bonus_status, ''),
        'note', coalesce(ms.note, ''),
        'score', ms.score,
        'updatedAt', ms.updated_at
      ) order by ms.period_month desc, ms.updated_at desc nulls last, ms.id desc)
      from public.msb_month_scores ms
      left join public.msb_people p on p.id = ms.person_id
      where ms.bonus is not null and ms.bonus <> 0
        and coalesce(p.active, true) = true
    ), '[]'::json)
  );
end;
$function$;

revoke all on function public.msb_bonus_list(text) from public;
grant execute on function public.msb_bonus_list(text) to anon, authenticated;
notify pgrst, 'reload schema';
