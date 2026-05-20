"""
CLI script to create the first admin (superuser).
Usage: python scripts/create_superuser.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tortoise import Tortoise

from app.core.database import TORTOISE_ORM
from app.core.security import hash_password
from app.models.user import User


async def main():
    await Tortoise.init(config=TORTOISE_ORM)
    await Tortoise.generate_schemas()

    email     = input("Admin email: ").strip()
    password  = input("Password (min 8 chars): ").strip()
    full_name = input("Full name (optional): ").strip() or None

    if len(password) < 8:
        print("❌ Password too short.")
        return

    existing = await User.get_or_none(email=email)
    if existing:
        print(f"❌ User '{email}' already exists.")
        return

    user = await User.create(
        email=email,
        hashed_password=hash_password(password),
        full_name=full_name,
        is_active=True,
        is_superuser=True,
    )
    print(f"✅ Superuser created: {user.email} (id={user.id})")

    await Tortoise.close_connections()


if __name__ == "__main__":
    asyncio.run(main())
