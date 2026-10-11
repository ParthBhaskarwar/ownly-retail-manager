"""
The single seeded random source.

Everything stochastic in the generator draws from one `Rng` instance so a run
is reproducible from `--seed` alone. That includes UUIDs — reruns with the same
seed produce byte-identical CSVs, which is what makes the output usable as
evidence rather than as a one-off artefact.
"""

from __future__ import annotations

import uuid

import numpy as np


class Rng:
    def __init__(self, seed: int) -> None:
        self.seed = seed
        self.g = np.random.default_rng(seed)

    # ── identifiers ───────────────────────────────────────────────────────────

    def uuid(self) -> str:
        """A deterministic RFC-4122 v4 UUID drawn from the seeded stream."""
        b = bytearray(self.g.integers(0, 256, size=16, dtype=np.uint8).tolist())
        b[6] = (b[6] & 0x0F) | 0x40      # version 4
        b[8] = (b[8] & 0x3F) | 0x80      # variant 10
        return str(uuid.UUID(bytes=bytes(b)))

    # ── basic draws ───────────────────────────────────────────────────────────

    def uniform(self, lo: float = 0.0, hi: float = 1.0, size=None):
        return self.g.uniform(lo, hi, size)

    def normal(self, mu: float = 0.0, sd: float = 1.0, size=None):
        return self.g.normal(mu, sd, size)

    def lognormal(self, mu: float = 0.0, sd: float = 1.0, size=None):
        return self.g.lognormal(mu, sd, size)

    def gamma(self, shape: float, scale: float = 1.0, size=None):
        return self.g.gamma(shape, scale, size)

    def beta(self, a: float, b: float, size=None):
        return self.g.beta(a, b, size)

    def poisson(self, lam, size=None):
        return self.g.poisson(lam, size)

    def dirichlet(self, alpha, size=None):
        return self.g.dirichlet(alpha, size)

    def choice(self, items, size=None, p=None, replace=True):
        idx = self.g.choice(len(items), size=size, p=p, replace=replace)
        if size is None:
            return items[int(idx)]
        return [items[int(i)] for i in np.atleast_1d(idx)]

    def shuffled(self, items: list):
        out = list(items)
        self.g.shuffle(out)
        return out

    def chance(self, p: float) -> bool:
        return bool(self.g.random() < p)

    def randint(self, lo: int, hi: int, size=None):
        """Inclusive on both ends, matching how ranges are written in config."""
        return self.g.integers(lo, hi + 1, size=size)

    # ── distributions the demand model needs ──────────────────────────────────

    def negative_binomial(self, mean, k: float):
        """Gamma-Poisson counts with mean `mean` and variance mean + mean^2/k.

        Poisson is under-dispersed for retail demand — a product at 3 units/day
        would have a 30-day CV of 0.105, which pushes forecast R^2 to ~0.98 and
        makes the whole dataset trivially solvable. k = 2.0 is the design value.
        """
        mean = np.maximum(np.asarray(mean, dtype=float), 1e-9)
        p = k / (k + mean)
        return self.g.negative_binomial(k, p)

    def ar1_path(self, n: int, phi: float, sigma_stationary: float,
                 x0: float | None = None) -> np.ndarray:
        """An AR(1) series already at its stationary variance.

        sigma_eta is derived from the stationary sd so the process does not
        need a burn-in: x_t = phi*x_{t-1} + sigma_eta*eta_t.
        """
        sigma_eta = sigma_stationary * np.sqrt(max(1.0 - phi * phi, 1e-12))
        out = np.empty(n, dtype=float)
        out[0] = self.g.normal(0.0, sigma_stationary) if x0 is None else x0
        eta = self.g.normal(0.0, 1.0, n)
        for t in range(1, n):
            out[t] = phi * out[t - 1] + sigma_eta * eta[t]
        return out

    def truncated_lognormal(self, mu: float, sd: float,
                            lo: float, hi: float) -> float:
        for _ in range(24):
            v = float(self.g.lognormal(mu, sd))
            if lo <= v <= hi:
                return v
        return float(np.clip(self.g.lognormal(mu, sd), lo, hi))


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def softmax_dict(weights: dict[str, float]) -> dict[str, float]:
    total = sum(weights.values())
    if total <= 0:
        n = len(weights)
        return {k: 1.0 / n for k in weights}
    return {k: v / total for k, v in weights.items()}
