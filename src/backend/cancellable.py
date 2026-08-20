"""
cancellable.py — run blocking upstream work (MetaCat / ConDB) so that it is
torn down promptly when the browser aborts the request or a hard time budget
is exceeded, instead of running to completion in the background.

Why this exists
---------------
FastAPI runs a plain ``def`` endpoint in a worker thread, which keeps the
event loop free (that is why the query endpoints are sync — see the project
changelog). But it has two consequences we need to correct:

  * A worker thread cannot be force-killed from outside, and a synchronous
    endpoint is never told that the client hung up. So when a user changes
    their search, closes a dialog, or navigates away, the abandoned query
    keeps streaming from MetaCat to completion — wasted load on the upstream
    API, and a thread tied up for as long as the query takes.
  * The MetaCat client's default per-request timeout is 30 minutes, so a
    single stuck request can hold a worker thread for that long.

``run_cancellable`` bridges the gap:

  * the endpoint becomes ``async def`` and awaits ``run_cancellable``;
  * the blocking work still runs in a worker thread (event loop stays free);
  * a monitor coroutine polls ``request.is_disconnected()``;
  * on disconnect *or* timeout a ``threading.Event`` is set and the event loop
    is released immediately (the HTTP response is failed), while the worker
    observes the event and stops streaming from the upstream API — closing the
    connection so the upstream stops computing too, and no retry is issued.

The blocking callable is handed a zero-argument ``is_cancelled()`` predicate.
It is expected to poll that predicate between upstream chunks and, when it
returns True, abort promptly (see ``mcatapi`` for how the streaming query
loop does this). Work that is a single short upstream call need not poll; it
is simply bounded by the client timeout and the hard budget.
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
                    nonlocal value
                    # abandon_on_cancel=True: if the scope is cancelled
                    # (disconnect or timeout) the loop stops waiting on the
                    # thread immediately. The thread is not killed, but it
                    # observes cancel_event and winds down on its own.
                    value = await anyio.to_thread.run_sync(
                        work, cancel_event.is_set, abandon_on_cancel=True
                    )
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

    if value is _UNSET:
        # The group unwound without the work producing a value: the client
        # disconnected. Nothing is listening, so this response is discarded.
        logger.info("Query abandoned (client gone); returning 499.")
        raise HTTPException(status_code=499, detail="Client disconnected")

    return value  # type: ignore[return-value]
