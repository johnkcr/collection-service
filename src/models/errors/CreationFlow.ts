import { CreationFlow } from '@johnkcr/temple-lib/dist/types/core';

export interface CreationFlowErrorJson {
  message: string;
  discriminator: CreationFlow | 'unknown';
}

export class CreationFlowError extends Error {
  discriminator: CreationFlow | 'unknown';

  constructor(discriminator: CreationFlow | 'unknown', message?: string) {
    super(message);
    this.discriminator = discriminator;
  }

  toJSON(): CreationFlowErrorJson {
    return {
      message: this.message,
      discriminator: this.discriminator
    };
  }
}

export class CollectionCreatorError extends CreationFlowError {
  constructor(message?: string) {
    super(CreationFlow.CollectionCreator, message);
  }
}

export class CollectionMetadataError extends CreationFlowError {
  constructor(message?: string) {
    super(CreationFlow.CollectionMetadata, message);
  }
}

export interface CollectionMintsErrorJSON extends CreationFlowErrorJson {
  lastSuccessfulBlock?: number;
}

export class CollectionMintsError extends CreationFlowError {
  lastSuccessfulBlock?: number;

  constructor(message?: string, lastSuccessfulBlock?: number) {
    super(CreationFlow.CollectionMints, message);
    this.lastSuccessfulBlock = lastSuccessfulBlock;
  }

  toJSON(): CollectionMintsErrorJSON {
    if (this.lastSuccessfulBlock !== undefined) {
      return {
        discriminator: this.discriminator,
        lastSuccessfulBlock: this.lastSuccessfulBlock,
        message: this.message
      };
    }
    return {
      discriminator: this.discriminator,
      message: this.message
    };
  }
}

export class CollectionTokenMetadataError extends CreationFlowError {
  constructor(message?: string) {
    super(CreationFlow.TokenMetadata, message);
  }
}

export class CollectionAggregateMetadataError extends CreationFlowError {
  constructor(message?: string) {
    super(CreationFlow.AggregateMetadata, message);
  }
}

export class CollectionCacheImageError extends CreationFlowError {
  constructor(message?: string) {
    super(CreationFlow.CacheImage, message);
  }
}

export class CollectionOriginalImageError extends CreationFlowError {
  constructor(message?: string) {
    super(CreationFlow.ValidateImage, message);
  }
}

export class CollectionImageValidationError extends CreationFlowError {
  constructor(message?: string) {
    super(CreationFlow.ValidateImage, message);
  }
}

export class CollectionIndexingError extends CreationFlowError {
  constructor(message?: string) {
    super(CreationFlow.Incomplete, message);
  }
}

export class UnknownError extends CreationFlowError {
  constructor(message?: string) {
    super('unknown', message);
  }
}
