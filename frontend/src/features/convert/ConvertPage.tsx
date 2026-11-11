import { AppShell, Stack, Tabs, Text, Title } from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { IconActivity, IconAngle, IconArrowsExchange } from '@tabler/icons-react'
import { SitesManager } from '../../sites/SitesManager'
import { DmsTab } from './DmsTab'
import { KinematicsTab } from './KinematicsTab'
import { PointsTab } from './PointsTab'

export function ConvertPage() {
  const [tab, setTab] = useLocalStorage<string>({ key: 'orbit-tools:convert-tab', defaultValue: 'points' })

  return (
    <>
      <AppShell.Navbar p="md">
        <Stack gap="md">
          <Stack gap={2}>
            <Text size="sm" fw={500}>
              Elipsoide: WGS84
            </Text>
            <Text size="xs" c="dimmed">
              Todas as conversões e as coordenadas dos locais são em WGS84, como no conversor antigo.
            </Text>
          </Stack>
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Locais de referência
            </Text>
            <SitesManager />
            <Text size="xs" c="dimmed">
              Origens dos referenciais ENU (rampas, sensores). Os seus ficam só neste navegador.
            </Text>
          </Stack>
          <Text size="xs" c="dimmed">
            ENU: x = leste, y = norte, z = cima. Azimute a partir do norte, sentido horário. Altura acima do elipsoide.
          </Text>
        </Stack>
      </AppShell.Navbar>
      <AppShell.Main>
        <Stack gap="md">
          <Title order={3}>Conversões</Title>
          <Tabs value={tab} onChange={(v) => setTab(v ?? 'points')}>
            <Tabs.List mb="md">
              <Tabs.Tab value="points" leftSection={<IconArrowsExchange size={16} />}>
                Converter pontos
              </Tabs.Tab>
              <Tabs.Tab value="dms" leftSection={<IconAngle size={16} />}>
                Graus, minutos e segundos
              </Tabs.Tab>
              <Tabs.Tab value="kinematics" leftSection={<IconActivity size={16} />}>
                Velocidade e aceleração
              </Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="points">
              <PointsTab />
            </Tabs.Panel>
            <Tabs.Panel value="dms">
              <DmsTab />
            </Tabs.Panel>
            <Tabs.Panel value="kinematics">
              <KinematicsTab />
            </Tabs.Panel>
          </Tabs>
        </Stack>
      </AppShell.Main>
    </>
  )
}
