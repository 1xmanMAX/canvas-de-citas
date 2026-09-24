# Crea accesos directos "Canvas de Citas" en el Escritorio y en el menú Inicio.
# Abren la app publicada en su propia ventana (modo app de Chrome o Edge): sin servidor local,
# y funciona sin conexión gracias al service worker.
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\crear-acceso-directo.ps1

$url = 'https://1xmanmax.github.io/canvas-de-citas/'

$navegadores = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$navegador = $navegadores | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $navegador) { Write-Error 'No se encontró Chrome ni Edge.'; exit 1 }

# El ícono se copia a una carpeta fija para que el acceso directo no dependa del repo.
$carpeta = Join-Path $env:LOCALAPPDATA 'CanvasDeCitas'
New-Item -ItemType Directory -Force $carpeta | Out-Null
$icono = Join-Path $carpeta 'icon.ico'
Copy-Item (Join-Path $PSScriptRoot '..\public\icon.ico') $icono -Force

$shell = New-Object -ComObject WScript.Shell
$destinos = @(
  [Environment]::GetFolderPath('Desktop'),
  [Environment]::GetFolderPath('Programs')
)
foreach ($d in $destinos) {
  $ruta = Join-Path $d 'Canvas de Citas.lnk'
  $lnk = $shell.CreateShortcut($ruta)
  $lnk.TargetPath = $navegador
  $lnk.Arguments = "--app=$url"
  $lnk.IconLocation = "$icono,0"
  $lnk.Description = 'Canvas de Citas: gestor visual de citas de la tesis'
  $lnk.WorkingDirectory = Split-Path $navegador
  $lnk.Save()
  Write-Output "Acceso directo creado: $ruta"
}
Write-Output "Abre con: $navegador"

# Receptor para pasar archivos por wifi desde el celular y PixPin (arranca solo con Windows).
$receptor = Join-Path $PSScriptRoot 'instalar-receptor.ps1'
if (Test-Path $receptor) {
  try { & $receptor } catch { Write-Warning "No se pudo instalar el receptor: $_" }
}
