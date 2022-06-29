import { BigNumber, ethers } from 'ethers';
import { HistoricalLogs, HistoricalLogsOptions } from './Contract.interface';
import { TokenStandard, CollectionAttributes, DisplayType, Token } from '@johnkcr/temple-lib/dist/types/core';
import Erc721Abi from '../../abi/Erc721';
import { NULL_ADDR } from '../../constants';
import AbstractContract from './Contract.abstract';
import { normalize } from 'path';
import { normalizeAddress } from '../../utils/ethers';
import { ERC721InterfaceId } from '@johnkcr/temple-lib/dist/utils/constants'
import { X509Certificate } from 'crypto';
import { keccak256 } from 'ethers/lib/utils';

export default class Erc721Contract extends AbstractContract {
  readonly standard = TokenStandard.ERC721;

  private baseUriAvailable?: boolean;
  private baseUri?: string;

  constructor(address: string, chainId: string) {
    super(address, chainId, Erc721Abi);
  }

  decodeDeployer(event: ethers.Event): string {
    const deployer: string = normalizeAddress((event?.args?.[1] as string) ?? '');
    return deployer;
  }

  decodeTransfer(event: ethers.Event): { from: string; to: string; tokenId: string } {
    const args = event?.args;
    const from = normalizeAddress((args?.[0] as string) ?? '');
    const to = normalizeAddress((args?.[1] as string) ?? '');
    const tokenId = (args?.[2] as BigNumber)?.toString?.();

    if (!to || !from || !tokenId) {
      throw new Error('failed to get token id from event');
    }

    return {
      from,
      to,
      tokenId
    };
  }

  calculateRarity(tokens: Token[], collectionAttributes?: CollectionAttributes): Token[] {
    const attributes = collectionAttributes ?? this.aggregateTraits(tokens);

    const getRarityScore = (traitType: string | number, traitValue: string | number): number => {
      const rarityScore = attributes[traitType].values[traitValue].rarityScore ?? 0;
      return rarityScore;
    };

    const updatedTokens: Token[] = [];

    
    for (const token of tokens) {
      const tokenRarityScore = (token?.metadata?.attributes ?? []).reduce((raritySum: number, attribute) => {
        const traitType = attribute.trait_type ?? attribute.value;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const attributeRarityScore = getRarityScore(traitType, attribute.value);
        return raritySum + attributeRarityScore;
      }, 0);
      updatedTokens.push({
        ...token,
        rarityScore: tokenRarityScore
      });
    }

    const tokensSortedByRarity = updatedTokens.sort((itemA, itemB) => (itemB.rarityScore ?? 0) - (itemA.rarityScore ?? 0));

    return tokensSortedByRarity.map((token, index) => {
      return {
        ...token,
        rarityRank: index + 1
      };
    });
  }

  aggregateTraits(tokens: Token[]): CollectionAttributes {
    const tokenMetadata = tokens.map((item) => item.metadata);
    const collectionTraits: CollectionAttributes = {};

    const incrementTrait = (value: string | number, traitType?: string, displayType?: DisplayType): void => {
      const displayTypeField = displayType ? { displayType } : {};
      if (!traitType) {
        traitType = `${value}`;
      }

      /**
       * initialize traitType if it doesn't exist
       */
      if (!collectionTraits[traitType]) {
        collectionTraits[traitType] = {
          ...displayTypeField,
          count: 0,
          percent: 0,
          values: {}
        };
      }

      /**
       * initialize value if it doesn't exist
       */
      if (!collectionTraits[traitType].values[value]) {
        const prevValues = collectionTraits[traitType].values ?? {};
        collectionTraits[traitType].values = {
          ...prevValues,
          [value]: { count: 0, percent: 0, rarityScore: 0 }
        };
      }

      /**
       * increment counts
       */
      collectionTraits[traitType].count += 1;
      collectionTraits[traitType].percent = Math.round((collectionTraits[traitType].count / tokens.length) * 100 * 100) / 100;
      collectionTraits[traitType].values[value].count += 1;

      const percent = Math.round((collectionTraits[traitType].values[value].count / tokens.length) * 100 * 100) / 100;
      const proportion = percent / 100;
      collectionTraits[traitType].values[value].percent = percent;
      collectionTraits[traitType].values[value].rarityScore = 1 / proportion;
    };

    for (const metadata of tokenMetadata) {
      const attributes = Array.isArray(metadata.attributes) ? metadata.attributes : [];

      for (const attribute of attributes) {
        if ('display_type' in attribute && attribute.display_type) {
          incrementTrait(attribute.value, attribute.trait_type, attribute.display_type);
        } else {
          incrementTrait(attribute.value, attribute.trait_type);
        }
      }
    }

    return collectionTraits;
  }

  async getContractDeployer(): Promise<string> {
    const event = await this.getContractCreationTx();
    const deployer = this.decodeDeployer(event);
    return deployer;
  }

  /**
   * note, this only works if the contract is ownable
   */
  async getContractCreationTx(): Promise<ethers.Event> {
    const filter = this.contract.filters.OwnershipTransferred(NULL_ADDR);
    // eslint-disable-next-line no-useless-catch
    try {
      const contractCreationTx = await this.contract.queryFilter(filter);
      const tx = contractCreationTx?.[0];
      if (tx) {
        return tx;
      }

      throw new Error(`failed to get contract creator tx for: ${this.address} on chain: ${this.chainId}`);
    } catch (err) {
      throw err;
    }
  }

  isTransfer(topic: string): boolean {
    const transferTopic = this.contract.filters.Transfer(NULL_ADDR)?.topics?.[0];
    if (transferTopic && transferTopic === topic) {
      return true;
    }
    return false;
  }

  /**
   * get all transfers from 0x0
   *
   * use options to specify a block range and how to receive the events
   */
  async getMints(options?: HistoricalLogsOptions): Promise<HistoricalLogs> {
    const mintsFilter = this.contract.filters.Transfer(NULL_ADDR);
    const queryFilter = this.contract.queryFilter.bind(this.contract);

    async function thunkedLogRequest(fromBlock: number, toBlock: number | 'latest'): Promise<ethers.Event[]> {
      return await queryFilter(mintsFilter, fromBlock, toBlock);
    }

    let fromBlock = options?.fromBlock;
    if (typeof fromBlock !== 'number') {
      /**
       * the first transaction for this contract
       */
      const firstTransaction = await this.getContractCreationTx();
      fromBlock = firstTransaction.blockNumber;
    }

    const mintsReadable = await this.paginateLogs(thunkedLogRequest, this.provider, {
      fromBlock,
      toBlock: options?.toBlock,
      returnType: options?.returnType
    });

    return mintsReadable;
  }

  async getTokenIds(): Promise<string[]> {
    const mints = (await this.getMints({ returnType: 'promise' })) as ethers.Event[];

    return mints.map((mint) => {
      const tokenId = this.decodeTransfer(mint).tokenId;
      return tokenId;
    });
  }

  /**
   * there are ways to get the token uri
   * 1. call tokenUri on the contract
   * 2. call baseUri on the contract and append the tokenId to the response
   */
  async getTokenUri(tokenId: string): Promise<string> {
    let tokenUri;
    let baseUri;
    try {
      baseUri = await this.getBaseUri();
      const url = new URL(baseUri);
      if (baseUri) {
        const tokenPath = normalize(`${url.pathname}/${tokenId}`);
        url.pathname = tokenPath;
        tokenUri = url.toString();
        return tokenUri;
      }
    } catch {
      // base uri is not supported
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const response: string[] = await this.contract.functions.tokenURI(tokenId);
    tokenUri = response[0];
    if (typeof tokenUri === 'string' && tokenUri) {
      return tokenUri;
    }
    throw new Error('failed to get token uri');
  }

  private async getBaseUri(refresh = false): Promise<string> {
    if (this.baseUriAvailable && this.baseUri && !refresh) {
      return this.baseUri;
    }

    if (this.baseUriAvailable === false && !refresh) {
      throw new Error('contract does not support base uri');
    }

    try {
      const response: string[] = await this.contract.functions.baseURI();

      if (typeof response[0] === 'string' && response[0]) {
        this.baseUri = response[0];
        this.baseUriAvailable = true;
        return this.baseUri;
      }
    } catch (err: any) {
      if ('code' in err && err.code === 'CALL_EXCEPTION') {
        this.baseUriAvailable = false;
        this.baseUri = undefined;
        throw new Error('contract does not support base uri');
      }
    }
    return '';
  }

  async supportsInterface(): Promise<boolean> {
    try {
      const res = await this.contract.functions.supportsInterface(ERC721InterfaceId);
      const isSupported = res[0];
      if(typeof isSupported === 'boolean') {
        return isSupported;
      } 
      return false;
    } catch (err) {
      return false;
    }
  }
}
