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
  limits: { max_points: number }
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
