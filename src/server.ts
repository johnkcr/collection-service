import express, { Request, Response } from 'express';
import { collectionDao, collectionService, logger } from './container';
import { readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { validateAddress, validateChainId, normalizeAddress } from './utils/ethers';
import {
  COLLECTION_QUEUE,
  COLLECTION_QUEUE_API_KEY,
  COLLECTION_SERVICE_URL,
  NULL_ADDR,
  ONE_HOUR,
  ONE_MIN,
  PROJECT,
  PROJECT_LOCATION,
  TASK_QUEUE_SERVICE_ACCOUNT
} from './constants';
import { CloudTasksClient, protos } from '@google-cloud/tasks';
import { hash } from './utils';

export async function main(): Promise<void> {
  const packageDotJSON = resolve(__dirname, '../package.json');
  const { version } = JSON.parse(await readFile(packageDotJSON, 'utf-8'));

  const serviceAccountFile = resolve(__dirname, `../creds/${TASK_QUEUE_SERVICE_ACCOUNT}`);
  process.env.GOOGLE_APPLICATION_CREDENTIALS = serviceAccountFile;
  const client = new CloudTasksClient();

  const app = express();

  app.enable('trust proxy');

  app.use(express.json());
  app.use(express.raw({ type: 'application/octet-stream' }));

  app.get('/', (req, res) => {
    res.send(`NFT Collection Service Version: ${version}`).status(200);
  });

  /**
   * clients can use this endpoint to enqueue collection
   */
  app.post(
    '/collection',
    async (req: Request<any, { chainId: string; address: string; indexInitiator: string }>, res: Response) => {
      let address: string;
      let chainId: string;
      let indexInitiator: string;

      address = req.body.address as string;
      chainId = req.body.chainId as string;
      indexInitiator = req.body.indexInitiator as string;

      if (!indexInitiator) {
        indexInitiator = NULL_ADDR;
      }

      try {
        chainId = validateChainId(chainId);
        address = validateAddress(normalizeAddress(address));
        indexInitiator = validateAddress(normalizeAddress(indexInitiator));
      } catch (err) {
        res.sendStatus(400);
        return;
      }

      try {
        const collection = await collectionDao.get(chainId, address);
        const recentlyUpdated = collection?.state?.create?.updatedAt > Date.now() - 10 * ONE_MIN;
        if (recentlyUpdated) {
          /**
           * collection is already being created
           */
          res.sendStatus(200); // already queued
          return;
        }

        const url = new URL(join(COLLECTION_SERVICE_URL, '/queue/collection')).toString();
        const payload = JSON.stringify({
          chainId,
          address,
          indexInitiator
        });
        const parent = client.queuePath(PROJECT, PROJECT_LOCATION, COLLECTION_QUEUE);

        /**
         * prevent the same collection from being queued more than once an hour
         */
        const hourToCompleteIn = Math.ceil(Date.now() / ONE_HOUR);
        const id = hash(`${chainId}:${address}:${hourToCompleteIn}`);
        const request: protos.google.cloud.tasks.v2.ICreateTaskRequest = {
          parent,
          task: {
            name: join(parent, 'tasks', id),
            httpRequest: {
              httpMethod: 'POST',
              url,
              headers: {
                'x-api-key': COLLECTION_QUEUE_API_KEY,
                'Content-Type': 'application/octet-stream'
              },
              body: Buffer.from(payload).toString('base64')
            }
          }
        };

        const [response] = await client.createTask(request);
        logger.log(response);

        res.sendStatus(202); // added to queue
        return;
      } catch (err: any) {
        if (err.code === 6) {
          res.sendStatus(200); // already queued
          return;
        }
        logger.error(err);
        res.sendStatus(500);
      }
    }
  );

  /**
   * endpoint used by the task queue to create the collection
   */
  app.post(
    '/queue/collection',
    async (req: Request<any, { chainId: string; address: string; indexInitiator: string }>, res: Response) => {
      let address: string;
      let chainId: string;
      let indexInitiator: string;
      try {
        const authHeader = req.headers['x-api-key'];
        if (authHeader !== COLLECTION_QUEUE_API_KEY) {
          res.sendStatus(403);
          return;
        }

        logger.log(req.headers);
        logger.log(req.body);

        const buffer = req.body as Buffer;
        const data = JSON.parse(buffer.toString());
        address = data.address as string;
        chainId = data.chainId as string;
        indexInitiator = data.indexInitiator as string;

        if (!indexInitiator) {
          indexInitiator = NULL_ADDR;
        }

        chainId = validateChainId(chainId);
        address = validateAddress(normalizeAddress(address));
        indexInitiator = validateAddress(normalizeAddress(indexInitiator));
      } catch (err) {
        logger.error(err);
        res.sendStatus(400);
        return;
      }

      try {
        const collection = await collectionDao.get(chainId, address);
        const recentlyUpdated = collection?.state?.create?.updatedAt > Date.now() - 10 * ONE_MIN;
        if (recentlyUpdated) {
          res.sendStatus(200);
          return;
        }

        await collectionService.createCollection(address, chainId, false, false, indexInitiator);
        res.sendStatus(200);
      } catch (err) {
        logger.error(err);
        res.sendStatus(500);
      }
    }
  );

  const PORT = process.env.PORT ?? 8080;

  app.listen(PORT, () => {
    logger.log(`App listening on port ${PORT}`);
  });
}
