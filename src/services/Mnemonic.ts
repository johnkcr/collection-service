import got, { Got, Response } from 'got/dist/source';
import { MNEMONIC_API_KEYS } from '../constants';
import { randomItem, sleep } from '../utils';
import { gotErrorHandler } from '../utils/got';

export default class MnemonicClient {
  private readonly mnemonicClient: Got;
  constructor() {
    this.mnemonicClient = got.extend({
      prefixUrl: 'https://canary-ethereum.rest.mnemonichq.com/',
      hooks: {
        beforeRequest: [
          (options) => {
            if (!options?.headers?.['x-api-key']) {
              if (!options.headers) {
                options.headers = {};
              }

              const randomApiKey = randomItem(MNEMONIC_API_KEYS);
              options.headers['x-api-key'] = randomApiKey;
            }
          }
        ]
      },
      /**
       * requires us to check status code
       */
      throwHttpErrors: false,
      cache: false,
      timeout: 10_000
    });
  }

  async getERC721Collections(offset = 0, limit = 1): Promise<Contract[]> {
    const res: Response<ContractsResponse> = await this.errorHandler(() => {
      return this.mnemonicClient.get(`contracts/v1beta1/all`, {
        searchParams: {
          offset,
          limit,
          sortDirection: 'SORT_DIRECTION_DESC',
          contractTypes: 'TOKEN_TYPE_ERC721'
        },
        responseType: 'json'
      });
    });
    const collections = res?.body?.contracts ?? [];
    return collections;
  }

  async getERC1155Collections(offset = 0, limit = 1): Promise<Contract[]> {
    const res: Response<ContractsResponse> = await this.errorHandler(() => {
      return this.mnemonicClient.get(`contracts/v1beta1/all`, {
        searchParams: {
          offset,
          limit,
          sortDirection: 'SORT_DIRECTION_DESC',
          contractTypes: 'TOKEN_TYPE_ERC1155'
        },
        responseType: 'json'
      });
    });
    const collections = res?.body?.contracts ?? [];
    return collections;
  }

  async getCollection(address: string): Promise<Contract> {
    const res: Response<{ contract: Contract }> = await this.errorHandler(() => {
      return this.mnemonicClient.get(`contracts/v1beta1/by_address/${address}`, {
        responseType: 'json'
      });
    });
    const contract = res?.body?.contract ?? {};
    return contract;
  }

  async getNFTsOfContract(address: string, limit: number, offset: number): Promise<TokensByContractResponse> {
    const res: Response<TokensByContractResponse> = await this.errorHandler(() => {
      const url = `tokens/v1beta1/by_contract/${address}`;
      return this.mnemonicClient.get(url, {
        searchParams: {
          offset,
          limit,
          sortDirection: 'SORT_DIRECTION_DESC'
        },
        responseType: 'json'
      });
    });
    return res.body;
  }

  async getNFTMetadata(address: string, tokenId: string): Promise<TokenMetadata> {
    const res: Response<TokenMetadata> = await this.errorHandler(() => {
      return this.mnemonicClient.get(`tokens/v1beta1/token/${address}/${tokenId}/metadata`, {
        responseType: 'json'
      });
    });
    return res.body;
  }

  private async errorHandler<T>(request: () => Promise<Response<T>>, maxAttempts = 3): Promise<Response<T>> {
    let attempt = 0;

    for (;;) {
      attempt += 1;

      try {
        const res: Response<T> = await request();

        switch (res.statusCode) {
          case 200:
            return res;

          case 400:
            throw new Error(res.statusMessage);

          case 404:
            throw new Error('Not found');

          case 429:
            await sleep(2000);
            throw new Error('Rate limited');

          case 500:
            throw new Error('Internal server error');

          case 504:
            await sleep(5000);
            throw new Error('Server down');

          default:
            await sleep(2000);
            throw new Error(`Unknown status code: ${res.statusCode}`);
        }
      } catch (err) {
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
}

interface TokensByContractResponse {
  tokens: Array<{
    contractAddress: string;
    tokenId: string;
    type: string;
    tokenMetadata: TokenMetadata;
  }>;
}

interface TokenMetadata {
  metadataUri: { uri: string; mimeType: string };
  name: string;
  image: { uri: string; mimeType: string };
  mintEvent: {
    txHash: string;
    logIndex: string;
    blockTimestamp: string; // rfc3339
  };
  raw: string;
  indexedAt: string; // rfc3399
}

export interface Contract {
  type: string;
  mintEvent: {
    blockTimestamp: string; // RFC 3399 timestamp
    txHash: string;
    minterAddress: string;
  };
  name: string;
  symbol: string;
  decimals: number;
  address: string;
  types: string[];
}

interface ContractsResponse {
  contracts: Contract[];
}
