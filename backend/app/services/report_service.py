"""
ReportService
─────────────
preview() → builds the pre-filled report form for a client
save()    → persists the report and updates last_report_date on the client
list()    → report history for a client
get()     → single report detail

Calculated metrics (server-side, also mirrored real-time on the frontend):

  SACS:
    excess                  = monthly_salary - monthly_expense_budget
    private_reserve_target  = (6 × monthly_expense_budget) + sum(insurance_deductibles)

  TCC:
    client1_retirement_total = sum of client 1 retirement balances
    client2_retirement_total = sum of spouse (client 2) retirement balances
    non_retirement_total     = sum of all non-retirement balances (excluding trust)
    trust_value              = home_value for the trust property address (if any)
    grand_total_net_worth    = c1_ret + c2_ret + non_ret + trust_value
    liabilities_total        = sum of all liability balances (separate, NOT subtracted)
"""
from __future__ import annotations

import datetime
from decimal import Decimal

from app.core.exceptions import NotFoundException
from app.models.client import Client
from app.models.report import Report
from app.schemas.report import (
    ReportData,
    ReportField,
    ReportPreviewResponse,
    ReportResponse,
    ReportSaveRequest,
    SACSCalculated,
    SACSData,
    TCCCalculated,
    TCCData,
)

ZERO = Decimal("0.00")


def _current_quarter() -> str:
    now = datetime.date.today()
    q = (now.month - 1) // 3 + 1
    return f"{now.year}-Q{q}"


def _quarter_label(q: str) -> str:
    year, qn = q.split("-")
    return f"{qn} {year} Report"


def _dec(val) -> Decimal:
    try:
        return Decimal(str(val))
    except Exception:
        return ZERO


# ── Calculated metrics ────────────────────────────────────────────────────────

def _calc_sacs(sacs: SACSData) -> SACSCalculated:
    inflow  = _dec(sacs.monthly_salary)
    outflow = _dec(sacs.monthly_expense_budget)
    excess  = inflow - outflow

    insurance_sum = sum(
        _dec(f.value) for f in sacs.insurance_deductibles.values()
        if f.value is not None
    )
    reserve_target = (Decimal("6") * outflow) + insurance_sum

    return SACSCalculated(
        excess=excess,
        private_reserve_target=reserve_target,
    )


def _calc_tcc(
    tcc: TCCData,
    client: Client,
    spouse: Client | None,
    trust_address_key: str | None,
) -> TCCCalculated:
    # Client 1 retirement total — only accounts belonging to this client
    c1_ret = sum(
        _dec(f.value)
        for k, f in tcc.private_reserve_balance.__class__.__mro__  # placeholder
        if False  # filled below
    )
    # Build from account_balances using the SACS data passed in separately
    # (TCCCalculated receives pre-computed subtotals from the service caller)
    return tcc.calculated  # type: ignore  # handled in preview()


def _build_tcc_calculated(
    sacs_balances: dict[str, ReportField],
    tcc: TCCData,
    client: Client,
    spouse: Client | None,
    trust_address_key: str | None,
) -> TCCCalculated:
    """
    Derive all TCC totals from entered balances.

    client1_retirement_total — retirement accounts belonging to client 1
    client2_retirement_total — retirement accounts belonging to spouse (client 2)
    non_retirement_total     — all non-retirement accounts (excludes trust home value)
    trust_value              — home_values entry whose key ends with "(Trust)"
    grand_total_net_worth    — c1 + c2 + non_ret + trust_value
    liabilities_total        — sum of liability balances (displayed separately)
    """
    ret_types     = {"IRA", "Roth IRA", "401k", "Pension"}
    non_ret_types = {"Brokerage", "Joint"}

    c1_name   = (client.name or "").split()[0]
    c2_name   = (spouse.name.split()[0] if spouse else None)

    c1_ret = ZERO
    c2_ret = ZERO
    non_ret = ZERO

    for label, field in sacs_balances.items():
        if field.value is None:
            continue
        val = _dec(field.value)
        # Determine account type from label prefix (e.g. "Roth IRA – Vanguard")
        acct_type = label.split(" – ")[0]
        if acct_type in ret_types:
            # Assign to client 1 or 2 by institution label convention
            # If label contains spouse name, assign to client 2
            if c2_name and c2_name.lower() in label.lower():
                c2_ret += val
            else:
                c1_ret += val
        elif acct_type in non_ret_types:
            non_ret += val

    # Trust value — home_values entry with "(Trust)" in the key
    trust_value = ZERO
    for k, f in tcc.home_values.items():
        if "(Trust)" in k and f.value is not None:
            trust_value += _dec(f.value)

    grand_total = c1_ret + c2_ret + non_ret + trust_value

    liabilities_total = sum(
        _dec(f.value)
        for f in tcc.liability_balances.values()
        if f.value is not None
    )

    return TCCCalculated(
        client1_retirement_total=c1_ret,
        client2_retirement_total=c2_ret,
        non_retirement_total=non_ret,
        trust_value=trust_value,
        grand_total_net_worth=grand_total,
        liabilities_total=liabilities_total,
    )


# ── Service ───────────────────────────────────────────────────────────────────

class ReportService:

    async def preview(self, client_id: int) -> ReportPreviewResponse:
        client = await Client.get_or_none(id=client_id).prefetch_related("spouse")
        if not client:
            raise NotFoundException(f"Client {client_id} not found.")

        spouse: Client | None = None
        if client.spouse_id:
            spouse = await Client.get_or_none(id=client.spouse_id)

        quarter = _current_quarter()

        last_report = await Report.filter(
            client_id=client_id
        ).order_by("-created_at").first()

        last_data: dict = last_report.data if last_report else {}

        def _last_val(section: str, key: str) -> Decimal | None:
            try:
                raw = last_data[section][key]["value"]
                return Decimal(str(raw)) if raw is not None else None
            except (KeyError, TypeError):
                return None

        # ── SACS: account balances ────────────────────────────────
        account_balances: dict[str, ReportField] = {}

        for acc in (client.retirement_accounts or []):
            key  = f"{acc['type']} – {acc['institution']}"
            last = _last_val("sacs_account_balances", key)
            account_balances[key] = ReportField(
                value=last if last is not None else _dec(acc.get("balance", 0)),
                source="last_report" if last is not None else "profile",
                last_value=last,
                is_incomplete=last is None,
            )

        for acc in (client.non_retirement_accounts or []):
            key  = f"{acc['type']} – {acc['institution']}"
            last = _last_val("sacs_account_balances", key)
            account_balances[key] = ReportField(
                value=last if last is not None else _dec(acc.get("balance", 0)),
                source="last_report" if last is not None else "profile",
                last_value=last,
                is_incomplete=last is None,
            )

        # Include spouse's retirement accounts labelled with spouse name
        if spouse:
            for acc in (spouse.retirement_accounts or []):
                key  = f"{acc['type']} – {acc['institution']} ({spouse.name.split()[0]})"
                last = _last_val("sacs_account_balances", key)
                account_balances[key] = ReportField(
                    value=last if last is not None else _dec(acc.get("balance", 0)),
                    source="last_report" if last is not None else "profile",
                    last_value=last,
                    is_incomplete=last is None,
                )

        # ── SACS: insurance deductibles ───────────────────────────
        insurance_deductibles: dict[str, ReportField] = {}
        for k in (last_data.get("sacs_insurance_deductibles") or {}):
            last = _last_val("sacs_insurance_deductibles", k)
            insurance_deductibles[k] = ReportField(
                value=last, source="last_report", last_value=last, is_incomplete=False
            )

        sacs = SACSData(
            monthly_salary=_dec(client.monthly_salary),
            monthly_expense_budget=_dec(client.monthly_expense_budget),
            insurance_deductibles=insurance_deductibles,
            account_balances=account_balances,
        )
        sacs.calculated = _calc_sacs(sacs)

        # ── TCC: private reserve ──────────────────────────────────
        last_reserve = _last_val("tcc_private_reserve", "balance")
        private_reserve = ReportField(
            value=last_reserve,
            source="last_report" if last_reserve is not None else "manual",
            last_value=last_reserve,
            is_incomplete=last_reserve is None,
        )

        # ── TCC: home values ──────────────────────────────────────
        home_values: dict[str, ReportField] = {}
        trust_address_key = None

        for lib in (client.liabilities or []):
            if lib.get("type") == "Mortgage" and lib.get("property_address"):
                key  = lib["property_address"]
                last = _last_val("tcc_home_values", key)
                home_values[key] = ReportField(
                    value=last, source="last_report" if last is not None else "manual",
                    last_value=last, is_incomplete=last is None,
                )

        if client.trust_details and client.trust_details.get("property_address"):
            key = client.trust_details["property_address"] + " (Trust)"
            last = _last_val("tcc_home_values", key)
            home_values[key] = ReportField(
                value=last, source="last_report" if last is not None else "manual",
                last_value=last, is_incomplete=last is None,
            )
            trust_address_key = key

        # ── TCC: liability balances ───────────────────────────────
        liability_balances: dict[str, ReportField] = {}
        for lib in (client.liabilities or []):
            inst = lib.get("institution") or lib.get("type", "")
            key  = f"{lib['type']} – {inst}"
            last = _last_val("tcc_liability_balances", key)
            liability_balances[key] = ReportField(
                value=last if last is not None else _dec(lib.get("balance", 0)),
                source="last_report" if last is not None else "profile",
                last_value=last,
                is_incomplete=last is None,
            )

        tcc = TCCData(
            private_reserve_balance=private_reserve,
            private_reserve_target=_dec(client.private_reserve_target),
            home_values=home_values,
            liability_balances=liability_balances,
        )
        tcc.calculated = _build_tcc_calculated(
            account_balances, tcc, client, spouse, trust_address_key
        )

        data = ReportData(sacs=sacs, tcc=tcc)

        all_fields = (
            list(account_balances.values())
            + [private_reserve]
            + list(home_values.values())
            + list(liability_balances.values())
        )
        incomplete = sum(1 for f in all_fields if f.is_incomplete)

        return ReportPreviewResponse(
            client_id=client_id,
            client_name=client.name,
            spouse_name=spouse.name if spouse else None,
            quarter=quarter,
            label=_quarter_label(quarter),
            has_previous=last_report is not None,
            previous_date=last_report.created_at if last_report else None,
            data=data,
            incomplete_count=incomplete,
        )

    async def save(self, client_id: int, payload: ReportSaveRequest) -> ReportResponse:
        client = await Client.get_or_none(id=client_id)
        if not client:
            raise NotFoundException(f"Client {client_id} not found.")

        raw = payload.data.model_dump(mode="json")
        flat: dict = {
            "sacs_static": {
                "monthly_salary":         raw["sacs"]["monthly_salary"],
                "monthly_expense_budget": raw["sacs"]["monthly_expense_budget"],
            },
            "sacs_account_balances":     raw["sacs"]["account_balances"],
            "sacs_insurance_deductibles": raw["sacs"]["insurance_deductibles"],
            "sacs_calculated":           raw["sacs"]["calculated"],
            "tcc_private_reserve": {
                "balance": raw["tcc"]["private_reserve_balance"],
                "target":  raw["tcc"]["private_reserve_target"],
            },
            "tcc_home_values":        raw["tcc"]["home_values"],
            "tcc_liability_balances": raw["tcc"]["liability_balances"],
            "tcc_calculated":         raw["tcc"]["calculated"],
        }

        report = await Report.create(
            client_id=client_id,
            quarter=payload.quarter,
            label=_quarter_label(payload.quarter),
            status=payload.status,
            data=flat,
            notes=payload.notes,
        )

        client.last_report_date = report.created_at
        client.last_report_data = flat
        await client.save()

        return self._to_response(report)

    async def list_reports(self, client_id: int) -> list[ReportResponse]:
        if not await Client.exists(id=client_id):
            raise NotFoundException(f"Client {client_id} not found.")
        reports = await Report.filter(client_id=client_id).order_by("-created_at")
        return [self._to_response(r) for r in reports]

    async def get_report(self, client_id: int, report_id: int) -> ReportResponse:
        report = await Report.get_or_none(id=report_id, client_id=client_id)
        if not report:
            raise NotFoundException(f"Report {report_id} not found.")
        return self._to_response(report)

    def _to_response(self, report: Report) -> ReportResponse:
        return ReportResponse(
            id=report.id,
            client_id=report.client_id,
            quarter=report.quarter,
            label=report.label,
            status=report.status,
            data=report.data,
            notes=report.notes,
            created_at=report.created_at,
            updated_at=report.updated_at,
        )


report_service = ReportService()
