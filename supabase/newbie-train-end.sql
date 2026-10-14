-- 新人總覽（Google 試算表）結訓日期 → 工具箱財補試算／財補後台
-- 每天早上 6 點由 pg_cron 讀一次試算表（gviz JSON，只取 姓名／處別／結訓狀態／結訓日期 四欄）。
-- pg_net 是非同步：06:00 送出請求、06:05 收結果；06:00–06:55 每 5 分鐘檢查，當天同步成功後就不再送請求，失敗會自動重試。
-- 帳號對照：姓名相同且處別相同；帳號沒填處別，或帳號是營業處但試算表處別寫不完整（例如「中」「南區」）時，只比姓名。

create table if not exists public.newbie_train_roster (
  row_no int primary key,
  name text not null,
  dept text not null default '',
  dept_norm text not null default '',
  status text not null default '',
  train_end date
);
create index if not exists newbie_train_roster_name_idx on public.newbie_train_roster (name);
alter table public.newbie_train_roster enable row level security;
revoke all on public.newbie_train_roster from anon, authenticated;

create table if not exists public.newbie_train_sync (
  id int primary key default 1 check (id = 1),
  request_id bigint,
  requested_at timestamptz,
  synced_at timestamptz,
  rows int,
  last_error text
);
alter table public.newbie_train_sync enable row level security;
revoke all on public.newbie_train_sync from anon, authenticated;
insert into public.newbie_train_sync (id) values (1) on conflict (id) do nothing;

-- 「中區-彰一處」「竹ㄧ處」「中4處」「中五」「高一處？」→「彰一處」「竹一處」「中四處」「中五處」「高一處」
create or replace function public.newbie_dept_norm(p text)
returns text language sql immutable as $$
  select case when s ~ '^[北中南高嘉彰竹宜基桃][一二三四五六]$' then s || '處' else s end
  from (
    select translate(regexp_replace(regexp_replace(coalesce(trim(p), ''), '^.*[-－–]', ''), '[\s？?]', '', 'g'),
                     'ㄧ123456', '一一二三四五六') as s
  ) x
$$;

create or replace function public.newbie_train_sync_run()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url constant text := 'https://docs.google.com/spreadsheets/d/1ogz9F3y3zjNMMKNZOX4x8xFRP0fgAXVLoJElF9Ns0_M/gviz/tq?tqx=out:json&headers=1&gid=449284226&tq=select%20A%2CC%2CM%2CN';
  s public.newbie_train_sync%rowtype;
  r record;
  body text;
  j jsonb;
  n int;
  v_result text := 'idle';
begin
  select * into s from public.newbie_train_sync where id = 1 for update;

  if s.request_id is not null then
    select status_code, content, error_msg into r from net._http_response where id = s.request_id;
    if not found then
      if s.requested_at > now() - interval '10 minutes' then return 'pending'; end if;
      update public.newbie_train_sync set last_error = '讀取試算表逾時' where id = 1;
    elsif r.status_code = 200 and position('setResponse(' in coalesce(r.content, '')) > 0 then
      body := substring(r.content from position('setResponse(' in r.content) + 12);
      body := regexp_replace(body, '\)\s*;?\s*$', '');
      begin
        j := body::jsonb;
      exception when others then
        j := null;
      end;
      if j is null or j->>'status' <> 'ok' then
        update public.newbie_train_sync set last_error = '試算表回應格式錯誤' where id = 1;
      elsif jsonb_array_length(coalesce(j->'table'->'rows', '[]'::jsonb)) = 0 then
        update public.newbie_train_sync set last_error = '試算表沒有資料，保留上次同步結果' where id = 1;
      else
        delete from public.newbie_train_roster where true;
        insert into public.newbie_train_roster (row_no, name, dept, dept_norm, status, train_end)
        select t.o,
               trim(t.x->'c'->0->>'v'),
               coalesce(trim(t.x->'c'->1->>'v'), ''),
               public.newbie_dept_norm(t.x->'c'->1->>'v'),
               coalesce(trim(t.x->'c'->2->>'v'), ''),
               case when d.m is not null then make_date(d.m[1]::int, d.m[2]::int + 1, d.m[3]::int) end
        from jsonb_array_elements(j->'table'->'rows') with ordinality as t(x, o)
        cross join lateral (select regexp_match(t.x->'c'->3->>'v', '^Date\((\d+),(\d+),(\d+)') as m) d
        where coalesce(trim(t.x->'c'->0->>'v'), '') <> '';
        get diagnostics n = row_count;
        update public.newbie_train_sync set synced_at = now(), rows = n, last_error = null where id = 1;
        v_result := 'synced ' || n;
      end if;
    else
      update public.newbie_train_sync
      set last_error = coalesce(nullif(r.error_msg, ''), '試算表 HTTP ' || r.status_code)
      where id = 1;
    end if;
    update public.newbie_train_sync set request_id = null where id = 1;
  end if;

  if coalesce((select synced_at from public.newbie_train_sync where id = 1), '-infinity') > now() - interval '20 hours' then
    return v_result;
  end if;

  update public.newbie_train_sync
  set request_id = net.http_get(url := v_url, timeout_milliseconds := 20000), requested_at = now()
  where id = 1;
  return 'requested';
end;
$$;
revoke all on function public.newbie_train_sync_run() from public, anon, authenticated;

-- 依帳號姓名＋處別找結訓日；同名多列取結訓日最新的一列
create or replace function public.newbie_train_match(p_name text, p_team text)
returns table (train_end date, status text, dept text, matched_by text)
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select r.*, r.dept_norm = coalesce(trim(p_team), '') as dept_hit
    from public.newbie_train_roster r
    where r.name = trim(p_name) and coalesce(trim(p_name), '') <> ''
  ), pick as (
    select c.*, 'name_dept'::text as how from c where dept_hit
    union all
    select c.*, 'name'::text from c
    where not exists (select 1 from c where dept_hit)
      and (coalesce(trim(p_team), '') = '' or (trim(p_team) ~ '處$' and c.dept_norm !~ '處$'))
  )
  select train_end, status, dept, how
  from pick
  order by (how = 'name_dept') desc, train_end desc nulls last, row_no desc
  limit 1
$$;
revoke all on function public.newbie_train_match(text, text) from public, anon, authenticated;

create or replace function public.subsidy_my_train_end(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := public.admin_qa_user_id(p_token);
  v_acc public.toolbox_accounts%rowtype;
  m record;
  v_synced timestamptz;
begin
  if v_uid is null then return json_build_object('ok', false, 'error', '請先登入'); end if;
  select * into v_acc from public.toolbox_accounts where id = v_uid;
  select synced_at into v_synced from public.newbie_train_sync where id = 1;
  select * into m from public.newbie_train_match(coalesce(nullif(v_acc.name, ''), v_acc.username), v_acc.team);
  if not found then
    return json_build_object('ok', true, 'found', false, 'syncedAt', v_synced);
  end if;
  return json_build_object('ok', true, 'found', true, 'trainEnd', m.train_end, 'status', m.status,
    'dept', m.dept, 'matchedBy', m.matched_by, 'syncedAt', v_synced);
end;
$$;
grant execute on function public.subsidy_my_train_end(text) to anon, authenticated;

create or replace function public.subsidy_train_end_admin(p_secret text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_list json;
  s public.newbie_train_sync%rowtype;
begin
  if not public.toolbox_check_admin(p_secret) then
    return json_build_object('ok', false, 'error', '後台密碼錯誤');
  end if;
  select * into s from public.newbie_train_sync where id = 1;
  select coalesce(json_agg(json_build_object('userId', a.id, 'trainEnd', m.train_end, 'status', m.status,
           'dept', m.dept, 'matchedBy', m.matched_by)), '[]'::json)
  into v_list
  from public.toolbox_accounts a
  cross join lateral public.newbie_train_match(coalesce(nullif(a.name, ''), a.username), a.team) m;
  return json_build_object('ok', true, 'list', v_list, 'syncedAt', s.synced_at, 'syncError', s.last_error);
end;
$$;
grant execute on function public.subsidy_train_end_admin(text) to anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'newbie-train-end-sync';
-- pg_cron 用 UTC：22:00–22:55 UTC = 台灣 06:00–06:55
select cron.schedule('newbie-train-end-sync', '*/5 22 * * *', $$select public.newbie_train_sync_run()$$);
