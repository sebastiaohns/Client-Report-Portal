from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.core.deps import get_current_active_user
from app.core.exceptions import NotFoundException
from app.models.client import Client
from app.models.report import Report
from app.models.user import User
from app.services.pdf_service import build_sacs_pdf, build_tcc_pdf

router = APIRouter(prefix="/clients/{client_id}/reports/{report_id}/pdf", tags=["PDF"])


async def _get_report_and_client(client_id: int, report_id: int):
    client = await Client.get_or_none(id=client_id)
    if not client:
        raise NotFoundException(f"Client {client_id} not found.")
    report = await Report.get_or_none(id=report_id, client_id=client_id)
    if not report:
        raise NotFoundException(f"Report {report_id} not found.")
    spouse = await Client.get_or_none(id=client.spouse_id) if client.spouse_id else None
    return report, client, spouse


@router.get("/sacs", response_class=Response)
async def download_sacs_pdf(
    client_id: int,
    report_id: int,
    _: User = Depends(get_current_active_user),
):
    """Generate and download the SACS PDF report."""
    report, client, spouse = await _get_report_and_client(client_id, report_id)
    pdf_bytes = build_sacs_pdf(report, client, spouse)
    filename  = f"SACS_{client.name.replace(' ', '_')}_{report.quarter}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/tcc", response_class=Response)
async def download_tcc_pdf(
    client_id: int,
    report_id: int,
    _: User = Depends(get_current_active_user),
):
    """Generate and download the TCC PDF report."""
    report, client, spouse = await _get_report_and_client(client_id, report_id)
    pdf_bytes = build_tcc_pdf(report, client, spouse)
    filename  = f"TCC_{client.name.replace(' ', '_')}_{report.quarter}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
