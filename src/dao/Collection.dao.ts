import Firebase from '../database/Firebase';
import { singleton } from 'tsyringe';
import { Collection, CreationFlow } from '@johnkcr/temple-lib/dist/types/core';
import { NUM_OWNERS_TTS } from '../constants';
import { normalizeAddress } from '../utils/ethers';
import { firestoreConstants } from '@johnkcr/temple-lib/dist/utils';

@singleton()
export default class CollectionDao {
  private readonly firebase: Firebase;

  constructor(firebase: Firebase) {
    this.firebase = firebase;
  }

  async get(chainId: string, address: string): Promise<Collection> {
    const collectionRef = this.firebase.getCollectionDocRef(chainId, normalizeAddress(address));

    const doc = await collectionRef.get();

    return doc.data() as Collection;
  }

  async update(collection: Collection): Promise<void> {
    const chainId = collection.chainId;
    const address = collection.address;
    if (!chainId || !address) {
      throw new Error('invalid collection');
    }
    const collectionRef = this.firebase.getCollectionDocRef(chainId, normalizeAddress(address));

    await collectionRef.set(collection, { merge: true });
  }

  async getStaleCollectionOwners(): Promise<Collection[]> {
    const now = Date.now();
    const staleIfUpdatedBefore = now - NUM_OWNERS_TTS;
    const collectionSnapshots = await this.firebase.db
      .collection('collections')
      .limit(1000)
      .where('numOwnersUpdatedAt', '<', staleIfUpdatedBefore)
      .get();

    const collections: Collection[] = [];
    collectionSnapshots.docs.forEach((doc) => {
      collections.push(doc.data() as Collection);
    });

    return collections;
  }

  streamCollections(
    query?: FirebaseFirestore.Query
  ): AsyncGenerator<{ collection: Partial<Collection>; ref: FirebaseFirestore.DocumentReference }, void, unknown> {
    const allCollections = this.firebase.db.collection(firestoreConstants.COLLECTIONS_COLL);
    const stream = query ? query?.stream() : allCollections.stream();
    async function* generator(): AsyncGenerator<
      { collection: Partial<Collection>; ref: FirebaseFirestore.DocumentReference },
      void,
      unknown
    > {
      for await (const snapshot of stream) {
        const snap = snapshot as unknown as FirebaseFirestore.QueryDocumentSnapshot;
        const collection: Partial<Collection> = snap.data();
        yield { collection, ref: snap.ref };
      }
    }

    return generator();
  }

  async getCollectionsSummary(): Promise<
    { collections: Array<{
      address: string | undefined;
      chainId: string | undefined;
      numNfts: number | undefined;
      state: string;
      error: string | Record<string, any>;
      exported: boolean;
    }>, numberComplete: number }
  > {
    const collections: Array<Partial<Collection>> = [];
    const iterator = this.streamCollections();
    for await (const { collection } of iterator) {
      collections.push(collection);
    }

    let completeCollections = 0;
    const data = collections.map((item) => {
      if (item?.state?.create?.step === CreationFlow.Complete) {
        completeCollections += 1;
      }
      return {
        address: item.address,
        chainId: item.chainId,
        numNfts: item.numNfts,
        state: item?.state?.create?.step ?? 'unknown',
        error: item?.state?.create?.error ?? '',
        exported: item?.state?.export?.done ?? false
      };
    });

    return { collections: data, numberComplete: completeCollections };
  }
}
