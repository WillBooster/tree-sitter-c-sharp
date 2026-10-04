import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { Language, Parser, Query } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('preserves conditional method signatures, shared bodies and method queries', async () => {
  await Parser.init();
  const root = path.join(import.meta.dirname, '../..');
  const language = await Language.load(path.join(root, 'tree-sitter-c_sharp.wasm'));
  const parser = new Parser();
  parser.setLanguage(language);
  const highlights = new Query(language, await readFile(path.join(root, 'queries/highlights.scm'), 'utf8'));
  const tags = new Query(language, await readFile(path.join(root, 'queries/tags.scm'), 'utf8'));
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
        expect(methods).toHaveLength(2);
        assert.ok(methods[0] && methods[1]);
        expect(methods[0].childForFieldName('body')?.text).toBe(body.replace(/;$/, ''));
        expect(methods[1].childForFieldName('name')?.text).toBe('After');
        expect(
          highlights
            .captures(tree.rootNode)
            .filter(({ name }) => name === 'function')
            .map(({ node }) => node.text)
        ).toEqual(['M', 'M', 'M', 'After']);
        expect(tags.captures(tree.rootNode).filter(({ name }) => name === 'definition.method')).toHaveLength(4);
      } finally {
        tree.delete();
      }
    }
  } finally {
    tags.delete();
    highlights.delete();
    parser.delete();
  }
});
