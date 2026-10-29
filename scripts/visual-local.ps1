# Local visual QA on Windows: serves dist/ on a private port, runs Playwright against it, and
# stops only the server it started. Usage (after `npm run build`):
#   powershell -File scripts/visual-local.ps1 [playwright args...]   (port: $env:PW_PORT, default 4391;
#   a busy port is replaced by a free one picked by the OS)
$PwArgs = $args
$Port = if ($env:PW_PORT) { [int]$env:PW_PORT } else { 4391 }
# If that port is taken (another preview, another session), let the OS hand out a free one.
# Never stop whatever holds the port: it isn't ours.
function Test-PortFree([int]$p) {
  try { $l = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $p); $l.Start(); $l.Stop(); return $true } catch { return $false }
}
if (-not (Test-PortFree $Port)) {
  $l = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0); $l.Start()
  $free = $l.LocalEndpoint.Port; $l.Stop()
  Write-Host "port $Port is in use; using free port $free"
  $Port = $free
}
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$server = Start-Process -FilePath node -ArgumentList 'node_modules/vite/bin/vite.js', 'preview', '--port', $Port, '--strictPort', '--host', '127.0.0.1' -PassThru -WindowStyle Hidden
try {
  $ready = $false
  for ($i = 0; $i -lt 60 -and -not $ready; $i++) {
    Start-Sleep -Milliseconds 500
    try { $ready = (Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$Port/" -TimeoutSec 2).StatusCode -eq 200 } catch { }
  }
  if (-not $ready) { Write-Error "preview server did not start on port $Port"; exit 1 }
  $env:PW_BASE_URL = "http://127.0.0.1:$Port"
  & node node_modules/@playwright/test/cli.js test @PwArgs 2>&1 | ForEach-Object { "$_" }
  $rc = $LASTEXITCODE
} finally {
  if (-not $server.HasExited) { Stop-Process -Id $server.Id -Force }
}
exit $rc
