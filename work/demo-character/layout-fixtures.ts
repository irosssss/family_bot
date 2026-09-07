import { writeFileSync } from 'node:fs';
import { getSceneLayout } from '../../src/demo/sceneLayout';

const profiles = [
  { id: 'father', name: 'Папа', role: 'parent', subtype: 'father', appearance: { skin: 'peach', hair: 'short', hairColor: 'chestnut', beard: 'short', classId: 'warrior', bodyId: 'starter-warrior-body', weaponId: 'starter-warrior-weapon' } },
  { id: 'mother', name: 'Мама', role: 'parent', subtype: 'mother', appearance: { skin: 'peach', hair: 'long', hairColor: 'chestnut', beard: 'none', classId: 'healer', bodyId: 'starter-healer-body', weaponId: 'starter-healer-weapon' } },
  { id: 'son', name: 'Сын', role: 'child', subtype: 'son', appearance: { skin: 'peach', hair: 'short', hairColor: 'chestnut', beard: 'none', classId: 'rogue', bodyId: 'starter-rogue-body', weaponId: 'starter-rogue-weapon' } },
  { id: 'daughter', name: 'Дочка', role: 'child', subtype: 'daughter', appearance: { skin: 'peach', hair: 'bob', hairColor: 'ginger', beard: 'none', classId: 'mage', bodyId: 'starter-mage-body', weaponId: 'starter-mage-weapon' } },
];
const review = ['fireplace','library','conservatory'].flatMap(theme => [1,2,4,6].map(count => ({
  theme, count, width: 343, height: 514.5,
  // For six: two parents and four children, not duplicated parents.
  layout: getSceneLayout(Array.from({ length: count }, (_, i) => ({ ...profiles[i < 4 ? i : 2 + (i % 2)], id: String(i) })), 0, theme),
})));
writeFileSync('work/demo-character/layout-fixtures.json', JSON.stringify(review, null, 2) + '\n');
