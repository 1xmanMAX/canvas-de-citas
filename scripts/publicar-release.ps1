# Publica una versión oficial de Canvas de Citas en GitHub (Releases) desde la PC de Max.
# Necesita GitHub CLI (winget install GitHub.cli) con sesión iniciada (gh auth login).
#
# Uso (desde la raíz del repo, con los archivos de la versión en una carpeta):
#   powershell -ExecutionPolicy Bypass -File scripts\publicar-release.ps1 -Archivos "C:\ruta\release-v1.0.0"
#   ... -PublicarWeb   también actualiza la app publicada (rama gh-pages) con el zip web.
param(
  [Parameter(Mandatory = $true)][string]$Archivos,
  [string]$Version = 'v1.0.0',
  [switch]$PublicarWeb
)
$ErrorActionPreference = 'Stop'
$raiz = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $raiz

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { Write-Error 'Falta GitHub CLI: instálalo con  winget install GitHub.cli  y luego  gh auth login'; exit 1 }
gh auth status | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Error 'Inicia sesión en GitHub CLI con  gh auth login'; exit 1 }

$notas = Join-Path $raiz "docs\releases\$Version.md"
if (-not (Test-Path $notas)) { Write-Error "No existen las notas $notas"; exit 1 }
$lista = Get-ChildItem $Archivos -File | Where-Object { $_.Extension -in '.apk', '.zip' -or $_.Name -eq 'SHA256SUMS.txt' }
if (-not $lista) { Write-Error "No hay .apk ni .zip en $Archivos"; exit 1 }

# Comprobar las huellas antes de subir.
$sumas = Join-Path $Archivos 'SHA256SUMS.txt'
if (Test-Path $sumas) {
  foreach ($linea in Get-Content $sumas) {
    $hash, $nombre = $linea -split '\s+', 2
    $real = (Get-FileHash (Join-Path $Archivos $nombre.Trim()) -Algorithm SHA256).Hash.ToLower()
    if ($real -ne $hash) { Write-Error "La huella de $nombre no coincide: el archivo cambió."; exit 1 }
  }
  Write-Host 'Huellas SHA-256 correctas.'
}

git fetch origin main
Write-Host "Creando la versión $Version en GitHub..."
gh release create $Version @($lista.FullName) --target main --title "Canvas de Citas $($Version.TrimStart('v'))" --notes-file $notas
if ($LASTEXITCODE -ne 0) { Write-Error 'No se pudo crear la versión (¿ya existe? usa  gh release upload $Version <archivos> --clobber)'; exit 1 }

if ($PublicarWeb) {
  $web = $lista | Where-Object { $_.Name -like '*web*.zip' } | Select-Object -First 1
  if (-not $web) { Write-Error 'No está el zip web para publicar.'; exit 1 }
  $tmp = Join-Path $env:TEMP "canvas-gh-pages-$([guid]::NewGuid())"
  git worktree add $tmp origin/gh-pages
  try {
    Push-Location $tmp
    git checkout -B gh-pages origin/gh-pages
    git rm -rq .
    Expand-Archive $web.FullName -DestinationPath $tmp -Force
    git add -A
    git commit -m "Publicar Canvas de Citas $Version"
    git push origin gh-pages
    Pop-Location
    Write-Host 'App web publicada: https://1xmanmax.github.io/canvas-de-citas/'
  } finally { git worktree remove --force $tmp }
}
Write-Host "Listo: https://github.com/1xmanMAX/canvas-de-citas/releases/tag/$Version" -ForegroundColor Green
