/**
 * ReportModule — Generate Report modal
 *
 * Flow:
 *  1. openReport(clientId) → builds local preview → opens modal
 *  2. User fills dynamic fields / clicks "Use Last Value"
 *  3. All calculated metrics update in real-time as values are entered
 *  4. Save Draft or Finalize → saves to ReportStorage + updates client
 *
 * Calculated metrics (real-time):
 *  SACS:
 *    Excess                 = Monthly Salary (inflow) - Monthly Expense Budget (outflow)
 *    Private Reserve Target = (6 × monthly expenses) + sum(insurance deductibles)
 *
 *  TCC:
 *    Client 1 Retirement Total = sum of client 1's retirement account balances
 *    Client 2 Retirement Total = sum of spouse's retirement account balances
 *    Non-Retirement Total      = sum of all non-retirement balances (excl. trust)
 *    Trust Value               = home value for (Trust) property
 *    Grand Total Net Worth     = C1 Ret + C2 Ret + Non-Ret + Trust Value
 *    Liabilities Total         = sum of all liability balances (separate, NOT subtracted)
 */

const ReportModule = (() => {

  // ── State ─────────────────────────────────────────────────────────────────
  let _clientId    = null;
  let _preview     = null;
  let _fieldValues = {};
  let _client      = null;
  let _spouse      = null;

  // ── Open / Close ──────────────────────────────────────────────────────────

  function openReport(clientId) {
    _clientId = clientId;
    _client   = Storage.getById(clientId);
    if (!_client) return;

    _spouse = _client.spouse_id ? Storage.getById(_client.spouse_id) : null;
    _preview = _buildPreview(_client, _spouse);
    _fieldValues = _initFieldValues(_preview);

    _render();
    document.getElementById('report-modal-overlay').classList.remove('hidden');
  }

  function close() {
    document.getElementById('report-modal-overlay').classList.add('hidden');
    _clientId = _preview = _client = _spouse = null;
    _fieldValues = {};
  }

  // ── Preview builder ───────────────────────────────────────────────────────

  function _currentQuarter() {
    const d = new Date();
    return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
  }

  function _quarterLabel(q) {
    const [year, qn] = q.split('-');
    return `${qn} ${year} Report`;
  }

  function _buildPreview(client, spouse) {
    const quarter    = _currentQuarter();
    const lastReport = ReportStorage.getLastByClient(client.id);
    const lastData   = lastReport?.data || {};

    function lastVal(section, key) {
      try { return lastData[section]?.[key]?.value ?? null; }
      catch { return null; }
    }

    // ── SACS: account balances ──────────────────────────────────
    const accountBalances = {};
    const retTypes = new Set(['IRA', 'Roth IRA', '401k', 'Pension']);

    for (const acc of (client.retirement_accounts || [])) {
      const key  = `${acc.type} – ${acc.institution}`;
      const last = lastVal('sacs_account_balances', key);
      accountBalances[key] = {
        value: last ?? acc.balance ?? null,
        source: last != null ? 'last_report' : 'profile',
        last_value: last,
        is_incomplete: last == null,
        owner: 'client1',
        acct_type: acc.type,
      };
    }

    for (const acc of (client.non_retirement_accounts || [])) {
      const key  = `${acc.type} – ${acc.institution}`;
      const last = lastVal('sacs_account_balances', key);
      accountBalances[key] = {
        value: last ?? acc.balance ?? null,
        source: last != null ? 'last_report' : 'profile',
        last_value: last,
        is_incomplete: last == null,
        owner: 'client1',
        acct_type: acc.type,
      };
    }

    // Include spouse retirement accounts
    if (spouse) {
      for (const acc of (spouse.retirement_accounts || [])) {
        const key  = `${acc.type} – ${acc.institution} (${spouse.name.split(' ')[0]})`;
        const last = lastVal('sacs_account_balances', key);
        accountBalances[key] = {
          value: last ?? acc.balance ?? null,
          source: last != null ? 'last_report' : 'profile',
          last_value: last,
          is_incomplete: last == null,
          owner: 'client2',
          acct_type: acc.type,
        };
      }
    }

    // ── SACS: insurance deductibles ─────────────────────────────
    const insuranceDeductibles = {};
    for (const k of Object.keys(lastData.sacs_insurance_deductibles || {})) {
      const last = lastVal('sacs_insurance_deductibles', k);
      insuranceDeductibles[k] = { value: last, source: 'last_report', last_value: last, is_incomplete: false };
    }

    // ── TCC: private reserve ────────────────────────────────────
    const lastReserve = lastVal('tcc_private_reserve', 'balance') ??
                        lastData?.tcc_private_reserve?.balance ?? null;
    const privateReserve = {
      value: lastReserve,
      source: lastReserve != null ? 'last_report' : 'manual',
      last_value: lastReserve,
      is_incomplete: lastReserve == null,
    };

    // ── TCC: home values ────────────────────────────────────────
    const homeValues = {};
    for (const lib of (client.liabilities || [])) {
      if (lib.type === 'Mortgage' && lib.property_address) {
        const key  = lib.property_address;
        const last = lastVal('tcc_home_values', key);
        homeValues[key] = { value: last, source: last != null ? 'last_report' : 'manual', last_value: last, is_incomplete: last == null, is_trust: false };
      }
    }
    if (client.trust_details?.property_address) {
      const key  = client.trust_details.property_address + ' (Trust)';
      const last = lastVal('tcc_home_values', key);
      homeValues[key] = { value: last, source: last != null ? 'last_report' : 'manual', last_value: last, is_incomplete: last == null, is_trust: true };
    }

    // ── TCC: liability balances ─────────────────────────────────
    const liabilityBalances = {};
    for (const lib of (client.liabilities || [])) {
      const inst = lib.institution || lib.type;
      const key  = `${lib.type} – ${inst}`;
      const last = lastVal('tcc_liability_balances', key);
      liabilityBalances[key] = {
        value: last ?? lib.balance ?? null,
        source: last != null ? 'last_report' : 'profile',
        last_value: last,
        is_incomplete: last == null,
      };
    }

    const allFields = [
      ...Object.values(accountBalances),
      privateReserve,
      ...Object.values(homeValues),
      ...Object.values(liabilityBalances),
    ];

    return {
      client_id: client.id,
      client_name: client.name,
      spouse_name: spouse?.name || null,
      quarter,
      label: _quarterLabel(quarter),
      has_previous: !!lastReport,
      previous_date: lastReport?.created_at || null,
      incomplete_count: allFields.filter(f => f.is_incomplete || f.value == null).length,
      monthly_salary:         client.monthly_salary,
      monthly_expense_budget: client.monthly_expense_budget,
      private_reserve_target: client.private_reserve_target,
      account_balances:     accountBalances,
      insurance_deductibles: insuranceDeductibles,
      private_reserve:      privateReserve,
      home_values:          homeValues,
      liability_balances:   liabilityBalances,
    };
  }

  function _initFieldValues(preview) {
    return {
      account_balances:      Object.fromEntries(Object.entries(preview.account_balances).map(([k,v]) => [k, {...v}])),
      insurance_deductibles: Object.fromEntries(Object.entries(preview.insurance_deductibles).map(([k,v]) => [k, {...v}])),
      private_reserve:       { ...preview.private_reserve },
      home_values:           Object.fromEntries(Object.entries(preview.home_values).map(([k,v]) => [k, {...v}])),
      liability_balances:    Object.fromEntries(Object.entries(preview.liability_balances).map(([k,v]) => [k, {...v}])),
    };
  }

  // ── Calculated metrics ────────────────────────────────────────────────────

  function _calcSACS() {
    const salary   = _num(_preview.monthly_salary);
    const expenses = _num(_preview.monthly_expense_budget);
    const excess   = salary - expenses;

    const insuranceSum = Object.values(_fieldValues.insurance_deductibles)
      .reduce((s, f) => s + (f.value != null ? _num(f.value) : 0), 0);
    const reserveTarget = (6 * expenses) + insuranceSum;

    return { excess, reserveTarget, salary, expenses };
  }

  function _calcTCC() {
    const retTypes = new Set(['IRA', 'Roth IRA', '401k', 'Pension']);

    let c1Ret = 0, c2Ret = 0, nonRet = 0;

    for (const [key, field] of Object.entries(_fieldValues.account_balances)) {
      if (field.value == null) continue;
      const val = _num(field.value);
      const isRetirement = retTypes.has(field.acct_type);
      if (isRetirement) {
        field.owner === 'client2' ? (c2Ret += val) : (c1Ret += val);
      } else {
        nonRet += val;
      }
    }

    let trustValue = 0;
    for (const [key, field] of Object.entries(_fieldValues.home_values)) {
      if (field.is_trust && field.value != null) trustValue += _num(field.value);
    }

    const grandTotal = c1Ret + c2Ret + nonRet + trustValue;

    const liabTotal = Object.values(_fieldValues.liability_balances)
      .reduce((s, f) => s + (f.value != null ? _num(f.value) : 0), 0);

    return { c1Ret, c2Ret, nonRet, trustValue, grandTotal, liabTotal };
  }

  // ── Render ────────────────────────────────────────────────────────────────

  function _render() {
    const p    = _preview;
    const sacs = _calcSACS();
    const tcc  = _calcTCC();
    const inc  = _countIncomplete();
    const tot  = _countTotal();
    const done = tot - inc;

    document.getElementById('report-modal-overlay').innerHTML = `
      <div class="report-modal">

        <!-- Header -->
        <div class="report-modal-header">
          <div class="report-modal-meta">
            <div class="report-modal-eyebrow">Generate Report</div>
            <div class="report-modal-title">${esc(p.client_name)}${p.spouse_name ? ` & ${esc(p.spouse_name)}` : ''}</div>
            <div class="report-modal-subtitle">
              <span>${esc(p.label)}</span>
              ${p.has_previous
                ? `<span class="report-prev-ref">Ref: ${_fmtDate(p.previous_date)}</span>`
                : '<span class="report-prev-ref">No previous report</span>'}
              <span class="incomplete-badge ${inc === 0 ? 'zero' : ''}" id="rpt-badge">
                ${inc === 0 ? '✓ All fields complete' : `${inc} field${inc > 1 ? 's' : ''} incomplete`}
              </span>
            </div>
          </div>
          <button class="drawer-close" onclick="ReportModule.close()">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Body -->
        <div class="report-modal-body">

          <!-- Progress -->
          <div class="report-progress">
            <span class="progress-label">Completion</span>
            <div class="progress-track">
              <div class="progress-fill" id="rpt-progress-fill" style="width:${tot > 0 ? Math.round(done/tot*100) : 100}%"></div>
            </div>
            <span class="progress-label" id="rpt-progress-label">${done}/${tot}</span>
          </div>

          <!-- ── SACS SECTION ── -->
          <div>
            <div class="report-section-header">
              <span class="report-section-badge badge-sacs">SACS</span>
              <span class="report-section-title">Savings, Accounts &amp; Cash Summary</span>
            </div>

            <!-- Static inputs -->
            <div class="static-fields-grid">
              ${_staticField('Monthly Salary (Inflow)', p.monthly_salary, 'Pre-filled from profile')}
              ${_staticField('Monthly Expense Budget (Outflow)', p.monthly_expense_budget, 'Pre-filled from profile')}
            </div>

            <!-- SACS Calculated metrics -->
            <div class="calc-metrics-grid" id="sacs-calc">
              ${_calcMetric('SACS Excess (Inflow − Outflow)', sacs.excess, sacs.excess >= 0 ? 'positive' : 'negative',
                'Monthly surplus available for savings and investment')}
              ${_calcMetric('Private Reserve Target', sacs.reserveTarget, 'neutral',
                '6 × monthly expenses + insurance deductibles')}
            </div>

            <!-- Account balances by section -->
            ${_renderAccountGroup('Client 1 Retirement Accounts',
              Object.entries(_fieldValues.account_balances).filter(([,v]) => v.owner === 'client1' && ['IRA','Roth IRA','401k','Pension'].includes(v.acct_type)))}
            ${p.spouse_name ? _renderAccountGroup(`${p.spouse_name} Retirement Accounts`,
              Object.entries(_fieldValues.account_balances).filter(([,v]) => v.owner === 'client2')) : ''}
            ${_renderAccountGroup('Non-Retirement Accounts',
              Object.entries(_fieldValues.account_balances).filter(([,v]) => v.owner === 'client1' && !['IRA','Roth IRA','401k','Pension'].includes(v.acct_type)))}

            <!-- Insurance deductibles -->
            <div class="dynamic-subsection">
              <div class="dynamic-subsection-header">
                Insurance Deductibles
                <button type="button" class="btn-add-inline" onclick="ReportModule._addInsurance()">+ Add</button>
              </div>
              <div class="dynamic-fields" id="rpt-insurance">
                ${Object.entries(_fieldValues.insurance_deductibles).map(([k,v]) =>
                  _dynamicFieldRow('insurance_deductibles', k, v)).join('')}
                ${Object.keys(_fieldValues.insurance_deductibles).length === 0
                  ? '<p class="no-items-note">No deductibles added — affects Private Reserve Target</p>' : ''}
              </div>
            </div>
          </div>

          <!-- ── TCC SECTION ── -->
          <div>
            <div class="report-section-header">
              <span class="report-section-badge badge-tcc">TCC</span>
              <span class="report-section-title">Totals, Cash &amp; Collateral</span>
            </div>

            <!-- TCC Calculated metrics -->
            <div class="calc-metrics-grid" id="tcc-calc">
              ${_calcMetric('Client 1 Retirement Total', tcc.c1Ret, 'neutral', 'Sum of Client 1 retirement accounts')}
              ${p.spouse_name ? _calcMetric(`${p.spouse_name} Retirement Total`, tcc.c2Ret, 'neutral', `Sum of ${p.spouse_name}'s retirement accounts`) : ''}
              ${_calcMetric('Non-Retirement Total', tcc.nonRet, 'neutral', 'All non-retirement balances (excl. trust)')}
              ${_calcMetric('Trust Value', tcc.trustValue, 'neutral', 'Zillow home value for trust property')}
              ${_calcMetric('Grand Total Net Worth', tcc.grandTotal, 'highlight', 'C1 Retirement + C2 Retirement + Non-Retirement + Trust')}
              ${_calcMetric('Liabilities Total', tcc.liabTotal, 'liability', 'Displayed separately — not subtracted from net worth')}
            </div>

            <!-- Private reserve -->
            <div class="dynamic-subsection">
              <div class="dynamic-subsection-header">Private Reserve</div>
              <div class="static-fields-grid" style="margin-bottom:10px">
                ${_staticField('Reserve Target', p.private_reserve_target, 'Pre-filled from profile')}
              </div>
              <div class="dynamic-fields">
                ${_dynamicFieldRow('private_reserve', '__balance__', _fieldValues.private_reserve, 'Private Reserve Balance')}
              </div>
            </div>

            <!-- Home values -->
            ${Object.keys(_fieldValues.home_values).length > 0 ? `
              <div class="dynamic-subsection">
                <div class="dynamic-subsection-header">Home Values (Zillow Lookup)</div>
                <div class="dynamic-fields" id="rpt-home-values">
                  ${Object.entries(_fieldValues.home_values).map(([k,v]) =>
                    _dynamicFieldRow('home_values', k, v)).join('')}
                </div>
              </div>` : ''}

            <!-- Liability balances -->
            ${Object.keys(_fieldValues.liability_balances).length > 0 ? `
              <div class="dynamic-subsection">
                <div class="dynamic-subsection-header">Liability Balances</div>
                <div class="dynamic-fields" id="rpt-liabilities">
                  ${Object.entries(_fieldValues.liability_balances).map(([k,v]) =>
                    _dynamicFieldRow('liability_balances', k, v)).join('')}
                </div>
              </div>` : ''}
          </div>

          <!-- Notes -->
          <div class="report-notes-wrap">
            <label>Notes (optional)</label>
            <textarea id="rpt-notes" placeholder="Add advisor notes for this report period…"></textarea>
          </div>

        </div>

        <!-- Footer -->
        <div class="report-modal-footer">
          <div class="footer-left">
            <div class="quarter-select-wrap">
              <span>Quarter</span>
              <select id="rpt-quarter">${_quarterOptions()}</select>
            </div>
          </div>
          <div class="footer-right">
            <button class="btn btn-ghost" onclick="ReportModule.close()">Cancel</button>
            <button class="btn btn-ghost" onclick="ReportModule.save('draft')">Save Draft</button>
            <button class="btn btn-primary" onclick="ReportModule.save('final')">
              <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
              Finalize Report
            </button>
          </div>
        </div>

      </div>`;
  }

  // ── Sub-render helpers ────────────────────────────────────────────────────

  function _renderAccountGroup(title, entries) {
    if (!entries.length) return '';
    return `
      <div class="dynamic-subsection">
        <div class="dynamic-subsection-header">${esc(title)}</div>
        <div class="dynamic-fields">
          ${entries.map(([k, v]) => _dynamicFieldRow('account_balances', k, v)).join('')}
        </div>
      </div>`;
  }

  function _staticField(label, value, note) {
    return `
      <div class="static-field">
        <div class="static-field-label">${esc(label)}</div>
        <div class="static-field-value">${_fmtCurrency(value)}</div>
        <div class="static-field-note">${esc(note)}</div>
      </div>`;
  }

  function _calcMetric(label, value, tone, note) {
    const colorMap = {
      positive:  'var(--green)',
      negative:  'var(--red)',
      highlight: 'var(--accent)',
      liability: 'var(--red)',
      neutral:   'var(--text)',
    };
    const color = colorMap[tone] || 'var(--text)';
    return `
      <div class="calc-metric-card">
        <div class="calc-metric-label">${esc(label)}</div>
        <div class="calc-metric-value" style="color:${color}">${_fmtCurrency(value)}</div>
        <div class="calc-metric-note">${esc(note)}</div>
      </div>`;
  }

  function _dynamicFieldRow(section, key, field, labelOverride = null) {
    const incomplete  = field.value == null;
    const label       = labelOverride || (key === '__balance__' ? 'Private Reserve Balance' : key);
    const sourceLabel = incomplete ? 'incomplete'
      : field.source === 'last_report' ? 'last qtr'
      : field.source === 'profile'     ? 'profile'
      : 'manual';
    const sourceClass = incomplete ? 'source-incomplete'
      : field.source === 'last_report' ? 'source-last'
      : field.source === 'profile'     ? 'source-profile'
      : 'source-manual';
    const hasLast = field.last_value != null;
    const encKey  = encodeURIComponent(key);

    return `
      <div class="dynamic-field-row ${incomplete ? 'is-incomplete' : 'is-complete'}"
           id="row-${section}-${encKey}" data-section="${section}" data-key="${encKey}">
        <div class="dynamic-field-info">
          <div class="dynamic-field-label">${esc(label)}</div>
          <div class="dynamic-field-meta">
            <span class="source-pill ${sourceClass}">${sourceLabel}</span>
            <span class="last-val-ref">${hasLast ? `Last: ${_fmtCurrency(field.last_value)}` : 'No prior value'}</span>
          </div>
        </div>
        <div class="dynamic-field-input-wrap">
          <div class="input-prefix">
            <span>$</span>
            <input type="number" min="0" step="0.01"
              value="${field.value != null ? Number(field.value).toFixed(2) : ''}"
              placeholder="${incomplete ? 'Required' : '0.00'}"
              style="${incomplete ? 'border-color:rgba(224,92,92,0.5)' : ''}"
              oninput="ReportModule._onInput('${section}','${encKey}',this.value)"
            />
          </div>
          <button class="use-last-btn ${hasLast ? '' : 'hidden'}"
            onclick="ReportModule._useLast('${section}','${encKey}')">
            Use last (${_fmtCurrency(field.last_value)})
          </button>
        </div>
        <div class="field-status-icon">
          ${incomplete
            ? `<svg stroke="var(--red)" fill="none" viewBox="0 0 24 24" width="15" height="15" stroke-width="2" stroke-linecap="round">
                 <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
               </svg>`
            : `<svg stroke="var(--green)" fill="none" viewBox="0 0 24 24" width="15" height="15" stroke-width="2" stroke-linecap="round">
                 <polyline points="20 6 9 17 4 12"/>
               </svg>`}
        </div>
      </div>`;
  }

  // ── Interactions ──────────────────────────────────────────────────────────

  function _onInput(section, encKey, rawValue) {
    const key = decodeURIComponent(encKey);
    const val = rawValue === '' ? null : parseFloat(rawValue);

    if (section === 'private_reserve') {
      _fieldValues.private_reserve = { ..._fieldValues.private_reserve, value: val, source: 'manual', is_incomplete: val == null };
    } else {
      _fieldValues[section][key] = { ..._fieldValues[section][key], value: val, source: 'manual', is_incomplete: val == null };
    }

    _updateRowState(section, encKey);
    _refreshCalcMetrics();
    _updateProgress();
  }

  function _useLast(section, encKey) {
    const key = decodeURIComponent(encKey);
    const ref = section === 'private_reserve' ? _fieldValues.private_reserve : _fieldValues[section][key];
    if (ref.last_value == null) return;

    const updated = { ...ref, value: ref.last_value, source: 'last_report', is_incomplete: false };
    if (section === 'private_reserve') {
      _fieldValues.private_reserve = updated;
    } else {
      _fieldValues[section][key] = updated;
    }

    const row = document.getElementById(`row-${section}-${encKey}`);
    if (row) row.outerHTML = _dynamicFieldRow(section, key === '__balance__' ? '__balance__' : key, updated);
    _refreshCalcMetrics();
    _updateProgress();
  }

  function _addInsurance() {
    const label = prompt('Insurance deductible label (e.g. "Health Insurance Deductible"):');
    if (!label) return;
    const key = label.trim();
    if (_fieldValues.insurance_deductibles[key]) return;
    _fieldValues.insurance_deductibles[key] = { value: null, source: 'manual', last_value: null, is_incomplete: true };

    const container = document.getElementById('rpt-insurance');
    if (container) {
      const p = container.querySelector('.no-items-note');
      if (p) p.remove();
      container.insertAdjacentHTML('beforeend', _dynamicFieldRow('insurance_deductibles', key, _fieldValues.insurance_deductibles[key]));
    }
    _refreshCalcMetrics();
    _updateProgress();
  }

  // ── Real-time metric refresh ──────────────────────────────────────────────

  function _refreshCalcMetrics() {
    const sacs = _calcSACS();
    const tcc  = _calcTCC();

    const sacsGrid = document.getElementById('sacs-calc');
    if (sacsGrid) {
      sacsGrid.innerHTML =
        _calcMetric('SACS Excess (Inflow − Outflow)', sacs.excess, sacs.excess >= 0 ? 'positive' : 'negative', 'Monthly surplus available for savings and investment') +
        _calcMetric('Private Reserve Target', sacs.reserveTarget, 'neutral', '6 × monthly expenses + insurance deductibles');
    }

    const tccGrid = document.getElementById('tcc-calc');
    if (tccGrid) {
      tccGrid.innerHTML =
        _calcMetric('Client 1 Retirement Total', tcc.c1Ret, 'neutral', 'Sum of Client 1 retirement accounts') +
        (_preview.spouse_name ? _calcMetric(`${_preview.spouse_name} Retirement Total`, tcc.c2Ret, 'neutral', `Sum of ${_preview.spouse_name}'s retirement accounts`) : '') +
        _calcMetric('Non-Retirement Total', tcc.nonRet, 'neutral', 'All non-retirement balances (excl. trust)') +
        _calcMetric('Trust Value', tcc.trustValue, 'neutral', 'Zillow home value for trust property') +
        _calcMetric('Grand Total Net Worth', tcc.grandTotal, 'highlight', 'C1 Retirement + C2 Retirement + Non-Retirement + Trust') +
        _calcMetric('Liabilities Total', tcc.liabTotal, 'liability', 'Displayed separately — not subtracted from net worth');
    }
  }

  function _updateRowState(section, encKey) {
    const key  = decodeURIComponent(encKey);
    const data = section === 'private_reserve' ? _fieldValues.private_reserve : _fieldValues[section][key];
    const row  = document.getElementById(`row-${section}-${encKey}`);
    if (!row) return;

    const incomplete = data.is_incomplete || data.value == null;
    row.className = `dynamic-field-row ${incomplete ? 'is-incomplete' : 'is-complete'}`;

    const pill = row.querySelector('.source-pill');
    if (pill) {
      const label = incomplete ? 'incomplete' : data.source === 'last_report' ? 'last qtr' : data.source === 'profile' ? 'profile' : 'manual';
      const cls   = incomplete ? 'source-incomplete' : data.source === 'last_report' ? 'source-last' : data.source === 'profile' ? 'source-profile' : 'source-manual';
      pill.textContent = label;
      pill.className   = `source-pill ${cls}`;
    }

    const icon = row.querySelector('.field-status-icon');
    if (icon) {
      icon.innerHTML = incomplete
        ? `<svg stroke="var(--red)" fill="none" viewBox="0 0 24 24" width="15" height="15" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
        : `<svg stroke="var(--green)" fill="none" viewBox="0 0 24 24" width="15" height="15" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    }

    const inp = row.querySelector('input');
    if (inp) inp.style.borderColor = incomplete ? 'rgba(224,92,92,0.5)' : '';
  }

  function _updateProgress() {
    const tot  = _countTotal();
    const inc  = _countIncomplete();
    const done = tot - inc;
    const pct  = tot > 0 ? Math.round(done / tot * 100) : 100;

    const fill  = document.getElementById('rpt-progress-fill');
    const label = document.getElementById('rpt-progress-label');
    const badge = document.getElementById('rpt-badge');

    if (fill)  fill.style.width = `${pct}%`;
    if (label) label.textContent = `${done}/${tot}`;
    if (badge) {
      badge.textContent = inc === 0 ? '✓ All fields complete' : `${inc} field${inc > 1 ? 's' : ''} incomplete`;
      badge.className   = `incomplete-badge ${inc === 0 ? 'zero' : ''}`;
    }
  }

  function _countTotal() {
    return Object.keys(_fieldValues.account_balances).length
         + Object.keys(_fieldValues.insurance_deductibles).length
         + 1   // private reserve
         + Object.keys(_fieldValues.home_values).length
         + Object.keys(_fieldValues.liability_balances).length;
  }

  function _countIncomplete() {
    let c = 0;
    for (const v of Object.values(_fieldValues.account_balances))     if (v.value == null) c++;
    for (const v of Object.values(_fieldValues.insurance_deductibles)) if (v.value == null) c++;
    if (_fieldValues.private_reserve?.value == null) c++;
    for (const v of Object.values(_fieldValues.home_values))           if (v.value == null) c++;
    for (const v of Object.values(_fieldValues.liability_balances))    if (v.value == null) c++;
    return c;
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  function save(status) {
    const quarter = document.getElementById('rpt-quarter')?.value || _preview.quarter;
    const notes   = document.getElementById('rpt-notes')?.value?.trim() || null;
    const sacs    = _calcSACS();
    const tcc     = _calcTCC();

    const data = {
      sacs_static: {
        monthly_salary:         _preview.monthly_salary,
        monthly_expense_budget: _preview.monthly_expense_budget,
      },
      sacs_account_balances:      _fieldValues.account_balances,
      sacs_insurance_deductibles: _fieldValues.insurance_deductibles,
      sacs_calculated: {
        excess:                 sacs.excess,
        private_reserve_target: sacs.reserveTarget,
      },
      tcc_private_reserve: {
        balance: _fieldValues.private_reserve,
        target:  _preview.private_reserve_target,
      },
      tcc_home_values:        _fieldValues.home_values,
      tcc_liability_balances: _fieldValues.liability_balances,
      tcc_calculated: {
        client1_retirement_total: tcc.c1Ret,
        client2_retirement_total: tcc.c2Ret,
        non_retirement_total:     tcc.nonRet,
        trust_value:              tcc.trustValue,
        grand_total_net_worth:    tcc.grandTotal,
        liabilities_total:        tcc.liabTotal,
      },
    };

    const report = ReportStorage.create({
      client_id: _clientId,
      quarter,
      label: _quarterLabel(quarter),
      status,
      data,
      notes,
    });

    Storage.update(_clientId, {
      last_report_date: report.created_at,
      last_report_data: data,
    });

    App.refreshDashboard();
    App.renderClients();
    close();
    App.toast(
      status === 'final' ? `Report finalized for ${quarter}.` : `Draft saved for ${quarter}.`,
      status === 'final' ? 'success' : 'info'
    );
  }

  // ── Report History ────────────────────────────────────────────────────────

  function openHistory(clientId) {
    const client  = Storage.getById(clientId);
    const reports = ReportStorage.getByClient(clientId);
    const overlay = document.getElementById('report-modal-overlay');
    overlay.classList.remove('hidden');
    overlay.innerHTML = `
      <div class="report-modal" style="max-width:520px">
        <div class="report-modal-header">
          <div class="report-modal-meta">
            <div class="report-modal-eyebrow">Report History</div>
            <div class="report-modal-title">${esc(client?.name || '')}</div>
          </div>
          <button class="drawer-close" onclick="ReportModule.close()">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="report-modal-body">
          ${reports.length === 0
            ? '<p style="color:var(--text-3);font-size:0.85rem">No reports yet for this client.</p>'
            : `<div class="report-history">
                ${reports.map(r => `
                  <div class="report-history-item">
                    <div class="rhi-left">
                      <span class="rhi-label">${esc(r.label)}</span>
                      <span class="rhi-date">${_fmtDate(r.created_at)}</span>
                    </div>
                    <span class="status-pill status-${r.status}">${r.status}</span>
                  </div>`).join('')}
              </div>`}
        </div>
        <div class="report-modal-footer">
          <div class="footer-left"></div>
          <div class="footer-right">
            <button class="btn btn-ghost" onclick="ReportModule.close()">Close</button>
            <button class="btn btn-primary" onclick="ReportModule.close(); ReportModule.openReport(${clientId})">
              <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Report
            </button>
          </div>
        </div>
      </div>`;
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  function _quarterOptions() {
    const opts = [];
    const now  = new Date();
    for (let i = 0; i < 8; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i * 3, 1);
      const q = Math.floor(d.getMonth() / 3) + 1;
      const v = `${d.getFullYear()}-Q${q}`;
      opts.push(`<option value="${v}" ${v === _preview.quarter ? 'selected' : ''}>${v}</option>`);
    }
    return opts.join('');
  }

  function _num(val) { const n = parseFloat(val); return isNaN(n) ? 0 : n; }

  function _fmtCurrency(val) {
    const n = _num(val);
    if (val == null || (val === '' && n === 0)) return '—';
    if (Math.abs(n) >= 1_000_000) return (n < 0 ? '-' : '') + '$' + (Math.abs(n)/1_000_000).toFixed(2) + 'M';
    if (Math.abs(n) >= 1_000)     return (n < 0 ? '-' : '') + '$' + (Math.abs(n)/1_000).toFixed(1) + 'K';
    return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0 });
  }

  function _fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { openReport, openHistory, close, save, _onInput, _useLast, _addInsurance };
})();
