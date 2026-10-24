"""Keep the standalone frontend's scoring tables identical to the backend."""
from pathlib import Path
import unittest


class ScoringAssetTests(unittest.TestCase):
    def test_frontend_scoring_asset_matches_backend_byte_for_byte(self):
        root = Path(__file__).resolve().parents[2]
        self.assertEqual(
            (root / "frontend/src/assets/eccd_scoring_data.json").read_bytes(),
            (root / "backend/eccd_scoring_data.json").read_bytes(),
            "Refresh the frontend scoring asset from backend/eccd_scoring_data.json",
        )
