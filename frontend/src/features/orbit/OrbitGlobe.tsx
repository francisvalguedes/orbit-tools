// Globo da órbita, carregado sob demanda (React.lazy): traz o Cesium.
// Traço no solo, trajetória no referencial fixo (ECEF), órbita vista no instante inicial e o objeto
// animado no tempo; com local, a linha de visada quando o objeto está acima do horizonte.
import { ActionIcon, Badge, Group, SegmentedControl, Select, Slider, Stack, Text, Tooltip, useComputedColorScheme } from '@mantine/core'
import { IconClockPlay, IconPlayerPauseFilled, IconPlayerPlayFilled } from '@tabler/icons-react'
import {
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Cartographic,
  ClockRange,
  Color,
  JulianDate,
  LagrangePolynomialApproximation,
  Math as CesiumMath,
  PolylineDashMaterialProperty,
  SampledPositionProperty,
  Viewer,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { EphemerisResponse, Site } from '../../api/types'
import { categorical, chrome } from '../../charts/tokens'
import { type BaseMap, baseMaps, imageryLayer, marker } from '../../globe/common'
import { fmtDeg, fmtLength } from '../../lib/format'

interface Props {
  eph: EphemerisResponse
  site: Site | null
  name: string
}

const MIN_HEIGHT = 500 // px; abaixo disso o globo fica pequeno demais para navegar

const xyz = (x: (number | null)[], y: (number | null)[], z: (number | null)[]) =>
  x.flatMap((xi, i) => (xi == null || y[i] == null || z[i] == null ? [] : [new Cartesian3(xi, y[i]!, z[i]!)]))

export default function OrbitGlobe({ eph, site, name }: Props) {
  const block = useRef<HTMLDivElement>(null) // controles + globo: o que vai para a tela cheia
  const container = useRef<HTMLDivElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [fitHeight, setFitHeight] = useState(560)
  const viewerRef = useRef<Viewer | null>(null)
  const scheme = useComputedColorScheme('dark')
  const [baseMap, setBaseMap] = useState<BaseMap>(scheme === 'dark' ? 'dark' : 'osm')
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState('60')
  const [index, setIndex] = useState(0)
  // Tempo real: relógio no instante atual do computador (UTC), a 1×. A posição e a hora mostradas seguem o
  // relógio a cada segundo, em vez de saltar de amostra em amostra.
  const [live, setLive] = useState(false)
  const liveRef = useRef(false)
  const [liveSec, setLiveSec] = useState(0) // instante atual do relógio, em s desde 1970
  const sampledRef = useRef<SampledPositionProperty | null>(null)
  const goLive = (on: boolean) => {
    liveRef.current = on
    setLive(on)
  }
  const start = JulianDate.fromIso8601(`${eph.time[0]}Z`)
  const step = eph.t.length > 1 ? (eph.t[1] as number) : 1

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
      fullscreenButton: true,
      fullscreenElement: block.current ?? undefined, // o padrão do Cesium é a página inteira
      infoBox: false,
      selectionIndicator: false,
    })
    viewer.clock.clockRange = ClockRange.CLAMPED
    viewerRef.current = viewer
    return () => {
      viewer.destroy()
      viewerRef.current = null
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

    const track = xyz(eph.ecef_x, eph.ecef_y, eph.ecef_z)
    const ground = eph.lat.flatMap((la, i) =>
      la == null || eph.lon[i] == null ? [] : [Cartesian3.fromDegrees(eph.lon[i]!, la, 0)],
    )
    // Uma volta da órbita congelada basta (as seguintes coincidem)
    const perRev = Math.min(eph.t.length, Math.ceil(eph.period_s / step) + 1)
    const orbit = xyz(eph.orbit_x.slice(0, perRev), eph.orbit_y.slice(0, perRev), eph.orbit_z.slice(0, perRev))

    viewer.entities.add({
      polyline: { positions: ground, width: 2, clampToGround: true, material: Color.fromCssColorString(palette[0]).withAlpha(0.8) },
    })
    viewer.entities.add({
      polyline: { positions: track, width: 1.5, material: Color.fromCssColorString(palette[0]).withAlpha(0.45) },
    })
    viewer.entities.add({
      polyline: {
        positions: orbit,
        width: 1.5,
        material: new PolylineDashMaterialProperty({ color: Color.fromCssColorString(palette[3]), dashLength: 14 }),
      },
    })

    const sampled = new SampledPositionProperty()
    // Entre amostras, polinômio em vez de reta: com 30 s de passo, a reta corta ~1 km por dentro da órbita
    sampled.setInterpolationOptions({ interpolationDegree: 5, interpolationAlgorithm: LagrangePolynomialApproximation })
    sampledRef.current = sampled
    eph.time.forEach((iso, i) => {
      const x = eph.ecef_x[i]
      if (x != null) sampled.addSample(JulianDate.fromIso8601(`${iso}Z`), new Cartesian3(x, eph.ecef_y[i]!, eph.ecef_z[i]!))
    })
    viewer.entities.add({
      position: sampled,
      point: { pixelSize: 11, color: Color.WHITE, outlineColor: Color.fromCssColorString(palette[1]), outlineWidth: 3 },
      label: { text: name, font: '12px system-ui, sans-serif', fillColor: ink, pixelOffset: new Cartesian2(0, -18) },
    })

    if (site) {
      const sitePos = Cartesian3.fromDegrees(site.lon, site.lat, site.height)
      marker(viewer, sitePos, site.name, Color.fromCssColorString(palette[2]), ink, bg)
      const el = eph.el
      viewer.entities.add({
        polyline: {
          positions: new CallbackProperty((time) => {
            const t = time ?? viewer.clock.currentTime
            const i = Math.round(JulianDate.secondsDifference(t, start) / step)
            const p = sampled.getValue(t)
            return p && el && (el[i] ?? -1) > 0 ? [sitePos, p] : []
          }, false),
          width: 1.5,
          material: new PolylineDashMaterialProperty({ color: Color.fromCssColorString(palette[2]), dashLength: 8 }),
        },
      })
    }

    const clock = viewer.clock
    clock.startTime = start.clone()
    clock.stopTime = JulianDate.fromIso8601(`${eph.time[eph.time.length - 1]}Z`)
    clock.currentTime = start.clone()
    const remove = clock.onTick.addEventListener((cl) => {
      setIndex(Math.min(eph.t.length - 1, Math.max(0, Math.round(JulianDate.secondsDifference(cl.currentTime, start) / step))))
      if (liveRef.current) setLiveSec(Math.floor(JulianDate.toDate(cl.currentTime).getTime() / 1000))
      if (cl.shouldAnimate && JulianDate.compare(cl.currentTime, cl.stopTime) >= 0) {
        cl.shouldAnimate = false
        setPlaying(false)
        goLive(false)
      }
    })
    void viewer.zoomTo(viewer.entities)
    goLive(false)
    return () => remove()
    // start é derivado de eph
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eph, site, name, scheme, step])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    viewer.clock.multiplier = Number(speed)
    viewer.clock.shouldAnimate = playing
  }, [playing, speed])

  const seek = (i: number) => {
    const viewer = viewerRef.current
    if (!viewer) return
    setPlaying(false)
    goLive(false)
    viewer.clock.currentTime = JulianDate.fromIso8601(`${eph.time[i]}Z`)
    setIndex(i)
  }

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === block.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // Fora da tela cheia, o globo ocupa a altura que sobra na janela abaixo dos controles
  useLayoutEffect(() => {
    const fit = () => {
      const top = (container.current?.getBoundingClientRect().top ?? 0) + window.scrollY
      setFitHeight(Math.max(MIN_HEIGHT, window.innerHeight - top - 16))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [eph])

  // O intervalo calculado inclui o instante atual?
  const startMs = Date.parse(`${eph.time[0]}Z`)
  const stopMs = Date.parse(`${eph.time[eph.time.length - 1]}Z`)
  const nowInRange = Date.now() >= startMs && Date.now() < stopMs

  const startLive = () => {
    const viewer = viewerRef.current
    if (!viewer || !(Date.now() >= startMs && Date.now() < stopMs)) return
    viewer.clock.currentTime = JulianDate.now()
    setSpeed('1')
    setPlaying(true)
    goLive(true)
  }

  // Ao vivo: hora e posição no instante do relógio (polinômio entre amostras); az/el da amostra mais próxima
  const livePos = live ? sampledRef.current?.getValue(JulianDate.fromDate(new Date(liveSec * 1000))) : undefined
  const liveGeo = livePos ? Cartographic.fromCartesian(livePos) : undefined
  const readout = [
    ['UTC', live ? new Date(liveSec * 1000).toISOString().slice(0, 19).replace('T', ' ') : eph.time[index]?.replace('T', ' ')],
    liveGeo
      ? ['Lat, lon', `${fmtDeg(CesiumMath.toDegrees(liveGeo.latitude), 3)}, ${fmtDeg(CesiumMath.toDegrees(liveGeo.longitude), 3)}`]
      : ['Lat, lon', `${fmtDeg(eph.lat[index], 3)}, ${fmtDeg(eph.lon[index], 3)}`],
    ['Altura', fmtLength(liveGeo ? liveGeo.height : eph.height[index])],
    ...(eph.el ? [['Az, el', `${fmtDeg(eph.az?.[index], 1)}, ${fmtDeg(eph.el[index], 1)}`], ['Distância', fmtLength(eph.range?.[index])]] : []),
  ]

  return (
    <Stack
      ref={block}
      gap="xs"
      style={fullscreen ? { height: '100vh', padding: 16, background: 'var(--mantine-color-body)' } : undefined}
    >
      <Group justify="space-between" wrap="wrap">
        <Group gap="xs">
          <ActionIcon
            variant="filled"
            size="lg"
            onClick={() => {
              if (playing) goLive(false)
              setPlaying((p) => !p)
            }}
            aria-label={playing ? 'Pausar' : 'Animar'}
          >
            {playing ? <IconPlayerPauseFilled size={16} /> : <IconPlayerPlayFilled size={16} />}
          </ActionIcon>
          <Select
            size="xs"
            w={110}
            value={speed}
            onChange={(v) => {
              setSpeed(v ?? '60')
              goLive(false)
            }}
            data={['1', '10', '60', '300', '1200'].map((v) => ({ value: v, label: `${v}×` }))}
            allowDeselect={false}
            comboboxProps={{ withinPortal: false }} // a lista fica dentro do bloco, que pode estar em tela cheia
          />
          <Tooltip
            label={
              nowInRange
                ? 'Tempo real: hora atual deste computador (UTC), a 1×'
                : 'O intervalo calculado não inclui a hora atual: calcule a partir de agora'
            }
            withinPortal={false}
          >
            {/* data-disabled em vez de disabled: botão desabilitado não recebe o mouse e a dica não apareceria */}
            <ActionIcon variant="default" size="lg" onClick={startLive} data-disabled={!nowInRange || undefined} aria-label="Tempo real">
              <IconClockPlay size={18} />
            </ActionIcon>
          </Tooltip>
          {live && (
            <Badge color="red" variant="dot" size="sm">
              ao vivo
            </Badge>
          )}
        </Group>
        <Text size="xs" c="dimmed">
          Linha cheia: traço no solo e trajetória (referencial fixo). Tracejada: a órbita vista no instante inicial.
        </Text>
        <SegmentedControl
          size="xs"
          value={baseMap}
          onChange={(v) => setBaseMap(v as BaseMap)}
          data={Object.entries(baseMaps).map(([value, m]) => ({ value, label: m.label }))}
        />
      </Group>
      <Slider value={index} onChange={seek} min={0} max={eph.t.length - 1} label={null} size="sm" />
      <Group gap="lg">
        {readout.map(([label, value]) => (
          <Text key={label} size="xs">
            <Text span c="dimmed" size="xs">
              {label}:{' '}
            </Text>
            {value}
          </Text>
        ))}
      </Group>
      <div
        ref={container}
        style={{ ...(fullscreen ? { flex: 1, minHeight: 0 } : { height: fitHeight }), borderRadius: 8, overflow: 'hidden' }}
      />
    </Stack>
  )
}
