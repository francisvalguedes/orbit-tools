import { Badge, Checkbox, Group, Pagination, ScrollArea, Stack, Table, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { IconAlertTriangle, IconChevronDown, IconChevronUp, IconSelector } from '@tabler/icons-react'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import type { PassRow } from '../../api/types'
import { fmtNum } from '../../lib/format'
import { passId } from './logic'

const TYPE: Record<string, string> = { PAY: 'carga', 'R/B': 'foguete', DEB: 'detrito', UNK: '?' }

interface Col {
  key: string
  label: string
  value: (p: PassRow) => number | string | null
  digits?: number
  title?: string
  radar?: boolean
}

const COLUMNS: Col[] = [
  { key: 'h0', label: 'H0 (UTC)', value: (p) => p.H0.replace('T', ' ').slice(0, 19) },
  { key: 'norad', label: 'NORAD', value: (p) => p.NORAD_CAT_ID, digits: 0 },
  { key: 'name', label: 'Nome', value: (p) => p.OBJECT_NAME },
  { key: 'type', label: 'Tipo', value: (p) => TYPE[String(p.OBJECT_TYPE ?? 'UNK')] ?? String(p.OBJECT_TYPE) },
  { key: 'dur', label: 'Duração (s)', value: (p) => p.DURATION, digits: 0 },
  { key: 'el', label: 'El. máx (°)', value: (p) => p.MAX_EL, digits: 1 },
  { key: 'dmin', label: 'Dist. mín (km)', value: (p) => p.MIN_RANGE, digits: 1 },
  { key: 'azr', label: 'Vel. az. máx (°/s)', value: (p) => p.MAX_AZ_RATE, digits: 2, title: 'Alta perto do zênite' },
  { key: 'age', label: 'Idade elem. (d)', value: (p) => p.EPOCH_AGE, digits: 2, title: 'Dias entre a época dos elementos e H0' },
  { key: 'rcs', label: 'RCS (m²)', value: (p) => p.RCS_USED, digits: 3 },
  { key: 'margin', label: 'Margem (dB)', value: (p) => p.MAX_MARGIN_DB ?? null, digits: 1, radar: true },
  { key: 'det', label: 'Detectável (s)', value: (p) => p.DETECTABLE_S ?? null, digits: 0, radar: true },
]

interface Props {
  passes: PassRow[]
  selected: Set<string>
  conflicts: Set<string>
  focus: string | null
  hasRadar: boolean
  onToggle: (id: string) => void
  onSelectPage: (ids: string[], on: boolean) => void
  onFocus: (id: string) => void
}

export function PassesTable({ passes, selected, conflicts, focus, hasRadar, onToggle, onSelectPage, onFocus }: Props) {
  const [sorting, setSorting] = useState<SortingState>([])
  const columns = useMemo<ColumnDef<PassRow>[]>(
    () => [
      {
        id: 'sel',
        header: '',
        enableSorting: false,
        cell: () => null,
      },
      ...COLUMNS.filter((c) => hasRadar || !c.radar).map<ColumnDef<PassRow>>((c) => ({
        id: c.key,
        header: c.label,
        accessorFn: c.value,
        sortUndefined: 'last',
        meta: c,
      })),
    ],
    [hasRadar],
  )

  // O TanStack Table devolve funções que o React Compiler não memoiza
  // oxlint-disable-next-line react/incompatible-library
  const table = useReactTable({
    data: passes,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: passId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 100 } },
  })

  const pageIds = table.getRowModel().rows.map((r) => r.id)
  const pageAll = pageIds.length > 0 && pageIds.every((id) => selected.has(id))
  const pageSome = pageIds.some((id) => selected.has(id))

  return (
    <Stack gap="xs">
      <ScrollArea type="auto">
        <Table highlightOnHover fz="xs" withTableBorder style={{ whiteSpace: 'nowrap' }}>
          <Table.Thead>
            {table.getHeaderGroups().map((hg) => (
              <Table.Tr key={hg.id}>
                {hg.headers.map((h) => {
                  if (h.id === 'sel') {
                    return (
                      <Table.Th key={h.id} w={36}>
                        <Checkbox
                          size="xs"
                          aria-label="Selecionar a página"
                          checked={pageAll}
                          indeterminate={!pageAll && pageSome}
                          onChange={() => onSelectPage(pageIds, !pageAll)}
                        />
                      </Table.Th>
                    )
                  }
                  const c = h.column.columnDef.meta as Col
                  const s = h.column.getIsSorted()
                  const Icon = s === 'asc' ? IconChevronUp : s === 'desc' ? IconChevronDown : IconSelector
                  return (
                    <Table.Th key={h.id} ta={c.digits != null ? 'right' : 'left'}>
                      <Tooltip label={c.title} disabled={!c.title}>
                        <UnstyledButton onClick={h.column.getToggleSortingHandler()} fz="xs" fw={600}>
                          <Group gap={4} wrap="nowrap" justify={c.digits != null ? 'flex-end' : 'flex-start'}>
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            <Icon size={12} />
                          </Group>
                        </UnstyledButton>
                      </Tooltip>
                    </Table.Th>
                  )
                })}
              </Table.Tr>
            ))}
          </Table.Thead>
          <Table.Tbody>
            {table.getRowModel().rows.map((row) => {
              const id = row.id
              const p = row.original
              const conflict = conflicts.has(id)
              return (
                <Table.Tr
                  key={id}
                  onClick={() => onFocus(id)}
                  bg={id === focus ? 'var(--mantine-color-blue-light)' : undefined}
                  style={{ cursor: 'pointer' }}
                  c={p.DECAY_DATE || p.SGP4_ERROR ? 'dimmed' : undefined}
                >
                  {row.getVisibleCells().map((cell) => {
                    if (cell.column.id === 'sel') {
                      return (
                        <Table.Td key={cell.id} onClick={(e) => e.stopPropagation()}>
                          <Group gap={4} wrap="nowrap">
                            <Checkbox size="xs" aria-label="Selecionar" checked={selected.has(id)} onChange={() => onToggle(id)} />
                            {conflict && (
                              <Tooltip label="Sobrepõe outra passagem selecionada">
                                <IconAlertTriangle size={14} color="var(--mantine-color-red-6)" />
                              </Tooltip>
                            )}
                          </Group>
                        </Table.Td>
                      )
                    }
                    const c = cell.column.columnDef.meta as Col
                    const v = cell.getValue() as number | string | null
                    return (
                      <Table.Td key={cell.id} ta={c.digits != null ? 'right' : 'left'} ff={c.digits != null ? 'monospace' : undefined}>
                        {c.digits != null ? fmtNum(v as number | null, c.digits) : (v ?? '')}
                        {c.key === 'name' && p.PARTIAL ? (
                          <Badge size="xs" variant="light" color="gray" ml={4}>
                            parcial
                          </Badge>
                        ) : null}
                      </Table.Td>
                    )
                  })}
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          {fmtNum(passes.length)} passagens · clique numa linha para ver os detalhes
        </Text>
        {table.getPageCount() > 1 && (
          <Pagination
            size="sm"
            total={table.getPageCount()}
            value={table.getState().pagination.pageIndex + 1}
            onChange={(p) => table.setPageIndex(p - 1)}
          />
        )}
      </Group>
    </Stack>
  )
}
