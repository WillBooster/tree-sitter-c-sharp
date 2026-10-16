import { execFileSync } from 'node:child_process';
import path from 'node:path';

// script/tree-sitter fetches the CLI on its first run, which takes over 10 minutes when it falls back to building it.
// Provision it before the CLI tests so that this download/build does not consume an individual test timeout.
export default function setup(): void {
  execFileSync(path.resolve(import.meta.dirname, '../../script/tree-sitter'), ['--version'], { stdio: 'inherit' });
}
