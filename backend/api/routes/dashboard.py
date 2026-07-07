"""Dashboard summary endpoint (any authenticated user)."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from auth.dependencies import get_current_user
from database import get_db
from schemas.dashboard import DashboardSummary
from services.summary_service import dashboard_summary
from utils.logging import get_logger

logger = get_logger(__name__)
router = APIRouter(
    prefix="/dashboard", tags=["dashboard"], dependencies=[Depends(get_current_user)]
)


@router.get("/summary", response_model=DashboardSummary)
async def get_summary(db: AsyncSession = Depends(get_db)) -> DashboardSummary:
    try:
        return await dashboard_summary(db)
    except Exception as exc:
        logger.exception("Dashboard summary failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Dashboard summary failed",
        ) from exc
