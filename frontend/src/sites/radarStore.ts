import { useLocalStorage } from '@mantine/hooks'
import { useMemo } from 'react'
import { useMeta } from '../api/client'
import type { Radar } from '../api/types'

const KEY = 'orbit-tools:radars'

export function useUserRadars() {
  return useLocalStorage<Radar[]>({ key: KEY, defaultValue: [], getInitialValueInEffect: false })
}

/** Radares do servidor (exemplos ou da instalação) seguidos dos do usuário. */
export function useAllRadars(): { radar: Radar; origin: 'servidor' | 'usuario' }[] {
  const meta = useMeta()
  const [user] = useUserRadars()
  return useMemo(() => {
    const server = meta.data?.radars ?? []
    const names = new Set(server.map((r) => r.name))
    return [
      ...server.map((radar) => ({ radar, origin: 'servidor' as const })),
      ...user.filter((r) => !names.has(r.name)).map((radar) => ({ radar, origin: 'usuario' as const })),
    ]
  }, [meta.data, user])
}
