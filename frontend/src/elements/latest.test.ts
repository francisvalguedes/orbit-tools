import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ElementRecord } from '../api/types.ts'
import { latestPerObject } from './latest.ts'

test('elemento mais recente por objeto, inclusive republicação da mesma época', () => {
  const recs: ElementRecord[] = [
    { NORAD_CAT_ID: 48865, EPOCH: '2026-11-07T22:29:33.461376', CREATION_DATE: '2026-11-07T23:56:22', GP_ID: 357331304 },
    { NORAD_CAT_ID: 48865, EPOCH: '2026-11-07T22:29:33.461376', CREATION_DATE: '2026-11-08T03:18:45', GP_ID: 357426726 },
    { NORAD_CAT_ID: 48865, EPOCH: '2026-11-06T10:00:00.000000', CREATION_DATE: '2026-11-06T12:00:00', GP_ID: 357000000 },
    { NORAD_CAT_ID: 25544, EPOCH: '2026-11-10T04:12:02.822688' },
  ]
  const out = latestPerObject(recs)
  assert.deepEqual(out.map((r) => r.NORAD_CAT_ID), [48865, 25544])
  assert.equal(out[0].GP_ID, 357426726)
})
