import { Collection, TokenStandard } from '@johnkcr/temple-lib/dist/types/core';
import chalk from 'chalk';
import PQueue from 'p-queue';
import { firebase, logger } from '../container';
import BatchHandler from '../models/BatchHandler';
import MnemonicClient, { Contract } from '../services/Mnemonic';
import OpenSeaClient from '../services/OpenSea';
import { getSearchFriendlyString, sleep } from '../utils';

/**
 * buildCollections gets collections from opensea
 * checks if they are valid (i.e. have a contract address)
 * attempts to get metadata for the collection. fails if not on mainnet
 * if we do not yet store the collection, saves it to the db
 */
export async function buildCollectionsFromMnemonic(tokenStandard: TokenStandard): Promise<void> {
  const opensea = new OpenSeaClient();
  const mnemonic = new MnemonicClient();

  async function* collectionGenerator(): AsyncGenerator<Contract[]> {
    let timeout = 1000;
    let offset = 0;
    let failedAttempts = 0;
    const limit = 500;
    const collectionsSet: Set<string> = new Set();
    while (true) {
      try {
        let collections = [];
        if (tokenStandard === TokenStandard.ERC721) {
          collections = await mnemonic.getERC721Collections(offset, limit);
        } else {
          collections = await mnemonic.getERC1155Collections(offset, limit);
        }
        offset = offset + collections.length;
        failedAttempts = 0;

        const newCollections = collections.filter((collection) => {
          // collection.address is always lowercase
          if (!collection?.address || collectionsSet.has(collection.address)) {
            return false;
          } else {
            collectionsSet.add(collection.address);
            return true;
          }
        });

        yield newCollections;
      } catch (err) {
        logger.error('Failed to get OpenSea Collections', err);
        failedAttempts += 1;
        const backoffAfter = 3;
        if (failedAttempts % backoffAfter === 0) {
          const expBackOff = Math.floor(failedAttempts / backoffAfter);
          timeout = expBackOff * expBackOff * 1000;

          if (timeout > 30_000) {
            offset = 0;
          }
        }
        await sleep(timeout);
      }
    }
  }

  const queue = new PQueue({ concurrency: 2, interval: 2000, intervalCap: 2 });

  const batch = new BatchHandler();

  /**
   * getCollection attempts to create collection objects given the address for a collection
   * returns an array of valid collections that are not yet stored in the db
   */
  const getCollection = async (address: string): Promise<Partial<Collection> | undefined> => {
    const openseaStorefront = '0x495f947276749ce646f68ac8c248420045cb7b5e';
    if (address && address !== openseaStorefront) {
      try {
        // assume all contracts are on mainnet
        const mnemonicCollection = await mnemonic.getCollection(address);
        const metadata = await opensea.getCollectionMetadata(address); // ensure the contract is on mainnet.
        const slug = getSearchFriendlyString(metadata.links.slug ?? '');
        if (!slug) {
          throw new Error('Failed to find collection slug');
        }

        // ensure we don't yet have this document
        const doc = await firebase.getCollectionDocRef('1', address).get();
        let tokenStandard = TokenStandard.ERC721;
        if (mnemonicCollection.type === 'TOKEN_TYPE_ERC1155') {
          tokenStandard = TokenStandard.ERC1155;
        }
        if (!doc.exists) {
          const collectionData: Partial<Collection> = {
            chainId: '1',
            address: address,
            metadata: metadata,
            slug,
            deployer: mnemonicCollection.mintEvent.minterAddress,
            deployedAt: new Date(mnemonicCollection.mintEvent.blockTimestamp).getTime(),
            tokenStandard
          };
          return collectionData;
        }
      } catch (err: any) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        if (!err?.toString?.()?.includes?.('Not found')) {
          logger.error(err);
        }
      }
    }
    return undefined;
  };

  const iterator = collectionGenerator();
  for await (const collections of iterator) {
    let validCollections = 0;
    const collectionsPromises: Array<Promise<void>> = [];
    for (const mnemonicCollection of collections) {
      validCollections += 1;
      const promise = queue.add(async () => {
        const collection = await getCollection(mnemonicCollection.address);
        if (collection && collection.chainId && collection.address) {
          // const doc = firebase.getCollectionDocRef(contract.chainId, contract.address);
          // batch.add(doc, contract, { merge: true });
          try {
            /**
             * TODO add to queue
             */
            // await collectionQueue.enqueueCollection(collection.address, collection.chainId, Date.now(), collection);
            logger.log(
              chalk.green(`Found collection: ${collection.chainId}:${collection.address} Name: ${collection.metadata?.name}`)
            );
          } catch (err) {
            logger.error(`Failed to enqueue collection`, err);
          }
        }
      });
      collectionsPromises.push(promise);
    }

    logger.log(
      `Found: ${validCollections} potentially valid collections from ${collections.length} collections received from OpenSea`
    );
    await Promise.all(collectionsPromises);

    try {
      logger.log(`Committing batch of ${batch.size} collections`);
      await batch.flush();
      // eslint-disable-next-line no-empty
    } catch {}
  }
}
