"""
Step 2 — products, variants, attribute values and the latent appeal draw.

Three things here decide how hard the finished dataset is to model:

  * z_p, the observable index, and rho. Together they fix the cold-start
    ceiling at rho^2 = 0.32 — the best R^2 any model could reach from
    attributes alone, even knowing the true weights.
  * launch timing. 70% of products launch in season; the other 30% are the
    mistimed buys that later become dead stock, which is what makes dead-stock
    risk partly predictable rather than pure noise.
  * price. It is allowed to encode at most PRICE_APPEAL_COUPLING of latent
    appeal, then re-snapped to a discrete price point. More than that and price
    becomes a proxy for the label.
"""

from __future__ import annotations

import datetime as dt
import json
import re

import numpy as np

from .. import constants as C
from ..config import params as P
from ..config import seasonality as S
from ..config import size_curves as SC
from ..config import vocab as V
from ..world import Product, World

def _slug(text: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", text.upper())


def _snap_price(value: float) -> float:
    points = np.array(P.PRICE_POINTS, dtype=float)
    return float(points[int(np.argmin(np.abs(points - value)))])


def _pick_launch(w: World, category: str) -> dt.date:
    """70% in season, 30% deliberately mistimed."""
    rng = w.rng
    latest = w.profile.end - dt.timedelta(days=45)
    span_days = (latest - w.profile.start).days
    if span_days <= 0:
        return w.profile.start

    in_season = S.IN_SEASON_LAUNCH.get(category, list(range(1, 13)))
    for _ in range(30):
        day = w.profile.start + dt.timedelta(days=int(rng.randint(0, span_days)))
        wants_in_season = rng.chance(0.70)
        if (day.month in in_season) == wants_in_season:
            return day
    return w.profile.start + dt.timedelta(days=int(rng.randint(0, span_days)))


def _draw_attributes(w: World, category: str, subcategory: str) -> dict:
    rng = w.rng
    brand_names = [b[0] for b in V.BRANDS]
    brand_shares = np.array([b[2] for b in V.BRANDS])
    brand_shares = brand_shares / brand_shares.sum()
    brand = rng.choice(brand_names, p=brand_shares)
    brand_tier = dict((b[0], b[1]) for b in V.BRANDS)[brand]

    colour = rng.choice(list(V.COLOURS.keys()))
    return {
        "brand": brand,
        "brand_tier": brand_tier,
        "colour": colour,
        "colour_family": V.COLOURS[colour],
        "material": rng.choice(V.MATERIALS_BY_CATEGORY[category]),
        "pattern": rng.choice(C.PATTERNS),
        "fit": rng.choice(C.FITS),
        "sleeve": rng.choice(C.SLEEVES),
        "neck": rng.choice(C.NECKS),
    }


def _build_plan(w: World) -> list[tuple[str, str, int]]:
    """Assign every product a (category, subcategory, family_id).

    Families share category, subcategory, fit and pattern, which is what makes
    similar-product comparison meaningful — the model has genuine near-neighbours
    to compare against rather than arbitrary products.
    """
    rng = w.rng
    pairs = [(cat, sub) for cat, subs in C.TAXONOMY.items() for sub in subs]

    plan: list[tuple[str, str, int]] = []
    family_id = 0
    while len(plan) < w.profile.n_products and family_id < w.profile.n_families:
        cat, sub = pairs[int(rng.randint(0, len(pairs) - 1))]
        size = int(rng.randint(*P.FAMILY_SIZE_RANGE))
        for _ in range(min(size, w.profile.n_products - len(plan))):
            plan.append((cat, sub, family_id))
        family_id += 1

    while len(plan) < w.profile.n_products:
        cat, sub = pairs[int(rng.randint(0, len(pairs) - 1))]
        plan.append((cat, sub, -1))          # singleton

    return plan


def run(w: World) -> None:
    rng = w.rng
    plan = _build_plan(w)

    # ── level effects for the observable index z_p ───────────────────────────
    ZW = P.Z_WEIGHTS
    eff_cat = {c: float(rng.normal(0, ZW["category"])) for c in C.CATEGORIES}
    eff_sub = {s: float(rng.normal(0, ZW["subcategory"]))
               for subs in C.TAXONOMY.values() for s in subs}
    eff_tier = {t: float(rng.normal(0, ZW["brand_tier"])) for t in (0, 1, 2)}
    eff_pat = {p: float(rng.normal(0, ZW["pattern"])) for p in C.PATTERNS}
    # sorted(): iteration order of a set of strings varies per process, which
    # would make --seed non-reproducible.
    eff_col = {f: float(rng.normal(0, ZW["colour_family"]))
               for f in sorted(set(V.COLOURS.values()))}
    eff_fit = {f: float(rng.normal(0, ZW["fit"])) for f in C.FITS}

    drafts: list[dict] = []
    for cat, sub, family_id in plan:
        attrs = _draw_attributes(w, cat, sub)
        lo, hi = V.CATEGORY_PRICE_BAND[cat]
        tier_mult = V.BRAND_TIER_MARKUP[attrs["brand_tier"]]
        raw = float(rng.uniform(lo, hi)) * tier_mult
        mrp = _snap_price(min(max(raw, min(P.PRICE_POINTS)), max(P.PRICE_POINTS)))

        launch = _pick_launch(w, cat)
        drafts.append({
            "category": cat, "subcategory": sub, "family_id": family_id,
            "mrp": mrp, "launch": launch, **attrs,
        })

    # Price band relative to the subcategory median — computed across the whole
    # catalogue, which is fine: it is a static attribute, not a time-varying
    # feature, so there is no look-ahead here.
    by_sub: dict[str, list[float]] = {}
    for d in drafts:
        by_sub.setdefault(d["subcategory"], []).append(d["mrp"])
    sub_median = {s: float(np.median(v)) for s, v in by_sub.items()}

    z_raw = []
    for d in drafts:
        rel = np.log(d["mrp"] / max(sub_median[d["subcategory"]], 1.0))
        z = (eff_cat[d["category"]]
             + eff_sub[d["subcategory"]]
             + eff_tier[d["brand_tier"]]
             + eff_pat[d["pattern"]]
             + eff_col[d["colour_family"]]
             + eff_fit[d["fit"]]
             - ZW["price_band"] * rel        # dearer sells fewer units
             + ZW["season_alignment"]
             * S.season_alignment(d["category"], d["launch"].month))
        z_raw.append(z)

    z_arr = np.asarray(z_raw)
    z_std = (z_arr - z_arr.mean()) / (z_arr.std() or 1.0)

    # ── latent appeal: a_p(0) = sigma_a * (rho*z + sqrt(1-rho^2)*u) ──────────
    rho = P.LATENT_RHO
    u = rng.normal(0, 1, len(drafts))
    appeal0 = P.LATENT_SIGMA_A * (rho * z_std + np.sqrt(1 - rho ** 2) * u)

    arch_names = list(P.ARCHETYPES.keys())
    arch_probs = np.array(list(P.ARCHETYPES.values()))
    arch_probs = arch_probs / arch_probs.sum()

    el_values = np.array([e[0] for e in P.ELASTICITY_SEGMENTS])
    el_probs = np.array([e[1] for e in P.ELASTICITY_SEGMENTS])

    for i, d in enumerate(drafts):
        # Price may encode a little appeal — retailers do price on their read of
        # a product — but re-snapping to a discrete point destroys most of the
        # fine coupling, which is what keeps price from proxying the label.
        nudged = d["mrp"] * (1.0 + P.PRICE_APPEAL_COUPLING * float(appeal0[i]))
        mrp = _snap_price(nudged)

        supplier = _pick_supplier(w, d["category"])
        branded = d["brand_tier"] > 0
        markup = float(rng.uniform(*(P.MARKUP_BRANDED if branded
                                     else P.MARKUP_UNBRANDED)))
        unit_cost = round(mrp / markup * supplier.price_tier, 2)

        name = _make_name(w, d)
        pid = rng.uuid()
        base_sku = f"{_slug(d['brand'])[:3]}{_slug(d['subcategory'])[:3]}{i + 1:04d}"

        product = Product(
            id=pid, name=name, base_sku=base_sku,
            category=d["category"], subcategory=d["subcategory"],
            supplier_id=supplier.id,
            brand=d["brand"], brand_tier=d["brand_tier"],
            colour=d["colour"], colour_family=d["colour_family"],
            material=d["material"], pattern=d["pattern"], fit=d["fit"],
            sleeve=d["sleeve"], neck=d["neck"],
            mrp=mrp, unit_cost=unit_cost,
            launch_date=d["launch"],
            archetype=str(rng.choice(arch_names, p=arch_probs)),
            family_id=d["family_id"],
            elasticity=float(rng.choice(list(el_values),
                                        p=el_probs / el_probs.sum())),
            runs_small=rng.chance(P.RUNS_SMALL_SHARE),
            z_index=float(z_std[i]),
            appeal0=float(appeal0[i]),
            sizes=SC.size_set_for(d["subcategory"]),
        )
        w.products.append(product)

    _inject_surprise_pairs(w)
    _inject_duplicates(w)
    _assign_price_experiments(w)
    _emit_rows(w)


def _pick_supplier(w: World, category: str):
    candidates = [s for s in w.suppliers if category in s.categories]
    if not candidates:
        candidates = w.suppliers
    return w.rng.choice(candidates)


def _make_name(w: World, d: dict) -> str:
    style = w.rng.choice(V.STYLE_WORDS)
    singular = d["subcategory"].rstrip("s") if d["subcategory"].endswith("s") \
        else d["subcategory"]
    return f"{style} {d['colour']} {d['material']} {singular}"


def _inject_surprise_pairs(w: World) -> None:
    """Pairs identical but for colour, with a ~3x velocity gap.

    This is the "colour matters more than you think" insight the similar-product
    comparison feature exists to surface. Without it, within-family variance is
    just noise and the comparison has nothing to say.
    """
    rng = w.rng
    by_family: dict[int, list[Product]] = {}
    for p in w.products:
        if p.family_id >= 0:
            by_family.setdefault(p.family_id, []).append(p)

    eligible = [members for members in by_family.values() if len(members) >= 2]
    n = min(w.profile.n_surprise_pairs, len(eligible))
    gap = float(np.log(P.SURPRISE_VELOCITY_GAP))

    for members in rng.choice(eligible, size=n, replace=False) if n else []:
        a, b = members[0], members[1]
        mid = (a.appeal0 + b.appeal0) / 2
        a.appeal0 = mid + gap / 2
        b.appeal0 = mid - gap / 2
        # Make them differ only by colour, so the gap is genuinely attributable.
        b.material, b.pattern, b.fit = a.material, a.pattern, a.fit
        b.sleeve, b.neck, b.mrp = a.sleeve, a.neck, a.mrp


def _inject_duplicates(w: World) -> None:
    """30 true duplicate pairs across four flavours, plus 10 hard negatives.

    The hard negatives — same attributes, genuinely different colourway — are
    what make precision meaningful. Without them a detector that flags every
    attribute match looks perfect.
    """
    rng = w.rng
    n_dup = w.profile.n_duplicate_pairs
    n_neg = w.profile.n_duplicate_hard_negatives
    base = rng.choice(w.products, size=min(n_dup + n_neg, len(w.products)),
                      replace=False)

    flavours = ["exact_attrs_different_name", "name_typo_variant",
                "similar_sku", "different_entry_date"]

    for idx, src in enumerate(base):
        is_dup = idx < n_dup
        flavour = flavours[idx % len(flavours)] if is_dup else "hard_negative"

        clone = Product(**{**src.__dict__,
                           "id": rng.uuid(),
                           "variant_ids": {},
                           "sizes": list(src.sizes)})

        if flavour == "exact_attrs_different_name":
            clone.name = f"{rng.choice(V.STYLE_WORDS)} {src.colour} " \
                         f"{src.material} {src.subcategory.rstrip('s')}"
            clone.base_sku = f"{src.base_sku[:-1]}{rng.randint(0, 9)}D"
        elif flavour == "name_typo_variant":
            clone.name = src.name.lower().replace(" ", "  ", 1)
            clone.base_sku = src.base_sku + "X"
        elif flavour == "similar_sku":
            clone.base_sku = src.base_sku[:-2] + f"{rng.randint(10, 99)}"
            clone.name = src.name + " (New)"
        elif flavour == "different_entry_date":
            clone.name = src.name
            clone.base_sku = src.base_sku + "R"
            shift = int(rng.randint(45, 200))
            clone.launch_date = min(src.launch_date + dt.timedelta(days=shift),
                                    w.profile.end - dt.timedelta(days=45))
        else:
            # Hard negative: everything matches except the colour, which is a
            # genuinely different product to a retailer.
            others = [c for c in V.COLOURS if V.COLOURS[c] != src.colour_family]
            clone.colour = rng.choice(others)
            clone.colour_family = V.COLOURS[clone.colour]
            clone.name = f"{src.name.rsplit(src.colour, 1)[0]}{clone.colour}".strip()
            clone.base_sku = src.base_sku + "N"

        w.products.append(clone)
        w.truth["duplicate_pairs"].append({
            "product_a": src.id,
            "product_b": clone.id,
            "is_duplicate": int(is_dup),
            "duplicate_kind": flavour,
        })


def _assign_price_experiments(w: World) -> None:
    """Randomised 2-week price changes on 25% of products.

    Markdowns normally follow slow sales, so a naive regression on observational
    data finds discount correlated with *low* demand and estimates elasticity
    with the wrong sign. These blocks are chosen independently of demand, which
    is the only clean identification of the true elasticity in the dataset.
    """
    rng = w.rng
    n = int(len(w.products) * P.PRICE_EXPERIMENT_SHARE)
    for p in rng.choice(w.products, size=n, replace=False):
        earliest = p.launch_date + dt.timedelta(days=21)
        window = 7 * P.PRICE_EXPERIMENT_WEEKS
        latest = w.profile.end - dt.timedelta(days=window)
        if latest <= earliest:
            continue
        span = (latest - earliest).days
        start = earliest + dt.timedelta(days=int(rng.randint(0, span)))
        delta = float(rng.uniform(*P.PRICE_EXPERIMENT_DELTA))
        if rng.chance(0.5):
            delta = -delta
        p.price_experiment = (start, start + dt.timedelta(days=window), delta)


def _emit_rows(w: World) -> None:
    rng = w.rng
    attr = w.attribute_ids

    for p in w.products:
        created = dt.datetime.combine(p.launch_date, dt.time(10, 0)).isoformat()
        w.add("products", {
            "id": p.id,
            "store_id": w.store_id,
            "retail_template_id": C.CLOTHING_TEMPLATE_ID,
            "category_id": w.category_ids[p.category],
            "subcategory_id": w.subcategory_ids[(p.category, p.subcategory)],
            "supplier_id": p.supplier_id,
            "name": p.name,
            "base_sku": p.base_sku,
            "description": None,
            "base_selling_price": round(p.mrp, 2),
            "base_cost_price": round(p.unit_cost, 2),
            "status": p.status,
            "image_urls": json.dumps([]),
            "created_by": w.owner_id,
            "updated_by": w.owner_id,
            "created_at": created,
            "updated_at": created,
        })

        for name, value in (("Colour", p.colour), ("Material", p.material),
                            ("Pattern", p.pattern), ("Brand", p.brand),
                            ("Fit", p.fit), ("Sleeve", p.sleeve),
                            ("Neck", p.neck)):
            w.add("product_attribute_values", {
                "id": rng.uuid(),
                "product_id": p.id,
                "attribute_definition_id": attr[name],
                "value": value,
            })

        for order, size in enumerate(p.sizes):
            vid = rng.uuid()
            p.variant_ids[size] = vid
            w.variant_index[vid] = (p, size)
            suffix = "FS" if size == SC.FREE_SIZE else _slug(size)
            w.add("product_variants", {
                "id": vid,
                "product_id": p.id,
                "sku": f"{p.base_sku}-{suffix}",
                "display_name": f"{p.name} / {size}",
                "selling_price_override": None,
                "cost_price_override": None,
                "is_active": True,
                "sort_order": order,
                "created_at": created,
                "updated_at": created,
            })
            # Size is the only variant-level attribute. Leaving this empty was
            # defect D7 in the original app: size existed only as an SKU suffix,
            # so size-wise reporting returned nothing.
            w.add("variant_attribute_values", {
                "id": rng.uuid(),
                "variant_id": vid,
                "attribute_definition_id": attr["Size"],
                "value": size,
            })
