"""
Repository — the only layer that directly touches the ORM.
Services call the repository; endpoints call services.
"""
from __future__ import annotations

from app.models.client import Client


class ClientRepository:

    async def get_by_id(self, client_id: int) -> Client | None:
        return await Client.get_or_none(id=client_id).prefetch_related("spouse")

    async def get_all(self, skip: int = 0, limit: int = 20) -> list[Client]:
        return await Client.all().offset(skip).limit(limit).prefetch_related("spouse")

    async def get_by_ssn_encrypted(self, ssn_encrypted: str) -> Client | None:
        return await Client.get_or_none(ssn_encrypted=ssn_encrypted)

    async def create(self, data: dict) -> Client:
        return await Client.create(**data)

    async def update(self, client: Client, data: dict) -> Client:
        for field, value in data.items():
            setattr(client, field, value)
        await client.save()
        return client

    async def delete(self, client: Client) -> None:
        await client.delete()

    async def count(self) -> int:
        return await Client.all().count()


client_repository = ClientRepository()
