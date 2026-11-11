"""Contrato da API. Espelhado à mão em frontend/src/api/types.ts: ao mudar um, mudar o outro."""

from datetime import date, datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, SecretStr, StringConstraints, model_validator

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
    max_elements: int
    max_celestrak_ids: int
    max_spacetrack_ids: int
    max_history_days: float
    max_search_days: float
    max_object_days: float
    max_trajectory_points: int
    max_export_points: int


class EopInfo(BaseModel):
    source: str
    first_date: date | None  # intervalo coberto (o fim é previsão)
    last_date: date | None
    last_observed: date | None  # último dia medido


class Meta(BaseModel):
    name: str
    version: str
    sites: list[Site]
    radars: list[RadarModel]
    sites_source: str  # "exemplos" ou o caminho de config/local/locais.csv
    radars_source: str  # "exemplos" ou o caminho de config/local/radares.csv
    config_errors: list[str]  # erros nesses arquivos (o app usa os exemplos e avisa)
    limits: Limits
    eop: EopInfo


# --- Elementos ---------------------------------------------------------------------------------


class ElementSet(BaseModel):
    """Conjunto de elementos (OMM, com os campos completados) e o id dele no servidor."""

    set_id: str
    records: list[dict[str, Any]]
    count: int
    objects: int  # NORADs distintos
    source: str
    warnings: list[str] = Field(default_factory=list)
    not_found: list[str] = Field(default_factory=list)  # NORADs/consultas sem elementos
    decayed: list[int] = Field(default_factory=list)  # NORADs com data de reentrada


class CelestrakRequest(BaseModel):
    kind: Literal["catnr", "group", "name", "intdes"]
    values: list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]] = Field(
        min_length=1
    )


class SpaceTrackRequest(BaseModel):
    username: str = Field(min_length=1, max_length=200)
    password: SecretStr  # nunca aparece em repr nem em log
    mode: Literal["latest", "leo", "history"]
    norad_ids: list[int] = Field(default_factory=list)
    use_app_list: bool = False  # lista de ~200 objetos LEO do app antigo
    epoch_start: date | None = None
    epoch_end: date | None = None


class StoreRequest(BaseModel):
    records: list[dict[str, Any]] = Field(min_length=1)


class StoreResponse(BaseModel):
    set_id: str
    count: int


class SetRef(BaseModel):
    set_id: str


# --- Passagens ---------------------------------------------------------------------------------


class SearchRequest(BaseModel):
    set_id: str
    site: Site
    start: datetime  # UTC (sem fuso = UTC)
    end: datetime
    d_max_km: float = Field(default=1100, gt=0, le=50_000)
    d_min_km: float = Field(default=1000, gt=0, le=50_000)
    min_el_deg: float | None = Field(default=None, ge=-5, le=89)
    include_partial: bool = False
    radar: RadarModel | None = None
    rcs_by_size: dict[str, float] | None = None  # RCS representativo por classe (m²), quando o objeto não tem RCS

    @model_validator(mode="after")
    def _check(self):
        if self.d_max_km < 1.05 * self.d_min_km:
            raise ValueError("A distância máxima deve ser pelo menos 5% maior que a mínima (como no app antigo).")
        return self


class PassRef(BaseModel):
    """Uma passagem: o conjunto de elementos (NORAD + época) e o trecho (H0 e END_PT, em s)."""

    norad: int
    epoch: str
    h0: datetime
    end_pt: float = Field(ge=0)


class TrajectoryRequest(BaseModel):
    set_id: str
    site: Site
    passage: PassRef
    step_s: float = Field(default=1.0, gt=0)


class TrajectoryResponse(BaseModel):
    t: Series  # s desde H0
    az: Series  # graus
    el: Series
    range: Series  # m
    lat: Series
    lon: Series
    height: Series
    az_rate: Series  # graus/s (azimute desenrolado)
    el_rate: Series


# --- Órbita ------------------------------------------------------------------------------------


class EphemerisRequest(BaseModel):
    set_id: str
    norad: int
    epoch: str  # identifica o conjunto de elementos do objeto
    start: datetime  # UTC
    duration_s: float = Field(gt=0)
    step_s: float = Field(default=30.0, gt=0)
    site: Site | None = None  # com local: ENU e AZ/EL/D


class EphemerisResponse(BaseModel):
    time: list[str]  # ISO UTC (ms)
    t: Series  # s desde o início
    error: list[int]  # código de erro do SGP4 (0 = ok)
    teme_x: Series  # m
    teme_y: Series
    teme_z: Series
    teme_vx: Series  # m/s
    teme_vy: Series
    teme_vz: Series
    ecef_x: Series  # ITRS, m
    ecef_y: Series
    ecef_z: Series
    ecef_vx: Series
    ecef_vy: Series
    ecef_vz: Series
    lat: Series
    lon: Series
    height: Series
    # Órbita como vista da Terra no instante inicial (TEME girado pela rotação desse instante), para o globo
    orbit_x: Series
    orbit_y: Series
    orbit_z: Series
    e: Series | None = None
    n: Series | None = None
    u: Series | None = None
    az: Series | None = None
    el: Series | None = None
    range: Series | None = None
    period_s: float
    perigee_km: float
    apogee_km: float
    inclination_deg: float
    epoch_age_days: float  # no início do intervalo


class ExportFormats(BaseModel):
    trn: bool = True  # obj-…trn a 1 Hz
    trj: bool = True  # pobj-…trj a 1 Hz
    data_csv: bool = True  # data-…csv a 1 Hz
    trn_rate: bool = True  # <taxa>Hz_obj-…trn na taxa do radar


class ExportRequest(BaseModel):
    set_id: str
    site: Site
    passes: list[PassRef] = Field(min_length=1)
    formats: ExportFormats = Field(default_factory=ExportFormats)
    rate_s: float = Field(default=0.01, gt=0, le=10)
    summary: list[dict[str, Any]] | None = None  # linhas do resumo das passagens escolhidas


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
