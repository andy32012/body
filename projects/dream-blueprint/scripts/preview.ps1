$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$port = 4173
$url = "http://localhost:$port/"

function Show-Addresses {
    Write-Host "電腦網址　$url"
    try {
        $routes = Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' |
            Sort-Object RouteMetric |
            Select-Object -ExpandProperty InterfaceIndex -Unique
        foreach ($index in $routes) {
            $adapter = Get-NetAdapter -InterfaceIndex $index -ErrorAction SilentlyContinue
            if (-not $adapter -or $adapter.Status -ne 'Up' -or -not $adapter.HardwareInterface) { continue }
            $addresses = Get-NetIPAddress -InterfaceIndex $index -AddressFamily IPv4 -ErrorAction SilentlyContinue
            foreach ($address in $addresses) {
                Write-Host ("手機網址（{0}）　http://{1}:{2}/" -f $adapter.Name, $address.IPAddress, $port)
            }
        }
    } catch { Write-Host "要找手機網址，可以在 Windows 終端機執行 ipconfig，查看 Wi-Fi 的 IPv4 位址。" }
}

try {
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw '請先安裝 Node.js LTS（含 npm），完成後重新開啟這個檔案。'
    }
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
        $isDream = $false
        try {
            $page = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 3
            $isDream = $page.Content -match '<title>[^<]*夢想藍圖'
        } catch {}
        if (-not $isDream) { throw "連接埠 $port 已被其他程式使用。請關閉佔用這個連接埠的程式，再重新開啟。" }
        Show-Addresses
        Start-Process $url
        Write-Host '夢想藍圖已在執行。更新程式碼後，請關掉原來的預覽視窗再重新開啟。'
        Read-Host '按 Enter 關閉這個提示視窗'
        exit 0
    }
    if (-not (Test-Path -LiteralPath '.\node_modules\vite\bin\vite.js')) {
        Write-Host '第一次開啟，正在安裝需要的工具……'
        if (Test-Path -LiteralPath '.\package-lock.json') { & npm.cmd ci } else { & npm.cmd install }
        if ($LASTEXITCODE -ne 0) { throw '安裝工具未完成。請檢查網路後重新開啟。' }
    }
    Write-Host '正在準備夢想藍圖……'
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw '建立網站未完成，請查看上方訊息。' }
    Show-Addresses
    Write-Host '手機與電腦連上同一個 Wi-Fi，即可用手機瀏覽器輸入上方手機網址。'
    Write-Host '使用期間請保留這個視窗。按 Ctrl+C 可停止預覽。'
    & node.exe '.\node_modules\vite\bin\vite.js' preview --host 0.0.0.0 --port $port --strictPort --open
    exit $LASTEXITCODE
} catch {
    Write-Host $_.Exception.Message
    exit 1
}
