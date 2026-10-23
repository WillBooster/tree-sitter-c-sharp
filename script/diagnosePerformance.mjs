import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Language, Parser } from '@willbooster/web-tree-sitter';

const Root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RuntimeDirectory = path.join(Root, 'node_modules/@willbooster/web-tree-sitter');
const RuntimeWasmPath = path.join(RuntimeDirectory, 'web-tree-sitter.wasm');
const Cases = [
  {
    name: 'element-access ternary arms at field initializer',
    sizes: [200, 2000],
    source: (count) => `class C { object x = ${'a ? b?[0] : '.repeat(count)}a; }`,
  },
  {
    name: 'identifier ternaries at top level',
    sizes: [200, 2000],
    source: (count) => `var x = ${'a ? a : '.repeat(count)}a;`,
  },
  {
    name: 'nullable-type-test ternaries at top level',
    sizes: [200, 2000],
    source: (count) => `var x = ${'a is T? ? a : '.repeat(count)}a;`,
  },
  {
    name: 'access chains after nullable interpolation holes',
    sizes: [200, 2000],
    source: (count) => `var r = $"{(f(a?[0], x is null) ? f($"{x as int?:?foo}")${'?[0]'.repeat(count - 1)} : b):X}";`,
  },
  ...['var r = $"{(a, f(b, (c +\n', 'var r = $"{(a?[0], f(b, $"{(c\n'].map((line) => ({
    name: `unterminated interpolation ${JSON.stringify(line)}`,
    sizes: [500, 5000],
    source: (count) => `class C { void M() {\n${line.repeat(count)}} }`,
  })),
  ...['a ? 1 : ', 'x is T?[] ? [a] : '].map((prefix) => ({
    name: `regular interpolation nesting after ${prefix}`,
    sizes: [100, 5000],
    source: (count) => `class C { void M() { var result = ${prefix}${'$"{'.repeat(count)}1${'}"'.repeat(count)}; } }`,
  })),
];

await main();

async function main() {
  assert.ok(
    process.env.CI === 'true' && process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_RUN_ID,
    'Performance diagnostics require an actual GitHub Actions run'
  );
  const published = await publishedWasm();
  const publishedPath = published.path;
  const candidatePath = path.join(Root, 'tree-sitter-c_sharp.wasm');
  const runtime = JSON.parse(fs.readFileSync(path.join(RuntimeDirectory, 'package.json'), 'utf8'));
  console.log(
    JSON.stringify({
      diagnostic: 'paired-parser-cpu',
      workflowSha: process.env.GITHUB_SHA,
      checkoutSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: Root, encoding: 'utf8' }).trim(),
      platform: process.platform,
      architecture: process.arch,
      cpu: os.cpus()[0]?.model,
      node: process.version,
      runtime: `${runtime.name}@${runtime.version}`,
      runtimeWasmSha256: digest(RuntimeWasmPath),
      publishedVersion: '15.0.0',
      publishedPackageSri: published.integrity,
      publishedWasmSha256: digest(publishedPath),
      candidateWasmSha256: digest(candidatePath),
      questionContextSha256: digest(path.join(Root, 'src/questionContext.h')),
      minimumBatchCpuMicroseconds: 50_000,
    })
  );
  await Parser.init({ wasmModule: new WebAssembly.Module(fs.readFileSync(RuntimeWasmPath)) });
  const publishedLanguage = Language.loadSync(new WebAssembly.Module(fs.readFileSync(publishedPath)));
  const candidateLanguage = Language.loadSync(new WebAssembly.Module(fs.readFileSync(candidatePath)));
  assert.equal(publishedLanguage.abiVersion, candidateLanguage.abiVersion);
  console.log(
    JSON.stringify({
      languageAbi: candidateLanguage.abiVersion,
      languageAbiHex: candidateLanguage.abiVersion.toString(16),
    })
  );
  const parsers = [
    { name: 'published15', parser: new Parser().setLanguage(publishedLanguage) },
    { name: 'candidate', parser: new Parser().setLanguage(candidateLanguage) },
  ];
  try {
    for (const entry of Cases) {
      const sources = entry.sizes.map(entry.source);
      const warmups = parsers.map(({ name, parser }) => ({ name, batch: cpuBatch(parser, sources[1]) }));
      const rounds = [];
      for (let round = 0; round < 3; round++) {
        for (const { name, parser } of round % 2 ? parsers.toReversed() : parsers) {
          rounds.push({ round, name, small: cpuBatch(parser, sources[0]), large: cpuBatch(parser, sources[1]) });
        }
      }
      const summaries = parsers.map(({ name }) => {
        const samples = rounds.filter((sample) => sample.name === name);
        const small = Math.min(...samples.map((sample) => sample.small.averageCpuMicroseconds));
        const large = Math.min(...samples.map((sample) => sample.large.averageCpuMicroseconds));
        return { name, small, large, ratio: large / small };
      });
      console.log(JSON.stringify({ name: entry.name, sizes: entry.sizes, warmups, rounds, summaries }));
    }
  } finally {
    for (const { parser } of parsers) parser.delete();
  }
}

async function publishedWasm() {
  const parent = path.join(Root, '.tmp');
  fs.mkdirSync(parent, { recursive: true });
  const directory = fs.mkdtempSync(path.join(parent, 'performance-reference-'));
  const archive = path.join(directory, 'published.tgz');
  const packageResponse = await fetch('https://registry.npmjs.org/@willbooster%2ftree-sitter-c-sharp/15.0.0');
  assert.equal(packageResponse.ok, true, `Published metadata download failed: ${packageResponse.status}`);
  const published = await packageResponse.json();
  assert.equal(published.name, '@willbooster/tree-sitter-c-sharp');
  assert.equal(published.version, '15.0.0');
  const integrity = published.dist?.integrity;
  assert.equal(typeof integrity, 'string');
  assert.match(integrity, /^sha512-[A-Za-z0-9+/=]+$/);
  const response = await fetch(
    'https://registry.npmjs.org/@willbooster/tree-sitter-c-sharp/-/tree-sitter-c-sharp-15.0.0.tgz'
  );
  assert.equal(response.ok, true, `Published package download failed: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.equal(`sha512-${createHash('sha512').update(bytes).digest('base64')}`, integrity);
  fs.writeFileSync(archive, bytes);
  execFileSync('tar', ['-xzf', archive, '-C', directory]);
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'package/package.json'), 'utf8'));
  assert.equal(metadata.name, '@willbooster/tree-sitter-c-sharp');
  assert.equal(metadata.version, '15.0.0');
  return { path: path.join(directory, 'package/tree-sitter-c_sharp.wasm'), integrity };
}

function digest(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function cpuBatch(parser, source) {
  const start = process.threadCpuUsage();
  let samples = 0;
  let elapsed = 0;
  let errors = 0;
  do {
    const tree = parser.parse(source);
    assert.ok(tree, 'The parser returned no tree');
    errors += Number(tree.rootNode.hasError);
    tree.delete();
    samples++;
    const { user, system } = process.threadCpuUsage(start);
    elapsed = user + system;
  } while (elapsed < 50_000);
  return { samples, elapsedCpuMicroseconds: elapsed, averageCpuMicroseconds: elapsed / samples, errors };
}
