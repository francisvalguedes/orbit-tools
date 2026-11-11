import { AppShell, Select, Stack, Tabs, Text, Title } from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { IconActivity, IconAngle, IconArrowsExchange } from '@tabler/icons-react'
import type { Ellipsoid } from '../../api/types'
import { SitesManager } from '../../sites/SitesManager'
import { DmsTab } from './DmsTab'
import { KinematicsTab } from './KinematicsTab'
import { PointsTab } from './PointsTab'

export function ConvertPage() {
  const [tab, setTab] = useLocalStorage<string>({ key: 'orbit-tools:convert-tab', defaultValue: 'points' })
  const [ellipsoid, setEllipsoid] = useLocalStorage<Ellipsoid>({ key: 'orbit-tools:ellipsoid', defaultValue: 'wgs84' })

  return (
    <>
      <AppShell.Navbar p="md">
        <Stack gap="md">
          <Select
            label="Elipsoide"
            description="Para todas as conversões. As coordenadas dos locais devem estar no mesmo elipsoide."
            value={ellipsoid}
            onChange={(v) => setEllipsoid((v as Ellipsoid) ?? 'wgs84')}
            data={[
              { value: 'wgs84', label: 'WGS84' },
              { value: 'wgs72', label: 'WGS72' },
            ]}
            allowDeselect={false}
          />
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
              <PointsTab ellipsoid={ellipsoid} />
            </Tabs.Panel>
            <Tabs.Panel value="dms">
              <DmsTab />
            </Tabs.Panel>
            <Tabs.Panel value="kinematics">
              <KinematicsTab ellipsoid={ellipsoid} />
            </Tabs.Panel>
          </Tabs>
        </Stack>
      </AppShell.Main>
    </>
  )
}
