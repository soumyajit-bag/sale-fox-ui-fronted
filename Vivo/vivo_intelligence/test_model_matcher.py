"""
Unit Test Suite for Vivo Intelligence Pro
Asserts:
1. Exact model isolation (anti-accessory rule)
2. Price sanity check (price_num > 0 and price_num <= mrp_num)
3. SKU variant uniqueness
4. Deliverability and stock determination logic
"""

import unittest
import os
import sys

# Ensure local module can be imported
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vivo_scraper import VivoScraper, ACCESSORY_BLACKLIST


class TestVivoModelMatcher(unittest.TestCase):
    def setUp(self):
        self.scraper = VivoScraper()

    def test_exact_model_isolation_anti_accessory(self):
        """Asserts that zero accessories slip through and all smartphones are recognized."""
        # Non-handset accessories that MUST be rejected
        accessories = [
            "Vivo TWS 3e Earbuds (Dark Indigo)",
            "vivo Buds Basalt Black",
            "Vivo Wireless Sport Earphones",
            "vivoLife Phone Strap Orange",
            "Vivo 10W FlashCharge Power Adapter",
            "Vivo 80W FlashCharge Type-C Adapter",
            "Vivo X100 Pro Premium Leather Protective Case",
            "Vivo V40 5G Tempered Glass Screen Protector",
            "Vivo Watch 3 with ECG Monitoring",
            "Vivo USB Type-C Super Fast Charge Cable (1m)",
            "Vivo 10000mAh Power Bank 22.5W"
        ]
        for acc in accessories:
            self.assertFalse(
                self.scraper.is_valid_handset(acc),
                f"Accessory '{acc}' should be rejected by exact-model isolation!"
            )

        # Valid authentic smartphones that MUST be accepted
        phones = [
            "Vivo X Fold3 Pro",
            "Vivo X Fold6 (Nebula Teal)",
            "Vivo X100 Pro 5G",
            "Vivo X100 (Asteroid Black)",
            "Vivo X300 FE",
            "Vivo V40 Pro 5G",
            "Vivo V40 5G (Ganges Blue)",
            "Vivo V40e 5G",
            "Vivo V80",
            "Vivo V70",
            "Vivo T3 Ultra 5G",
            "Vivo T3 Pro 5G",
            "Vivo T3 5G",
            "Vivo T5 5G",
            "Vivo T5x 5G",
            "Vivo T5 Lite 44W 5G",
            "Vivo Y300 5G",
            "Vivo Y200 Pro 5G",
            "Vivo Y400 5G",
            "Vivo Y51 Pro 5G",
            "Vivo Y31 5G",
            "Vivo Y18"
        ]
        for phone in phones:
            self.assertTrue(
                self.scraper.is_valid_handset(phone),
                f"Valid handset '{phone}' should be accepted!"
            )

    def test_price_sanity(self):
        """Asserts price_num > 0 and price_num <= mrp_num across all catalog items."""
        items = self.scraper.scrape()
        self.assertGreater(len(items), 0, "Scraper should return product variants")

        for item in items:
            p = item.get("price_num", 0)
            m = item.get("mrp_num", 0)
            title = item.get("title", "")
            
            self.assertGreater(p, 0, f"Price must be positive for {title}")
            self.assertGreater(m, 0, f"MRP must be positive for {title}")
            self.assertLessEqual(p, m, f"Selling price {p} cannot exceed MRP {m} for {title}")

    def test_variant_uniqueness(self):
        """Asserts SKU uniqueness across variants."""
        items = self.scraper.scrape()
        skus = [item["sku"] for item in items]
        unique_skus = set(skus)
        self.assertEqual(len(skus), len(unique_skus), "All product variant SKUs must be strictly unique!")

    def test_deliverability_and_stock(self):
        """Asserts deliverability status is boolean and matches availability string badge."""
        items = self.scraper.scrape()
        for item in items:
            in_stock = item["in_stock"]
            avail = item["availability"]
            self.assertIsInstance(in_stock, bool, "in_stock must be a boolean")
            if in_stock:
                self.assertEqual(avail, "In Stock")
            else:
                self.assertIn(avail, ["Out of Stock", "Pre-Order"])


if __name__ == "__main__":
    unittest.main()
