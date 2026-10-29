import { Language, Parser } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('bounds unknown pragma text to its physical line', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
  try {
    for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
      for (const body of new Set([
        ' warning disable CS0168',
        ' custom "unterminated',
        ' custom /* unterminated',
        ' pack(push, 1)',
        ' warningFoo arbitrary',
        String.raw` warning\u0046oo arbitrary`,
        ' checksumExtra arbitrary',
        ' custom #:package Bad',
        ' custom // /*',
        '@custom',
        '$custom',
        '/*c*/custom',
        '(push,1)',
        '"unterminated',
        String.raw`\q`,
        String.raw`\warning`,
        String.raw`\checksum`,
        '',
        ' checksum "file.cs" "{406EA660-64CF-4C82-B6F0-42D48172A799}" "00"',
        ' custom "unterminated',
        ' warning disable CS0168',
      ])) {
        const tree = parser.parse(
          `class C { void M() {${newline}#pragma${body}${newline}N();${newline}}}${newline}#:package Good${newline}class Following {}`
        )!;
        try {
          expect(tree.rootNode.hasError, body).toBe(false);
          expect(
            tree.rootNode
              .descendantsOfType('preproc_pragma')
              .map((node) => (node.text.endsWith(newline) ? node.text.slice(0, -newline.length) : node.text))
          ).toEqual([`#pragma${body}`]);
          expect(tree.rootNode.descendantsOfType('invocation_expression').map((node) => node.text)).toEqual(['N()']);
          expect(
            tree.rootNode.descendantsOfType('file_directive').map((node) => node.childForFieldName('name')?.text)
          ).toEqual(['Good']);
          expect(
            tree.rootNode.descendantsOfType('class_declaration').map((node) => node.childForFieldName('name')?.text)
          ).toEqual(['C', 'Following']);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps pragma keyword boundaries distinct around Unicode and punctuation', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
  try {
    for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
      for (const [body, valid] of [
        ['@custom', true],
        [' warning\u{10400}', true],
        [' checksum\u{10400}', true],
        [' warning\u{10400}/*tail', true],
        [' checksum\u{10428} tail', true],
        ['custom', false],
        ['\u00ADcustom', false],
        ['\u200Ccustom', false],
        [String.raw`\u0063ustom`, false],
        ['\u{E0001}custom', true],
        ['\u1C89custom', false],
        ['\uA7CEcustom', true],
        [String.raw`\q`, true],
      ] as const) {
        const tree = parser.parse(
          `class C { void M() {${newline}#pragma${body}${newline}N();${newline}}}${newline}class Following {}`
        )!;
        try {
          expect(tree.rootNode.hasError, body).toBe(!valid);
          if (valid) {
            expect(tree.rootNode.descendantsOfType('invocation_expression').map((node) => node.text)).toEqual(['N()']);
            expect(
              tree.rootNode.descendantsOfType('class_declaration').map((node) => node.childForFieldName('name')?.text)
            ).toEqual(['C', 'Following']);
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
