import numpy as np


def series(values) -> list[float | None]:
    """Array → lista JSON; NaN e infinito viram null (JSON não tem NaN)."""
    arr = np.asarray(values, dtype=float)
    out = arr.tolist()
    if not np.isfinite(arr).all():
        for i in np.flatnonzero(~np.isfinite(arr)):
            out[i] = None
    return out
