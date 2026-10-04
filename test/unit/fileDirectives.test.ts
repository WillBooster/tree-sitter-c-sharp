import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';

test('preserves file directive fields and following source across line endings', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c_sharp.wasm');
  const parser = new Parser();
  parser.setLanguage(language);
  const query = new Query(language, await readFile('queries/highlights.scm', 'utf8'));
  try {
    for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
      for (const ending of ['', '\n']) {
        const source =
          [
            '#:sdk Microsoft.NET.Sdk',
            '#:package "Humanizer" @ 2.0',
            '#:Package Newtonsoft.Json Version=13.0.3',
            '#:property Description = "Hello world"',
            '#:property Empty=',
            '#:project ../my project',
            'class Program {}',
          ].join(newline) + ending;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, tree.rootNode.toString()).toBe(false);
          const directives = tree.rootNode.descendantsOfType('file_directive');
          expect(
            directives.map((node) => [node.childForFieldName('name')?.text, node.childForFieldName('value')?.text])
          ).toEqual([
            ['Microsoft.NET.Sdk', undefined],
            ['"Humanizer"', '2.0'],
            ['Newtonsoft.Json', undefined],
            ['Description', '"Hello world"'],
            ['Empty', undefined],
            [undefined, '../my project'],
          ]);
          expect(directives[2]?.childForFieldName('metadata')?.text).toBe('Version=13.0.3');
          expect(tree.rootNode.namedChildren.at(-1)?.text).toBe('class Program {}');
          const captures = query.captures(tree.rootNode);
          expect(captures.filter(({ name }) => name === 'keyword.directive').map(({ node }) => node.text)).toEqual([
            '#:sdk',
            '#:package',
            '#:Package',
            '#:property',
            '#:property',
            '#:project',
          ]);
          for (const [capture, texts] of [
            ['property', ['Microsoft.NET.Sdk', '"Humanizer"', 'Newtonsoft.Json', 'Description', 'Empty']],
            ['string', ['2.0', 'Version=13.0.3', '"Hello world"', '../my project']],
          ] as const) {
            expect(
              captures
                .filter(({ name }) => name === capture)
                .map(({ node }) => [node.text, node.startIndex, node.endIndex])
            ).toEqual(texts.map((text) => [text, source.indexOf(text), source.indexOf(text) + text.length]));
          }
        } finally {
          tree.delete();
        }
      }
    }
    const tree = parser.parse('#:property Empty=')!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      expect(tree.rootNode.namedChildren[0]?.childForFieldName('name')?.text).toBe('Empty');
    } finally {
      tree.delete();
    }
  } finally {
    query.delete();
    parser.delete();
  }
});

test('keeps unknown directive payloads opaque and ends ranges on their own line', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c_sharp.wasm');
  const parser = new Parser();
  parser.setLanguage(language);
  const query = new Query(language, await readFile('queries/highlights.scm', 'utf8'));
  try {
    for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
      for (const line of [
        '#:sdk Foo',
        '#:Package Humanizer@2',
        '#:tool T',
        '#:nuget-source https://api.nuget.org/v3/index.json',
        '#:run --watch',
        '#:',
        '#:package-extension data',
      ]) {
        const source = `${line}${newline} \n\nclass Program {}`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, JSON.stringify(source)).toBe(false);
          const [directive, declaration] = tree.rootNode.namedChildren;
          expect(directive?.type).toBe('file_directive');
          expect(directive?.text).toBe(line + newline);
          expect(declaration?.text).toBe('class Program {}');
          expect(tree.rootNode.descendantsOfType('comment')).toHaveLength(0);
          expect(
            query
              .captures(tree.rootNode)
              .filter(({ name }) => name === 'keyword.directive')
              .map(({ node }) => node.text)
          ).toEqual([line.split(' ')[0]]);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});
