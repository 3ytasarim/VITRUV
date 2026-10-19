import { createInterface } from 'node:readline';

/** `--name=value` from argv. */
export function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

/** Reads a line without echoing it (interactive terminals only). */
export function promptHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return Promise.reject(new Error('No interactive terminal for the password prompt.'));
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const writable = rl as unknown as { _writeToOutput: (chunk: string) => void };
  let muted = false;
  writable._writeToOutput = (chunk) => {
    if (!muted) process.stdout.write(chunk);
  };
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

/**
 * The new password: from the named env variable (non-interactive use — unset it afterwards) or
 * typed twice at a hidden prompt. Never printed, never taken from argv (shell history).
 */
export async function readNewPassword(envName: string): Promise<string> {
  const fromEnv = process.env[envName];
  if (fromEnv) return fromEnv;
  const first = await promptHidden('New password: ');
  const second = await promptHidden('Repeat password: ');
  if (first !== second) throw new Error('The passwords do not match.');
  return first;
}
