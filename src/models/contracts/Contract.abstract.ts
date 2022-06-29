import { MAX_UNCLE_ABLE_BLOCKS } from '../../constants';
import { ethers } from 'ethers';
import { Readable } from 'stream';
import { CollectionAttributes, Token, TokenStandard } from '@johnkcr/temple-lib/dist/types/core';
import { ethersErrorHandler, getProviderByChainId, normalizeAddress } from '../../utils/ethers';
import IContract, { HistoricalLogs, HistoricalLogsChunk, HistoricalLogsOptions } from './Contract.interface';
import { logger } from '../../container';

export interface LogRequestOptions {
  fromBlock?: number;
  toBlock?: number;
}

export type LogRequest = (address: string, chainId: string, options?: LogRequestOptions) => ethers.Event[];

export type ThunkedLogRequest = (fromBlock: number, toBlock: number) => Promise<ethers.Event[]>;

export interface PaginateLogsOptions {
  fromBlock: number;
  toBlock?: number | 'latest';
  maxAttempts?: number;

  /**
   * stream return type should be used for getting events as fast as
   * possible and handling events as they are available
   *
   * generator should be used to lazily request events
   *
   * promise should be used to get all events at once
   */
  returnType?: 'stream' | 'generator' | 'promise';
}

export default abstract class Contract implements IContract {
  address: string;

  chainId: string;

  abstract standard: TokenStandard;

  protected contract: ethers.Contract;

  protected provider: ethers.providers.JsonRpcProvider;

  abstract calculateRarity(tokens: Token[], collectionAttributes?: CollectionAttributes): Token[];

  abstract aggregateTraits(tokens: Token[]): CollectionAttributes;

  abstract decodeDeployer(event: ethers.Event): string;

  abstract decodeTransfer(event: ethers.Event): { to: string; from: string; tokenId: string };

  abstract getContractDeployer(): Promise<string>;

  abstract getContractCreationTx(): Promise<ethers.Event>;

  abstract isTransfer(topic: string): boolean;

  abstract getMints(options?: HistoricalLogsOptions): Promise<HistoricalLogs>;

  abstract getTokenIds(): Promise<string[]>;

  abstract getTokenUri(tokenId: string): Promise<string>;

  abstract supportsInterface(): Promise<boolean>;

  /**
   * throws an error if the chainId is invalid
   */
  constructor(address: string, chainId: string, abi: ethers.utils.Fragment[]) {
    this.address = address;
    this.chainId = chainId;
    this.provider = getProviderByChainId(this.chainId);
    this.contract = new ethers.Contract(this.address, abi, this.provider);
  }

  public async getOwner(attempt = 0): Promise<string> {
    const maxAttempts = 3;
    attempt += 1;
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const owner: string = (await this.contract.owner()) ?? '';
      return normalizeAddress(owner ?? '');
    } catch (err: any) {
      logger.error('failed to get collection owner', err);
      if ('code' in err) {
        if (err.code === 'CALL_EXCEPTION') {
          return ''; // contract is not ownable, consider the deployer as the owner
        }
      }
      if (attempt > maxAttempts) {
        throw err;
      }

      return await this.getOwner(attempt);
    }
  }

  /**
   * paginateLogs handles paginating a log request over any number of blocks
   *
   * note: we are limited to requesting 2k blocks at a time
   *
   * toBlock will default to latest if not specified
   */
  protected async paginateLogs(
    thunkedLogRequest: ThunkedLogRequest,
    provider: ethers.providers.JsonRpcProvider,
    options: PaginateLogsOptions
  ): Promise<HistoricalLogs> {
    // eslint-disable-next-line prefer-const
    let { fromBlock, toBlock = 'latest', maxAttempts = 5, returnType = 'stream' } = options;

    toBlock = toBlock ?? 'latest';

    const getMaxBlock = async (provider: ethers.providers.JsonRpcProvider, toBlock: number | 'latest'): Promise<number> => {
      let maxBlock: number;
      if (typeof toBlock === 'string') {
        try {
          maxBlock = (await provider.getBlockNumber()) - MAX_UNCLE_ABLE_BLOCKS;
        } catch (err) {
          logger.error('failed to get current block number', err);
          throw new Error('failed to get current block number');
        }
      } else {
        maxBlock = toBlock;
      }
      return maxBlock;
    };

    const maxBlock = await getMaxBlock(provider, toBlock);
    const generator = this.paginateLogsHelper(thunkedLogRequest, fromBlock, maxBlock, maxAttempts);
    let readable: Readable;
    let events: ethers.Event[] = [];
    switch (returnType) {
      case 'stream':
        readable = Readable.from(generator);
        return readable;
      case 'generator':
        return generator;
      case 'promise':
        readable = Readable.from(generator);
        for await (const data of readable) {
          events = [...events, ...data];
        }
        return events;
    }
  }

  private *paginateLogsHelper(
    thunkedLogRequest: ThunkedLogRequest,
    minBlock: number,
    maxBlock: number,
    maxAttempts: number
  ): Generator<Promise<HistoricalLogsChunk>, void, unknown> {
    let from = minBlock;

    const errorHandler = ethersErrorHandler<HistoricalLogsChunk>(maxAttempts, 1000);

    let pagesWithoutResults = 0;
    while (from < maxBlock) {
      // we can get a max of 2k blocks at once
      let to = from + 2000;

      if (to > maxBlock) {
        to = maxBlock;
      }

      const size = maxBlock - minBlock;
      const progress = Math.floor(((from - minBlock) / size) * 100 * 100) / 100;

      yield errorHandler(async () => {
        if (pagesWithoutResults > 5) {
          try {
            const events = await thunkedLogRequest(from, maxBlock);
            const fromBlock = minBlock;
            const toBlock = to;
            to = maxBlock;
            return {
              progress,
              fromBlock,
              toBlock,
              events
            };
          } catch (err) {
            logger.error('Failed to optimize logs query', err);
            pagesWithoutResults = 0;
          }
        }

        const events = await thunkedLogRequest(from, to);

        if (events.length === 0) {
          pagesWithoutResults += 1;
        } else {
          pagesWithoutResults = 0;
        }

        const fromBlock = minBlock;
        const toBlock = to;
        return {
          progress,
          fromBlock,
          toBlock,
          events
        };
      });

      from = to + 1;
    }
  }
}
