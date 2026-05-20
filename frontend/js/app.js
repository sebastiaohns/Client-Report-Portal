/**
 * FinPlan — Client Management SPA
 * Pure vanilla JS, no dependencies.
 */

const App = (() => {

  let currentView = 'dashboard';
  let editingId   = null;
  let pendingDelete = null;
  let layout      = 'grid';
  let filterQuery = '';

  const RETIREMENT_TYPES     = ['IRA', 'Roth IRA', '401k', 'Pension'];
  const NON_RETIREMENT_TYPES = ['Brokerage', 'Joint'];
  const LIABILITY_TYPES      = ['Mortgage', 'Auto Loan', 'Other'];

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    document.querySelectorAll('.nav-item').forEach(item =>
      item.addEventListener('click', e => { e.preventDefault(); showView(item.dataset.view); })
    );
    refreshDashboard();
    renderClients();
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  function showView(view) {
    currentView = view;
    document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.view === view));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
    if (view === 'dashboard') refreshDashboard();
    if (view === 'clients')   renderClients();
    if (view === 'reports')   renderReportsView();
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────
  function refreshDashboard() {
    const clients = Storage.getAll();
    const totalIncome = clients.reduce((s, c) => s + Number(c.monthly_salary || 0), 0);
    const totalAUM    = clients.reduce((s, c) => s + (c.retirement_accounts || []).reduce((a, r) => a + Number(r.balance || 0), 0), 0);
    const trustCount  = clients.filter(c => c.trust_details).length;
    setText('stat-total',  clients.length || '—');
    setText('stat-income', clients.length ? fmt(totalIncome / clients.length) : '—');
    setText('stat-aum',    clients.length ? fmt(totalAUM) : '—');
    setText('stat-trusts', clients.length ? trustCount : '—');

    const tbody = document.getElementById('dashboard-tbody');
    if (!clients.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty-row">No clients yet</td></tr>'; return; }
    const recent = [...clients].sort((a, b) => (b.created_at||'').localeCompare(a.created_at||'')).slice(0, 8);
    tbody.innerHTML = recent.map(c => {
      const aum = (c.retirement_accounts || []).reduce((s, r) => s + Number(r.balance || 0), 0);
      return `<tr onclick="App.openForm(${c.id})">
        <td style="color:var(--text);font-weight:500">${esc(c.name)}</td>
        <td>${calcAge(c.dob)}</td><td>${fmt(c.monthly_salary)}</td><td>${fmt(aum)}</td>
        <td style="font-family:var(--font-mono);font-size:0.75rem;color:var(--text-3)">
          ${c.last_report_date ? new Date(c.last_report_date).toLocaleDateString() : '—'}</td></tr>`;
    }).join('');
  }

  // ── Clients list ──────────────────────────────────────────────────────────
  function renderClients() {
    const container = document.getElementById('clients-container');
    container.className = layout === 'grid' ? 'clients-grid' : 'clients-list';
    const filtered = Storage.getAll().filter(c => !filterQuery || c.name.toLowerCase().includes(filterQuery.toLowerCase()));
    if (!filtered.length) {
      container.innerHTML = `<div class="clients-empty">
        <svg viewBox="0 0 24 24" width="40" height="40" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round">
          <circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
          <line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
        <p>${filterQuery ? 'No clients match your search.' : 'No clients yet. Add your first client!'}</p></div>`;
      return;
    }
    container.innerHTML = filtered.map(c => renderCard(c)).join('');
  }

  function renderCard(c) {
    const age      = calcAge(c.dob);
    const initials = c.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    const aum      = (c.retirement_accounts || []).reduce((s, r) => s + Number(r.balance || 0), 0);
    const savings  = (c.non_retirement_accounts || []).reduce((s, r) => s + Number(r.balance || 0), 0);
    const tags     = [
      ...(c.retirement_accounts || []).map(r => tagHtml(r.type)),
      ...(c.non_retirement_accounts || []).map(r => tagHtml(r.type)),
      ...(c.trust_details ? ['<span class="tag tag-trust">Trust</span>'] : []),
    ].join('');
    const lastReport = ReportStorage.getLastByClient(c.id);
    const hasReports = ReportStorage.getByClient(c.id).length > 0;

    return `<div class="client-card" onclick="App.openForm(${c.id})">
      <div class="card-header">
        <div class="card-avatar">${initials}</div>
        <span class="card-age-badge">Age ${age}</span>
      </div>
      <div class="card-name">${esc(c.name)}</div>
      <div class="card-subtitle">DOB ${fmtDate(c.dob)}${lastReport ? ` · Last report: ${new Date(lastReport.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}` : ''}</div>
      <div class="card-stats">
        <div class="card-stat"><div class="card-stat-label">Monthly Income</div><div class="card-stat-value">${fmt(c.monthly_salary)}</div></div>
        <div class="card-stat"><div class="card-stat-label">Retirement AUM</div><div class="card-stat-value">${fmt(aum)}</div></div>
        <div class="card-stat"><div class="card-stat-label">Savings</div><div class="card-stat-value">${fmt(savings)}</div></div>
        <div class="card-stat"><div class="card-stat-label">Reserve Target</div><div class="card-stat-value">${fmt(c.private_reserve_target)}</div></div>
      </div>
      ${tags ? `<div class="card-tags">${tags}</div>` : ''}
      <div class="card-tags" style="margin-top:12px;justify-content:flex-end" onclick="event.stopPropagation()">
        ${hasReports ? `<button class="btn-report" onclick="ReportModule.openHistory(${c.id})">
          <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/></svg>History</button>` : ''}
        <button class="btn-report" style="background:var(--accent);color:var(--bg);border-color:var(--accent)"
          onclick="ReportModule.openReport(${c.id})">
          <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Generate Report
        </button>
      </div>
    </div>`;
  }

  function tagHtml(type) {
    const cls = {'IRA':'tag-ira','Roth IRA':'tag-roth','401k':'tag-401k','Pension':'tag-pension','Brokerage':'tag-broker','Joint':'tag-joint'}[type]||'';
    return `<span class="tag ${cls}">${type}</span>`;
  }

  function filterClients(q) { filterQuery = q; renderClients(); }

  function setLayout(l) {
    layout = l;
    document.getElementById('btn-grid').classList.toggle('active', l === 'grid');
    document.getElementById('btn-list').classList.toggle('active', l === 'list');
    renderClients();
  }

  // ── Reports view ──────────────────────────────────────────────────────────
  function renderReportsView() {
    const clients = Storage.getAll();
    const container = document.getElementById('reports-container');
    if (!container) return;

    if (!clients.length) {
      container.innerHTML = '<div class="empty-state"><p>No clients yet. Add clients to generate reports.</p></div>';
      return;
    }

    const rows = clients.map(c => {
      const reports = ReportStorage.getByClient(c.id);
      const last    = reports[0];
      return `
        <div class="report-client-row">
          <div class="rcr-info">
            <div class="rcr-name">${esc(c.name)}</div>
            <div class="rcr-meta">Age ${calcAge(c.dob)} · ${reports.length} report${reports.length !== 1 ? 's' : ''}</div>
          </div>
          <div class="rcr-actions">
            ${last ? `
              <button class="btn btn-ghost btn-sm" onclick="ReportModule.openHistory(${c.id})">History</button>
              <button class="btn btn-ghost btn-sm" onclick="App._downloadPdf(${c.id},${last.id},'sacs')">
                <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                SACS PDF
              </button>
              <button class="btn btn-ghost btn-sm" onclick="App._downloadPdf(${c.id},${last.id},'tcc')">
                <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                TCC PDF
              </button>` : '<span style="color:var(--text-3);font-size:0.8rem">No reports yet</span>'}
            <button class="btn btn-primary btn-sm" onclick="ReportModule.openReport(${c.id})">
              <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Report
            </button>
          </div>
        </div>`;
    }).join('');

    container.innerHTML = `<div class="report-client-list">${rows}</div>`;
  }

  // PDF download — uses local report data to generate via backend or client-side
  function _downloadPdf(clientId, reportId, type) {
    const report = ReportStorage.getByClient(clientId).find(r => r.id === reportId);
    const client = Storage.getById(clientId);
    if (!report || !client) { toast('Report data not found.', 'error'); return; }

    // Generate client-side PDF using the ReportPDF module
    try {
      const bytes = type === 'sacs'
        ? ReportPDF.generateSACS(report, client)
        : ReportPDF.generateTCC(report, client);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${type.toUpperCase()}_${client.name.replace(/\s+/g,'_')}_${report.quarter}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast(`${type.toUpperCase()} PDF downloaded.`, 'success');
    } catch (e) {
      toast('PDF generation failed: ' + e.message, 'error');
    }
  }

  // ── Client form ───────────────────────────────────────────────────────────
  function openForm(id = null) {
    editingId = id;
    showView('clients');
    document.getElementById('drawer-title').textContent = id ? 'Edit Client' : 'New Client';
    document.getElementById('btn-delete').classList.toggle('hidden', !id);
    resetForm();
    populateSpouseSelect(id);
    if (id) { const c = Storage.getById(id); if (c) fillForm(c); }
    document.getElementById('drawer-overlay').classList.add('active');
    document.getElementById('drawer').classList.add('open');
  }

  function closeForm() {
    document.getElementById('drawer-overlay').classList.remove('active');
    document.getElementById('drawer').classList.remove('open');
    editingId = null;
  }

  function resetForm() {
    document.getElementById('client-form').reset();
    document.getElementById('field-id').value = '';
    document.getElementById('age-display').textContent = '';
    document.getElementById('retirement-list').innerHTML = '';
    document.getElementById('non-retirement-list').innerHTML = '';
    document.getElementById('liability-list').innerHTML = '';
    document.getElementById('trust-fields').classList.add('hidden');
    document.getElementById('trust-toggle').checked = false;
    clearErrors();
  }

  function fillForm(c) {
    document.getElementById('field-id').value       = c.id;
    document.getElementById('field-name').value     = c.name || '';
    document.getElementById('field-dob').value      = c.dob || '';
    document.getElementById('field-ssn').value      = c.ssn || '';
    document.getElementById('field-salary').value   = c.monthly_salary || '';
    document.getElementById('field-expenses').value = c.monthly_expense_budget || '';
    document.getElementById('field-reserve').value  = c.private_reserve_target || '';
    if (c.dob) updateAgeDisplay(c.dob);
    const spouseEl = document.getElementById('field-spouse');
    if (c.spouse_id) spouseEl.value = c.spouse_id;
    (c.retirement_accounts || []).forEach(a => addRetirementRow(a));
    (c.non_retirement_accounts || []).forEach(a => addNonRetirementRow(a));
    (c.liabilities || []).forEach(a => addLiabilityRow(a));
    if (c.trust_details) {
      document.getElementById('trust-toggle').checked = true;
      toggleTrust(true);
      document.getElementById('field-trust-name').value    = c.trust_details.trust_name || '';
      document.getElementById('field-trustee').value       = c.trust_details.trustee || '';
      document.getElementById('field-trust-address').value = c.trust_details.property_address || '';
      document.getElementById('field-trust-value').value   = c.trust_details.estimated_value || '';
    }
  }

  function populateSpouseSelect(currentId) {
    const el = document.getElementById('field-spouse');
    el.innerHTML = '<option value="">— No spouse linked —</option>';
    Storage.getAll().filter(c => c.id !== currentId).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id; opt.textContent = `${c.name} (ID: ${c.id})`;
      el.appendChild(opt);
    });
  }

  document.getElementById('field-dob').addEventListener('change', function() { updateAgeDisplay(this.value); });

  function updateAgeDisplay(dob) {
    const age = calcAge(dob);
    document.getElementById('age-display').textContent = age ? `${age} years old` : '';
  }

  document.getElementById('field-ssn').addEventListener('input', function() {
    let val = this.value.replace(/\D/g, '').slice(0, 9);
    if (val.length > 5)      val = val.slice(0,3) + '-' + val.slice(3,5) + '-' + val.slice(5);
    else if (val.length > 3) val = val.slice(0,3) + '-' + val.slice(3);
    this.value = val;
  });

  // ── Dynamic rows ──────────────────────────────────────────────────────────
  function addRetirementRow(data = {}) {
    const d = document.createElement('div');
    d.className = 'account-row';
    d.innerHTML = `<div class="row-grid cols-3">
      <div class="form-group"><label>Type</label>
        <select class="ret-type">${RETIREMENT_TYPES.map(t => `<option value="${t}" ${data.type===t?'selected':''}>${t}</option>`).join('')}</select></div>
      <div class="form-group"><label>Institution</label>
        <input type="text" class="ret-inst" placeholder="Fidelity, Vanguard…" value="${esc(data.institution||'')}"/></div>
      <div class="form-group"><label>Balance</label>
        <div class="input-prefix"><span>$</span>
          <input type="number" class="ret-balance" min="0" step="0.01" placeholder="0.00" value="${data.balance||''}"/></div></div>
      <button type="button" class="btn-remove-row" onclick="this.closest('.account-row').remove()">
        <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>`;
    document.getElementById('retirement-list').appendChild(d);
  }

  function addNonRetirementRow(data = {}) {
    const d = document.createElement('div');
    d.className = 'account-row';
    d.innerHTML = `<div class="row-grid cols-3">
      <div class="form-group"><label>Type</label>
        <select class="nr-type">${NON_RETIREMENT_TYPES.map(t => `<option value="${t}" ${data.type===t?'selected':''}>${t}</option>`).join('')}</select></div>
      <div class="form-group"><label>Institution</label>
        <input type="text" class="nr-inst" placeholder="Schwab, E*Trade…" value="${esc(data.institution||'')}"/></div>
      <div class="form-group"><label>Balance</label>
        <div class="input-prefix"><span>$</span>
          <input type="number" class="nr-balance" min="0" step="0.01" placeholder="0.00" value="${data.balance||''}"/></div></div>
      <button type="button" class="btn-remove-row" onclick="this.closest('.account-row').remove()">
        <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>`;
    document.getElementById('non-retirement-list').appendChild(d);
  }

  function addLiabilityRow(data = {}) {
    const d = document.createElement('div');
    d.className = 'account-row';
    const isMortgage = data.type === 'Mortgage';
    d.innerHTML = `<div class="row-grid cols-4">
      <div class="form-group"><label>Type</label>
        <select class="li-type" onchange="App._toggleLiabilityAddress(this)">
          ${LIABILITY_TYPES.map(t => `<option value="${t}" ${data.type===t?'selected':''}>${t}</option>`).join('')}</select></div>
      <div class="form-group"><label>Institution</label>
        <input type="text" class="li-inst" placeholder="Wells Fargo…" value="${esc(data.institution||'')}"/></div>
      <div class="form-group"><label>Balance</label>
        <div class="input-prefix"><span>$</span>
          <input type="number" class="li-balance" min="0" step="0.01" placeholder="0.00" value="${data.balance||''}"/></div></div>
      <div class="form-group"><label>Rate %</label>
        <input type="number" class="li-rate" min="0" max="100" step="0.01" placeholder="6.75" value="${data.interest_rate||''}"/></div>
      <button type="button" class="btn-remove-row" onclick="this.closest('.account-row').remove()">
        <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="address-row ${isMortgage?'':'hidden'}" style="margin-top:8px">
      <div class="form-group"><label>Property Address (Zillow lookup)</label>
        <input type="text" class="li-address" placeholder="123 Main St, Austin TX 78701" value="${esc(data.property_address||'')}"/></div>
    </div>`;
    document.getElementById('liability-list').appendChild(d);
  }

  function _toggleLiabilityAddress(select) {
    select.closest('.account-row').querySelector('.address-row').classList.toggle('hidden', select.value !== 'Mortgage');
  }

  function toggleTrust(show) {
    document.getElementById('trust-fields').classList.toggle('hidden', !show);
  }

  // ── Save client ───────────────────────────────────────────────────────────
  function saveClient() {
    clearErrors();
    const errs = [];
    const name     = document.getElementById('field-name').value.trim();
    const dob      = document.getElementById('field-dob').value;
    const ssn      = document.getElementById('field-ssn').value.trim();
    const salary   = document.getElementById('field-salary').value;
    const expenses = document.getElementById('field-expenses').value;
    const reserve  = document.getElementById('field-reserve').value;

    if (!name)    { markError('field-name',    'Name is required');       errs.push(1); }
    if (!dob)     { markError('field-dob',     'DOB is required');        errs.push(1); }
    if (!ssn)     { markError('field-ssn',     'SSN is required');        errs.push(1); }
    else if (!/^\d{3}-\d{2}-\d{4}$/.test(ssn)) { markError('field-ssn', 'Format: XXX-XX-XXXX'); errs.push(1); }
    if (salary==='')  { markError('field-salary',   'Salary is required');  errs.push(1); }
    if (expenses==='') { markError('field-expenses','Budget is required');  errs.push(1); }
    if (reserve==='')  { markError('field-reserve', 'Target is required');  errs.push(1); }
    if (errs.length) { toast('Please fix highlighted fields.', 'error'); return; }

    const retirement_accounts = [];
    document.querySelectorAll('#retirement-list .account-row').forEach(row => {
      retirement_accounts.push({ type: row.querySelector('.ret-type').value, institution: row.querySelector('.ret-inst').value.trim(), balance: parseFloat(row.querySelector('.ret-balance').value)||0 });
    });
    const non_retirement_accounts = [];
    document.querySelectorAll('#non-retirement-list .account-row').forEach(row => {
      non_retirement_accounts.push({ type: row.querySelector('.nr-type').value, institution: row.querySelector('.nr-inst').value.trim(), balance: parseFloat(row.querySelector('.nr-balance').value)||0 });
    });
    const liabilities = [];
    document.querySelectorAll('#liability-list .account-row').forEach(row => {
      const type = row.querySelector('.li-type').value;
      liabilities.push({ type, institution: row.querySelector('.li-inst').value.trim(), balance: parseFloat(row.querySelector('.li-balance').value)||0, interest_rate: parseFloat(row.querySelector('.li-rate').value)||0, property_address: type==='Mortgage'?row.querySelector('.li-address').value.trim():null });
    });
    let trust_details = null;
    if (document.getElementById('trust-toggle').checked) {
      trust_details = { trust_name: document.getElementById('field-trust-name').value.trim(), trustee: document.getElementById('field-trustee').value.trim(), property_address: document.getElementById('field-trust-address').value.trim(), estimated_value: parseFloat(document.getElementById('field-trust-value').value)||null };
    }
    const spouseVal = document.getElementById('field-spouse').value;
    const payload = { name, dob, ssn, spouse_id: spouseVal ? parseInt(spouseVal) : null, monthly_salary: parseFloat(salary), monthly_expense_budget: parseFloat(expenses), private_reserve_target: parseFloat(reserve), retirement_accounts, non_retirement_accounts, liabilities, trust_details };

    if (editingId) { Storage.update(editingId, payload); toast(`${name} updated.`, 'success'); }
    else           { Storage.create(payload);             toast(`${name} added.`,   'success'); }
    closeForm(); renderClients(); refreshDashboard();
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  function deleteClient() {
    if (!editingId) return;
    const c = Storage.getById(editingId);
    pendingDelete = editingId;
    document.getElementById('confirm-body').textContent = `Are you sure you want to delete "${c?.name}"? This cannot be undone.`;
    document.getElementById('confirm-overlay').classList.remove('hidden');
  }
  function cancelDelete()  { pendingDelete = null; document.getElementById('confirm-overlay').classList.add('hidden'); }
  function confirmDelete() {
    if (!pendingDelete) return;
    const c = Storage.getById(pendingDelete);
    Storage.remove(pendingDelete);
    document.getElementById('confirm-overlay').classList.add('hidden');
    closeForm(); renderClients(); refreshDashboard();
    toast(`${c?.name||'Client'} deleted.`, 'info');
    pendingDelete = null;
  }

  // ── Validation ────────────────────────────────────────────────────────────
  function markError(id, msg) {
    const el = document.getElementById(id); if (!el) return;
    el.classList.add('error');
    const s = document.createElement('span'); s.className = 'field-error'; s.textContent = msg;
    el.parentNode.appendChild(s);
  }
  function clearErrors() {
    document.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
    document.querySelectorAll('.field-error').forEach(el => el.remove());
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  function toast(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span class="toast-dot"></span>${esc(message)}`;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(() => { el.style.opacity='0'; el.style.transform='translateY(8px)'; el.style.transition='all 0.2s'; setTimeout(()=>el.remove(),220); }, 3000);
  }

  // ── Utilities ─────────────────────────────────────────────────────────────
  function calcAge(dob) {
    if (!dob) return '—';
    const t = new Date(), b = new Date(dob);
    let a = t.getFullYear() - b.getFullYear();
    if (t.getMonth() < b.getMonth() || (t.getMonth()===b.getMonth() && t.getDate()<b.getDate())) a--;
    return a;
  }
  function fmt(val) {
    const n = parseFloat(val);
    if (!val && val!==0 || isNaN(n)) return '—';
    if (n>=1_000_000) return '$'+(n/1_000_000).toFixed(1)+'M';
    if (n>=1_000)     return '$'+(n/1_000).toFixed(1)+'K';
    return '$'+n.toFixed(0);
  }
  function fmtDate(d) {
    if (!d) return '—';
    const [y,m,day] = d.split('-'); return `${m}/${day}/${y}`;
  }
  function esc(str) {
    return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function setText(id, val) { const el=document.getElementById(id); if(el) el.textContent=val; }

  return {
    init, showView, openForm, closeForm, saveClient,
    deleteClient, cancelDelete, confirmDelete,
    filterClients, setLayout, toggleTrust,
    addRetirementRow, addNonRetirementRow, addLiabilityRow,
    _toggleLiabilityAddress, _downloadPdf, toast,
    renderClients, refreshDashboard,
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
