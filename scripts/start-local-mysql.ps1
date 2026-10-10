$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
$dataPath = Join-Path $workspacePath '.local/mysql-test'
if (-not (Test-Path -LiteralPath (Join-Path $dataPath 'auto.cnf'))) {
    throw 'No existe la instancia local de esta sesión. Configura MySQL o usa Docker Compose siguiendo README.md.'
}
$mysqlExecutable = (Get-Command mysqld -ErrorAction Stop).Source
Write-Host 'MySQL local en 127.0.0.1:3310. Mantén esta terminal abierta; Ctrl+C detiene el servidor.'
& $mysqlExecutable --no-defaults "--datadir=$dataPath" --port=3310 --bind-address=127.0.0.1 --mysqlx=0 --console
