from __future__ import annotations

import datetime
from enum import Enum

from tortoise import fields
from tortoise.models import Model


# ── Enums ─────────────────────────────────────────────────────────────────────

class RetirementAccountType(str, Enum):
    IRA      = "IRA"
    ROTH_IRA = "Roth IRA"
    K401     = "401k"
    PENSION  = "Pension"


class NonRetirementAccountType(str, Enum):
    BROKERAGE = "Brokerage"
    JOINT     = "Joint"


class LiabilityType(str, Enum):
    MORTGAGE  = "Mortgage"
    AUTO_LOAN = "Auto Loan"
    OTHER     = "Other"


# ── Model ─────────────────────────────────────────────────────────────────────

class Client(Model):
    """
    Primary client model for financial planning.

    Investment accounts and liabilities are stored as JSON for flexibility.
    See app/schemas/client.py for the Pydantic validation schemas.

    JSON field schemas:
      retirement_accounts     : list[{type, institution, balance}]
      non_retirement_accounts : list[{type, institution, balance}]
      liabilities             : list[{type, institution, balance, interest_rate, property_address?}]
      trust_details           : {trust_name, trustee, property_address, estimated_value} | null
    """

    id = fields.IntField(pk=True)

    # Identification
    name          = fields.CharField(max_length=255)
    dob           = fields.DateField(description="Date of Birth")
    ssn_encrypted = fields.CharField(
        max_length=512,
        unique=True,
        description="SSN encrypted at rest via Fernet — never expose via API.",
    )

    # Spouse (self-referential FK)
    spouse: fields.ForeignKeyNullableRelation[Client] = fields.ForeignKeyField(
        "models.Client",
        related_name="spouse_of",
        null=True,
        blank=True,
        on_delete=fields.SET_NULL,
    )

    # Investment accounts (JSON)
    retirement_accounts     = fields.JSONField(default=list)
    non_retirement_accounts = fields.JSONField(default=list)

    # Liabilities (JSON)
    liabilities = fields.JSONField(default=list)

    # Trust
    trust_details = fields.JSONField(null=True, blank=True)

    # Monthly financials
    monthly_salary         = fields.DecimalField(max_digits=12, decimal_places=2)
    monthly_expense_budget = fields.DecimalField(max_digits=12, decimal_places=2)
    private_reserve_target = fields.DecimalField(max_digits=12, decimal_places=2)

    # Last report snapshot
    last_report_date = fields.DatetimeField(null=True, blank=True)
    last_report_data = fields.JSONField(null=True, blank=True)

    # Audit
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    @property
    def age(self) -> int:
        today = datetime.date.today()
        return (
            today.year
            - self.dob.year
            - ((today.month, today.day) < (self.dob.month, self.dob.day))
        )

    class Meta:
        table = "clients"

    def __str__(self) -> str:
        return f"Client({self.id}, {self.name})"
