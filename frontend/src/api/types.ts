// Espelho manual de backend/src/orbit_tools/api/schemas.py: ao mudar um, mudar o outro.

export type Series = (number | null)[]
export type Ellipsoid = 'wgs84' | 'wgs72'

export interface Site {
  name: string
  lat: number
  lon: number
  height: number
}

export interface Radar {
  name: string
  pt: number
  gt: number
  gr: number
  lt: number
  lr: number
  fhz: number
  sr: number
  snr: number
  spt: number
}

export interface Meta {
  name: string
  version: string
  sites: Site[]
  radars: Radar[]
  sites_source: string
  limits: {
    max_points: number
    max_elements: number
    max_celestrak_ids: number
    max_spacetrack_ids: number
    max_history_days: number
    max_search_days: number
    max_object_days: number
    max_trajectory_points: number
    max_export_points: number
  }
  eop: { source: string; first_date: string | null; last_date: string | null; last_observed: string | null }
}

// --- Conversões ---------------------------------------------------------------------------------

export type CoordinateSystem = 'geodetic' | 'ecef' | 'enu' | 'aer'

export interface ConvertPointsRequest {
  system: CoordinateSystem
  reference?: Site | null
  outputs: Site[]
  ellipsoid: Ellipsoid
  length_unit: 'm' | 'km'
  angle_unit: 'deg' | 'rad'
  a: number[]
  b: number[]
  c: number[]
}

export interface LocalCoordinates {
  site: Site
  e: Series
  n: Series
  u: Series
  az: Series
  el: Series
  range: Series
}

export interface ConvertPointsResponse {
  lat: Series
  lon: Series
  height: Series
  x: Series
  y: Series
  z: Series
  local: LocalCoordinates[]
}

export interface DmsRequest {
  direction: 'to_decimal' | 'to_dms'
  values: (string | number)[]
  style?: 'signed' | 'hemisphere'
  kind?: 'lat' | 'lon'
  decimals?: number
}

export interface DmsResult {
  text: string | null
  value: number | null
  error: string | null
}

export interface KinematicsRequest {
  x: number[]
  y: number[]
  z: number[]
  step_s: number
  source: Site
  target?: Site | null
  ellipsoid: Ellipsoid
  length_unit: 'm' | 'km'
}

export interface KinematicsResponse {
  t: Series
  e: Series
  n: Series
  u: Series
  ve: Series
  vn: Series
  vu: Series
  ae: Series
  an: Series
  au: Series
  az: Series
  el: Series
  range: Series
  v_az: Series
  v_el: Series
  v_range: Series
  a_az: Series
  a_el: Series
  a_range: Series
}

// --- Elementos ----------------------------------------------------------------------------------

/** Conjunto de elementos OMM, com os campos completados pelo servidor (PERIAPSIS, OBJECT_TYPE, RCS…). */
export type ElementRecord = Record<string, string | number | null>

export interface ElementSet {
  set_id: string
  records: ElementRecord[]
  count: number
  objects: number
  source: string
  warnings: string[]
  not_found: string[]
  decayed: number[]
}

export type CelestrakKind = 'catnr' | 'group' | 'name' | 'intdes'

export interface SpaceTrackRequest {
  username: string
  password: string
  mode: 'latest' | 'leo' | 'history'
  norad_ids: number[]
  use_app_list: boolean
  epoch_start?: string | null
  epoch_end?: string | null
}

export interface CompareRow {
  NORAD_CAT_ID: number
  OBJECT_NAME: string | null
  EPOCH: string
  EPOCH_1: string
  D_ERR_MEAN: number | null
  D_ERR_MAX: number | null
  TRACK: number
  RCS_SIZE: string | null
  R_ERR_MEAN: number | null
  I_ERR_MEAN: number | null
  C_ERR_MEAN: number | null
  R_ERR_MAX: number | null
  I_ERR_MAX: number | null
  C_ERR_MAX: number | null
  PERIAPSIS: number | null
  ECCENTRICITY: number | null
  MEAN_MOTION: number | null
  DECAY_DATE: string | null
  SGP4_ERROR: boolean
}

export interface Progress {
  fraction: number
  stage: string
}

// --- Passagens ----------------------------------------------------------------------------------

export interface SearchRequest {
  set_id: string
  site: Site
  start: string // UTC, ISO sem fuso
  end: string
  d_max_km: number
  d_min_km: number
  min_el_deg: number | null
  include_partial: boolean
  radar: Radar | null
}

/** Linha do resumo de uma passagem: colunas do app antigo, colunas novas e os elementos do objeto. */
export interface PassRow {
  NORAD_CAT_ID: number
  OBJECT_NAME: string | null
  OBJECT_TYPE?: string | null
  RCS_SIZE: string | null
  RCS: number
  RCS_MIN?: number
  H0: string
  H0_H: string
  H0_RANGE: number
  MIN_RANGE_H: string
  MIN_RANGE_PT: number
  MIN_RANGE: number
  END_H: string
  END_PT: number
  END_RANGE: number
  DURATION: number
  MAX_EL: number
  MAX_EL_H: string
  AZ_H0: number
  AZ_END: number
  MAX_AZ_RATE: number | null
  MAX_EL_RATE: number | null
  EPOCH_AGE: number
  PARTIAL: number
  SGP4_ERROR: number
  RCS_USED: number | null
  RCS_SOURCE: string
  MAX_MARGIN_DB?: number | null
  DETECTABLE_S?: number
  DET_START_PT?: number | null
  DET_END_PT?: number | null
  EPOCH: string
  DECAY_DATE?: string | null
  [key: string]: unknown
}

export interface SearchResult {
  passes: PassRow[]
  objects: number
  excluded_perigee: number[]
  eop: string
  warnings: string[]
}

export interface PassRef {
  norad: number
  epoch: string
  h0: string
  end_pt: number
}

export interface TrajectoryResponse {
  t: Series
  az: Series
  el: Series
  range: Series
  lat: Series
  lon: Series
  height: Series
  az_rate: Series
  el_rate: Series
}

export interface ExportRequest {
  set_id: string
  site: Site
  passes: PassRef[]
  formats: { trn: boolean; trj: boolean; data_csv: boolean; trn_rate: boolean }
  rate_s: number
  summary: PassRow[] | null
}

export interface ExportResult {
  url: string
  file_name: string
  files: number
}
