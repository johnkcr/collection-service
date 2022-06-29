// eslint-disable-next-line eslint-comments/disable-enable-pair
/* eslint-disable @typescript-eslint/no-unsafe-call */
import fileType from 'file-type';
import mime from 'mime-types';
import Reader from 'it-reader';

const minimumBytes = 4100;

/**
 * detectContentType attempts to determine the content type of a readable stream
 *
 * code is from js-ipfs/packages/ipfs-http-response/src/utils/content-type.js
 *
 * @param {string} path
 * @param {AsyncIterable<Uint8Array>} source
 * @returns {Promise<{ source: AsyncIterable<Uint8Array>, contentType?: string }>}
 */
export const detectContentType = async (path, source) => {
  let fileSignature;

  // try to guess the filetype based on the first bytes
  // note that `file-type` doesn't support svgs, therefore we assume it's a svg if path looks like it
  if (!path.endsWith('.svg')) {
    try {
      const reader = Reader(source);
      const { value, done } = await reader.next(minimumBytes);

      if (done) return { source: reader };

      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      fileSignature = await fileType.fromBuffer(value.slice());

      // eslint-disable-next-line @typescript-eslint/require-await
      source = (async function* () {
        // eslint-disable-line require-await
        yield value;
        yield* reader;
      })();
    } catch (/** @type {any} */ err) {
      if (err.code !== 'ERR_UNDER_READ') throw err;

      // not enough bytes for sniffing, just yield the data
      // eslint-disable-next-line @typescript-eslint/require-await
      source = (async function* () {
        // eslint-disable-line require-await
        yield err.buffer; // these are the bytes that were read (if any)
      })();
    }
  }

  // if we were unable to, fallback to the `path` which might contain the extension
  const mimeType = mime.lookup(fileSignature ? fileSignature.ext : path);

  return { source, contentType: mime.contentType(mimeType) };
};
