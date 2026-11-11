import { Placeholder } from './Placeholder'

export function OrbitPage() {
  return (
    <Placeholder
      title="Órbita"
      summary="Efemérides de um objeto em qualquer intervalo e passo."
      items={[
        'Saída em TEME, ECEF, geodésicas, ENU e azimute, elevação e distância',
        'Órbita 3D, traço no solo e posição animada no globo',
        'Exportação em CSV',
      ]}
      phase="fase 5"
    />
  )
}

export { ConvertPage } from './convert/ConvertPage'
export { ElementsPage } from './elements/ElementsPage'
export { PassesPage } from './passes/PassesPage'
