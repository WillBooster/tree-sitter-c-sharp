import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

const base = path.resolve('.tmp/paired/base');
const head = path.resolve('.tmp/paired/head');
const performanceFile = 'test/unit/performance.test.ts';
const source = fs.readFileSync(path.join(head, performanceFile), 'utf8');
const hash = (value) => createHash('sha256').update(value).digest('hex');
for (const file of [performanceFile, 'vitest.config.mts', 'package.json', 'bun.lock']) {
  assert.equal(fs.readFileSync(path.join(base, file), 'utf8'), fs.readFileSync(path.join(head, file), 'utf8'), file);
}
const signature = 'function parseCpuTime(source: string, expectedErrors = true): number {\n';
assert.equal(source.split(signature).length, 2);
let measured = source.replace(signature, signature + '  const diagnosticProcessStart = process.cpuUsage();\n');
const returnLine = '  return elapsed / samples;';
assert.equal(measured.split(returnLine).length, 2);
measured = measured.replace(
  returnLine,
  () => `  if (source.includes('c ? (a ? 1 : 2) : ')) {
    const diagnosticCpu = process.cpuUsage(diagnosticProcessStart);
    console.log('C_SHARP_TERNARY_SAMPLE ' + JSON.stringify({ characters: source.length, samples,
      thread: elapsed / samples, process: (diagnosticCpu.user + diagnosticCpu.system) / samples,
      execArgv: process.execArgv, memory: process.memoryUsage() }));
  }
${returnLine}`
);
const callback =
  "test.each(questionSources)('parses repeated $name in linear time', { timeout: 60_000 }, ({ source, node }) => {";
assert.equal(measured.split(callback).length, 2);
measured = measured.replace(callback, callback.replace('({ source, node })', '({ name, source, node })'));
const start = measured.indexOf(callback.replace('({ source, node })', '({ name, source, node })'));
const end = measured.indexOf(signature, start);
const guard = '  expect(largeFastest / smallFastest).toBeLessThan(18);';
const section = measured.slice(start, end);
assert.equal(section.split(guard).length, 2);
measured =
  measured.slice(0, start) +
  section.replace(
    guard,
    () => `  if (name === 'parenthesized nested ternary arms') {
    console.log('C_SHARP_TERNARY_GUARD ' + JSON.stringify({ name, smallFastest, largeFastest,
      ratio: largeFastest / smallFastest, memory: process.memoryUsage() }));
  }
${guard}`
  ) +
  measured.slice(end);
assert.deepEqual(
  measured.match(/\.to(?:Be|Equal|StrictEqual|Match|Have|Contain|Throw)[^;]+;/g),
  source.match(/\.to(?:Be|Equal|StrictEqual|Match|Have|Contain|Throw)[^;]+;/g)
);
assert.ok(
  fs
    .readFileSync(path.join(head, 'vitest.config.mts'), 'utf8')
    .includes("execArgv: ['--no-liftoff', '--no-wasm-lazy-compilation']")
);
if (process.argv.includes('--prepare-only')) {
  console.log('Validated telemetry insertion; every original performance assertion and input is retained.');
  process.exit(0);
}
for (const directory of [base, head])
  assert.ok(!fs.lstatSync(directory).isSymbolicLink(), 'Owned CI worktrees only; local smoke links are read-only');
for (const directory of [base, head]) {
  fs.writeFileSync(path.join(directory, performanceFile), measured);
}
// Both runs execute all 339 checks; the four conditional-base tests expose the baseline's known unsupported feature.
fs.copyFileSync(
  path.join(head, 'test/unit/conditionalBaseLists.test.ts'),
  path.join(base, 'test/unit/conditionalBaseLists.test.ts')
);
const artifacts = {};
for (const [name, directory] of [
  ['base', base],
  ['head', head],
]) {
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const runtime = spawnSync('script/runtime-version', [], { cwd: directory, encoding: 'utf8' });
  assert.equal(runtime.status, 0);
  assert.equal(runtime.stdout.trim(), '7.0.20');
  const sources = {};
  for (const file of git(
    'ls-tree',
    '-r',
    '--name-only',
    'HEAD',
    'src',
    'grammar.js',
    'queries',
    'test/corpus',
    'examples',
    'script/generate',
    'script/generateIdentifierCharacters.mjs',
    'script/known-failures.txt',
    'tree-sitter.json',
    'Cargo.lock',
    'package.json',
    'bun.lock',
    'vitest.config.mts'
  ).split('\n')) {
    const expected = spawnSync('git', ['show', `HEAD:${file}`], { cwd: directory, maxBuffer: 150_000_000 });
    assert.equal(expected.status, 0);
    const actual = fs.readFileSync(path.join(directory, file));
    assert.ok(actual.equals(expected.stdout), file);
    sources[file] = hash(actual);
  }
  artifacts[name] = {
    revision: git('rev-parse', 'HEAD'),
    runtime: runtime.stdout.trim(),
    sources,
    configSha256: hash(fs.readFileSync(path.join(directory, 'vitest.config.mts'))),
    originalPerformanceSha256: hash(source),
    instrumentedPerformanceSha256: hash(measured),
    wasmSha256: hash(fs.readFileSync(path.join(directory, 'tree-sitter-c_sharp.wasm'))),
    nativeCache: path.join(directory, '.tmp/tree-sitter-lib'),
    wasmCache: path.join(directory, '.tmp'),
    testFilesSha256: Object.fromEntries(
      fs
        .readdirSync(path.join(directory, 'test/unit'))
        .filter((file) => file.endsWith('.test.ts'))
        .map((file) => [file, hash(fs.readFileSync(path.join(directory, 'test/unit', file)))])
    ),
  };
}
assert.equal(artifacts.base.revision, '0846edff371bf81fec10c6c74b0da1e11625beab');
assert.equal(artifacts.head.revision, '990ee5b190b9a05ee5b00a4a98976d5a71628773');
assert.deepEqual(artifacts.base.testFilesSha256, artifacts.head.testFilesSha256);
const machine = {
  node: process.version,
  versions: process.versions,
  cpus: os.cpus(),
  arch: process.arch,
  memory: os.totalmem(),
  parallelism: os.availableParallelism(),
  artifacts,
  limitation:
    'Diagnostic telemetry runs after measured intervals but can affect JIT/preconditioning. Four new conditional-base API tests are deliberately run against the baseline too; their unsupported-feature failures must be distinguished from performance failures. Passing counts alone do not establish causation.',
};
fs.writeFileSync('.tmp/paired/full-provenance.json', JSON.stringify(machine, undefined, 2));
const results = [];
for (let cohort = 0; cohort < 2; cohort++)
  for (const artifact of cohort % 2 ? ['head', 'base'] : ['base', 'head']) {
    const directory = artifact === 'base' ? base : head;
    fs.copyFileSync(
      artifact === 'base'
        ? '.tmp/paired/public803/package/tree-sitter-c_sharp.wasm'
        : '.tmp/paired/head-canonical.wasm',
      path.join(directory, 'tree-sitter-c_sharp.wasm')
    );
    assert.equal(
      hash(fs.readFileSync(path.join(directory, 'tree-sitter-c_sharp.wasm'))),
      artifacts[artifact].wasmSha256
    );
    const logfile = path.resolve(`.tmp/paired/full-${cohort}-${artifact}.log`);
    const descriptor = fs.openSync(logfile, 'w');
    const startedAt = new Date().toISOString();
    const started = performance.now();
    const loadBefore = os.loadavg();
    const resourceBefore = spawnSync('ps', ['-axo', 'pid,pcpu,rss,comm'], { encoding: 'utf8' }).stdout;
    const command = spawnSync('bun', ['run', 'test/ci'], {
      cwd: directory,
      env: {
        ...process.env,
        CI: 'true',
        CARGO_BUILD_JOBS: '2',
        EMCC_CORES: '2',
        BINARYEN_CORES: '2',
        TREE_SITTER_LIBDIR: path.join(directory, '.tmp/tree-sitter-lib'),
      },
      stdio: ['ignore', descriptor, descriptor],
    });
    fs.closeSync(descriptor);
    const contents = stripVTControlCharacters(fs.readFileSync(logfile, 'utf8'));
    const metrics = contents.split('\n').flatMap((line) => {
      const match = /C_SHARP_TERNARY_(SAMPLE|GUARD) (\{.*\})/.exec(line);
      return match ? [{ kind: match[1], ...JSON.parse(match[2]) }] : [];
    });
    const testSummary = contents.split('\n').filter((line) => /^\s*(Tests|Test Files|Duration)\s/.test(line));
    const result = {
      cohort,
      artifact,
      startedAt,
      elapsedMs: performance.now() - started,
      loadBefore,
      loadAfter: os.loadavg(),
      resourceBefore,
      status: command.status,
      signal: command.signal,
      logfile,
      metrics,
      testSummary,
      wasmAfterSha256: hash(fs.readFileSync(path.join(directory, 'tree-sitter-c_sharp.wasm'))),
      nativeCacheFiles: cacheFiles(directory),
    };
    results.push(result);
    fs.writeFileSync('.tmp/paired/full-results.json', JSON.stringify({ machine, results }, undefined, 2));
    console.log(JSON.stringify(result));
    assert.ok(
      metrics.some((value) => value.kind === 'GUARD'),
      contents.slice(-5000)
    );
    assert.ok(
      testSummary.some((line) => /Tests.*\(339\)/.test(line)),
      testSummary
    );
  }
console.log(
  'All four paired full-suite cohorts completed; individual original test failures are retained in raw logs and results.'
);

function cacheFiles(directory) {
  const root = path.join(directory, '.tmp/tree-sitter-lib');
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.(?:so|dylib|wasm)$/.test(file))
    .map((file) => ({ file, sha256: hash(fs.readFileSync(path.join(root, file))) }));
}
