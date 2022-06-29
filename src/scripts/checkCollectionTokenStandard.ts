import { TokenStandard } from "@johnkcr/temple-lib/dist/types/core";
import { firestoreConstants } from "@johnkcr/temple-lib/dist/utils";
import { collectionDao, firebase, logger } from "container";
import ContractFactory from "models/contracts/ContractFactory";

export async function checkCollectionTokenStandard(): Promise<void> {
    async function deleteCollection(db: FirebaseFirestore.Firestore, collectionPath: string, batchSize: number): Promise<void> {
      const collectionRef = db.collection(collectionPath);
      const query = collectionRef.orderBy('__name__').limit(batchSize);
    
      return await new Promise((resolve, reject) => {
        deleteQueryBatch(db, query, resolve).catch(reject);
      });
    }
    
    async function deleteQueryBatch(
      db: FirebaseFirestore.Firestore,
      query: FirebaseFirestore.Query,
      resolve: () => void
    ): Promise<void> {
      const snapshot = await query.get();
    
      const batchSize = snapshot.size;
      if (batchSize === 0) {
        // When there are no documents left, we are done
        resolve();
        return;
      }
    
      // Delete documents in a batch
      const batch = db.batch();
      snapshot.docs.forEach((doc: FirebaseFirestore.DocumentSnapshot) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    
      // Recurse on the next process tick, to avoid
      // exploding the stack.
      process.nextTick(() => {
        void deleteQueryBatch(db, query, resolve);
      });
    }
  
    try {
      const query = firebase.db.collection(firestoreConstants.COLLECTIONS_COLL).where('tokenStandard', '==', TokenStandard.ERC721);
      const iterator = collectionDao.streamCollections(query);
      let collectionsChecked = 0;
      for await (const { collection, ref } of iterator) {
        const factory = new ContractFactory();
        const address = collection.address;
        const chainId = collection.chainId;
        collectionsChecked += 1;
        if (collectionsChecked % 10 === 0) {
          logger.log(`Checked ${collectionsChecked} collections`);
        }
        if (address && chainId) {
          try {
            await factory.getTokenStandard(address, chainId);
          } catch (err: any) {
            const message = typeof err?.message === 'string' ? (err?.message as string) : 'Unknown';
            if (message.includes('Failed to detect token standard')) {
              logger.log(message);
              logger.log(`Found non ERC721 contract. Deleting ${chainId}:${address} nfts`);
              const nftsCollection = ref.collection(firestoreConstants.COLLECTION_NFTS_COLL).path;
              await deleteCollection(firebase.db, nftsCollection, 300);
              await ref.set({ state: { create: { step: '', error: { message } } }, tokenStandard: '' }, { merge: true });
              logger.log('Deleted collection nfts');
            } else {
              logger.log('unknown error occurred');
              logger.error(err);
            }
          }
        }
      }
      logger.log('Successfully checked all collection token standards');
    } catch (err) {
      logger.error('Unknown error occurred');
      logger.error(err);
    }
  }