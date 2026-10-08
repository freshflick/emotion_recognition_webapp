"""Supabase report listing must return every page, not just the first batch."""
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import storage


class StoragePaginationTests(unittest.TestCase):
    def test_reads_all_report_pages_in_newest_first_order(self):
        rows = [{"id": str(index)} for index in range(1005)]
        pages = [rows[:1000], rows[1000:]]
        query = Mock()
        query.select.return_value = query
        query.eq.return_value = query
        query.order.return_value = query
        query.range.return_value = query
        query.execute.side_effect = [SimpleNamespace(data=page) for page in pages]
        client = Mock()
        client.table.return_value = query

        with patch.object(storage, "is_enabled", return_value=True), patch.object(
            storage, "get_client", return_value=client
        ):
            result = storage.get_user_reports("user-1")

        self.assertEqual(result, rows)
        self.assertEqual(
            [call.args for call in query.range.call_args_list],
            [(0, 999), (1000, 1999)],
        )
        self.assertEqual(query.execute.call_count, 2)


if __name__ == "__main__":
    unittest.main()
