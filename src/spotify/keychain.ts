import { spawnSync } from 'node:child_process';

const SECURITY = '/usr/bin/security';
export const KEYCHAIN_SERVICE = 'minimal-spotify-client';
export const CLIENT_ID_ACCOUNT = 'client-id';
export const REFRESH_TOKEN_ACCOUNT = 'refresh-token';

function run(args: string[]) {
  return spawnSync(SECURITY, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function readCredential(account: string): string | null {
  const result = run([
    'find-generic-password',
    '-s', KEYCHAIN_SERVICE,
    '-a', account,
    '-w',
  ]);

  if (result.status === 44) return null;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || 'Keychain read failed.');
  }
  return result.stdout.trim();
}

export function writeCredential(account: string, value: string): void {
  const result = run([
    'add-generic-password',
    '-U',
    '-s', KEYCHAIN_SERVICE,
    '-a', account,
    '-w', value,
  ]);

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || 'Keychain write failed.');
  }
}

export function deleteCredential(account: string): void {
  const result = run([
    'delete-generic-password',
    '-s', KEYCHAIN_SERVICE,
    '-a', account,
  ]);

  if (result.status !== 0 && result.status !== 44) {
    throw new Error(result.stderr.trim() || 'Keychain delete failed.');
  }
}
