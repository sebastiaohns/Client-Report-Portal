from fastapi import APIRouter, Depends, status

from app.core.deps import get_current_active_user
from app.models.user import User
from app.schemas.report import ReportPreviewResponse, ReportResponse, ReportSaveRequest
from app.services.report_service import report_service

router = APIRouter(prefix="/clients/{client_id}/reports", tags=["Reports"])


@router.get("/preview", response_model=ReportPreviewResponse)
async def preview_report(
    client_id: int,
    _: User = Depends(get_current_active_user),
):
    """
    Return a pre-filled report form for a client.
    Static fields come from the profile; dynamic fields inherit from the last report.
    All calculated metrics (SACS excess, reserve target, TCC totals) are pre-computed.
    """
    return await report_service.preview(client_id)


@router.post("", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
async def save_report(
    client_id: int,
    payload:   ReportSaveRequest,
    _: User = Depends(get_current_active_user),
):
    """Save a report as draft or final."""
    return await report_service.save(client_id, payload)


@router.get("", response_model=list[ReportResponse])
async def list_reports(
    client_id: int,
    _: User = Depends(get_current_active_user),
):
    """Return the full report history for a client."""
    return await report_service.list_reports(client_id)


@router.get("/{report_id}", response_model=ReportResponse)
async def get_report(
    client_id: int,
    report_id: int,
    _: User = Depends(get_current_active_user),
):
    """Return a specific report by ID."""
    return await report_service.get_report(client_id, report_id)
