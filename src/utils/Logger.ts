// eslint-disable-next-line eslint-comments/disable-enable-pair
/* eslint-disable no-console */
import { ERROR_LOG, ERROR_LOG_FILE, INFO_LOG } from '../constants';
import { singleton } from 'tsyringe';
import { createWriteStream } from 'fs';
import { Console } from 'console';
import { isMainThread } from 'worker_threads';

@singleton()
export default class Logger {
  private readonly errorLogger?: Console;

  constructor() {
    const errorLogFile = ERROR_LOG_FILE;
    if (errorLogFile) {
      const errorStream = createWriteStream(errorLogFile, { encoding: 'utf-8', flags: 'a' });
      this.errorLogger = new Console(errorStream, errorStream);
    }
    this.registerProcessListeners();
  }

  log(message?: any, ...optionalParams: any[]): void {
    if (INFO_LOG) {
      if (optionalParams.length > 0) {
        console.log(message, optionalParams);
      } else {
        console.log(message);
      }
    }
  }

  error(message?: any, ...optionalParams: any[]): void {
    if (ERROR_LOG) {
      if (optionalParams.length > 0) {
        console.error(message, optionalParams);
      } else {
        console.error(message);
      }
    }

    if (ERROR_LOG_FILE && this.errorLogger) {
      if (optionalParams.length > 0) {
        this.errorLogger.error(message, optionalParams);
      } else {
        this.errorLogger.error(message);
      }
    }
  }

  registerProcessListeners(): void {
    process.on('uncaughtException', (error, origin) => {
      this.error('Uncaught exception', error, origin);
    });

    process.on('unhandledRejection', (reason) => {
      this.error('Unhandled rejection', reason);
    });

    process.on('exit', (code) => {
      if (isMainThread) {
        this.log(`Process exiting... Code: ${code}`);
      }
    });
  }
}
