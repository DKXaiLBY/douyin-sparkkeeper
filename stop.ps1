# 火花守护 SparkKeeper - 停止服务（Windows PowerShell）
# 用法：双击同目录的「停止.bat」，或在 PowerShell 里执行： .\停止.ps1
#
# 只按端口关闭本项目服务（3000 后端 / 5173 前端），
# 不会误杀你电脑上其他 Node 项目。

$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host ""
Write-Host "  ============================================"
Write-Host "     火花守护 SparkKeeper  -  停止服务"
Write-Host "  ============================================"
Write-Host ""

$found = $false

function Stop-Port($port, $label) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
        foreach ($c in $conns) {
            $pidToKill = $c.OwningProcess
            Write-Host "  正在关闭 $label（端口 $port，进程 $pidToKill）"
            Stop-Process -Id $pidToKill -Force
            $script:found = $true
        }
    }
}

Stop-Port 3000 "后端服务"
Stop-Port 5173 "前端服务"

Write-Host ""
if ($found) {
    Write-Host "  [OK]  服务已全部停止。"
} else {
    Write-Host "  [OK]  当前没有运行中的服务。"
}
Write-Host ""
Write-Host "  重新启动请双击：启动.bat"
Write-Host ""
Read-Host "  按回车键退出"
exit 0
