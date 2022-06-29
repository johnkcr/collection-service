import { singleton } from 'tsyringe';
import firebaseAdmin, { ServiceAccount } from 'firebase-admin';
import { Bucket, File } from '@google-cloud/storage';
import { FB_STORAGE_BUCKET, FIREBASE_SERVICE_ACCOUNT } from '../constants';
import { Readable } from 'stream';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getCollectionDocId } from '@johnkcr/temple-lib/dist/utils';

@singleton()
export default class Firebase {
  db: FirebaseFirestore.Firestore;

  firebaseAdmin: firebaseAdmin.app.App;

  bucket: Bucket;

  constructor() {
    const serviceAccountFile = resolve(__dirname, `../../creds/${FIREBASE_SERVICE_ACCOUNT}`);

    const serviceAccount = JSON.parse(readFileSync(serviceAccountFile, 'utf-8'));

    const app = firebaseAdmin.initializeApp({
      credential: firebaseAdmin.credential.cert(serviceAccount as ServiceAccount),
      storageBucket: FB_STORAGE_BUCKET
    });

    this.firebaseAdmin = app;
    this.db = firebaseAdmin.firestore();
    this.db.settings({ ignoreUndefinedProperties: true });
    this.bucket = firebaseAdmin.storage().bucket();
  }

  getCollectionDocRef(chainId: string, address: string): FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData> {
    const collectionDoc = this.db.collection('collections').doc(getCollectionDocId({chainId, collectionAddress: address}));
    return collectionDoc;
  }

  getTokensCollectionRef(
    chainId: string,
    address: string
  ): FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData> {
    const collectionDoc = this.getCollectionDocRef(chainId, address);
    const nftsCollection = collectionDoc.collection('nfts');
    return nftsCollection;
  }

  getTokenDocRef(
    chainId: string,
    address: string,
    tokenId: string
  ): FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData> {
    const tokensCollectionRef = this.getTokensCollectionRef(chainId, address);
    return tokensCollectionRef.doc(tokenId);
  }

  async uploadReadable(readable: Readable, path: string, contentType: string): Promise<File> {
    let attempts = 0;
    for(;;) {
      attempts += 1;
      try {
        let remoteFile = this.bucket.file(path);
        const existsArray = await remoteFile.exists();
        if (existsArray && existsArray.length > 0 && !existsArray[0]) {
          remoteFile = await new Promise<File>((resolve, reject) => {
            readable.pipe(
              remoteFile
                .createWriteStream({
                  metadata: {
                    contentType
                  }
                })
                .on('error', (err) => {
                  reject(err);
                })
                .on('finish', () => {
                  // logger.log(`uploaded: ${remoteFile.name}`);
                  resolve(remoteFile);
                })
            );
          });

          return remoteFile;
        }
        return remoteFile;
      } catch (err) {
        if (attempts > 3) {
          throw err;
        }
      }
    }
  }

  async uploadBuffer(buffer: Buffer, path: string, contentType: string): Promise<File> {
    return await this.uploadReadable(Readable.from(buffer), path, contentType);
  }
}
