import path from 'node:path';
import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

await Parser.init();
const language = await Language.load(path.join(import.meta.dirname, '../../tree-sitter-c_sharp.wasm'));

test('ends comments and shebang lines before every C# line terminator', () => {
  const parser = new Parser().setLanguage(language);
  const query = new Query(
    language,
    '(class_declaration name: (identifier) @class) (method_declaration name: (identifier) @method)'
  );
  try {
    for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
      for (const prefix of ['// header', '/// documentation', '#!/usr/bin/env dotnet']) {
        const source = `${prefix}${newline}class C {${newline}// member${newline}void M() {}${newline}}`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, JSON.stringify(source)).toBe(false);
          expect(tree.rootNode.firstNamedChild?.text).toBe(prefix);
          expect(tree.rootNode.firstNamedChild?.endIndex).toBe(prefix.length);
          expect(query.captures(tree.rootNode).map((c) => [c.name, c.node.text])).toEqual([
            ['class', 'C'],
            ['method', 'M'],
          ]);
          expect(tree.rootNode.descendantsOfType('comment').map((n) => n.text)).toContain('// member');
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

test('retains declarations after preprocessor lines in every newline encoding', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
      const source = [
        '#if X',
        'class A {}',
        '#elif Y',
        'class B {}',
        '#else',
        'class C {}',
        '#endif',
        '#region R',
        'class D {}',
        '#endregion',
        '',
      ].join(newline);
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, JSON.stringify(source)).toBe(false);
        expect(
          tree.rootNode.descendantsOfType('class_declaration').map((n) => n.childForFieldName('name')?.text)
        ).toEqual(['A', 'B', 'C', 'D']);
        expect(tree.rootNode.descendantsOfType('preproc_arg').map((n) => n.text)).toEqual(['R']);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps trailing directive slashes while preserving adjacent block comments', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
      for (const [payload, argument, comment] of [
        ['https://example.com/', 'https://example.com/', undefined],
        ['foo/* note */', 'foo', '/* note */'],
        ['/', '/', undefined],
        ['C:\\dev\\', 'C:\\dev\\', undefined],
        ['\\', '\\', undefined],
      ]) {
        const source = `#region ${payload}${newline}class C {}${newline}#endregion`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(tree.rootNode.descendantsOfType('preproc_arg').map((n) => n.text)).toEqual([argument]);
          expect(tree.rootNode.descendantsOfType('preproc_arg')[0]?.childCount).toBe(0);
          expect(tree.rootNode.descendantsOfType('comment').map((n) => n.text)).toEqual(comment ? [comment] : []);
          expect(tree.rootNode.descendantsOfType('class_declaration').map((n) => n.text)).toEqual(['class C {}']);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('recognizes line endings while scanning modifier lambda parameters', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
      for (const comment of ['', '// parameter boundary']) {
        const source = `class C { void M() { var f = (ref a,${comment}${newline}out b) => 0; } }`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(tree.rootNode.descendantsOfType('lambda_expression')).toHaveLength(1);
          expect(tree.rootNode.descendantsOfType('implicit_parameter').map((n) => n.text)).toEqual(['a', 'b']);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves directive source ranges before blank LF and CRLF lines', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const newline of ['\n', '\r\n']) {
      for (const blankLines of [1, 2]) {
        for (const directive of [
          '#pragma warning disable CS1000',
          '#pragma warning disable CS1000  ',
          '#region R',
          '#region R  ',
        ]) {
          const source = directive + newline.repeat(blankLines + 1) + 'class C {}';
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, source).toBe(false);
            expect(tree.rootNode.firstNamedChild?.text, source).toBe(
              directive + newline.repeat(newline === '\r\n' ? 1 : blankLines + 1)
            );
            expect(tree.rootNode.descendantsOfType('class_declaration').map((n) => n.text)).toEqual(['class C {}']);
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

test('rejects source newlines in ordinary literals while retaining verbatim and escaped content', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
      for (const literal of [`"a${newline}b"`, `"a${newline}"`, `"${newline}\\n"`, `'a${newline}'`, `'${newline}'`]) {
        const source = `class C { object value = ${literal}; }`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, JSON.stringify(source)).toBe(true);
        } finally {
          tree.delete();
        }
      }
      const source = `class C { string text = @"a${newline}b"; char escaped = '\\n'; string escapedText = "a\\r\\nb"; }`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, JSON.stringify(source)).toBe(false);
        expect(tree.rootNode.descendantsOfType('verbatim_string_literal').map((node) => node.text)).toEqual([
          `@"a${newline}b"`,
        ]);
        expect(tree.rootNode.descendantsOfType('escape_sequence').map((node) => node.text)).toEqual([
          String.raw`\n`,
          String.raw`\r`,
          String.raw`\n`,
        ]);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('distinguishes regular interpolation text and formats from multiline expression contexts', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
      for (const literal of [`$"a${newline}b"`, `$"${newline}"`, `$"{1:a${newline}b}"`, `$"{1:a${newline}}"`]) {
        const source = `class C { string value = ${literal}; }`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, JSON.stringify(source)).toBe(true);
        } finally {
          tree.delete();
        }
      }
      for (const spacing of [' ', '\t', newline, '\u00A0', '\u3000', '\uFEFF', ' /* c */ ']) {
        for (const prefix of ['$"', '$@"', '$"""']) {
          const closing = prefix === '$"""' ? '"""' : '"';
          const source = `class C { string value = ${prefix}{1${spacing}:D}${closing}; }`;
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, JSON.stringify(source)).toBe(false);
            const format = tree.rootNode.descendantsOfType('interpolation_format_clause')[0]!;
            expect(format.text).toBe(':D');
            expect(format.startIndex).toBe(source.indexOf(':D'));
            expect(format.firstChild?.text).toBe(':');
          } finally {
            tree.delete();
          }
        }
      }
      for (const literal of [
        `$@"a${newline}b"`,
        `$@"{1:a${newline}b}"`,
        `$"{1+${newline}2}"`,
        `$"{$@"{1:a${newline}b}"}"`,
        `$"""${newline}a${newline}{1}${newline}"""`,
      ]) {
        const source = `class C { string value = ${literal}; }`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, JSON.stringify(source)).toBe(false);
          expect(tree.rootNode.descendantsOfType('interpolated_string_expression')[0]?.text).toBe(literal);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});
