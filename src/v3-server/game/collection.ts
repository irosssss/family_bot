import { createHash } from 'node:crypto';
import { catalogV01, getCatalogItem } from '../../v3/model/catalog.js';
import { BALANCE_POLICY_V01 } from '../../v3/model/balance.js';
import type { GameWorld, OperationResult, Pet, PurchaseQuote } from '../../v3-shared/game.js';
import type { GameCommand } from './commands.js';
import { requireGame } from './errors.js';
import { addLedger, available, expectRevision, find, own, progress, type GameContext } from './world.js';

export const CATALOG_REVISION = 1;
export const CATALOG_FINGERPRINT = createHash('sha256').update(JSON.stringify(catalogV01)).digest('hex');
const expires = (now: string) => new Date(new Date(now).getTime() + 5 * 60000).toISOString();
function acquirePet(world: GameWorld, ctx: GameContext, species: string): Pet {
  const pet: Pet = { id: ctx.id(), playerId: ctx.playerId!, species, xp: '0', revision: 1, hatched: false, grown: false,
    acquiredAt: ctx.now, hatchedAt: null, corner: null };
  world.pets.push(pet);
  return pet;
}
export function collectionCommand(world: GameWorld, ctx: GameContext, command: GameCommand): OperationResult | null {
  switch (command.command) {
    case 'QuotePurchase': {
      const item = getCatalogItem(command.payload.itemId);
      requireGame(item?.acquisition === 'gold', 'INELIGIBLE');
      requireGame(item.eligibility !== 'adults' || ctx.role === 'adult', 'INELIGIBLE');
      const ownerKind = item.ownership === 'family' ? 'family' : 'player', ownerId = ownerKind === 'family' ? ctx.familyId : ctx.playerId!;
      requireGame(!world.owned.some(o => o.itemId === item.id && o.ownerKind === ownerKind && o.ownerId === ownerId), 'ALREADY_OWNED');
      const quote: PurchaseQuote = { id: ctx.id(), playerId: ctx.playerId!, itemId: item.id, offerRevision: CATALOG_REVISION,
        price: String(item.priceGold), ownerKind, ownerId, expiresAt: expires(ctx.now), catalogFingerprint: CATALOG_FINGERPRINT };
      world.quotes.push(quote);
      return { kind: 'purchase_quote', id: quote.id, revision: quote.offerRevision, details: { ...quote, title: item.title } };
    }
    case 'PurchaseItem': {
      const p = command.payload, quote = find(world.quotes, p.quoteId);
      own(quote.playerId, ctx);
      const prior = world.purchases.find(value => value.quoteId === quote.id);
      if (prior) return { kind: 'purchase', id: prior.id, revision: null };
      requireGame(quote.expiresAt > ctx.now, 'QUOTE_EXPIRED');
      const item = getCatalogItem(quote.itemId);
      requireGame(quote.offerRevision === p.expectedOfferRevision && quote.offerRevision === CATALOG_REVISION &&
        quote.catalogFingerprint === CATALOG_FINGERPRINT && item?.acquisition === 'gold' && String(item.priceGold) === quote.price, 'OFFER_CHANGED');
      requireGame(quote.ownerId === (quote.ownerKind === 'family' ? ctx.familyId : ctx.playerId) &&
        (quote.ownerKind !== 'family' || ctx.role === 'adult'), 'INELIGIBLE');
      requireGame(!world.owned.some(o => o.itemId === item.id && o.ownerKind === quote.ownerKind && o.ownerId === quote.ownerId), 'ALREADY_OWNED');
      requireGame(available(progress(world, ctx.playerId)) >= BigInt(quote.price), 'INSUFFICIENT_GOLD');
      const purchaseId = ctx.id(), ownedId = ctx.id();
      addLedger(world, ctx, { playerId: quote.playerId, kind: 'gold', delta: (-BigInt(quote.price)).toString(),
        causeKey: `purchase:${quote.id}`, settlementId: null, originalEntryId: null, goalId: null, petId: null, adventureId: null, performedOn: null });
      world.owned.push({ id: ownedId, itemId: item.id, ownerKind: quote.ownerKind, ownerId: quote.ownerId, purchaserId: quote.playerId, acquiredAt: ctx.now });
      world.purchases.push({ id: purchaseId, quoteId: quote.id, playerId: quote.playerId, itemId: item.id, price: quote.price, ownedItemId: ownedId, acquiredAt: ctx.now });
      if (item.kind === 'known_egg') acquirePet(world, ctx, item.knownPetId!);
      return { kind: 'purchase', id: purchaseId, revision: null };
    }
    case 'SelectStarterEgg': {
      const p = progress(world, ctx.playerId), item = getCatalogItem(command.payload.itemId);
      requireGame(item?.acquisition === 'starter_choice', 'INELIGIBLE');
      if (p.starterPetId) {
        const prior = find(world.pets, p.starterPetId);
        requireGame(prior.species === item.knownPetId, 'STARTER_ALREADY_CHOSEN');
        return { kind: 'pet', id: prior.id, revision: prior.revision };
      }
      requireGame(p.starterEligible, 'STARTER_NOT_READY');
      const pet = acquirePet(world, ctx, item.knownPetId!);
      p.starterPetId = pet.id; p.revision++;
      return { kind: 'pet', id: pet.id, revision: pet.revision };
    }
    case 'SelectPetXpTarget':
    case 'SelectCompanion': {
      const payload = command.payload, player = progress(world, ctx.playerId);
      expectRevision(player.revision, payload.expectedRevision);
      if (payload.petId) {
        const pet = find(world.pets, payload.petId); own(pet.playerId, ctx);
        if (command.command === 'SelectCompanion') requireGame(pet.hatched, 'PET_NOT_READY');
      }
      if (command.command === 'SelectCompanion') player.companionId = payload.petId;
      else player.petTargetId = payload.petId;
      player.revision++;
      return { kind: 'player', id: player.playerId, revision: player.revision };
    }
    case 'HatchPetEgg': {
      const p = command.payload, pet = find(world.pets, p.petId); own(pet.playerId, ctx);
      if (!pet.hatched) {
        expectRevision(pet.revision, p.expectedRevision);
        requireGame(BigInt(pet.xp) >= BigInt(BALANCE_POLICY_V01.pet.hatchXp), 'PET_NOT_READY');
        pet.hatched = true; pet.hatchedAt = ctx.now; pet.revision++;
        pet.grown = BigInt(pet.xp) >= BigInt(BALANCE_POLICY_V01.pet.hatchXp + BALANCE_POLICY_V01.pet.firstGrowthAdditionalXp);
        pet.corner = { theme: 'meadow', name: 'Уютный уголок' };
      }
      return { kind: 'pet', id: pet.id, revision: pet.revision };
    }
    case 'SavePetCorner': {
      const p = command.payload, pet = find(world.pets, p.petId); own(pet.playerId, ctx);
      expectRevision(pet.revision, p.expectedRevision); requireGame(pet.hatched && pet.corner, 'PET_NOT_READY');
      pet.corner = { theme: p.theme, name: p.name }; pet.revision++;
      return { kind: 'pet', id: pet.id, revision: pet.revision };
    }
    case 'SelectAppearance': {
      const p = command.payload, player = progress(world, ctx.playerId);
      expectRevision(player.revision, p.expectedRevision);
      if (p.ownedItemId) {
        const item = find(world.owned, p.ownedItemId);
        requireGame(item.ownerKind === 'player', 'WRONG_OWNER'); own(item.ownerId, ctx);
        const definition = getCatalogItem(item.itemId);
        requireGame(definition?.kind === (p.slot === 'outfit' ? 'outfit' : 'item'), 'INELIGIBLE');
      }
      player.appearance[p.slot] = p.ownedItemId; player.revision++;
      return { kind: 'player', id: player.playerId, revision: player.revision };
    }
    default: return null;
  }
}
