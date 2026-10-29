import fs from 'node:fs';

import { Language, Parser, Query, type Tree } from '@willbooster/web-tree-sitter';
import { expect, test } from 'vitest';

test('distinguishes member declarations from locals and method declarations from local functions', async () => {
  const source = `interface I { void Signature(); }
class C {
  int Field, OtherField, @escapedField, Ωfield;
  event System.Action FieldEvent;
  int Property { get; set; }
  event System.Action AccessorEvent { add {} remove {} }
  void Method(int parameter) { int local = Field; void LocalFunction() {} }
}`;
  await withHighlights(async (parser, query) => {
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      expectCaptures(query, tree, source, 'variable.member', [
        'Field',
        'OtherField',
        '@escapedField',
        'Ωfield',
        'FieldEvent',
        'Property',
        'AccessorEvent',
      ]);
      expectCaptures(query, tree, source, 'function.method', ['Signature', 'Method']);
      expectCaptures(query, tree, source, 'function', ['LocalFunction']);
      expectCaptures(query, tree, source, 'variable.parameter', ['parameter']);
      const variables = query.captures(tree.rootNode).filter((capture) => capture.name === 'variable');
      expect(variables.some((capture) => capture.node.text === 'local')).toBe(true);
      expect(
        variables.some(
          (capture) => capture.node.text === 'Field' && capture.node.startIndex === source.lastIndexOf('Field')
        )
      ).toBe(true);
    } finally {
      tree.delete();
    }
  });
});

test('highlights allows as a keyword only in anti-constraints', async () => {
  const source = 'class C<T> where T : allows ref struct { int allows; void M() { allows = 1; } }';
  await withHighlights(async (parser, query) => {
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      expect(
        query
          .captures(tree.rootNode)
          .filter((capture) => capture.name === 'keyword' && capture.node.text === 'allows')
          .map((capture) => capture.node.startIndex)
      ).toEqual([source.indexOf('allows')]);
    } finally {
      tree.delete();
    }
  });
});

test('captures object initializer members inside #if branches as members', async () => {
  const source =
    'var o = new P {\n  First = 1,\n#if X\n  Second = 2,\n#elif Y\n  Third = 3,\n#else\n  Fourth = 4,\n#endif\n};\n' +
    'var a = new[] {\n#if X\n  local = 1,\n#endif\n};\n' +
    'var n = new P {\n#if X\n  Fifth = nested = 5,\n#endif\n};';
  await withHighlights(async (parser, query) => {
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      expectCaptures(query, tree, source, 'variable.member', ['First', 'Second', 'Fifth']);
    } finally {
      tree.delete();
    }
  });
});

test('captures only call names across direct, generic, qualified, conditional and pointer calls', async () => {
  const source = `unsafe class C {
  void Definition() {
    Direct(); Generic<Argument>(); target.Member(); target.GenericMember<MemberArgument>();
    target?.Conditional(); target?.ConditionalGeneric<ConditionalArgument>(); pointer->Pointer();
    target.Child.Chained(); target?.ConditionalChild.ConditionalChained(); target.@escapedCall(); target.Ωcall();
    Holder<TypeArgument> value = new Holder<TypeArgument>();
  }
}`;
  await withHighlights(async (parser, query) => {
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      expectCaptures(query, tree, source, 'function.call', ['Direct', 'Generic']);
      expectCaptures(query, tree, source, 'function.method.call', [
        'Member',
        'GenericMember',
        'Conditional',
        'ConditionalGeneric',
        'Pointer',
        'Chained',
        'ConditionalChained',
        '@escapedCall',
        'Ωcall',
      ]);
      expectCaptures(query, tree, source, 'function.method', ['Definition']);
      expectCaptures(query, tree, source, 'variable.member', [
        'Member',
        'GenericMember',
        'Conditional',
        'ConditionalGeneric',
        'Pointer',
        'Child',
        'Chained',
        'ConditionalChild',
        'ConditionalChained',
        '@escapedCall',
        'Ωcall',
      ]);
      const captures = query.captures(tree.rootNode);
      for (const name of ['Argument', 'MemberArgument', 'ConditionalArgument', 'TypeArgument']) {
        expect(
          captures.some((capture) => capture.name === 'type' && capture.node.text === name),
          name
        ).toBe(true);
        expect(
          captures.some((capture) => capture.name.startsWith('function') && capture.node.text === name),
          name
        ).toBe(false);
      }
    } finally {
      tree.delete();
    }
  });
});

test('captures initializer member names without coloring collection assignments or index arguments', async () => {
  const source = `class C { void M() {
    var a = new C { First = local, Child = { Nested = local, Grandchild = { Deep = local } }, [index] = local };
    C b = new() { Implicit = local };
    var c = a with { Changed = local };
    var d = new { Named = local, local };
    var collection = new Collection { (local = 1), { key, local = 2 } };
    var array = new[] { local = 3 };
  } }`;
  await withHighlights(async (parser, query) => {
    const tree = parser.parse(source)!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      expectCaptures(query, tree, source, 'variable.member', [
        'First',
        'Child',
        'Nested',
        'Grandchild',
        'Deep',
        'Implicit',
        'Changed',
        'Named',
      ]);
      for (const capture of query.captures(tree.rootNode)) {
        if (['local', 'index', 'key'].includes(capture.node.text)) expect(capture.name).toBe('variable');
      }
    } finally {
      tree.delete();
    }
  });
});

test('captures member access names and parses other member expressions', async () => {
  await withHighlights(async (parser, query) => {
    for (const expression of [
      'target.Value',
      'target.Call()',
      'target.Generic<Type>()',
      'target?.Conditional<Type>()',
      'new C { Value = 0 }',
      'target with { Value = 0 }',
      'new { Value = 0 }',
    ]) {
      const source = `// Ω😀\nclass C { object M() => ${expression}; }`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        if (expression === 'target.Value') {
          expectCaptures(query, tree, source, 'variable.member', ['Value']);
          expectCaptures(query, tree, source, 'function.method.call', []);
        }
      } finally {
        tree.delete();
      }
    }
  });
});

async function withHighlights(run: (parser: Parser, query: Query) => Promise<void>): Promise<void> {
  await Parser.init();
  const language = await Language.load('tree-sitter-c_sharp.wasm');
  const parser = new Parser().setLanguage(language);
  const query = new Query(language, fs.readFileSync('queries/highlights.scm', 'utf8'));
  try {
    await run(parser, query);
  } finally {
    query.delete();
    parser.delete();
  }
}

function expectCaptures(query: Query, tree: Tree, source: string, name: string, expected: string[]): void {
  expect(
    query
      .captures(tree.rootNode)
      .filter((capture) => capture.name === name)
      .map(captureSnapshot),
    source
  ).toEqual(expected.map((text) => [name, text, source.indexOf(text), source.indexOf(text) + text.length]));
}

function captureSnapshot(capture: ReturnType<Query['captures']>[number]): unknown {
  return [capture.name, capture.node.text, capture.node.startIndex, capture.node.endIndex];
}
