#!/usr/bin/env bash
# Preparación de una sesión de Claude Code en la nube (claude.ai/code). Lo ejecuta el hook
# SessionStart de .claude/settings.json; en la PC de Max (sin CLAUDE_CODE_REMOTE) no hace nada.
set -euo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" != "true" ] && exit 0
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/..}"

# Dependencias de la app (Svelte + Vite + pruebas).
(cd app && npm ci --no-audit --no-fund --loglevel=error)

# Dependencias de la skill (PDFium para leer/convertir papers), por si se prueba en la nube.
(cd claude-skill/canvas-de-citas && npm install --no-audit --no-fund --loglevel=error) || true

# Chrome para las pruebas de navegador (opcional: si la red no lo permite, siguen valiendo
# `npm test` y `npm run build`). Se instala una vez en ~/.cache/chrome.
if [ -z "${CHROME_PATH:-}" ] && ! ls ~/.cache/chrome/*/chrome-linux64/chrome >/dev/null 2>&1; then
  (npx --yes @puppeteer/browsers install chrome@stable --path ~/.cache/chrome >/dev/null 2>&1 \
    && echo "Chrome instalado para las pruebas de navegador") || echo "Aviso: no se pudo instalar Chrome (pruebas de navegador no disponibles)"
fi
CHROME_BIN=$(ls ~/.cache/chrome/*/chrome-linux64/chrome 2>/dev/null | head -1 || true)
[ -n "$CHROME_BIN" ] && [ -n "${CLAUDE_ENV_FILE:-}" ] && echo "export CHROME_PATH=$CHROME_BIN" >> "$CLAUDE_ENV_FILE"
echo "Entorno listo: app/ con dependencias instaladas."
