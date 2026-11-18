# Deploy toolbox to Cloudflare Pages preview (fixed URL).
# Usage: powershell -ExecutionPolicy Bypass -File .\scripts\deploy-preview.ps1
#
# Includes docs/forms（表單）與 docs/weekly-meeting（業務周會），
# 仍略過超大 docs/*（photo-guides、collection-flow 等）。

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$tmp = Join-Path (Split-Path -Parent $Root) '.tmp-pages-preview'
if (Test-Path -LiteralPath $tmp) {
    Remove-Item -LiteralPath $tmp -Recurse -Force
}
New-Item -ItemType Directory -Path $tmp | Out-Null

Write-Host '>> robocopy site (exclude docs / supabase / git)'
robocopy $Root $tmp /E `
    /XD .git node_modules .wrangler supabase docs .tmp* .cursor `
    /XF TW-Kai-98_1.ttf .tmp-login-user.txt `
    /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { exit $LASTEXITCODE }

$formsSrc = Join-Path $Root 'docs\forms'
$formsDst = Join-Path $tmp 'docs\forms'
Write-Host '>> robocopy docs/forms (table downloads)'
robocopy $formsSrc $formsDst /E `
    /XD __pycache__ `
    /XF _exam_preview.png _make-case-opinion-exam.py `
    /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { exit $LASTEXITCODE }

$wmSrc = Join-Path $Root 'docs\weekly-meeting'
$wmDst = Join-Path $tmp 'docs\weekly-meeting'
Write-Host '>> robocopy docs/weekly-meeting (business weekly files)'
robocopy $wmSrc $wmDst /E `
    /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { exit $LASTEXITCODE }
if (-not (Test-Path -LiteralPath (Join-Path $wmDst 'manifest.json'))) {
    Write-Error 'Missing docs/weekly-meeting/manifest.json in deploy bundle'
}

$checklist = Join-Path $formsDst '複審檢核表'
if (-not (Test-Path -LiteralPath (Join-Path $checklist '代管複審檢核表.pdf'))) {
    Write-Error 'Missing 代管複審檢核表.pdf in deploy bundle'
}
if (-not (Test-Path -LiteralPath (Join-Path $checklist '包租複審檢核表.pdf'))) {
    Write-Error 'Missing 包租複審檢核表.pdf in deploy bundle'
}

Write-Host '>> wrangler pages deploy (branch main → fixed preview URL)'
Set-Location $tmp
npx wrangler pages deploy . --project-name=skyfun-toolbox-preview --branch main --commit-dirty=true
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'Preview: https://skyfun-toolbox-preview.pages.dev/'
