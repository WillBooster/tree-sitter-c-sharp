import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const head = path.resolve(process.argv[2] ?? '.tmp/paired/head');
const baseline = path.resolve('.tmp/paired/base');
const sourceFile = 'test/unit/performance.test.ts';
const testFiles = [sourceFile, 'test/unit/interpolationBoundaries.test.ts'];
const source = fs.readFileSync(path.join(head, sourceFile), 'utf8');
if (!process.argv.includes('--prepare-only')) {
  for (const file of [...testFiles, 'vitest.config.mts', 'package.json', 'bun.lock']) {
    assert.equal(fs.readFileSync(path.join(baseline, file), 'utf8'), fs.readFileSync(path.join(head, file), 'utf8'));
  }
}
const signature = 'function parseCpuTime(source: string, expectedErrors = true): number {\n';
assert.equal(source.split(signature).length, 2);
let measured = source.replace(signature, signature + '  const diagnosticProcessStart = process.cpuUsage();\n');
const returnLine = '  return elapsed / samples;';
assert.equal(measured.split(returnLine).length, 2);
measured = measured.replace(
  returnLine,
  () => `  if (source.includes('var r = $') && source.includes('a?[0], f(b,')) {
    const diagnosticCpu = process.cpuUsage(diagnosticProcessStart);
    console.log('C_SHARP_PERF_SAMPLE ' + JSON.stringify({ bytes: source.length, samples, thread: elapsed / samples,
      process: (diagnosticCpu.user + diagnosticCpu.system) / samples, execArgv: process.execArgv, memory: process.memoryUsage() }));
  }
${returnLine}`
);
const title = 'recovers from repeated unterminated interpolation holes %j in linear time';
assert.equal(measured.split(title).length, 2);
const start = measured.lastIndexOf('test.each(', measured.indexOf(title));
assert.ok(start !== -1);
const guard = '    expect(largeFastest / smallFastest).toBeLessThan(18);';
const last = measured.slice(start);
assert.equal(last.split(guard).length, 2);
measured =
  measured.slice(0, start) +
  last.replace(
    guard,
    () => `    console.log('C_SHARP_PERF_GUARD ' + JSON.stringify({ line, smallFastest, largeFastest,
      ratio: largeFastest / smallFastest, memory: process.memoryUsage() }));
${guard}`
  );
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
  console.log('Instrumentation validated; all performance guards retained.');
  process.exit(0);
}
for (const [directory, artifact] of [
  [head, 'head'],
  [baseline, 'base'],
]) {
  fs.writeFileSync(path.join(directory, sourceFile), measured);
  fs.copyFileSync(path.resolve(`.tmp/paired/${artifact}.wasm`), path.join(directory, 'tree-sitter-c_sharp.wasm'));
}
for (const directory of [baseline, head]) {
  const install = spawnSync('bun', ['install', '--frozen-lockfile'], { cwd: directory, stdio: 'inherit' });
  assert.equal(install.status, 0);
}
const artifacts = {};
for (const [name, directory] of [
  ['base', baseline],
  ['head', head],
]) {
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' });
  assert.equal(revision.status, 0);
  const runtime = spawnSync('script/runtime-version', [], { cwd: directory, encoding: 'utf8' });
  assert.equal(runtime.status, 0);
  assert.equal(runtime.stdout.trim(), '7.0.18');
  artifacts[name] = {
    runtime: runtime.stdout.trim(),
    configSha256: createHash('sha256')
      .update(fs.readFileSync(path.join(directory, 'vitest.config.mts')))
      .digest('hex'),
    performanceSourceSha256: createHash('sha256').update(source).digest('hex'),
    revision: revision.stdout.trim(),
    wasmSha256: createHash('sha256')
      .update(fs.readFileSync(path.join(directory, 'tree-sitter-c_sharp.wasm')))
      .digest('hex'),
  };
}
const machine = {
  node: process.version,
  cpu: os.cpus()[0],
  arch: process.arch,
  memory: os.totalmem(),
  cpus: os.availableParallelism(),
  artifacts,
};
fs.writeFileSync('.tmp/paired/full-provenance.json', JSON.stringify(machine, undefined, 2));
const results = [];
for (let cohort = 0; cohort < 2; cohort++) {
  for (const artifact of cohort % 2 ? ['head', 'base'] : ['base', 'head']) {
    const directory = artifact === 'base' ? baseline : head;
    const logfile = path.resolve(`.tmp/paired/full-${cohort}-${artifact}.log`);
    const descriptor = fs.openSync(logfile, 'w');
    const startedAt = new Date().toISOString();
    const start = performance.now();
    const loadBefore = os.loadavg();
    const command = spawnSync('bun', ['wb', 'test', ...testFiles], {
      cwd: directory,
      stdio: ['ignore', descriptor, descriptor],
    });
    fs.closeSync(descriptor);
    const contents = fs.readFileSync(logfile, 'utf8');
    const metrics = contents.split('\n').flatMap((line) => {
      const match = /C_SHARP_PERF_(SAMPLE|GUARD) (\{.*\})/.exec(line);
      return match ? [{ kind: match[1], ...JSON.parse(match[2]) }] : [];
    });
    const result = {
      cohort,
      artifact,
      startedAt,
      elapsedMs: performance.now() - start,
      loadBefore,
      loadAfter: os.loadavg(),
      status: command.status,
      signal: command.signal,
      logfile,
      metrics,
    };
    results.push(result);
    console.log(JSON.stringify(result));
    assert.ok(
      metrics.some((value) => value.kind === 'GUARD'),
      contents.slice(-5000)
    );
  }
}
fs.writeFileSync('.tmp/paired/full-results.json', JSON.stringify({ machine, results }, undefined, 2));
process.exitCode = results.some(({ status }) => status !== 0) ? 1 : 0;
