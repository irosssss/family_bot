import { closedObject, reject } from './errors';
import { contentId, revision } from './ids';

export function contentRef(input: unknown, pointer = '') {
  const record = closedObject(input, ['definition_id', 'content_revision'], pointer);
  return Object.freeze({ definition_id: contentId(record.definition_id, `${pointer}/definition_id`),
    content_revision: revision(record.content_revision, `${pointer}/content_revision`) });
}

export function assetRef(input: unknown, pointer = '') {
  const record = closedObject(input, ['asset_id', 'asset_revision'], pointer);
  const id = contentId(record.asset_id, `${pointer}/asset_id`);
  if (id.split(':')[1].split('/')[0] !== 'asset') return reject('contract.asset_kind_invalid', `${pointer}/asset_id`);
  return Object.freeze({ asset_id: id, asset_revision: revision(record.asset_revision, `${pointer}/asset_revision`) });
}

export function registryRef(input: unknown, pointer = '') {
  const record = closedObject(input, ['registry_id', 'revision'], pointer);
  return Object.freeze({ registry_id: contentId(record.registry_id, `${pointer}/registry_id`),
    revision: revision(record.revision, `${pointer}/revision`) });
}
