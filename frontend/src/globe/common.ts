// Copiado de trajetory-analysis/frontend/src/globe/common.ts (commit ceb084d, 10/11/2026).
// Peças do globo (Cesium) usadas pelo pré-voo e pelo pós-voo. Só módulos carregados sob demanda
// (React.lazy) podem importar este arquivo, porque ele traz o Cesium.
import {
  Cartesian2,
  type Cartesian3,
  type Color,
  type Entity,
  HorizontalOrigin,
  ImageryLayer,
  LabelStyle,
  UrlTemplateImageryProvider,
  VerticalOrigin,
  type Viewer,
} from 'cesium'

export type BaseMap = 'dark' | 'satellite' | 'osm'

// Mapas base sem chave de API. Para rede isolada, apontar as URLs para um servidor de tiles local.
export const baseMaps: Record<BaseMap, { label: string; url: string; credit: string; maximumLevel: number }> = {
  dark: {
    label: 'Escuro',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    credit: 'Esri, HERE, Garmin, © OpenStreetMap contributors',
    maximumLevel: 16,
  },
  satellite: {
    label: 'Satélite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    credit: 'Esri, Maxar, Earthstar Geographics',
    maximumLevel: 19,
  },
  osm: {
    label: 'Ruas',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    credit: '© OpenStreetMap contributors',
    maximumLevel: 19,
  },
}

export function imageryLayer(map: BaseMap) {
  const m = baseMaps[map]
  return new ImageryLayer(
    new UrlTemplateImageryProvider({ url: m.url, credit: m.credit, maximumLevel: m.maximumLevel }),
  )
}

export function marker(viewer: Viewer, position: Cartesian3, text: string, color: Color, ink: Color, bg: Color): Entity {
  return viewer.entities.add({
    position,
    point: { pixelSize: 10, color, outlineColor: bg, outlineWidth: 2 },
    label: {
      text,
      font: '13px system-ui, sans-serif',
      fillColor: ink,
      showBackground: true,
      backgroundColor: bg.withAlpha(0.8),
      backgroundPadding: new Cartesian2(6, 4),
      style: LabelStyle.FILL,
      horizontalOrigin: HorizontalOrigin.LEFT,
      verticalOrigin: VerticalOrigin.BOTTOM,
      pixelOffset: new Cartesian2(8, -6),
    },
  })
}
