import { DEFAULT_SETTINGS, type Settings } from '@encheres/shared'
import { model, Schema, type HydratedDocument } from 'mongoose'

/** Identifiant du document unique (docs/technical/database.md). */
export const SETTINGS_ID = 'global'

export type SettingAttributes = Settings & { _id: string }

const positiveInteger = (name: keyof Settings) => ({
  type: Number,
  required: true,
  min: 1,
  validate: { validator: Number.isInteger, message: `${name} doit être un entier` },
  default: DEFAULT_SETTINGS[name],
})

const settingSchema = new Schema<SettingAttributes>(
  {
    _id: { type: String, required: true },
    defaultMinIncrement: positiveInteger('defaultMinIncrement'),
    antiSnipingMs: positiveInteger('antiSnipingMs'),
    paymentDelayMs: positiveInteger('paymentDelayMs'),
    minDurationMs: positiveInteger('minDurationMs'),
    maxDurationMs: positiveInteger('maxDurationMs'),
  },
  { versionKey: false },
)

export const Setting = model<SettingAttributes>('Setting', settingSchema, 'settings')

export type SettingDocument = HydratedDocument<SettingAttributes>
