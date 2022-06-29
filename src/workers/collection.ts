import 'reflect-metadata';
import { isMainThread, parentPort } from 'worker_threads';
import chalk from 'chalk';
import { create } from './collectionRunner';
import assert from 'assert';

/**
 * createCollection parses the arguments passed to the worker thread and calls
 * a function to handle creating the collection
 */
export async function createCollection(): Promise<void> {
  assert(!isMainThread, 'Attempted to create collection via a worker thread method in the main thread');
  const [, , address, chainId, hasBlueCheckArg, resetArg, indexInitiator] = process.argv;
  const hasBlueCheck = hasBlueCheckArg === 'true';
  const reset = resetArg === 'true';

  const hex = address.split('0x')[1].substring(0, 6);
  const color = chalk.hex(`#${hex}`);

  if (!parentPort) {
    throw new Error('invalid parent port');
  }

  const log = (args: any | any[]): void => parentPort?.postMessage(color(args));

  await create(address, chainId, hasBlueCheck, reset, indexInitiator, log);
}
