import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { MODULE_KEYS, PREFIX, USER_KEYS, VERSION_KEY } from './storage.ts'

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name)
    if (e.isDirectory()) return sources(path)
    return /\.tsx?$/.test(e.name) && !e.name.endsWith('.test.ts') ? [path] : []
  })
}

test('toda chave guardada no navegador pertence a um módulo ou aos cadastros', () => {
  const src = join(import.meta.dirname, '..')
  const used = new Set(
    sources(src).flatMap((f) => [...readFileSync(f, 'utf8').matchAll(new RegExp(`'${PREFIX}([a-z-]+)'`, 'g'))].map((m) => m[1])),
  )
  const known = new Set([...Object.values(MODULE_KEYS).flat(), ...USER_KEYS, VERSION_KEY])
  assert.ok(used.size > 10)
  assert.deepEqual([...used].filter((k) => !known.has(k)), [])
})

test('os cadastros não estão na limpeza de nenhum módulo', () => {
  const cleared = Object.values(MODULE_KEYS).flat()
  assert.deepEqual(USER_KEYS.filter((k) => cleared.includes(k)), [])
})
