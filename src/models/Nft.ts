/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable no-case-declarations */
import {
  ImageToken,
  MetadataToken,
  MintToken,
  Token as TokenType,
  TokenMetadata,
  RefreshTokenFlow,
  UriToken
} from '@johnkcr/temple-lib/dist/types/core';
import Contract from './contracts/Contract.interface';
import {
  RefreshTokenCacheImageError,
  RefreshTokenError,
  RefreshTokenOriginalImageError,
  RefreshTokenMetadataError,
  RefreshTokenMintError,
  RefreshTokenUriError
} from './errors/RefreshTokenFlow';
import { metadataClient, moralis, opensea, logger } from '../container';
import Moralis from '../services/Moralis';
import PQueue from 'p-queue';
import OpenSeaClient from './CollectionMetadataProvider';

type ReturnType<E extends RefreshTokenFlow> = E extends RefreshTokenFlow.Mint
  ? MintToken
  : E extends RefreshTokenFlow.Uri
  ? UriToken
  : E extends RefreshTokenFlow.Metadata
  ? MetadataToken
  : E extends RefreshTokenFlow.Image
  ? ImageToken
  : ImageToken;

export default class Nft {
  private token: Partial<TokenType>;

  private readonly contract: Contract;

  private readonly moralis: Moralis;

  private readonly opensea: OpenSeaClient;

  private readonly tokenUriQueue?: PQueue;

  private readonly imageUploadQueue?: PQueue;

  constructor(token: Partial<TokenType>, contract: Contract, tokenUriQueue?: PQueue, imageUploadQueue?: PQueue) {
    this.token = token;
    this.contract = contract;

    this.moralis = moralis;

    this.opensea = opensea;

    this.tokenUriQueue = tokenUriQueue;

    this.imageUploadQueue = imageUploadQueue;
  }

  public static validateToken(token: Partial<TokenType>, step: RefreshTokenFlow.Mint): ReturnType<RefreshTokenFlow.Mint>;
  public static validateToken(token: Partial<TokenType>, step: RefreshTokenFlow.Uri): ReturnType<RefreshTokenFlow.Uri>;
  public static validateToken(token: Partial<TokenType>, step: RefreshTokenFlow.Metadata): ReturnType<RefreshTokenFlow.Metadata>;
  public static validateToken(
    token: Partial<TokenType>,
    step: RefreshTokenFlow.CacheImage
  ): ReturnType<RefreshTokenFlow.CacheImage>;
  public static validateToken(token: Partial<TokenType>, step: RefreshTokenFlow.Image): ReturnType<RefreshTokenFlow.Image>;
  public static validateToken(token: Partial<TokenType>, step: RefreshTokenFlow.Complete): ReturnType<RefreshTokenFlow.Complete>;
  public static validateToken<T extends RefreshTokenFlow>(token: Partial<TokenType>, step: T): ReturnType<T> {
    /**
     * validate mint token
     */
    if (!token.mintedAt || !token.minter || !token.tokenId || typeof token.mintPrice !== 'number' || !token.mintTxHash) {
      // validate token
      throw new RefreshTokenMintError(
        `Invalid mint token property. Token Id: ${token.tokenId} Minted At: ${token.mintedAt} Minter: ${token.minter} `
      );
    }
    if (step === RefreshTokenFlow.Mint) {
      return token as ReturnType<T>;
    }

    /**
     * validate uri token
     */
    if (!token.tokenUri || typeof token.tokenUri !== 'string') {
      throw new RefreshTokenUriError(`Invalid Uri Token. Token Id: ${token.tokenId} Token Uri: ${token.tokenUri}`);
    }
    if (step === RefreshTokenFlow.Uri) {
      return token as ReturnType<T>;
    }

    /**
     * validate metadata token
     */
    if (!token.metadata || typeof token.numTraitTypes !== 'number' || typeof token.updatedAt !== 'number') {
      throw new RefreshTokenMetadataError(
        `Invalid metadata token. Token Id: ${token.tokenId} Metadata: ${token.metadata} Trait Types: ${token.numTraitTypes} Updated At: ${token.updatedAt}`
      );
    }
    if (step === RefreshTokenFlow.Metadata) {
      return token as ReturnType<T>;
    }

    /**
     * validate cache image token
     */
    if (step === RefreshTokenFlow.CacheImage && !token.image?.url) {
      throw new RefreshTokenCacheImageError(
        `Invalid cache image token. Token Id: ${token.tokenId} Image: ${token.image?.url} Updated At: ${token.image?.updatedAt}`
      );
    }
    if (step === RefreshTokenFlow.CacheImage) {
      return token as ReturnType<T>;
    }

    /**
     * validate original image token
     */
    if (!token.image?.originalUrl) {
      throw new RefreshTokenOriginalImageError(
        `Invalid original image token. Token Id: ${token.tokenId} Image: ${token.image?.originalUrl} Updated At: ${token.image?.updatedAt}`
      );
    }
    if (step === RefreshTokenFlow.Image) {
      return token as ReturnType<T>;
    }

    return token as ReturnType<T>;
  }

  public async *refreshToken(
    reset = false
  ): AsyncGenerator<
    { token: Partial<TokenType>; failed?: boolean; progress: number },
    any,
    { rarityScore: number; rarityRank: number } | undefined
  > {
    if (!this.token.state?.metadata?.step) {
      this.token.state = {
        ...(this.token.state ?? {}),
        metadata: {
          step: RefreshTokenFlow.Uri
        }
      };
    }

    if (reset) {
      this.token.state.metadata.step = RefreshTokenFlow.Uri;
    }

    try {
      for(;;) {
        switch (this.token.state?.metadata.step) {
          case RefreshTokenFlow.Uri:
            const mintToken = Nft.validateToken(this.token, RefreshTokenFlow.Mint);
            try {
              let attempt = 0;
              let tokenUri: string | undefined;
              for(;;) {
                attempt += 1;
                try {
                  tokenUri = await this.tokenUriQueue?.add(async () => {
                    return await this.contract.getTokenUri(mintToken.tokenId);
                  });
                  break;
                } catch (err) {
                  if (attempt > 3) {
                    throw err;
                  }
                }
              }
              const uriToken = Nft.validateToken(
                {
                  ...mintToken,
                  tokenUri: tokenUri,
                  state: {
                    metadata: {
                      step: RefreshTokenFlow.Metadata
                    }
                  }
                },
                RefreshTokenFlow.Uri
              );

              this.token = uriToken;
              yield { token: this.token, progress: 0.1 };
            } catch (err: any) {
              logger.error(`Failed to get token uri. Contract: ${this.contract.address} Token: ${mintToken.tokenId}`, err);
              if (err instanceof RefreshTokenMetadataError) {
                throw err;
              }
              const message = typeof err?.message === 'string' ? (err.message as string) : 'Failed to get token uri';
              throw new RefreshTokenUriError(message);
            }

            break;

          case RefreshTokenFlow.Metadata:
            const uriToken = Nft.validateToken(this.token, RefreshTokenFlow.Uri);
            let metadata: TokenMetadata;
            try {
              metadata = await this.getTokenMetadata();
            } catch (err: any) {
              const message = typeof err?.message === 'string' ? (err.message as string) : 'Failed to get token metadata';
              throw new RefreshTokenMetadataError(message);
            }

            try {
              const metadataToken = Nft.validateToken(
                {
                  ...uriToken,
                  metadata,
                  updatedAt: Date.now(),
                  numTraitTypes: metadata?.attributes?.length ?? 0,
                  state: {
                    metadata: {
                      step: RefreshTokenFlow.Image
                    }
                  }
                },
                RefreshTokenFlow.Metadata
              );
              this.token = metadataToken;

              yield { token: this.token, progress: 0.3 };
            } catch (err: any) {
              logger.error('Failed to get token metadata', err);
              if (err instanceof RefreshTokenMetadataError) {
                throw err;
              }
              const message = typeof err?.message === 'string' ? (err.message as string) : 'Failed to get token metadata';
              throw new RefreshTokenMetadataError(message);
            }
            break;

          case RefreshTokenFlow.Image:
            Nft.validateToken(this.token, RefreshTokenFlow.Metadata);
            return;

          case RefreshTokenFlow.Complete:
            Nft.validateToken(this.token, RefreshTokenFlow.Complete);
            return;

          default:
            if (!this.token.state) {
              this.token.state = {
                metadata: {
                  step: RefreshTokenFlow.Uri
                }
              };
            } else {
              this.token.state = {
                ...this.token.state,
                metadata: {
                  step: RefreshTokenFlow.Uri
                }
              };
            }
        }
      }
    } catch (err: RefreshTokenError | any) {
      if (err instanceof RefreshTokenMintError) {
        throw err;
      }

      let error;
      let stepToSave: RefreshTokenFlow = this.token.state?.metadata.step ?? RefreshTokenFlow.Uri;
      if (err instanceof RefreshTokenError) {
        error = err;
      } else {
        const message =
          typeof err?.message === 'string'
            ? (err.message as string)
            : "Failed to refresh metadata. It's likely errors are not being handled correctly.";
        stepToSave = RefreshTokenFlow.Uri; // restart
        error = new RefreshTokenError(stepToSave, message);
      }

      const token: Partial<TokenType> = {
        ...this.token,
        state: {
          metadata: {
            step: stepToSave,
            error: error.toJSON()
          }
        }
      };

      this.token = token;

      yield { token, failed: true, progress: 0 };
    }
  }

  private async getTokenMetadataFromTokenUri(tokenUri: string): Promise<TokenMetadata> {
    const tokenMetadataResponse = await metadataClient.get(tokenUri, 0);
    if (tokenMetadataResponse.statusCode !== 200) {
      throw new RefreshTokenMetadataError(`Bad response. Status Code: ${tokenMetadataResponse.statusCode}`);
    }
    const body = tokenMetadataResponse.body;
    const metadata = JSON.parse(body) as TokenMetadata;

    return metadata;
  }

  private async getTokenMetadataFromMoralis(tokenId: string): Promise<TokenMetadata> {
    const tokenMetadata = await this.moralis.getTokenMetadata(this.contract.address, this.contract.chainId, tokenId);
    return tokenMetadata;
  }

  /**
   * attempts to get token metadata from multiple sources
   */
  async getTokenMetadata(): Promise<TokenMetadata> {
    const tokenUri = this.token.tokenUri;
    let errorMessage = '';

    if (tokenUri) {
      try {
        const metadata = this.getTokenMetadataFromTokenUri(tokenUri);
        return await metadata;
      } catch (err: any) {
        if (typeof err.message === 'string') {
          errorMessage = `TokenUri Failed: ${err.message}`;
        }
      }
    }

    if (this.token.tokenId) {
      try {
        const metadata = this.getTokenMetadataFromMoralis(this.token.tokenId);
        return await metadata;
      } catch (err: any) {
        if (typeof err.message === 'string') {
          errorMessage = ` ${errorMessage} Moralis Failed: ${err.message}`;
        }
      }
    }

    throw new Error(errorMessage || 'Failed to get metadata.');
  }
}
