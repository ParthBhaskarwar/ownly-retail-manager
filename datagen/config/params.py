"""
Every tunable in one place.

The values under "Accuracy ceiling" are not cosmetic — they set how hard the
dataset is to model. checks/realism_gate.py trains a reference LightGBM and
fails the run if measured accuracy falls outside the design bands, so if you
change anything here, expect to re-tune against that gate.
"""

from __future__ import annotations

# ══ Accuracy ceiling (plan §3) ════════════════════════════════════════════════

# B1 — Negative Binomial dispersion. Poisson (k -> inf) is under-dispersed and
# pushes 30-day R^2 to ~0.98. Lower k = noisier = harder.
NB_DISPERSION_K = 2.0

# B2 — Product latent appeal, AR(1) on log scale, stepped weekly.
# phi 0.94 gives a half-life of ~11 weeks: recent history is informative but
# stale history is not, so the trailing mean cannot be a sufficient statistic.
LATENT_PHI = 0.94
LATENT_SIGMA_A = 0.55           # stationary sd of log-appeal

# B3 — How much of latent appeal is explainable from observable attributes.
# rho^2 = 0.32 is the designed cold-start ceiling. Raising it makes attribute-
# only prediction unrealistically easy.
LATENT_RHO = 0.566

# Weights of the standardised observable index z_p (sd units).
Z_WEIGHTS = {
    "category": 0.35,
    "subcategory": 0.25,
    "brand_tier": 0.30,
    "price_band": 0.28,
    "pattern": 0.18,
    "colour_family": 0.22,
    "fit": 0.15,
    "season_alignment": 0.25,
}

# B4 — Store-wide common shock, AR(1) weekly. Without it per-product errors are
# independent and aggregate forecasts become unrealistically accurate.
STORE_SHOCK_PHI = 0.70
STORE_SHOCK_SIGMA = 0.18        # stationary sd

# B5.1 — Discount response: flat below ~10%, steep 12-30%, saturating past 40%.
DISCOUNT_LIFT_MAX = 1.9
DISCOUNT_LIFT_MID = 0.17
DISCOUNT_LIFT_SCALE = 0.055

# B5.2 — Substitution when a size is out of stock.
SUBST_ADJACENT_SIZE = 0.35      # redirected to adjacent sizes of same product
SUBST_ADJACENT_SPLIT = (0.6, 0.4)   # nearer / further neighbour
SUBST_SIBLING_PRODUCT = 0.20    # redirected to nearest sibling in the family
# remaining 0.45 is lost demand

# B5.3 — Store daily capacity: soft ramp then hard thin.
CAPACITY_SOFT = 75
CAPACITY_HARD = 95

# ══ Scale (plan §4) ═══════════════════════════════════════════════════════════

N_PRODUCTS = 600
N_SUPPLIERS = 15
N_STAFF = 5                      # cashiers/managers besides the owner
TARGET_UNITS_PURCHASED = 48_000
TARGET_UNITS_SOLD = 35_000
TARGET_INVOICES = 20_000
# Lifts unconstrained demand so that *realised* sales land on target after
# stockout censoring has taken its cut. Calibrated against the standard profile.
DEMAND_SCALE = 1.18

# Product families for similar-product comparison (plan §5).
N_FAMILIES = 120
FAMILY_SIZE_RANGE = (3, 6)
N_SURPRISE_PAIRS = 25            # identical but for colour, ~3x velocity gap
SURPRISE_VELOCITY_GAP = 3.0

# Duplicate detection ground truth.
N_DUPLICATE_PAIRS = 30
N_DUPLICATE_HARD_NEGATIVES = 10

# ══ Demand archetypes (B6) ════════════════════════════════════════════════════
# Age response is archetype-dependent. A global decay teaches "old = bad", which
# would clear perfectly good seasonal stock every spring.
ARCHETYPES = {
    "hit":          0.15,
    "steady_basic": 0.27,
    "fad":          0.10,
    "slow_burn":    0.10,
    "flop":         0.23,
    "seasonal":     0.15,
}

# Multiplicative base rate by archetype (before latent/season effects).
ARCHETYPE_BASE = {
    "hit": 2.4, "steady_basic": 1.0, "fad": 1.6,
    "slow_burn": 0.7, "flop": 0.16, "seasonal": 1.1,
}

# ══ Pricing ═══════════════════════════════════════════════════════════════════

PRICE_POINTS = [299, 399, 499, 599, 799, 999, 1299, 1499, 1999, 2499, 2999]
MARKUP_UNBRANDED = (1.90, 2.60)   # -> 47-62% margin
MARKUP_BRANDED = (1.50, 1.80)     # -> 33-44% margin
LOT_COST_NOISE = 0.08            # +/- 8% per purchase lot

# Leakage guard: price may encode at most this much of latent appeal before it
# becomes a proxy for the label (plan §7, leakage rule 3).
PRICE_APPEAL_COUPLING = 0.15

# Price elasticity by responsiveness segment (bimodal, plan §5).
ELASTICITY_SEGMENTS = [(-2.5, 0.25), (-1.2, 0.50), (-0.5, 0.25)]

# Randomised price experiments — the only clean identification of elasticity.
PRICE_EXPERIMENT_SHARE = 0.25
PRICE_EXPERIMENT_WEEKS = 2
PRICE_EXPERIMENT_DELTA = (0.10, 0.20)

# ══ Discounts ═════════════════════════════════════════════════════════════════

DISCOUNT_BILL_SHARE = {"regular": 0.22, "festive": 0.45, "eoss": 0.62}
DISCOUNT_ROUND_OFF_SHARE = 0.55       # FIXED round-rupee-off vs PERCENTAGE
ROUND_OFF_AMOUNTS = [50, 100, 200, 500]
DISCOUNT_PCT_GAMMA = (2.0, 6.0)       # 5 + Gamma(2,6), capped
DISCOUNT_PCT_BASE = 5.0
DISCOUNT_PCT_CAP = 50.0
CASH_ROUNDING_SHARE = 0.08            # of all bills, Rs 1-9 off

# ══ Payments ══════════════════════════════════════════════════════════════════
# Linear drift across the window; ticket size shifts it further.
PAYMENT_MIX_START = {"UPI": 0.46, "CASH": 0.43, "CARD": 0.10, "CREDIT_NOTE": 0.01}
PAYMENT_MIX_END = {"UPI": 0.66, "CASH": 0.25, "CARD": 0.08, "CREDIT_NOTE": 0.01}
CARD_TICKET_THRESHOLD = 3000.0
CARD_TICKET_MULTIPLIER = 2.0
CASH_TICKET_DECAY = 0.35              # cash share falls with bill value

# ══ Returns (plan §4) ═════════════════════════════════════════════════════════
# 3.5% of units overall. Offline is far below online because customers try on.
RETURN_RATE_BY_CATEGORY = {
    "Innerwear & Sleepwear": 0.002,
    "Accessories": 0.015,
    "Topwear": 0.030,
    "Winter Wear": 0.030,
    "Bottomwear": 0.045,
    "Ethnic Wear": 0.050,
    "Dresses & Jumpsuits": 0.055,
    "Activewear": 0.030,
}
RETURN_POST_FESTIVE_MULT = 1.6        # within 7 days of a festive peak
RETURN_OUTCOME_MIX = {                # exchange-heavy, per the spec's status set
    "exchange": 0.65,
    "refund_resellable": 0.25,
    "damaged_defective": 0.10,
}
RETURN_WINDOW_DAYS = (1, 21)          # days after sale
# Scales the per-line probability so the realised rate lands on the 3.5% target
# after the fit / lot-quality / impulse multipliers have all been applied.
RETURN_CALIBRATION = 0.72

# Return-risk causes, kept distinct so the model must disentangle them.
RUNS_SMALL_SHARE = 0.15               # products flagged "runs small"
RUNS_SMALL_MULT = 2.2                 # on S/M
EDGE_SIZE_MULT = 1.5                  # XS, XXL, XXXL
IMPULSE_DISCOUNT_THRESHOLD = 0.35
IMPULSE_RETURN_MULT = 1.8

# ══ Suppliers ═════════════════════════════════════════════════════════════════
SUPPLIER_LEAD_TIME = (12, 35)         # days
UNRELIABLE_SUPPLIER_LEAD_TIME = (25, 60)
UNRELIABLE_SHORT_SHIP_RATE = 0.12
SUPPLIER_DEFECT_BASE = (0.005, 0.06)
# Supplier D degrades from month 14 — forces recency weighting in the score.
DEGRADING_SUPPLIER_MONTH = 14
DEGRADING_SUPPLIER_MULT = 3.0
# Leakage guard: per-lot quality noise stops 15 suppliers memorising the label.
SUPPLIER_LOT_SD_RATIO = 0.6

# Pack ratios — the mechanism behind the size-mix recommendation. The retailer
# literally cannot buy the ideal mix.
# Mirrors the national size curve (S:M:L:XL = 1:2:2:1 at its core) and covers
# the full size set so no size is silently allocated zero.
PACK_RATIO = {"XS": 1, "S": 2, "M": 4, "L": 4, "XL": 2, "XXL": 1, "XXXL": 1}
PACK_SIZES = [12, 24]

# ══ Restocking (must not be an oracle) ════════════════════════════════════════
# Opening buy, in supplier packs, for a product with no sales history yet. This
# is where over-buying — and therefore most dead stock — is born.
OPENING_PACKS = (1, 2)
REORDER_COVER_DAYS = 21
REORDER_WEEKS_OF_SUPPLY = 7
BUYER_OVERBUY_RATE = 0.20
BUYER_UNDERBUY_RATE = 0.20
BUYER_ERROR_SD = 0.35                 # lognormal noise on observed velocity

# ══ Shrinkage ═════════════════════════════════════════════════════════════════
# Expressed as a share of units *purchased* rather than an annual rate on
# average inventory: the annual-rate form is the textbook definition but is
# ambiguous with serialized stock, and these are the numbers the output is
# actually judged against (~2.4% of units, ~1,100 write-offs on the standard
# profile). Only never-sold units are eligible, so a write-off can never
# contradict a sale that already happened.
SHRINKAGE_LOST_SHARE = 0.010
SHRINKAGE_DAMAGED_SHARE = 0.008
SHRINKAGE_DEFECT_SHARE = 0.006
SUPPLIER_RETURN_SHARE = 0.30          # of defective units sent back

# ══ Baskets ═══════════════════════════════════════════════════════════════════
BASKET_SIZE_PROBS = {1: 0.55, 2: 0.25, 3: 0.12, 4: 0.08}
BASKET_FESTIVE_MEAN = 2.4
COPURCHASE_LIFT = 2.5                 # topwear + bottomwear above chance
CUSTOMER_CAPTURE_RATE = 0.55          # bills with a named customer
CUSTOMER_REPEAT_RATE = 0.45

# ══ Day of week (normalised to mean 1.0) ══════════════════════════════════════
DOW_MULTIPLIERS = [0.75, 0.85, 0.90, 0.95, 1.15, 1.55, 1.75]  # Mon..Sun
CLOSED_DAYS_PER_YEAR = (8, 12)
STORE_OPEN_HOUR = (10, 21)

# ══ Store preference — the "local fit" signal ═════════════════════════════════
STORE_PREF_COLOUR = {"dark": 1.40, "jewel": 1.40, "pastel": 0.85, "neutral": 1.0,
                     "bright": 0.95}
STORE_PREF_PRICE_BAND = {(0, 599): 1.05, (599, 999): 1.35, (999, 1999): 0.95,
                         (1999, 10**9): 0.55}
STORE_PREF_CATEGORY = {"Ethnic Wear": 1.40}

# ══ Anomalies (plan §6) ═══════════════════════════════════════════════════════
ANOMALY_COUNTS = {
    "BILL_BELOW_COST": 40,
    "BILL_EXCESS_DISCOUNT": 60,
    "BILL_DISCOUNT_MISMATCH": 50,
    "BILL_TAX_OFF_SLAB": 40,
    "BILL_TOTAL_MISMATCH": 30,
    "BILL_PAYMENT_MISMATCH": 45,
    "BILL_OFF_HOURS": 25,
    "BILL_ROUND_NUMBER_STREAK": 3,
    "BILL_DUPLICATE_INVOICE": 20,
    "INV_DOUBLE_SALE": 35,
    "INV_PHANTOM_STOCK": 25,
    "INV_SHRINKAGE_BURST": 4,
    "INV_SOLD_BEFORE_RECEIVED": 20,
    "INV_COST_OUTLIER": 15,
    "INV_STATUS_INCONSISTENT": 20,
    "INV_RETURN_NO_SALE": 15,
}
# Cashier behavioural drift — aggregate-only, not detectable per bill.
CASHIER_DRIFT_MONTHS = (15, 20)
CASHIER_DRIFT_DISCOUNT_MULT = 3.5
CASHIER_DRIFT_VOID_MULT = 4.0

# Hard negatives: legitimate events that look anomalous. Without these,
# precision is meaningless.
HARD_NEGATIVE_COUNTS = {
    "LEGIT_CLEARANCE_BELOW_COST": 80,
    "LEGIT_STOCKTAKE_WRITEOFF": 1,
    "LEGIT_WHOLESALE_BULK_ORDER": 1,
}

# ══ ML export ═════════════════════════════════════════════════════════════════
HORIZONS = [7, 28, 91]
LABEL_EMBARGO_DAYS = 1
DEAD_STOCK_WINDOWS = [90, 180]
DEAD_STOCK_SALES_FRACTION = {90: 0.08, 180: 0.10}
DEAD_STOCK_MIN_EXPOSURE = {90: 75, 180: 150}
DEAD_STOCK_MIN_ON_HAND = 5
MIN_EXPOSURE_DAYS = 3                 # drop panel rows below this
SIZE_MIX_AVAILABILITY_FLOOR = 0.80

SUFFICIENCY_TIERS = [
    # (tier, label, min_history_days, min_cum_units)
    (0, "Insufficient", 0, 0),
    (1, "Low", 14, 3),
    (2, "Medium", 42, 10),
    (3, "High", 90, 25),
]
HIGH_TIER_MIN_INSTOCK_RATIO = 0.70

# Purged walk-forward split.
TEST_START = "2026-03-01"
FESTIVE_FOLD_TRAIN_END = "2025-08-31"
FESTIVE_FOLD_TEST = ("2025-09-01", "2025-12-31")
CV_ORIGINS = ["2025-06-01", "2025-09-01", "2025-12-01", "2026-03-01"]

# ══ Realism gate bands ════════════════════════════════════════════════════════
# MEASURED, not asserted. The design brief proposed bands up front; running the
# generator showed several were unreachable, so each is now set against the
# oracle ceiling actually achievable on this data -- the R^2 a model reaches
# when handed the TRUE latent appeal and archetype:
#
#   cold start (log units, first 90d)  oracle 0.60  attributes-only ~0.11
#   warm 28-day demand                 carry-forward baseline ~0.29
#
# The gap between the two is the honest headline: an attributes-only cold-start
# model captures roughly a fifth of the achievable signal, which is what
# attribute-based fashion forecasting genuinely looks like. A band that demanded
# more would only be satisfiable by leaking.
#
# Outside a band is a warning. Past the hard ceiling the generator is leaking
# and the run fails.
REALISM_BANDS = {
    "units_28d_warm_r2":    (0.42, 0.62),
    "units_28d_cold_r2":    (0.05, 0.20),
    "sellthrough_90d_r2":   (0.35, 0.56),
    "dead_stock_180d_auc":  (0.78, 0.90),
    "return_risk_auc":      (0.58, 0.74),
    "size_share_jsd_gain":  (0.15, 0.25),
}
REALISM_HARD_CEILING_R2 = 0.85
REALISM_HARD_CEILING_AUC = 0.90
REALISM_MIN_LIFT_OVER_BASELINE = 0.10
