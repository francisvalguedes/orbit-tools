import { Group, Pagination, ScrollArea, Stack, Table, Text } from '@mantine/core'
import { useState } from 'react'
import { fmtNum } from '../../lib/format'

export interface ResultColumn {
  key: string
  label: string
  digits?: number // números: casas decimais; ausente = texto
  values: (number | string | null)[]
}

const PAGE = 100

/** Tabela paginada de colunas (todas com o mesmo número de linhas). */
export function ResultTable({ columns }: { columns: ResultColumn[] }) {
  const [page, setPage] = useState(1)
  const n = columns[0]?.values.length ?? 0
  const pages = Math.max(1, Math.ceil(n / PAGE))
  const start = (Math.min(page, pages) - 1) * PAGE
  const rows = Array.from({ length: Math.min(PAGE, n - start) }, (_, k) => start + k)

  return (
    <Stack gap="xs">
      <ScrollArea type="auto">
        <Table striped highlightOnHover fz="xs" ff="monospace" withTableBorder style={{ whiteSpace: 'nowrap' }}>
          <Table.Thead>
            <Table.Tr>
              {columns.map((c) => (
                <Table.Th key={c.key} ta={c.digits == null ? 'left' : 'right'}>
                  {c.label}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((i) => (
              <Table.Tr key={i}>
                {columns.map((c) => {
                  const v = c.values[i]
                  return (
                    <Table.Td key={c.key} ta={c.digits == null ? 'left' : 'right'}>
                      {c.digits == null ? (v ?? '') : fmtNum(v as number | null, c.digits)}
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
          {fmtNum(n)} {n === 1 ? 'linha' : 'linhas'}
        </Text>
        {pages > 1 && <Pagination size="sm" total={pages} value={page} onChange={setPage} />}
      </Group>
    </Stack>
  )
}
