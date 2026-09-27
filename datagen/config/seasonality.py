"""
Category x month and colour x month demand seasonality.

Vectors are Jan..Dec multipliers. They are intentionally *not* normalised to
mean 1.0 per category — winter wear genuinely sells a fraction of its December
volume in June, and flattening that would remove the strongest seasonal signal
in the dataset.
"""

from __future__ import annotations

CATEGORY_MONTH = {
    #                     Jan   Feb   Mar   Apr   May   Jun   Jul   Aug   Sep   Oct   Nov   Dec
    "Topwear":            [0.95, 0.95, 1.05, 1.10, 1.15, 1.05, 0.90, 0.95, 1.00, 1.15, 1.10, 1.00],
    "Bottomwear":         [1.00, 0.95, 1.05, 1.10, 1.10, 1.00, 0.90, 0.95, 1.00, 1.10, 1.05, 1.00],
    "Ethnic Wear":        [0.85, 0.95, 0.90, 0.85, 0.80, 0.75, 0.70, 0.85, 1.05, 1.45, 1.40, 1.20],
    "Dresses & Jumpsuits":[0.95, 1.00, 1.05, 1.05, 1.00, 0.90, 0.80, 0.90, 1.00, 1.25, 1.20, 1.20],
    "Activewear":         [1.35, 1.15, 1.10, 1.05, 1.00, 0.85, 0.80, 0.90, 0.95, 1.00, 0.95, 0.95],
    "Innerwear & Sleepwear":[1.00, 0.95, 1.00, 1.05, 1.10, 1.00, 0.95, 0.95, 1.00, 1.05, 1.00, 0.95],
    "Winter Wear":        [1.30, 0.90, 0.45, 0.20, 0.12, 0.10, 0.10, 0.15, 0.35, 0.85, 1.50, 1.75],
    "Accessories":        [0.95, 1.00, 0.95, 0.95, 0.95, 0.85, 0.85, 0.95, 1.00, 1.25, 1.15, 1.15],
}

# Colour families track season independently of category — pastels in spring,
# jewel tones through the festive quarter. This gives the "local fit" feature a
# second axis beyond size, so it is not just a size-mix rebrand.
COLOUR_MONTH = {
    #            Jan   Feb   Mar   Apr   May   Jun   Jul   Aug   Sep   Oct   Nov   Dec
    "pastel":   [0.85, 0.95, 1.15, 1.25, 1.25, 1.10, 1.00, 0.95, 0.95, 0.85, 0.80, 0.85],
    "bright":   [0.95, 1.00, 1.10, 1.15, 1.15, 1.05, 1.00, 1.05, 1.05, 1.10, 1.00, 1.00],
    "jewel":    [1.05, 1.00, 0.90, 0.85, 0.80, 0.85, 0.90, 1.00, 1.15, 1.35, 1.30, 1.20],
    "dark":     [1.15, 1.05, 0.95, 0.85, 0.80, 0.85, 0.95, 1.00, 1.05, 1.15, 1.20, 1.25],
    "neutral":  [1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00],
}

# Months in which launching a product is "in season" for its category. Used for
# the season-alignment term of the observable index z_p, and to create the
# deliberately mistimed buys that feed dead stock.
IN_SEASON_LAUNCH = {
    "Topwear": [2, 3, 4, 8, 9, 10],
    "Bottomwear": [2, 3, 4, 8, 9, 10],
    "Ethnic Wear": [7, 8, 9, 10],
    "Dresses & Jumpsuits": [8, 9, 10, 11],
    "Activewear": [10, 11, 12, 1],
    "Innerwear & Sleepwear": list(range(1, 13)),
    "Winter Wear": [8, 9, 10],
    "Accessories": [8, 9, 10, 11],
}


def category_season(category: str, month: int) -> float:
    return CATEGORY_MONTH.get(category, [1.0] * 12)[month - 1]


def colour_season(colour_family: str, month: int) -> float:
    return COLOUR_MONTH.get(colour_family, [1.0] * 12)[month - 1]


def season_alignment(category: str, launch_month: int) -> float:
    """+1 if launched in season, -1 if launched a season early/late."""
    return 1.0 if launch_month in IN_SEASON_LAUNCH.get(category, []) else -1.0
