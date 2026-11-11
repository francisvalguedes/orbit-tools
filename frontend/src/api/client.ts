import { useQuery } from '@tanstack/react-query'
import type {
  ConvertPointsRequest,
  ConvertPointsResponse,
  DmsRequest,
  DmsResult,
  KinematicsRequest,
  KinematicsResponse,
  Meta,
} from './types'

export class ApiError extends Error {}

async function send(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`/api${path}`, init)
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') detail = body.detail
      else if (Array.isArray(body.detail)) detail = body.detail.map((d: { msg: string }) => d.msg).join('; ')
    } catch {
      // resposta sem JSON: mantém o status HTTP
    }
    throw new ApiError(detail)
  }
  return res
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await send(path, init)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

const post = <T>(path: string, body: unknown, signal?: AbortSignal) =>
  request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

export const api = {
  meta: () => request<Meta>('/meta'),
  convert: {
    points: (req: ConvertPointsRequest, signal?: AbortSignal) =>
      post<ConvertPointsResponse>('/convert/points', req, signal),
    dms: (req: DmsRequest) => post<{ results: DmsResult[] }>('/convert/dms', req).then((r) => r.results),
    kinematics: (req: KinematicsRequest, signal?: AbortSignal) =>
      post<KinematicsResponse>('/convert/kinematics', req, signal),
  },
}

/** Metadados do servidor (versão, locais da instalação, limites), buscados uma vez. */
export function useMeta() {
  return useQuery({ queryKey: ['meta'], queryFn: api.meta, staleTime: Infinity, retry: 1 })
}
