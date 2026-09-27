"""
Indian retail calendar: festivals, wedding season, EOSS, closed days.

Festival dates are real and *move* year to year for the lunar ones. That
movement is deliberately useful: it stops month-of-year being a perfect proxy
for festive demand, so a model has to learn the actual driver.

Lunar dates are approximate to the day (regional observance varies); for a
synthetic dataset that is immaterial, but do not treat this as an almanac.
"""

from __future__ import annotations

import datetime as dt

# name -> peak dates. Peak = the highest-selling day, generally the eve or the
# day itself rather than the observance date for multi-day festivals.
FESTIVALS: dict[str, list[dt.date]] = {
    "Diwali": [
        dt.date(2023, 11, 12), dt.date(2024, 10, 31),
        dt.date(2025, 10, 20), dt.date(2026, 11, 8),
    ],
    "Dussehra": [
        dt.date(2023, 10, 24), dt.date(2024, 10, 12),
        dt.date(2025, 10, 2), dt.date(2026, 10, 20),
    ],
    "Navratri": [   # start of the nine nights; drives ethnic wear hard
        dt.date(2023, 10, 15), dt.date(2024, 10, 3),
        dt.date(2025, 9, 22), dt.date(2026, 10, 11),
    ],
    "Ganesh Chaturthi": [
        dt.date(2023, 9, 19), dt.date(2024, 9, 7),
        dt.date(2025, 8, 27), dt.date(2026, 9, 14),
    ],
    "Raksha Bandhan": [
        dt.date(2023, 8, 30), dt.date(2024, 8, 19),
        dt.date(2025, 8, 9), dt.date(2026, 8, 28),
    ],
    "Eid al-Fitr": [
        dt.date(2023, 4, 22), dt.date(2024, 4, 11),
        dt.date(2025, 3, 31), dt.date(2026, 3, 20),
    ],
    "Holi": [
        dt.date(2023, 3, 8), dt.date(2024, 3, 25),
        dt.date(2025, 3, 14), dt.date(2026, 3, 4),
    ],
    "Christmas": [dt.date(y, 12, 25) for y in (2023, 2024, 2025, 2026)],
    "New Year": [dt.date(y, 1, 1) for y in (2024, 2025, 2026)],
}

# Relative-day -> multiplier. The +1..+10 slump is the important part: without
# it a model learns festive demand is free and will over-buy into the trough,
# which is the exact mistake the restocking feature exists to prevent.
FESTIVE_CURVE: list[tuple[int, int, float]] = [
    (-30, -15, 1.15),
    (-14, -8, 1.50),
    (-7, -2, 2.40),
    (-1, 0, 2.90),
    (1, 10, 0.65),
    (11, 20, 0.88),
]

# How hard each category responds to a festive peak. 1.0 = follows the curve
# exactly; scaling is applied to (multiplier - 1).
FESTIVE_CATEGORY_SCALE = {
    "Ethnic Wear": 1.58,
    "Dresses & Jumpsuits": 0.84,
    "Accessories": 0.63,
    "Topwear": 0.42,
    "Bottomwear": 0.26,
    "Activewear": 0.20,
    "Innerwear & Sleepwear": 0.11,
    "Winter Wear": 0.15,          # Winter peaks in Dec-Jan, not at Diwali
}

# Wedding season: Nov-Feb, +25% on ethnic and dresses.
WEDDING_MONTHS = [11, 12, 1, 2]
WEDDING_LIFT = {"Ethnic Wear": 1.25, "Dresses & Jumpsuits": 1.25}

# End of season sale: units up, realised price down, margin down hard.
EOSS_MONTHS = [1, 7]
EOSS_UNIT_LIFT = 1.60
EOSS_PRICE_CUT = 0.30
EOSS_MARGIN_CUT = 0.45


def _in_window(delta: int) -> float:
    for lo, hi, mult in FESTIVE_CURVE:
        if lo <= delta <= hi:
            return mult
    return 1.0


def festive_multiplier(day: dt.date, category: str) -> tuple[float, str | None]:
    """Return (multiplier, festival name) for a category on a given day.

    When festivals overlap, the strongest single effect wins rather than
    compounding — two festivals a week apart do not make a 6x day.
    """
    scale = FESTIVE_CATEGORY_SCALE.get(category, 0.5)
    best, best_name = 1.0, None
    for name, dates in FESTIVALS.items():
        for peak in dates:
            delta = (day - peak).days
            if -30 <= delta <= 20:
                raw = _in_window(delta)
                adj = 1.0 + (raw - 1.0) * scale
                if abs(adj - 1.0) > abs(best - 1.0):
                    best, best_name = adj, name
    return best, best_name


# The three that actually drive festive trading behaviour. Every festival lifts
# demand (see festive_multiplier), but only these change how the shop discounts
# and how big baskets get.
MAJOR_FESTIVALS = ("Diwali", "Dussehra", "Navratri")


def is_festive_window(day: dt.date, span: int = 30) -> bool:
    """Any festival's demand window. Wide by design — used for demand only."""
    return any(
        -span <= (day - peak).days <= 10
        for dates in FESTIVALS.values()
        for peak in dates
    )


def is_major_festive_window(day: dt.date) -> bool:
    """The tight commercial window: two weeks before a major festival to three
    days after. Use this for discounting, basket size and returns — the wide
    window above overlaps so heavily it would mark most of the year festive."""
    return any(
        -14 <= (day - peak).days <= 3
        for name in MAJOR_FESTIVALS
        for peak in FESTIVALS[name]
    )


def is_eoss(day: dt.date) -> bool:
    return day.month in EOSS_MONTHS


def wedding_lift(day: dt.date, category: str) -> float:
    if day.month in WEDDING_MONTHS:
        return WEDDING_LIFT.get(category, 1.0)
    return 1.0
