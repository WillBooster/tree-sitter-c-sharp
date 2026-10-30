import path from 'node:path';

import { Language, Parser } from '@willbooster/web-tree-sitter';
import { beforeAll, expect, test } from 'vitest';

const wasmPath = path.join(import.meta.dirname, '../../tree-sitter-c_sharp.wasm');

let language: Language;

beforeAll(async () => {
  await Parser.init();
  language = await Language.load(wasmPath);
});

test('preserves file directive fields and following source across line endings', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
      for (const ending of ['', '\n']) {
        let lowercaseTree: string | undefined;
        for (const uppercase of [false, true]) {
          const source =
            [
              '#:sdk\u00A0Microsoft.NET.Sdk\f',
              '#:package "Humanizer" @ 2.0',
              '#:Package Newtonsoft.Json Version=13.0.3',
              '#:property Description = "Hello world"',
              '#:property Empty=',
              '#:project ../my project',
              '#:ref ../reference.cs',
              '#:include ../included.cs',
              '#:exclude ../excluded.cs',
              'class Program {}',
            ]
              .map((line) => (uppercase ? line.replace(/^#:\w+/, (kind) => kind.toUpperCase()) : line))
              .join(newline) + ending;
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, tree.rootNode.toString()).toBe(false);
            if (uppercase) expect(tree.rootNode.toString()).toBe(lowercaseTree);
            else lowercaseTree = tree.rootNode.toString();
            const directives = tree.rootNode.descendantsOfType('file_directive');
            expect(
              directives.map((node) => [node.childForFieldName('name')?.text, node.childForFieldName('value')?.text])
            ).toEqual([
              ['Microsoft.NET.Sdk', undefined],
              ['"Humanizer"', '2.0'],
              ['Newtonsoft.Json', undefined],
              ['Description', '"Hello world"'],
              ['Empty', undefined],
              [undefined, '../my project'],
              [undefined, '../reference.cs'],
              [undefined, '../included.cs'],
              [undefined, '../excluded.cs'],
            ]);
            expect(directives[2]?.childForFieldName('metadata')?.text).toBe('Version=13.0.3');
            expect(tree.rootNode.namedChildren.at(-1)?.text).toBe('class Program {}');
          } finally {
            tree.delete();
          }
        }
      }
    }
    const tree = parser.parse('#:property Empty=')!;
    try {
      expect(tree.rootNode.hasError).toBe(false);
      expect(tree.rootNode.namedChildren[0]?.childForFieldName('name')?.text).toBe('Empty');
    } finally {
      tree.delete();
    }
  } finally {
    parser.delete();
  }
});

test('keeps unknown directive payloads opaque and ends ranges on their own line', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
      for (const line of [
        '#:sdk Foo\f',
        '#:sdk\u00A0Foo',
        '#:Package Humanizer@2',
        '#:tool T',
        '#:tool // payload',
        ...['project', 'ref', 'include', 'exclude', 'tool'].flatMap((kind) =>
          [' ', '\t', '\u00A0', '\u2000'].map((suffix) => `#:${kind} // payload${suffix}`)
        ),
        '#:project /* payload',
        '#:sdk A /* payload',
        '#:package A // payload',
        '#:property A= // payload',
        '#:nuget-source https://api.nuget.org/v3/index.json',
        '#:run --watch',
        '#:',
        '#:package-extension data',
      ]) {
        const source = `${line}${newline} \n\nclass Program {}`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, JSON.stringify(source)).toBe(false);
          const [directive, declaration] = tree.rootNode.namedChildren;
          expect(directive?.type).toBe('file_directive');
          expect(directive?.text).toBe(line + newline);
          expect(declaration?.text).toBe('class Program {}');
          expect(tree.rootNode.descendantsOfType('comment')).toHaveLength(0);
          if (/^#:(project|ref|include|exclude|tool) \/\//.test(line)) {
            expect(directive?.childForFieldName('value')?.text).toBe(line.slice(line.indexOf('//')));
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

test('keeps incomplete SDK payloads on their ignored directive line', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const kind of ['sdk', 'package', 'property', 'project', 'ref', 'include', 'exclude']) {
      for (const payload of ['', ' ', ' K', ' PublishAot false', ' "unfinished', ' =', ' @']) {
        const line = `#:${kind}${payload}`;
        for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029', '']) {
          const source = line + newline + (newline ? 'class Program {}' : '');
          const tree = parser.parse(source)!;
          try {
            expect(tree.rootNode.hasError, JSON.stringify(source)).toBe(false);
            const directive = tree.rootNode.namedChildren[0]!;
            expect(directive.type).toBe('file_directive');
            expect(directive.text).toBe(line + newline);
            if (newline) expect(tree.rootNode.namedChildren[1]?.text).toBe('class Program {}');
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

test('preserves surrounding declarations when directives are inserted after code', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const prefix of [
      'class Q {}',
      'Console.WriteLine("hi");',
      'using System;\nnamespace N {}\nrecord R(int X);',
    ]) {
      const original = parser.parse(prefix + '\nclass B {}')!;
      const edited = parser.parse(prefix + '\n#:package Newtonsoft.Json@13.0.3\nclass B {}')!;
      try {
        expect(edited.rootNode.hasError).toBe(false);
        expect(
          edited.rootNode.namedChildren.filter((node) => node.type !== 'file_directive').map((node) => node.toString())
        ).toEqual(original.rootNode.namedChildren.map((node) => node.toString()));
        const directive = edited.rootNode.descendantsOfType('file_directive')[0]!;
        expect(directive.childForFieldName('name')?.text).toBe('Newtonsoft.Json');
        expect(directive.childForFieldName('value')?.text).toBe('13.0.3');
      } finally {
        original.delete();
        edited.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('does not open multiline comments inside directive payloads', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const line of ['#:tool /*a', '#:project /*a', '#:sdk A /*a', '#:property A= /*a']) {
      for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
        const source = `${line}${newline}class Program {}\n*/`;
        const tree = parser.parse(source)!;
        try {
          expect(
            tree.rootNode.descendantsOfType('file_directive').map((node) => node.text),
            source
          ).toEqual([line + newline]);
          expect(
            tree.rootNode.descendantsOfType('class_declaration').map((node) => node.text),
            source
          ).toEqual(['class Program {}']);
          expect(tree.rootNode.descendantsOfType('comment'), source).toHaveLength(0);
          expect(tree.rootNode.hasError, source).toBe(true);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps file-directive-looking text inside preprocessor arguments', () => {
  const parser = new Parser();
  parser.setLanguage(language);
  try {
    for (const kind of ['region', 'endregion', 'define', 'undef', 'error', 'warning']) {
      for (const argument of ['#:foo', '#:sdk X', '#:package Humanizer', '#:/ is not valid here']) {
        const source = `#${kind} ${argument}\nclass C{}`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError, source).toBe(false);
          expect(tree.rootNode.descendantsOfType('file_directive'), source).toHaveLength(0);
          expect(
            tree.rootNode.descendantsOfType('preproc_arg').map((node) => node.text),
            source
          ).toEqual([argument]);
          expect(
            tree.rootNode.descendantsOfType('class_declaration').map((node) => node.text),
            source
          ).toEqual(['class C{}']);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves classes after directive-looking preprocessor arguments containing comments', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const kind of ['region', 'endregion', 'define', 'undef', 'error', 'warning']) {
      for (const argument of ['#:sdk/*b*/', '#:a/*b*/ more', '#:Newtonsoft.Json/*/x more']) {
        const source = `#${kind} ${argument}\nclass C{}`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.descendantsOfType('file_directive'), source).toHaveLength(0);
          expect(
            tree.rootNode.descendantsOfType('class_declaration').map((n) => n.text),
            source
          ).toEqual(['class C{}']);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps slash-containing standalone directive kinds opaque', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const kind of ['foo/bar', 'foo/', 'foo/*b*/', 'sdk/*b*/', 'foo//', 'foo/*', 'foo/a/']) {
      const source = `#:${kind} X\nclass C{}`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(
          tree.rootNode.descendantsOfType('file_directive_kind').map((n) => n.text),
          source
        ).toEqual([`#:${kind}`]);
        expect(tree.rootNode.descendantsOfType('comment'), source).toHaveLength(0);
        expect(
          tree.rootNode.descendantsOfType('class_declaration').map((n) => n.text),
          source
        ).toEqual(['class C{}']);
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('separates and trims Unicode horizontal whitespace without changing interior payload text', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const separator of [
      '\u1680',
      ...Array.from({ length: 11 }, (_, i) => String.fromCodePoint(0x20_00 + i)),
      '\u202F',
      '\u205F',
    ]) {
      const source = `#:package${separator}Humanizer@2.0${separator}\n#:project${separator}my${separator}file.cs${separator}\nclass C {}`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        const directives = tree.rootNode.descendantsOfType('file_directive');
        expect(directives[0]?.childForFieldName('name')?.text, source).toBe('Humanizer');
        expect(directives[0]?.childForFieldName('value')?.text, source).toBe('2.0');
        expect(directives[1]?.childForFieldName('value')?.text, source).toBe(`my${separator}file.cs`);
        expect(tree.rootNode.descendantsOfType('class_declaration')[0]?.text).toBe('class C {}');
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test(
  'preserves ordinary preprocessor argument boundaries for directive-looking text',
  // This exhaustive matrix can take nearly nine seconds on the Intel CI runner.
  { timeout: 30_000 },
  () => {
    const parser = new Parser().setLanguage(language);
    try {
      for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
        const separate = parser.parse(`#region${newline}#:package Example${newline}class C{}`)!;
        try {
          expect(separate.rootNode.hasError).toBe(false);
          expect(separate.rootNode.descendantsOfType('preproc_arg')).toHaveLength(0);
          expect(separate.rootNode.descendantsOfType('file_directive')).toHaveLength(1);
          expect(separate.rootNode.descendantsOfType('class_declaration')).toHaveLength(1);
        } finally {
          separate.delete();
        }

        for (const kind of ['region', 'warning', 'error', 'define', 'undef', 'endregion']) {
          const suffixes = [
            '',
            '/',
            '/ ',
            '\\',
            '/*c*/',
            '\\\ncontinued',
            '\\\r\ncontinued',
            String.raw`\/*`,
            '/x',
            '//',
          ];
          const cases = [
            ...suffixes.map((suffix) => ({ separator: '', suffix })),
            ...['\t', '\v', '\f', '\u00A0', '\u3000', '\uFEFF', '\u2000'].flatMap((space) =>
              [space, space.repeat(2), `${space} `, `${space}\t${space}`].flatMap((separator) =>
                suffixes.map((suffix) => ({ separator, suffix }))
              )
            ),
          ];
          for (const { separator, suffix } of cases) {
            const trees = ['', '#:'].map((prefix) =>
              parser.parse(`#${kind} ${separator}${prefix}x${suffix}${newline}class C{}`)!
            );
            try {
              const argumentsByTree = trees.map((tree, i) =>
                tree.rootNode.descendantsOfType('preproc_arg').map((node) => ({
                  text: i === 1 ? node.text.replace('#:', '') : node.text,
                  startIndex: node.startIndex,
                  endIndex: node.endIndex - (i === 1 ? 2 : 0),
                  children: node.children.map((child) => child.type),
                }))
              );
              expect(argumentsByTree[1], JSON.stringify({ kind, separator, suffix, newline })).toEqual(
                argumentsByTree[0]
              );
              expect(trees[1]!.rootNode.descendantsOfType('class_declaration').map((node) => node.text)).toEqual(
                trees[0]!.rootNode.descendantsOfType('class_declaration').map((node) => node.text)
              );
              expect(trees[1]!.rootNode.hasError).toBe(trees[0]!.rootNode.hasError);
            } finally {
              for (const tree of trees) tree.delete();
            }
          }
        }
      }
      for (const kind of ['region', 'endregion']) {
        for (const separator of [' ', '\u00A0', '\u3000', '\uFEFF', '\u00A0\t\u3000']) {
          const tree = parser.parse(`#${kind} ${separator}`)!;
          try {
            expect(tree.rootNode.hasError).toBe(false);
            expect(tree.rootNode.descendantsOfType('preproc_arg')).toHaveLength(0);
          } finally {
            tree.delete();
          }
        }
      }
    } finally {
      parser.delete();
    }
  }
);

test('preserves declarations and standalone directives after malformed preprocessor tails', () => {
  const parser = new Parser().setLanguage(language);
  const declarations = ['class C { void M() { var a = 1; } }', 'class E { /* later */ }'];
  try {
    for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
      for (const directive of ['#pragma warning disable CS0618', '#nullable enable', '#line default']) {
        for (const tail of [
          '#:x',
          '#:package Newtonsoft.Json',
          '#:package Newtonsoft.Json /* tail */',
          '#:x // /* inert',
          '#:x a/*b',
          '#:x "/*"',
          '#:x /*',
        ]) {
          for (const following of ['', `  #:package Good${newline}`]) {
            const source = `${directive} ${tail}${newline}${following}${declarations.join(newline)}`;
            const tree = parser.parse(source)!;
            try {
              expect(tree.rootNode.hasError, source).toBe(true);
              const directives = tree.rootNode.descendantsOfType('file_directive');
              expect(
                directives.map((node) => node.childForFieldName('name')?.text),
                source
              ).toEqual(following ? ['Good'] : []);
              expect(
                tree.rootNode.descendantsOfType('class_declaration').map((node) => node.text),
                source
              ).toEqual(declarations);
              expect(
                tree.rootNode
                  .descendantsOfType('method_declaration')
                  .map((node) => node.childForFieldName('name')?.text)
              ).toEqual(['M']);
            } finally {
              tree.delete();
            }
          }
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('recovers directives and declarations after preprocessor tails', () => {
  const parser = new Parser().setLanguage(language);
  const prefix = '#pragma warning disable CS0618';
  try {
    for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
      const suffix = `${newline}#nullable enable${newline}#:package Good${newline}class C { void M() {} }`;
      for (const tail of ['', ' #:package Bad', ' #:x', ' #:package Bad /* tail */']) {
        const tree = parser.parse(prefix + tail + suffix)!;
        try {
          expect(tree.rootNode.hasError).toBe(Boolean(tail));
          expect(
            tree.rootNode.descendantsOfType('file_directive').map((node) => node.childForFieldName('name')?.text)
          ).toEqual(['Good']);
          expect(
            tree.rootNode.descendantsOfType('class_declaration').map((node) => node.childForFieldName('name')?.text)
          ).toEqual(['C']);
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps directive-looking text inside literals and directive filenames', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const literal of [
      '"#:x"',
      '" #:package Bad"',
      String.raw`"before\n#:x"`,
      '@"#:x"',
      '@"line\n#:package Bad"',
      '$"#:x"',
      '$"{x:#:00}"',
      '$@"{x:#:00}"',
      '$"""{x:#:00}"""',
      '"""#:package Bad"""',
    ]) {
      const source = `class C { string s = ${literal}; void M() {} }\n#:package Good\n`;
      const tree = parser.parse(source)!;
      try {
        expect(tree.rootNode.hasError, source).toBe(false);
        expect(tree.rootNode.descendantsOfType('variable_declarator')[0]?.namedChildren.at(-1)?.text).toBe(literal);
        expect(tree.rootNode.descendantsOfType('method_declaration')[0]?.childForFieldName('name')?.text).toBe('M');
        expect(
          tree.rootNode.descendantsOfType('file_directive').map((node) => node.childForFieldName('name')?.text)
        ).toEqual(['Good']);
      } finally {
        tree.delete();
      }
    }
    for (const directive of [
      '#line 1 "#:package Bad"',
      '#pragma checksum "#:x" "{406ea660-64cf-4c82-b6f0-42d48172a799}" "00"',
    ]) {
      const tree = parser.parse(`${directive}\nclass C {}`)!;
      try {
        expect(tree.rootNode.hasError, directive).toBe(false);
        expect(tree.rootNode.descendantsOfType('file_directive')).toHaveLength(0);
        expect(tree.rootNode.descendantsOfType('class_declaration')[0]?.childForFieldName('name')?.text).toBe('C');
      } finally {
        tree.delete();
      }
    }
  } finally {
    parser.delete();
  }
});

test('preserves standalone directives after consumed preprocessor newlines during recovery', () => {
  const parser = new Parser().setLanguage(language);
  try {
    for (const newline of ['\n', '\r\n', '\r', '\u0085', '\u2028', '\u2029']) {
      for (const middle of ['#nullable enable', '#region r', '#:weird v']) {
        const source = `#:package Before${newline}#pragma warning disable X #:x${newline}${middle}${newline}#:package Good${newline}class C { void M() {} }${newline}`;
        const tree = parser.parse(source)!;
        try {
          expect(tree.rootNode.hasError).toBe(true);
          expect(tree.rootNode.descendantsOfType('file_directive').map((node) => node.text)).toEqual([
            `#:package Before${newline}`,
            ...(middle.startsWith('#:') ? [middle + newline] : []),
            `#:package Good${newline}`,
          ]);
          expect(tree.rootNode.descendantsOfType('class_declaration')[0]?.childForFieldName('name')?.text).toBe('C');
          expect(tree.rootNode.descendantsOfType('method_declaration')[0]?.childForFieldName('name')?.text).toBe('M');
        } finally {
          tree.delete();
        }
      }
    }
  } finally {
    parser.delete();
  }
});

test('keeps recovery errors after a region before a trailing directive', () => {
  const parser = new Parser().setLanguage(language);
  const source = [
    '#:package Before',
    'class C {',
    '#prag#:package Ama warning#endif',
    'disable X #:x',
    'string s = "#:x";',
    'void M(#) ',
    '}',
    '}',
    '#:package Good',
    '',
  ].join('\n');
  const index = 113;
  const tree = parser.parse(`${source.slice(0, index)}#region R\n${source.slice(index)}`)!;
  try {
    expect(tree.rootNode.hasError).toBe(true);
  } finally {
    tree.delete();
    parser.delete();
  }
});
