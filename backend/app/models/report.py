from tortoise import fields
from tortoise.models import Model


class Report(Model):
    """
    Quarterly snapshot for a client.
    Each report generation creates a new record.
    The `data` field stores all report values (SACS + TCC sections),
    including source tracking (profile / last_report / manual).
    """

    id      = fields.IntField(pk=True)
    client  = fields.ForeignKeyField(
        "models.Client", related_name="reports", on_delete=fields.CASCADE
    )
    quarter = fields.CharField(max_length=7, description="e.g. 2025-Q1")
    label   = fields.CharField(max_length=100, description="e.g. Q1 2025 Report")
    status  = fields.CharField(max_length=20, default="draft")  # draft | final
    data    = fields.JSONField(description="Full report field values")
    notes   = fields.TextField(null=True, blank=True)

    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "reports"

    def __str__(self) -> str:
        return f"Report({self.id}, client={self.client_id}, {self.quarter})"
