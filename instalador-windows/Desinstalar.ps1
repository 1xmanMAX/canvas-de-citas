# Quita Canvas de Citas de esta PC: la app, su arranque con Windows, la regla del firewall y los
# accesos directos. NO borra las carpetas de tus proyectos ni la clave de vinculación.
$destino = Join-Path $env:LOCALAPPDATA 'CanvasDeCitas'
Get-Process 'Canvas de Citas', canvas-de-citas, canvas-sincro -ErrorAction SilentlyContinue | Stop-Process -Force
foreach ($n in 'CanvasDeCitas', 'CanvasDeCitasSincro') {
  Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name $n -ErrorAction SilentlyContinue
}
foreach ($d in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  Remove-Item (Join-Path $d 'Canvas de Citas.lnk') -ErrorAction SilentlyContinue
}
Remove-Item (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Canvas de Citas - codigo para vincular.txt') -ErrorAction SilentlyContinue
foreach ($f in 'Canvas de Citas.exe', 'canvas-sincro.exe', 'arrancar-sincro.vbs', 'icon.ico') { Remove-Item (Join-Path $destino $f) -ErrorAction SilentlyContinue }
if (Get-NetFirewallRule -DisplayName 'Canvas de Citas (sincronizar)' -ErrorAction SilentlyContinue) {
  try { Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList "-NoProfile -Command Remove-NetFirewallRule -DisplayName 'Canvas de Citas (sincronizar)'" } catch {}
}
Write-Host 'Canvas de Citas quitado. Tus proyectos siguen en sus carpetas (y el registro y la clave en' $destino ').'
