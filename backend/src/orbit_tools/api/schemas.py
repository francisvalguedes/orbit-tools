"""Contrato da API. Espelhado à mão em frontend/src/api/types.ts: ao mudar um, mudar o outro."""

from typing import Literal

from pydantic import BaseModel, Field, model_validator

Ellipsoid = Literal["wgs84", "wgs72"]
Series = list[float | None]  # valores não finitos viram null no JSON


class Site(BaseModel):
    name: str = Field(default="", max_length=80)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=360)
    height: float = Field(ge=-12_000, le=1e8)


class RadarModel(BaseModel):
    name: str = Field(max_length=80)
    pt: float
    gt: float
    gr: float
    lt: float
    lr: float
    fhz: float = Field(gt=0)
    sr: float
    snr: float
    spt: float = Field(default=0.01, gt=0)


class Limits(BaseModel):
    max_points: int


class Meta(BaseModel):
    name: str
    version: str
    sites: list[Site]
    radars: list[RadarModel]
    sites_source: str  # "exemplos" ou o nome do arquivo da instalação
    limits: Limits


# --- Conversões --------------------------------------------------------------------------------

CoordinateSystem = Literal["geodetic", "ecef", "enu", "aer"]


class ConvertPointsRequest(BaseModel):
    """
    Pontos num sistema de entrada, convertidos para todos os outros.

    Componentes a, b, c conforme o sistema: geodetic (lat, lon em graus; altura), ecef (X, Y, Z),
    enu (leste, norte, cima), aer (azimute, elevação; distância). Comprimentos em `length_unit`,
    ângulos de AZ/EL em `angle_unit`; latitude e longitude sempre em graus.
    """

    system: CoordinateSystem
    reference: Site | None = None  # origem do ENU/AER de entrada
    outputs: list[Site] = Field(default_factory=list, max_length=20)  # locais para ENU e AER de saída
    ellipsoid: Ellipsoid = "wgs84"
    length_unit: Literal["m", "km"] = "m"
    angle_unit: Literal["deg", "rad"] = "deg"
    a: list[float]
    b: list[float]
    c: list[float]

    @model_validator(mode="after")
    def _check(self):
        if not (len(self.a) == len(self.b) == len(self.c)):
            raise ValueError("As três componentes devem ter o mesmo número de pontos.")
        if not self.a:
            raise ValueError("Nenhum ponto informado.")
        if self.system in ("enu", "aer") and self.reference is None:
            raise ValueError("Pontos em ENU ou AZ/EL/D precisam do local de referência.")
        return self


class LocalCoordinates(BaseModel):
    site: Site
    e: Series
    n: Series
    u: Series
    az: Series  # graus [0, 360)
    el: Series  # graus
    range: Series  # m


class ConvertPointsResponse(BaseModel):
    lat: Series
    lon: Series
    height: Series  # m
    x: Series  # ECEF, m
    y: Series
    z: Series
    local: list[LocalCoordinates]


class DmsRequest(BaseModel):
    direction: Literal["to_decimal", "to_dms"]
    values: list[str | float]
    style: Literal["signed", "hemisphere"] = "signed"  # só para to_dms
    kind: Literal["lat", "lon"] = "lat"  # hemisfério N/S ou E/W (estilo hemisphere)
    decimals: int = Field(default=6, ge=0, le=10)  # casas dos segundos (estilo signed)


class DmsResult(BaseModel):
    text: str | None = None
    value: float | None = None
    error: str | None = None


class DmsResponse(BaseModel):
    results: list[DmsResult]


class KinematicsRequest(BaseModel):
    """Trajetória em ENU de `source` (ex.: rampa), amostrada uniformemente; resultados no ENU de `target`."""

    x: list[float]
    y: list[float]
    z: list[float]
    step_s: float = Field(gt=0)
    source: Site
    target: Site | None = None  # sem target: no próprio referencial de origem
    ellipsoid: Ellipsoid = "wgs84"
    length_unit: Literal["m", "km"] = "m"

    @model_validator(mode="after")
    def _check(self):
        if not (len(self.x) == len(self.y) == len(self.z)):
            raise ValueError("As três componentes devem ter o mesmo número de pontos.")
        if len(self.x) < 3:
            raise ValueError("A trajetória precisa de pelo menos 3 pontos.")
        return self


class KinematicsResponse(BaseModel):
    t: Series  # s desde o primeiro ponto
    e: Series
    n: Series
    u: Series
    ve: Series
    vn: Series
    vu: Series
    ae: Series
    an: Series
    au: Series
    az: Series  # graus [0, 360)
    el: Series
    range: Series
    v_az: Series  # graus/s (azimute desenrolado, sem salto em 0/360)
    v_el: Series
    v_range: Series  # m/s
    a_az: Series  # graus/s²
    a_el: Series
    a_range: Series  # m/s²
