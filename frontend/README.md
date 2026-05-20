# FinPlan — Frontend

Client management interface for financial planning.
Vanilla HTML + CSS + JS — zero dependencies, runs directly in the browser.

## Stack

* **Semantic HTML5**
* **CSS3** with a design system powered by variables (dark theme, editorial typography)
* **JavaScript** ES2020+, modular via IIFE, no frameworks
* **localStorage** for local persistence (offline mode)
* **`js/api.js`** ready to connect to the FastAPI backend when available

---

## Structure

```text id="1g1x8x"
financial-frontend/
├── index.html          # Single SPA — all views
├── config.js           # Runtime config (backend URL)
├── css/
│   └── main.css        # Complete design system
├── js/
│   ├── storage.js      # localStorage CRUD
│   ├── api.js          # HTTP client for the FastAPI backend
│   └── app.js          # Application logic (navigation, forms, rendering)
└── .gitignore
```

---

## How to Run

### Option 1 — Open directly in the browser

```bash id="z2qz4w"
# Just open the file:
open index.html
# or on Windows:
start index.html
```

### Option 2 — Local server (recommended, avoids CORS issues)

```bash id="sx4v6m"
# Python
python3 -m http.server 3000

# Node (npx)
npx serve .

# VSCode → install "Live Server" and click "Go Live"
```

Access: `http://localhost:3000`

---

## Connect to the FastAPI Backend

1. Edit `config.js`:

```js id="x4c4au"
window.FP_CONFIG = {
  apiUrl: 'http://localhost:8000/api/v1',
};
```

2. In `js/app.js`, replace `Storage.*` calls with `API.clients.*`:

```js id="v2cdye"
// Before (localStorage):
const clients = Storage.getAll();

// After (backend):
const clients = await API.clients.list();
```

3. For authentication, use `API.auth.login(email, password)` and store the tokens — `api.js` already handles automatic token refresh.

---

## Features

| Feature                                                    | Status |
| ---------------------------------------------------------- | ------ |
| Dashboard with aggregated metrics                          | ✅      |
| Client list (grid + list view)                             | ✅      |
| Real-time search                                           | ✅      |
| Client creation form                                       | ✅      |
| Client editing                                             | ✅      |
| Deletion with confirmation                                 | ✅      |
| Dynamic retirement accounts (IRA, Roth IRA, 401k, Pension) | ✅      |
| Non-retirement accounts (Brokerage, Joint)                 | ✅      |
| Liabilities with interest rates (Mortgage, Auto Loan)      | ✅      |
| Trust details with Zillow address                          | ✅      |
| Spouse linking                                             | ✅      |
| SSN with automatic masking                                 | ✅      |
| Age calculation from DOB                                   | ✅      |
| Persistence via localStorage                               | ✅      |
| HTTP client ready for FastAPI                              | ✅      |
| Feedback toasts                                            | ✅      |
| Responsive design                                          | ✅      |

---

## Production (nginx example)

```nginx id="jxxp4f"
server {
  listen 80;
  root /var/www/financial-frontend;
  index index.html;

  # Injects environment config
  location /config.js {
    add_header Content-Type application/javascript;
    return 200 'window.FP_CONFIG = { apiUrl: "https://api.example.com/api/v1" };';
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```
