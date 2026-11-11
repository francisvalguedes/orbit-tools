import {
  ActionIcon,
  Alert,
  Button,
  FileButton,
  Group,
  Modal,
  NumberInput,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { IconCurrentLocation, IconDownload, IconMapPin, IconTrash, IconUpload } from '@tabler/icons-react'
import { useState } from 'react'
import type { Site } from '../api/types'
import { download } from '../lib/csv'
import { fmtNum } from '../lib/format'
import { sitesFromCsv, sitesToCsv, useAllSites, useUserSites, validateSite } from './store'

const EMPTY = { name: '', lat: 0, lon: 0, height: 0 }

/** Botão que abre o cadastro de locais do usuário (guardados só neste navegador). */
export function SitesManager() {
  const [opened, setOpened] = useState(false)
  return (
    <>
      <Button variant="default" leftSection={<IconMapPin size={16} />} onClick={() => setOpened(true)} fullWidth>
        Locais
      </Button>
      <Modal opened={opened} onClose={() => setOpened(false)} title="Locais" size="lg">
        <SitesEditor />
      </Modal>
    </>
  )
}

function SitesEditor() {
  const [user, setUser] = useUserSites()
  const { sites, serverLabel } = useAllSites()
  const [form, setForm] = useState<Site>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const server = sites.filter((s) => s.origin === 'servidor')

  const add = () => {
    const err = validateSite(form)
    if (err) return setError(err)
    if (sites.some((s) => s.name === form.name.trim())) return setError('Já existe um local com esse nome.')
    setUser([...user, { ...form, name: form.name.trim() }])
    setForm(EMPTY)
    setError(null)
  }

  const importCsv = async (file: File | null) => {
    if (!file) return
    try {
      const loaded = await sitesFromCsv(file)
      const names = new Set(loaded.map((s) => s.name))
      setUser([...user.filter((s) => !names.has(s.name)), ...loaded])
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const locate = () => {
    if (!navigator.geolocation) return setError('O navegador não informa a localização.')
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setForm((f) => ({
          ...f,
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          height: pos.coords.altitude ?? f.height,
        })),
      (e) => setError(`Localização indisponível: ${e.message}`),
    )
  }

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Coordenadas geodésicas em graus e altura acima do elipsoide em metros. Os seus locais ficam só neste
        navegador; exporte em CSV para levar a outro computador.
      </Text>

      <ScrollArea.Autosize mah={300}>
        <Table striped fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Nome</Table.Th>
              <Table.Th ta="right">Latitude</Table.Th>
              <Table.Th ta="right">Longitude</Table.Th>
              <Table.Th ta="right">Altura (m)</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {[...server, ...user.map((s) => ({ ...s, origin: 'usuario' as const }))].map((s) => (
              <Table.Tr key={`${s.origin}-${s.name}`}>
                <Table.Td>
                  {s.name}
                  {s.origin === 'servidor' && (
                    <Text span size="xs" c="dimmed">
                      {' '}
                      · {serverLabel.toLowerCase()}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td ta="right">{fmtNum(s.lat, 6)}</Table.Td>
                <Table.Td ta="right">{fmtNum(s.lon, 6)}</Table.Td>
                <Table.Td ta="right">{fmtNum(s.height, 1)}</Table.Td>
                <Table.Td>
                  {s.origin === 'usuario' && (
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label={`Excluir ${s.name}`}
                      onClick={() => setUser(user.filter((u) => u.name !== s.name))}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea.Autosize>

      <Group align="flex-end" gap="xs" wrap="wrap">
        <TextInput
          label="Nome"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.currentTarget.value })}
          w={160}
        />
        <NumberInput label="Latitude" value={form.lat} onChange={(v) => setForm({ ...form, lat: Number(v) })} decimalScale={8} w={130} />
        <NumberInput label="Longitude" value={form.lon} onChange={(v) => setForm({ ...form, lon: Number(v) })} decimalScale={8} w={130} />
        <NumberInput label="Altura (m)" value={form.height} onChange={(v) => setForm({ ...form, height: Number(v) })} decimalScale={3} w={110} />
        <Tooltip label="Usar a localização do navegador">
          <ActionIcon variant="default" size="lg" onClick={locate} aria-label="Usar minha localização">
            <IconCurrentLocation size={18} />
          </ActionIcon>
        </Tooltip>
        <Button onClick={add}>Adicionar</Button>
      </Group>

      {error && (
        <Alert color="red" variant="light" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Group gap="xs">
        <FileButton onChange={importCsv} accept=".csv,text/csv">
          {(props) => (
            <Button {...props} variant="default" leftSection={<IconUpload size={16} />}>
              Importar CSV
            </Button>
          )}
        </FileButton>
        <Button
          variant="default"
          leftSection={<IconDownload size={16} />}
          disabled={user.length === 0}
          onClick={() => download(sitesToCsv(user), 'locais.csv')}
        >
          Exportar meus locais
        </Button>
      </Group>
    </Stack>
  )
}
