import type {
  AuctionStatus,
  ManagedAuction,
  Page,
  PublicAuction,
  Settings,
  createAuctionInputSchema,
  listAuctionsInputSchema,
  updateAuctionInputSchema,
} from '@encheres/shared'
import { Types, type PipelineStage } from 'mongoose'
import type { z } from 'zod'
import type { Config } from '../config/env'
import { AppError } from '../errors'
import type { Storage } from '../infra/storage'
import { Auction, User, type AuctionAttributes, type UserDocument } from '../models'
import { enqueueEmail } from './email-queue'
import { buildWebLink } from './links'
import { getSettings } from './settings'

type AuctionRecord = AuctionAttributes & { _id: Types.ObjectId }

type AuctionContent = Omit<z.output<typeof createAuctionInputSchema>, 'minIncrement'> & {
  minIncrement?: number | undefined
}

/** Statuts visibles par tous. Un `draft` attend sa validation ; un `cancelled` est vu de son vendeur. */
export const PUBLIC_STATUSES: AuctionStatus[] = ['scheduled', 'live', 'ended', 'paid', 'unpaid']

const LIST_STATUSES: Record<z.output<typeof listAuctionsInputSchema>['filter'], AuctionStatus[]> = {
  live: ['live'],
  upcoming: ['scheduled'],
  ended: ['ended', 'paid', 'unpaid'],
}

function toObjectId(id: string): Types.ObjectId {
  // Les entrées sont validées par Zod avant d'arriver ici ; ce garde-fou protège les appels internes.
  if (!Types.ObjectId.isValid(id)) throw new AppError('AUCTION_NOT_FOUND')
  return new Types.ObjectId(id)
}

/** Noms d'affichage des vendeurs et des gagnants : jamais d'email. */
async function sellerNames(records: AuctionRecord[]): Promise<Map<string, string>> {
  const ids = new Set<string>()
  for (const record of records) {
    ids.add(record.sellerId.toString())
    if (record.winnerId != null) ids.add(record.winnerId.toString())
  }
  const users = await User.find({ _id: { $in: [...ids] } }, { name: 1 })
  return new Map(users.map((user) => [user._id.toString(), user.name]))
}

function toPublic(
  record: AuctionRecord,
  names: Map<string, string>,
  storage: Storage,
): PublicAuction {
  return {
    id: record._id.toString(),
    title: record.title,
    description: record.description,
    images: record.images.map((key) => ({
      key,
      url: storage.url(key),
      thumbUrl: storage.url(key, 'thumb'),
    })),
    startingPrice: record.startingPrice,
    minIncrement: record.minIncrement,
    currentPrice: record.currentPrice,
    nextMinBid: record.nextMinBid,
    bidCount: record.bidCount,
    startsAt: record.startsAt.toISOString(),
    endsAt: record.endsAt.toISOString(),
    status: record.status,
    sellerId: record.sellerId.toString(),
    sellerName: names.get(record.sellerId.toString()) ?? '',
    winner:
      record.winnerId == null
        ? null
        : { id: record.winnerId.toString(), name: names.get(record.winnerId.toString()) ?? '' },
  }
}

export async function presentPublic(
  records: AuctionRecord[],
  storage: Storage,
): Promise<PublicAuction[]> {
  const names = await sellerNames(records)
  return records.map((record) => toPublic(record, names, storage))
}

async function presentManaged(
  records: AuctionRecord[],
  storage: Storage,
): Promise<ManagedAuction[]> {
  const names = await sellerNames(records)
  return records.map((record) => ({
    ...toPublic(record, names, storage),
    cancelReason: record.cancelReason,
    createdAt: record.createdAt.toISOString(),
  }))
}

/**
 * Règles de dates de docs/domain/business-rules.md : début dans le futur, durée comprise entre
 * `minDurationMs` et `maxDurationMs` (paramètres lus en base au moment de la demande).
 */
export function assertSchedule(
  settings: Pick<Settings, 'minDurationMs' | 'maxDurationMs'>,
  startsAt: Date,
  endsAt: Date,
  now: Date,
): void {
  const duration = endsAt.getTime() - startsAt.getTime()
  if (
    startsAt.getTime() <= now.getTime() ||
    duration < settings.minDurationMs ||
    duration > settings.maxDurationMs
  ) {
    throw new AppError('INVALID_DATES')
  }
}

/** Une clé de photo doit désigner un fichier que le serveur a lui-même enregistré. */
async function assertImagesExist(storage: Storage, keys: string[]): Promise<void> {
  const found = await Promise.all(keys.map((key) => storage.exists(key)))
  if (found.includes(false)) throw new AppError('INVALID_IMAGE')
}

function contentFields(content: AuctionContent, settings: Settings) {
  const minIncrement = content.minIncrement ?? settings.defaultMinIncrement
  return {
    title: content.title,
    description: content.description,
    images: content.images,
    startingPrice: content.startingPrice,
    minIncrement,
    // Sans offre, la prochaine offre minimale est le prix de départ (business-rules.md).
    nextMinBid: content.startingPrice,
    startsAt: content.startsAt,
    endsAt: content.endsAt,
  }
}

/** Paramètres que le formulaire de création doit connaître. */
export async function getAuctionRules() {
  const { defaultMinIncrement, minDurationMs, maxDurationMs } = await getSettings()
  return { defaultMinIncrement, minDurationMs, maxDurationMs }
}

/** Crée une enchère en `draft` : elle part directement en validation (auction-lifecycle.md). */
export async function createAuction(
  storage: Storage,
  seller: UserDocument,
  content: AuctionContent,
  now: Date = new Date(),
): Promise<ManagedAuction> {
  const settings = await getSettings()
  assertSchedule(settings, content.startsAt, content.endsAt, now)
  await assertImagesExist(storage, content.images)

  const auction = await Auction.create({
    ...contentFields(content, settings),
    sellerId: seller._id,
    status: 'draft',
  })
  const [managed] = await presentManaged([auction], storage)
  return managed as ManagedAuction
}

/** Distingue « n'existe pas / pas à vous » d'« état qui ne le permet pas » après un refus. */
async function explainRefusal(id: Types.ObjectId, sellerId: Types.ObjectId): Promise<AppError> {
  const exists = await Auction.exists({ _id: id, sellerId })
  return new AppError(exists === null ? 'AUCTION_NOT_FOUND' : 'AUCTION_STATE_INVALID')
}

/**
 * Modifie une enchère `draft` ou `scheduled` de son vendeur. Une enchère `scheduled` repasse en
 * `draft` : elle doit être validée de nouveau. Une enchère `live` n'est jamais modifiable.
 */
export async function updateAuction(
  storage: Storage,
  seller: UserDocument,
  input: z.output<typeof updateAuctionInputSchema>,
  now: Date = new Date(),
): Promise<ManagedAuction> {
  const id = toObjectId(input.id)
  const settings = await getSettings()
  assertSchedule(settings, input.startsAt, input.endsAt, now)
  await assertImagesExist(storage, input.images)

  // Une seule opération : le statut est vérifié au moment de l'écriture, pas avant.
  const before = await Auction.findOneAndUpdate(
    { _id: id, sellerId: seller._id, status: { $in: ['draft', 'scheduled'] } },
    { $set: { ...contentFields(input, settings), status: 'draft', cancelReason: null } },
    { returnDocument: 'before' },
  )
  if (before === null) throw await explainRefusal(id, seller._id)

  // Photos retirées : leurs fichiers sont supprimés (ADR-007).
  const removed = before.images.filter((key) => !input.images.includes(key))
  await Promise.all(removed.map((key) => storage.delete(key)))

  const updated = await Auction.findById(id).orFail()
  const [managed] = await presentManaged([updated], storage)
  return managed as ManagedAuction
}

/** Statuts depuis lesquels on peut remettre en vente (docs/domain/workflows/auction-lifecycle.md). */
function canRelist(record: AuctionRecord): boolean {
  if (record.status === 'unpaid' || record.status === 'cancelled') return true
  return record.status === 'ended' && record.winnerId == null
}

/**
 * Remise en vente : une **copie** de l'enchère dans un nouveau `draft`, sans offres. Le document
 * d'origine n'est jamais réutilisé ni modifié, pour garder l'historique. Les photos sont copiées
 * sous de nouvelles clés : retirer une photo de la copie ne doit pas toucher l'originale.
 */
export async function relistAuction(
  storage: Storage,
  seller: UserDocument,
  input: { id: string; startsAt: Date; endsAt: Date },
  now: Date = new Date(),
): Promise<ManagedAuction> {
  const original = await Auction.findOne({ _id: toObjectId(input.id), sellerId: seller._id })
  if (original === null) throw new AppError('AUCTION_NOT_FOUND')
  if (!canRelist(original)) throw new AppError('AUCTION_STATE_INVALID')

  const settings = await getSettings()
  assertSchedule(settings, input.startsAt, input.endsAt, now)

  const images = await Promise.all(original.images.map((key) => storage.copy(key)))
  const copy = await Auction.create({
    sellerId: seller._id,
    title: original.title,
    description: original.description,
    images,
    startingPrice: original.startingPrice,
    minIncrement: original.minIncrement,
    nextMinBid: original.startingPrice,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    status: 'draft',
  })
  const [managed] = await presentManaged([copy], storage)
  return managed as ManagedAuction
}

/** Le vendeur annule une enchère `draft` ou `scheduled` (jamais une `live`). */
export async function cancelOwnAuction(
  storage: Storage,
  seller: UserDocument,
  id: string,
): Promise<ManagedAuction> {
  const auctionId = toObjectId(id)
  const cancelled = await Auction.findOneAndUpdate(
    { _id: auctionId, sellerId: seller._id, status: { $in: ['draft', 'scheduled'] } },
    { $set: { status: 'cancelled', cancelReason: null } },
    { returnDocument: 'after' },
  )
  if (cancelled === null) throw await explainRefusal(auctionId, seller._id)
  const [managed] = await presentManaged([cancelled], storage)
  return managed as ManagedAuction
}

function pageOf<Item>(items: Item[], total: number, page: number, limit: number): Page<Item> {
  return { items, total, page, limit }
}

/** Une enchère du vendeur, tous statuts confondus (formulaire de modification). */
export async function getOwnAuction(
  storage: Storage,
  seller: UserDocument,
  id: string,
): Promise<ManagedAuction> {
  const auction = await Auction.findOne({ _id: toObjectId(id), sellerId: seller._id })
  if (auction === null) throw new AppError('AUCTION_NOT_FOUND')
  const [managed] = await presentManaged([auction], storage)
  return managed as ManagedAuction
}

export async function listOwnAuctions(
  storage: Storage,
  seller: UserDocument,
  input: { page: number; limit: number; status?: AuctionStatus | undefined },
): Promise<Page<ManagedAuction>> {
  const filter = {
    sellerId: seller._id,
    ...(input.status === undefined ? {} : { status: input.status }),
  }
  const [records, total] = await Promise.all([
    Auction.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((input.page - 1) * input.limit)
      .limit(input.limit),
    Auction.countDocuments(filter),
  ])
  return pageOf(await presentManaged(records, storage), total, input.page, input.limit)
}

/** Liste publique : jamais de `draft`, ni de `cancelled`. */
export async function listPublicAuctions(
  storage: Storage,
  input: z.output<typeof listAuctionsInputSchema>,
): Promise<Page<PublicAuction>> {
  const match = { status: { $in: LIST_STATUSES[input.filter] } }
  const sorts: Record<z.output<typeof listAuctionsInputSchema>['sort'], Record<string, 1 | -1>> = {
    endingSoon: { endsAt: 1, _id: 1 },
    // Le prix affiché : l'offre courante, ou le prix de départ tant qu'il n'y a pas d'offre.
    priceAsc: { price: 1, _id: 1 },
    priceDesc: { price: -1, _id: 1 },
    recent: { createdAt: -1, _id: -1 },
  }
  const pipeline: PipelineStage[] = [
    { $match: match },
    { $addFields: { price: { $ifNull: ['$currentPrice', '$startingPrice'] } } },
    { $sort: sorts[input.sort] },
    { $skip: (input.page - 1) * input.limit },
    { $limit: input.limit },
  ]
  const [records, total] = await Promise.all([
    Auction.aggregate<AuctionRecord>(pipeline),
    Auction.countDocuments(match),
  ])
  return pageOf(await presentPublic(records, storage), total, input.page, input.limit)
}

export async function getPublicAuction(storage: Storage, id: string): Promise<PublicAuction> {
  const record = await Auction.findOne({
    _id: toObjectId(id),
    status: { $in: PUBLIC_STATUSES },
  })
  if (record === null) throw new AppError('AUCTION_NOT_FOUND')
  const [auction] = await presentPublic([record], storage)
  return auction as PublicAuction
}

/** Enchères `draft`, les plus anciennes d'abord : toutes attendent la validation de l'admin. */
export async function listPendingAuctions(
  storage: Storage,
  input: { page: number; limit: number },
): Promise<Page<ManagedAuction>> {
  const [records, total] = await Promise.all([
    Auction.find({ status: 'draft' })
      .sort({ createdAt: 1, _id: 1 })
      .skip((input.page - 1) * input.limit)
      .limit(input.limit),
    Auction.countDocuments({ status: 'draft' }),
  ])
  return pageOf(await presentManaged(records, storage), total, input.page, input.limit)
}

async function notifySeller(
  record: AuctionRecord,
  send: (seller: { email: string; name: string }) => Promise<void>,
): Promise<void> {
  const seller = await User.findById(record.sellerId)
  // Un vendeur anonymisé n'a plus d'adresse.
  if (seller?.email != null) await send({ email: seller.email, name: seller.name })
}

/** L'admin valide : `draft → scheduled`, seulement si le début est encore dans le futur. */
export async function validateAuction(
  storage: Storage,
  config: Pick<Config, 'webOrigin'>,
  id: string,
  now: Date = new Date(),
): Promise<ManagedAuction> {
  const auctionId = toObjectId(id)
  const validated = await Auction.findOneAndUpdate(
    { _id: auctionId, status: 'draft', startsAt: { $gt: now } },
    { $set: { status: 'scheduled', cancelReason: null } },
    { returnDocument: 'after' },
  )
  if (validated === null) {
    const current = await Auction.findById(auctionId)
    if (current === null) throw new AppError('AUCTION_NOT_FOUND')
    // Le vendeur a laissé passer la date de début : l'admin doit refuser, le vendeur recréer.
    throw new AppError(current.status === 'draft' ? 'INVALID_DATES' : 'AUCTION_STATE_INVALID')
  }

  await notifySeller(validated, ({ email, name }) =>
    enqueueEmail(email, 'auction-validated', {
      name,
      title: validated.title,
      link: buildWebLink(config, `/auctions/${validated._id.toString()}`),
    }),
  )
  const [managed] = await presentManaged([validated], storage)
  return managed as ManagedAuction
}

/** L'admin refuse : `draft → cancelled`, avec un motif obligatoire montré au vendeur. */
export async function rejectAuction(
  storage: Storage,
  config: Pick<Config, 'webOrigin'>,
  id: string,
  reason: string,
): Promise<ManagedAuction> {
  const auctionId = toObjectId(id)
  const rejected = await Auction.findOneAndUpdate(
    { _id: auctionId, status: 'draft' },
    { $set: { status: 'cancelled', cancelReason: reason } },
    { returnDocument: 'after' },
  )
  if (rejected === null) {
    const exists = await Auction.exists({ _id: auctionId })
    throw new AppError(exists === null ? 'AUCTION_NOT_FOUND' : 'AUCTION_STATE_INVALID')
  }

  await notifySeller(rejected, ({ email, name }) =>
    enqueueEmail(email, 'auction-rejected', {
      name,
      title: rejected.title,
      reason,
      link: buildWebLink(config, '/seller/auctions'),
    }),
  )
  const [managed] = await presentManaged([rejected], storage)
  return managed as ManagedAuction
}

/** Passe `scheduled → live` les enchères dont `startsAt` est atteint (ADR-008). */
export async function openDueAuctions(now: Date = new Date()): Promise<number> {
  let opened = 0
  for (;;) {
    // La condition sur le statut et la date rend le passage idempotent : un second passage,
    // ou une autre instance, ne retrouve pas l'enchère.
    const auction = await Auction.findOneAndUpdate(
      { status: 'scheduled', startsAt: { $lte: now } },
      { $set: { status: 'live' } },
      { sort: { startsAt: 1 } },
    )
    if (auction === null) return opened
    opened += 1
  }
}
