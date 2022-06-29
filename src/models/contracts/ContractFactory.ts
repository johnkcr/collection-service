import Contract from './Contract.interface';
import { TokenStandard } from '@johnkcr/temple-lib/dist/types/core';
import Erc721Contract from './Erc721Contract';
import { validateAddress, validateChainId } from '../../utils/ethers';

export default class ContractFactory {
  async create(address: string, chainId: string): Promise<Contract> {
    const standard = await this.getTokenStandard(address, chainId);
    switch (standard) {
      case TokenStandard.ERC721:
        return new Erc721Contract(address, chainId);
      case TokenStandard.ERC1155:
      default:
        throw new Error(`Token Standard: ${standard} not yet implemented`);
    }
  }

  async getTokenStandard(address: string, chainId: string): Promise<TokenStandard> {
    validateAddress(address);
    validateChainId(chainId);
    
    const erc721 = new Erc721Contract(address, chainId);
    
    const isErc721 = await erc721.supportsInterface();

    if(isErc721) {
      return TokenStandard.ERC721;
    } 

    throw new Error('Failed to detect token standard');
  }

}
