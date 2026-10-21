import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import { Language, Parser } from '@willbooster/web-tree-sitter';

await Parser.init();
const parsers = {};
for (const [name, file] of [
  ['base', process.argv[2]],
  ['head', process.argv[3]],
]) {
  parsers[name] = new Parser().setLanguage(await Language.load(file));
}
const line = 'var r = $"{(a?[0], f(b, $"{(c\n';
const cases = [
  {
    name: 'unterminated nested holes',
    small: `class C { void M() {\n${line.repeat(500)}} }`,
    large: `class C { void M() {\n${line.repeat(5000)}} }`,
    error: true,
  },
  {
    name: 'as-expression ternaries',
    small: `class C { void M() { var x = ${'(a as T) ? a : '.repeat(200)}a; } }`,
    large: `class C { void M() { var x = ${'(a as T) ? a : '.repeat(2000)}a; } }`,
    error: false,
  },
];
function fingerprint(tree) {
  const hash = createHash('sha256');
  const stack = [tree.rootNode];
  while (stack.length > 0) {
    const node = stack.pop();
    hash.update(
      JSON.stringify([
        node.type,
        node.startIndex,
        node.endIndex,
        node.isNamed,
        node.isMissing,
        node.hasError,
        node.childCount,
      ])
    );
    stack.push(...node.children.toReversed());
  }
  return hash.digest('hex');
}
function sample(parser, source, error) {
  const threadStart = process.threadCpuUsage();
  const processStart = process.cpuUsage();
  const wallStart = performance.now();
  let count = 0;
  let thread = 0;
  do {
    const tree = parser.parse(source);
    assert.equal(tree.rootNode.hasError, error);
    tree.delete();
    count++;
    const cpu = process.threadCpuUsage(threadStart);
    thread = cpu.user + cpu.system;
  } while (thread < 50_000);
  const total = process.cpuUsage(processStart);
  return {
    count,
    thread: thread / count,
    process: (total.user + total.system) / count,
    wallMs: (performance.now() - wallStart) / count,
    rss: process.memoryUsage().rss,
  };
}
const machine = {
  node: process.version,
  arch: process.arch,
  cpu: os.cpus()[0],
  availableParallelism: os.availableParallelism(),
  memory: os.totalmem(),
};
console.log(JSON.stringify({ machine }));
const controls = [];
for (const entry of cases)
  for (const size of ['small', 'large']) {
    const trees = Object.values(parsers).map((parser) => parser.parse(entry[size]));
    const hashes = trees.map(fingerprint);
    assert.equal(hashes[0], hashes[1], `${entry.name}/${size}`);
    for (const tree of trees) tree.delete();
    controls.push({ name: entry.name, size, hash: hashes[0] });
  }
const rows = [];
for (const entry of cases) {
  for (let cohort = 0; cohort < Number(process.argv[4] ?? 6); cohort++) {
    for (const name of cohort % 2 ? ['head', 'base'] : ['base', 'head']) {
      const parser = parsers[name];
      sample(parser, entry.large, entry.error);
      const small = [];
      const large = [];
      for (let run = 0; run < 3; run++) {
        small.push(sample(parser, entry.small, entry.error));
        large.push(sample(parser, entry.large, entry.error));
      }
      const smallFastest = Math.min(...small.map((value) => value.thread));
      const largeFastest = Math.min(...large.map((value) => value.thread));
      const row = {
        name: entry.name,
        cohort,
        artifact: name,
        small,
        large,
        smallFastest,
        largeFastest,
        ratio: largeFastest / smallFastest,
      };
      rows.push(row);
      console.log(JSON.stringify(row));
    }
  }
}
fs.writeFileSync('.tmp/paired/results.json', JSON.stringify({ machine, controls, rows }, undefined, 2));
for (const parser of Object.values(parsers)) parser.delete();
