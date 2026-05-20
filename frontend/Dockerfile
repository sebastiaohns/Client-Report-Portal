# ══════════════════════════════════════════════
#  Stage 1 — assets
#  Copia tudo (incluindo nginx.conf e entrypoint)
#  para um stage intermediário limpo.
# ══════════════════════════════════════════════
FROM alpine:3.19 AS assets

WORKDIR /static
COPY . .
RUN rm -f README.md .gitignore Dockerfile .dockerignore

# ══════════════════════════════════════════════
#  Stage 2 — nginx runtime
# ══════════════════════════════════════════════
FROM nginx:1.27-alpine AS runtime

LABEL org.opencontainers.image.title="FinPlan Frontend"
LABEL org.opencontainers.image.description="Vanilla HTML/CSS/JS served by nginx"

# Remove default nginx content
RUN rm -rf /usr/share/nginx/html/*

# Static files (html, css, js, config.js…)
COPY --from=assets /static /usr/share/nginx/html

# nginx config — copiado do stage assets para não depender do contexto
COPY --from=assets /static/nginx.conf /etc/nginx/conf.d/default.conf

# Entrypoint script — injeta API_URL no config.js na inicialização
COPY --from=assets /static/docker-entrypoint.sh /docker-entrypoint.d/40-inject-config.sh
RUN chmod +x /docker-entrypoint.d/40-inject-config.sh

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost/health || exit 1
