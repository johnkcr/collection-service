import got, { Response } from 'got';
import { sleep } from '../utils';
import { logger } from '../container';

export async function createInfuraApiKeys(numKeys: number, namePrefix: string): Promise<void> {
  const authKeys = [];

  const authCookie = process.env.INFURA_AUTH_COOKIE;

  if (!authCookie) {
    throw new Error('Invalid auth cookie. Get cookie from browser');
  }

  for (let x = 0; x < numKeys; x += 1) {
    const projectName = `${namePrefix}-${x}`;

    try {
      const result = await createInfuraProject(projectName, authCookie);
      if (result?.result?.project?.id && result?.result?.project?.secret) {
        authKeys.push({ id: result.result.project.id, secret: result.result.project.secret });
        logger.log(`Created key ${x}`);
      } else {
        logger.log('Failed to create key');
      }
    } catch (err) {
      logger.log('Failed to create key');
      logger.error(err);
    }

    await sleep(3000);
  }

  let index = 0;
  for (const key of authKeys) {
    index += 1;
    logger.log(`INFURA_IPFS_PROJECT_ID${index}='${key.id}' \nINFURA_IPFS_PROJECT_SECRET${index}='${key.secret}'`);
  }
}

interface InfuraResponse {
  result: {
    project: {
      id: string;
      user_id: string;
      secret: string;
      name: string;
      deleted: boolean;
      status: number;
      created: string;
      updated: string;
    };
  };
}

async function createInfuraProject(projectName: string, cookies: string): Promise<InfuraResponse | undefined> {
  const url = 'https://infura.io/api/ipfs/projects';
  try {
    const response: Response<InfuraResponse> = await got.post(url, {
      headers: {
        accept: 'application/json, text/plain, */*',
        'accept-encoding': 'gzip, deflate, br',
        'accept-language': 'en-US,en;q=0.9',
        'content-type': 'application/json',
        cookie: `${cookies}`, // create one key, copy the cookie header. it should include 2 stripe cookies and one auth cookie
        origin: 'https://infura.io',
        referer: 'https://infura.io/',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'sec-gpc': '1',
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.87 Safari/537.36'
      },
      json: { name: projectName, api: { downloads_enabled: true }, entity_type: 'project' },
      responseType: 'json'
    });

    if (response.statusCode === 200) {
      return response.body;
    }
  } catch (err) {
    logger.error(err);
  }
}
