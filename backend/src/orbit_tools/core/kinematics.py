# Copiado de trajetory-analysis/backend/src/trajetoria/core/kinematics.py (commit ceb084d, 10/11/2026).
"""
Derivadas numéricas e bandas de servo.

Bandas: frequência natural ωn (rad/s) de um servo tipo 2, cujo erro de atraso para uma
aceleração é ε = s̈ / Ka, com Ka = ωn². Logo ωn = sqrt(|s̈| / ε).

    - Regime: s̈ é a aceleração da trajetória.
    - Aquisição: o servo parte do repouso e deve atingir a velocidade do alvo no tempo de
      aquisição T_aq, o que equivale a s̈ = ṡ / T_aq.
"""

from __future__ import annotations

import numpy as np


def derivatives(x, h: float) -> tuple[np.ndarray, np.ndarray]:
    """
    Primeira e segunda derivadas alinhadas às amostras, com a mesma janela [i-1, i, i+1]:

        v[i] = (x[i+1] - x[i-1]) / 2h
        a[i] = (x[i+1] - 2x[i] + x[i-1]) / h²

    Nas bordas a velocidade usa diferença unilateral de 2ª ordem e a aceleração fica NaN.

    Args:
        x: série amostrada uniformemente.
        h: tempo de amostragem (s).
    """
    x = np.asarray(x, dtype=float)
    v = np.gradient(x, h, edge_order=2)
    a = np.full(x.shape, np.nan)
    a[1:-1] = np.diff(x, n=2) / h**2
    return v, a


def regime_band(acceleration, error) -> np.ndarray:
    """Banda de regime ωn = sqrt(|s̈| / ε). ε na mesma unidade de s (rad ou m)."""
    return np.sqrt(np.abs(np.asarray(acceleration)) / error)


def acquisition_band(velocity, error, acquisition_time: float) -> np.ndarray:
    """Banda de aquisição ωn = sqrt(|ṡ| / (ε · T_aq))."""
    return np.sqrt(np.abs(np.asarray(velocity)) / (error * acquisition_time))
