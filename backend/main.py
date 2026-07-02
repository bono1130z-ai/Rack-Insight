"""Rack Insight backend entrypoint (FastAPI)."""
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from api.routes import auth as auth_routes
from api.routes import clusters as cluster_routes
from api.routes import devices as device_routes
from api.routes import racks as rack_routes
from api.routes import users as user_routes
from auth.security import hash_password
from cache.redis_cache import close_redis
from config import get_settings
from database import Base, async_session_factory, engine
from models import User, UserRole
from scheduler.background import start_scheduler, stop_scheduler
from utils.logging import configure_logging, get_logger

settings = get_settings()
configure_logging(settings.debug)
logger = get_logger(__name__)


async def _bootstrap_admin() -> None:
    """Create the default admin account on first start."""
    async with async_session_factory() as db:
        result = await db.execute(select(User).where(User.role == UserRole.ADMIN))
        if result.scalars().first() is None:
            db.add(
                User(
                    username=settings.default_admin_username,
                    password_hash=hash_password(settings.default_admin_password),
                    role=UserRole.ADMIN,
                )
            )
            await db.commit()
            logger.info("Default admin account created")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _bootstrap_admin()
    start_scheduler()
    logger.info("%s v%s started", settings.app_name, settings.app_version)
    yield
    stop_scheduler()
    await close_redis()
    await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router, prefix=settings.api_prefix)
app.include_router(user_routes.router, prefix=settings.api_prefix)
app.include_router(cluster_routes.router, prefix=settings.api_prefix)
app.include_router(rack_routes.router, prefix=settings.api_prefix)
app.include_router(device_routes.router, prefix=settings.api_prefix)


@app.get("/api/health", tags=["system"])
async def healthcheck() -> dict[str, str]:
    return {"status": "ok", "version": settings.app_version}
