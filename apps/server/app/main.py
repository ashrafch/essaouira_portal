from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

# Import the models package before any schema creation so that every model is
# registered on Base.metadata (bootstrap's create_all needs the full schema).
import app.models  # noqa: F401
from app.api.middlewares import authentication, request_logging
from app.bootstrap import initialize_schema_and_seed
from app.core.config import settings
from app.core.logging import setup_logging
from app.domains.analytics.router import router as analytics_router
from app.domains.bookings.router import router as bookings_router
from app.domains.dashboard.router import router as dashboard_router
from app.domains.inventory.router import router as inventory_router
from app.domains.operations.router import router as operations_router
from app.domains.platform.router import router as platform_router
from app.domains.smart_building.router import router as smart_building_router
from app.domains.smart_building.setup_router import router as setup_router

setup_logging()


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.validate_production_safety()
    initialize_schema_and_seed()
    yield


app = FastAPI(title="Portale Essaouira API", lifespan=lifespan)
Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.middleware("http")(request_logging)
app.middleware("http")(authentication)

app.include_router(smart_building_router)
app.include_router(setup_router)
app.include_router(platform_router)
app.include_router(inventory_router)
app.include_router(bookings_router)
app.include_router(analytics_router)
app.include_router(operations_router)
app.include_router(dashboard_router)
