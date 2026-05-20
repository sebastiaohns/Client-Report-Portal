#!/bin/sh
# ──────────────────────────────────────────────────────────────────
# Injeta variáveis de ambiente no config.js antes do nginx subir.
# Executado automaticamente pelo nginx entrypoint (/docker-entrypoint.d/).
# ──────────────────────────────────────────────────────────────────

API_URL="${API_URL:-/api/v1}"
APP_NAME="${APP_NAME:-FinPlan}"
APP_VERSION="${APP_VERSION:-1.0.0}"

cat > /usr/share/nginx/html/config.js <<EOF
// Auto-generated at container startup — do not edit manually.
window.FP_CONFIG = {
  apiUrl:     "${API_URL}",
  appName:    "${APP_NAME}",
  version:    "${APP_VERSION}",
};
EOF

echo "[finplan] config.js injected — apiUrl=${API_URL}"
