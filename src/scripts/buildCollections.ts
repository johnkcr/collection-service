import OpenSeaClient, { Collection as OpenSeaCollection } from '../services/OpenSea';
import { firebase, logger } from '../container';
import { filterDuplicates, getSearchFriendlyString, sleep } from '../utils';
import PQueue from 'p-queue';
import BatchHandler from '../models/BatchHandler';
import { Collection } from '@johnkcr/temple-lib/dist/types/core';
import chalk from 'chalk';
import { AssertionError } from 'assert';
import { writeFile } from 'fs/promises';
import { normalizeAddress } from '../utils/ethers';

/**
 * buildCollections gets collections from opensea
 * checks if they are valid (i.e. have a contract address)
 * attempts to get metadata for the collection. fails if not on mainnet
 * if we do not yet store the collection, saves it to the db
 */
export async function buildCollections(): Promise<void> {
  const opensea = new OpenSeaClient();

  async function* collectionGenerator(): AsyncGenerator<OpenSeaCollection[]> {
    let timeout = 1000;
    let offset = 0;
    let failedAttempts = 0;
    const collectionsSet: Set<string> = new Set();
    while (true) {
      try {
        const collections = await opensea.getCollections(offset);

        offset = offset + collections.length;
        failedAttempts = 0;

        const newCollections = collections.filter((collection) => {
          if (!collection?.slug || collectionsSet.has(collection.slug)) {
            return false;
          } else {
            collectionsSet.add(collection.slug);
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
   * getCollection attempts to create collection objects given the slug for a collection
   * returns an array of valid collections that are not yet stored in the db
   */
  const getCollection = async (openseaSlug: string): Promise<Array<Partial<Collection>>> => {
    try {
      const collection = await opensea.getCollection(openseaSlug);
      if (collection?.primary_asset_contracts && collection?.primary_asset_contracts.length > 0) {
        if (collection?.primary_asset_contracts.length > 1) {
          logger.log(JSON.stringify(collection));
          await writeFile('./multiplePrimaryAssetContracts', JSON.stringify(collection));
          throw new AssertionError({ message: 'collection has multiple primary asset contracts' });
        }

        const contracts: Array<Partial<Collection>> = [];
        const primaryAssetContracts = collection?.primary_asset_contracts ?? [];
        for (const contract of primaryAssetContracts) {
          const address = normalizeAddress(contract.address ?? '');
          const openseaStorefront = '0x495f947276749ce646f68ac8c248420045cb7b5e';
          if (contract.name && contract.schema_name && address && address !== openseaStorefront) {
            try {
              // assume all contracts are on mainnet
              const metadata = await opensea.getCollectionMetadata(address); // ensure the contract is on mainnet.
              const slug = getSearchFriendlyString(metadata.links.slug ?? '');
              if (!slug) {
                throw new Error('Failed to find collection slug');
              }

              // ensure we don't yet have this document
              const doc = await firebase.getCollectionDocRef('1', address).get();
              if (!doc.exists) {
                const collectionData: Partial<Collection> = {
                  chainId: '1',
                  address: address,
                  metadata: metadata,
                  slug
                };
                contracts.push(collectionData);
              }
            } catch (err: any) {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-call
              if (!err?.toString?.()?.includes?.('Not found')) {
                logger.error(err);
              }
            }
          }
        }
        return contracts;
      }
      return [];
    } catch (err: any) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      if (!err?.toString?.()?.includes('Not found')) {
        logger.log(`Failed to get collection (${openseaSlug}) from opensea.`, err);
      }
      return [];
    }
  };

  const iterator = collectionGenerator();
  for await (const collections of iterator) {
    let validCollections = 0;
    const collectionsPromises: Array<Promise<void>> = [];
    for (const openseaCollection of collections) {
      if (!openseaCollection.slug.includes('untitled-collection')) {
        validCollections += 1;
        const promise = queue.add(async () => {
          const collectionCollections = await getCollection(openseaCollection.slug);
          const uniqueCollections = filterDuplicates(collectionCollections, (item) => `${item.chainId}-${item.address}`);
          for (const collection of uniqueCollections) {
            if (collection.chainId && collection.address) {
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
          }
        });
        collectionsPromises.push(promise);
      }
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
