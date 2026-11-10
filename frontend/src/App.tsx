import {
  ActionIcon,
  AppShell,
  Badge,
  Group,
  SegmentedControl,
  Text,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core'
import { IconMoon, IconSun } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { api } from './api/client'
import { ConvertPage, ElementsPage, OrbitPage, PassesPage } from './features/pages'
import { MODULES, type ModuleId, useModule } from './modules'

const PAGES: Record<ModuleId, () => React.JSX.Element> = {
  elementos: ElementsPage,
  passagens: PassesPage,
  orbita: OrbitPage,
  conversoes: ConvertPage,
}

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
      <ellipse
        cx="16"
        cy="16"
        rx="12.5"
        ry="6"
        transform="rotate(-25 16 16)"
        fill="none"
        stroke="#3987e5"
        strokeWidth="2"
      />
      <circle cx="16" cy="16" r="4.5" fill="currentColor" />
      <circle cx="26.5" cy="10.5" r="2.5" fill="#d95926" />
    </svg>
  )
}

export default function App() {
  const { setColorScheme } = useMantineColorScheme()
  const scheme = useComputedColorScheme('dark')
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta, staleTime: Infinity, retry: 1 })
  const [module, setModule] = useModule()
  const Page = PAGES[module]

  return (
    <AppShell header={{ height: 56 }} navbar={{ width: 320, breakpoint: 'sm' }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Logo />
            <Text fw={700} size="lg">
              orbit-tools
            </Text>
          </Group>

          <SegmentedControl
            size="xs"
            value={module}
            onChange={(v) => setModule(v as ModuleId)}
            data={MODULES.map((m) => ({ value: m.id, label: m.label }))}
          />

          <Group gap="xs" wrap="nowrap">
            <Tooltip label={meta.isError ? 'Backend indisponível' : 'Backend conectado'}>
              <Badge
                variant="dot"
                color={meta.isError ? 'red' : meta.data ? 'teal' : 'gray'}
                size="lg"
                radius="sm"
              >
                {meta.data ? `v${meta.data.version}` : 'API'}
              </Badge>
            </Tooltip>
            <ActionIcon
              variant="default"
              size="lg"
              aria-label="Alternar tema"
              onClick={() => setColorScheme(scheme === 'dark' ? 'light' : 'dark')}
            >
              {scheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
            </ActionIcon>
          </Group>
        </Group>
      </AppShell.Header>
      <Page />
    </AppShell>
  )
}
