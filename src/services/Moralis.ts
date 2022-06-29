import got, { Got, Response } from 'got';
import { TokenStandard, TokenMetadata } from '@johnkcr/temple-lib/dist/types/core';
import { sleep } from '../utils';
import { MORALIS_API_KEY } from '../constants';
import { gotErrorHandler } from '../utils/got';
import PQueue from 'p-queue';
import { singleton } from 'tsyringe';
import { logger } from '../container';

interface Web3Response<T> {
  total: number;
  page: number;
  page_size: number;
  result: T[];
  cursor: string;
}

interface Token {
  token_address: string;
  token_id: string;
  contract_type: TokenStandard;
  token_uri: string;
  metadata: string;
  synced_at: string;
  amount: string;
  name: string;
  symbol: string;
}

@singleton()
export default class Moralis {
  private readonly client: Got;

  private readonly queue: PQueue;

  constructor() {
    this.client = got.extend({
      /**
       * requires us to check status code
       */
      throwHttpErrors: false,
      cache: false,
      timeout: 10_000,
      headers: {
        'X-API-KEY': MORALIS_API_KEY
      }
    });

    this.queue = new PQueue({
      concurrency: 10,
      intervalCap: 17,
      interval: 3000
    });
  }

  /**
   * getTokens returns a single page of tokens (up to 500)
   */
  async getTokens(address: string, chainId: string, cursor: string): Promise<Response<Web3Response<Token>>> {
    const res: Response<Web3Response<Token>> = await this.errorHandler(() =>
      this.client.get({
        url: `https://deep-index.moralis.io/api/v2/nft/${address}`,
        searchParams: {
          chain: this.getChain(chainId),
          cursor
        },
        responseType: 'json'
      })
    );

    return res;
  }

  /**
   * getAllTokens gets all tokens for a contract
   */
  async getAllTokens(address: string, chainId: string): Promise<Token[]> {
    const thunkedRequest = async (cursor: string): Promise<Response<Web3Response<Token>>> =>
      await this.getTokens(address, chainId, cursor);

    const res = await this.paginate(thunkedRequest);

    return res;
  }

  /**
   * getTokenMetadata gets the token metadata for a specific tokenId
   */
  async getTokenMetadata(address: string, chainId: string, tokenId: string): Promise<TokenMetadata> {
    const res: Response<Token> = await this.errorHandler(() =>
      this.client.get({
        url: `https://deep-index.moralis.io/api/v2/nft/${address}/${tokenId}`,
        searchParams: {
          chain: this.getChain(chainId)
        },
        responseType: 'json'
      })
    );

    const token = res.body;

    if (token.metadata === null) {
      throw new Error("Moralis doesn't have metadata");
    }

    const metadata = JSON.parse(token.metadata) as TokenMetadata;

    if (!metadata) {
      throw new Error('Failed to get metadata from moralis');
    }

    return metadata;
  }

  /**
   * getChain returns the moralis chain parameter given the base 10 chain id
   */
  private getChain(chainId: string): string {
    const int = parseInt(chainId, 10);
    if (Number.isNaN(int)) {
      throw new Error(`invalid chainId: ${chainId}`);
    }
    const hex = int.toString(16);
    return `0x${hex}`;
  }

  private async errorHandler<T>(request: () => Promise<Response<T>>, maxAttempts = 3): Promise<Response<T>> {
    let attempt = 0;
    for(;;) {
      attempt += 1;
      try {
        const res = await this.queue.add(async () => {
          return await request();
        });

        switch (res.statusCode) {
          case 200:
            return res;

          case 429:
            throw new Error('Rate limited');

          default:
            throw new Error(`Moralis client received unknown status code ${res.statusCode}`);
        }
      } catch (err) {
        logger.error('Failed moralis request', err);
        const handlerRes = gotErrorHandler(err);
        if ('retry' in handlerRes) {
          await sleep(handlerRes.delay);
        } else if (!handlerRes.fatal) {
          // unknown error
          if (attempt >= maxAttempts) {
            throw err;
          }
        } else {
          throw err;
        }
      }
    }
  }

  private async paginate<T>(thunkedRequest: (cursor: string) => Promise<Response<Web3Response<T>>>): Promise<T[]> {
    let results: T[] = [];

    for await (const chunk of this.paginateHelper(thunkedRequest)) {
      results = [...results, ...chunk];
    }

    return results;
  }

  private async *paginateHelper<T>(
    thunkedRequest: (cursor: string) => Promise<Response<Web3Response<T>>>
  ): AsyncGenerator<T[], void, unknown> {
    let hasNextPage = true;
    let cursor = '';
    let numResults = 0;

    while (hasNextPage) {
      const res = await thunkedRequest(cursor);

      let body = res.body;
      if (typeof body === 'string') {
        body = JSON.parse(body);
      }

      numResults += body.page_size;

      hasNextPage = !!body.cursor && body.total > numResults;
      cursor = body.cursor;

      if (body.result && body.result.length > 0 && Array.isArray(body.result)) {
        yield body.result;
      } else {
        throw new Error('Failed to get page');
      }
    }
  }
}
