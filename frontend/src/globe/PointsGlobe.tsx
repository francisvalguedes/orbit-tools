// Globo com pontos e locais, carregado sob demanda (React.lazy): traz o Cesium.
import { Group, SegmentedControl, Stack, Text, useComputedColorScheme } from '@mantine/core'
import { Cartesian3, Color, PointPrimitiveCollection, Rectangle, Viewer } from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { useEffect, useRef, useState } from 'react'
import type { Series, Site } from '../api/types'
import { categorical, chrome } from '../charts/tokens'
import { fmtNum } from '../lib/format'
import { type BaseMap, baseMaps, imageryLayer, marker } from './common'

const MAX_POINTS = 20_000 // acima disso o globo mostra uma amostra uniforme

interface Props {
  lat: Series
  lon: Series
  height: Series
  sites: Site[]
  /** Liga os pontos em sequência (trajetória) em vez de mostrá-los soltos */
  line?: boolean
  height_px?: number
}

export default function PointsGlobe({ lat, lon, height, sites, line = false, height_px = 520 }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const pointsRef = useRef<PointPrimitiveCollection | null>(null)
  const scheme = useComputedColorScheme('dark')
  const [baseMap, setBaseMap] = useState<BaseMap>(scheme === 'dark' ? 'dark' : 'osm')
  const n = lat.length
  const stride = Math.max(1, Math.ceil(n / MAX_POINTS))

  useEffect(() => {
    if (!container.current) return
    const viewer = new Viewer(container.current, {
      baseLayer: imageryLayer(baseMap),
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: true,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
    })
    viewerRef.current = viewer
    return () => {
      viewer.destroy()
      viewerRef.current = null
      pointsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mapa base trocado no efeito abaixo
  }, [])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    viewer.imageryLayers.removeAll()
    viewer.imageryLayers.add(imageryLayer(baseMap))
  }, [baseMap])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    const c = chrome[scheme]
    const palette = categorical[scheme]
    const ink = Color.fromCssColorString(c.ink)
    const bg = Color.fromCssColorString(c.surface)
    viewer.entities.removeAll()
    // Só a coleção de pontos deste componente: scene.primitives também guarda as do próprio Cesium
    if (pointsRef.current) viewer.scene.primitives.remove(pointsRef.current)
    pointsRef.current = null

    const positions: Cartesian3[] = []
    for (let i = 0; i < n; i += stride) {
      const la = lat[i]
      const lo = lon[i]
      const h = height[i]
      if (la == null || lo == null || h == null) continue
      positions.push(Cartesian3.fromDegrees(lo, la, h))
    }
    const color = Color.fromCssColorString(palette[0])
    if (line && positions.length > 1) {
      viewer.entities.add({ polyline: { positions, width: 3, material: color } })
    } else {
      const points = viewer.scene.primitives.add(new PointPrimitiveCollection()) as PointPrimitiveCollection
      for (const p of positions) points.add({ position: p, pixelSize: 7, color, outlineColor: bg, outlineWidth: 1 })
      pointsRef.current = points
    }

    sites.forEach((s, k) => {
      const pos = Cartesian3.fromDegrees(s.lon, s.lat, s.height)
      marker(viewer, pos, s.name, Color.fromCssColorString(palette[(k + 1) % palette.length]), ink, bg)
    })

    // Vista de cima do retângulo que contém pontos e locais, com margem
    const lats = [...sites.map((s) => s.lat)]
    const lons = [...sites.map((s) => s.lon)]
    for (let i = 0; i < n; i += stride) {
      if (lat[i] != null && lon[i] != null) {
        lats.push(lat[i] as number)
        lons.push(lon[i] as number)
      }
    }
    if (lats.length) {
      const pad = (lo: number, hi: number) => Math.max((hi - lo) * 0.25, 1)
      const [la0, la1] = [Math.min(...lats), Math.max(...lats)]
      const [lo0, lo1] = [Math.min(...lons), Math.max(...lons)]
      const dla = pad(la0, la1)
      const dlo = pad(lo0, lo1)
      viewer.camera.setView({
        destination: Rectangle.fromDegrees(
          Math.max(lo0 - dlo, -180),
          Math.max(la0 - dla, -90),
          Math.min(lo1 + dlo, 180),
          Math.min(la1 + dla, 90),
        ),
      })
    }
  }, [lat, lon, height, sites, line, n, stride, scheme])

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          {stride > 1 ? `Mostrando 1 a cada ${stride} de ${fmtNum(n)} pontos.` : `${fmtNum(n)} pontos.`}
        </Text>
        <SegmentedControl
          size="xs"
          value={baseMap}
          onChange={(v) => setBaseMap(v as BaseMap)}
          data={Object.entries(baseMaps).map(([value, m]) => ({ value, label: m.label }))}
        />
      </Group>
      <div ref={container} style={{ height: height_px, borderRadius: 8, overflow: 'hidden' }} />
    </Stack>
  )
}
