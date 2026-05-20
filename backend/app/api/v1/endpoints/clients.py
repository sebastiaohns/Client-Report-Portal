from fastapi import APIRouter, Depends, Query, status

from app.core.deps import get_current_active_user, require_admin
from app.models.user import User
from app.schemas.client import ClientCreate, ClientResponse, ClientUpdate
from app.services.client_service import client_service

router = APIRouter(prefix="/clients", tags=["Clients"])


@router.get("", response_model=list[ClientResponse])
async def list_clients(
    skip:  int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    _: User = Depends(get_current_active_user),
):
    """List all clients with pagination."""
    return await client_service.list_clients(skip=skip, limit=limit)


@router.get("/{client_id}", response_model=ClientResponse)
async def get_client(
    client_id: int,
    _: User = Depends(get_current_active_user),
):
    """Return a single client by ID."""
    client = await client_service.get_or_404(client_id)
    return _to_response(client)


@router.post("", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
async def create_client(
    payload: ClientCreate,
    _: User = Depends(get_current_active_user),
):
    """Create a new client."""
    client = await client_service.create_client(payload)
    return _to_response(client)


@router.patch("/{client_id}", response_model=ClientResponse)
async def update_client(
    client_id: int,
    payload:   ClientUpdate,
    _: User = Depends(get_current_active_user),
):
    """Partially update a client (PATCH)."""
    client = await client_service.update_client(client_id, payload)
    return _to_response(client)


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_client(
    client_id: int,
    _: User = Depends(require_admin),
):
    """Delete a client. Requires admin permission."""
    await client_service.delete_client(client_id)


# ── Helper ────────────────────────────────────────────────────────────────────

def _to_response(client) -> dict:
    """Build the response dict including the computed `age` property."""
    return {
        "id":                     client.id,
        "name":                   client.name,
        "dob":                    client.dob,
        "age":                    client.age,
        "spouse_id":              client.spouse_id,
        "retirement_accounts":    client.retirement_accounts,
        "non_retirement_accounts":client.non_retirement_accounts,
        "liabilities":            client.liabilities,
        "trust_details":          client.trust_details,
        "monthly_salary":         client.monthly_salary,
        "monthly_expense_budget": client.monthly_expense_budget,
        "private_reserve_target": client.private_reserve_target,
        "last_report_date":       client.last_report_date,
        "created_at":             client.created_at,
        "updated_at":             client.updated_at,
    }
