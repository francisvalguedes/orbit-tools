// Importado primeiro em main.tsx: roda antes de os stores (elements, passes) lerem o IndexedDB.
import { checkStorageVersion } from './storage'

checkStorageVersion()
