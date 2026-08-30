import { spawnSync } from 'node:child_process';

const SECURITY = '/usr/bin/security';
export const KEYCHAIN_SERVICE = 'trackside';
export const LEGACY_KEYCHAIN_SERVICE = 'minimal-spotify-client';
export const CLIENT_ID_ACCOUNT = 'client-id';
export const REFRESH_TOKEN_ACCOUNT = 'refresh-token';

function run(args: string[]) {
  return spawnSync(SECURITY, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function readFromService(service: string, account: string): string | null {
  const result = run([
    'find-generic-password',
    '-s', service,
    '-a', account,
    '-w',
  ]);

  if (result.status === 44) return null;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || 'Keychain read failed.');
  }
  return result.stdout.trim();
}

export function readCredential(account: string): string | null {
  const current = readFromService(KEYCHAIN_SERVICE, account);
  if (current !== null) return current;
  const legacy = readFromService(LEGACY_KEYCHAIN_SERVICE, account);
  if (legacy === null) return null;
  writeCredential(account, legacy);
  return legacy;
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

function deleteFromService(service: string, account: string): void {
  const result = run([
    'delete-generic-password',
    '-s', service,
    '-a', account,
  ]);

  if (result.status !== 0 && result.status !== 44) {
    throw new Error(result.stderr.trim() || 'Keychain delete failed.');
  }
}

export function deleteCredential(account: string): void {
  deleteFromService(KEYCHAIN_SERVICE, account);
  deleteFromService(LEGACY_KEYCHAIN_SERVICE, account);
}
