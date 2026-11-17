-- 系統欄位更改通報：管理員（super）加入簡為倢（與黃怡婷同權）
-- 轉管理員時 LINE 同時通知兩人；行政可選名單排除簡為倢。

create or replace function public.biz_system_change_role(p_uid uuid)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_name text;
  v_team text;
  v_title text;
  v_role text := 'sales';
begin
  select
    trim(coalesce(nullif(a.name, ''), a.username)),
    trim(coalesce(a.team, '')),
    trim(coalesce(a.job_title, ''))
    into v_name, v_team, v_title
  from public.toolbox_accounts a where a.id = p_uid;
  if coalesce(v_name, '') = '' then
    return json_build_object('name', '', 'team', '', 'title', '', 'role', 'guest');
  end if;
  if v_name in ('黃怡婷', '簡為倢') then
    v_role := 'super';
  elsif v_team = '行政管理部' then
    v_role := 'admin';
  elsif v_title = '營業處經理' then
    v_role := 'manager';
  elsif v_team like '%處' then
    v_role := 'sales';
  else
    v_role := 'other';
  end if;
  return json_build_object('name', v_name, 'team', v_team, 'title', v_title, 'role', v_role);
end;
$function$;

create or replace function public.biz_system_change_admins(p_token text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', '請先登入工具箱');
  end if;
  return json_build_object(
    'ok', true,
    'admins', coalesce((
      select json_agg(json_build_object(
        'name', x.name,
        'title', x.title
      ) order by x.rank, x.name)
      from (
        select distinct on (trim(coalesce(nullif(a.name, ''), a.username)))
          trim(coalesce(nullif(a.name, ''), a.username)) as name,
          trim(coalesce(a.job_title, '')) as title,
          case trim(coalesce(a.job_title, ''))
            when '行政專員組長' then 1
            when '主管' then 2
            when '行政專員' then 3
            else 9
          end as rank
        from public.toolbox_accounts a
        where a.status = 'active'
          and trim(coalesce(a.team, '')) = '行政管理部'
          and trim(coalesce(nullif(a.name, ''), a.username)) <> ''
          and trim(coalesce(nullif(a.name, ''), a.username)) not in ('黃怡婷', '簡為倢', '邱奕棋')
          and trim(coalesce(a.job_title, '')) not in ('工讀生')
          and trim(coalesce(nullif(a.name, ''), a.username)) !~* '^(alex|test)'
        order by trim(coalesce(nullif(a.name, ''), a.username)),
                 case trim(coalesce(a.job_title, ''))
                   when '行政專員組長' then 1
                   when '主管' then 2
                   when '行政專員' then 3
                   else 9
                 end
      ) x
    ), '[]'::json)
  );
end;
$function$;
