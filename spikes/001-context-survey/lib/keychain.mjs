import { spawnSync } from 'node:child_process';

const SECURITY = '/usr/bin/security';
const SERVICE = 'minimal-spotify-client';

function run(args) {
  return spawnSync(SECURITY, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function readCredential(account) {
  const result = run([
    'find-generic-password',
    '-s', SERVICE,
    '-a', account,
    '-w',
  ]);

  if (result.status === 44) return null;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || 'Keychain read failed');
  }
  return result.stdout.trim();
}

export function writeCredential(account, value) {
  const result = run([
    'add-generic-password',
    '-U',
    '-s', SERVICE,
    '-a', account,
    '-w', value,
  ]);

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || 'Keychain write failed');
  }
}

export function deleteCredential(account) {
  const result = run([
    'delete-generic-password',
    '-s', SERVICE,
    '-a', account,
  ]);

  if (result.status !== 0 && result.status !== 44) {
    throw new Error(result.stderr.trim() || 'Keychain delete failed');
  }
}
