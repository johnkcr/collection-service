import { COLLECTION_SCHEMA_VERSION, NULL_ADDR } from '../constants';
import { collectionDao } from '../container';
import BatchHandler from '../models/BatchHandler';
import { Collection, CreationFlow } from '@johnkcr/temple-lib/dist/types/core';

/**
 * added queue properties, updateAt and version
 *
 * requires we get every collection since this is the first
 * collection schema with a version
 */
export async function migrateToVersion1(): Promise<void> {
  const batchHandler = new BatchHandler();
  const iterator = collectionDao.streamCollections();
  for await (const {collection, ref} of iterator) {
    const collectionRef = ref;
    if (collection?.state?.create?.step === CreationFlow.Complete) {
      const completedCollection: Collection = {
        ...(collection as Collection),
        indexInitiator: collection?.indexInitiator ?? NULL_ADDR,
        state: {
          ...collection.state,
          version: COLLECTION_SCHEMA_VERSION,
          create: {
            ...(collection?.state?.create ?? {}),
            step: collection?.state?.create?.step ?? CreationFlow.Complete,
            updatedAt: collection?.state?.create?.updatedAt ?? Date.now()
          }
        }
      };
      batchHandler.add(collectionRef, completedCollection, { merge: true });
    } else {
      const incompleteCollection: Partial<Collection> = {
        ...collection,
        indexInitiator: collection?.indexInitiator ?? NULL_ADDR,
        state: {
          ...collection?.state,
          version: COLLECTION_SCHEMA_VERSION,
          create: {
            progress: collection?.state?.create?.progress ?? 0,
            step: collection?.state?.create?.step ?? CreationFlow.CollectionCreator,
            updatedAt: collection?.state?.create?.updatedAt ?? Date.now(),
            ...collection?.state?.create
          },
          export: {
            done: collection?.state?.export?.done ?? false
          }
        }
      };
      batchHandler.add(collectionRef, incompleteCollection, { merge: true });
    }
  }

  await batchHandler.flush();
}
