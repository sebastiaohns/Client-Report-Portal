/**
 * Runtime config — sobrescreva para apontar ao backend correto.
 * Em produção, gere este arquivo via CI/CD com as variáveis de ambiente.
 *
 * Exemplo nginx (produção):
 *   location /config.js {
 *     add_header Content-Type application/javascript;
 *     return 200 'window.FP_CONFIG = { apiUrl: "https://api.seudominio.com/api/v1" };';
 *   }
 */
window.FP_CONFIG = {
  apiUrl: 'http://localhost:8000/api/v1',
  appName: 'FinPlan',
  version: '1.0.0',
};
