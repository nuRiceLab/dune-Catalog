"""Cancel cooperative upstream work on disconnect or timeout.

A blocked socket can continue until its timeout; cancellation cannot kill a thread
or guarantee that the remote server stops computation.
"""

from __future__ import annotations

import logging
import threading
from typing import Callable, TypeVar

import anyio
from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)

T = TypeVar("T")

# How often the monitor checks whether the client has disconnected. Half a
# second is frequent enough to stop upstream work quickly without adding
# meaningful overhead.
_DISCONNECT_POLL_S = 0.5

# Sentinel distinguishing "work never produced a value" (client disconnected
# first) from a legitimately returned ``None``.
_UNSET = object()


class QueryCancelled(Exception):
    """Raised inside the worker when cancellation has been requested.

    Callers running through ``run_cancellable`` never see this: by the time
    the worker raises it, the surrounding task has already been abandoned and
    the exception is discarded. It exists so the blocking code has a clean,
    explicit way to unwind out of a partially-consumed stream.
    """


async def run_cancellable(
    request: Request,
    work: Callable[[Callable[[], bool]], T],
    *,
    timeout_s: float,
) -> T:
    """Run ``work`` in a worker thread, cancelling it if the client
    disconnects or ``timeout_s`` elapses.

    Args:
        request: the incoming request, used to detect client disconnect.
        work: a callable taking a single ``is_cancelled`` predicate and
            returning the result. It should poll the predicate during any
            long streaming loop and stop when it returns True.
        timeout_s: hard upper bound on how long to wait before giving up.

    Returns:
        Whatever ``work`` returns.

    Raises:
        HTTPException(504): the work exceeded ``timeout_s``.
        HTTPException(499): the client disconnected before the work finished.
            (499 is nginx's "client closed request"; the response is discarded
            since the client is already gone.)
    """
    cancel_event = threading.Event()
    value: object = _UNSET
    error: Exception | None = None

    try:
        with anyio.fail_after(timeout_s):
            async with anyio.create_task_group() as tg:

                async def monitor() -> None:
                    # Poll for disconnect; on hang-up, flag cancellation and
                    # tear down the group so the event loop is freed at once.
                    while True:
                        if await request.is_disconnected():
                            logger.info(
                                "Client disconnected; cancelling in-flight query."
                            )
                            cancel_event.set()
                            tg.cancel_scope.cancel()
                            return
                        await anyio.sleep(_DISCONNECT_POLL_S)

                async def run_work() -> None:
                    nonlocal value, error
                    # abandon_on_cancel=True: if the scope is cancelled
                    # (disconnect or timeout) the loop stops waiting on the
                    # thread immediately. The thread is not killed, but it
                    # observes cancel_event and winds down on its own.
                    try:
                        value = await anyio.to_thread.run_sync(
                            work, cancel_event.is_set, abandon_on_cancel=True
                        )
                    except Exception as exc:
                        error = exc
                    # Work is done — stop the monitor and leave the group.
                    tg.cancel_scope.cancel()

                tg.start_soon(monitor)
                tg.start_soon(run_work)
    except TimeoutError:
        cancel_event.set()
        logger.warning("Upstream query exceeded %.0fs budget; cancelled.", timeout_s)
        raise HTTPException(status_code=504, detail="Upstream query timed out")
    finally:
        # Belt and braces: whatever happened, make sure an abandoned worker
        # thread is told to stop (harmless if it already finished).
        cancel_event.set()

    if error is not None:
        raise error

    if value is _UNSET:
        # The group unwound without the work producing a value: the client
        # disconnected. Nothing is listening, so this response is discarded.
        logger.info("Query abandoned (client gone); returning 499.")
        raise HTTPException(status_code=499, detail="Client disconnected")

    return value  # type: ignore[return-value]
