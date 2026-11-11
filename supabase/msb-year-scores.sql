-- 會議計分年度表：把該年各月已輸入的分數、獎金加總。沒有輸入的月份不計入。

create or replace function public.msb_year_scores(p_token text, p_board text, p_year text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.msb_require_user(p_token);
  v_board text := public.msb_board_ok(p_board);
  v_year text := trim(coalesce(p_year, ''));
  v_people json;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  if v_year !~ '^\d{4}$' then
    return json_build_object('ok', false, 'error', '年度格式錯誤');
  end if;

  select coalesce(json_agg(json_build_object(
    'id', p.id,
    'score', s.score,
    'bonus', s.bonus
  )), '[]'::json)
    into v_people
  from public.msb_people p
  left join (
    select person_id, sum(score) as score, sum(bonus) as bonus
    from public.msb_month_scores
    where period_month ~ ('^' || v_year || '-')
    group by person_id
  ) s on s.person_id = p.id
  where p.active = true
    and (
      v_board = 'all'
      or p.board_key = v_board
    )
    and (
      v_board <> 'all'
      or p.board_key = 'system'
      or not exists (
        select 1 from public.msb_people x
        where x.active = true and x.board_key = 'system' and x.name = p.name
      )
    );

  return json_build_object('ok', true, 'year', v_year, 'people', v_people);
end;
$$;

revoke all on function public.msb_year_scores(text, text, text) from public;
grant execute on function public.msb_year_scores(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
