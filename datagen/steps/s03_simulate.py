"""
Step 3 — the day-by-day simulation: procurement, demand, sales, returns.

These cannot be separate steps. The buyer reorders from *observed* trailing
sales, and sales are censored by whatever the buyer previously bought, so
procurement and demand are mutually dependent and have to advance together on
one clock. Splitting them would force the buyer to see either the future or the
latent appeal, and either one turns current stock into an oracle feature.

Structure:

  precompute()   the part of lambda(p,t) that depends on neither stock nor
                 markdown -- latent appeal, store shock, season, festive, day of
                 week, age, store preference. One 640 x 1100 matrix.
  run()          walks each day: receive lots, draw demand, censor by stock,
                 build baskets, schedule returns, and reorder weekly.

Markdown is deliberately endogenous: it follows slow sales. That means a naive
regression of units on discount recovers the *wrong sign*, which is exactly the
trap the randomised price experiments in step 2 exist to escape.
"""

from __future__ import annotations

import datetime as dt
from collections import deque

import numpy as np

from .. import constants as C
from ..config import calendar_in as CAL
from ..config import params as P
from ..config import seasonality as S
from ..config import size_curves as SC
from ..config import vocab as V
from ..rng import sigmoid
from ..world import Item, Product, World

_SIZE_ORDER = SC.SIZE_VOCAB


# ── demand shape helpers ─────────────────────────────────────────────────────

def _age_response(age: np.ndarray, archetype: str) -> np.ndarray:
    """Age response curve per archetype.

    A single global decay would teach a model "old = bad" and make it recommend
    clearing perfectly good seasonal stock every spring, so basics stay flat and
    seasonal products carry no age penalty at all -- their season handles it.
    """
    a = np.maximum(age, 0.0)
    if archetype == "hit":
        return (1 - np.exp(-a / 12.0)) * np.exp(-np.maximum(a - 180, 0) / 320.0)
    if archetype == "steady_basic":
        return np.full_like(a, 1.0) * np.exp(-np.maximum(a - 400, 0) / 500.0)
    if archetype == "fad":
        return np.exp(-((a - 28.0) ** 2) / (2 * 26.0 ** 2)) * 1.6 + 0.06
    if archetype == "slow_burn":
        return 0.35 + 0.75 * (1 - np.exp(-a / 130.0))
    if archetype == "flop":
        return np.exp(-a / 150.0) * 0.8 + 0.05
    return np.full_like(a, 1.0)          # seasonal: season drives it, not age


def _discount_lift(markdown: float) -> float:
    """Threshold-and-saturate response: flat under 10%, steep 12-30%, saturating.

    Being multiplicative-and-linear-in-logs everywhere would let an OLS on logs
    invert the whole generator, so this term is deliberately non-linear.
    """
    if markdown <= 0:
        return 1.0
    return 1.0 + P.DISCOUNT_LIFT_MAX * float(
        sigmoid((markdown - P.DISCOUNT_LIFT_MID) / P.DISCOUNT_LIFT_SCALE)
        - sigmoid((0.0 - P.DISCOUNT_LIFT_MID) / P.DISCOUNT_LIFT_SCALE)
    )


def _store_pref(p: Product) -> float:
    mult = P.STORE_PREF_COLOUR.get(p.colour_family, 1.0)
    mult *= P.STORE_PREF_CATEGORY.get(p.category, 1.0)
    for (lo, hi), m in P.STORE_PREF_PRICE_BAND.items():
        if lo <= p.mrp < hi:
            mult *= m
            break
    return mult


# ── precomputation ───────────────────────────────────────────────────────────

def precompute(w: World) -> np.ndarray:
    """The stock- and markdown-independent part of lambda(p, t)."""
    rng = w.rng
    products = w.products
    n_p, n_t = len(products), w.profile.n_days
    days = w.days

    # Latent appeal: AR(1) per product on log scale, stepped weekly, starting
    # at a_p(0). phi = 0.94 means a trailing mean cannot be a sufficient
    # statistic for future demand -- the single most important knob here.
    n_w = w.n_weeks
    appeal = np.empty((n_p, n_w))
    for i, p in enumerate(products):
        # The path is anchored at the product's LAUNCH week, not at calendar
        # week zero: a_p(launch) == appeal0, which is what carries the designed
        # rho^2 = 0.32 coupling to the observable index into the cold-start
        # window where it is actually needed.
        launch_week = max(w.week_index(p.launch_date), 0)
        path = rng.ar1_path(n_w, P.LATENT_PHI, P.LATENT_SIGMA_A, x0=p.appeal0)
        aligned = np.empty(n_w)
        aligned[:launch_week] = p.appeal0          # never used: pre-launch is masked
        aligned[launch_week:] = path[:n_w - launch_week]
        appeal[i] = aligned
        w.appeal_series[p.id] = aligned

    # One store-wide shock shared by every product. Without it, per-product
    # errors are independent and aggregate forecasts get unrealistically good.
    shock = rng.ar1_path(n_w, P.STORE_SHOCK_PHI, P.STORE_SHOCK_SIGMA)
    w.store_shock = list(shock)

    week_of = np.array([w.week_index(d) for d in days])
    month_of = np.array([d.month for d in days])
    dow_of = np.array([d.weekday() for d in days])
    open_of = np.array([1.0 if w.is_open(d) else 0.0 for d in days])

    base = np.array([P.ARCHETYPE_BASE[p.archetype] * _store_pref(p)
                     for p in products])
    launch_idx = np.array([(p.launch_date - w.profile.start).days
                           for p in products])

    # Per-day multipliers that vary by category / colour family.
    cats = C.CATEGORIES
    fams = sorted(set(V.COLOURS.values()))
    cat_ix = np.array([cats.index(p.category) for p in products])
    fam_ix = np.array([fams.index(p.colour_family) for p in products])

    season_ct = np.empty((len(cats), n_t))
    festive_ct = np.empty((len(cats), n_t))
    for ci, cat in enumerate(cats):
        for ti, d in enumerate(days):
            season_ct[ci, ti] = (S.category_season(cat, d.month)
                                 * CAL.wedding_lift(d, cat))
            festive_ct[ci, ti] = CAL.festive_multiplier(d, cat)[0]

    colour_ft = np.empty((len(fams), n_t))
    for fi, fam in enumerate(fams):
        for ti in range(n_t):
            colour_ft[fi, ti] = S.colour_season(fam, int(month_of[ti]))

    dow_mult = np.array(P.DOW_MULTIPLIERS)[dow_of]

    # Age response, grouped by archetype so the curve is applied vectorised.
    age = np.arange(n_t)[None, :] - launch_idx[:, None]
    age_resp = np.zeros_like(age, dtype=float)
    for arch in P.ARCHETYPES:
        mask = np.array([p.archetype == arch for p in products])
        if mask.any():
            age_resp[mask] = _age_response(age[mask].astype(float), arch)

    active = (age >= 0).astype(float)

    m = (base[:, None]
         * np.exp(appeal[:, week_of])
         * np.exp(shock[week_of])[None, :]
         * season_ct[cat_ix]
         * festive_ct[cat_ix]
         * colour_ft[fam_ix]
         * dow_mult[None, :]
         * open_of[None, :]
         * age_resp
         * active)

    # Calibrate the global scale so realised sales land near the profile target.
    # Done on the unconstrained series; stockouts pull the realised total below
    # this, which is why the target is units *purchased*-driven rather than exact.
    total = m.sum()
    if total > 0:
        m *= (w.profile.target_invoices * 1.75 * P.DEMAND_SCALE) / total
    return m


# ── markdown policy (endogenous on purpose) ──────────────────────────────────

def _markdown_for(w: World, p: Product, day: dt.date, on_hand: int,
                  sold_to_date: int, purchased_to_date: int) -> float:
    if purchased_to_date == 0:
        return 0.0
    age = (day - p.launch_date).days
    sell_through = sold_to_date / max(purchased_to_date, 1)

    if CAL.is_eoss(day):
        return float(w.rng.uniform(0.25, 0.45))
    # Markdowns chase slow sales -- this is the confound the price experiments
    # are designed to break.
    if age > 120 and sell_through < 0.40 and on_hand > 2:
        return float(min(0.45, 0.10 + (age - 120) / 900.0))
    if age > 240 and sell_through < 0.65 and on_hand > 0:
        return float(w.rng.uniform(0.15, 0.35))
    return 0.0


def _unit_price(p: Product, day: dt.date) -> float:
    """List price on a day, including any randomised price-experiment block."""
    if p.price_experiment:
        start, end, delta = p.price_experiment
        if start <= day < end:
            return round(p.mrp * (1.0 + delta), 2)
    return p.mrp


# ── main loop ────────────────────────────────────────────────────────────────

class _State:
    def __init__(self, w: World) -> None:
        self.on_hand: dict[str, list[Item]] = {}      # variant_id -> items
        self.sold: dict[str, int] = {}                # product_id -> units
        self.purchased: dict[str, int] = {}
        self.recent_sales: dict[str, deque] = {}      # product_id -> last 28 days
        self.day_sales: dict[str, int] = {}           # reset every day
        self.exposure: dict[str, int] = {}            # in-stock open days
        self.pending: dict[dt.date, list] = {}
        self.on_order: dict[str, int] = {}   # product_id -> units in flight
        self.markdown: dict[str, float] = {}
        self.return_queue: dict[dt.date, list] = {}


def run(w: World) -> None:
    from . import s05_sales, s06_returns

    rng = w.rng
    lam = precompute(w)
    st = _State(w)
    products = w.products
    p_index = {p.id: i for i, p in enumerate(products)}

    for p in products:
        st.sold[p.id] = 0
        st.purchased[p.id] = 0
        st.recent_sales[p.id] = deque(maxlen=28)
        st.exposure[p.id] = 0
        st.markdown[p.id] = 0.0
        for vid in p.variant_ids.values():
            st.on_hand[vid] = []

    by_family: dict[int, list[Product]] = {}
    for p in products:
        if p.family_id >= 0:
            by_family.setdefault(p.family_id, []).append(p)

    for ti, day in enumerate(w.days):
        st.day_sales = {}
        _receive_lots(w, st, day)

        # Opening buy for anything launching today.
        for p in products:
            if p.launch_date == day:
                _place_order(w, st, p, day, initial=True)

        if w.is_open(day):
            events = _demand_for_day(w, st, lam, p_index, by_family, day, ti)
            if events:
                s05_sales.build_invoices(w, st, day, events)

        s06_returns.process_due(w, st, day)

        # End of day: record what actually sold. The buyer sees only this.
        for p in products:
            if p.launch_date > day:
                continue
            st.recent_sales[p.id].append(st.day_sales.get(p.id, 0))
            if w.is_open(day) and _on_hand_count(st, p) > 0:
                st.exposure[p.id] += 1

        # Weekly review: refresh markdowns, then replenish.
        if day.weekday() == 0:
            for p in products:
                if p.launch_date > day:
                    continue
                st.markdown[p.id] = _markdown_for(
                    w, p, day, _on_hand_count(st, p),
                    st.sold.get(p.id, 0), st.purchased.get(p.id, 0))
                _review_and_reorder(w, st, p, day)

    w._sim_state = st          # handed to later steps for shrinkage/anomalies


# ── stock helpers ────────────────────────────────────────────────────────────

def _on_hand_count(st: _State, p: Product) -> int:
    return sum(len(st.on_hand[v]) for v in p.variant_ids.values())


def _demand_for_day(w: World, st: _State, lam: np.ndarray, p_index: dict,
                    by_family: dict, day: dt.date, ti: int) -> list[dict]:
    rng = w.rng
    products = w.products

    rates = lam[:, ti].copy()
    for i, p in enumerate(products):
        if rates[i] <= 0:
            continue
        md = st.markdown[p.id]
        price = _unit_price(p, day)
        # Price experiments move price independently of demand -- the only clean
        # identification of elasticity anywhere in the dataset.
        rates[i] *= (price / p.mrp) ** p.elasticity
        rates[i] *= _discount_lift(md)

    demand = rng.negative_binomial(rates, P.NB_DISPERSION_K)
    demand = np.where(rates > 0, demand, 0)

    # Store capacity: a soft ramp then a hard ceiling. Introduces a mild negative
    # coupling across products on peak days, which no per-product model can invert.
    total = int(demand.sum())
    if total > P.CAPACITY_SOFT:
        keep = min(1.0, P.CAPACITY_HARD / total) if total > P.CAPACITY_HARD else \
            1.0 - 0.35 * (total - P.CAPACITY_SOFT) / max(
                P.CAPACITY_HARD - P.CAPACITY_SOFT, 1)
        demand = rng.g.binomial(demand, max(min(keep, 1.0), 0.05))

    events: list[dict] = []
    for i, p in enumerate(products):
        units = int(demand[i])
        if units <= 0:
            continue
        w.latent_demand.append({
            "product_id": p.id, "day": day.isoformat(), "latent_units": units,
        })
        shares = SC.true_demand_prior(p.subcategory)
        sizes = list(shares.keys())
        probs = np.array([shares[s] for s in sizes])
        for _ in range(units):
            size = str(rng.choice(sizes, p=probs))
            item = _take_item(w, st, p, size, by_family)
            if item is None:
                continue
            price = _unit_price(p, day)
            md = st.markdown[p.id]
            events.append({
                "product": p, "item": item, "size": item.size,
                "unit_price": price,
                "line_discount": round(price * md, 2),
                "markdown": md,
            })
    return events


def _take_item(w: World, st: _State, p: Product, size: str,
               by_family: dict) -> Item | None:
    """Pull one physical unit, applying the substitution ladder on a stockout.

    35% of blocked demand moves to an adjacent size, 20% to a sibling product,
    45% is simply lost. That lost fraction is what makes stockout censoring real
    rather than cosmetic, and it is why the ML export needs an exposure offset.
    """
    rng = w.rng
    vid = p.variant_ids.get(size)
    if vid and st.on_hand.get(vid):
        return st.on_hand[vid].pop()

    roll = rng.uniform()
    if roll < P.SUBST_ADJACENT_SIZE:
        for cand in _adjacent_sizes(w, p, size):
            cvid = p.variant_ids.get(cand)
            if cvid and st.on_hand.get(cvid):
                return st.on_hand[cvid].pop()
    elif roll < P.SUBST_ADJACENT_SIZE + P.SUBST_SIBLING_PRODUCT:
        for sib in by_family.get(p.family_id, []):
            if sib.id == p.id:
                continue
            svid = sib.variant_ids.get(size)
            if svid and st.on_hand.get(svid):
                return st.on_hand[svid].pop()
    return None


def _adjacent_sizes(w: World, p: Product, size: str) -> list[str]:
    if size not in _SIZE_ORDER:
        return []
    i = _SIZE_ORDER.index(size)
    near = [s for s in (_SIZE_ORDER[i - 1] if i > 0 else None,
                        _SIZE_ORDER[i + 1] if i + 1 < len(_SIZE_ORDER) else None)
            if s and s in p.sizes]
    if len(near) == 2 and w.rng.uniform() > P.SUBST_ADJACENT_SPLIT[0]:
        near.reverse()
    return near


# ── procurement ──────────────────────────────────────────────────────────────

def _supplier_of(w: World, p: Product):
    return next(s for s in w.suppliers if s.id == p.supplier_id)


def _review_and_reorder(w: World, st: _State, p: Product, day: dt.date) -> None:
    """Reorder from OBSERVED trailing velocity, with real buyer mistakes.

    Critically the buyer never sees latent appeal or future demand. If it did,
    on-hand stock would encode the label and every downstream model would be
    reading an oracle.
    """
    recent = st.recent_sales[p.id]
    velocity = sum(recent) / max(len(recent), 1)
    on_hand = _on_hand_count(st, p)

    # A real buyer counts what is already on its way; ignoring in-flight orders
    # makes them reorder the same shortfall every week and badly overbuy.
    position = on_hand + st.on_order.get(p.id, 0)
    cover = position / velocity if velocity > 0 else (999.0 if position else 0.0)
    if cover >= P.REORDER_COVER_DAYS:
        return
    if velocity <= 0 and position > 0:
        return                     # nothing selling and stock left: do not buy

    _place_order(w, st, p, day, velocity=velocity)


def _place_order(w: World, st: _State, p: Product, day: dt.date, *,
                 velocity: float = 0.0, initial: bool = False) -> None:
    rng = w.rng
    supplier = _supplier_of(w, p)

    if initial:
        # No history yet: the buyer guesses from the category, which is where
        # over-buying (and therefore dead stock) is born.
        packs = int(rng.randint(*P.OPENING_PACKS))
    else:
        want = velocity * 7 * P.REORDER_WEEKS_OF_SUPPLY
        want *= float(rng.lognormal(0.0, P.BUYER_ERROR_SD))
        roll = rng.uniform()
        if roll < P.BUYER_OVERBUY_RATE:
            want *= float(rng.uniform(1.5, 2.5))
        elif roll < P.BUYER_OVERBUY_RATE + P.BUYER_UNDERBUY_RATE:
            want *= float(rng.uniform(0.4, 0.7))
        pack_size = P.PACK_SIZES[0]
        packs = int(max(1, round(want / pack_size)))
        packs = min(packs, 8)

    pack_size = int(rng.choice(P.PACK_SIZES))
    alloc: dict[str, int] = {}
    for _ in range(packs):
        for size, qty in SC.pack_allocation(p.sizes, pack_size,
                                            P.PACK_RATIO).items():
            alloc[size] = alloc.get(size, 0) + qty

    if rng.chance(supplier.short_ship_rate):
        for size in list(alloc):
            alloc[size] = int(alloc[size] * rng.uniform(0.5, 0.85))

    lead = int(rng.randint(*supplier.lead_time))
    arrival = day + dt.timedelta(days=lead)
    if arrival > w.profile.end:
        return
    st.pending.setdefault(arrival, []).append((p, alloc, supplier))
    st.on_order[p.id] = st.on_order.get(p.id, 0) + sum(alloc.values())


def _receive_lots(w: World, st: _State, day: dt.date) -> None:
    rng = w.rng
    for p, alloc, supplier in st.pending.pop(day, []):
        st.on_order[p.id] = max(0, st.on_order.get(p.id, 0) - sum(alloc.values()))
        lot_id = rng.uuid()
        # Per-lot cost noise, so margin is not a clean constant per product.
        lot_cost = round(p.unit_cost * float(rng.uniform(1 - P.LOT_COST_NOISE,
                                                         1 + P.LOT_COST_NOISE)), 2)
        for size, qty in alloc.items():
            vid = p.variant_ids.get(size)
            if not vid or qty <= 0:
                continue
            for _ in range(qty):
                seq = w.next_barcode_seq()
                item = Item(
                    id=rng.uuid(), variant_id=vid, product_id=p.id, size=size,
                    barcode=C.make_barcode(w.store_code,
                                           f"{p.base_sku}-{size}", seq),
                    cost=lot_cost, purchase_date=day, lot_id=lot_id,
                )
                w.items[item.id] = item
                st.on_hand[vid].append(item)
                st.purchased[p.id] = st.purchased.get(p.id, 0) + 1

                w.add("inventory_items", {
                    "id": item.id, "store_id": w.store_id, "variant_id": vid,
                    "barcode": item.barcode,
                    "purchase_cost_price": lot_cost,
                    "purchase_date": day.isoformat(),
                    "status": "IN_STOCK",
                    "created_by": w.owner_id,
                    "created_at": dt.datetime.combine(day, dt.time(8, 0)).isoformat(),
                    "updated_at": dt.datetime.combine(day, dt.time(8, 0)).isoformat(),
                })
                w.add("inventory_movements", {
                    "id": rng.uuid(), "store_id": w.store_id,
                    "inventory_item_id": item.id,
                    "movement_type": "PURCHASE",
                    # Initial entry has no prior status, matching how the
                    # backend writes the opening PURCHASE movement.
                    "from_status": "IN_STOCK", "to_status": "IN_STOCK",
                    "reference_type": "PURCHASE_ENTRY", "reference_id": lot_id,
                    "performed_by": w.owner_id,
                    "performed_at": dt.datetime.combine(day, dt.time(8, 0)).isoformat(),
                    "notes": f"Lot from {supplier.name}",
                })
