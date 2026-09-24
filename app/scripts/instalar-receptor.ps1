# Instala el receptor de Canvas de Citas: pasar archivos por wifi con el celular y con PixPin.
# Lo copia a %LOCALAPPDATA%\CanvasDeCitas, hace que arranque solo con Windows (sin ventana)
# y lo inicia ya. Si hay Rust instalado, primero lo compila con los crates de PixPin.
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\instalar-receptor.ps1

$ErrorActionPreference = 'Stop'
$raiz = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$fuente = Join-Path $raiz 'receptor'
$binario = Join-Path $fuente 'bin\canvas-receptor.exe'

# Compilar si hay cargo.
$cargo = Get-Command cargo -ErrorAction SilentlyContinue
if (-not $cargo) { $cargo = Get-Command "$env:USERPROFILE\.cargo\bin\cargo.exe" -ErrorAction SilentlyContinue }
if ($cargo) {
  $destinoBuild = Join-Path $env:LOCALAPPDATA 'canvas-receptor-target'
  Write-Output 'Compilando el receptor...'
  & $cargo.Source build --release --manifest-path (Join-Path $fuente 'Cargo.toml') --target-dir $destinoBuild
  if ($LASTEXITCODE -eq 0) {
    New-Item -ItemType Directory -Force (Split-Path $binario) | Out-Null
    Copy-Item (Join-Path $destinoBuild 'release\canvas-receptor.exe') $binario -Force
  }
}
if (-not (Test-Path $binario)) { Write-Error "No está $binario y no se pudo compilar."; exit 1 }

# Detener el que esté corriendo (para poder reemplazarlo).
try { Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:47480/salir' -Headers @{ 'X-Canvas' = '1' } -TimeoutSec 3 | Out-Null; Start-Sleep -Milliseconds 700 } catch {}

$carpeta = Join-Path $env:LOCALAPPDATA 'CanvasDeCitas'
New-Item -ItemType Directory -Force $carpeta | Out-Null
$exe = Join-Path $carpeta 'canvas-receptor.exe'
Copy-Item $binario $exe -Force

# Arranque con Windows (solo para este usuario, no necesita administrador).
Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'CanvasDeCitasReceptor' -Value "`"$exe`""

Start-Process $exe
Start-Sleep -Milliseconds 800
try {
  $e = Invoke-RestMethod -Uri 'http://127.0.0.1:47480/estado' -TimeoutSec 3
  Write-Output "Receptor funcionando: esta PC aparece como '$($e.nombre)' ($($e.ip))."
  Write-Output 'La primera vez que el celular se conecte, Windows puede pedir permiso en el firewall: elige "Permitir" en redes privadas.'
} catch {
  Write-Warning 'El receptor no respondió. Revisa %LOCALAPPDATA%\CanvasDeCitas\receptor.log'
}
