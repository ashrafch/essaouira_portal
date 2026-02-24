import logging
import time

from fastapi import Request


def setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )


async def log_request_middleware(request: Request, call_next):
    logger = logging.getLogger("app.request")
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    user = getattr(request.state, "user", None)
    logger.info(
        "%s %s -> %s in %.2fms user=%s",
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
        user or "anonymous",
    )
    return response
