/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable no-case-declarations */
/* eslint-disable @typescript-eslint/consistent-type-assertions */
import {
  ImageData,
  ImageToken,
  MetadataData,
  MetadataToken,
  MintToken,
  RefreshTokenFlow,
  Token,
  TokenMetadata,
  Collection as CollectionType,
  CreationFlow
} from '@johnkcr/temple-lib/dist/types/core';
import Emittery from 'emittery';
import { COLLECTION_SCHEMA_VERSION } from '../constants';
import { getSearchFriendlyString } from '../utils';
import {
  CollectionAggregateMetadataError,
  CollectionCacheImageError,
  CollectionCreatorError,
  CollectionIndexingError,
  CollectionMetadataError,
  CollectionMintsError,
  CollectionOriginalImageError,
  CollectionTokenMetadataError,
  CollectionImageValidationError,
  CreationFlowError,
  UnknownError
} from './errors/CreationFlow';
import Nft from './Nft';
import { alchemy, logger, opensea } from '../container';
import {
  RefreshTokenCacheImageError,
  RefreshTokenMetadataError,
  RefreshTokenMintError,
  RefreshTokenOriginalImageError,
  RefreshTokenUriError
} from './errors/RefreshTokenFlow';
import AbstractCollection, { CollectionEmitter } from './Collection.abstract';

type CollectionCreatorType = Pick<
  CollectionType,
  | 'chainId'
  | 'address'
  | 'tokenStandard'
  | 'hasBlueCheck'
  | 'deployedAt'
  | 'deployer'
  | 'deployedAtBlock'
  | 'owner'
  | 'state'
  | 'indexInitiator'
>;
type CollectionMetadataType = CollectionCreatorType & Pick<CollectionType, 'metadata' | 'slug'>;
type CollectionMintsType = CollectionMetadataType;
type CollectionTokenMetadataType = CollectionMetadataType & Pick<CollectionType, 'numNfts'>;

export default class Collection extends AbstractCollection {
  /**
   * createCollection defines a flow to get the initial data for a collection
   *
   * each step in the flow has a structure like
   * 1. (optional) request tokens from the client
   * 2. perform some validation and/or add some data to the collection
   * 3. update the collection object, set the next step, and yield the collection
   */
  async *createCollection(
    initialCollection: Partial<CollectionType>,
    emitter: CollectionEmitter,
    indexInitiator: string,
    hasBlueCheck?: boolean
  ): AsyncGenerator<{ collection: Partial<CollectionType>; action?: 'tokenRequest' }, any, Array<Partial<Token>> | undefined> {
    let collection: CollectionCreatorType | CollectionMetadataType | CollectionTokenMetadataType | CollectionType =
      initialCollection as any;
    let step: CreationFlow = collection?.state?.create?.step || CreationFlow.CollectionCreator;
    try {
      while (true) {
        step = collection?.state?.create?.step || CreationFlow.CollectionCreator;
        switch (step) {
          case CreationFlow.CollectionCreator: // resets the collection
            try {
              collection = await this.getInitialCollection(
                collection,
                indexInitiator,
                hasBlueCheck ?? false,
                CreationFlow.CollectionMetadata
              );
              yield { collection };
            } catch (err: any) {
              logger.error('Failed to get collection creator', err);
              const message = typeof err?.message === 'string' ? (err.message as string) : 'Failed to get collection creator';
              throw new CollectionCreatorError(message);
            }
            break;

          case CreationFlow.CollectionMetadata:
            try {
              collection = await this.getCollectionMetadata(collection, CreationFlow.CollectionMints);
              yield { collection };
            } catch (err: any) {
              const message = typeof err?.message === 'string' ? (err.message as string) : 'Failed to get collection metadata';
              throw new CollectionMetadataError(message);
            }
            break;

          case CreationFlow.CollectionMints:
            try {
              collection = await this.getCollectionMints(
                collection as CollectionMetadataType,
                emitter,
                CreationFlow.TokenMetadata
              );

              yield { collection }; // update collection
            } catch (err: any) {
              logger.error('Failed to get collection mints', err);
              if (err instanceof CollectionMintsError) {
                throw err;
              }
              const message = typeof err?.message === 'string' ? (err.message as string) : 'Failed to get collection mints';
              throw new CollectionMintsError(message);
            }
            break;

          case CreationFlow.TokenMetadata:
            try {
              const mintTokens: Array<Partial<Token>> | undefined = yield {
                collection: collection,
                action: 'tokenRequest'
              };
              if (!mintTokens) {
                throw new CollectionMintsError('Token metadata received undefined mint tokens');
              }

              collection = await this.getCollectionTokenMetadata(
                mintTokens,
                collection as CollectionMetadataType,
                emitter,
                CreationFlow.TokenMetadataUri
              );
              yield { collection };
            } catch (err: any) {
              logger.error('Failed to get collection mint tokens', err);
              if (err instanceof CollectionMintsError) {
                throw err;
              }
              // if any token fails we should throw an error
              const message = typeof err?.message === 'string' ? (err.message as string) : 'Failed to get all tokens';
              throw new CollectionTokenMetadataError(message);
            }
            break;

          // leave this code commented; might use in the future
          // case CreationFlow.TokenMetadataOS:
          //   try {
          //     let tokens: Token[] = [];
          //     const injectedTokens = yield { collection: collection, action: 'tokenRequest' };
          //     if (!injectedTokens) {
          //       throw new CollectionCacheImageError('Client failed to inject tokens');
          //     }
          //     tokens = injectedTokens as Token[];
          //     collection = await this.getCollectionTokenMetadataFromOS(tokens, collection as CollectionTokenMetadataType, emitter,  CreationFlow.TokenMetadataUri);

          //     yield { collection };
          //   } catch (err: any) {
          //     logger.error('Failed to get token metadata from OS', err);
          //     if (err instanceof CollectionMintsError) {
          //       throw err;
          //     }
          //     // if any token fails we should throw an error
          //     const message = typeof err?.message === 'string' ? (err.message as string) : 'Failed to get all tokens';
          //     throw new CollectionTokenMetadataError(message);
          //   }
          //   break;

          case CreationFlow.TokenMetadataUri:
            try {
              let tokens: Token[] = [];
              const injectedTokens = yield { collection: collection, action: 'tokenRequest' };
              if (!injectedTokens) {
                throw new CollectionTokenMetadataError('Client failed to inject tokens');
              }
              tokens = injectedTokens as Token[];

              collection = await this.getCollectionTokenMetadataUri(
                tokens,
                collection as CollectionMetadataType,
                emitter,
                CreationFlow.AggregateMetadata
              );
              yield { collection };
            } catch (err: any) {
              logger.error('Failed to get token metadata from uri', err);
              throw err;
            }
            break;

          case CreationFlow.AggregateMetadata:
            try {
              let tokens: Token[] = [];
              const injectedTokens = yield { collection: collection, action: 'tokenRequest' };
              if (!injectedTokens) {
                throw new CollectionAggregateMetadataError('Client failed to inject tokens');
              }
              tokens = injectedTokens as Token[];

              const expectedNumNfts = (collection as CollectionTokenMetadataType).numNfts;
              const numNfts = tokens.length;
              const invalidTokens = [];
              for (const token of tokens) {
                try {
                  Nft.validateToken(token, RefreshTokenFlow.Metadata);
                } catch (err) {
                  invalidTokens.push(token);
                }
              }

              if (expectedNumNfts !== numNfts || invalidTokens.length > 0) {
                throw new CollectionTokenMetadataError(
                  `Received invalid tokens. Expected: ${expectedNumNfts} Received: ${numNfts}. Invalid tokens: ${invalidTokens.length}`
                );
              }

              collection = this.getCollectionAggregatedMetadata(
                tokens,
                collection as CollectionTokenMetadataType,
                emitter,
                CreationFlow.CacheImage
              );

              yield { collection };
            } catch (err: any) {
              logger.error('Failed to aggregate collection metadata', err);
              if (err instanceof CollectionTokenMetadataError) {
                throw err;
              }
              const message = typeof err?.message === 'string' ? (err.message as string) : 'Failed to aggregate metadata';
              throw new CollectionAggregateMetadataError(message);
            }
            break;

          case CreationFlow.CacheImage:
            try {
              let tokens: Token[] = [];
              const injectedTokens = yield { collection: collection, action: 'tokenRequest' };
              if (!injectedTokens) {
                throw new CollectionCacheImageError('Client failed to inject tokens');
              }
              tokens = injectedTokens as Token[];

              collection = await this.getCollectionCachedImages(
                tokens,
                collection as CollectionType,
                emitter,
                CreationFlow.ValidateImage
              );
              yield { collection };
            } catch (err: any) {
              logger.error('Failed to cache images', err);
              // if any token fails we should throw an error
              const message = typeof err?.message === 'string' ? (err.message as string) : 'Failed to get all tokens';
              throw new CollectionCacheImageError(message);
            }
            break;

          case CreationFlow.ValidateImage:
            try {
              /**
               * validate tokens
               */
              const tokens: Array<Partial<Token>> | undefined = yield {
                collection: collection,
                action: 'tokenRequest'
              };

              if (!tokens) {
                throw new CollectionTokenMetadataError('Client failed to inject tokens');
              }

              const invalidCacheImageTokens = [];
              for (const token of tokens) {
                try {
                  Nft.validateToken(token, RefreshTokenFlow.CacheImage);
                } catch (err) {
                  invalidCacheImageTokens.push(token);
                }
              }

              // try invalid cache image tokens another way
              let j = 0;
              for (const token of invalidCacheImageTokens) {
                j++;
                const metadata = await opensea.getNFTMetadata(this.contract.address, token.tokenId ?? '');
                const imageToken: ImageData & Partial<Token> = {
                  tokenId: token.tokenId,
                  image: { url: metadata.image, originalUrl: token.metadata?.image, updatedAt: Date.now() }
                } as ImageToken;
                void emitter.emit('image', imageToken);
                void emitter.emit('progress', {
                  step: CreationFlow.ValidateImage,
                  progress: Math.floor((j / invalidCacheImageTokens.length) * 100 * 100) / 100
                });
              }

              const collectionMetadataCollection: CollectionTokenMetadataType = {
                ...(collection as CollectionTokenMetadataType),
                numNfts: tokens.length,
                state: {
                  ...collection.state,
                  create: {
                    progress: 0,
                    updatedAt: Date.now(),
                    step: CreationFlow.Complete // update step
                  }
                }
              };
              collection = collectionMetadataCollection; // update collection
              yield { collection };
            } catch (err: any) {
              logger.error('Failed to validate tokens', err);
              if (err instanceof CollectionTokenMetadataError || err instanceof CollectionCacheImageError) {
                throw err;
              }
              const message = typeof err?.message === 'string' ? (err.message as string) : 'Failed to validate tokens';
              throw new CollectionImageValidationError(message);
            }
            break;

          case CreationFlow.Complete:
            /**
             * validate tokens
             */
            const finalTokens: Array<Partial<Token>> | undefined = yield {
              collection: collection,
              action: 'tokenRequest'
            };

            if (!finalTokens) {
              throw new CollectionMintsError('Token metadata received undefined tokens');
            }

            const invalidTokens = [];
            for (const token of finalTokens) {
              try {
                Nft.validateToken(token, RefreshTokenFlow.Complete);
              } catch (err) {
                invalidTokens.push({ token, err });
              }
            }

            if (invalidTokens.length > 0) {
              logger.error('Final invalid tokens', JSON.stringify(invalidTokens.map((token) => token.token.tokenId)));
              if (invalidTokens[0].err instanceof RefreshTokenMintError) {
                throw new CollectionMintsError(`Received ${invalidTokens.length} invalid tokens`);
              } else if (invalidTokens[0].err instanceof RefreshTokenUriError) {
                throw new CollectionTokenMetadataError(`Received ${invalidTokens.length} invalid tokens`);
              } else if (invalidTokens[0].err instanceof RefreshTokenMetadataError) {
                throw new CollectionTokenMetadataError(`Received ${invalidTokens.length} invalid tokens`);
              } else if (invalidTokens[0].err instanceof RefreshTokenCacheImageError) {
                throw new CollectionCacheImageError(`Received ${invalidTokens.length} invalid tokens`);
              } else if (invalidTokens[0].err instanceof RefreshTokenOriginalImageError) {
                throw new CollectionOriginalImageError(`Received ${invalidTokens.length} invalid tokens`);
              } else {
                throw new CollectionIndexingError(`Received ${invalidTokens.length} invalid tokens`);
              }
            }
            void emitter.emit('progress', { step, progress: 100 });
            return;

          // todo: needs impl
          case CreationFlow.Incomplete:
          case CreationFlow.Unknown:
          default:
            return;
        }
        void emitter.emit('progress', { step, progress: 100 });
      }
    } catch (err: CreationFlowError | any) {
      logger.error(err);
      let error;
      let stepToSave: CreationFlow = step;
      if (err instanceof CreationFlowError && stepToSave === CreationFlow.Complete) {
        error = err;
        stepToSave = CreationFlow.Incomplete;
      } else if (err instanceof CreationFlowError) {
        error = err;
        if (err.discriminator === 'unknown') {
          stepToSave = CreationFlow.CollectionCreator;
        } else {
          stepToSave = err.discriminator;
        }
      } else {
        const message =
          typeof err?.message === 'string'
            ? (err.message as string)
            : "Failed to create collection. It's likely errors are not being handled correctly.";
        error = new UnknownError(message);
        stepToSave = CreationFlow.Unknown;
      }

      collection = {
        ...collection,
        state: {
          ...collection.state,
          create: {
            ...collection.state?.create,
            step: stepToSave,
            updatedAt: Date.now(),
            error: error.toJSON()
          },
          export: {
            done: false
          }
        }
      };
      yield { collection };
    }
  }

  private async getInitialCollection(
    collection: Partial<CollectionType>,
    indexInitiator: string,
    hasBlueCheck: boolean,
    nextStep: CreationFlow
  ): Promise<CollectionCreatorType> {
    const creator = await this.getCreator();
    const initialCollection: CollectionCreatorType = {
      indexInitiator: indexInitiator,
      chainId: this.contract.chainId,
      address: this.contract.address,
      tokenStandard: this.contract.standard,
      hasBlueCheck: hasBlueCheck ?? false,
      ...creator,
      state: {
        ...(collection?.state ?? {}),
        create: {
          progress: 0,
          step: nextStep,
          updatedAt: Date.now()
        },
        version: COLLECTION_SCHEMA_VERSION,
        export: {
          done: collection?.state?.export?.done ?? false
        }
      }
    };
    return initialCollection;
  }

  private async getCollectionMetadata(
    collection: CollectionCreatorType,
    nextStep: CreationFlow
  ): Promise<CollectionMetadataType> {
    const collectionMetadata = await this.collectionMetadataProvider.getCollectionMetadata(this.contract.address);

    const slug = getSearchFriendlyString(collectionMetadata.links.slug ?? '');
    if (!slug) {
      throw new Error('Failed to find collection slug');
    }

    const collectionMetadataCollection: CollectionMetadataType = {
      ...collection,
      metadata: collectionMetadata,
      slug: slug,
      state: {
        ...collection.state,
        create: {
          progress: 0,
          step: nextStep,
          updatedAt: Date.now()
        },
        export: {
          done: false
        }
      }
    };

    return collectionMetadataCollection;
  }

  private async getCollectionMints(
    collection: CollectionMetadataType,
    emitter: CollectionEmitter,
    nextStep: CreationFlow
  ): Promise<CollectionMintsType> {
    let resumeFromBlock: number | undefined;
    if (collection.state.create.error?.discriminator === CreationFlow.CollectionMints) {
      resumeFromBlock = collection.state.create.error?.lastSuccessfulBlock;
    }

    const mintEmitter = new Emittery<{ mint: MintToken; progress: { progress: number } }>();

    mintEmitter.on('mint', (mintToken) => {
      void emitter.emit('mint', mintToken);
    });

    mintEmitter.on('progress', ({ progress }) => {
      void emitter.emit('progress', { progress, step: CreationFlow.CollectionMints });
    });

    const { failedWithUnknownErrors, gotAllBlocks, lastSuccessfulBlock } = await this.getMints(
      mintEmitter,
      resumeFromBlock ?? collection.deployedAtBlock
    );

    if (failedWithUnknownErrors > 0) {
      throw new CollectionMintsError(`Failed to get mints for ${failedWithUnknownErrors} tokens with unknown errors`); // get all blocks again
    } else if (!gotAllBlocks) {
      throw new CollectionMintsError(`Failed to get mints for all blocks`, lastSuccessfulBlock);
    }

    const collectionMintsCollection: CollectionMintsType = {
      ...collection,
      state: {
        ...collection.state,
        create: {
          progress: 0,
          step: nextStep,
          updatedAt: Date.now()
        }
      }
    };

    return collectionMintsCollection;
  }

  private async getCollectionTokenMetadata(
    mintTokens: Array<Partial<Token>>,
    collection: CollectionMintsType,
    emitter: CollectionEmitter,
    nextStep: CreationFlow
  ): Promise<CollectionTokenMetadataType> {
    let tokensValid = true;
    for (const token of mintTokens) {
      try {
        Nft.validateToken(token, RefreshTokenFlow.Mint);
      } catch (err) {
        tokensValid = false;
      }
    }
    if (!tokensValid) {
      throw new CollectionMintsError('Token metadata received invalid mint tokens');
    }
    const alchemyLimit = 100;
    const numIters = Math.ceil(mintTokens.length / alchemyLimit);
    let startToken = '';
    for (let i = 0; i < numIters; i++) {
      const data = await alchemy.getNFTsOfCollection(this.contract.address, startToken);
      startToken = data.nextToken;
      for (const datum of data.nfts) {
        const metadata = (JSON.parse(JSON.stringify(datum.metadata)) ?? {}) as TokenMetadata;
        metadata.description = datum.description ?? '';
        metadata.image = datum.metadata?.image ?? datum.tokenUri?.gateway;
        const tokenIdStr = datum?.id?.tokenId;
        let tokenId;
        if (tokenIdStr?.startsWith('0x')) {
          tokenId = String(parseInt(tokenIdStr, 16));
        }
        if (tokenId) {
          const tokenWithMetadata: MetadataData & Partial<Token> = {
            slug: getSearchFriendlyString(datum.title ?? metadata.name ?? metadata.title ?? ''),
            tokenId,
            tokenUri: datum.tokenUri?.raw,
            numTraitTypes: metadata?.attributes?.length,
            metadata,
            updatedAt: Date.now()
          };
          void emitter.emit('metadata', tokenWithMetadata);
        }
      }
      void emitter.emit('progress', {
        step: CreationFlow.TokenMetadata,
        progress: Math.floor(((i * alchemyLimit) / mintTokens.length) * 100 * 100) / 100
      });
    }

    const collectionMetadataCollection: CollectionTokenMetadataType = {
      ...collection,
      numNfts: mintTokens.length,
      state: {
        ...collection.state,
        create: {
          progress: 0,
          step: nextStep,
          updatedAt: Date.now()
        }
      }
    };

    return collectionMetadataCollection;
  }

  private async getCollectionTokenMetadataUri(
    tokens: Token[],
    collection: CollectionMintsType,
    emitter: CollectionEmitter,
    nextStep: CreationFlow
  ): Promise<CollectionTokenMetadataType> {
    const metadataLessTokens = [];
    for (const token of tokens) {
      try {
        Nft.validateToken(token, RefreshTokenFlow.Metadata);
      } catch (err) {
        metadataLessTokens.push(token);
      }
    }

    const tokenPromises: Array<Promise<MetadataToken>> = [];
    let progress = 0;
    for (const token of metadataLessTokens) {
      const nft = new Nft(token as MintToken, this.contract, this.ethersQueue);
      const iterator = nft.refreshToken();
      // eslint-disable-next-line no-async-promise-executor
      const tokenWithMetadataPromise = new Promise<MetadataToken>(async (resolve, reject) => {
        let tokenWithMetadata = token as Partial<Token>;
        try {
          let prevTokenProgress = 0;
          for await (const { token: intermediateToken, failed, progress: tokenProgress } of iterator) {
            progress = progress - prevTokenProgress + tokenProgress;
            prevTokenProgress = tokenProgress;

            void emitter.emit('progress', {
              step: CreationFlow.TokenMetadataUri,
              progress: Math.floor((progress / metadataLessTokens.length) * 100 * 100) / 100
            });
            if (failed) {
              reject(new Error(intermediateToken.state?.metadata.error?.message));
            } else {
              tokenWithMetadata = intermediateToken;
            }
          }
          if (!tokenWithMetadata) {
            throw new Error('Failed to refresh token');
          }

          progress = progress - prevTokenProgress + 1;
          void emitter.emit('progress', {
            step: nextStep,
            progress: Math.floor((progress / metadataLessTokens.length) * 100 * 100) / 100
          });

          void emitter.emit('token', tokenWithMetadata as Token);
          resolve(tokenWithMetadata as MetadataToken);
        } catch (err) {
          logger.error(err);
          if (err instanceof RefreshTokenMintError) {
            reject(new Error('Invalid mint data'));
          }
          reject(err);
        }
      });

      tokenPromises.push(tokenWithMetadataPromise);
    }

    const results = await Promise.allSettled(tokenPromises);
    let res = { reason: '', failed: false };
    for (const result of results) {
      if (result.status === 'rejected') {
        const message = typeof result?.reason === 'string' ? result.reason : 'Failed to refresh token';
        res = { reason: message, failed: true };
        if (result.reason === 'Invalid mint data') {
          throw new CollectionMintsError('Tokens contained invalid mint data');
        }
      }
    }

    if (res.failed) {
      throw new Error(res.reason);
    }

    const collectionMetadataCollection: CollectionTokenMetadataType = {
      ...collection,
      numNfts: tokens.length,
      state: {
        ...collection.state,
        create: {
          progress: 0,
          step: nextStep, // update step
          updatedAt: Date.now()
        }
      }
    };
    return collectionMetadataCollection; // update collection
  }

  private getCollectionAggregatedMetadata(
    tokens: Token[],
    collection: CollectionTokenMetadataType,
    emitter: CollectionEmitter,
    nextStep: CreationFlow
  ): CollectionType {
    const attributes = this.contract.aggregateTraits(tokens) ?? {};
    const tokensWithRarity = this.contract.calculateRarity(tokens, attributes);
    for (const token of tokensWithRarity) {
      void emitter.emit('token', token).catch((err) => {
        logger.log('error while emitting token');
        logger.error(err);
        // safely ignore
      });
    }

    const aggregatedCollection: CollectionType = {
      ...collection,
      attributes,
      numTraitTypes: Object.keys(attributes).length,
      numOwnersUpdatedAt: 0,
      state: {
        ...collection.state,
        create: {
          progress: 0,
          step: nextStep,
          updatedAt: Date.now()
        }
      }
    };

    return aggregatedCollection;
  }

  private async getCollectionCachedImages(
    tokens: Token[],
    collection: CollectionType,
    emitter: CollectionEmitter,
    nextStep: CreationFlow
  ): Promise<CollectionTokenMetadataType> {
    const openseaLimit = 50;
    const openseaTokenIdsLimit = 20;

    const tokensMap: { [key: string]: Token } = tokens.reduce((acc, item) => {
      if (item?.tokenId) {
        return {
          ...acc,
          [item.tokenId]: item
        };
      }
      return acc;
    }, {});

    // fetch tokens that don't have images
    const imageLessTokens = [];
    for (const token of tokens) {
      if (!token.image || !token.image.originalUrl || !token.image.url || !token.image.updatedAt) {
        imageLessTokens.push(token);
      }
    }
    const numImagelessTokens = imageLessTokens.length;
    const numTokens = tokens.length;
    const percentFailed = Math.floor((numImagelessTokens / numTokens) * 100);
    if (percentFailed < 40) {
      const numIters = Math.ceil(numImagelessTokens / openseaTokenIdsLimit);
      for (let i = 0; i < numIters; i++) {
        const tokenSlice = tokens.slice(i * openseaTokenIdsLimit, (i + 1) * openseaTokenIdsLimit);
        let tokenIdsConcat = '';
        for (const token of tokenSlice) {
          tokenIdsConcat += `token_ids=${token.tokenId}&`;
        }
        const data = await opensea.getTokenIdsOfContract(this.contract.address, tokenIdsConcat);
        for (const datum of data.assets) {
          const token = tokensMap[datum?.token_id];
          const metadata = token?.metadata;
          const imageToken: ImageData & Partial<Token> = {
            tokenId: datum.token_id,
            image: { url: datum.image_url, originalUrl: datum.image_original_url ?? metadata?.image, updatedAt: Date.now() }
          } as ImageToken;
          void emitter.emit('image', imageToken);
        }
        void emitter.emit('progress', {
          step: CreationFlow.CacheImage,
          progress: Math.floor(((i * openseaTokenIdsLimit) / numImagelessTokens) * 100 * 100) / 100
        });
      }
    } else {
      const numIters = Math.ceil(numTokens / openseaLimit);
      let cursor = '';
      for (let i = 0; i < numIters; i++) {
        const data = await opensea.getNFTsOfContract(this.contract.address, openseaLimit, cursor);
        // update cursor
        cursor = data.next;
        for (const datum of data.assets) {
          const token = tokensMap[datum?.token_id];
          const metadata = token?.metadata;
          const imageToken: ImageData & Partial<Token> = {
            tokenId: datum.token_id,
            image: { url: datum.image_url, originalUrl: datum.image_original_url ?? metadata?.image, updatedAt: Date.now() }
          } as ImageToken;
          void emitter.emit('image', imageToken);
        }
        void emitter.emit('progress', {
          step: CreationFlow.CacheImage,
          progress: Math.floor(((i * openseaLimit) / numTokens) * 100 * 100) / 100
        });
      }
    }

    const collectionMetadataCollection: CollectionTokenMetadataType = {
      ...(collection as CollectionTokenMetadataType),
      numNfts: tokens.length,
      state: {
        ...collection.state,
        create: {
          progress: 0,
          step: nextStep, // update step
          updatedAt: Date.now()
        }
      }
    };
    return collectionMetadataCollection;
  }

  // private async getCollectionTokenMetadataFromOS(tokens: Array<Partial<Token>>, collection: CollectionTokenMetadataType, emitter: CollectionEmitter, nextStep: CreationFlow): Promise<CollectionTokenMetadataType> {
  //   // metadata less tokens
  //   const metadataLessTokens = [];
  //   for (const token of tokens) {
  //     try {
  //       Nft.validateToken(token, RefreshTokenFlow.Metadata);
  //     } catch (err) {
  //       metadataLessTokens.push(token);
  //     }
  //   }
  //   const numTokens = metadataLessTokens.length;
  //   const openseaLimit = 20;
  //   const numIters = Math.ceil(numTokens / openseaLimit);
  //   for (let i = 0; i < numIters; i++) {
  //     const tokenIds = tokens.slice(i * openseaLimit, (i + 1) * openseaLimit);
  //     let tokenIdsConcat = '';
  //     for (const tokenId of tokenIds) {
  //       tokenIdsConcat += `token_ids=${tokenId.tokenId}&`;
  //     }
  //     const data = await opensea.getTokenIdsOfContract(this.contract.address, tokenIdsConcat);
  //     for (const datum of data.assets) {
  //       const metaToken: MetadataData & Partial<Token> = {
  //         updatedAt: Date.now(),
  //         tokenId: datum.token_id,
  //         slug: getSearchFriendlyString(datum.name),
  //         numTraitTypes: datum.traits?.length,
  //         metadata: {
  //           name: datum.name ?? null,
  //           title: datum.name ?? null,
  //           image: datum.image_url ?? '',
  //           image_data: '',
  //           external_url: datum?.external_link ?? '',
  //           description: datum.description ?? '',
  //           attributes: datum.traits,
  //           background_color: datum.background_color ?? '',
  //           animation_url: datum?.animation_url ?? '',
  //           youtube_url: ''
  //         },
  //         image: { url: datum.image_url, originalUrl: datum.image_original_url, updatedAt: Date.now() }
  //       };
  //       void emitter.emit('metadata', metaToken);
  //     }
  //     void emitter.emit('progress', {
  //       step: CreationFlow.TokenMetadataOS,
  //       progress: Math.floor(((i * openseaLimit) / numTokens) * 100 * 100) / 100
  //     });
  //   }

  //   const collectionMetadataCollection: CollectionTokenMetadataType = {
  //     ...(collection ),
  //     numNfts: tokens.length,
  //     state: {
  //       ...collection.state,
  //       create: {
  //         updatedAt: Date.now(),
  //         progress: 100,
  //         step: nextStep // update step
  //       }
  //     }
  //   };

  //   return collectionMetadataCollection;
  // }
}
