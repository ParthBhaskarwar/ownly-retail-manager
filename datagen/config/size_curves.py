"""
Size sets, demand priors and supplier pack ratios.

This file carries the single most important designed-in signal in the dataset.
The size-distribution recommendation feature is only meaningful if the size mix
the retailer *stocks* differs from the mix that actually *sells*. Three
mechanisms guarantee that here:

  1. Suppliers ship fixed packs (S:M:L:XL = 1:2:2:1). The retailer physically
     cannot buy the ideal mix even with perfect knowledge.
  2. The buyer orders against NATIONAL_PRIOR, while true demand follows
     STORE_TRUE_PRIOR, which is shifted about +0.4 size steps larger.
  3. Three subcategories invert the skew, so it is not one global shift a model
     could learn as a constant.

Expected observable outcome: for ~35% of products L/XL stock out weeks before
S/M, while S retains a large unsold tail at 180 days.
"""

from __future__ import annotations

SIZE_VOCAB = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"]
FREE_SIZE = "Free Size"

SIZE_SETS = {
    "standard": ["S", "M", "L", "XL", "XXL"],
    "extended": ["XS", "S", "M", "L", "XL", "XXL"],
    "plus": ["S", "M", "L", "XL", "XXL", "XXXL"],
    "free": [FREE_SIZE],
}

# Subcategories that are one-size. Everything else defaults to "standard",
# with the exceptions below.
FREE_SIZE_SUBCATEGORIES = {
    "Sarees", "Dupattas", "Shawls & Wraps", "Mufflers & Scarves", "Scarves",
    "Handkerchiefs", "Pocket Squares", "Ties & Bow Ties", "Caps & Hats", "Socks",
}
EXTENDED_SUBCATEGORIES = {
    "Blouses", "Crop Tops", "Casual Dresses", "Formal Dresses", "Party Dresses",
    "Jumpsuits", "Rompers", "Co-ord Sets", "Leggings", "Skirts", "Sports Bras",
    "Bras", "Kurtas & Kurtis",
}
PLUS_SUBCATEGORIES = {"Sleepwear", "Loungewear", "Thermals", "Innerwear"}


def size_set_for(subcategory: str) -> list[str]:
    if subcategory in FREE_SIZE_SUBCATEGORIES:
        return SIZE_SETS["free"]
    if subcategory in EXTENDED_SUBCATEGORIES:
        return SIZE_SETS["extended"]
    if subcategory in PLUS_SUBCATEGORIES:
        return SIZE_SETS["plus"]
    return SIZE_SETS["standard"]


# Unnormalised weights over SIZE_VOCAB.
# What the buyer believes (and what pack ratios encode):
NATIONAL_PRIOR = {"XS": 0.5, "S": 1.0, "M": 2.0, "L": 2.0, "XL": 1.0,
                  "XXL": 0.5, "XXXL": 0.2}
# What this store's customers actually want — shifted larger:
STORE_TRUE_PRIOR = {"XS": 0.3, "S": 1.0, "M": 2.0, "L": 3.0, "XL": 2.0,
                    "XXL": 0.9, "XXXL": 0.35}

# The three inversions, so the shift is not a learnable global constant.
INVERTED_SUBCATEGORIES = {
    "Kurtas & Kurtis": {"XS": 0.8, "S": 2.0, "M": 3.0, "L": 1.5, "XL": 0.7,
                        "XXL": 0.3, "XXXL": 0.1},
    "Crop Tops": {"XS": 1.0, "S": 2.2, "M": 2.8, "L": 1.3, "XL": 0.6,
                  "XXL": 0.25, "XXXL": 0.1},
    "Puffer Jackets": {"XS": 0.2, "S": 0.6, "M": 1.5, "L": 2.5, "XL": 2.5,
                       "XXL": 1.2, "XXXL": 0.5},
}


def _restrict(weights: dict[str, float], sizes: list[str]) -> dict[str, float]:
    if sizes == [FREE_SIZE]:
        return {FREE_SIZE: 1.0}
    sub = {s: max(weights.get(s, 0.0), 1e-6) for s in sizes}
    total = sum(sub.values())
    return {s: v / total for s, v in sub.items()}


def buyer_prior(subcategory: str) -> dict[str, float]:
    """The mix the buyer orders against — deliberately the wrong one."""
    return _restrict(NATIONAL_PRIOR, size_set_for(subcategory))


def true_demand_prior(subcategory: str) -> dict[str, float]:
    """The mix customers actually want."""
    base = INVERTED_SUBCATEGORIES.get(subcategory, STORE_TRUE_PRIOR)
    return _restrict(base, size_set_for(subcategory))


def pack_allocation(sizes: list[str], pack_size: int,
                    ratio: dict[str, int]) -> dict[str, int]:
    """Split one supplier pack across sizes using the fixed pack ratio.

    Largest-remainder apportionment, so the realised split tracks the ratio
    faithfully at any pack size. The ratio deliberately mirrors the *national*
    size curve, not this store's, which is the whole reason a size-mix
    recommendation has something to say.
    """
    if sizes == [FREE_SIZE]:
        return {FREE_SIZE: pack_size}

    weights = {s: ratio.get(s, 1) for s in sizes}
    total_w = sum(weights.values()) or len(sizes)

    exact = {s: pack_size * w / total_w for s, w in weights.items()}
    alloc = {s: int(v) for s, v in exact.items()}

    remainder = pack_size - sum(alloc.values())
    for s in sorted(sizes, key=lambda x: exact[x] - int(exact[x]), reverse=True):
        if remainder <= 0:
            break
        alloc[s] += 1
        remainder -= 1
    return alloc
