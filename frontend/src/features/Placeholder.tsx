import { AppShell, List, Stack, Text, Title } from '@mantine/core'

interface Props {
  title: string
  summary: string
  items: string[]
  phase: string
}

/** Módulo ainda não implementado: descreve o que virá, conforme docs/planejamento.md. */
export function Placeholder({ title, summary, items, phase }: Props) {
  return (
    <>
      <AppShell.Navbar p="md">
        <Text size="sm" c="dimmed">
          Parâmetros do módulo aparecem aqui.
        </Text>
      </AppShell.Navbar>
      <AppShell.Main>
        <Stack maw={720} gap="sm">
          <Title order={2}>{title}</Title>
          <Text>{summary}</Text>
          <List size="sm" spacing={4}>
            {items.map((item) => (
              <List.Item key={item}>{item}</List.Item>
            ))}
          </List>
          <Text size="sm" c="dimmed">
            Em desenvolvimento ({phase}).
          </Text>
        </Stack>
      </AppShell.Main>
    </>
  )
}
