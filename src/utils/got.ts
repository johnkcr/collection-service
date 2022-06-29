import {
  CacheError,
  CancelError,
  MaxRedirectsError,
  ParseError,
  ReadError,
  RequestError,
  TimeoutError,
  UnsupportedProtocolError,
  UploadError
} from 'got';

export type GotError =
  | RequestError
  | CacheError
  | ReadError
  | ParseError
  | UploadError
  | MaxRedirectsError
  | UnsupportedProtocolError
  | TimeoutError
  | CancelError;

export function isGotError(error: GotError | unknown): boolean {
  return (
    error instanceof CacheError ||
    error instanceof ReadError ||
    error instanceof RequestError ||
    error instanceof ParseError ||
    error instanceof UploadError ||
    error instanceof MaxRedirectsError ||
    error instanceof UnsupportedProtocolError ||
    error instanceof TimeoutError ||
    error instanceof CancelError
  );
}

const fatal = [CancelError, UnsupportedProtocolError];

export function gotErrorHandler(error: GotError | unknown): { retry: true; delay: number } | { fatal: boolean } {
  if (isGotError(error)) {
    for (const fatalErrorType of fatal) {
      if (error instanceof fatalErrorType) {
        return { fatal: true };
      }
    }
    return { retry: true, delay: 1000 };
  }

  return { fatal: false };
}
