"""
PDF generation service — produces two-page financial reports.

SACS Report (sacs_report):
  Page 1: Cashflow diagram — green Inflow circle → red Outflow circle → blue Private Reserve
  Page 2: Private Reserve balance, investment account balances, target savings

TCC Report (tcc_report):
  Page 1: Retirement accounts (top), non-retirement (bottom), trust (center)
  Page 2: Liabilities section + grand totals summary

Both reports share a branded header (company blue) with client name and date.
"""
from __future__ import annotations

import io
from datetime import datetime
from decimal import Decimal
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

# ── Brand colors ──────────────────────────────────────────────────────────────
BLUE     = colors.HexColor("#1A4A8A")
BLUE_LT  = colors.HexColor("#E8EFF9")
GREEN    = colors.HexColor("#2E7D52")
GREEN_LT = colors.HexColor("#E8F5EE")
RED      = colors.HexColor("#C0392B")
RED_LT   = colors.HexColor("#FDECEA")
GRAY     = colors.HexColor("#F0F0F0")
GRAY_MID = colors.HexColor("#888888")
WHITE    = colors.white
BLACK    = colors.HexColor("#1A1A1A")

W, H = letter  # 612 x 792

# ── Helpers ───────────────────────────────────────────────────────────────────

def _fmt(val) -> str:
    try:
        n = float(val or 0)
    except (TypeError, ValueError):
        return "$0"
    if abs(n) >= 1_000_000:
        return f"{'−' if n < 0 else ''}${abs(n)/1_000_000:.2f}M"
    if abs(n) >= 1_000:
        return f"{'−' if n < 0 else ''}${abs(n)/1_000:,.1f}K"
    return f"{'−' if n < 0 else ''}${abs(n):,.0f}"


def _header(c: canvas.Canvas, title: str, client_name: str, date_str: str) -> None:
    """Draws the branded header bar at the top of every page."""
    c.setFillColor(BLUE)
    c.rect(0, H - 60, W, 60, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(36, H - 38, title)
    c.setFont("Helvetica", 10)
    c.drawRightString(W - 36, H - 28, client_name)
    c.drawRightString(W - 36, H - 42, date_str)
    # thin accent line
    c.setFillColor(colors.HexColor("#C9A84C"))
    c.rect(0, H - 63, W, 3, fill=1, stroke=0)


def _circle(c: canvas.Canvas, cx: float, cy: float, r: float,
            fill_color, label: str, amount: str, sub: str = "") -> None:
    """Filled circle with centered label + amount."""
    c.setFillColor(fill_color)
    c.circle(cx, cy, r, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(cx, cy + 10, label)
    c.setFont("Helvetica-Bold", 13)
    c.drawCentredString(cx, cy - 6, amount)
    if sub:
        c.setFont("Helvetica", 8)
        c.drawCentredString(cx, cy - 20, sub)


def _arrow(c: canvas.Canvas, x1: float, y: float, x2: float) -> None:
    """Horizontal arrow from x1 to x2."""
    c.setStrokeColor(GRAY_MID)
    c.setLineWidth(1.5)
    c.line(x1, y, x2, y)
    c.setFillColor(GRAY_MID)
    c.beginPath()
    c.moveTo(x2, y)
    c.lineTo(x2 - 8, y + 5)
    c.lineTo(x2 - 8, y - 5)
    c.closePath()
    c.fill()


def _box(c: canvas.Canvas, x: float, y: float, w: float, h: float,
         fill_color, label: str, value: str, note: str = "",
         label_color=None, value_color=None) -> None:
    """Rounded summary box."""
    c.setFillColor(fill_color)
    c.roundRect(x, y, w, h, 6, fill=1, stroke=0)
    lc = label_color or GRAY_MID
    vc = value_color or BLACK
    c.setFillColor(lc)
    c.setFont("Helvetica", 7)
    c.drawString(x + 10, y + h - 16, label.upper())
    c.setFillColor(vc)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(x + 10, y + h - 32, value)
    if note:
        c.setFillColor(GRAY_MID)
        c.setFont("Helvetica", 7)
        c.drawString(x + 10, y + 8, note)


def _bubble(c: canvas.Canvas, x: float, y: float, w: float, h: float,
            fill_color, border_color, lines: list[tuple[str, str, str]]) -> None:
    """
    Account / client info bubble.
    lines = list of (font_size_str, text, align) tuples.
    """
    c.setFillColor(fill_color)
    c.setStrokeColor(border_color)
    c.setLineWidth(1)
    c.roundRect(x, y, w, h, 8, fill=1, stroke=1)
    ty = y + h - 16
    for size, text, align in lines:
        c.setFont("Helvetica-Bold" if align == "bold" else "Helvetica", int(size))
        c.setFillColor(BLACK)
        if align in ("center", "bold"):
            c.drawCentredString(x + w / 2, ty, text)
        elif align == "right":
            c.drawRightString(x + w - 10, ty, text)
        else:
            c.drawString(x + 10, ty, text)
        ty -= int(size) + 3


# ── SACS PDF ──────────────────────────────────────────────────────────────────

def generate_sacs_pdf(report_data: dict, client_name: str, spouse_name: str | None,
                      quarter: str) -> bytes:
    buf = io.BytesIO()
    c   = canvas.Canvas(buf, pagesize=letter)
    date_str = datetime.now().strftime("%B %d, %Y")

    # ── PAGE 1: Cashflow diagram ──────────────────────────────────────────────
    _header(c, "SACS — Cashflow Summary", client_name, date_str)

    static  = report_data.get("sacs_static", {})
    calc    = report_data.get("sacs_calculated", {})
    reserve = report_data.get("tcc_private_reserve", {})

    salary   = float(static.get("monthly_salary", 0))
    expenses = float(static.get("monthly_expense_budget", 0))
    excess   = float(calc.get("excess", salary - expenses))
    res_bal  = float((reserve.get("balance") or {}).get("value") or 0)
    res_tgt  = float(reserve.get("target") or 0)

    # Row 1: Inflow → Outflow → Excess
    cy1 = H - 220
    r   = 72
    cx_in  = 130
    cx_out = 310
    cx_ex  = 490

    _circle(c, cx_in,  cy1, r, GREEN, "INFLOW",  _fmt(salary),   "/month")
    _arrow(c,  cx_in + r, cy1, cx_out - r)
    _circle(c, cx_out, cy1, r, RED,   "OUTFLOW", _fmt(expenses), "/month")
    _arrow(c,  cx_out + r, cy1, cx_ex - r)

    ex_color = GREEN if excess >= 0 else RED
    _circle(c, cx_ex, cy1, r, ex_color, "EXCESS", _fmt(excess), "/month")

    # Label row
    c.setFillColor(GRAY_MID)
    c.setFont("Helvetica", 8)
    for cx, lbl in [(cx_in, "Monthly Salary"), (cx_out, "Expense Budget"), (cx_ex, "Surplus / Deficit")]:
        c.drawCentredString(cx, cy1 - r - 14, lbl)

    # Arrow down from Excess to Private Reserve
    c.setStrokeColor(BLUE)
    c.setLineWidth(1.5)
    c.line(cx_ex, cy1 - r, cx_ex, cy1 - r - 40)
    c.setFillColor(BLUE)
    c.beginPath()
    c.moveTo(cx_ex, cy1 - r - 50)
    c.lineTo(cx_ex - 6, cy1 - r - 40)
    c.lineTo(cx_ex + 6, cy1 - r - 40)
    c.closePath()
    c.fill()

    # Row 2: Private Reserve block
    cy2 = cy1 - r - 130
    bw, bh = 240, 90
    bx = cx_ex - bw / 2
    c.setFillColor(BLUE_LT)
    c.setStrokeColor(BLUE)
    c.setLineWidth(1.5)
    c.roundRect(bx, cy2, bw, bh, 10, fill=1, stroke=1)
    c.setFillColor(BLUE)
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(cx_ex, cy2 + bh - 18, "PRIVATE RESERVE")
    c.setFillColor(BLACK)
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(cx_ex, cy2 + bh - 42, _fmt(res_bal))
    c.setFillColor(GRAY_MID)
    c.setFont("Helvetica", 9)
    c.drawCentredString(cx_ex, cy2 + 14, f"Target: {_fmt(res_tgt)}")

    # SACS Calculated summary boxes
    calc_y = cy2 - 100
    bx2, bw2, bh2, gap = 36, 170, 70, 14
    reserve_target = float(calc.get("private_reserve_target", res_tgt))
    boxes = [
        (GRAY, "Monthly Excess",          _fmt(excess),         "Inflow − Outflow"),
        (BLUE_LT, "Private Reserve Target", _fmt(reserve_target), "6× expenses + deductibles"),
    ]
    for i, (fc, lbl, val, note) in enumerate(boxes):
        _box(c, bx2 + i * (bw2 + gap), calc_y, bw2, bh2, fc, lbl, val, note,
             value_color=(GREEN if excess >= 0 and i == 0 else (RED if excess < 0 and i == 0 else BLUE)))

    c.showPage()

    # ── PAGE 2: Account balances ──────────────────────────────────────────────
    _header(c, "SACS — Account Balances", client_name, date_str)

    balances = report_data.get("sacs_account_balances", {})
    deductibles = report_data.get("sacs_insurance_deductibles", {})

    y = H - 100
    c.setFillColor(BLACK)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(36, y, "Investment Account Balances")
    y -= 24

    if not balances:
        c.setFillColor(GRAY_MID)
        c.setFont("Helvetica", 10)
        c.drawString(36, y, "No accounts on record.")
        y -= 20
    else:
        col_w = (W - 72 - 20) / 2
        col   = 0
        row_h = 64
        for label, field in balances.items():
            val = float((field.get("value") or 0))
            src = field.get("source", "manual")
            bx_c = 36 + col * (col_w + 20)
            _bubble(c, bx_c, y - row_h, col_w, row_h,
                    GREEN_LT if "retirement" not in label.lower() else BLUE_LT,
                    GREEN    if "retirement" not in label.lower() else BLUE,
                    [("9", label, "left"), ("14", _fmt(val), "bold"),
                     ("7", f"Source: {src}", "left")])
            col += 1
            if col == 2:
                col = 0
                y -= row_h + 10
        if col:
            y -= row_h + 10

    # Insurance deductibles
    if deductibles:
        y -= 20
        c.setFillColor(BLACK)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(36, y, "Insurance Deductibles")
        y -= 20
        for label, field in deductibles.items():
            val = float((field.get("value") or 0))
            c.setFont("Helvetica", 10)
            c.setFillColor(BLACK)
            c.drawString(46, y, f"• {label}:")
            c.drawRightString(W - 36, y, _fmt(val))
            y -= 16

    c.save()
    return buf.getvalue()


# ── TCC PDF ───────────────────────────────────────────────────────────────────

def generate_tcc_pdf(report_data: dict, client_name: str, spouse_name: str | None,
                     quarter: str, client_dob: str = "", spouse_dob: str = "",
                     client_ssn_last4: str = "****", spouse_ssn_last4: str = "****",
                     client_age: int = 0, spouse_age: int = 0) -> bytes:
    buf = io.BytesIO()
    c   = canvas.Canvas(buf, pagesize=letter)
    date_str = datetime.now().strftime("%B %d, %Y")

    calc    = report_data.get("tcc_calculated", {})
    balances = report_data.get("sacs_account_balances", {})
    liabs   = report_data.get("tcc_liability_balances", {})
    homes   = report_data.get("tcc_home_values", {})
    reserve = report_data.get("tcc_private_reserve", {})

    ret_types = {"IRA", "Roth IRA", "401k", "Pension"}

    # Separate accounts
    c1_ret  = {k: v for k, v in balances.items() if v.get("owner") == "client1" and v.get("acct_type") in ret_types}
    c2_ret  = {k: v for k, v in balances.items() if v.get("owner") == "client2"}
    non_ret = {k: v for k, v in balances.items() if v.get("owner") == "client1" and v.get("acct_type") not in ret_types}

    # ── PAGE 1: Accounts layout ───────────────────────────────────────────────
    _header(c, "TCC — Total Client Capital", client_name, date_str)

    # Client info bubbles
    bw, bh = 220, 80
    by = H - 165

    def _client_bubble(bx, name, age, dob, ssn4, is_spouse=False):
        _bubble(c, bx, by, bw, bh, GREEN_LT, GREEN, [
            ("10", f"{'Spouse: ' if is_spouse else 'Client: '}{name}", "bold"),
            ("9",  f"Age: {age}   DOB: {dob}", "left"),
            ("9",  f"SSN: ***-**-{ssn4}", "left"),
        ])

    _client_bubble(36, client_name, client_age, client_dob, client_ssn_last4)
    if spouse_name:
        _client_bubble(W - 36 - bw, spouse_name, spouse_age, spouse_dob, spouse_ssn_last4, is_spouse=True)

    # ── Section renderer helper ───────────────────────────────────────────────
    def _accounts_section(title, accts: dict, start_y: float, fill, border) -> float:
        c.setFillColor(BLACK)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(36, start_y, title)
        y = start_y - 18
        if not accts:
            c.setFillColor(GRAY_MID)
            c.setFont("Helvetica", 9)
            c.drawString(46, y, "No accounts.")
            return y - 20
        col_w = (W - 72 - 16) / 3
        col   = 0
        row_h = 72
        for label, field in accts.items():
            val      = float(field.get("value") or 0)
            acct_num = field.get("account_number_last4") or "****"
            bx_c     = 36 + col * (col_w + 8)
            _bubble(c, bx_c, y - row_h, col_w, row_h, fill, border, [
                ("8",  label, "left"),
                ("7",  f"Acct: ...{acct_num}", "left"),
                ("13", _fmt(val), "bold"),
            ])
            col += 1
            if col == 3:
                col = 0
                y  -= row_h + 8
        if col:
            y -= row_h + 8
        return y - 10

    y = H - 270
    y = _accounts_section("Client 1 — Retirement Accounts", c1_ret,  y, BLUE_LT, BLUE)
    if spouse_name and c2_ret:
        y = _accounts_section(f"{spouse_name} — Retirement Accounts", c2_ret, y, BLUE_LT, BLUE)
    y = _accounts_section("Non-Retirement Accounts", non_ret, y, GREEN_LT, GREEN)

    # Trust section
    trust_entries = {k: v for k, v in homes.items() if "(Trust)" in k}
    if trust_entries:
        y -= 6
        c.setFillColor(BLACK)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(36, y, "Trust Properties")
        y -= 18
        for addr, field in trust_entries.items():
            val = float(field.get("value") or 0)
            addr_clean = addr.replace(" (Trust)", "")
            _box(c, 36, y - 52, W - 72, 52, GRAY, addr_clean, _fmt(val), "Zillow estimated value",
                 label_color=BLUE, value_color=BLUE)
            y -= 62

    c.showPage()

    # ── PAGE 2: Summary totals + Liabilities ─────────────────────────────────
    _header(c, "TCC — Totals & Liabilities", client_name, date_str)

    # Summary boxes
    c1_total   = float(calc.get("client1_retirement_total", 0))
    c2_total   = float(calc.get("client2_retirement_total", 0))
    non_total  = float(calc.get("non_retirement_total", 0))
    trust_val  = float(calc.get("trust_value", 0))
    grand      = float(calc.get("grand_total_net_worth", 0))
    liab_total = float(calc.get("liabilities_total", 0))

    sy = H - 110
    sw = (W - 72 - 24) / 4

    summary_items = [
        ("Client 1 Retirement",   _fmt(c1_total),  BLUE_LT,  BLUE),
        (f"{'Spouse' if spouse_name else 'Client 2'} Retirement", _fmt(c2_total), BLUE_LT, BLUE),
        ("Non-Retirement Total",  _fmt(non_total), GREEN_LT, GREEN),
        ("Trust Value",           _fmt(trust_val), GRAY,     GRAY_MID),
    ]
    for i, (lbl, val, fc, vc) in enumerate(summary_items):
        _box(c, 36 + i * (sw + 8), sy - 66, sw, 66, fc, lbl, val, value_color=vc)

    # Grand total
    _box(c, 36, sy - 150, W - 72, 68, BLUE, "GRAND TOTAL NET WORTH",
         _fmt(grand), "Client 1 Retirement + Client 2 Retirement + Non-Retirement + Trust",
         label_color=WHITE, value_color=WHITE)
    c.setFillColor(BLUE)
    c.roundRect(36, sy - 150, W - 72, 68, 6, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(46, sy - 82 + 52, "GRAND TOTAL NET WORTH")
    c.setFont("Helvetica-Bold", 22)
    c.drawString(46, sy - 82 + 28, _fmt(grand))
    c.setFont("Helvetica", 8)
    c.drawString(46, sy - 82 + 10, "C1 Retirement + C2 Retirement + Non-Retirement + Trust")

    # Liabilities section
    ly = sy - 180
    c.setFillColor(BLACK)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(36, ly, "Liabilities")
    c.setFillColor(GRAY_MID)
    c.setFont("Helvetica", 9)
    c.drawString(36, ly - 14, "Displayed separately — not subtracted from net worth")
    ly -= 34

    # Table header
    c.setFillColor(GRAY)
    c.rect(36, ly - 20, W - 72, 20, fill=1, stroke=0)
    c.setFillColor(GRAY_MID)
    c.setFont("Helvetica-Bold", 8)
    for x, lbl in [(46, "LIABILITY"), (220, "INSTITUTION"), (360, "INTEREST RATE"), (470, "BALANCE")]:
        c.drawString(x, ly - 14, lbl)
    ly -= 20

    if not liabs:
        c.setFillColor(GRAY_MID)
        c.setFont("Helvetica", 9)
        c.drawString(46, ly - 16, "No liabilities on record.")
        ly -= 24
    else:
        for i, (label, field) in enumerate(liabs.items()):
            val  = float(field.get("value") or 0)
            rate = field.get("interest_rate", 0) or 0
            parts = label.split(" – ")
            lib_type = parts[0] if parts else label
            inst     = parts[1] if len(parts) > 1 else "—"
            row_color = WHITE if i % 2 == 0 else GRAY
            c.setFillColor(row_color)
            c.rect(36, ly - 18, W - 72, 18, fill=1, stroke=0)
            c.setFillColor(BLACK)
            c.setFont("Helvetica", 9)
            c.drawString(46,  ly - 13, lib_type)
            c.drawString(220, ly - 13, inst)
            c.drawString(360, ly - 13, f"{rate:.2f}%")
            c.drawString(470, ly - 13, _fmt(val))
            ly -= 18

    # Liabilities total
    c.setFillColor(RED_LT)
    c.rect(36, ly - 28, W - 72, 28, fill=1, stroke=0)
    c.setFillColor(RED)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(46,      ly - 18, "LIABILITIES TOTAL")
    c.drawRightString(W - 42, ly - 18, _fmt(liab_total))

    c.save()
    return buf.getvalue()


# ── Public interface ──────────────────────────────────────────────────────────

def build_sacs_pdf(report: Any, client: Any, spouse: Any = None) -> bytes:
    return generate_sacs_pdf(
        report_data=report.data,
        client_name=client.name,
        spouse_name=spouse.name if spouse else None,
        quarter=report.quarter,
    )


def build_tcc_pdf(report: Any, client: Any, spouse: Any = None) -> bytes:
    return generate_tcc_pdf(
        report_data=report.data,
        client_name=client.name,
        spouse_name=spouse.name if spouse else None,
        quarter=report.quarter,
        client_dob=str(client.dob) if client.dob else "",
        spouse_dob=str(spouse.dob) if spouse and spouse.dob else "",
        client_age=client.age if hasattr(client, "age") else 0,
        spouse_age=spouse.age if spouse and hasattr(spouse, "age") else 0,
    )
