from tortoise import fields
from tortoise.models import Model


class User(Model):
    """
    System user (advisors, admins).
    Kept separate from Client to avoid mixing auth with financial data.
    """

    id              = fields.IntField(pk=True)
    email           = fields.CharField(max_length=255, unique=True)
    hashed_password = fields.CharField(max_length=512)
    full_name       = fields.CharField(max_length=255, null=True)
    is_active       = fields.BooleanField(default=True)
    is_superuser    = fields.BooleanField(default=False)

    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "users"

    def __str__(self) -> str:
        return f"User({self.id}, {self.email})"
