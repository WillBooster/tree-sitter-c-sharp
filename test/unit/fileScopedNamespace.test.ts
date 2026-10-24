import { Language, type Node, Parser, Query, type Tree } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

import { editTree, syntaxSnapshot } from '../helpers/syntaxSnapshot';

test.each(['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029'])(
  'keeps file-scoped namespace query ranges around following declarations through %j edits',
  async (newline) => {
    await Parser.init();
    const language = await Language.load('tree-sitter-c_sharp.wasm');
    const parser = new Parser().setLanguage(language);
    const query = new Query(language, '[(namespace_declaration) (file_scoped_namespace_declaration)] @namespace');
    let source = '';
    let previous: Tree | undefined;
    try {
      for (const block of [false, true, false]) {
        const next =
          `using Outer;\nnamespace N${block ? ' {' : ';'}\n${block ? '' : 'extern alias Inner;\n'}using X;\nclass C { class Nested {} }\nrecord R;\ninterface I {}${block ? '\n}' : ''}`.replaceAll(
            '\n',
            newline
          );
        if (previous) editTree(previous, source, next);
        const tree = parser.parse(next, previous)!;
        previous?.delete();
        previous = tree;
        source = next;
        const fresh = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(syntaxSnapshot(tree.rootNode)).toEqual(syntaxSnapshot(fresh.rootNode));
          const captures = query.captures(tree.rootNode);
          expect(captures).toHaveLength(1);
          const namespace = captures[0]!.node;
          expect(namespace.childForFieldName('name')?.text).toBe('N');
          const members = tree.rootNode.descendantsOfType([
            'class_declaration',
            'record_declaration',
            'interface_declaration',
          ]);
          expect(members.map((member) => member.childForFieldName('name')?.text)).toEqual(['C', 'Nested', 'R', 'I']);
          for (const member of members) {
            expect(namespace.startIndex).toBeLessThan(member.startIndex);
            expect(namespace.endIndex).toBeGreaterThanOrEqual(member.endIndex);
            expect(enclosingNamespace(member)?.id).toBe(namespace.id);
          }
          const usings = tree.rootNode.descendantsOfType('using_directive');
          expect(usings[0]!.parent?.id).toBe(tree.rootNode.id);
          expect(enclosingNamespace(usings[1]!)?.id).toBe(namespace.id);
          if (!block) {
            expect(enclosingNamespace(tree.rootNode.descendantsOfType('extern_alias_directive')[0]!)?.id).toBe(
              namespace.id
            );
          }
        } finally {
          fresh.delete();
        }
      }
    } finally {
      previous?.delete();
      query.delete();
      parser.delete();
    }
  }
);

function enclosingNamespace(node: Node): Node | undefined {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'namespace_declaration' || parent.type === 'file_scoped_namespace_declaration') return parent;
  }
  return undefined;
}
