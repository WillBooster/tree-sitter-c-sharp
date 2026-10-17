import { Language, Parser } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c_sharp.wasm');
});

test('does not treat Unicode identifiers as ASCII type-test keywords', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const identifier of ['ių', 'aų']) {
      const source = `var result = value ${identifier} T;`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(true);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves Unicode lambda parameter types that resemble ASCII modifiers', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const type of ['reŦ', 'ouŴ', 'iŮ', 'readonlŹ', 'scopeŤ']) {
      const source = `var function = (${type} value) => value;`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const parameter = tree.rootNode.descendantsOfType('parameter')[0]!;
        expect(parameter?.childForFieldName('type')?.text, source).toBe(type);
        expect(parameter?.childForFieldName('name')?.text, source).toBe('value');
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});
