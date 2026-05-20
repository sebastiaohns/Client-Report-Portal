# FinPlan — Frontend

Interface de gerenciamento de clientes para planejamento financeiro.  
Vanilla HTML + CSS + JS — zero dependências, roda direto no browser.

## Stack

- **HTML5** semântico
- **CSS3** com design system via variáveis (dark theme, tipografia editorial)
- **JavaScript** ES2020+, modular via IIFE, sem frameworks
- **localStorage** para persistência local (modo offline)
- **`js/api.js`** pronto para conectar ao backend FastAPI quando disponível

---

## Estrutura

```
financial-frontend/
├── index.html          # SPA única — todas as views
├── config.js           # Config runtime (URL do backend)
├── css/
│   └── main.css        # Design system completo
├── js/
│   ├── storage.js      # CRUD no localStorage
│   ├── api.js          # Cliente HTTP para o backend FastAPI
│   └── app.js          # Lógica da aplicação (navegação, forms, render)
└── .gitignore
```

---

## Como rodar

### Opção 1 — Abrir direto no browser
```bash
# Basta abrir o arquivo:
open index.html
# ou no Windows:
start index.html
```

### Opção 2 — Servidor local (recomendado, evita problemas de CORS)
```bash
# Python
python3 -m http.server 3000

# Node (npx)
npx serve .

# VSCode → instale "Live Server" e clique em "Go Live"
```

Acesse: `http://localhost:3000`

---

## Conectar ao backend FastAPI

1. Edite `config.js`:
```js
window.FP_CONFIG = {
  apiUrl: 'http://localhost:8000/api/v1',
};
```

2. Em `js/app.js`, substitua as chamadas `Storage.*` por `API.clients.*`:
```js
// Antes (localStorage):
const clients = Storage.getAll();

// Depois (backend):
const clients = await API.clients.list();
```

3. Para autenticação, use `API.auth.login(email, password)` e guarde os tokens — `api.js` já faz refresh automático.

---

## Features

| Feature | Status |
|---|---|
| Dashboard com métricas agregadas | ✅ |
| Lista de clientes (grid + list view) | ✅ |
| Busca em tempo real | ✅ |
| Formulário de criação de cliente | ✅ |
| Edição de cliente | ✅ |
| Exclusão com confirmação | ✅ |
| Contas de aposentadoria dinâmicas (IRA, Roth IRA, 401k, Pension) | ✅ |
| Contas não-aposentadoria (Brokerage, Joint) | ✅ |
| Passivos com taxa de juros (Mortgage, Auto Loan) | ✅ |
| Trust details com Zillow address | ✅ |
| Vinculação de cônjuge | ✅ |
| SSN com máscara automática | ✅ |
| Cálculo de idade a partir do DOB | ✅ |
| Persistência via localStorage | ✅ |
| Cliente HTTP pronto para FastAPI | ✅ |
| Toasts de feedback | ✅ |
| Design responsivo | ✅ |

---

## Produção (nginx exemplo)

```nginx
server {
  listen 80;
  root /var/www/financial-frontend;
  index index.html;

  # Injeta config de ambiente
  location /config.js {
    add_header Content-Type application/javascript;
    return 200 'window.FP_CONFIG = { apiUrl: "https://api.exemplo.com/api/v1" };';
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```
