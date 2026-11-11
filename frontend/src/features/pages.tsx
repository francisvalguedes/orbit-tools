import { Placeholder } from './Placeholder'

export function PassesPage() {
  return (
    <Placeholder
      title="Passagens"
      summary="Buscar passagens sobre um sensor, selecionar e gerar trajetórias para rastreio."
      items={[
        'Busca por distância máxima e mínima, com elevação mínima opcional',
        'Seleção por tabela com filtros, por regras e pela linha do tempo com conflitos',
        'Margem de detecção do radar ao longo da passagem',
        'Globo, gráfico polar e gráficos de distância, elevação e taxas',
        'Arquivos .trn e .trj na taxa do radar, com H0 no nome do arquivo',
      ]}
      phase="fase 4"
    />
  )
}

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
