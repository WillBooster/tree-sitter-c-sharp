# @willbooster/tree-sitter-c-sharp

[![npm version](https://img.shields.io/npm/v/@willbooster/tree-sitter-c-sharp.svg)](https://www.npmjs.com/package/@willbooster/tree-sitter-c-sharp)
[![license](https://img.shields.io/npm/l/@willbooster/tree-sitter-c-sharp.svg)](https://www.npmjs.com/package/@willbooster/tree-sitter-c-sharp)
[![Test](https://github.com/WillBooster/tree-sitter-c-sharp/actions/workflows/test.yml/badge.svg)](https://github.com/WillBooster/tree-sitter-c-sharp/actions/workflows/test.yml)
[![Test rust](https://github.com/WillBooster/tree-sitter-c-sharp/actions/workflows/test-rust.yml/badge.svg)](https://github.com/WillBooster/tree-sitter-c-sharp/actions/workflows/test-rust.yml)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![wbfy](https://img.shields.io/badge/wbfy-20.43.2-1e90ff.svg)](https://github.com/WillBooster/shared/tree/main/packages/wbfy)
[![crates.io](https://img.shields.io/crates/v/willbooster-tree-sitter-c-sharp.svg)](https://crates.io/crates/willbooster-tree-sitter-c-sharp)

C# grammar for [tree-sitter](https://github.com/tree-sitter/tree-sitter), forked from
[tree-sitter/tree-sitter-c-sharp](https://github.com/tree-sitter/tree-sitter-c-sharp). We are grateful
to its authors and contributors. This is not an official release of that project.

This fork fixes parsing bugs and raises conformance with the
[C# language specification](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/language-specification/readme).

The grammar is based upon the Roslyn grammar with changes in order to:

- Deal with differences between the parsing technologies
- Work around some bugs in that grammar
- Handle `#if`, `#else`, `#elif`, `#endif` blocks
- Support syntax highlighting/parsing of fragments
- Simplify the output tree
- Reduce parser state count and complexity
- Be in-line with tree-sitter's convention where applicable

Known gaps:

- `var` and `await` cannot be used as identifiers everywhere they are valid

## Syntax trees

Type tests use `is_pattern_expression`. Queries can use `expression` and its concrete expression nodes.
Constant patterns can contain a direct `conditional_access_expression` child.
Conditional access includes its complete dependent chain and, for conditional assignment, the assignment in its `consequence` field.
Tuple-shaped patterns such as `x is (1, 2)` use `recursive_pattern` with a `positional_pattern_clause`.
The contextual type names `nint` and `nuint` use `identifier` nodes.

## Usage

The npm package ships `tree-sitter-c_sharp.wasm` for
[@willbooster/web-tree-sitter](https://www.npmjs.com/package/@willbooster/web-tree-sitter), which runs in Node.js, Bun,
browsers, and Cloudflare Workers. The parser uses WillBooster ABI 7 and loads only with that runtime. Use version 9.0.0 or later within major version 9; upstream's runtime rejects it. Install the runtime alongside the grammar when using
the Wasm parser; it remains an optional peer for consumers that only use the grammar source or queries.

In Node.js and Bun, load it from the package:

```js
import { fileURLToPath } from 'node:url';
import { Language, Parser } from '@willbooster/web-tree-sitter';

await Parser.init();
const parser = new Parser();
const wasmPath = fileURLToPath(import.meta.resolve('@willbooster/tree-sitter-c-sharp/tree-sitter-c_sharp.wasm'));
parser.setLanguage(await Language.load(wasmPath));
const tree = parser.parse('class Program {}\n');
```

In browsers, serve both `.wasm` files and load them by URL. With Vite:

```js
import { Language, Parser } from '@willbooster/web-tree-sitter';
import runtimeUrl from '@willbooster/web-tree-sitter/web-tree-sitter.wasm?url';
import cSharpUrl from '@willbooster/tree-sitter-c-sharp/tree-sitter-c_sharp.wasm?url';

await Parser.init({ locateFile: () => runtimeUrl });
const parser = new Parser();
parser.setLanguage(await Language.load(cSharpUrl));
```

In Cloudflare Workers, which do not allow compiling Wasm at run time, import both `.wasm` files as modules (Wrangler
compiles them at build time) and pass them to `Parser.init` and `Language.load`. This works with and without the
`nodejs_compat` flag:

```js
import { Language, Parser } from '@willbooster/web-tree-sitter';
import runtime from '@willbooster/web-tree-sitter/web-tree-sitter.wasm';
import cSharp from '@willbooster/tree-sitter-c-sharp/tree-sitter-c_sharp.wasm';

await Parser.init({ wasmModule: runtime });
const parser = new Parser();
parser.setLanguage(await Language.load(cSharp));
```

The package also ships the queries in `queries/` and the node types in `src/node-types.json`.
When extending the source grammar, use `grammar.js` and the files under `src/` from the same repository release tag.
Their external tokens and serialized scanner state must match.

In Rust, depend on the [crate](https://crates.io/crates/willbooster-tree-sitter-c-sharp) and on
[willbooster-tree-sitter](https://crates.io/crates/willbooster-tree-sitter), the runtime this package is tested and
fuzzed with. Use runtime 9.0.0 or later within major version 9:

```toml
[dependencies]
tree-sitter = { package = "willbooster-tree-sitter", version = "9.0.0" }
tree-sitter-c-sharp = { package = "willbooster-tree-sitter-c-sharp", version = "11" }
```

```rust
let mut parser = tree_sitter::Parser::new();
parser.set_language(&tree_sitter_c_sharp::LANGUAGE.into())?;
```

## Development

```sh
mise install
bun install --frozen-lockfile
bun playwright install chromium
bun run build/ci
bun run verify
bun run test
cargo test
```

- [Parser generation and validation](docs/development.md): read before changing grammar inputs, runtime versions, examples, or reproducing an incremental parsing failure.

## References

- [C# language specification](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/language-specification/readme)
- [Official C# 8 Draft Language Spec](https://github.com/dotnet/csharpstandard/tree/draft-v8/standard) provides
  chapters that formally define the language grammar.
- [Roslyn C# language grammar export](https://github.com/dotnet/roslyn/blob/master/src/Compilers/CSharp/Portable/Generated/CSharp.Generated.g4)
- [SharpLab](https://sharplab.io) (web-based syntax tree playground based on Roslyn)
