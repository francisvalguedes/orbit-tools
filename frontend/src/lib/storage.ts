// Dados que o app guarda neste navegador (localStorage e IndexedDB): quais são de cada módulo, a versão do
// formato e a limpeza. Dados gravados por uma versão antiga podem quebrar a nova; ver checkStorageVersion.
import { delMany } from 'idb-keyval'
import type { ModuleId } from '../modules'

export const PREFIX = 'orbit-tools:'

/**
 * Versão do formato dos dados guardados. Aumentar quando uma mudança tornar incompatível o que versões
 * anteriores gravaram (campo renomeado, tipo trocado): na abertura seguinte, esses dados são descartados.
 */
export const STORAGE_VERSION = 1
export const VERSION_KEY = 'storage-version'

/** Cadastros do usuário, de todos os módulos: nunca apagados pela limpeza. */
export const USER_KEYS = ['sites', 'radars']

/** Chaves de cada módulo, sem o prefixo. Uma chave nova precisa entrar aqui (storage.test.ts confere). */
export const MODULE_KEYS: Record<ModuleId, string[]> = {
  elementos: ['elements', 'elements-tab'],
  passagens: [
    'passes',
    'passes-gap',
    'passes-params',
    'passes-priority',
    'passes-radar',
    'passes-rules',
    'passes-site',
    'passes-tab',
    'passes-timeline',
    'pass-detail-open',
    'export-formats',
  ],
  orbita: ['orbit-hours', 'orbit-step', 'orbit-tab'],
  conversoes: ['convert-tab'],
}

const IDB_KEYS = ['elements', 'passes']
// O conjunto de elementos é validado ao carregar (elements/store.ts) e custa uma consulta para refazer
const KEEP_ON_UPGRADE = ['elements']

function clearKeys(keys: string[]): Promise<void> {
  for (const k of keys) {
    try {
      localStorage.removeItem(PREFIX + k)
    } catch {
      // localStorage bloqueado: nada guardado
    }
  }
  const idb = keys.filter((k) => IDB_KEYS.includes(k)).map((k) => PREFIX + k)
  return idb.length ? delMany(idb).catch(() => undefined) : Promise.resolve()
}

/** Apaga o que o módulo guardou (resultados, seleção, parâmetros, abas); locais e radares ficam. */
export const clearModuleData = (module: ModuleId) => clearKeys(MODULE_KEYS[module])

/**
 * Na abertura do app: se os dados são de outra versão do formato (ou de antes do controle de versão),
 * descarta os dos módulos, menos os cadastros e o conjunto de elementos. Precisa rodar antes de os stores
 * lerem o IndexedDB: a exclusão é pedida antes e o IndexedDB atende as transações na ordem.
 */
export function checkStorageVersion(): void {
  try {
    if (localStorage.getItem(PREFIX + VERSION_KEY) === String(STORAGE_VERSION)) return
    localStorage.setItem(PREFIX + VERSION_KEY, String(STORAGE_VERSION))
  } catch {
    return
  }
  void clearKeys(Object.values(MODULE_KEYS).flat().filter((k) => !KEEP_ON_UPGRADE.includes(k)))
}
