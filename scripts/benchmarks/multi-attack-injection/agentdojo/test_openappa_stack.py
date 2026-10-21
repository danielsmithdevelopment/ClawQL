"""Unit tests for OpenAPPA + IFC compose (no sidecar required)."""

from __future__ import annotations

import unittest

from clawql_tools_executor import _compose_disposition, _openappa_to_disposition
from openappa_client import OpenAppaVerdict, openappa_enabled_for_defense


class ComposeTests(unittest.TestCase):
    def test_openappa_park_beats_ifc_allow(self) -> None:
        d, mech = _compose_disposition("park", None)
        self.assertEqual(d, "park")
        self.assertEqual(mech, "openappa_layer5")

    def test_ifc_hard_beats_openappa_park(self) -> None:
        d, mech = _compose_disposition("park", "hard_block")
        self.assertEqual(d, "hard_block")
        self.assertEqual(mech, "clawql_data_flow_taint")

    def test_dual_park_composed(self) -> None:
        d, mech = _compose_disposition("park", "park")
        self.assertEqual(d, "park")
        self.assertEqual(mech, "composed")

    def test_both_allow(self) -> None:
        d, mech = _compose_disposition(None, None)
        self.assertIsNone(d)
        self.assertEqual(mech, "allow")

    def test_verdict_mandate(self) -> None:
        v = OpenAppaVerdict(
            allow=False,
            status="mandate_required",
            reason="requires attention: human-approval",
            decision="deny_call",
            raw={},
        )
        self.assertEqual(_openappa_to_disposition(v), "park")

    def test_defense_ids(self) -> None:
        self.assertTrue(openappa_enabled_for_defense("clawql_data_flow_openappa"))
        self.assertFalse(openappa_enabled_for_defense("clawql_data_flow"))
        self.assertFalse(openappa_enabled_for_defense("none"))


if __name__ == "__main__":
    unittest.main()
