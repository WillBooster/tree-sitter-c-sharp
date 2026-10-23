import { Language, Parser, Query, type Node } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

import { ownershipSamples } from '../fixtures/typedConditionalOwnership';
import { editTree, syntaxSnapshot } from '../helpers/syntaxSnapshot';

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load('tree-sitter-c_sharp.wasm');
});

test('preserves typed conditional fields, ranges and captures across local edits', () => {
  const parser = new Parser().setLanguage(language);
  const query = new Query(
    language,
    '(conditional_expression condition: (_) @condition consequence: (_) @consequence alternative: (_) @alternative)'
  );
  const fields = ['condition', 'consequence', 'alternative'];
  let previous = 'var r = 0;';
  let tree = parser.parse(previous)!;
  try {
    for (const sample of [...ownershipSamples, ...ownershipSamples.toReversed()]) {
      const fresh = parser.parse(sample.source)!;
      editTree(tree, previous, sample.source);
      const incremental = parser.parse(sample.source, tree)!;
      try {
        expect(fresh.rootNode.hasError, sample.source).toBe(false);
        expect(
          fresh.rootNode.descendantsOfType('conditional_expression').map((node) =>
            fields.map((field) => {
              const child = node.childForFieldName(field)!;
              return [child.startIndex, child.endIndex];
            })
          ),
          sample.source
        ).toEqual(sample.ranges);
        const expected = sample.ranges
          .flatMap((ranges) => ranges.map(([start, end], index) => `${fields[index]}:${start}:${end}`))
          .toSorted();
        expect(ownershipCaptures(query, fresh.rootNode), sample.source).toEqual(expected);
        expect(ownershipCaptures(query, incremental.rootNode), sample.source).toEqual(expected);
        expect(syntaxSnapshot(incremental.rootNode), sample.source).toEqual(syntaxSnapshot(fresh.rootNode));
      } finally {
        fresh.delete();
        tree.delete();
        tree = incremental;
        previous = sample.source;
      }
    }
  } finally {
    tree.delete();
    query.delete();
    parser.delete();
  }
});

test('retains nullable creation types around parenthesized arguments', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const type of ['T?', 'int[]?', 'G<int>?', '(int, int)?']) {
      for (const argument of ['', 'f(a ? 1 : 2)', '(a ? 1 : 2)', 'a?[b ? 0 : 1]']) {
        const source = `var r = new ${type}(${argument});`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(
            tree.rootNode.descendantsOfType('nullable_type').map((node) => node.text),
            source
          ).toEqual([type]);
          expect(
            tree.rootNode
              .descendantsOfType('conditional_expression')
              .map((node) => node.childForFieldName('condition')?.text),
            source
          ).toEqual(argument.includes('a ?') ? ['a'] : argument.includes('b ?') ? ['b'] : []);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('retains nullable stack allocation ranks inside conditional alternatives', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const source of [
      'var r = (flag ? (x is T) ? (a ? b : c) : d ? [1] : stackalloc int?[2] : end);',
      '$"{(flag ? (x is T) ? (a ? b : c) : d ? [1] : stackalloc int?[2] : end)}";',
    ]) {
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const allocations = tree.rootNode.descendantsOfType('stackalloc_expression');
        expect(allocations, source).toHaveLength(1);
        const type = allocations[0]!.childForFieldName('type')!;
        expect(type.type, source).toBe('array_type');
        expect(type.text, source).toBe('int?[2]');
        expect(type.childForFieldName('rank')?.text, source).toBe('[2]');
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('invalidates incomplete enclosing-rank context after tail edits', () => {
  const parser = new Parser().setLanguage(language);
  const query = new Query(
    language,
    '(conditional_expression condition: (_) @condition consequence: (_) @consequence alternative: (_) @alternative)'
  );
  const prefix = 'var r = f(' + 'a ? '.repeat(3) + 'g(x is T?[] ? [1] : c) ? '.repeat(3) + 'z';
  const malformed = prefix + '); class Following {}';
  const corrected = prefix + ' : 0'.repeat(6) + '); class Following {}';
  let previous = corrected;
  let tree = parser.parse(previous)!;
  try {
    for (const source of [malformed, corrected, malformed, corrected]) {
      const fresh = parser.parse(source)!;
      editTree(tree, previous, source);
      const incremental = parser.parse(source, tree)!;
      try {
        expect(fresh.rootNode.hasError, source).toBe(source === malformed);
        expect(syntaxSnapshot(incremental.rootNode), source).toEqual(syntaxSnapshot(fresh.rootNode));
        expect(ownershipCaptures(query, incremental.rootNode), source).toEqual(
          ownershipCaptures(query, fresh.rootNode)
        );
        expect(
          fresh.rootNode
            .descendantsOfType('class_declaration')
            .map((node) => [node.text, node.startIndex, node.endIndex, node.hasError]),
          source
        ).toEqual([['class Following {}', source.lastIndexOf('class Following {}'), source.length, false]]);
      } finally {
        fresh.delete();
        tree.delete();
        tree = incremental;
        previous = source;
      }
    }
  } finally {
    tree.delete();
    query.delete();
    parser.delete();
  }
});

function ownershipCaptures(query: Query, node: Node): string[] {
  return query
    .captures(node)
    .map(({ name, node: captured }) => `${name}:${captured.startIndex}:${captured.endIndex}`)
    .toSorted();
}
