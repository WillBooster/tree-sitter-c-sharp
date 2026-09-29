/// <reference types="vite/client" />
import { Language, Parser } from '@willbooster/web-tree-sitter';
import runtimeUrl from '@willbooster/web-tree-sitter/web-tree-sitter.wasm?url';
import { expect, test } from 'vitest';

import csharpUrl from '../../tree-sitter-c_sharp.wasm?url';

test('parses C# in a browser, loading the Wasm files over HTTP', async () => {
  await Parser.init({ locateFile: () => runtimeUrl });
  const parser = new Parser();
  parser.setLanguage(await Language.load(csharpUrl));
  expect(parser.parse('class Program {}')?.rootNode.toString()).toBe(
    '(compilation_unit (class_declaration name: (identifier) body: (declaration_list)))'
  );
});
