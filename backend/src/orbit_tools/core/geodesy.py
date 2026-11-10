# Copiado de trajetory-analysis/backend/src/trajetoria/core/geodesy.py (commit ceb084d, 10/11/2026),
# sem geodesic_distance (geographiclib fica fora do núcleo). Acréscimos do orbit-tools no fim do arquivo.
"""
Transformações geodésicas vetorizadas (numpy): geodésico ↔ ECEF, ECEF ↔ ENU local,
ENU → azimute/elevação/distância, graus/minutos/segundos.

Convenções:
    - Ângulos de entrada e saída em graus, salvo indicação (sufixo _rad).
    - ENU: x = leste, y = norte, z = cima, com origem num ponto geodésico de referência.
    - Azimute medido a partir do norte, no sentido horário, em [0, 360) graus.
    - Altura geodésica (acima do elipsoide), não altitude ortométrica.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

import numpy as np

Datum = Literal["wgs84", "wgs72"]


@dataclass(frozen=True)
class Ellipsoid:
    """Elipsoide de revolução definido pelo semieixo maior a (m) e achatamento f."""

    name: str
    a: float
    f: float

    @property
    def b(self) -> float:
        return self.a * (1.0 - self.f)

    @property
    def e2(self) -> float:
        """Primeira excentricidade ao quadrado."""
        return self.f * (2.0 - self.f)


ELLIPSOIDS: dict[str, Ellipsoid] = {
    "wgs84": Ellipsoid("WGS84", 6378137.0, 1.0 / 298.257223563),
    "wgs72": Ellipsoid("WGS72", 6378135.0, 1.0 / 298.26),
}


def get_ellipsoid(datum: str) -> Ellipsoid:
    try:
        return ELLIPSOIDS[datum.lower()]
    except KeyError:
        raise ValueError(f"Elipsoide desconhecido: {datum!r}. Opções: {sorted(ELLIPSOIDS)}") from None


@dataclass(frozen=True)
class GeodeticPoint:
    """Ponto geodésico: latitude e longitude em graus, altura acima do elipsoide em m."""

    lat: float
    lon: float
    height: float


def geodetic_to_ecef(lat, lon, h, ell: Ellipsoid) -> np.ndarray:
    """
    Coordenadas geodésicas → ECEF.

    Returns:
        np.ndarray (..., 3) com X, Y, Z em m.
    """
    phi = np.radians(lat)
    lam = np.radians(lon)
    h = np.asarray(h, dtype=float)
    sin_phi, cos_phi = np.sin(phi), np.cos(phi)
    n = ell.a / np.sqrt(1.0 - ell.e2 * sin_phi**2)  # raio de curvatura no primeiro vertical
    x = (n + h) * cos_phi * np.cos(lam)
    y = (n + h) * cos_phi * np.sin(lam)
    z = (n * (1.0 - ell.e2) + h) * sin_phi
    return np.stack(np.broadcast_arrays(x, y, z), axis=-1)


def ecef_to_geodetic(ecef, ell: Ellipsoid) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    ECEF → coordenadas geodésicas pela solução fechada de Vermeille (2002, J. Geodesy 76:451).

    Exata (sem iteração) para pontos fora da evoluta do elipsoide, uma região de ~43 km (a·e²) em
    volta do centro da Terra — cobre todo o domínio de trajetórias.

    Args:
        ecef: array (..., 3) em m.

    Returns:
        (lat em graus, lon em graus, altura geodésica em m).
    """
    ecef = np.asarray(ecef, dtype=float)
    x, y, z = ecef[..., 0], ecef[..., 1], ecef[..., 2]
    a2 = ell.a**2
    e2 = ell.e2
    e4 = e2**2
    rho = np.hypot(x, y)

    p = rho**2 / a2
    q = (1.0 - e2) / a2 * z**2
    r = (p + q - e4) / 6.0
    s = e4 * p * q / (4.0 * r**3)
    t = np.cbrt(1.0 + s + np.sqrt(s * (2.0 + s)))
    u = r * (1.0 + t + 1.0 / t)
    v = np.sqrt(u**2 + e4 * q)
    w = e2 * (u + v - q) / (2.0 * v)
    k = np.sqrt(u + v + w**2) - w
    d = k * rho / (k + e2)
    dz = np.hypot(d, z)

    lat = np.degrees(2.0 * np.arctan2(z, d + dz))
    lon = np.degrees(np.arctan2(y, x))
    h = (k + e2 - 1.0) / k * dz
    return lat, lon, h


def enu_rotation(lat0: float, lon0: float) -> np.ndarray:
    """
    Matriz de rotação ECEF → ENU no ponto (lat0, lon0) em graus. As linhas são os versores
    leste, norte e cima expressos em ECEF; a transposta faz ENU → ECEF.
    """
    phi, lam = np.radians(lat0), np.radians(lon0)
    sp, cp, sl, cl = np.sin(phi), np.cos(phi), np.sin(lam), np.cos(lam)
    return np.array(
        [
            [-sl, cl, 0.0],
            [-sp * cl, -sp * sl, cp],
            [cp * cl, cp * sl, sp],
        ]
    )


@dataclass(frozen=True)
class LocalFrame:
    """Referencial ENU local com origem num ponto geodésico."""

    origin: GeodeticPoint
    ell: Ellipsoid

    @property
    def origin_ecef(self) -> np.ndarray:
        o = self.origin
        return geodetic_to_ecef(o.lat, o.lon, o.height, self.ell)

    @property
    def rotation(self) -> np.ndarray:
        return enu_rotation(self.origin.lat, self.origin.lon)

    def to_ecef(self, enu) -> np.ndarray:
        """ENU (..., 3) → ECEF (..., 3)."""
        return np.asarray(enu, dtype=float) @ self.rotation + self.origin_ecef

    def from_ecef(self, ecef) -> np.ndarray:
        """ECEF (..., 3) → ENU (..., 3)."""
        return (np.asarray(ecef, dtype=float) - self.origin_ecef) @ self.rotation.T


def enu_to_aer(enu) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    ENU → azimute, elevação e distância (slant range).

    Returns:
        (azimute em rad [0, 2π), elevação em rad [-π/2, π/2], distância em m).
    """
    enu = np.asarray(enu, dtype=float)
    e, n, u = enu[..., 0], enu[..., 1], enu[..., 2]
    horiz = np.hypot(e, n)
    az = np.mod(np.arctan2(e, n), 2.0 * np.pi)
    el = np.arctan2(u, horiz)
    rng = np.hypot(horiz, u)
    return az, el, rng


def aer_to_enu(az_rad, el_rad, rng) -> np.ndarray:
    """
    Azimute, elevação (rad) e distância → ENU (..., 3), inversa de `enu_to_aer`.
    A distância sai na mesma unidade de `rng`.
    """
    az = np.asarray(az_rad, dtype=float)
    el = np.asarray(el_rad, dtype=float)
    rng = np.asarray(rng, dtype=float)
    horiz = rng * np.cos(el)
    return np.stack(np.broadcast_arrays(horiz * np.sin(az), horiz * np.cos(az), rng * np.sin(el)), axis=-1)


def dd_to_dms(value: float, kind: Literal["lat", "lon"]) -> str:
    """Graus decimais → texto DMS com hemisfério, ex.: 5°55'20.010\"S."""
    hemi = ("N" if value >= 0 else "S") if kind == "lat" else ("E" if value >= 0 else "W")
    v = abs(value)
    deg = int(v)
    minutes_full = (v - deg) * 60.0
    minutes = int(minutes_full)
    seconds = (minutes_full - minutes) * 60.0
    if round(seconds, 3) >= 60.0:  # evita 59.9999 → 60.000
        seconds = 0.0
        minutes += 1
    if minutes == 60:
        minutes = 0
        deg += 1
    return f"{deg}°{minutes:02d}'{seconds:06.3f}\"{hemi}"


# ---------------------------------------------------------------------------------------------
# Acréscimos do orbit-tools

WGS84 = ELLIPSOIDS["wgs84"]


def enu_to_enu(enu, source: LocalFrame, target: LocalFrame) -> np.ndarray:
    """ENU no referencial `source` → ENU no referencial `target` (ENU¹ → ENU²), passando por ECEF."""
    return target.from_ecef(source.to_ecef(enu))


def ground_circle(center: GeodeticPoint, radius_m: float, ell: Ellipsoid = WGS84, n: int = 30):
    """
    Círculo de raio `radius_m` no plano horizontal local de `center` (altura da origem), como
    o `geodetic_circ` do app antigo. Fechado: o primeiro e o último ponto coincidem.

    Returns:
        (lat, lon) em graus.
    """
    theta = np.linspace(0.0, 2.0 * np.pi, n)
    enu = np.column_stack([radius_m * np.cos(theta), radius_m * np.sin(theta), np.zeros(n)])
    lat, lon, _ = ecef_to_geodetic(LocalFrame(center, ell).to_ecef(enu), ell)
    return lat, lon


_NUMBER = re.compile(r"\d+(?:[.,]\d+)?")
_NEGATIVE_HEMI = {"S", "W", "O"}  # O: oeste
_HEMI = {"N", "S", "E", "W", "L", "O"}  # L: leste


def dms_to_dd(text: str) -> float:
    """
    Texto em graus, minutos e segundos → graus decimais. Aceita sinal (`-1°49'10.58"`) ou
    hemisfério (`5°55'20.010"S`, também L/O), separadores °, ', " ou espaços, e vírgula decimal.
    """
    s = text.strip().upper()
    hemi = s[-1] if s and s[-1] in _HEMI else None
    if hemi:
        s = s[:-1]
    negative = s.lstrip().startswith("-")
    parts = [float(p.replace(",", ".")) for p in _NUMBER.findall(s)]
    if not 1 <= len(parts) <= 3 or (hemi and negative):
        raise ValueError(f"Ângulo em graus, minutos e segundos inválido: {text!r}")
    deg, minutes, seconds = [*parts, 0.0, 0.0][:3]
    if minutes >= 60 or seconds >= 60:
        raise ValueError(f"Minutos e segundos devem ser menores que 60: {text!r}")
    value = deg + minutes / 60.0 + seconds / 3600.0
    return -value if negative or hemi in _NEGATIVE_HEMI else value


def dd_to_dms_signed(value: float, decimals: int = 6) -> str:
    """
    Graus decimais → texto com sinal, no formato do app conversor antigo: `-1°49'10.583775"`.
    Arredonda os segundos antes de separar graus e minutos, para nunca gerar `60.000000"`.
    """
    sign = "-" if value < 0 else ""
    total = round(abs(value) * 3600.0, decimals)
    deg = int(total // 3600)
    minutes = int((total - deg * 3600) // 60)
    seconds = total - deg * 3600 - minutes * 60
    return f"{sign}{deg}°{minutes}'{seconds:.{decimals}f}\""
