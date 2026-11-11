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
