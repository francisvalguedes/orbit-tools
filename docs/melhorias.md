# Melhorias futuras

Ideias avaliadas durante o planejamento que ficam para depois da primeira versão. O que já faz parte da v1 está em [planejamento.md](planejamento.md).

## Precisão das órbitas

### Contexto: de onde vem o erro

| Fonte de erro | Tamanho |
|---|---|
| Elementos do catálogo público (TLE/OMM) propagados pelo SGP4 | ~1 km na época, crescendo 1 a 3 km/dia num LEO, quase todo ao longo da órbita |
| Perigeu baixo, arrasto forte, tempestade solar | pode passar de 10 km em 1 a 2 dias |
| Objeto em manobra | o elemento anterior deixa de valer |
| Sem EOP (UT1 = UTC, sem polo) | 20 a 36 m hoje (até ~450 m se UT1−UTC chegar a 0,9 s) |
| Previsão do EOP a 3 meses | alguns metros |
| Conversão TEME→ITRS própria com EOP, contra o astropy | 1 cm |

O limite do sistema é a idade e a qualidade dos elementos, não o propagador. O SGP4 continua sendo o modelo certo: os elementos do catálogo são ajustados para ele, e propagá-los com outro modelo dá resultado pior. Num radar com feixe de 1° (cerca de 9 km a 500 km), elementos de até 1 a 2 dias normalmente bastam; o erro ao longo da órbita aparece como adiantamento ou atraso (1 km ≈ 0,13 s num LEO).

### EOP (já previsto na v1, fase 1)

Registrado aqui porque a dúvida surgiu: sem o astropy, de onde vêm os coeficientes que variam?

- A conversão TEME→ITRS precisa de UT1−UTC e do movimento do polo (xp, yp). O restante é fórmula fixa (GMST IAU-82, que define o TEME).
- O astropy não calcula esses valores: baixa o `finals2000A.all` do IERS e interpola. O orbit-tools baixa o mesmo arquivo (IERS, com USNO e o `EOP-All.csv` do Celestrak como alternativas), uma vez por semana. O arquivo traz previsões para cerca de 1 ano, o que permite propagar para o futuro.
- No dia de um segundo intercalar, UT1−UTC salta 1 s: a interpolação é feita em UT1−TAI, que é contínuo.
- Sem arquivo recente: usa o do cache (avisando a idade), depois a cópia da imagem Docker, e por último UT1 = UTC com aviso.
- A data do EOP em uso aparece na interface, no `/api/meta` e no resumo das passagens.
- Um teste compara a conversão própria com o astropy (só dependência de teste) usando um arquivo EOP fixo, com tolerância de 1 cm.

### GP suplementar do Celestrak (SupGP)

Elementos no mesmo formato OMM, ajustados pelo Celestrak a partir das efemérides publicadas pelos próprios operadores (ISS, Starlink, OneWeb, GPS, Planet e outros). Para esses objetos, o erro cai para a ordem de centenas de metros.

- Custo baixo: mesmo formato e mesmo propagador, só uma fonte a mais no módulo Elementos.
- Quando houver as duas versões de um objeto, preferir a suplementar e indicar a origem na tabela.

### Determinação de órbita com dados de rastreio próprios

Ajustar elementos aos dados dos radares do CLBI e do CLA (correção diferencial), gerando elementos próprios mais precisos para o próximo rastreio do mesmo objeto. Seria a maior melhoria de precisão possível, mas é um projeto à parte: precisa dos dados de rastreio (que não podem ir para o repositório público) e de validação cuidadosa.

### Alternativas avaliadas e descartadas

- **Propagação numérica de alta precisão** (Orekit e similares): só melhora o resultado com um estado inicial preciso, que o catálogo público não fornece. Voltaria a fazer sentido junto com a determinação de órbita.
- **SGP4-XP** (Força Espacial dos EUA): mais preciso, mas a biblioteca é distribuída só como binário fechado e os elementos têm disponibilidade restrita. Incompatível com um projeto open source.

## WGS72 nas conversões

Hoje o app usa só WGS84, como o conversor antigo. Oferecer WGS72 exige as coordenadas de cada local levantadas nesse elipsoide (o mesmo ponto físico tem latitude, longitude e altura diferentes em cada um). Proposta, se for preciso:

- Coluna opcional `ellipsoid` nos CSVs de `config/local/` e na importação de locais, uma linha por local e elipsoide; sem a coluna, WGS84 (os arquivos atuais continuam válidos).
- Nas Conversões, os locais sem coordenadas no elipsoide escolhido aparecem desabilitados, em vez de reaproveitar as do outro.
- Passagens e Órbita continuam em WGS84.
- O `geodesy.py` já suporta WGS72 e está testado contra o pymap3d.

## Desempenho

- **Refinamento das passagens vetorizado:** na busca do catálogo LEO inteiro (16 mil objetos, 1 dia, 16,5 s), boa parte do tempo está no refinamento de cada passagem, feito em laço Python. Dá para refinar todas as bordas de uma vez.
