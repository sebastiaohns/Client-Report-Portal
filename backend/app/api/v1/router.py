from fastapi import APIRouter

from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.clients import router as clients_router
from app.api.v1.endpoints.pdf import router as pdf_router
from app.api.v1.endpoints.reports import router as reports_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth_router)
api_router.include_router(clients_router)
api_router.include_router(reports_router)
api_router.include_router(pdf_router)
