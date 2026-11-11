import { Group, MultiSelect, NumberInput, Pagination, ScrollArea, Stack, Table, Text, TextInput, UnstyledButton } from '@mantine/core'
import { IconChevronDown, IconChevronUp, IconSearch, IconSelector } from '@tabler/icons-react'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import type { ElementRecord } from '../../api/types'
import { fmtNum } from '../../lib/format'

const TYPE_LABEL: Record<string, string> = { PAY: 'carga', 'R/B': 'corpo de foguete', DEB: 'detrito', UNK: 'desconhecido' }

function epochAgeDays(r: ElementRecord, now = Date.now()): number {
  return (now - Date.parse(`${r.EPOCH}Z`)) / 86400e3
}

function num(digits: number) {
  return (v: unknown) => (typeof v === 'number' ? fmtNum(v, digits) : '')
}

interface Col {
  key: string
  label: string
  render?: (v: unknown, r: ElementRecord) => string
  numeric?: boolean
}

const COLUMNS: Col[] = [
  { key: 'NORAD_CAT_ID', label: 'NORAD', numeric: true },
  { key: 'OBJECT_NAME', label: 'Nome' },
  { key: 'OBJECT_ID', label: 'Designador' },
  { key: 'OBJECT_TYPE', label: 'Tipo', render: (v) => (v ? (TYPE_LABEL[String(v)] ?? String(v)) : '') },
  { key: 'EPOCH', label: 'Época (UTC)', render: (v) => String(v ?? '').replace('T', ' ').slice(0, 19) },
  { key: '_age', label: 'Idade (dias)', numeric: true, render: (_, r) => fmtNum(epochAgeDays(r), 2) },
  { key: 'PERIAPSIS', label: 'Perigeu (km)', numeric: true, render: num(1) },
  { key: 'APOAPSIS', label: 'Apogeu (km)', numeric: true, render: num(1) },
  { key: 'INCLINATION', label: 'Inclinação (°)', numeric: true, render: num(3) },
  { key: 'RCS', label: 'RCS (m²)', numeric: true, render: num(3) },
  { key: 'RCS_SIZE', label: 'Classe RCS' },
  { key: 'DECAY_DATE', label: 'Reentrada' },
]

export function ElementsTable({ records }: { records: ElementRecord[] }) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [search, setSearch] = useState('')
  const [types, setTypes] = useState<string[]>([])
  const [maxAge, setMaxAge] = useState<number | string>('')
  const [maxPerigee, setMaxPerigee] = useState<number | string>('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const now = Date.now()
    return records.filter((r) => {
      if (q && !`${r.NORAD_CAT_ID} ${r.OBJECT_NAME ?? ''} ${r.OBJECT_ID ?? ''}`.toLowerCase().includes(q)) return false
      if (types.length && !types.includes(String(r.OBJECT_TYPE ?? 'UNK'))) return false
      if (maxAge !== '' && epochAgeDays(r, now) > Number(maxAge)) return false
      if (maxPerigee !== '' && Number(r.PERIAPSIS) > Number(maxPerigee)) return false
      return true
    })
  }, [records, search, types, maxAge, maxPerigee])

  const columns = useMemo<ColumnDef<ElementRecord>[]>(
    () =>
      COLUMNS.map((c) => ({
        id: c.key,
        header: c.label,
        accessorFn: (r) => (c.key === '_age' ? epochAgeDays(r) : (r[c.key] ?? null)),
        cell: (info) => (c.render ? c.render(info.getValue(), info.row.original) : String(info.getValue() ?? '')),
        sortUndefined: 'last',
        meta: { numeric: c.numeric },
      })),
    [],
  )

  // O TanStack Table devolve funções que o React Compiler não memoiza; o componente fica sem memoização automática
  // oxlint-disable-next-line react/incompatible-library
  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 100 } },
    autoResetPageIndex: true,
  })

  const typeOptions = useMemo(() => {
    const present = new Set(records.map((r) => String(r.OBJECT_TYPE ?? 'UNK')))
    return [...present].sort().map((t) => ({ value: t, label: TYPE_LABEL[t] ?? t }))
  }, [records])

  return (
    <Stack gap="sm">
      <Group gap="sm" align="flex-end" wrap="wrap">
        <TextInput
          label="Buscar"
          placeholder="NORAD, nome ou designador"
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          w={240}
        />
        <MultiSelect label="Tipo" data={typeOptions} value={types} onChange={setTypes} placeholder="Todos" w={260} clearable />
        <NumberInput label="Idade máxima (dias)" value={maxAge} onChange={setMaxAge} min={0} w={160} />
        <NumberInput label="Perigeu máximo (km)" value={maxPerigee} onChange={setMaxPerigee} min={0} w={170} />
      </Group>
      <ScrollArea type="auto">
        <Table striped highlightOnHover fz="xs" withTableBorder style={{ whiteSpace: 'nowrap' }}>
          <Table.Thead>
            {table.getHeaderGroups().map((hg) => (
              <Table.Tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted()
                  const Icon = sorted === 'asc' ? IconChevronUp : sorted === 'desc' ? IconChevronDown : IconSelector
                  const numeric = (h.column.columnDef.meta as { numeric?: boolean } | undefined)?.numeric
                  return (
                    <Table.Th key={h.id} ta={numeric ? 'right' : 'left'}>
                      <UnstyledButton onClick={h.column.getToggleSortingHandler()} fz="xs" fw={600}>
                        <Group gap={4} wrap="nowrap" justify={numeric ? 'flex-end' : 'flex-start'}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          <Icon size={12} />
                        </Group>
                      </UnstyledButton>
                    </Table.Th>
                  )
                })}
              </Table.Tr>
            ))}
          </Table.Thead>
          <Table.Tbody>
            {table.getRowModel().rows.map((row) => (
              <Table.Tr key={row.id} c={row.original.DECAY_DATE ? 'dimmed' : undefined}>
                {row.getVisibleCells().map((cell) => {
                  const numeric = (cell.column.columnDef.meta as { numeric?: boolean } | undefined)?.numeric
                  return (
                    <Table.Td key={cell.id} ta={numeric ? 'right' : 'left'} ff={numeric ? 'monospace' : undefined}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </Table.Td>
                  )
                })}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          {fmtNum(filtered.length)} de {fmtNum(records.length)} conjuntos
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
