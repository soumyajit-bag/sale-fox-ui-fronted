"""
Unit Test Suite for Exact Model Isolation and Accessory Filtering
Asserts 6/6 strict isolation criteria for Apple Intelligence Pro.
"""

import unittest
from apple_scraper import matches_exact_model, is_valid_handset

class TestAppleModelMatcher(unittest.TestCase):

    def setUp(self):
        # Sample test products representing the authentic Apple catalog
        self.iphone_16 = {
            "title": "Apple iPhone 16 (Ultramarine, 128 GB)",
            "model": "iPhone 16",
            "price_num": 79900.0
        }
        self.iphone_16_plus = {
            "title": "Apple iPhone 16 Plus (Teal, 256 GB)",
            "model": "iPhone 16 Plus",
            "price_num": 89900.0
        }
        self.iphone_16_pro = {
            "title": "Apple iPhone 16 Pro (Desert Titanium, 128 GB)",
            "model": "iPhone 16 Pro",
            "price_num": 119900.0
        }
        self.iphone_16_pro_max = {
            "title": "Apple iPhone 16 Pro Max (Desert Titanium, 256 GB)",
            "model": "iPhone 16 Pro Max",
            "price_num": 144900.0
        }
        self.iphone_15 = {
            "title": "Apple iPhone 15 (Black, 128 GB)",
            "model": "iPhone 15",
            "price_num": 69900.0
        }
        self.iphone_15_plus = {
            "title": "Apple iPhone 15 Plus (Black, 128 GB)",
            "model": "iPhone 15 Plus",
            "price_num": 79900.0
        }
        self.iphone_15_pro = {
            "title": "Apple iPhone 15 Pro (Natural Titanium, 128 GB)",
            "model": "iPhone 15 Pro",
            "price_num": 109900.0
        }
        self.iphone_15_pro_max = {
            "title": "Apple iPhone 15 Pro Max (Blue Titanium, 256 GB)",
            "model": "iPhone 15 Pro Max",
            "price_num": 134900.0
        }
        self.iphone_se = {
            "title": "Apple iPhone SE (Midnight, 64 GB)",
            "model": "iPhone SE",
            "price_num": 47600.0
        }

        # Negative test items (accessories, wearables, non-handsets)
        self.airpods_pro = {
            "title": "AirPods Pro (2nd generation) with MagSafe Case (USB-C)",
            "model": "AirPods Pro",
            "price_num": 24900.0
        }
        self.apple_watch_ultra = {
            "title": "Apple Watch Ultra 2 GPS + Cellular, 49mm Titanium Case",
            "model": "Apple Watch Ultra 2",
            "price_num": 89900.0
        }
        self.magsafe_case = {
            "title": "iPhone 16 Pro Silicone Case with MagSafe - Star Fruit",
            "model": "iPhone 16 Pro Silicone Case",
            "price_num": 4900.0
        }
        self.adapter_20w = {
            "title": "20W USB-C Power Adapter",
            "model": "20W USB-C Power Adapter",
            "price_num": 1900.0
        }
        self.charging_cable = {
            "title": "60W USB-C Charge Cable (1 m)",
            "model": "USB-C Charge Cable",
            "price_num": 1900.0
        }

    def test_01_iphone_16_matches_base_and_rejects_subvariants(self):
        """1. iPhone 16 matches iPhone 16, rejects Pro, Pro Max, Plus."""
        query = "iPhone 16"
        self.assertTrue(matches_exact_model(self.iphone_16, query), "iPhone 16 should match query 'iPhone 16'")
        self.assertFalse(matches_exact_model(self.iphone_16_plus, query), "iPhone 16 query must reject iPhone 16 Plus")
        self.assertFalse(matches_exact_model(self.iphone_16_pro, query), "iPhone 16 query must reject iPhone 16 Pro")
        self.assertFalse(matches_exact_model(self.iphone_16_pro_max, query), "iPhone 16 query must reject iPhone 16 Pro Max")

    def test_02_iphone_16_pro_matches_pro_and_rejects_max_and_base(self):
        """2. iPhone 16 Pro matches iPhone 16 Pro, rejects Pro Max and base 16."""
        query = "iPhone 16 Pro"
        self.assertTrue(matches_exact_model(self.iphone_16_pro, query), "iPhone 16 Pro should match query 'iPhone 16 Pro'")
        self.assertFalse(matches_exact_model(self.iphone_16_pro_max, query), "iPhone 16 Pro query must reject iPhone 16 Pro Max")
        self.assertFalse(matches_exact_model(self.iphone_16, query), "iPhone 16 Pro query must reject base iPhone 16")
        self.assertFalse(matches_exact_model(self.iphone_16_plus, query), "iPhone 16 Pro query must reject iPhone 16 Plus")

    def test_03_iphone_16_pro_max_matches_only_pro_max(self):
        """3. iPhone 16 Pro Max matches only Pro Max."""
        query = "iPhone 16 Pro Max"
        self.assertTrue(matches_exact_model(self.iphone_16_pro_max, query), "iPhone 16 Pro Max should match query 'iPhone 16 Pro Max'")
        self.assertFalse(matches_exact_model(self.iphone_16_pro, query), "iPhone 16 Pro Max query must reject iPhone 16 Pro")
        self.assertFalse(matches_exact_model(self.iphone_16, query), "iPhone 16 Pro Max query must reject base iPhone 16")

    def test_04_iphone_15_matches_base_and_rejects_subvariants(self):
        """4. iPhone 15 matches iPhone 15, rejects 15 Pro, 15 Pro Max, 15 Plus."""
        query = "iPhone 15"
        self.assertTrue(matches_exact_model(self.iphone_15, query), "iPhone 15 should match query 'iPhone 15'")
        self.assertFalse(matches_exact_model(self.iphone_15_pro, query), "iPhone 15 query must reject iPhone 15 Pro")
        self.assertFalse(matches_exact_model(self.iphone_15_pro_max, query), "iPhone 15 query must reject iPhone 15 Pro Max")
        self.assertFalse(matches_exact_model(self.iphone_15_plus, query), "iPhone 15 query must reject iPhone 15 Plus")

    def test_05_iphone_se_matches_only_se_variants(self):
        """5. iPhone SE matches only SE variants."""
        query = "iPhone SE"
        self.assertTrue(matches_exact_model(self.iphone_se, query), "iPhone SE should match query 'iPhone SE'")
        self.assertFalse(matches_exact_model(self.iphone_16, query), "iPhone SE query must reject iPhone 16")
        self.assertFalse(matches_exact_model(self.iphone_15, query), "iPhone SE query must reject iPhone 15")

    def test_06_negative_filtering_rejects_accessories(self):
        """6. Negative filtering rejects AirPods, Apple Watch Ultra, MagSafe Silicone Cases, 20W Adapters."""
        self.assertFalse(is_valid_handset(self.airpods_pro), "Must reject AirPods")
        self.assertFalse(is_valid_handset(self.apple_watch_ultra), "Must reject Apple Watch Ultra")
        self.assertFalse(is_valid_handset(self.magsafe_case), "Must reject MagSafe Silicone Case")
        self.assertFalse(is_valid_handset(self.adapter_20w), "Must reject 20W Power Adapter")
        self.assertFalse(is_valid_handset(self.charging_cable), "Must reject Charging Cable")
        
        # Also ensure matcher rejects them directly
        self.assertFalse(matches_exact_model(self.airpods_pro, "All"))
        self.assertFalse(matches_exact_model(self.apple_watch_ultra, "All"))
        self.assertFalse(matches_exact_model(self.magsafe_case, "iPhone 16 Pro"))
        self.assertFalse(matches_exact_model(self.adapter_20w, "iPhone 16"))


if __name__ == "__main__":
    unittest.main()
