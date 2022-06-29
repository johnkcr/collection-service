export interface ModeArgument {
  arg: string;
  default?: string;
  required?: {
    errorMessage: string;
  };
  validate?: (parsedArg: string) => true | string;
}

export function setTerminalTitle(title: string): void {
  process.stdout.write(String.fromCharCode(27) + ']0;' + title + String.fromCharCode(7));
}

export function parseArgs(modeArgs: ModeArgument[]): { [key: string]: string } {
  const parseArg = (arg: string): string => {
    const fullArg = process.argv.find((item) => {
      return item.includes(arg);
    });
    return (fullArg ?? '').split('=')[1]?.trim() ?? '';
  };

  const args: { [key: string]: string } = {};

  for (const desc of modeArgs) {
    let arg: string | number = parseArg(desc.arg);
    if (!arg && desc.default) {
      arg = desc.default;
    }

    if (desc.required && !arg) {
      throw new Error(desc.required.errorMessage);
    }

    if (typeof desc.validate === 'function') {
      const result = desc.validate(arg);
      if (typeof result === 'string' || !result) {
        throw new Error(result);
      }
    }

    args[desc.arg] = arg;
  }

  return args;
}
