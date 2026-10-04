import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('captures literal backslashes within line-directive filename boundaries', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c_sharp.wasm');
  const parser = new Parser();
  parser.setLanguage(language);
  const query = new Query(language, '(preproc_line (string_literal) @filename)');
  try {
    for (const directive of [
      String.raw`10 "raw\path.cs"`,
      String.raw`(1,1)-(5,60) "raw\span.cs"`,
      String.raw`20 "C:\"`,
    ]) {
      const source = `#line ${directive}\nclass Following { }\n`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(
          query.captures(tree.rootNode).map(({ node }) => node.text),
          source
        ).toEqual([directive.slice(directive.indexOf('"'))]);
        expect(tree.rootNode.namedChildren.at(-1)?.type, source).toBe('class_declaration');
      } finally {
        tree.delete();
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});

test('rejects line breaks and string-only syntax in line-directive filenames', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c_sharp.wasm');
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const filename of [
      String.raw`@"raw\path.cs"`,
      '"plain.cs"u8',
      ...['\r', '\n', '\u0085', '\u2028', '\u2029'].map((newline) => `"first${newline}second"`),
    ]) {
      const source = `#line 10 ${filename}\nclass Following { }\n`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(true);
      } finally {
        tree.delete();
      }
    }
    const source = String.raw`class C { string S = "raw\path"; }`;
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError, source).toBe(true);
    } finally {
      tree.delete();
    }
  } finally {
    parser.delete();
  }
});

test('preserves checksum operands and the following declaration with literal filename backslashes', async () => {
  await Parser.init();
  const language = await Language.load('tree-sitter-c_sharp.wasm');
  const parser = new Parser();
  parser.setLanguage(language);
  const query = new Query(language, '(string_literal) @string');
  const algorithm = '"{406EA660-64CF-4C82-B6F0-42D48172A799}"';
  const checksum = '"ab"';
  try {
    for (const filename of [String.raw`"C:\src\path.cs"`, String.raw`"C:\"`]) {
      const source = `#pragma checksum ${filename} ${algorithm} ${checksum}\nclass Following { }\n`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(
          query.captures(tree.rootNode).map(({ node }) => node.text),
          source
        ).toEqual([filename, algorithm, checksum]);
        expect(
          tree.rootNode.namedChildren.map(({ type }) => type),
          source
        ).toEqual(['preproc_pragma', 'class_declaration']);
      } finally {
        tree.delete();
      }
    }
  } finally {
    query.delete();
    parser.delete();
  }
});
