// eslint-disable-next-line eslint-comments/disable-enable-pair
/* eslint-disable @typescript-eslint/no-unused-vars */
import 'dotenv/config';
import 'reflect-metadata';
import { firebase, logger, opensea, mnemonic } from './container';
import { sleep } from './utils';
import fs from 'fs';
import path from 'path';

import { deleteCollectionGroups } from 'scripts/deleteDataSubColl';

// eslint-disable-next-line @typescript-eslint/require-await
// do not remove commented code
export async function main(): Promise<void> {
  try {
    await getCollectionsFromMnemonic();
    // const collectionGroupsToDelete = [
    //   'data',
    //   'daily',
    //   'hourly',
    //   'weekly',
    //   'monthly',
    //   'yearly',
    //   'collectionStats', // overlaps with current structure
    //   'nftStats', // overlaps with current structure
    //   'nft',
    //   'collectionStatsAllTime',
    //   'collectionStatsHourly',
    //   'collectionStatsDaily',
    //   'collectionStatsWeekly',
    //   'collectionStatsMonthly',
    //   'collectionStatsYearly',
    //   'nftStatsAllTime',
    //   'nftStatsHourly',
    //   'nftStatsDaily',
    //   'nftStatsWeekly',
    //   'nftStatsMonthly',
    //   'nftStatsYearly'
    // ];
    // await deleteCollectionGroups(collectionGroupsToDelete);
    // await checkCollectionTokenStandard()
    // const summary = await collectionDao.getCollectionsSummary();
    // logger.log(`Found: ${summary.collections.length} collections. Number of complete collections: ${summary.numberComplete}`);
    // await collectionDao.getCollectionsSummary();
    // await appendDisplayTypeToCollections();
  } catch (err) {
    logger.error(err);
  }
}

export function flattener(): void {
  const file = path.join(__dirname, '../resultsbak.json');
  const data = fs.readFileSync(file, 'utf-8');
  const parsed = JSON.parse(data);
  const onlyObj = parsed[0];
  fs.appendFileSync('results.json', '[');
  for (const obj in onlyObj) {
    const val = onlyObj[obj];
    const datum = {
      address: val.address,
      chainId: val.chainId,
      hasBlueCheck: val.hasBlueCheck
    };
    if (datum.address && datum.chainId === '1' && String(datum.hasBlueCheck)) {
      fs.appendFileSync('results.json', JSON.stringify(datum) + ',');
    }
  }
  fs.appendFileSync('results.json', ']');
}

export async function appendDisplayTypeToCollections(): Promise<void> {
  const data = await firebase.db.collection('collections').get();
  data.forEach(async (doc) => {
    await sleep(2000);
    const address = doc.get('address') as string;
    const dispType = doc.get('displayType');
    if (address && !dispType) {
      const resp = await opensea.getCollectionMetadata(address);
      logger.log(address, resp.displayType);
      await firebase.db
        .collection('collections')
        .doc('1:' + address)
        .set({ displayType: resp.displayType }, { merge: true });
    }
  });
}

export async function getCollectionsFromMnemonic(): Promise<void> {
  const data = await mnemonic.getERC721Collections();
  console.log(data);
}

void main();
