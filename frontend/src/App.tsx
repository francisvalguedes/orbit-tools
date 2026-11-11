import {
  ActionIcon,
  AppShell,
  Badge,
  Burger,
  Group,
  SegmentedControl,
  Text,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { IconMoon, IconSun } from '@tabler/icons-react'
import { useEffect } from 'react'
import { useMeta } from './api/client'
import { ErrorBoundary } from './features/ErrorBoundary'
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
  const meta = useMeta()
  // Erro em config/local/locais.csv ou radares.csv: o servidor usa os exemplos; avisa quem administra
  const configErrors = meta.data?.config_errors
  useEffect(() => {
    for (const message of configErrors ?? []) {
      notifications.show({ color: 'red', title: 'Configuração da instalação', message, autoClose: false })
    }
  }, [configErrors])
  const [module, setModule] = useModule()
  // No celular a barra lateral (parâmetros do módulo) abre pelo botão de menu
  const [navOpened, { toggle: toggleNav, close: closeNav }] = useDisclosure(false)
  const Page = PAGES[module]

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 320, breakpoint: 'sm', collapsed: { mobile: !navOpened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px={{ base: 'xs', sm: 'md' }} justify="space-between" wrap="nowrap" gap="xs">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={navOpened} onClick={toggleNav} hiddenFrom="sm" size="sm" aria-label="Parâmetros do módulo" />
            <Logo />
            <Text fw={700} size="lg" visibleFrom="md">
              orbit-tools
            </Text>
          </Group>

          <SegmentedControl
            size="xs"
            value={module}
            onChange={(v) => {
              setModule(v as ModuleId)
              closeNav()
            }}
            data={MODULES.map((m) => ({ value: m.id, label: m.label }))}
            style={{ minWidth: 0, overflowX: 'auto' }}
          />

          <Group gap="xs" wrap="nowrap">
            <Tooltip label={meta.isError ? 'Backend indisponível' : 'Backend conectado'}>
              <Badge
                variant="dot"
                color={meta.isError ? 'red' : meta.data ? 'teal' : 'gray'}
                size="lg"
                radius="sm"
                visibleFrom="sm"
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
      <ErrorBoundary key={module}>
        <Page />
      </ErrorBoundary>
    </AppShell>
  )
}
