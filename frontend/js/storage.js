/**
 * Storage — localStorage abstraction layer.
 * All client data lives under the key "fp_clients".
 * All report data lives under the key "fp_reports".
 */

// ── Client Storage ────────────────────────────────────────────────────────────
const Storage = (() => {
  const KEY = 'fp_clients';

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch { return []; }
  }

  function save(clients) {
    localStorage.setItem(KEY, JSON.stringify(clients));
  }

  function getAll()       { return load(); }
  function getById(id)    { return load().find(c => c.id === id) || null; }

  function create(data) {
    const clients = load();
    const now     = new Date().toISOString();
    const client  = { ...data, id: Date.now(), created_at: now, updated_at: now };
    clients.push(client);
    save(clients);
    return client;
  }

  function update(id, data) {
    const clients = load();
    const idx     = clients.findIndex(c => c.id === id);
    if (idx === -1) return null;
    clients[idx]  = { ...clients[idx], ...data, updated_at: new Date().toISOString() };
    save(clients);
    return clients[idx];
  }

  function remove(id) { save(load().filter(c => c.id !== id)); }

  return { getAll, getById, create, update, remove };
})();


// ── Report Storage ────────────────────────────────────────────────────────────
const ReportStorage = (() => {
  const KEY = 'fp_reports';

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch { return []; }
  }

  function save(reports) { localStorage.setItem(KEY, JSON.stringify(reports)); }

  function getByClient(clientId) {
    return load()
      .filter(r => r.client_id === clientId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  function getLastByClient(clientId) { return getByClient(clientId)[0] || null; }

  function create(data) {
    const reports = load();
    const now     = new Date().toISOString();
    const report  = { ...data, id: Date.now(), created_at: now, updated_at: now };
    reports.push(report);
    save(reports);
    return report;
  }

  function update(id, data) {
    const reports = load();
    const idx     = reports.findIndex(r => r.id === id);
    if (idx === -1) return null;
    reports[idx]  = { ...reports[idx], ...data, updated_at: new Date().toISOString() };
    save(reports);
    return reports[idx];
  }

  function remove(id) { save(load().filter(r => r.id !== id)); }

  return { getByClient, getLastByClient, create, update, remove };
})();
