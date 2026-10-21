# PPTX → 行政週會投影片 JPG（1280 寬）＋每張文字（供填投影片標題）
# 用法：powershell -ExecutionPolicy Bypass -File .\scripts\pptx-to-meeting.ps1 -Pptx "C:\path\a.pptx" -OutDir "assets\meetings\1151019" -TextOut "$env:TEMP\slides.json"
param(
    [Parameter(Mandatory = $true)][string]$Pptx,
    [Parameter(Mandatory = $true)][string]$OutDir,
    [Parameter(Mandatory = $true)][string]$TextOut
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$pp = New-Object -ComObject PowerPoint.Application
try {
    $pres = $pp.Presentations.Open($Pptx, $true, $false, $false)
    try {
        $w = $pres.PageSetup.SlideWidth
        $h = $pres.PageSetup.SlideHeight
        $pxW = 1280
        $pxH = [int][math]::Round($pxW * $h / $w)
        $result = @()
        $n = 0
        foreach ($slide in $pres.Slides) {
            $n++
            $name = '{0:D2}.jpg' -f $n
            $slide.Export((Join-Path (Resolve-Path $OutDir) $name), 'JPG', $pxW, $pxH)
            $texts = @()
            foreach ($shape in $slide.Shapes) {
                try {
                    if ($shape.HasTextFrame -and $shape.TextFrame.HasText) {
                        $t = ($shape.TextFrame.TextRange.Text -replace '\s+', ' ').Trim()
                        if ($t) { $texts += $t }
                    }
                } catch { }
            }
            $result += [pscustomobject]@{ n = $n; texts = $texts }
        }
        $result | ConvertTo-Json -Depth 4 | Out-File -Encoding utf8 $TextOut
        Write-Host "slides=$n size=${pxW}x${pxH} -> $OutDir ; texts -> $TextOut"
    } finally { $pres.Close() }
} finally { $pp.Quit() }
