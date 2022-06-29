import { ethers } from 'ethers';
import { Readable } from 'node:stream';
import { CollectionAttributes, Token, TokenStandard } from '@johnkcr/temple-lib/dist/types/core';
export interface HistoricalLogsChunk {
  events: ethers.Event[];
  fromBlock: number;
  toBlock: number;
  progress: number;
}
export type HistoricalLogs = Readable | ethers.Event[] | Generator<Promise<HistoricalLogsChunk>, void, unknown>;

export interface HistoricalLogsOptions {
  fromBlock?: number;
  toBlock?: number | 'latest';
  returnType?: 'stream' | 'promise' | 'generator';
}

export default interface Contract {
  address: string;

  chainId: string;

  standard: TokenStandard;

  calculateRarity: (tokens: Token[], collectionAttributes?: CollectionAttributes) => Token[];

  aggregateTraits: (tokens: Token[]) => CollectionAttributes;

  /**
   * takes the event that created the contract
   * returns the address that deployed the contract
   */
  decodeDeployer: (event: ethers.Event) => string;

  /**
   * attempts to get the current owner of the contract
   *
   */
  getOwner: () => Promise<string>;

  decodeTransfer: (event: ethers.Event) => { to: string; from: string; tokenId: string };

  /**
   * returns a promise for the address of the deployer of the contract
   */
  getContractDeployer: () => Promise<string>;

  /**
   * returns a promise for the event where the contract was created
   */
  getContractCreationTx: () => Promise<ethers.Event>;

  /**
   * returns whether the given topic is a transfer
   */
  isTransfer: (topic: string) => boolean;

  /**
   * returns a promise of a readable stream of mint events
   */
  getMints: (options?: HistoricalLogsOptions) => Promise<HistoricalLogs>;

  /**
   * returns a promise for all token ids in the collection
   */
  getTokenIds: () => Promise<string[]>;

  /**
   * returns a promise for the uri of the token's metadata
   */
  getTokenUri: (tokenId: string) => Promise<string>;

  supportsInterface: () => Promise<boolean>;
}
