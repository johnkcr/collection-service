import { CollectionMetadata } from '@johnkcr/temple-lib/dist/types/core';

export interface CollectionMetadataProvider {
  getCollectionMetadata: (address: string) => Promise<CollectionMetadata>;
}
