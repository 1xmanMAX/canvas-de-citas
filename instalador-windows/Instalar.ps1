# Instalador de Canvas de Citas para Windows.
# - Accesos directos a la app (Comet, Chrome o Edge en modo app) en el Escritorio y en Inicio.
# - Servidor de sincronización (canvas-sincro.exe): arranca solo con Windows, sin ventana, y deja
#   que el celular y la laptop se sincronicen por el Wi-Fi con la carpeta de datos de esta PC.
# - Deja el código de vinculación en el Escritorio y en el portapapeles.
# No necesita permisos de administrador (salvo, opcional, la regla del firewall).

$ErrorActionPreference = 'Stop'
$aqui = $PSScriptRoot
$destino = Join-Path $env:LOCALAPPDATA 'CanvasDeCitas'
$url = 'https://1xmanmax.github.io/canvas-de-citas/'
$puerto = 47481
New-Item -ItemType Directory -Force $destino | Out-Null

Write-Host ''
Write-Host '=== Canvas de Citas: instalación ===' -ForegroundColor Cyan

# 1. Carpeta de datos (la misma que eliges en la app: Configuración → Carpeta de almacenamiento).
$guardada = Join-Path $destino 'carpeta.txt'
$sugerida = if (Test-Path $guardada) { (Get-Content $guardada -Raw).Trim() } elseif (Test-Path 'F:\THE FORGE\THESIS\New folder') { 'F:\THE FORGE\THESIS\New folder' } else { [Environment]::GetFolderPath('MyDocuments') }
Add-Type -AssemblyName System.Windows.Forms
$dialogo = New-Object System.Windows.Forms.FolderBrowserDialog
$dialogo.Description = 'Elige la carpeta de datos de Canvas de Citas (donde están proyectos.json, fuentes.json y citas.json)'
$dialogo.SelectedPath = $sugerida
if ($dialogo.ShowDialog() -ne 'OK') { Write-Host 'Instalación cancelada.'; exit 1 }
$carpeta = $dialogo.SelectedPath
if (-not (Test-Path (Join-Path $carpeta 'proyectos.json'))) {
  Write-Warning "La carpeta no tiene proyectos.json todavía. Elígela también en la app (Configuración → Carpeta de almacenamiento) para que la app guarde ahí."
}
Set-Content -Path $guardada -Value $carpeta -Encoding UTF8

# 2. Copiar el servidor de sincronización y el ícono (deteniendo el anterior si está corriendo).
Get-Process canvas-sincro -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 400
Copy-Item (Join-Path $aqui 'canvas-sincro.exe') (Join-Path $destino 'canvas-sincro.exe') -Force
Copy-Item (Join-Path $aqui 'icon.ico') (Join-Path $destino 'icon.ico') -Force
$exe = Join-Path $destino 'canvas-sincro.exe'
$claveArchivo = Join-Path $destino 'sincro-clave.txt'

# 3. Arranque con Windows sin ventana (un .vbs lanza el servidor oculto).
$vbs = Join-Path $destino 'arrancar-sincro.vbs'
$cmd = "`"$exe`" --carpeta `"$carpeta`" --puerto $puerto --clave-archivo `"$claveArchivo`""
Set-Content -Path $vbs -Encoding Unicode -Value ("CreateObject(""WScript.Shell"").Run """ + $cmd.Replace('"', '""') + """, 0, False")
Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'CanvasDeCitasSincro' -Value "wscript.exe `"$vbs`""

# 4. Firewall: permitir el puerto en redes privadas (pide permiso de administrador; si se
#    rechaza, Windows preguntará la primera vez que el celular se conecte).
$regla = Get-NetFirewallRule -DisplayName 'Canvas de Citas (sincronizar)' -ErrorAction SilentlyContinue
if (-not $regla) {
  try {
    Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList "-NoProfile -Command New-NetFirewallRule -DisplayName 'Canvas de Citas (sincronizar)' -Direction Inbound -Protocol TCP -LocalPort $puerto -Profile Private -Action Allow"
  } catch { Write-Warning 'No se agregó la regla del firewall: Windows preguntará al conectarse el celular (elige "Redes privadas").' }
}

# 5. Arrancar ya.
Start-Process wscript.exe -ArgumentList "`"$vbs`""
for ($i = 0; $i -lt 20 -and -not (Test-Path $claveArchivo); $i++) { Start-Sleep -Milliseconds 250 }

# 6. Accesos directos a la app (Comet preferido).
$navegadores = @(
  "$env:LOCALAPPDATA\Perplexity\Comet\Application\comet.exe",
  "$env:ProgramFiles\Perplexity\Comet\Application\comet.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$navegador = $navegadores | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($navegador) {
  $shell = New-Object -ComObject WScript.Shell
  foreach ($d in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
    $lnk = $shell.CreateShortcut((Join-Path $d 'Canvas de Citas.lnk'))
    $lnk.TargetPath = $navegador
    $lnk.Arguments = "--app=$url"
    $lnk.IconLocation = "$(Join-Path $destino 'icon.ico'),0"
    $lnk.Description = 'Canvas de Citas: fuentes, citas e ideas de la tesis'
    $lnk.WorkingDirectory = Split-Path $navegador
    $lnk.Save()
  }
  Write-Host "Accesos directos creados (abren con $(Split-Path $navegador -Leaf))."
} else {
  Write-Warning "No se encontró Comet, Chrome ni Edge: abre $url en tu navegador."
}

# 7. Código de vinculación para el celular y la laptop.
$ruta = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1
$ip = if ($ruta) { (Get-NetIPAddress -InterfaceIndex $ruta.ifIndex -AddressFamily IPv4 | Select-Object -First 1).IPAddress } else { '127.0.0.1' }
if (Test-Path $claveArchivo) {
  $clave = (Get-Content $claveArchivo -Raw).Trim()
  $codigo = "canvas-sync://${ip}:$puerto/#$clave"
  $txt = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Canvas de Citas - codigo para vincular.txt'
  Set-Content -Path $txt -Encoding UTF8 -Value @(
    'Código de vinculación de Canvas de Citas (no lo compartas: da acceso a tus datos).',
    '',
    $codigo,
    '',
    'En el celular o la laptop: Configuración → Sincronizar con la PC → pega este código.',
    'Si tu PC cambia de IP, la app la busca sola en la red.'
  )
  try { Set-Clipboard -Value $codigo } catch {}
  Write-Host ''
  Write-Host 'Listo. Código de vinculación (copiado al portapapeles y guardado en el Escritorio):' -ForegroundColor Green
  Write-Host "  $codigo"
} else {
  Write-Warning "El servidor de sincronización no arrancó. Prueba ejecutando: `"$exe`" --carpeta `"$carpeta`" --clave-archivo `"$claveArchivo`""
}
Write-Host ''
