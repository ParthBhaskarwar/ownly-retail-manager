"""
Product vocabulary: brands, colours, materials and name templates.

Brands are fictional. They carry a tier (which feeds both price and the
observable index z_p) and a share, so the catalogue is dominated by a handful
of house labels the way a real small store's is.

Colour families matter beyond decoration: they drive seasonal demand
(config/seasonality.COLOUR_MONTH) and the store's local-fit preference.
"""

from __future__ import annotations

# (name, tier, share). tier: 0 = unbranded/house, 1 = mid, 2 = premium.
BRANDS = [
    ("Ownly Basics", 0, 0.16),
    ("Street Nine", 0, 0.11),
    ("Kora Label", 0, 0.10),
    ("Rangrez", 0, 0.09),
    ("Deccan Threads", 1, 0.09),
    ("Indigo Lane", 1, 0.08),
    ("Aarohi", 1, 0.08),
    ("Mistry & Co", 1, 0.07),
    ("Verano", 1, 0.06),
    ("Bombay Weft", 2, 0.05),
    ("Saphed", 2, 0.04),
    ("Noor Atelier", 2, 0.04),
    ("Sable Roy", 2, 0.03),
]

BRAND_TIER_MARKUP = {0: 1.0, 1: 1.15, 2: 1.45}

# colour -> family. Families feed seasonality and the store preference vector.
COLOURS = {
    "White": "neutral", "Off White": "neutral", "Beige": "neutral",
    "Grey": "neutral", "Charcoal": "dark", "Black": "dark",
    "Navy": "dark", "Olive": "dark", "Brown": "dark", "Maroon": "jewel",
    "Wine": "jewel", "Emerald": "jewel", "Royal Blue": "jewel",
    "Mustard": "jewel", "Rust": "jewel", "Teal": "jewel",
    "Powder Blue": "pastel", "Blush Pink": "pastel", "Mint": "pastel",
    "Lavender": "pastel", "Peach": "pastel", "Ivory": "pastel",
    "Red": "bright", "Yellow": "bright", "Orange": "bright",
    "Turquoise": "bright", "Magenta": "bright", "Lime": "bright",
}

MATERIALS_BY_CATEGORY = {
    "Topwear": ["Cotton", "Cotton Blend", "Linen", "Rayon", "Polyester",
                "Viscose", "Denim"],
    "Bottomwear": ["Denim", "Cotton", "Cotton Blend", "Polyester", "Linen",
                   "Lycra Blend"],
    "Ethnic Wear": ["Silk", "Cotton Silk", "Georgette", "Chiffon", "Rayon",
                    "Banarasi Silk", "Chanderi"],
    "Dresses & Jumpsuits": ["Rayon", "Georgette", "Crepe", "Cotton", "Polyester",
                            "Satin"],
    "Activewear": ["Polyester", "Nylon Blend", "Dry-Fit Polyester",
                   "Cotton Blend", "Spandex Blend"],
    "Innerwear & Sleepwear": ["Cotton", "Modal", "Cotton Blend", "Fleece",
                              "Satin"],
    "Winter Wear": ["Wool", "Wool Blend", "Fleece", "Leather", "Nylon",
                    "Polyfill"],
    "Accessories": ["Leather", "Cotton", "Silk", "Wool", "Polyester",
                    "Synthetic"],
}

# Descriptive words used to build product names. Kept small on purpose so the
# duplicate-detection feature has near-collisions to find.
STYLE_WORDS = [
    "Classic", "Everyday", "Weekend", "Festive", "Office", "Relaxed", "Signature",
    "Heritage", "Urban", "Essential", "Premium", "Casual", "Party", "Traditional",
]

# Base price band by category, before brand tier and material adjust it.
CATEGORY_PRICE_BAND = {
    "Topwear": (399, 1499),
    "Bottomwear": (599, 1999),
    "Ethnic Wear": (799, 2999),
    "Dresses & Jumpsuits": (599, 2499),
    "Activewear": (399, 1499),
    "Innerwear & Sleepwear": (299, 999),
    "Winter Wear": (999, 2999),
    "Accessories": (299, 999),
}

SUPPLIER_NAMES = [
    "Shreeji Textiles", "Anand Garments", "Nova Apparel", "Kanchan Fabrics",
    "Meridian Clothing", "Sunrise Knitwear", "Pearl Exports", "Vaibhav Trading",
    "Crescent Mills", "Gulmohar Apparel", "Trident Garments", "Aster Textiles",
    "Bluebird Clothing", "Sahyadri Mills", "Orchid Fashions",
]

STAFF_NAMES = [
    ("Arya Pawar", "OWNER"),
    ("Rehan Shaikh", "MANAGER"),
    ("Divya Nair", "CASHIER"),
    ("Karan Mehta", "CASHIER"),
    ("Neha Kulkarni", "INVENTORY_STAFF"),
    ("Sameer Joshi", "ACCOUNTANT"),
]

# Customer name pools for walk-in capture.
FIRST_NAMES = [
    "Aditya", "Priya", "Rohan", "Sneha", "Vikram", "Anjali", "Nikhil", "Pooja",
    "Rahul", "Kavya", "Amit", "Shreya", "Manish", "Deepa", "Siddharth", "Ritu",
    "Arjun", "Meera", "Varun", "Isha", "Sanjay", "Tanvi", "Harsh", "Nisha",
]
LAST_NAMES = [
    "Sharma", "Patel", "Deshpande", "Iyer", "Reddy", "Gupta", "Singh", "Rao",
    "Bhat", "Chauhan", "Menon", "Kulkarni", "Jain", "Shetty", "Naik", "Malhotra",
]

STORE_NAME = "Vastra Bazaar (Synthetic Demo)"
STORE_CITY = "Pune"
