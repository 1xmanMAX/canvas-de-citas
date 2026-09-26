# Quita Canvas de Citas de esta PC: servidor de sincronización, arranque con Windows, regla del
# firewall y accesos directos. NO borra tu carpeta de datos ni los datos de la app.
$destino = Join-Path $env:LOCALAPPDATA 'CanvasDeCitas'
Get-Process canvas-sincro -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'CanvasDeCitasSincro' -ErrorAction SilentlyContinue
foreach ($d in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  Remove-Item (Join-Path $d 'Canvas de Citas.lnk') -ErrorAction SilentlyContinue
}
Remove-Item (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Canvas de Citas - codigo para vincular.txt') -ErrorAction SilentlyContinue
foreach ($f in 'canvas-sincro.exe', 'arrancar-sincro.vbs', 'icon.ico') { Remove-Item (Join-Path $destino $f) -ErrorAction SilentlyContinue }
if (Get-NetFirewallRule -DisplayName 'Canvas de Citas (sincronizar)' -ErrorAction SilentlyContinue) {
  try { Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList "-NoProfile -Command Remove-NetFirewallRule -DisplayName 'Canvas de Citas (sincronizar)'" } catch {}
}
Write-Host 'Canvas de Citas quitado. Tus datos siguen en tu carpeta (y la clave de vinculación en' $destino ').'
