import { Button, Card, Checkbox, Group, NumberInput, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { IconChecks, IconSwitchHorizontal, IconX } from '@tabler/icons-react'
import type { PassRow } from '../../api/types'
import { plural } from '../../lib/format'
import { DEFAULT_RULES, matches, passId, type Priority, PRIORITIES, resolveConflicts, type Rules } from './logic'

interface Props {
  passes: PassRow[]
  selected: Set<string>
  conflicts: Set<string>
  hasRadar: boolean
  gapS: number
  onGap: (s: number) => void
  onSelect: (ids: Set<string>) => void
}

const num = (v: string | number) => (v === '' ? null : Number(v))

export function RulesPanel({ passes, selected, conflicts, hasRadar, gapS, onGap, onSelect }: Props) {
  const [rules, setRules] = useLocalStorage<Rules>({ key: 'orbit-tools:passes-rules', defaultValue: DEFAULT_RULES })
  const [priority, setPriority] = useLocalStorage<Priority>({ key: 'orbit-tools:passes-priority', defaultValue: 'margin' })
  // Elevação máx., vel. azimute e tipos desativados por enquanto: sem campo na tela, também não podem
  // valer escondidos (nem o padrão nem o que o navegador guardou). A lógica continua em logic.ts.
  const r: Rules = { ...DEFAULT_RULES, ...rules, minMaxEl: null, maxAzRate: null, types: [] }
  const set = (patch: Partial<Rules>) => setRules({ ...r, ...patch })
  const matching = passes.filter((p) => matches(p, r, hasRadar))

  return (
    <Card withBorder>
      <Stack gap="sm">
        <Text size="sm" fw={600}>
          Regras de seleção
        </Text>
        <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} spacing="xs">
          <NumberInput label="Duração ≥ (s)" value={r.minDuration ?? ''} onChange={(v) => set({ minDuration: num(v) })} min={0} />
          <NumberInput label="Idade das TLE ≤ (dias)" value={r.maxAge ?? ''} onChange={(v) => set({ maxAge: num(v) })} min={0} decimalScale={2} />
          <TextInput type="time" label="H0 de (UTC)" value={r.h0From} onChange={(e) => set({ h0From: e.currentTarget.value })} />
          <TextInput type="time" label="H0 até (UTC)" value={r.h0To} onChange={(e) => set({ h0To: e.currentTarget.value })} />
          {hasRadar && (
            <>
              <NumberInput label="Margem ≥ (dB)" value={r.minMargin ?? ''} onChange={(v) => set({ minMargin: num(v) })} decimalScale={1} />
              <NumberInput label="Detectável ≥ (s)" value={r.minDetectable ?? ''} onChange={(v) => set({ minDetectable: num(v) })} min={0} />
            </>
          )}
        </SimpleGrid>
        <Group gap="md">
          <Checkbox label="Sem reentrados" checked={r.excludeDecayed} onChange={(e) => set({ excludeDecayed: e.currentTarget.checked })} />
          <Checkbox label="Sem parciais" checked={r.excludePartial} onChange={(e) => set({ excludePartial: e.currentTarget.checked })} />
          <Checkbox label="Sem erro do SGP4" checked={r.excludeError} onChange={(e) => set({ excludeError: e.currentTarget.checked })} />
        </Group>
        <Group gap="xs" wrap="wrap">
          <Button size="xs" leftSection={<IconChecks size={14} />} onClick={() => onSelect(new Set(matching.map(passId)))}>
            Selecionar pelas regras ({matching.length})
          </Button>
          <Button size="xs" variant="default" leftSection={<IconX size={14} />} onClick={() => onSelect(new Set())}>
            Limpar seleção
          </Button>
          <Button size="xs" variant="subtle" onClick={() => setRules(DEFAULT_RULES)}>
            Regras padrão
          </Button>
        </Group>
        <Group gap="xs" align="flex-end" wrap="wrap">
          <Text size="sm" c={conflicts.size ? 'red' : 'dimmed'} mb={6}>
            {plural(selected.size, 'selecionada')}
            {conflicts.size > 0 && ` · ${plural(conflicts.size, 'em conflito', 'em conflito')}`}
          </Text>
          <NumberInput
            label="Intervalo mínimo entre passagens (s)"
            value={gapS}
            onChange={(v) => onGap(Number(v) || 0)}
            min={0}
            w={240}
            size="xs"
          />
          <Select
            label="Prioridade nos conflitos"
            data={PRIORITIES}
            value={priority}
            onChange={(v) => setPriority((v as Priority) ?? 'margin')}
            allowDeselect={false}
            size="xs"
            w={200}
          />
          <Button
            size="xs"
            variant="light"
            color="orange"
            leftSection={<IconSwitchHorizontal size={14} />}
            disabled={conflicts.size === 0}
            onClick={() =>
              onSelect(resolveConflicts(passes.filter((p) => selected.has(passId(p))), priority, gapS))
            }
          >
            Resolver conflitos
          </Button>
        </Group>
      </Stack>
    </Card>
  )
}
