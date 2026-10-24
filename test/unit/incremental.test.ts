import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from 'vitest';

import { testCommand } from './run.js';

// Edits each corpus case at random and reparses it incrementally, then undoes the edits and reparses
// again: the changed ranges must cover every change and the final tree must match the corpus. The CLI
// exits zero even when a case fails or no corpus is found, so its output decides: it must list the cases
// it fuzzed and print no failure summary. TREE_SITTER_SEED, TREE_SITTER_ITERATIONS,
// and TREE_SITTER_EDITS explore further locally.
testCommand('reparses the corpus consistently after random edits', ['script/fuzz-corpus'], 900_000, {
  env: {
    TREE_SITTER_SEED: process.env.TREE_SITTER_SEED ?? '1',
    TREE_SITTER_ITERATIONS: process.env.TREE_SITTER_ITERATIONS ?? '1000',
    TREE_SITTER_EDITS: process.env.TREE_SITTER_EDITS ?? '10',
  },
  check: (output) => {
    expect(output).toMatch(/^ +\d+\. .+ - corpus - /m);
    expect(output).not.toContain('failed fuzzing');
  },
});

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
