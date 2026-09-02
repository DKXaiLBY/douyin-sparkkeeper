# 火花守护 SparkKeeper - 静默后台启动（供开机自启用，无任何窗口）
# 开机自启由设置页「开机自启」开关控制，它会向注册表写入一条指向本脚本的命令。
# 本脚本的作用：隐藏窗口启动前后端服务，不等待、不打开浏览器。
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $root

# 已运行时直接退出（避免开机 + 手动双击导致双实例）
$busy = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($null -ne $busy) { exit 0 }

Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-Command","cd '$root'; npm run dev:server"
Start-Sleep -Seconds 3
Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-Command","cd '$root'; npm run dev:web"
