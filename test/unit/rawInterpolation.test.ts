import { Language, Parser, type Tree } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('retains raw interpolation expressions beside literal braces', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
  try {
    for (const dollars of [2, 3, 4]) {
      for (const literalBraces of new Set([1, dollars - 1])) {
        const source = `var Longitude = 7;
var Latitude = 8;
var location = ${'$'.repeat(dollars)}"""
  You are at ${'{'.repeat(dollars + literalBraces)}Longitude${'}'.repeat(dollars)}, ${'{'.repeat(dollars)}Latitude${'}'.repeat(dollars + literalBraces)}
  """;`;
        const start = source.indexOf('{');
        const withoutLeadingBraces = source.slice(0, start) + source.slice(start + literalBraces);
        for (const text of [source, withoutLeadingBraces]) {
          const tree = parser.parse(text)!;
          try {
            expect(tree.rootNode.hasError).toBe(false);
            const expressions = tree.rootNode.descendantsOfType('interpolation');
            expect(expressions.map((node) => node.descendantsOfType('identifier').map((name) => name.text))).toEqual([
              ['Longitude'],
              ['Latitude'],
            ]);
            expect(
              expressions.flatMap((node) => node.descendantsOfType('interpolation_brace').map((brace) => brace.text))
            ).toEqual(['{'.repeat(dollars), '}'.repeat(dollars), '{'.repeat(dollars), '}'.repeat(dollars)]);
          } finally {
            tree.delete();
          }
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('accepts format newlines only in verbatim interpolated strings', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
  try {
    for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
      for (const verbatim of [false, true]) {
        const source = `class C { string value = $${verbatim ? '@' : ''}"{1:a${newline}b}"; }`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, JSON.stringify(source)).toBe(!verbatim);
          if (verbatim) {
            expect(tree.rootNode.descendantsOfType('interpolation_format_clause').map((node) => node.text)).toEqual([
              `:a${newline}b`,
            ]);
          }
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves interpolation format ranges with and without a format', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
  try {
    for (const prefix of ['$"', '$@"', '$"""']) {
      for (const spacing of [' ', '\t', '\n', '\r\n', '\r']) {
        const closing = prefix === '$"""' ? '"""' : '"';
        for (const format of ['', ':D']) {
          const source = `class C { string value = ${prefix}{1${spacing}${format}}${closing}; }`;
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError).toBe(false);
            expect(tree.rootNode.descendantsOfType('interpolation_format_clause').map((node) => node.text)).toEqual(
              format ? [format] : []
            );
          } finally {
            tree.delete();
          }
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('retains declarations around incomplete raw interpolation formats', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
  try {
    for (const literal of ['$"""a{{1:}"""', '$$"""a{{{1:X}"""', '$$"""}}{{{1:X}"""', '$$"""ab{{{1:X}"""']) {
      for (const value of [literal, literal.replace('1', '3')]) {
        const tree = parser.parse(`class C { string value = ${value}; }`)!;
        try {
          check(tree);
        } finally {
          tree.delete();
        }
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

test('retains following classes after unterminated raw interpolation formats', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
  try {
    for (const literal of ['$$"""{{1:X}{2:Y}"', '$$"""a{{1:X}{2:Y}"', '$$"""a{{1:X} {2:Y}"', '$$"""{{1:X} {2:Y}"']) {
      for (const value of [literal, literal.replace('1', '3')]) {
        const tree = parser.parse(`class C { string value = ${value}; }\nclass Following { int After; }`)!;
        try {
          expect(tree.rootNode.hasError, literal).toBe(true);
          const following = tree.rootNode.namedChildren.find(
            (node) => node.type === 'class_declaration' && node.childForFieldName('name')?.text === 'Following'
          );
          expect(following?.hasError, literal).toBe(false);
          expect(following?.text, literal).toBe('class Following { int After; }');
          expect(following!.descendantsOfType('field_declaration').map((node) => node.text)).toEqual(['int After;']);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('retains declarations while a raw interpolation is missing its expression', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
  try {
    for (const tail of ['{{{:', '{{{ :', '{{{ : x']) {
      for (const field of ['other', 'next']) {
        const tree = parser.parse(`class C { string value = $$"""${tail}; int ${field}; }\nclass D { }\n`)!;
        try {
          expect(tree.rootNode.hasError).toBe(true);
          expect(
            tree.rootNode.descendantsOfType('class_declaration').map((node) => node.childForFieldName('name')?.text)
          ).toEqual(['C', 'D']);
          if (field === 'other') expect(tree.rootNode.descendantsOfType('field_declaration')).toHaveLength(2);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});
