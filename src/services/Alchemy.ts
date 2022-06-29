// alchemy-nft-api/alchemy-web3-script.js
import { AlchemyWeb3, createAlchemyWeb3 } from '@alch/alchemy-web3';
import { singleton } from 'tsyringe';
import { logger } from '../container';
import axios from 'axios';
import { trimLowerCase } from '@johnkcr/temple-lib/dist/utils';

@singleton()
export default class Alchemy {
  private readonly web3: AlchemyWeb3;

  constructor() {
    this.web3 = createAlchemyWeb3(process.env.JSON_RPC_MAINNET1 ?? '');
  }

  async getNFTsOfOwner(address: string): Promise<void> {
    // The wallet address we want to query for NFTs:
    const nfts = await this.web3.alchemy.getNfts({
      owner: address
    });
    // Print owner's wallet address:
    logger.log('fetching NFTs for address:', address);
    logger.log('...');

    // Print total NFT count returned in the response:
    logger.log('number of NFTs found:', nfts.totalCount);
    logger.log('...');

    // Print contract address and tokenId for each NFT:
    for (const nft of nfts.ownedNfts) {
      logger.log('===');
      logger.log('contract address:', nft.contract.address);
      logger.log('token ID:', nft.id.tokenId);
    }
    logger.log('===');

  }


  async getNFTMetadata(address: string, tokenId: number): Promise<void> {
    // Fetch metadata for a particular NFT:
    const response = await this.web3.alchemy.getNftMetadata({
      contractAddress: trimLowerCase(address),
      tokenId: `${tokenId}`
    });
    logger.log(JSON.stringify(response, null, 2));
  }

  async getNFTsOfCollection(contractAddr: string, startToken: string): Promise<CollectionNFTsResponse> {
    const baseURL = `${process.env.JSON_RPC_MAINNET1}/getNFTsForCollection`;
    const withMetadata = 'true';
    const url = `${baseURL}?contractAddress=${contractAddr}&startToken=${startToken}&withMetadata=${withMetadata}`;
    const res = (await axios.get(url)).data as CollectionNFTsResponse;
    return res;
  }
}

interface CollectionNFTsResponse {
  nextToken: string;
  nfts: Array<{
    id: { tokenId: string; tokenMetadata: { tokenType: string } };
    title?: string;
    description?: string;
    tokenUri: { raw: string; gateway: string };
    metadata?: { tokenId: number; name: string; image: string; attributes: Array<{ value: string; trait_type: string }> };
  }>;
}
