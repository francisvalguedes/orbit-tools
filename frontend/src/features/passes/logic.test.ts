// Roda com `npm test` (node --test; o Node 24 executa TypeScript sem compilar).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PassRow } from '../../api/types.ts'
import { conflicts, DEFAULT_RULES, matches, passId, passRef, resolveConflicts, selectionNav } from './logic.ts'

function pass(norad: number, h0: string, endPt: number, extra: Partial<PassRow> = {}): PassRow {
  return {
    NORAD_CAT_ID: norad,
    OBJECT_NAME: `OBJ ${norad}`,
    RCS_SIZE: null,
    RCS: 0,
    H0: h0,
    H0_H: `${h0.slice(11, 23)}`,
    H0_RANGE: 1000,
    MIN_RANGE_H: '',
    MIN_RANGE_PT: 0,
    MIN_RANGE: 500,
    END_H: '',
    END_PT: endPt,
    END_RANGE: 1000,
    DURATION: endPt,
    MAX_EL: 40,
    MAX_EL_H: '',
    AZ_H0: 0,
    AZ_END: 180,
    MAX_AZ_RATE: 1,
    MAX_EL_RATE: 1,
    EPOCH_AGE: 0.5,
    PARTIAL: 0,
    SGP4_ERROR: 0,
    RCS_USED: 1,
    RCS_SOURCE: 'tabela',
    MAX_MARGIN_DB: 5,
    DETECTABLE_S: endPt,
    DET_START_PT: 0,
    DET_END_PT: endPt,
    EPOCH: '2026-11-10T00:00:00.000000',
    ...extra,
  }
}

const a = pass(1, '2026-11-11T10:00:00.000', 300) // 10:00:00–10:05:00
const b = pass(2, '2026-11-11T10:04:00.000', 300) // sobrepõe a
const c = pass(3, '2026-11-11T10:05:30.000', 300) // depois de a, sobrepõe b
const d = pass(4, '2026-11-11T12:00:00.000', 300) // isolada

test('conflitos no tempo', () => {
  assert.deepEqual([...conflicts([a, b, c, d])].sort(), [passId(a), passId(b), passId(c)].sort())
  assert.equal(conflicts([a, c, d]).size, 0)
  // com 60 s de intervalo mínimo para reposicionar a antena, a e c entram em conflito
  assert.deepEqual([...conflicts([a, c], 60)].sort(), [passId(a), passId(c)].sort())
})

test('resolver conflitos mantém as de maior prioridade sem sobreposição', () => {
  const strong = { ...b, MAX_MARGIN_DB: 20 }
  const kept = resolveConflicts([a, strong, c, d], 'margin')
  assert.deepEqual([...kept].sort(), [passId(strong), passId(d)].sort())
  const byEl = resolveConflicts([{ ...a, MAX_EL: 80 }, b, c, d], 'el')
  assert.ok(byEl.has(passId(a)) && byEl.has(passId(c)) && !byEl.has(passId(b)))
  assert.equal(conflicts([...[a, b, c, d]].filter((p) => byEl.has(passId(p)))).size, 0)
})

test('regras', () => {
  const r = { ...DEFAULT_RULES }
  assert.equal(matches(a, r, true), true)
  assert.equal(matches({ ...a, MAX_EL: 5 }, r, true), false)
  assert.equal(matches({ ...a, DURATION: 59 }, r, true), false)
  assert.equal(matches({ ...a, DURATION: 60 }, r, true), true)
  assert.equal(matches({ ...a, MAX_MARGIN_DB: -2 }, r, true), false)
  assert.equal(matches({ ...a, MAX_MARGIN_DB: -2 }, r, false), true) // sem radar a margem não conta
  assert.equal(matches({ ...a, DECAY_DATE: '2026-11-01' }, r, true), false)
  assert.equal(matches({ ...a, PARTIAL: 1 }, r, true), false)
  assert.equal(matches({ ...a, EPOCH_AGE: -4 }, r, true), false) // elementos de época futura também contam
  // janela de H0 que passa da meia-noite
  const night = { ...r, h0From: '22:00', h0To: '02:00' }
  assert.equal(matches(pass(5, '2026-11-11T23:30:00.000', 300), night, true), true)
  assert.equal(matches(pass(5, '2026-11-11T01:30:00.000', 300), night, true), true)
  assert.equal(matches(a, night, true), false)
  assert.equal(matches({ ...a, OBJECT_TYPE: 'DEB' }, { ...r, types: ['PAY'] }, true), false)
})

test('navegação entre as selecionadas', () => {
  const all = [a, b, c, d]
  const sel = new Set([passId(a), passId(c), passId(d)])
  assert.deepEqual(selectionNav(all, sel, passId(a)), { index: 0, total: 3, prev: null, next: passId(c) })
  assert.deepEqual(selectionNav(all, sel, passId(c)), { index: 1, total: 3, prev: passId(a), next: passId(d) })
  assert.deepEqual(selectionNav(all, sel, passId(d)), { index: 2, total: 3, prev: passId(c), next: null })
  // aberta fora da seleção: vizinhas selecionadas mais próximas
  assert.deepEqual(selectionNav(all, sel, passId(b)), { index: null, total: 3, prev: passId(a), next: passId(c) })
  assert.deepEqual(selectionNav(all, new Set(), passId(b)), { index: null, total: 0, prev: null, next: null })
})

test('referência da passagem inteira ou só do trecho detectável', () => {
  assert.deepEqual(passRef(a, false), { norad: 1, epoch: a.EPOCH, h0: a.H0, end_pt: 300 })
  const p = { ...a, DET_START_PT: 30, DET_END_PT: 250 }
  assert.deepEqual(passRef(p, true), { norad: 1, epoch: a.EPOCH, h0: '2026-11-11T10:00:30.000', end_pt: 220 })
  assert.deepEqual(passRef({ ...a, DET_START_PT: null, DET_END_PT: null }, true).end_pt, 300)
})
