import { useQuery } from '@tanstack/react-query'
import type {
  CelestrakKind,
  CompareRow,
  ConvertPointsRequest,
  ConvertPointsResponse,
  DmsRequest,
  DmsResult,
  ElementRecord,
  ElementSet,
  EphemerisRequest,
  EphemerisResponse,
  ExportRequest,
  ExportResult,
  KinematicsRequest,
  KinematicsResponse,
  Meta,
  PassRef,
  Progress,
  SearchRequest,
  SearchResult,
  Site,
  SpaceTrackRequest,
  TrajectoryResponse,
} from './types'

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function errorFrom(res: Response): Promise<ApiError> {
  let detail = `${res.status} ${res.statusText}`
  try {
    const body = await res.json()
    if (typeof body.detail === 'string') detail = body.detail
    else if (Array.isArray(body.detail)) detail = body.detail.map((d: { msg: string }) => d.msg).join('; ')
  } catch {
    // resposta sem JSON: mantém o status HTTP
  }
  return new ApiError(detail, res.status)
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`/api${path}`, init)
  if (!res.ok) throw await errorFrom(res)
  return res
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await send(path, init)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

const json = (body: unknown, signal?: AbortSignal): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
  signal,
})

const post = <T>(path: string, body: unknown, signal?: AbortSignal) => request<T>(path, json(body, signal))

/**
 * Cálculo longo em fluxo NDJSON: chama `onProgress` a cada evento e devolve o resultado.
 * Cancelar = abortar o `signal` (o servidor interrompe o cálculo).
 */
export async function postStream<T>(
  path: string,
  body: unknown,
  onProgress: (p: Progress) => void,
  signal?: AbortSignal,
): Promise<T> {
  const res = await send(path, json(body, signal))
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (value) buffer += value
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line) continue
      const event = JSON.parse(line)
      if (event.type === 'progress') onProgress({ fraction: event.fraction, stage: event.stage })
      else if (event.type === 'result') return event.data as T
      else if (event.type === 'error') throw new ApiError(event.detail, event.status ?? 500)
    }
    if (done) throw new ApiError('Conexão encerrada antes do resultado.', 0)
  }
}

/**
 * Chama `fn(set_id)`; se o servidor não tiver mais o conjunto (404), reenvia os elementos e tenta
 * de novo. O navegador é a fonte dos dados; o servidor só guarda uma cópia temporária.
 */
export async function withElementSet<T>(
  set: { set_id: string; records: ElementRecord[] },
  fn: (setId: string) => Promise<T>,
  onNewId?: (setId: string) => void,
): Promise<T> {
  try {
    return await fn(set.set_id)
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 404 || !e.message.includes('reenvie')) throw e
    const { set_id } = await api.elements.store(set.records)
    onNewId?.(set_id)
    return fn(set_id)
  }
}

export const api = {
  meta: () => request<Meta>('/meta'),
  convert: {
    points: (req: ConvertPointsRequest, signal?: AbortSignal) =>
      post<ConvertPointsResponse>('/convert/points', req, signal),
    dms: (req: DmsRequest) => post<{ results: DmsResult[] }>('/convert/dms', req).then((r) => r.results),
    kinematics: (req: KinematicsRequest, signal?: AbortSignal) =>
      post<KinematicsResponse>('/convert/kinematics', req, signal),
  },
  elements: {
    celestrak: (kind: CelestrakKind, values: string[]) => post<ElementSet>('/elements/celestrak', { kind, values }),
    spacetrack: (req: SpaceTrackRequest) => post<ElementSet>('/elements/spacetrack', req),
    parse: (file: File) => {
      const body = new FormData()
      body.append('file', file)
      return request<ElementSet>('/elements/parse', { method: 'POST', body })
    },
    store: (records: ElementRecord[]) => post<{ set_id: string; count: number }>('/elements/store', { records }),
    compare: (setId: string, onProgress: (p: Progress) => void, signal?: AbortSignal) =>
      postStream<{ rows: CompareRow[] }>('/elements/compare', { set_id: setId }, onProgress, signal).then(
        (r) => r.rows,
      ),
  },
  orbit: {
    ephemeris: (req: EphemerisRequest, signal?: AbortSignal) => post<EphemerisResponse>('/orbit/ephemeris', req, signal),
  },
  passes: {
    search: (req: SearchRequest, onProgress: (p: Progress) => void, signal?: AbortSignal) =>
      postStream<SearchResult>('/passes/search', req, onProgress, signal),
    trajectory: (setId: string, site: Site, passage: PassRef, stepS = 1, signal?: AbortSignal) =>
      post<TrajectoryResponse>('/passes/trajectory', { set_id: setId, site, passage, step_s: stepS }, signal),
    export: (req: ExportRequest, onProgress: (p: Progress) => void, signal?: AbortSignal) =>
      postStream<ExportResult>('/passes/export', req, onProgress, signal),
  },
}

/** Metadados do servidor (versão, locais da instalação, limites, EOP), buscados uma vez. */
export function useMeta() {
  return useQuery({ queryKey: ['meta'], queryFn: api.meta, staleTime: Infinity, retry: 1 })
}
