import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from 'vitest';

test('reports invalid UTF-8 after conditional access without stalling', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const temporaryRoot = path.join(root, '.tmp');
  mkdirSync(temporaryRoot, { recursive: true });
  const directory = mkdtempSync(path.join(temporaryRoot, 'scanner-recovery-'));
  const library = path.join(directory, 'c-sharp-parser');
  const script = path.join(root, 'script/tree-sitter');
  try {
    const build = spawnSync(script, ['build', '-o', library], {
      cwd: root,
      encoding: 'utf8',
      timeout: 300_000,
    });
    expect(build.error, build.stderr).toBeUndefined();
    expect(build.status, build.stderr).toBe(0);
    const source = path.join(directory, 'invalid.cs');
    writeFileSync(source, Buffer.concat([Buffer.from('var r=a?[0]'), Buffer.from([0xff]), Buffer.from(';')]));
    const parsed = spawnSync(script, ['parse', '--lib-path', library, '--lang-name', 'c_sharp', source], {
      cwd: root,
      encoding: 'utf8',
      timeout: 5000,
      killSignal: 'SIGKILL',
    });
    expect(parsed.error, parsed.stderr).toBeUndefined();
    expect(parsed.status, parsed.stdout + parsed.stderr).toBe(1);
    expect(parsed.stdout).toContain('ERROR');
    expect(parsed.stdout).toContain('conditional_access_expression');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 310_000);
