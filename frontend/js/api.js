/**
 * API Client — connects to the FastAPI backend.
 *
 * The app uses Storage (localStorage) by default for offline operation.
 * When the backend is available, swap Storage.* calls in app.js for API.clients.*
 *
 * Usage:
 *   await API.auth.login(email, password)
 *   await API.clients.list()
 *   await API.clients.create(payload)
 *   await API.clients.update(id, payload)
 *   await API.clients.remove(id)
 *   await API.reports.preview(clientId)
 *   await API.reports.save(clientId, payload)
 *   await API.reports.list(clientId)
 */

const API = (() => {

  const BASE_URL = window.FP_CONFIG?.apiUrl || 'http://localhost:8000/api/v1';

  let _token = localStorage.getItem('fp_access_token') || null;

  // ── Internal fetch wrapper ────────────────────────────────────────────────
  async function request(method, path, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (_token) headers['Authorization'] = `Bearer ${_token}`;

    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });

    // Expired token — attempt automatic refresh
    if (res.status === 401) {
      const refreshed = await _tryRefresh();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${_token}`;
        return fetch(`${BASE_URL}${path}`, {
          method,
          headers,
          body: body ? JSON.stringify(body) : null,
        });
      } else {
        _handleLogout();
        throw new Error('Session expired. Please log in again.');
      }
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.detail || `Request failed: ${res.status}`);
    }

    if (res.status === 204) return null;
    return res.json();
  }

  async function _tryRefresh() {
    const refreshToken = localStorage.getItem('fp_refresh_token');
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      _setTokens(data.access_token, data.refresh_token);
      return true;
    } catch { return false; }
  }

  function _setTokens(access, refresh) {
    _token = access;
    localStorage.setItem('fp_access_token', access);
    if (refresh) localStorage.setItem('fp_refresh_token', refresh);
  }

  function _handleLogout() {
    _token = null;
    localStorage.removeItem('fp_access_token');
    localStorage.removeItem('fp_refresh_token');
    window.dispatchEvent(new Event('fp:logout'));
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth = {
    async login(email, password) {
      const data = await request('POST', '/auth/login', { email, password });
      _setTokens(data.access_token, data.refresh_token);
      return data;
    },
    logout()          { _handleLogout(); },
    isAuthenticated() { return !!_token; },
  };

  // ── Clients ───────────────────────────────────────────────────────────────
  const clients = {
    list(skip = 0, limit = 100) { return request('GET', `/clients?skip=${skip}&limit=${limit}`); },
    getById(id)                 { return request('GET', `/clients/${id}`); },
    create(payload)             { return request('POST', '/clients', payload); },
    update(id, payload)         { return request('PATCH', `/clients/${id}`, payload); },
    remove(id)                  { return request('DELETE', `/clients/${id}`); },
  };

  // ── Reports ───────────────────────────────────────────────────────────────
  const reports = {
    preview(clientId)           { return request('GET', `/clients/${clientId}/reports/preview`); },
    save(clientId, payload)     { return request('POST', `/clients/${clientId}/reports`, payload); },
    list(clientId)              { return request('GET', `/clients/${clientId}/reports`); },
    get(clientId, reportId)     { return request('GET', `/clients/${clientId}/reports/${reportId}`); },
  };

  return { auth, clients, reports };
})();
