/**
 * ReportPDF — client-side PDF generation using jsPDF.
 * Mirrors the backend pdf_service.py layout exactly.
 * Loaded via CDN: https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js
 */

const ReportPDF = (() => {

  // ── Brand colors (RGB) ────────────────────────────────────────────────────
  const BLUE      = [26, 74, 138];
  const BLUE_LT   = [232, 239, 249];
  const GREEN     = [46, 125, 82];
  const GREEN_LT  = [232, 245, 238];
  const RED       = [192, 57, 43];
  const RED_LT    = [253, 236, 234];
  const GRAY      = [240, 240, 240];
  const GRAY_MID  = [136, 136, 136];
  const GOLD      = [201, 168, 76];
  const WHITE     = [255, 255, 255];
  const BLACK     = [26, 26, 26];

  const W = 210, H = 297;  // A4 mm

  function _fmt(val) {
    const n = parseFloat(val || 0);
    if (isNaN(n)) return '$0';
    if (Math.abs(n) >= 1e6)  return `${n<0?'−':''}$${(Math.abs(n)/1e6).toFixed(2)}M`;
    if (Math.abs(n) >= 1000) return `${n<0?'−':''}$${(Math.abs(n)/1000).toFixed(1)}K`;
    return `${n<0?'−$':'$'}${Math.abs(n).toLocaleString('en-US',{maximumFractionDigits:0})}`;
  }

  function _header(doc, title, clientName, dateStr) {
    doc.setFillColor(...BLUE);
    doc.rect(0, 0, W, 22, 'F');
    doc.setFillColor(...GOLD);
    doc.rect(0, 22, W, 1.2, 'F');
    doc.setTextColor(...WHITE);
    doc.setFont('helvetica','bold'); doc.setFontSize(14);
    doc.text(title, 12, 14);
    doc.setFont('helvetica','normal'); doc.setFontSize(9);
    doc.text(clientName, W - 12, 10, {align:'right'});
    doc.text(dateStr,    W - 12, 16, {align:'right'});
    doc.setTextColor(...BLACK);
  }

  function _circle(doc, cx, cy, r, color, label, amount, sub) {
    doc.setFillColor(...color);
    doc.circle(cx, cy, r, 'F');
    doc.setTextColor(...WHITE);
    doc.setFont('helvetica','bold'); doc.setFontSize(9);
    doc.text(label,  cx, cy - 2, {align:'center'});
    doc.setFontSize(11);
    doc.text(amount, cx, cy + 5, {align:'center'});
    if (sub) { doc.setFontSize(7); doc.text(sub, cx, cy + 11, {align:'center'}); }
    doc.setTextColor(...BLACK);
  }

  function _arrow(doc, x1, y, x2) {
    doc.setDrawColor(...GRAY_MID); doc.setLineWidth(0.5);
    doc.line(x1, y, x2 - 3, y);
    doc.setFillColor(...GRAY_MID);
    doc.triangle(x2, y, x2-3, y-2, x2-3, y+2, 'F');
  }

  function _box(doc, x, y, w, h, fillColor, label, value, note, valueColor) {
    doc.setFillColor(...fillColor);
    doc.roundedRect(x, y, w, h, 2, 2, 'F');
    doc.setTextColor(...GRAY_MID); doc.setFont('helvetica','normal'); doc.setFontSize(6.5);
    doc.text(label.toUpperCase(), x + 4, y + 7);
    doc.setTextColor(...(valueColor || BLACK)); doc.setFont('helvetica','bold'); doc.setFontSize(11);
    doc.text(value, x + 4, y + 15);
    if (note) { doc.setTextColor(...GRAY_MID); doc.setFont('helvetica','normal'); doc.setFontSize(6); doc.text(note, x + 4, y + h - 3); }
    doc.setTextColor(...BLACK);
  }

  function _bubble(doc, x, y, w, h, fillColor, borderColor, lines) {
    doc.setFillColor(...fillColor);
    doc.setDrawColor(...borderColor); doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, h, 3, 3, 'FD');
    let ty = y + 8;
    for (const [size, text, align] of lines) {
      doc.setFont('helvetica', align === 'bold' ? 'bold' : 'normal');
      doc.setFontSize(parseInt(size));
      doc.setTextColor(...BLACK);
      const tx = align === 'center' || align === 'bold' ? x + w/2 : (align === 'right' ? x + w - 3 : x + 4);
      doc.text(text || '', tx, ty, {align: align === 'bold' ? 'center' : (align === 'right' ? 'right' : 'left'), maxWidth: w - 8});
      ty += parseInt(size) * 0.42 + 2;
    }
    doc.setTextColor(...BLACK);
  }

  // ── SACS PDF ──────────────────────────────────────────────────────────────
  function generateSACS(report, client) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const dateStr   = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
    const rd        = report.data || {};
    const staticD   = rd.sacs_static || {};
    const calc      = rd.sacs_calculated || {};
    const reserveD  = rd.tcc_private_reserve || {};
    const balances  = rd.sacs_account_balances || {};
    const deductibles = rd.sacs_insurance_deductibles || {};

    const salary   = parseFloat(staticD.monthly_salary || 0);
    const expenses = parseFloat(staticD.monthly_expense_budget || 0);
    const excess   = parseFloat(calc.excess ?? (salary - expenses));
    const resBal   = parseFloat((reserveD.balance || {}).value || 0);
    const resTgt   = parseFloat(calc.private_reserve_target || reserveD.target || 0);

    // Page 1 — Cashflow diagram
    _header(doc, 'SACS — Cashflow Summary', client.name, dateStr);

    const cy1 = 80, r = 22;
    const cx1 = 42, cx2 = 105, cx3 = 168;

    _circle(doc, cx1, cy1, r, GREEN, 'INFLOW',  _fmt(salary),   '/month');
    _arrow(doc, cx1 + r, cy1, cx2 - r);
    _circle(doc, cx2, cy1, r, RED,   'OUTFLOW', _fmt(expenses), '/month');
    _arrow(doc, cx2 + r, cy1, cx3 - r);
    _circle(doc, cx3, cy1, r, excess >= 0 ? GREEN : RED, 'EXCESS', _fmt(excess), '/month');

    doc.setTextColor(...GRAY_MID); doc.setFontSize(7.5);
    [['Monthly Salary', cx1], ['Expense Budget', cx2], ['Surplus / Deficit', cx3]].forEach(([lbl, cx]) =>
      doc.text(lbl, cx, cy1 + r + 6, {align:'center'})
    );

    // Arrow down to private reserve
    doc.setDrawColor(...BLUE); doc.setLineWidth(0.5);
    doc.line(cx3, cy1 + r + 0.5, cx3, cy1 + r + 16);
    doc.setFillColor(...BLUE);
    doc.triangle(cx3, cy1 + r + 19, cx3 - 2.5, cy1 + r + 16, cx3 + 2.5, cy1 + r + 16, 'F');

    // Private Reserve block
    const bx = cx3 - 30, by = cy1 + r + 20, bw = 60, bh = 26;
    doc.setFillColor(...BLUE_LT); doc.setDrawColor(...BLUE); doc.setLineWidth(0.4);
    doc.roundedRect(bx, by, bw, bh, 2, 2, 'FD');
    doc.setTextColor(...BLUE); doc.setFont('helvetica','bold'); doc.setFontSize(8);
    doc.text('PRIVATE RESERVE', cx3, by + 8, {align:'center'});
    doc.setTextColor(...BLACK); doc.setFontSize(13);
    doc.text(_fmt(resBal), cx3, by + 17, {align:'center'});
    doc.setTextColor(...GRAY_MID); doc.setFont('helvetica','normal'); doc.setFontSize(7);
    doc.text(`Target: ${_fmt(resTgt)}`, cx3, by + bh - 3, {align:'center'});
    doc.setTextColor(...BLACK);

    // Summary boxes
    const sy = 170, sw = 84, sh = 24;
    _box(doc, 12,       sy, sw, sh, GRAY,    'Monthly Excess',          _fmt(excess),  'Inflow − Outflow',                     excess >= 0 ? GREEN : RED);
    _box(doc, 12+sw+6,  sy, sw, sh, BLUE_LT, 'Private Reserve Target', _fmt(resTgt),  '6× expenses + deductibles',            BLUE);

    doc.addPage();

    // Page 2 — Account balances
    _header(doc, 'SACS — Account Balances', client.name, dateStr);

    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(...BLACK);
    doc.text('Investment Account Balances', 12, 32);

    const entries = Object.entries(balances);
    if (!entries.length) {
      doc.setTextColor(...GRAY_MID); doc.setFontSize(9); doc.text('No accounts on record.', 14, 42);
    } else {
      const bw2 = 88, bh2 = 22, gap2 = 6;
      let col = 0, row_y = 38;
      for (const [label, field] of entries) {
        const val = _fmt(parseFloat(field.value || 0));
        const src = field.source || 'manual';
        const isRet = ['IRA','Roth IRA','401k','Pension'].some(t => label.startsWith(t));
        _bubble(doc, 12 + col * (bw2 + gap2), row_y, bw2, bh2, isRet ? BLUE_LT : GREEN_LT, isRet ? BLUE : GREEN, [
          ['7.5', label, 'left'], ['11', val, 'bold'], ['6.5', `Source: ${src}`, 'left']
        ]);
        col++;
        if (col === 2) { col = 0; row_y += bh2 + 5; }
      }
      if (col) row_y += bh2 + 5;

      if (Object.keys(deductibles).length) {
        doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(...BLACK);
        doc.text('Insurance Deductibles', 12, row_y + 8);
        let dy = row_y + 16;
        for (const [lbl, f] of Object.entries(deductibles)) {
          doc.setFont('helvetica','normal'); doc.setFontSize(9);
          doc.text(`• ${lbl}`, 16, dy);
          doc.text(_fmt(f.value || 0), W - 12, dy, {align:'right'});
          dy += 7;
        }
      }
    }

    return doc.output('arraybuffer');
  }

  // ── TCC PDF ───────────────────────────────────────────────────────────────
  function generateTCC(report, client) {
    const { jsPDF } = window.jspdf;
    const doc     = new jsPDF({ unit: 'mm', format: 'a4' });
    const dateStr = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
    const rd      = report.data || {};
    const calc    = rd.tcc_calculated || {};
    const balances = rd.sacs_account_balances || {};
    const liabs   = rd.tcc_liability_balances || {};
    const homes   = rd.tcc_home_values || {};
    const reserve = rd.tcc_private_reserve || {};

    const retTypes = new Set(['IRA','Roth IRA','401k','Pension']);
    const c1Ret    = Object.fromEntries(Object.entries(balances).filter(([,v]) => v.owner==='client1' && retTypes.has(v.acct_type)));
    const c2Ret    = Object.fromEntries(Object.entries(balances).filter(([,v]) => v.owner==='client2'));
    const nonRet   = Object.fromEntries(Object.entries(balances).filter(([,v]) => v.owner==='client1' && !retTypes.has(v.acct_type)));
    const trustH   = Object.fromEntries(Object.entries(homes).filter(([k]) => k.includes('(Trust)')));

    const spouse = client.spouse_id ? Storage.getById(client.spouse_id) : null;

    // Page 1 — Accounts
    _header(doc, 'TCC — Total Client Capital', client.name, dateStr);

    // Client info bubbles
    const bw = 84, bh = 22;
    _bubble(doc, 12, 26, bw, bh, GREEN_LT, GREEN, [
      ['9', `Client: ${client.name}`, 'bold'],
      ['7.5', `Age: ${client.age || '—'}   DOB: ${client.dob || '—'}`, 'left'],
    ]);
    if (spouse) {
      _bubble(doc, W - 12 - bw, 26, bw, bh, GREEN_LT, GREEN, [
        ['9', `Spouse: ${spouse.name}`, 'bold'],
        ['7.5', `Age: ${spouse.age || '—'}   DOB: ${spouse.dob || '—'}`, 'left'],
      ]);
    }

    // Account sections
    function accountsSection(title, accts, startY, fill, border) {
      doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(...BLACK);
      doc.text(title, 12, startY);
      let y = startY + 6;
      if (!Object.keys(accts).length) {
        doc.setTextColor(...GRAY_MID); doc.setFont('helvetica','normal'); doc.setFontSize(8);
        doc.text('No accounts.', 16, y + 4);
        return y + 12;
      }
      const aw = 58, ah = 20, ag = 4;
      let col = 0;
      for (const [label, field] of Object.entries(accts)) {
        const val = _fmt(parseFloat(field.value || 0));
        _bubble(doc, 12 + col*(aw+ag), y, aw, ah, fill, border, [
          ['7', label, 'left'], ['10', val, 'bold'], ['6', `Source: ${field.source||'—'}`, 'left']
        ]);
        col++;
        if (col === 3) { col = 0; y += ah + 4; }
      }
      if (col) y += ah + 4;
      return y + 4;
    }

    let y = 54;
    y = accountsSection('Client 1 — Retirement Accounts', c1Ret, y, BLUE_LT, BLUE);
    if (spouse && Object.keys(c2Ret).length)
      y = accountsSection(`${spouse.name} — Retirement Accounts`, c2Ret, y, BLUE_LT, BLUE);
    y = accountsSection('Non-Retirement Accounts', nonRet, y, GREEN_LT, GREEN);

    // Trust
    if (Object.keys(trustH).length) {
      doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(...BLACK);
      doc.text('Trust Properties', 12, y);
      y += 5;
      for (const [addr, field] of Object.entries(trustH)) {
        _box(doc, 12, y, W - 24, 18, GRAY, addr.replace(' (Trust)',''), _fmt(field.value||0), 'Zillow estimated value', BLUE);
        y += 22;
      }
    }

    doc.addPage();

    // Page 2 — Totals + Liabilities
    _header(doc, 'TCC — Totals & Liabilities', client.name, dateStr);

    const c1Total   = parseFloat(calc.client1_retirement_total || 0);
    const c2Total   = parseFloat(calc.client2_retirement_total || 0);
    const nonTotal  = parseFloat(calc.non_retirement_total || 0);
    const trustVal  = parseFloat(calc.trust_value || 0);
    const grand     = parseFloat(calc.grand_total_net_worth || 0);
    const liabTotal = parseFloat(calc.liabilities_total || 0);

    // Summary boxes
    const sw2 = 44, sh2 = 22, sx = 12, sy2 = 30;
    const summaries = [
      ['Client 1 Retirement', _fmt(c1Total), BLUE_LT, BLUE],
      [`${spouse?.name?.split(' ')[0] || 'Client 2'} Retirement`, _fmt(c2Total), BLUE_LT, BLUE],
      ['Non-Retirement', _fmt(nonTotal), GREEN_LT, GREEN],
      ['Trust Value', _fmt(trustVal), GRAY, GRAY_MID],
    ];
    summaries.forEach(([lbl, val, fc, vc], i) =>
      _box(doc, sx + i*(sw2+4), sy2, sw2, sh2, fc, lbl, val, '', vc)
    );

    // Grand total
    const gy = sy2 + sh2 + 6;
    doc.setFillColor(...BLUE); doc.roundedRect(12, gy, W-24, 24, 2, 2, 'F');
    doc.setTextColor(...WHITE); doc.setFont('helvetica','bold');
    doc.setFontSize(8); doc.text('GRAND TOTAL NET WORTH', 16, gy + 8);
    doc.setFontSize(16); doc.text(_fmt(grand), 16, gy + 18);
    doc.setFont('helvetica','normal'); doc.setFontSize(6.5);
    doc.text('C1 Retirement + C2 Retirement + Non-Retirement + Trust', W-16, gy + 18, {align:'right'});
    doc.setTextColor(...BLACK);

    // Liabilities table
    let ly = gy + 34;
    doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.text('Liabilities', 12, ly);
    doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(...GRAY_MID);
    doc.text('Displayed separately — not subtracted from net worth', 12, ly + 5);
    ly += 12;

    // Table header
    doc.setFillColor(...GRAY); doc.rect(12, ly, W-24, 8, 'F');
    doc.setTextColor(...GRAY_MID); doc.setFont('helvetica','bold'); doc.setFontSize(7);
    [['LIABILITY', 16], ['INSTITUTION', 66], ['RATE', 126], ['BALANCE', 160]].forEach(([t, x]) => doc.text(t, x, ly + 5.5));
    ly += 8;

    const liabEntries = Object.entries(liabs);
    if (!liabEntries.length) {
      doc.setTextColor(...GRAY_MID); doc.setFont('helvetica','normal'); doc.setFontSize(8);
      doc.text('No liabilities on record.', 16, ly + 6);
      ly += 12;
    } else {
      liabEntries.forEach(([label, field], i) => {
        const parts = label.split(' – ');
        const val   = _fmt(parseFloat(field.value || 0));
        const rate  = `${parseFloat(field.interest_rate || 0).toFixed(2)}%`;
        if (i % 2 === 0) { doc.setFillColor(...GRAY); doc.rect(12, ly, W-24, 8, 'F'); }
        doc.setTextColor(...BLACK); doc.setFont('helvetica','normal'); doc.setFontSize(8);
        doc.text(parts[0] || '', 16,  ly + 5.5);
        doc.text(parts[1] || '—', 66, ly + 5.5);
        doc.text(rate, 126, ly + 5.5);
        doc.text(val,  160, ly + 5.5);
        ly += 8;
      });
    }

    // Liabilities total row
    doc.setFillColor(...RED_LT); doc.rect(12, ly, W-24, 10, 'F');
    doc.setTextColor(...RED); doc.setFont('helvetica','bold'); doc.setFontSize(9);
    doc.text('LIABILITIES TOTAL', 16, ly + 7);
    doc.text(_fmt(liabTotal), W-16, ly + 7, {align:'right'});

    return doc.output('arraybuffer');
  }

  return { generateSACS, generateTCC };
})();
