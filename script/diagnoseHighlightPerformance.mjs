import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';

const BaseRevision = '9427feeeac846e85237f77826f30e061e44626c8';
const HeadRevision = '158f2abb9dfaa83ad376eb1354fef6ccde256667';
const NodeVersion = 'v24.22.1';
const PerformanceFile = 'test/unit/performance.test.ts';
const TargetName = 'nullable T? properties';
const Head = path.resolve(process.argv[2] ?? '.tmp/paired/head');
const Base = path.resolve('.tmp/paired/base');
const Hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function main() {
  assert.equal(process.version, NodeVersion);
  const source = fs.readFileSync(path.join(Head, PerformanceFile), 'utf8');
  const measured = instrument(source);
  if (process.argv.includes('--prepare-only')) {
    console.log(JSON.stringify({ original: Hash(source), instrumented: Hash(measured), assertionsRetained: true }));
    return;
  }
  const artifacts = Object.fromEntries(
    [
      ['base', Base],
      ['head', Head],
    ].map(([name, directory]) => [name, inspectArtifact(directory)])
  );
  assert.equal(artifacts.base.revision, BaseRevision);
  assert.equal(artifacts.head.revision, HeadRevision);
  assert.equal(artifacts.base.wasmSha256, artifacts.head.wasmSha256);
  for (const file of ['vitest.config.mts', 'package.json', 'bun.lock', PerformanceFile]) {
    assert.equal(fs.readFileSync(path.join(Base, file), 'utf8'), fs.readFileSync(path.join(Head, file), 'utf8'), file);
  }
  for (const directory of [Base, Head]) fs.writeFileSync(path.join(directory, PerformanceFile), measured);
  fs.writeFileSync('.tmp/paired/full-instrumented-performance.ts', measured);
  const machine = {
    driver: { node: process.version, execPath: process.execPath, versions: process.versions },
    cpus: os.cpus(),
    arch: process.arch,
    memory: os.totalmem(),
    parallelism: os.availableParallelism(),
    cpuBrand: spawnSync('sysctl', ['-n', 'machdep.cpu.brand_string'], { encoding: 'utf8' }).stdout.trim(),
    artifacts,
    originalPerformanceSha256: Hash(source),
    instrumentedPerformanceSha256: Hash(measured),
    limitation:
      'Same-runner full99-file ABBA comparison. Other test-file preconditioning is not reproduced. Post-sample telemetry can affect JIT/heap/preconditioning; passing results do not establish the original CI failure cause.',
  };
  fs.writeFileSync('.tmp/paired/full-provenance.json', JSON.stringify(machine, undefined, 2));
  const results = [];
  for (const [index, label] of ['base', 'head', 'head', 'base'].entries()) {
    results.push(runCohort(index, label, artifacts[label]));
    fs.writeFileSync('.tmp/paired/full-results.json', JSON.stringify({ machine, results }, undefined, 2));
    console.log(JSON.stringify(results.at(-1)));
  }
  process.exitCode = results.some((result) => result.status !== 0) ? 1 : 0;
}

function instrument(source) {
  const signature = 'function parseCpuTime(source: string, expectedErrors = true): number {\n';
  let measured = replaceOnce(source, signature, signature + '  const diagnosticProcessStart = process.cpuUsage();\n');
  measured = replaceOnce(
    measured,
    '  return elapsed / samples;',
    `  if (source.includes('public T? P0 { get; set; }')) {
    const diagnosticCpu = process.cpuUsage(diagnosticProcessStart);
    console.log('C_SHARP_PROPERTY_SAMPLE ' + JSON.stringify({ characters: source.length, samples, elapsed,
      thread: elapsed / samples, process: (diagnosticCpu.user + diagnosticCpu.system) / samples,
      node: process.version, execPath: process.execPath, execArgv: process.execArgv, memory: process.memoryUsage() }));
  }
  return elapsed / samples;`
  );
  const callback =
    "test.each(questionSources)('parses repeated $name in linear time', { timeout: 60_000 }, ({ source, node }) => {";
  const diagnosticCallback = callback.replace('({ source, node })', '({ name, source, node })');
  measured = replaceOnce(measured, callback, diagnosticCallback);
  const start = measured.indexOf(diagnosticCallback);
  const end = measured.indexOf(signature, start);
  const guard = '  expect(largeFastest / smallFastest).toBeLessThan(18);';
  const section = replaceOnce(
    measured.slice(start, end),
    guard,
    `  if (name === '${TargetName}') {
    console.log('C_SHARP_PROPERTY_GUARD ' + JSON.stringify({ name, smallFastest, largeFastest,
      ratio: largeFastest / smallFastest, node: process.version, execArgv: process.execArgv, memory: process.memoryUsage() }));
  }
${guard}`
  );
  measured = measured.slice(0, start) + section + measured.slice(end);
  assert.deepEqual(
    measured.match(/\.to(?:Be|Equal|StrictEqual|Match|Have|Contain|Throw)[^;]+;/g),
    source.match(/\.to(?:Be|Equal|StrictEqual|Match|Have|Contain|Throw)[^;]+;/g)
  );
  assert.ok(
    fs
      .readFileSync(path.join(Head, 'vitest.config.mts'), 'utf8')
      .includes("execArgv: ['--no-liftoff', '--no-wasm-lazy-compilation']")
  );
  return measured;
}

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, before);
  return source.replace(before, () => after);
}

function inspectArtifact(directory) {
  assert.ok(!fs.lstatSync(directory).isSymbolicLink());
  const git = (...args) => command('git', args, directory).trim();
  const runtime = command('script/runtime-version', [], directory).trim();
  assert.equal(runtime, '9.0.0');
  const webRuntime = JSON.parse(
    fs.readFileSync(path.join(directory, 'node_modules/@willbooster/web-tree-sitter/package.json'), 'utf8')
  );
  assert.equal(webRuntime.version, '9.0.0');
  const sources = {};
  const files = git(
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
  ).split('\n');
  for (const file of files) {
    const expected = spawnSync('git', ['show', `HEAD:${file}`], { cwd: directory, maxBuffer: 150_000_000 });
    assert.equal(expected.status, 0, expected.stderr?.toString());
    const actual = fs.readFileSync(path.join(directory, file));
    assert.ok(actual.equals(expected.stdout), file);
    sources[file] = Hash(actual);
  }
  return {
    revision: git('rev-parse', 'HEAD'),
    runtime,
    webRuntime: webRuntime.version,
    sources,
    wasmSha256: Hash(fs.readFileSync(path.join(directory, 'tree-sitter-c_sharp.wasm'))),
    nativeCache: path.join(directory, '.tmp/tree-sitter-lib'),
    wasmCache: path.join(directory, '.tmp'),
  };
}

function command(binary, args, cwd) {
  const result = spawnSync(binary, args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function runCohort(index, label, artifact) {
  const directory = label === 'base' ? Base : Head;
  assert.equal(Hash(fs.readFileSync(path.join(directory, 'tree-sitter-c_sharp.wasm'))), artifact.wasmSha256);
  const logfile = path.resolve(`.tmp/paired/full-${index}-${label}.log`);
  const nodeLog = path.resolve(`.tmp/paired/full-nodes-${index}-${label}.jsonl`);
  const preload = path.resolve('.tmp/paired/assertPinnedNode.mjs');
  fs.writeFileSync(
    preload,
    `import assert from 'node:assert/strict';import fs from 'node:fs';assert.equal(process.version,'${NodeVersion}');assert(process.env.C_SHARP_DIAGNOSTIC_NODE_LOG);fs.appendFileSync(process.env.C_SHARP_DIAGNOSTIC_NODE_LOG,JSON.stringify({pid:process.pid,ppid:process.ppid,node:process.version,execPath:process.execPath,execArgv:process.execArgv})+'\\n');\n`
  );
  const descriptor = fs.openSync(logfile, 'w');
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const loadBefore = os.loadavg();
  const resourceBefore = command('ps', ['-axo', 'pid,pcpu,rss,comm']);
  const result = spawnSync(
    process.execPath,
    ['node_modules/vitest/vitest.mjs', 'run', PerformanceFile, '--project=performance', '--watch=false'],
    {
      cwd: directory,
      stdio: ['ignore', descriptor, descriptor],
      timeout: 20 * 60 * 1000,
      env: {
        ...process.env,
        PATH: `${path.dirname(process.execPath)}:${process.env.PATH}`,
        CI: 'true',
        CARGO_BUILD_JOBS: '2',
        EMCC_CORES: '2',
        BINARYEN_CORES: '2',
        TREE_SITTER_LIBDIR: path.join(directory, '.tmp/tree-sitter-lib'),
        C_SHARP_DIAGNOSTIC_NODE_LOG: nodeLog,
        NODE_OPTIONS: `--import=${preload}`,
      },
    }
  );
  fs.closeSync(descriptor);
  assert.ifError(result.error);
  const contents = stripVTControlCharacters(fs.readFileSync(logfile, 'utf8'));
  const metrics = contents.split('\n').flatMap((line) => {
    const match = /C_SHARP_PROPERTY_(SAMPLE|GUARD) (\{.*\})/.exec(line);
    return match ? [{ kind: match[1], ...JSON.parse(match[2]) }] : [];
  });
  const workers = fs
    .readFileSync(nodeLog, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.ok(workers.length >= 2);
  assert.ok(workers.every((worker) => worker.node === NodeVersion));
  assert.equal(metrics.filter((metric) => metric.kind === 'SAMPLE').length, 7);
  assert.equal(metrics.filter((metric) => metric.kind === 'GUARD').length, 1);
  assert.ok(
    metrics.every(
      (metric) =>
        metric.node === NodeVersion &&
        metric.execArgv.includes('--no-liftoff') &&
        metric.execArgv.includes('--no-wasm-lazy-compilation')
    )
  );
  const testSummary = contents.split('\n').filter((line) => /^\s*(Tests|Test Files|Duration)\s/.test(line));
  assert.ok(
    testSummary.some((line) => /Tests.*\(99\)/.test(line)),
    testSummary
  );
  return {
    index,
    label,
    startedAt,
    elapsedMs: performance.now() - started,
    loadBefore,
    loadAfter: os.loadavg(),
    resourceBefore,
    status: result.status,
    signal: result.signal,
    logfile,
    workers,
    metrics,
    testSummary,
    wasmAfterSha256: Hash(fs.readFileSync(path.join(directory, 'tree-sitter-c_sharp.wasm'))),
  };
}

main();
