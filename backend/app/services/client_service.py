"""
Client service — business logic, encryption, and orchestration.
No knowledge of FastAPI Request/Response objects.
"""
from __future__ import annotations

from app.core.exceptions import ConflictException, NotFoundException
from app.core.security import encrypt_field
from app.models.client import Client
from app.repositories.client_repository import client_repository
from app.schemas.client import ClientCreate, ClientUpdate


class ClientService:

    async def get_or_404(self, client_id: int) -> Client:
        client = await client_repository.get_by_id(client_id)
        if not client:
            raise NotFoundException(f"Client {client_id} not found.")
        return client

    async def list_clients(self, skip: int = 0, limit: int = 20) -> list[Client]:
        return await client_repository.get_all(skip=skip, limit=limit)

    async def create_client(self, payload: ClientCreate) -> Client:
        ssn_encrypted = encrypt_field(payload.ssn)

        existing = await client_repository.get_by_ssn_encrypted(ssn_encrypted)
        if existing:
            raise ConflictException("A client with this SSN already exists.")

        data = {
            "name":                   payload.name,
            "dob":                    payload.dob,
            "ssn_encrypted":          ssn_encrypted,
            "spouse_id":              payload.spouse_id,
            "retirement_accounts":    [a.model_dump(mode="json") for a in payload.retirement_accounts],
            "non_retirement_accounts":[a.model_dump(mode="json") for a in payload.non_retirement_accounts],
            "liabilities":            [l.model_dump(mode="json") for l in payload.liabilities],
            "trust_details":          payload.trust_details.model_dump(mode="json") if payload.trust_details else None,
            "monthly_salary":         payload.monthly_salary,
            "monthly_expense_budget": payload.monthly_expense_budget,
            "private_reserve_target": payload.private_reserve_target,
        }
        return await client_repository.create(data)

    async def update_client(self, client_id: int, payload: ClientUpdate) -> Client:
        client = await self.get_or_404(client_id)

        updates: dict = {}
        if payload.name is not None:
            updates["name"] = payload.name
        if payload.dob is not None:
            updates["dob"] = payload.dob
        if payload.spouse_id is not None:
            updates["spouse_id"] = payload.spouse_id
        if payload.retirement_accounts is not None:
            updates["retirement_accounts"] = [a.model_dump(mode="json") for a in payload.retirement_accounts]
        if payload.non_retirement_accounts is not None:
            updates["non_retirement_accounts"] = [a.model_dump(mode="json") for a in payload.non_retirement_accounts]
        if payload.liabilities is not None:
            updates["liabilities"] = [l.model_dump(mode="json") for l in payload.liabilities]
        if payload.trust_details is not None:
            updates["trust_details"] = payload.trust_details.model_dump(mode="json")
        if payload.monthly_salary is not None:
            updates["monthly_salary"] = payload.monthly_salary
        if payload.monthly_expense_budget is not None:
            updates["monthly_expense_budget"] = payload.monthly_expense_budget
        if payload.private_reserve_target is not None:
            updates["private_reserve_target"] = payload.private_reserve_target

        return await client_repository.update(client, updates)

    async def delete_client(self, client_id: int) -> None:
        client = await self.get_or_404(client_id)
        await client_repository.delete(client)


client_service = ClientService()
