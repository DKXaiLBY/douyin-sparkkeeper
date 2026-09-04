# 火花守护 SparkKeeper - 一键启动（Windows PowerShell）
# 用法：双击同目录的「启动.bat」即可，或在 PowerShell 里执行： .\启动.ps1
#
# 为什么用 PowerShell 而不是纯 .bat：
# Windows 的 cmd 默认以 GBK(936) 解析批处理文件，中文提示会变成乱码并被当成命令执行。
# PowerShell 原生支持 UTF-8，中文显示正常，且网络/进程管理能力更强。

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $root

function Write-Line($text = "") { Write-Host $text }

Write-Line ""
Write-Line "  ============================================"
Write-Line "     火花守护 SparkKeeper  -  一键启动"
Write-Line "  ============================================"
Write-Line ""

# ---------- 1. 检测 Node.js ----------
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Line "  [错误] 没有检测到 Node.js"
    Write-Line ""
    Write-Line "  本程序需要 Node.js 22 或更高版本才能运行。"
    Write-Line ""
    Write-Line "  解决办法："
    Write-Line "     1. 打开 https://nodejs.org/"
    Write-Line "     2. 下载左边的 LTS 版本（绿色按钮）"
    Write-Line "     3. 一路下一步安装完"
    Write-Line "     4. 重新双击「启动.bat」"
    Write-Line ""
    $yn = Read-Host "  现在打开下载页面？(Y/N)"
    if ($yn -eq "Y" -or $yn -eq "y") { Start-Process "https://nodejs.org/" }
    Write-Line ""
    Read-Host "  按回车键退出"
    exit 1
}

$nodeVer = (node -v 2>$null) -replace '^v', ''
$parts = $nodeVer.Split('.')
$major = 0; $minor = 0
[void][int]::TryParse($parts[0], [ref]$major)
if ($parts.Length -gt 1) { [void][int]::TryParse($parts[1], [ref]$minor) }

if ($major -lt 22) {
    Write-Line "  [错误] 当前 Node.js 版本过低：v$nodeVer"
    Write-Line ""
    Write-Line "  本程序需要 Node.js 22 或更高版本（better-sqlite3 要求），请到 https://nodejs.org/ 更新。"
    Write-Line ""
    $yn2 = Read-Host "  现在打开下载页面？(Y/N)"
    if ($yn2 -eq "Y" -or $yn2 -eq "y") { Start-Process "https://nodejs.org/" }
    Write-Line ""
    Read-Host "  按回车键退出"
    exit 1
}
Write-Line "  [OK]  Node.js 版本 v$nodeVer"

# ---------- 2. 检测依赖 ----------
$needInstall = $false
if (-not (Test-Path "server\node_modules")) { $needInstall = $true }
if (-not (Test-Path "web\node_modules"))    { $needInstall = $true }
if (-not (Test-Path "node_modules"))        { $needInstall = $true }

if ($needInstall) {
    Write-Line ""
    Write-Line "  首次运行，正在安装依赖（约 1-3 分钟，请耐心等待）..."
    Write-Line "  --------------------------------------------"
    npm run install:all
    if ($LASTEXITCODE -ne 0) {
        Write-Line ""
        Write-Line "  [错误] 依赖安装失败。"
        Write-Line "  请检查网络后重新运行；若反复失败，请手动执行：npm run install:all"
        Write-Line ""
        Read-Host "  按回车键退出"
        exit 1
    }
    Write-Line ""
    Write-Line "  [OK]  依赖安装完成"
} else {
    Write-Line "  [OK]  依赖已安装"
}

# ---------- 3. 端口占用检测 ----------
function Test-Port($port) {
    $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    return ($null -ne $c)
}

if ((Test-Port 3000) -or (Test-Port 5173)) {
    Write-Line ""
    Write-Line "  [提示] 检测到服务可能已在运行（端口 3000 或 5173 被占用）。"
    Write-Line ""
    Write-Line "     1 = 关闭已有服务并重新启动（推荐）"
    Write-Line "     2 = 直接打开网页（服务已在跑）"
    Write-Line "     3 = 退出"
    Write-Line ""
    $choice = Read-Host "  请选择 1/2/3"
    if ($choice -eq "1") {
        Write-Line "  正在关闭已有服务..."
        & "$root\停止.ps1" | Out-Null
        Start-Sleep -Seconds 2
    } elseif ($choice -eq "2") {
        Start-Process "http://localhost:5173"
        Write-Line "  已打开浏览器。"
        Read-Host "  按回车键退出"
        exit 0
    } else {
        exit 0
    }
}

# ---------- 4. 启动后端与前端 ----------
Write-Line ""
Write-Line "  正在启动服务（会弹出两个窗口，分别是后端和前端）..."
Write-Line "  --------------------------------------------"

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; npm run dev:server"
Start-Sleep -Seconds 3
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; npm run dev:web"

# ---------- 5. 等待就绪 ----------
Write-Line ""
Write-Line "  正在等待服务启动（最多 60 秒）..."
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    $okBackend = $false
    $okFrontend = $false
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:3000/api/health" -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) { $okBackend = $true }
    } catch { $okBackend = $false }
    if (Test-Port 5173) { $okFrontend = $true }

    if ($okBackend -and $okFrontend) { $ready = $true; break }
    Write-Host "." -NoNewline
}
Write-Line ""
Write-Line ""

if (-not $ready) {
    Write-Line "  [警告] 等待超时，服务可能还没起来。"
    Write-Line "  请查看那两个窗口里的提示；若有红色报错，把内容反馈给开发者。"
    Write-Line "  也可以稍等几秒后手动打开： http://localhost:5173"
    Write-Line ""
    Read-Host "  按回车键退出"
    exit 1
}

# ---------- 6. 打开浏览器 ----------
Write-Line "  [OK]  服务已就绪"
Write-Line ""
Write-Line "  ============================================"
Write-Line "     启动成功！正在打开浏览器..."
Write-Line "  ============================================"
Write-Line ""
Write-Line "  接下来你只需要做三件事："
Write-Line "     1. 点「设置」"
Write-Line "     2. 点「扫码登录」，用抖音 App 扫一下"
Write-Line "     3. 勾选要续火花的好友"
Write-Line ""
Write-Line "  之后每天会自动发送，你不用再管。"
Write-Line ""
Write-Line "  --------------------------------------------"
Write-Line "  后端/前端那两个窗口不要关闭（可最小化）。"
Write-Line "  需要停止服务时，请运行：停止.bat"
Write-Line "  --------------------------------------------"
Write-Line ""

Start-Process "http://localhost:5173"

Write-Line "  按回车键关闭本窗口（不会影响已启动的服务）。"
Read-Host ""
exit 0
