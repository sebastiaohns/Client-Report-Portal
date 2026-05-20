"""
Testes unitários do ClientService com mock do repository.
"""
import datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.exceptions import ConflictException, NotFoundException
from app.schemas.client import ClientCreate, ClientUpdate
from app.services.client_service import ClientService


@pytest.fixture
def service():
    return ClientService()


@pytest.fixture
def sample_payload():
    return ClientCreate(
        name="John Doe",
        dob=datetime.date(1980, 5, 15),
        ssn="123-45-6789",
        monthly_salary=Decimal("10000.00"),
        monthly_expense_budget=Decimal("5000.00"),
        private_reserve_target=Decimal("30000.00"),
    )


@pytest.mark.asyncio
async def test_get_or_404_raises_when_not_found(service):
    with patch(
        "app.services.client_service.client_repository.get_by_id",
        new=AsyncMock(return_value=None),
    ):
        with pytest.raises(NotFoundException):
            await service.get_or_404(999)


@pytest.mark.asyncio
async def test_create_client_raises_on_duplicate_ssn(service, sample_payload):
    mock_client = MagicMock()
    with (
        patch("app.services.client_service.encrypt_field", return_value="encrypted"),
        patch(
            "app.services.client_service.client_repository.get_by_ssn_encrypted",
            new=AsyncMock(return_value=mock_client),
        ),
    ):
        with pytest.raises(ConflictException):
            await service.create_client(sample_payload)


@pytest.mark.asyncio
async def test_create_client_success(service, sample_payload):
    mock_client = MagicMock()
    with (
        patch("app.services.client_service.encrypt_field", return_value="encrypted"),
        patch(
            "app.services.client_service.client_repository.get_by_ssn_encrypted",
            new=AsyncMock(return_value=None),
        ),
        patch(
            "app.services.client_service.client_repository.create",
            new=AsyncMock(return_value=mock_client),
        ),
    ):
        result = await service.create_client(sample_payload)
        assert result is mock_client
