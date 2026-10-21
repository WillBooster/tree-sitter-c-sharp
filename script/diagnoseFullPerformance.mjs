import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const baseline = path.resolve('.tmp/paired/base');
const sourceFile = 'test/unit/performance.test.ts';
const source = fs.readFileSync(sourceFile, 'utf8');
const signature = 'function parseCpuTime(source: string, expectedErrors = true): number {\n';
assert.equal(source.split(signature).length, 2);
let measured = source.replace(signature, signature + '  const diagnosticProcessStart = process.cpuUsage();\n');
const returnLine = '  return elapsed / samples;';
assert.equal(measured.split(returnLine).length, 2);
measured = measured.replace(
  returnLine,
  `  if (source.includes('var r = $') && source.includes('a?[0], f(b,')) {
    const diagnosticCpu = process.cpuUsage(diagnosticProcessStart);
    console.log('C_SHARP_PERF_SAMPLE ' + JSON.stringify({ bytes: source.length, samples, thread: elapsed / samples,
      process: (diagnosticCpu.user + diagnosticCpu.system) / samples, memory: process.memoryUsage() }));
  }
${returnLine}`
);
const marker = `test.each(['var r = $`;
const start = measured.indexOf(marker);
assert.ok(start !== -1);
const guard = '    expect(largeFastest / smallFastest).toBeLessThan(18);';
const last = measured.slice(start);
assert.equal(last.split(guard).length, 2);
measured =
  measured.slice(0, start) +
  last.replace(
    guard,
    `    console.log('C_SHARP_PERF_GUARD ' + JSON.stringify({ line, smallFastest, largeFastest,
      ratio: largeFastest / smallFastest, memory: process.memoryUsage() }));
${guard}`
  );
assert.equal(measured.match(/toBeLessThan\(5_000_000\)/g).length, source.match(/toBeLessThan\(5_000_000\)/g).length);
for (const [directory, artifact] of [
  [root, 'head'],
  [baseline, 'base'],
]) {
  fs.writeFileSync(path.join(directory, sourceFile), measured);
  fs.copyFileSync(path.resolve(`.tmp/paired/${artifact}.wasm`), path.join(directory, 'tree-sitter-c_sharp.wasm'));
}
const install = spawnSync('bun', ['install', '--frozen-lockfile'], { cwd: baseline, stdio: 'inherit' });
assert.equal(install.status, 0);
const machine = {
  node: process.version,
  cpu: os.cpus()[0],
  arch: process.arch,
  memory: os.totalmem(),
  cpus: os.availableParallelism(),
};
const results = [];
for (let cohort = 0; cohort < 2; cohort++) {
  for (const artifact of cohort % 2 ? ['head', 'base'] : ['base', 'head']) {
    const directory = artifact === 'base' ? baseline : root;
    const logfile = path.resolve(`.tmp/paired/full-${cohort}-${artifact}.log`);
    const descriptor = fs.openSync(logfile, 'w');
    const command = spawnSync('bun', ['wb', 'test', sourceFile], {
      cwd: directory,
      stdio: ['ignore', descriptor, descriptor],
    });
    fs.closeSync(descriptor);
    const contents = fs.readFileSync(logfile, 'utf8');
    const metrics = contents.split('\n').flatMap((line) => {
      const match = /C_SHARP_PERF_(SAMPLE|GUARD) (\{.*\})/.exec(line);
      return match ? [{ kind: match[1], ...JSON.parse(match[2]) }] : [];
    });
    const result = { cohort, artifact, status: command.status, signal: command.signal, logfile, metrics };
    results.push(result);
    console.log(JSON.stringify(result));
    assert.ok(
      metrics.some((value) => value.kind === 'GUARD'),
      contents.slice(-5000)
    );
  }
}
fs.writeFileSync('.tmp/paired/full-results.json', JSON.stringify({ machine, results }, undefined, 2));
