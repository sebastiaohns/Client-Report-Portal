"""
Pydantic schemas for quarterly reports.

Report structure:
  SACS section — static profile fields + dynamic account balances + auto-calculated metrics
  TCC section  — reserve, home values, liabilities + auto-calculated totals

Each dynamic field carries:
  value         — current value (entered, inherited, or profile)
  source        — 'profile' | 'last_report' | 'manual'
  last_value    — prior quarter reference value
  is_incomplete — True if not yet entered for this quarter

Calculated metrics (read-only, derived server-side and in real-time on the frontend):
  SACS:
    excess                   = monthly_salary (inflow) - monthly_expense_budget (outflow)
    private_reserve_target   = (6 × monthly_expense_budget) + sum(insurance_deductibles)

  TCC:
    client1_retirement_total = sum of client 1's retirement account balances
    client2_retirement_total = sum of client 2's retirement account balances (if spouse)
    non_retirement_total     = sum of all non-retirement account balances (excl. trust)
    trust_value              = Zillow home value for trust property (manual entry)
    grand_total_net_worth    = client1_retirement + client2_retirement + non_retirement + trust_value
    liabilities_total        = sum of all liability balances (displayed separately, NOT subtracted)
"""
from __future__ import annotations

import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field


# ── Dynamic field envelope ────────────────────────────────────────────────────

class ReportField(BaseModel):
    """Wraps each dynamic value in the report with metadata."""
    value:         Decimal | None = None
    source:        Literal["profile", "last_report", "manual"] = "manual"
    last_value:    Decimal | None = None
    is_incomplete: bool = True


# ── SACS Calculated metrics ───────────────────────────────────────────────────

class SACSCalculated(BaseModel):
    """Auto-calculated SACS metrics — derived, not stored as inputs."""
    excess:                  Decimal   # inflow - outflow
    private_reserve_target:  Decimal   # (6 × monthly_expenses) + sum(insurance_deductibles)


# ── SACS Section ──────────────────────────────────────────────────────────────

class SACSData(BaseModel):
    # Static — pre-filled from profile, read-only in the form
    monthly_salary:          Decimal
    monthly_expense_budget:  Decimal

    # Insurance deductibles — manual entries used in reserve target formula
    # key = description (e.g. "Health Insurance Deductible"), value = amount
    insurance_deductibles:   dict[str, ReportField] = Field(default_factory=dict)

    # Dynamic balances — key = generated label e.g. "Roth IRA – Vanguard"
    account_balances:        dict[str, ReportField] = Field(default_factory=dict)

    # Calculated (populated by service, read-only in form)
    calculated:              SACSCalculated | None = None


# ── TCC Calculated metrics ────────────────────────────────────────────────────

class TCCCalculated(BaseModel):
    """Auto-calculated TCC totals — derived from entered balances."""
    client1_retirement_total: Decimal
    client2_retirement_total: Decimal   # 0.00 if no spouse
    non_retirement_total:     Decimal
    trust_value:              Decimal   # from home_values for trust property
    grand_total_net_worth:    Decimal   # c1_ret + c2_ret + non_ret + trust
    liabilities_total:        Decimal   # displayed separately, NOT subtracted


# ── TCC Section ───────────────────────────────────────────────────────────────

class TCCData(BaseModel):
    # Private reserve
    private_reserve_balance: ReportField = Field(default_factory=ReportField)
    private_reserve_target:  Decimal     # static from profile

    # Home values — one per mortgage/trust property address (Zillow lookup)
    home_values:             dict[str, ReportField] = Field(default_factory=dict)

    # Liability current balances
    liability_balances:      dict[str, ReportField] = Field(default_factory=dict)

    # Calculated (populated by service, read-only in form)
    calculated:              TCCCalculated | None = None


# ── Full report data ──────────────────────────────────────────────────────────

class ReportData(BaseModel):
    sacs: SACSData
    tcc:  TCCData


# ── Preview response ──────────────────────────────────────────────────────────

class ReportPreviewResponse(BaseModel):
    """
    Returned by GET /clients/{id}/reports/preview.
    Contains the pre-filled form ready for the advisor to review.
    """
    client_id:          int
    client_name:        str
    spouse_name:        str | None
    quarter:            str
    label:              str
    has_previous:       bool
    previous_date:      datetime.datetime | None
    data:               ReportData
    incomplete_count:   int


# ── Save / finalize ───────────────────────────────────────────────────────────

class ReportSaveRequest(BaseModel):
    """Payload sent when saving or finalizing a report."""
    quarter: str = Field(pattern=r"^\d{4}-Q[1-4]$")
    status:  Literal["draft", "final"] = "draft"
    data:    ReportData
    notes:   str | None = None


# ── Report response ───────────────────────────────────────────────────────────

class ReportResponse(BaseModel):
    id:         int
    client_id:  int
    quarter:    str
    label:      str
    status:     str
    data:       Any
    notes:      str | None
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = {"from_attributes": True}
