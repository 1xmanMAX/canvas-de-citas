# Instalador de Canvas de Citas para Windows.
# - "Canvas de Citas.exe": la app en su propia ventana (siempre la última versión publicada), con
#   cada proyecto en su carpeta y sin avisos de permisos.
# - Sincronización por Wi-Fi (sin internet) con el celular y la laptop: arranca sola con Windows,
#   sin ventana. Vincular el celular: en la app, Configuración -> Vincular celular (código QR).
# - La primera vez registra tu carpeta de datos actual como la carpeta de tu proyecto.
# No necesita permisos de administrador (salvo, opcional, la regla del firewall).

param([switch]$SinFirewall) # -SinFirewall: no pedir permiso de administrador (instalación desatendida)

$ErrorActionPreference = 'Stop'
$aqui = $PSScriptRoot
$destino = Join-Path $env:LOCALAPPDATA 'CanvasDeCitas'
$exe = Join-Path $destino 'Canvas de Citas.exe'
$registro = Join-Path $destino 'proyectos-abiertos.json'
$puerto = 47481
New-Item -ItemType Directory -Force $destino | Out-Null

Write-Host ''
Write-Host '=== Canvas de Citas: instalación ===' -ForegroundColor Cyan

# 1. Detener versiones anteriores (servidor viejo y la app) y quitar su arranque automático.
Get-Process canvas-sincro, 'Canvas de Citas', canvas-de-citas -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500
Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'CanvasDeCitasSincro' -ErrorAction SilentlyContinue
foreach ($f in 'canvas-sincro.exe', 'arrancar-sincro.vbs') { Remove-Item (Join-Path $destino $f) -ErrorAction SilentlyContinue }

# 2. Copiar la app.
Copy-Item (Join-Path $aqui 'Canvas de Citas.exe') $exe -Force
Copy-Item (Join-Path $aqui 'icon.ico') (Join-Path $destino 'icon.ico') -Force

# 3. La primera vez: registrar la carpeta de datos que ya usabas (un proyecto por carpeta).
if (-not (Test-Path $registro)) {
  $guardada = Join-Path $destino 'carpeta.txt'
  $sugerida = if (Test-Path $guardada) { (Get-Content $guardada -Raw).Trim() } elseif (Test-Path 'F:\THE FORGE\THESIS\New folder\proyectos.json') { 'F:\THE FORGE\THESIS\New folder' } else { '' }
  if ($sugerida -and (Test-Path (Join-Path $sugerida 'proyectos.json'))) {
    $datos = Get-Content (Join-Path $sugerida 'proyectos.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $ids = @($datos.proyectos | ForEach-Object { $_.id })
    $entrada = [ordered]@{ clave = 'inicial'; nombre = (Split-Path $sugerida -Leaf); carpeta = $sugerida; proyectos = $ids; biblioteca = $true; sincronizar = $true }
    # UTF-8 sin BOM (el servidor lee JSON estricto).
    [IO.File]::WriteAllText($registro, (ConvertTo-Json -InputObject @($entrada) -Depth 5), (New-Object Text.UTF8Encoding $false))
    Write-Host "Tu carpeta de datos quedó registrada: $sugerida ($($ids.Count) proyecto(s))."
  } else {
    Write-Host 'Sin carpeta anterior: en la app usa "Nuevo proyecto" o "Abrir proyecto".'
  }
}

# 4. Sincronización por Wi-Fi al iniciar Windows (sin ventana).
Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'CanvasDeCitas' -Value "`"$exe`" --segundo-plano"

# 5. Firewall: permitir el puerto en redes privadas (pide permiso de administrador; si se
#    rechaza, Windows preguntará la primera vez que el celular se conecte).
$regla = Get-NetFirewallRule -DisplayName 'Canvas de Citas (sincronizar)' -ErrorAction SilentlyContinue
if (-not $regla -and -not $SinFirewall) {
  try {
    Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList "-NoProfile -Command New-NetFirewallRule -DisplayName 'Canvas de Citas (sincronizar)' -Direction Inbound -Protocol TCP -LocalPort $puerto -Profile Private -Action Allow"
  } catch { Write-Warning 'No se agregó la regla del firewall: Windows preguntará al conectarse el celular (elige "Redes privadas").' }
}

# 6. Arrancar ya la sincronización.
Start-Process $exe -ArgumentList '--segundo-plano'

# 7. Accesos directos (Escritorio e Inicio) a la app.
$shell = New-Object -ComObject WScript.Shell
foreach ($d in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  $lnk = $shell.CreateShortcut((Join-Path $d 'Canvas de Citas.lnk'))
  $lnk.TargetPath = $exe
  $lnk.Arguments = ''
  $lnk.IconLocation = "$exe,0"
  $lnk.Description = 'Canvas de Citas: fuentes, citas e ideas de la tesis'
  $lnk.WorkingDirectory = $destino
  $lnk.Save()
}

Write-Host ''
Write-Host 'Listo. Abre "Canvas de Citas" desde el Escritorio o el menú Inicio.' -ForegroundColor Green
Write-Host 'Para vincular el celular: en la app, Configuración -> Vincular celular (mismo Wi-Fi, sin internet).'
Write-Host ''
