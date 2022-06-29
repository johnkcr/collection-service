import { RefreshTokenFlow, RefreshTokenErrorJson } from '@johnkcr/temple-lib/dist/types/core';
export class RefreshTokenError extends Error {
  discriminator: RefreshTokenFlow;

  constructor(discriminator: RefreshTokenFlow, message?: string) {
    super(message);
    this.discriminator = discriminator;
  }

  toJSON(): RefreshTokenErrorJson {
    return {
      message: this.message,
      discriminator: this.discriminator
    };
  }
}

export class RefreshTokenMintError extends RefreshTokenError {
  constructor(message?: string) {
    super(RefreshTokenFlow.Mint, message);
  }
}

export class RefreshTokenUriError extends RefreshTokenError {
  constructor(message?: string) {
    super(RefreshTokenFlow.Uri, message);
  }
}

export class RefreshTokenMetadataError extends RefreshTokenError {
  constructor(message?: string) {
    super(RefreshTokenFlow.Metadata, message);
  }
}

export class RefreshTokenCacheImageError extends RefreshTokenError {
  constructor(message?: string) {
    super(RefreshTokenFlow.CacheImage, message);
  }
}

export class RefreshTokenOriginalImageError extends RefreshTokenError {
  constructor(message?: string) {
    super(RefreshTokenFlow.Image, message);
  }
}
