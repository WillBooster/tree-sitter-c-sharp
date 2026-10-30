import assert from 'node:assert/strict';
import path from 'node:path';

import { Language, Parser } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

const root = path.join(import.meta.dirname, '../..');
let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load(path.join(root, 'tree-sitter-c_sharp.wasm'));
});

test('preserves conditional method signatures and shared bodies', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const body of ['{ return value; }', '=> value;']) {
      const tree = parser.parse(`class C {
#if OUTER
#if A
[System.Obsolete] public T M<T>(T value) where T : class
#elif B
public T M<T>(T value) where T : class
#else
public T M<T>(T value) where T : class
#endif
${body}
#endif
void After() {}
}`)!;
      try {
        expect(tree.rootNode.hasError).toBe(false);
        const signatures = tree.rootNode.descendantsOfType('method_signature');
        expect(signatures).toHaveLength(3);
        for (const signature of signatures) {
          expect(signature.childForFieldName('name')?.text).toBe('M');
          expect(signature.childForFieldName('returns')?.text).toBe('T');
          expect(signature.childForFieldName('type_parameters')?.text).toBe('<T>');
          expect(signature.childForFieldName('parameters')?.text).toBe('(T value)');
          expect(signature.descendantsOfType('type_parameter_constraints_clause').map((node) => node.text)).toEqual([
            'where T : class',
          ]);
        }
        const methods = tree.rootNode.descendantsOfType('method_declaration');
        expect(methods).toHaveLength(1);
        assert.ok(methods[0]);
        expect(methods[0].childForFieldName('name')?.text).toBe('After');
        const conditional = tree.rootNode.descendantsOfType('conditional_method_declaration');
        expect(conditional).toHaveLength(1);
        expect(conditional[0]?.childForFieldName('body')?.text).toBe(body.replace(/;$/, ''));
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});
