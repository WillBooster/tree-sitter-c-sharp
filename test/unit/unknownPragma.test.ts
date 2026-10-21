import { Language, Parser, type Tree } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

import { editTree, syntaxSnapshot } from '../helpers/syntaxSnapshot';

test('bounds unknown pragma text to its physical line through edits', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
  try {
    for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
      let source = '';
      let previous: Tree | undefined;
      try {
        for (const body of [
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
        ]) {
          const next = `class C { void M() {${newline}#pragma${body}${newline}N();${newline}}}${newline}#:package Good${newline}class Following {}`;
          if (previous) editTree(previous, source, next);
          const tree = parser.parse(next, previous)!;
          previous?.delete();
          previous = tree;
          source = next;
          const fresh = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, body).toBe(false);
            expect(syntaxSnapshot(tree.rootNode), body).toEqual(syntaxSnapshot(fresh.rootNode));
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
            fresh.delete();
          }
        }
      } finally {
        previous?.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps pragma keyword boundaries distinct through Unicode and punctuation edits', async () => {
  await Parser.init();
  const parser = new Parser().setLanguage(await Language.load('tree-sitter-c_sharp.wasm'));
  try {
    for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
      let source = '';
      let previous: Tree | undefined;
      try {
        for (const [body, valid] of [
          ['@custom', true],
          ['custom', false],
          ['\u00ADcustom', false],
          ['\u200Ccustom', false],
          [String.raw`\u0063ustom`, false],
          ['\u{E0001}custom', true],
          ['\u1C89custom', false],
          ['\uA7CEcustom', true],
          [String.raw`\q`, true],
          ['@custom', true],
        ] as const) {
          const next = `class C { void M() {${newline}#pragma${body}${newline}N();${newline}}}${newline}class Following {}`;
          if (previous) editTree(previous, source, next);
          const tree = parser.parse(next, previous)!;
          previous?.delete();
          previous = tree;
          source = next;
          const fresh = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, body).toBe(!valid);
            expect(syntaxSnapshot(tree.rootNode), body).toEqual(syntaxSnapshot(fresh.rootNode));
            if (valid) {
              expect(tree.rootNode.descendantsOfType('invocation_expression').map((node) => node.text)).toEqual([
                'N()',
              ]);
              expect(
                tree.rootNode.descendantsOfType('class_declaration').map((node) => node.childForFieldName('name')?.text)
              ).toEqual(['C', 'Following']);
            }
          } finally {
            fresh.delete();
          }
        }
      } finally {
        previous?.delete();
      }
    }
  } finally {
    parser.delete();
  }
});
