"""Ensure deleting reports removes only their owned Supabase audio objects."""
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import storage


USER_ID = "00000000-0000-4000-8000-000000000001"
REPORT_ID = "00000000-0000-4000-8000-000000000002"


class StorageDeleteTests(unittest.TestCase):
    def make_client(self, rows, events, remove_side_effect=None):
        query = Mock()
        query.select.return_value = query
        query.delete.return_value = query
        query.eq.return_value = query
        query.in_.return_value = query
        responses = iter([
            SimpleNamespace(data=rows),
            SimpleNamespace(data=rows),
        ])

        client = Mock()
        client.table.return_value = query
        bucket = client.storage.from_.return_value

        def remove(paths):
            events.append(("remove", paths))
            if remove_side_effect:
                raise remove_side_effect
            return []

        bucket.remove.side_effect = remove
        def execute():
            result = next(responses)
            events.append(("select" if len(events) == 0 else "delete", None))
            return result

        query.execute.side_effect = execute
        return client, query, bucket

    def test_removes_owned_upload_objects_before_deleting_rows(self):
        events = []
        rows = [
            {"id": REPORT_ID, "data": {"type": "upload", "audio_path": f"{USER_ID}/file.wav"}},
            {"id": "00000000-0000-4000-8000-000000000003", "data": {"type": "live"}},
            {"id": "00000000-0000-4000-8000-000000000004", "data": {"audio_path": "other-user/foreign.wav"}},
        ]
        client, query, bucket = self.make_client(rows, events)

        with patch.object(storage, "is_enabled", return_value=True), patch.object(
            storage, "get_client", return_value=client
        ):
            deleted = storage.delete_user_reports(USER_ID, [REPORT_ID, "local-123"])

        self.assertEqual(deleted, len(rows))
        self.assertEqual(events[0][0], "select")
        self.assertEqual(events[1], ("remove", [f"{USER_ID}/file.wav"]))
        self.assertEqual(events[2][0], "delete")
        self.assertEqual(bucket.remove.call_count, 1)
        self.assertEqual(query.eq.call_args_list[0].args, ("user_id", USER_ID))
        self.assertEqual(query.eq.call_args_list[1].args, ("user_id", USER_ID))

    def test_storage_failure_keeps_report_rows_for_retry(self):
        events = []
        rows = [{"id": REPORT_ID, "data": {"audio_path": f"{USER_ID}/file.wav"}}]
        client, _, _ = self.make_client(rows, events, RuntimeError("storage unavailable"))

        with patch.object(storage, "is_enabled", return_value=True), patch.object(
            storage, "get_client", return_value=client
        ):
            with self.assertRaisesRegex(RuntimeError, "storage unavailable"):
                storage.delete_user_reports(USER_ID, [REPORT_ID])

        self.assertEqual([event[0] for event in events], ["select", "remove"])

    def test_local_only_ids_do_not_query_supabase(self):
        client = Mock()
        with patch.object(storage, "is_enabled", return_value=True), patch.object(
            storage, "get_client", return_value=client
        ):
            self.assertEqual(storage.delete_user_reports(USER_ID, ["local-123"]), 0)
        client.table.assert_not_called()


if __name__ == "__main__":
    unittest.main()
