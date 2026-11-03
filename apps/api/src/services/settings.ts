import { DEFAULT_SETTINGS, type Settings } from '@encheres/shared'
import { Setting, SETTINGS_ID } from '../models'

/**
 * Paramètres globaux (docs/domain/business-rules.md). Le document unique est créé avec ses
 * valeurs par défaut à la première lecture : une seule opération atomique, sans condition de
 * course entre deux instances ni entre deux requêtes.
 */
export async function getSettings(): Promise<Settings> {
  const setting = await Setting.findOneAndUpdate(
    { _id: SETTINGS_ID },
    { $setOnInsert: { ...DEFAULT_SETTINGS } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  ).orFail()
  return {
    defaultMinIncrement: setting.defaultMinIncrement,
    antiSnipingMs: setting.antiSnipingMs,
    paymentDelayMs: setting.paymentDelayMs,
    minDurationMs: setting.minDurationMs,
    maxDurationMs: setting.maxDurationMs,
  }
}

/** Crée les paramètres au démarrage (valeurs par défaut) s'ils n'existent pas encore. */
export async function ensureSettings(): Promise<void> {
  await getSettings()
}
