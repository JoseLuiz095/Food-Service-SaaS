param([Parameter(Mandatory=$true)][string]$ProjectRoot)
try { $root = (Resolve-Path $ProjectRoot).Path } catch { exit 0 }
$procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($root, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 }
foreach ($p in $procs) {
  try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; Write-Host "Encerrado Node PID $($p.ProcessId) deste projeto." } catch {}
}
