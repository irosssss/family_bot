import type { HomeScenePoint, HomeSceneRect, HomeSceneSize } from './homeSceneProjection';

export interface HomeFamilyMember {
  readonly id: string;
  readonly role: 'parent' | 'child';
  readonly archived?: boolean;
}

/** Both dimensions and the local contact are measured in authored scene pixels. */
export interface HomeCharacterCanvas {
  readonly size: HomeSceneSize;
  /** Hip/feet contact within this character canvas; not a viewport percentage. */
  readonly contact: HomeScenePoint;
}

export interface HomeStandingSlot {
  readonly standingContact: HomeScenePoint;
  readonly zIndex: number;
}

export interface HomeAdultSlot extends HomeStandingSlot {
  readonly seatedContact: HomeScenePoint;
  /** Child clothing without a seated layer needs its own reviewed standing place. */
  readonly childStandingContact: HomeScenePoint;
}

/**
 * Six logical places in one composition. Contacts for every pose are authored
 * together against the same scene, not generated from the number of people.
 */
export interface HomeFamilyStage {
  readonly sourceSize: HomeSceneSize;
  readonly adultSlots: readonly [HomeAdultSlot, HomeAdultSlot];
  readonly foregroundSlots: readonly [HomeStandingSlot, HomeStandingSlot, HomeStandingSlot, HomeStandingSlot];
  readonly adultSeated: HomeCharacterCanvas;
  readonly adultStanding: HomeCharacterCanvas;
  readonly childSeated: HomeCharacterCanvas;
  readonly childStanding: HomeCharacterCanvas;
}

export interface HomeFamilyPlacement<T> {
  readonly member: T;
  readonly slotId: string;
  readonly pose: 'standing' | 'sitting';
  readonly rect: HomeSceneRect;
  /** Hip/feet contact in source scene coordinates, ready for the common projection. */
  readonly contact: HomeScenePoint;
  readonly zIndex: number;
}

export interface HomeFamilyLayout<T> {
  readonly sourceSize: HomeSceneSize;
  /** Original roster order, even if rendering requires a different depth order. */
  readonly members: HomeFamilyPlacement<T>[];
  readonly page: number;
  readonly pageCount: number;
  readonly pageSize: 6;
  readonly total: number;
}

const PAGE_SIZE = 6;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validPoint(point: HomeScenePoint | null | undefined): point is HomeScenePoint {
  return !!point && finite(point.x) && finite(point.y);
}

function validSize(size: HomeSceneSize | null | undefined): size is HomeSceneSize {
  return !!size && finite(size.width) && finite(size.height) && size.width > 0 && size.height > 0;
}

function validCanvas(canvas: HomeCharacterCanvas | null | undefined): canvas is HomeCharacterCanvas {
  return !!canvas && validSize(canvas.size) && validPoint(canvas.contact)
    && canvas.contact.x >= 0 && canvas.contact.x <= canvas.size.width
    && canvas.contact.y >= 0 && canvas.contact.y <= canvas.size.height;
}

function validStandingSlot(slot: HomeStandingSlot | null | undefined): slot is HomeStandingSlot {
  return !!slot && validPoint(slot.standingContact) && Number.isSafeInteger(slot.zIndex);
}

function validStage(stage: HomeFamilyStage | null | undefined): stage is HomeFamilyStage {
  return !!stage && validSize(stage.sourceSize)
    && Array.isArray(stage.adultSlots) && stage.adultSlots.length === 2
    && Array.from(stage.adultSlots).every(slot => validPoint(slot?.seatedContact)
      && validPoint(slot?.childStandingContact) && validStandingSlot(slot))
    && Array.isArray(stage.foregroundSlots) && stage.foregroundSlots.length === 4
    && Array.from(stage.foregroundSlots).every(validStandingSlot)
    && validCanvas(stage.adultSeated) && validCanvas(stage.adultStanding)
    && validCanvas(stage.childSeated) && validCanvas(stage.childStanding);
}

function midpoint(first: HomeScenePoint, second: HomeScenePoint): HomeScenePoint {
  // Divide first, so averaging two large finite coordinates does not overflow.
  return { x: first.x / 2 + second.x / 2, y: first.y / 2 + second.y / 2 };
}

interface Assignment {
  slotId: string;
  slot: HomeStandingSlot;
  adultSlot?: HomeAdultSlot;
}

/**
 * Paginates once, assigns all members once, then selects their compatible pose.
 * A clothing change only switches that member's authored seated/fallback geometry;
 * it cannot change anyone's page, logical place, equipment or identity. Canvas
 * sizes come from the stage's role/pose metrics, never the size of the roster.
 *
 * Parents prefer the adult pair, children the foreground. Unused places remain
 * available to either role, so parent-only and child-only groups still fit six.
 * Children using the adult pair sit only with a compatible outfit; otherwise
 * their separate authored childStandingContact is used, not the adult fallback.
 * A single visible parent is centered on the adult pair, for either supported pose.
 * No NPCs, pets or decoration are created to occupy unused places.
 *
 * Null means malformed stage/active roster or numeric overflow. This utility does
 * not decide artistic overlap/crop safety; those require the actual scene review.
 */
export function getHomeFamilyLayout<T extends HomeFamilyMember>(
  roster: readonly T[],
  requestedPage: number,
  stage: HomeFamilyStage,
  canSit: (member: T) => boolean,
): HomeFamilyLayout<T> | null {
  if (!Array.isArray(roster) || !validStage(stage) || typeof canSit !== 'function') return null;
  const active: T[] = [];
  const ids = new Set<string>();
  for (const member of roster) {
    if (!member) return null;
    if (member.archived === true) continue;
    if (typeof member.id !== 'string' || !member.id.trim() || ids.has(member.id)
      || (member.role !== 'parent' && member.role !== 'child')) return null;
    ids.add(member.id); active.push(member);
  }
  const pageCount = Math.max(1, Math.ceil(active.length / PAGE_SIZE));
  const page = Math.min(Math.max(0, finite(requestedPage) ? Math.floor(requestedPage) : 0), pageCount - 1);
  const visible = active.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const parents = visible.filter(member => member.role === 'parent');
  const children = visible.filter(member => member.role === 'child');
  const assignments = new Map<string, Assignment>();
  const adultAssignments = stage.adultSlots.map((slot, index) => ({ slot, adultSlot: slot, slotId: `adult-${index}` }));
  const foregroundAssignments = stage.foregroundSlots.map((slot, index) => ({ slot, slotId: `foreground-${index}` }));

  parents.forEach((member, index) => {
    assignments.set(member.id, index < 2 ? adultAssignments[index] : foregroundAssignments[index - 2]);
  });
  const availableForChildren: Assignment[] = [
    ...foregroundAssignments.slice(Math.max(0, parents.length - 2)),
    ...adultAssignments.slice(Math.min(parents.length, 2)),
  ];
  children.forEach((member, index) => assignments.set(member.id, availableForChildren[index]));

  const members: HomeFamilyPlacement<T>[] = [];
  for (const member of visible) {
    const assignment = assignments.get(member.id)!;
    const sitting = !!assignment.adultSlot && canSit(member) === true;
    const canvas = member.role === 'child'
      ? sitting ? stage.childSeated : stage.childStanding
      : sitting ? stage.adultSeated : stage.adultStanding;
    let contact = sitting ? assignment.adultSlot!.seatedContact
      : member.role === 'child' && assignment.adultSlot ? assignment.adultSlot.childStandingContact
      : assignment.slot.standingContact;
    if (member.role === 'parent' && parents.length === 1) {
      contact = midpoint(
        sitting ? stage.adultSlots[0].seatedContact : stage.adultSlots[0].standingContact,
        sitting ? stage.adultSlots[1].seatedContact : stage.adultSlots[1].standingContact,
      );
    }
    const rect = {
      x: contact.x - canvas.contact.x, y: contact.y - canvas.contact.y,
      width: canvas.size.width, height: canvas.size.height,
    };
    if (![rect.x, rect.y, rect.x + rect.width, rect.y + rect.height].every(finite)) return null;
    members.push({ member, slotId: assignment.slotId, pose: sitting ? 'sitting' : 'standing',
      rect, contact: { x: contact.x, y: contact.y }, zIndex: assignment.slot.zIndex });
  }
  return { sourceSize: { ...stage.sourceSize }, members, page, pageCount, pageSize: PAGE_SIZE, total: active.length };
}
