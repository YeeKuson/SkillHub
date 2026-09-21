# 从各 agent 本机安装目录提取官方 logo，输出 PNG 到 app/public/agents/
# 来源优先级：官方 png > exe 嵌入图标（SHDefExtractIcon 48px）
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class IconExtract {
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    public static extern int SHDefExtractIcon(string iconPath, int iconIndex, uint flags, out IntPtr hIconLarge, out IntPtr hIconSmall, uint size);
    [DllImport("user32.dll")]
    public static extern bool DestroyIcon(IntPtr hIcon);
}
"@

function Save-IconPng([string]$exePath, [string]$outPath, [int]$size = 48) {
    Add-Type -AssemblyName System.Drawing
    $hLarge = [IntPtr]::Zero
    $hSmall = [IntPtr]::Zero
    $r = [IconExtract]::SHDefExtractIcon($exePath, 0, 0, [ref]$hLarge, [ref]$hSmall, $size)
    if ($r -ne 0 -or $hLarge -eq [IntPtr]::Zero) { throw "SHDefExtractIcon 失败: $exePath ($r)" }
    try {
        $icon = [System.Drawing.Icon]::FromHandle($hLarge)
        $bmp = $icon.ToBitmap()
        $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        $icon.Dispose()
    } finally {
        [void][IconExtract]::DestroyIcon($hLarge)
    }
    Write-Host "OK $outPath"
}

$out = Join-Path $PSScriptRoot "..\public\agents"
New-Item -ItemType Directory -Force -Path $out | Out-Null

# ZCode：官方 png
Copy-Item "D:\zcode\resources\icon.png" (Join-Path $out "zcode.png") -Force
Write-Host "OK $out\zcode.png (官方 icon.png)"

# Codex：Store 应用 assets 的高清 unplated 图标（assets/icon.png 是占位小图，不要用）
$codexAssets = "C:\Program Files\WindowsApps\OpenAI.Codex_*\assets"
$codexIcon = Get-ChildItem "$codexAssets\Square44x44Logo.targetsize-256_altform-unplated.png" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($codexIcon) {
    Copy-Item $codexIcon.FullName (Join-Path $out "codex.png") -Force
    Write-Host "OK $out\codex.png (Store unplated 256)"
} else {
    Write-Host "SKIP codex：未找到 WindowsApps 下的 Codex 包（路径随版本号变化）"
}

# 豆包：官网 favicon CDN 的 192px（exe 提取的图标不对）
$doubaoUrl = "https://lf-flow-web-cdn.doubao.com/obj/flow-doubao/favicon/new-doubao/192x192.png"
Invoke-WebRequest -Uri $doubaoUrl -OutFile (Join-Path $out "doubao.png") -UseBasicParsing
Write-Host "OK $out\doubao.png (官网 CDN 192)"

# Claude：exe 嵌入图标
Save-IconPng "D:\ClaudeCode\node_modules\@anthropic-ai\claude-code\bin\claude.exe" (Join-Path $out "claude.png")

# WorkBuddy：exe 嵌入图标
Save-IconPng "D:\workbuddy\WorkBuddy.exe" (Join-Path $out "workbuddy.png")
