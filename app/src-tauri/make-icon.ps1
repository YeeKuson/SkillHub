# SkillHub 应用图标生成脚本：1024x1024 PNG（深蓝渐变圆角底 + 白色 S + 橙色同步环）
# 用法: powershell -ExecutionPolicy Bypass -File make-icon.ps1
# 生成 app-icon.png 后执行: npx tauri icon app-icon.png 产出全套 icons/
Add-Type -AssemblyName System.Drawing

$size = 1024
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.Color]::Transparent)

function New-RoundRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = 2 * $r
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

# 圆角底 + 对角渐变
$bgPath = New-RoundRect 28 28 968 968 190
$c1 = [System.Drawing.Color]::FromArgb(255, 74, 122, 250)
$c2 = [System.Drawing.Color]::FromArgb(255, 34, 58, 164)
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(60, 40)), (New-Object System.Drawing.Point(964, 984)), $c1, $c2)
$g.FillPath($bgBrush, $bgPath)

# 白色 S（稍偏左上，给右下角同步环留位）
$font = New-Object System.Drawing.Font('Segoe UI', 430, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center
$g.DrawString('S', $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF(-20, -30, 900, 900)), $sf)

# 橙色同步环：两段对置弧 + 箭头
$orange = [System.Drawing.Color]::FromArgb(255, 255, 159, 67)
$ringPen = New-Object System.Drawing.Pen($orange, 46)
$ringBrush = New-Object System.Drawing.SolidBrush($orange)

function Draw-SyncArc($g, $pen, $brush, [float]$cx, [float]$cy, [float]$r, [float]$startDeg, [float]$sweepDeg) {
    $rect = New-Object System.Drawing.RectangleF(($cx - $r), ($cy - $r), (2 * $r), (2 * $r))
    $g.DrawArc($pen, $rect, $startDeg, $sweepDeg)
    $endRad = [Math]::PI * ($startDeg + $sweepDeg) / 180
    $ex = $cx + $r * [Math]::Cos($endRad)
    $ey = $cy + $r * [Math]::Sin($endRad)
    $tx = [Math]::Cos($endRad + [Math]::PI / 2)
    $ty = [Math]::Sin($endRad + [Math]::PI / 2)
    $nx = [Math]::Cos($endRad)
    $ny = [Math]::Sin($endRad)
    $pts = @(
        (New-Object System.Drawing.PointF(($ex + $tx * 52), ($ey + $ty * 52)))
        (New-Object System.Drawing.PointF(($ex - $tx * 8 + $nx * 32), ($ey - $ty * 8 + $ny * 32)))
        (New-Object System.Drawing.PointF(($ex - $tx * 8 - $nx * 32), ($ey - $ty * 8 - $ny * 32)))
    )
    $g.FillPolygon($brush, $pts)
}

Draw-SyncArc $g $ringPen $ringBrush 806 806 140 -60 170
Draw-SyncArc $g $ringPen $ringBrush 806 806 140 120 170

$g.Dispose()
$out = Join-Path $PSScriptRoot 'app-icon.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "生成 $out"
