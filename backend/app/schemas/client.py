"""
Pydantic schemas for client API validation.
Sub-schemas (accounts, liabilities, trust) validate JSON field contents.
"""
from __future__ import annotations

import datetime
import re
from decimal import Decimal
from typing import Annotated, Any

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.client import (
    LiabilityType,
    NonRetirementAccountType,
    RetirementAccountType,
)


# ── Sub-schemas: Retirement Accounts ─────────────────────────────────────────

class RetirementAccountItem(BaseModel):
    type:                 RetirementAccountType
    institution:          str = Field(max_length=255)
    balance:              Decimal = Field(ge=0, decimal_places=2)
    account_number_last4: str | None = Field(None, pattern=r"^\d{4}$")


# ── Sub-schemas: Non-Retirement Accounts ─────────────────────────────────────

class NonRetirementAccountItem(BaseModel):
    type:                 NonRetirementAccountType
    institution:          str = Field(max_length=255)
    balance:              Decimal = Field(ge=0, decimal_places=2)
    account_number_last4: str | None = Field(None, pattern=r"^\d{4}$")


# ── Sub-schemas: Liabilities ──────────────────────────────────────────────────

class LiabilityItem(BaseModel):
    type:             LiabilityType
    institution:      str | None = Field(None, max_length=255)
    balance:          Decimal = Field(ge=0, decimal_places=2)
    interest_rate:    Annotated[Decimal, Field(ge=0, le=100, decimal_places=4)]
    property_address: str | None = Field(None, max_length=500)

    @model_validator(mode="after")
    def mortgage_requires_address(self) -> "LiabilityItem":
        if self.type == LiabilityType.MORTGAGE and not self.property_address:
            raise ValueError("property_address is required for Mortgage liabilities.")
        return self


# ── Sub-schemas: Trust ────────────────────────────────────────────────────────

class TrustDetails(BaseModel):
    trust_name:       str = Field(max_length=255)
    trustee:          str = Field(max_length=255)
    property_address: str | None = Field(None, max_length=500)
    estimated_value:  Decimal | None = Field(None, ge=0, decimal_places=2)


# ── Client Schemas ────────────────────────────────────────────────────────────

_SSN_PATTERN = re.compile(r"^\d{3}-\d{2}-\d{4}$")


class ClientBase(BaseModel):
    name:     str = Field(min_length=2, max_length=255)
    dob:      datetime.date
    ssn:      str = Field(description="Format: XXX-XX-XXXX")
    spouse_id: int | None = None

    retirement_accounts:     list[RetirementAccountItem]    = Field(default_factory=list)
    non_retirement_accounts: list[NonRetirementAccountItem] = Field(default_factory=list)
    liabilities:             list[LiabilityItem]            = Field(default_factory=list)
    trust_details:           TrustDetails | None = None

    monthly_salary:         Decimal = Field(ge=0, decimal_places=2)
    monthly_expense_budget: Decimal = Field(ge=0, decimal_places=2)
    private_reserve_target: Decimal = Field(ge=0, decimal_places=2)

    @field_validator("ssn")
    @classmethod
    def validate_ssn_format(cls, v: str) -> str:
        if not _SSN_PATTERN.match(v):
            raise ValueError("SSN must follow the format XXX-XX-XXXX.")
        return v

    @field_validator("dob")
    @classmethod
    def dob_in_past(cls, v: datetime.date) -> datetime.date:
        if v >= datetime.date.today():
            raise ValueError("Date of birth must be in the past.")
        return v


class ClientCreate(ClientBase):
    """Payload for creating a new client."""
    pass


class ClientUpdate(BaseModel):
    """All fields optional for PATCH requests."""
    name:                    str | None = Field(None, min_length=2, max_length=255)
    dob:                     datetime.date | None = None
    spouse_id:               int | None = None
    retirement_accounts:     list[RetirementAccountItem] | None    = None
    non_retirement_accounts: list[NonRetirementAccountItem] | None = None
    liabilities:             list[LiabilityItem] | None            = None
    trust_details:           TrustDetails | None                   = None
    monthly_salary:          Decimal | None = Field(None, ge=0)
    monthly_expense_budget:  Decimal | None = Field(None, ge=0)
    private_reserve_target:  Decimal | None = Field(None, ge=0)


class ClientResponse(BaseModel):
    """Response schema — SSN is never exposed."""
    id:        int
    name:      str
    dob:       datetime.date
    age:       int
    spouse_id: int | None

    retirement_accounts:     list[Any]
    non_retirement_accounts: list[Any]
    liabilities:             list[Any]
    trust_details:           Any | None

    monthly_salary:         Decimal
    monthly_expense_budget: Decimal
    private_reserve_target: Decimal

    last_report_date: datetime.datetime | None
    created_at:       datetime.datetime
    updated_at:       datetime.datetime

    model_config = {"from_attributes": True}
