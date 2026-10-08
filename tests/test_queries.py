"""Query lifecycle checks using synthetic upstreams only."""
import asyncio
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import Mock, patch

from fastapi import HTTPException
from src.backend.cancellable import QueryCancelled, run_cancellable
from src.lib import mcatapi


class Request:
    def __init__(self, disconnected=False):
        self.disconnected = disconnected

    async def is_disconnected(self):
        return self.disconnected


class CancellationTests(unittest.IsolatedAsyncioTestCase):
    async def test_success_and_http_errors_keep_their_meaning(self):
        self.assertIsNone(await run_cancellable(Request(), lambda stop: None, timeout_s=1))
        def work(stop):
            raise HTTPException(503, "busy")
        with self.assertRaises(HTTPException) as error:
            await run_cancellable(Request(), work, timeout_s=1)
        self.assertEqual(error.exception.status_code, 503)

    async def test_timeout_and_disconnect_stop_followup_work(self):
        for disconnect in (False, True):
            request = Request()
            started, stopped = threading.Event(), threading.Event()
            def work(cancelled):
                started.set()
                while not cancelled():
                    time.sleep(.001)
                stopped.set()
            with patch("src.backend.cancellable._DISCONNECT_POLL_S", .005):
                task = asyncio.create_task(run_cancellable(request, work, timeout_s=.1))
                while not started.is_set():
                    await asyncio.sleep(.001)
                request.disconnected = disconnect
                with self.assertRaises(HTTPException) as error:
                    await task
            self.assertEqual(error.exception.status_code, 499 if disconnect else 504)
            self.assertTrue(await asyncio.to_thread(stopped.wait, 1))

    async def test_query_routes_pass_cancellation_and_preserve_errors(self):
        from src.backend import main
        for status in (400, 503, 504):
            def upstream(namespace, name, is_cancelled):
                self.assertFalse(is_cancelled())
                raise HTTPException(status, "synthetic failure")
            with patch.object(main.metacat_api, "get_files", side_effect=upstream):
                with self.assertRaises(HTTPException) as error:
                    await main.get_files(main.FileRequest(namespace="audit", name="file"), Request())
            self.assertEqual(error.exception.status_code, status)


class MetaCatTests(unittest.TestCase):
    def test_cancelled_stream_closes_only_its_own_response(self):
        api = mcatapi.MetaCatAPI()
        cancelled = threading.Event()
        held, release = threading.Event(), threading.Event()
        first, second = Mock(), Mock()
        def rows():
            held.set()
            release.wait(1)
            yield {"name": "held"}
        first.query.return_value = rows()
        second.query.return_value = iter([{"name": "other"}])
        with patch.object(mcatapi, "MetaCatClient", side_effect=[first, second]):
            with ThreadPoolExecutor(1) as executor:
                future = executor.submit(api._consume_query, "first", cancelled.is_set)
                self.assertTrue(held.wait(1))
                self.assertEqual(api._consume_query("second", lambda: False), [{"name": "other"}])
                first.LastResponse.close.assert_not_called()
                cancelled.set()
                release.set()
                with self.assertRaises(QueryCancelled):
                    future.result(1)
        first.LastResponse.close.assert_called_once()
        second.LastResponse.close.assert_called_once()

    def test_cancelled_detail_never_fetches_provenance(self):
        api = mcatapi.MetaCatAPI()
        cancelled = threading.Event()
        client = Mock()
        def get_file(**kwargs):
            cancelled.set()
            return {"parents": ["parent"]}
        client.get_file.side_effect = get_file
        with patch.object(mcatapi, "MetaCatClient", return_value=client):
            with self.assertRaises(QueryCancelled):
                api.get_file_details("audit", "file", cancelled.is_set)
        client.get_files.assert_not_called()

    def test_size_saturation_rejected_before_upstream_work(self):
        api = mcatapi.MetaCatAPI()
        with (
            patch.object(mcatapi, "_SIZE_SLOTS", threading.BoundedSemaphore(1)),
            patch.object(mcatapi, "MetaCatClient") as client,
        ):
            with self.assertRaises(HTTPException) as error:
                api.get_dataset_sizes([{"namespace": "audit", "name": str(i)} for i in range(2)])
            self.assertEqual(error.exception.status_code, 503)
            client.assert_not_called()

    def test_queued_sizes_are_cancelled_without_starting_followups(self):
        api = mcatapi.MetaCatAPI()
        cancelled, started, release = threading.Event(), threading.Event(), threading.Event()
        client = Mock()
        def query(*args, **kwargs):
            started.set()
            release.wait(1)
            return {"total_size": 1}
        client.query.side_effect = query
        with (
            ThreadPoolExecutor(1) as pool,
            patch.object(mcatapi, "_SIZE_POOL", pool),
            patch.object(mcatapi, "MetaCatClient", return_value=client),
            ThreadPoolExecutor(1) as caller,
        ):
            future = caller.submit(api.get_dataset_sizes,
                [{"namespace": "queued", "name": str(i)} for i in range(3)], cancelled.is_set)
            self.assertTrue(started.wait(1))
            cancelled.set()
            with self.assertRaises(QueryCancelled):
                future.result(1)
            release.set()
        client.query.assert_called_once()

    def test_condb_checks_cancellation_before_request_and_parsing(self):
        from src.lib.condb_api import ConditionsDBAPI
        api = ConditionsDBAPI("https://condb.example.invalid")
        with patch("src.lib.condb_api.httpx.get") as get:
            with self.assertRaises(QueryCancelled):
                api.get_run_conditions("audit", 1, is_cancelled=lambda: True)
            get.assert_not_called()
            cancelled = threading.Event()
            def respond(*args, **kwargs):
                cancelled.set()
                return Mock(text="tv,run_type\n1,PROD")
            get.side_effect = respond
            with self.assertRaises(QueryCancelled):
                api.search_runs("audit", [], is_cancelled=cancelled.is_set)


if __name__ == "__main__":
    unittest.main()
