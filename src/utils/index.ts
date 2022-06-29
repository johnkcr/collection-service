import { createHash } from 'crypto';

export function filterDuplicates<T>(items: T[], propertySelector: (item: T) => string): T[] {
  const hashes = new Set();
  return items.filter((item: T) => {
    const property = propertySelector(item);
    if (!hashes.has(property)) {
      hashes.add(property);
      return true;
    }
    return false;
  });
}

export async function sleep(duration: number): Promise<void> {
  return await new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, duration);
  });
}

export enum Env {
  Cli = 'cli',
  Script = 'script',
  Serve = 'serve'
}

export function getEnv(): Env {
  switch (process.env.NODE_ENV_SCRIPT) {
    case Env.Cli:
      return Env.Cli;
    case Env.Script:
      return Env.Script;
    case Env.Serve:
      return Env.Serve;
    default:
      throw new Error(`Invalid NODE_ENV_SCRIPT: ${process.env.NODE_ENV_SCRIPT}`);
  }
}

export function getSearchFriendlyString(input: string): string {
  if (!input) {
    return '';
  }
  // remove spaces, dashes and underscores only
  const output = input.replace(/[\s-_]/g, '');
  return output.toLowerCase();
}

/**
 * returns a random int between min (inclusive) and max (inclusive)
 */
export function randomInt(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomItem<T>(array: T[]): T {
  const index = randomInt(0, array.length - 1);
  return array[index];
}

export function hash(data: string): string {
  return createHash('sha256').update(data).digest('hex').trim().toLowerCase();
}
