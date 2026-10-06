import { readFileSync } from 'node:fs';

import { Edit, Language, Parser, Query, type Node, type Point, type Tree } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('retains raw interpolation expressions beside literal braces through edits', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
  const highlights = new Query(parser.language!, readFileSync('queries/highlights.scm', 'utf8'));
  try {
    for (const dollars of [2, 3, 4]) {
      for (const literalBraces of new Set([1, dollars - 1])) {
        let source = `var Longitude = 7;
var Latitude = 8;
var location = ${'$'.repeat(dollars)}"""
  You are at ${'{'.repeat(dollars + literalBraces)}Longitude${'}'.repeat(dollars)}, ${'{'.repeat(dollars)}Latitude${'}'.repeat(dollars + literalBraces)}
  """;`;
        let tree = parser.parse(source)!;
        try {
          check(tree);
          const start = source.indexOf('{');
          for (const [length, text] of [
            [literalBraces, ''],
            [0, '{'.repeat(literalBraces)],
          ] as const) {
            const next = source.slice(0, start) + text + source.slice(start + length);
            tree.edit(
              new Edit({
                startIndex: start,
                oldEndIndex: start + length,
                newEndIndex: start + text.length,
                startPosition: position(source, start),
                oldEndPosition: position(source, start + length),
                newEndPosition: position(next, start + text.length),
              })
            );
            const previous: Tree = tree;
            tree = parser.parse(next, previous)!;
            previous.delete();
            const fresh = parser.parse(next)!;
            try {
              expect(snapshot(tree.rootNode)).toEqual(snapshot(fresh.rootNode));
              expect(captures(tree)).toEqual(captures(fresh));
              check(tree);
            } finally {
              fresh.delete();
            }
            source = next;
          }
        } finally {
          tree.delete();
        }

        function check(current: Tree): void {
          expect(current.rootNode.hasError).toBe(false);
          const expressions = current.rootNode.descendantsOfType('interpolation');
          expect(expressions.map((node) => node.descendantsOfType('identifier').map((name) => name.text))).toEqual([
            ['Longitude'],
            ['Latitude'],
          ]);
          expect(
            expressions.flatMap((node) => node.descendantsOfType('interpolation_brace').map((brace) => brace.text))
          ).toEqual(['{'.repeat(dollars), '}'.repeat(dollars), '{'.repeat(dollars), '}'.repeat(dollars)]);
          expect(
            highlights
              .captures(current.rootNode)
              .filter(({ name, node }) => name === 'variable' && node.parent?.type === 'interpolation')
              .map(({ node }) => node.text)
          ).toEqual(['Longitude', 'Latitude']);
        }
      }
    }
  } finally {
    highlights.delete();
    parser.delete();
  }

  function captures(tree: Tree): unknown {
    return highlights
      .captures(tree.rootNode)
      .map(({ name, node }) => [name, node.type, node.text, node.startIndex, node.endIndex]);
  }
});

test('updates format newline validity when an interpolated string changes between regular and verbatim', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
  const highlights = new Query(parser.language!, readFileSync('queries/highlights.scm', 'utf8'));
  try {
    for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
      let source = `class C { string value = $"{1:a${newline}b}"; }`;
      let tree = parser.parse(source)!;
      const start = source.indexOf('$') + 1;
      try {
        expect(tree.rootNode.hasError).toBe(true);
        for (const verbatim of [true, false, true]) {
          const removed = verbatim ? 0 : 1;
          const inserted = verbatim ? '@' : '';
          const next = source.slice(0, start) + inserted + source.slice(start + removed);
          tree.edit(
            new Edit({
              startIndex: start,
              oldEndIndex: start + removed,
              newEndIndex: start + inserted.length,
              startPosition: position(source, start),
              oldEndPosition: position(source, start + removed),
              newEndPosition: position(next, start + inserted.length),
            })
          );
          const previous = tree;
          tree = parser.parse(next, previous)!;
          previous.delete();
          const fresh = parser.parse(next)!;
          try {
            expect(tree.rootNode.hasError, JSON.stringify(next)).toBe(!verbatim);
            expect(snapshot(tree.rootNode)).toEqual(snapshot(fresh.rootNode));
            const captures = (current: Tree): unknown =>
              highlights
                .captures(current.rootNode)
                .map(({ name, node }) => [name, node.type, node.text, node.startIndex, node.endIndex]);
            expect(captures(tree)).toEqual(captures(fresh));
            if (verbatim) {
              expect(tree.rootNode.descendantsOfType('interpolation_format_clause').map((node) => node.text)).toEqual([
                `:a${newline}b`,
              ]);
            }
          } finally {
            fresh.delete();
          }
          source = next;
        }
      } finally {
        tree.delete();
      }
    }
  } finally {
    highlights.delete();
    parser.delete();
  }
});

test('preserves interpolation brace and format ranges when adding and removing a format', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
  const highlights = new Query(parser.language!, readFileSync('queries/highlights.scm', 'utf8'));
  try {
    for (const prefix of ['$"', '$@"', '$"""']) {
      for (const spacing of [' ', '\t', '\n', '\r\n', '\r']) {
        const closing = prefix === '$"""' ? '"""' : '"';
        let source = `class C { string value = ${prefix}{1${spacing}}${closing}; }`;
        let tree = parser.parse(source)!;
        try {
          check(tree, false);
          const index = source.indexOf(`}${closing}`);
          for (const format of [':D', '']) {
            const oldEnd = index + (format ? 0 : 2);
            const next = source.slice(0, index) + format + source.slice(oldEnd);
            tree.edit(
              new Edit({
                startIndex: index,
                oldEndIndex: oldEnd,
                newEndIndex: index + format.length,
                startPosition: position(source, index),
                oldEndPosition: position(source, oldEnd),
                newEndPosition: position(next, index + format.length),
              })
            );
            const previous = tree;
            tree = parser.parse(next, previous)!;
            previous.delete();
            const fresh = parser.parse(next)!;
            try {
              check(tree, Boolean(format));
              expect(snapshot(tree.rootNode)).toEqual(snapshot(fresh.rootNode));
            } finally {
              fresh.delete();
            }
            source = next;
          }
        } finally {
          tree.delete();
        }

        function check(current: Tree, formatted: boolean): void {
          expect(current.rootNode.hasError).toBe(false);
          const braces = highlights
            .captures(current.rootNode)
            .filter(({ name, node }) => name === 'punctuation.bracket' && node.type === 'interpolation_brace')
            .map(({ node }) => [node.text, node.startIndex, node.endIndex]);
          const end = current.rootNode.text.indexOf(`}${closing}`) + 1;
          const text = formatted ? '}' : `${spacing}}`;
          expect(braces.at(-1)).toEqual([text, end - text.length, end]);
          expect(current.rootNode.descendantsOfType('interpolation_format_clause').map((node) => node.text)).toEqual(
            formatted ? [':D'] : []
          );
        }
      }
    }
  } finally {
    highlights.delete();
    parser.delete();
  }
});

test('retains declarations around incomplete raw interpolation formats through edits', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
  try {
    for (const literal of [
      '$"""a{{1:}"""',
      '$$"""a{{{1:X}"""',
      '$$"""}}{{{1:X}"""',
      '$$"""ab{{{1:X}"""',
      '$$"""{{1:X}{2:Y}"',
      '$$"""a{{1:X}{2:Y}"',
      '$$"""a{{1:X} {2:Y}"',
      '$$"""{{1:X} {2:Y}"',
    ]) {
      const source = `class C { string value = ${literal}; }`;
      const tree = parser.parse(source)!;
      try {
        check(tree);
        const index = source.indexOf('1');
        const next = source.slice(0, index) + '3' + source.slice(index + 1);
        tree.edit(
          new Edit({
            startIndex: index,
            oldEndIndex: index + 1,
            newEndIndex: index + 1,
            startPosition: position(source, index),
            oldEndPosition: position(source, index + 1),
            newEndPosition: position(next, index + 1),
          })
        );
        const incremental = parser.parse(next, tree)!;
        const fresh = parser.parse(next)!;
        try {
          check(incremental);
          expect(snapshot(incremental.rootNode)).toEqual(snapshot(fresh.rootNode));
        } finally {
          incremental.delete();
          fresh.delete();
        }
      } finally {
        tree.delete();
      }

      function check(current: Tree): void {
        expect(current.rootNode.hasError, literal).toBe(true);
        expect(
          current.rootNode.descendantsOfType('class_declaration').map((node) => node.childForFieldName('name')?.text)
        ).toEqual(['C']);
        const fields = current.rootNode.descendantsOfType('field_declaration');
        expect(fields, literal).toHaveLength(1);
        expect(
          fields[0]!.descendantsOfType('variable_declarator').map((node) => node.childForFieldName('name')?.text)
        ).toEqual(['value']);
        expect(current.rootNode.descendantsOfType('interpolation_format_clause'), literal).toHaveLength(
          literal.includes(':X') ? 1 : 0
        );
      }
    }
  } finally {
    parser.delete();
  }
});

function position(source: string, index: number): Point {
  const lines = source.slice(0, index).split('\n');
  return { row: lines.length - 1, column: lines.at(-1)!.length };
}

function snapshot(node: Node): unknown {
  return [
    node.type,
    node.isNamed,
    node.isMissing,
    node.isExtra,
    node.hasError,
    node.startIndex,
    node.endIndex,
    node.startPosition,
    node.endPosition,
    node.children.map((_, index) => node.fieldNameForChild(index)),
    node.children.map(snapshot),
  ];
}

test('retains declarations while a raw interpolation is missing its expression', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
  try {
    for (const tail of ['{{{:', '{{{ :', '{{{ : x']) {
      const source = `class C { string value = $$"""${tail}; int other; }\nclass D { }\n`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError).toBe(true);
        expect(
          tree.rootNode.descendantsOfType('class_declaration').map((node) => node.childForFieldName('name')?.text)
        ).toEqual(['C', 'D']);
        expect(tree.rootNode.descendantsOfType('field_declaration')).toHaveLength(2);
        const start = source.indexOf('other');
        tree.edit(
          new Edit({
            startIndex: start,
            oldEndIndex: start + 5,
            newEndIndex: start + 4,
            startPosition: position(source, start),
            oldEndPosition: position(source, start + 5),
            newEndPosition: position(source, start + 4),
          })
        );
        const changed = source.slice(0, start) + 'next' + source.slice(start + 5);
        const incremental = parser.parse(changed, tree)!;
        const fresh = parser.parse(changed)!;
        try {
          expect(snapshot(incremental.rootNode)).toEqual(snapshot(fresh.rootNode));
          expect(
            incremental.rootNode
              .descendantsOfType('class_declaration')
              .map((node) => node.childForFieldName('name')?.text)
          ).toEqual(['C', 'D']);
        } finally {
          incremental.delete();
          fresh.delete();
        }
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});
