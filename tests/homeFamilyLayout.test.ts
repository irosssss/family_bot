import { describe, expect, it, vi } from 'vitest';
import { getHomeFamilyLayout, type HomeFamilyMember, type HomeFamilyStage } from '../src/demo/homeFamilyLayout';
import { getHomeSceneProjection } from '../src/demo/homeSceneProjection';

// Synthetic geometry, not artistic coordinates for any generated room.
const stage: HomeFamilyStage = {
  sourceSize: { width: 1200, height: 800 },
  adultSlots: [
    { seatedContact: { x: 500, y: 430 }, standingContact: { x: 430, y: 570 }, childStandingContact: { x: 330, y: 490 }, zIndex: 10 },
    { seatedContact: { x: 700, y: 430 }, standingContact: { x: 770, y: 570 }, childStandingContact: { x: 870, y: 490 }, zIndex: 11 },
  ],
  foregroundSlots: [
    { standingContact: { x: 530, y: 650 }, zIndex: 20 },
    { standingContact: { x: 670, y: 650 }, zIndex: 21 },
    { standingContact: { x: 370, y: 660 }, zIndex: 22 },
    { standingContact: { x: 830, y: 660 }, zIndex: 23 },
  ],
  adultSeated: { size: { width: 160, height: 200 }, contact: { x: 80, y: 145 } },
  adultStanding: { size: { width: 160, height: 200 }, contact: { x: 80, y: 190 } },
  childSeated: { size: { width: 128, height: 160 }, contact: { x: 64, y: 116 } },
  childStanding: { size: { width: 128, height: 160 }, contact: { x: 64, y: 152 } },
};
const roster = (count: number, parentCount = 2): HomeFamilyMember[] => Array.from({ length: count }, (_, index) => ({
  id: `member-${index}`, role: index < parentCount ? 'parent' : 'child',
}));
const build = (people: readonly HomeFamilyMember[], page = 0, canSit = () => true) => getHomeFamilyLayout(people, page, stage, canSit)!;

describe('one family group in authored home coordinates', () => {
  it.each([0, 1, 2, 4, 5, 6, 8, 13])('makes all %s members reachable exactly once, with at most six on a page', count => {
    const people = roster(count);
    const first = build(people);
    const pages = Array.from({ length: first.pageCount }, (_, page) => build(people, page));
    const seen = pages.flatMap(layout => layout.members.map(item => item.member.id));
    expect(seen).toEqual(people.map(person => person.id));
    expect(new Set(seen).size).toBe(count);
    expect(first.total).toBe(count);
    for (const page of pages) {
      expect(page.members.length).toBeLessThanOrEqual(6);
      expect(new Set(page.members.map(item => item.slotId)).size).toBe(page.members.length);
    }
  });

  it('keeps the original member references and order instead of sorting parents before children', () => {
    const people = [roster(4)[2], roster(4)[0], roster(4)[3], roster(4)[1]];
    const result = build(people);
    expect(result.members.map(item => item.member)).toEqual(people);
    result.members.forEach((item, index) => expect(item.member).toBe(people[index]));
    expect(result.members.map(item => item.slotId)).toEqual(['foreground-0', 'adult-0', 'foreground-1', 'adult-1']);
  });

  it('uses the authored adult pair and foreground together for a family of two parents and two children', () => {
    const result = build(roster(4));
    expect(result.members.map(item => item.pose)).toEqual(['sitting', 'sitting', 'standing', 'standing']);
    expect(result.members[0].contact).toEqual(stage.adultSlots[0].seatedContact);
    expect(result.members[1].contact).toEqual(stage.adultSlots[1].seatedContact);
    expect(result.members[2].contact).toEqual(stage.foregroundSlots[0].standingContact);
    expect(result.members[3].contact).toEqual(stage.foregroundSlots[1].standingContact);
    expect(result.members[0].rect).toEqual({ x: 420, y: 285, width: 160, height: 200 });
  });

  it.each([true, false])('centers a single parent between the adult contacts, with sitting support=%s', supported => {
    const people = roster(4, 1);
    const result = build(people, 0, () => supported);
    expect(result.members[0].contact).toEqual(supported ? { x: 600, y: 430 } : { x: 600, y: 570 });
    expect(result.members[0].pose).toBe(supported ? 'sitting' : 'standing');
    expect(result.members.map(item => item.member.id)).toEqual(people.map(member => member.id));
    expect(result.members).toHaveLength(4);
  });

  it.each([1, 2, 4, 5, 6, 8])('supports a family with only %s parents, without invented children', count => {
    const people = roster(count, count);
    const seen = Array.from({ length: build(people).pageCount }, (_, page) => build(people, page));
    expect(seen.flatMap(page => page.members.map(item => item.member.id))).toEqual(people.map(member => member.id));
    expect(build(people).members.filter(item => item.pose === 'sitting')).toHaveLength(Math.min(count, 2));
    expect(seen.flatMap(page => page.members).every(item => item.rect.width === 160 && item.rect.height === 200)).toBe(true);
  });

  it.each([1, 2, 4, 5, 6, 8])('supports a family with only %s children at their authored scale and compatible poses', count => {
    const people = roster(count, 0);
    const canSit = vi.fn(() => true);
    const pages = Array.from({ length: build(people).pageCount }, (_, page) => getHomeFamilyLayout(people, page, stage, canSit)!);
    const members = pages.flatMap(page => page.members);
    expect(members.map(item => item.member.id)).toEqual(people.map(member => member.id));
    expect(members.every(item => item.rect.width === 128 && item.rect.height === 160)).toBe(true);
    expect(members.every(item => item.pose === (item.slotId.startsWith('adult-') ? 'sitting' : 'standing'))).toBe(true);
    expect(canSit).toHaveBeenCalledTimes(members.filter(item => item.slotId.startsWith('adult-')).length);
  });

  it('uses explicit standing fallback only for the incompatible parent without relocating anyone else', () => {
    const people = roster(6);
    const before = build(people);
    const after = getHomeFamilyLayout(people, 0, stage, member => member.id !== people[0].id)!;
    expect(after.members[0].pose).toBe('standing');
    expect(after.members[0].slotId).toBe(before.members[0].slotId);
    expect(after.members[0].contact).toEqual(stage.adultSlots[0].standingContact);
    expect(after.members[0].rect).toEqual({ x: 350, y: 380, width: 160, height: 200 });
    expect(after.members.slice(1)).toEqual(before.members.slice(1));
    expect(after.page).toBe(before.page);
  });

  it('seats the last two children of a full child-only group using child-sized hip geometry', () => {
    const people = roster(6, 0);
    const result = build(people);
    expect(result.members.map(item => item.pose)).toEqual(['standing', 'standing', 'standing', 'standing', 'sitting', 'sitting']);
    expect(result.members.map(item => item.slotId)).toEqual(['foreground-0', 'foreground-1', 'foreground-2', 'foreground-3', 'adult-0', 'adult-1']);
    expect(result.members[4].contact).toEqual(stage.adultSlots[0].seatedContact);
    expect(result.members[4].rect).toEqual({ x: 436, y: 314, width: 128, height: 160 });
    expect(result.members[5].contact).toEqual(stage.adultSlots[1].seatedContact);
    expect(result.members[5].rect).toEqual({ x: 636, y: 314, width: 128, height: 160 });
    expect(result.members.map(item => item.member)).toEqual(people);
    for (let i = 0; i < result.members.length; i++) {
      for (let j = i + 1; j < result.members.length; j++) {
        const a = result.members[i].rect; const b = result.members[j].rect;
        const intersection = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
          * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
        // This authored fixture has no overlap; actual stage art still needs visual review.
        expect(intersection).toBe(0);
      }
    }
  });

  it('uses a separate child standing fallback for custom gear and keeps everyone else unchanged', () => {
    const people = roster(6, 0).map(member => ({ ...member, appearance: { bodyId: 'built-in-body' } }));
    const before = getHomeFamilyLayout(people, 0, stage, () => true)!;
    const changed = people.map((member, index) => index === 4 ? { ...member, appearance: { bodyId: 'custom-standing-coat' } } : member);
    const after = getHomeFamilyLayout(changed, 0, stage, member => member.appearance.bodyId !== 'custom-standing-coat')!;
    expect(after.members[4]).toMatchObject({ pose: 'standing', slotId: 'adult-0',
      contact: stage.adultSlots[0].childStandingContact,
      rect: { x: 266, y: 338, width: 128, height: 160 },
    });
    expect(after.members[4].contact).not.toEqual(stage.adultSlots[0].standingContact);
    expect(after.members[4].member).toBe(changed[4]);
    expect(after.members[4].member.appearance.bodyId).toBe('custom-standing-coat');
    expect(after.members.filter((_, index) => index !== 4)).toEqual(before.members.filter((_, index) => index !== 4));
    expect(after.members.map(item => item.member.id)).toEqual(before.members.map(item => item.member.id));
    expect(after.members.map(item => item.slotId)).toEqual(before.members.map(item => item.slotId));
  });

  it('keeps all thirteen people reachable when group two contains six children', () => {
    const people = roster(13, 2);
    const second = build(people, 1);
    expect(second.members.every(item => item.member.role === 'child')).toBe(true);
    expect(second.members.map(item => item.pose)).toEqual(['standing', 'standing', 'standing', 'standing', 'sitting', 'sitting']);
    expect(second.members.map(item => item.member.id)).toEqual(people.slice(6, 12).map(member => member.id));
    const pages = Array.from({ length: second.pageCount }, (_, page) => build(people, page));
    const seen = pages.flatMap(page => page.members.map(item => item.member.id));
    expect(seen).toEqual(people.map(member => member.id));
    expect(new Set(seen).size).toBe(13);
  });

  it('assigns unique logical places for every parent/child mix up to six, regardless of sitting support', () => {
    for (let count = 0; count <= 6; count++) {
      for (let parents = 0; parents <= count; parents++) {
        const people = roster(count, parents);
        for (const supported of [true, false]) {
          const result = build(people, 0, () => supported);
          expect(result.members.map(item => item.member.id)).toEqual(people.map(member => member.id));
          expect(new Set(result.members.map(item => item.slotId)).size).toBe(count);
          expect(result.members.every(item => item.pose === 'standing' || item.slotId.startsWith('adult-'))).toBe(true);
        }
      }
    }
  });

  it('keeps pages, ID assignment and everyone else stable when appearance or selected profile changes', () => {
    const people = roster(8).map((member, index) => ({ ...member, appearance: { bodyId: `custom-${index}` }, selected: false }));
    const before = getHomeFamilyLayout(people, 0, stage, () => false)!;
    const changed = people.map((member, index) => index === 0 ? { ...member, appearance: { bodyId: 'other-body' }, selected: true } : member);
    const after = getHomeFamilyLayout(changed, 0, stage, () => false)!;
    expect(after.members.map(({ member: _member, ...placement }) => placement)).toEqual(before.members.map(({ member: _member, ...placement }) => placement));
    expect(after.members[0].member.appearance.bodyId).toBe('other-body');
    expect(changed[0].appearance.bodyId).toBe('other-body');
    expect(after.pageCount).toBe(2);
  });

  it('excludes archived members before pagination and clamps a page after the roster shrinks', () => {
    const people = roster(13).map((member, index) => ({ ...member, archived: index > 3 }));
    const result = build(people, 2);
    expect(result.members.map(item => item.member.id)).toEqual(people.slice(0, 4).map(member => member.id));
    expect(result).toMatchObject({ page: 0, pageCount: 1, total: 4, pageSize: 6 });
  });

  it.each([-3, NaN, Infinity, -Infinity, undefined, null, '1'])('normalizes invalid page %s without losing members', requestedPage => {
    const result = getHomeFamilyLayout(roster(8), requestedPage as number, stage, () => true)!;
    expect(result.page).toBe(0);
    expect(result.members).toHaveLength(6);
  });

  it('floors fractional pages and clamps excessive positive pages', () => {
    expect(build(roster(13), 1.9).page).toBe(1);
    expect(build(roster(13), 999).page).toBe(2);
  });

  it('emits finite geometry and retains contact alignment through the shared mobile/desktop projection', () => {
    const result = build(roster(6));
    for (const item of result.members) {
      expect(Object.values(item.rect).every(Number.isFinite)).toBe(true);
      expect(Object.values(item.contact).every(Number.isFinite)).toBe(true);
    }
    for (const viewport of [{ width: 375, height: 500 }, { width: 390, height: 520 }, { width: 1280, height: 720 }]) {
      const projected = getHomeSceneProjection({ source: result.sourceSize, viewport, fit: 'cover',
        anchors: Object.fromEntries(result.members.map(item => [item.member.id, item.contact])),
        rectangles: Object.fromEntries(result.members.map(item => [item.member.id, item.rect])),
      })!;
      for (const item of result.members) {
        const canvas = item.member.role === 'child'
          ? item.pose === 'sitting' ? stage.childSeated : stage.childStanding
          : item.pose === 'sitting' ? stage.adultSeated : stage.adultStanding;
        const rect = projected.rectangles[item.member.id];
        const contact = projected.anchors[item.member.id];
        expect(rect.x + canvas.contact.x * projected.scale).toBeCloseTo(contact.x);
        expect(rect.y + canvas.contact.y * projected.scale).toBeCloseTo(contact.y);
      }
    }
  });

  it('does not mutate stage, roster, appearance or a caller-owned anchor', () => {
    const localStage = structuredClone(stage);
    const people = roster(4).map(member => ({ ...member, appearance: { bodyId: 'custom-coat' } }));
    const before = structuredClone({ stage: localStage, people });
    const result = getHomeFamilyLayout(people, 0, localStage, () => false)!;
    expect({ stage: localStage, people }).toEqual(before);
    expect(result.sourceSize).not.toBe(localStage.sourceSize);
    expect(result.members[0].contact).not.toBe(localStage.adultSlots[0].standingContact);
  });

  it('rejects duplicate active IDs and malformed active roles rather than silently dropping a person', () => {
    expect(build([{ id: 'same', role: 'parent' }, { id: 'same', role: 'child' }])).toBeNull();
    expect(build([{ id: '', role: 'child' }])).toBeNull();
    expect(build([{ id: 'bad-role', role: 'npc' } as unknown as HomeFamilyMember])).toBeNull();
    expect(getHomeFamilyLayout(null as unknown as HomeFamilyMember[], 0, stage, () => true)).toBeNull();
    expect(build([null as unknown as HomeFamilyMember])).toBeNull();
  });

  it('rejects malformed stage geometry, missing authored slots or contacts outside the local canvas', () => {
    const invalid = [null, {}, { ...stage, sourceSize: { width: 0, height: 800 } },
      { ...stage, sourceSize: { width: '1200', height: 800 } }, { ...stage, adultSlots: [] },
      { ...stage, foregroundSlots: stage.foregroundSlots.slice(0, 3) },
      { ...stage, adultSlots: [undefined, stage.adultSlots[1]] },
      { ...stage, adultStanding: { size: { width: 160, height: NaN }, contact: { x: 80, y: 190 } } },
      { ...stage, childSeated: undefined },
      { ...stage, childSeated: { size: { width: 128, height: 160 }, contact: { x: 64, y: 161 } } },
      { ...stage, childStanding: { size: { width: 128, height: 160 }, contact: { x: -1, y: 152 } } },
      { ...stage, adultSeated: { size: { width: 160, height: 200 }, contact: { x: 80, y: 201 } } },
      { ...stage, adultSlots: [{ ...stage.adultSlots[0], seatedContact: { x: Infinity, y: 430 } }, stage.adultSlots[1]] },
      { ...stage, adultSlots: [{ ...stage.adultSlots[0], childStandingContact: undefined }, stage.adultSlots[1]] },
      { ...stage, adultSlots: [{ ...stage.adultSlots[0], childStandingContact: { x: NaN, y: 490 } }, stage.adultSlots[1]] },
      { ...stage, adultSlots: [{ ...stage.adultSlots[0], zIndex: 1.5 }, stage.adultSlots[1]] },
    ];
    for (const candidate of invalid) expect(getHomeFamilyLayout(roster(4), 0, candidate as HomeFamilyStage, () => true)).toBeNull();
  });

  it('rejects numeric overflow instead of emitting invalid CSS coordinates', () => {
    const invalid = { ...stage, adultSlots: [
      { ...stage.adultSlots[0], seatedContact: { x: -Number.MAX_VALUE, y: 430 } }, stage.adultSlots[1],
    ], adultSeated: { size: { width: Number.MAX_VALUE, height: 200 }, contact: { x: Number.MAX_VALUE, y: 145 } } } as HomeFamilyStage;
    expect(getHomeFamilyLayout(roster(2), 0, invalid, () => true)).toBeNull();
  });
});
