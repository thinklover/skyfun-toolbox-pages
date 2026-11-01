-- 案件意見缺失類別加回：營建署/中心系統未送出、是否待租約
-- 並把先前搬到 system_paper 而變成「未分類」的列歸回缺失類別

create or replace function public.admin_points_opinion_cats(p_kind text)
returns text[]
language sql
immutable
as $$
  select case p_kind
    when 'case' then array['資料缺漏、重複(未檢附)', '未附原租約、不完整', '房東/客資料誤繕、過期、缺漏', '編號誤繕、未填(物編客編媒編)',
      '金額/費用誤繕', '日期未填、誤繕', '未蓋章/未簽章(含章糊)', '表單勾選有誤(未勾、勾錯)', '擺放順序有誤',
      '消防三寶(熱水器滅火器偵煙器)', '產編與紙本不一致', '掃描檔缺失',
      '營建署/中心系統未送出', '是否待租約', '其他']
    when 'roster' then array['資料缺漏、重複(未檢附)', '有檢附資料未KEY經控表', '房東/客資料誤繕', '編號誤繕、未填(物編客編媒編)',
      '金額/費用誤繕', '日期未填、誤繕', '未蓋章/未簽章(含章糊)', '表單勾選有誤(未勾、勾錯)', '擺放順序有誤', '其他']
    else array[]::text[]
  end;
$$;

-- 未分類（category 空白）且 system_paper 已標這兩類 → 寫回缺失類別
update public.admin_points_opinion
set category = case system_paper
  when '營建署/中心系統' then '營建署/中心系統未送出'
  when '是否待租約' then '是否待租約'
  else category
end
where kind = 'case'
  and coalesce(trim(category), '') = ''
  and system_paper in ('營建署/中心系統', '是否待租約');