# @willbooster/tree-sitter-c-sharp

[![npm version](https://img.shields.io/npm/v/@willbooster/tree-sitter-c-sharp.svg)](https://www.npmjs.com/package/@willbooster/tree-sitter-c-sharp)
[![license](https://img.shields.io/npm/l/@willbooster/tree-sitter-c-sharp.svg)](https://www.npmjs.com/package/@willbooster/tree-sitter-c-sharp)
[![Test](https://github.com/WillBooster/tree-sitter-c-sharp/actions/workflows/test.yml/badge.svg)](https://github.com/WillBooster/tree-sitter-c-sharp/actions/workflows/test.yml)
[![Test rust](https://github.com/WillBooster/tree-sitter-c-sharp/actions/workflows/test-rust.yml/badge.svg)](https://github.com/WillBooster/tree-sitter-c-sharp/actions/workflows/test-rust.yml)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![wbfy](https://img.shields.io/badge/wbfy-20.26.0-1e90ff.svg)](https://github.com/WillBooster/shared/tree/main/packages/wbfy)
[![crates.io](https://img.shields.io/crates/v/willbooster-tree-sitter-c-sharp.svg)](https://crates.io/crates/willbooster-tree-sitter-c-sharp)

C# grammar for [tree-sitter](https://github.com/tree-sitter/tree-sitter), forked from
[tree-sitter/tree-sitter-c-sharp](https://github.com/tree-sitter/tree-sitter-c-sharp). We are grateful
to its authors and contributors. This is not an official release of that project.

This fork fixes parsing bugs and raises conformance with the [C# language specification](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/language-specification/readme).

The grammar is based upon the Roslyn grammar with changes in order to:

- Deal with differences between the parsing technologies
- Work around some bugs in that grammar
- Handle `#if`, `#else`, `#elif`, `#endif` blocks
- Support syntax highlighting/parsing of fragments
- Simplify the output tree
- Reduce parser state count and complexity
- Be in-line with tree-sitter's convention where applicable

Known gaps:

- `async`, `var` and `await` cannot be used as identifiers everywhere they are valid
- File-based apps preprocessor directives (`#:property`, `#:package`, `#:sdk`, `#:project`) are not yet recognized

## Usage

The npm package ships `tree-sitter-c_sharp.wasm` for [web-tree-sitter](https://www.npmjs.com/package/web-tree-sitter):

```js
import { fileURLToPath } from 'node:url';
import { Language, Parser } from 'web-tree-sitter';

await Parser.init();
const parser = new Parser();
const wasmPath = fileURLToPath(import.meta.resolve('@willbooster/tree-sitter-c-sharp/tree-sitter-c_sharp.wasm'));
parser.setLanguage(await Language.load(wasmPath));
const tree = parser.parse('class Program {}\n');
```

The package also ships the node types in `src/node-types.json`.

In Rust, depend on the [crate](https://crates.io/crates/willbooster-tree-sitter-c-sharp):

```toml
[dependencies]
tree-sitter = "0.27"
tree-sitter-c-sharp = { package = "willbooster-tree-sitter-c-sharp", version = "1" }
```

```rust
let mut parser = tree_sitter::Parser::new();
parser.set_language(&tree_sitter_c_sharp::LANGUAGE.into())?;
```

## Development

```sh
mise install
bun install --frozen-lockfile
bun run build/ci
bun run test
script/parse-examples
cargo test
```

`bun run test` runs:

- the corpus in `test/corpus`, with the native build and with the Wasm build (the first run downloads the WASI SDK);
- an incremental-parsing check (`test/unit/incremental.test.ts`): `tree-sitter fuzz` edits each corpus case at random,
  reparses it, undoes the edits, and reparses again. `TREE_SITTER_SEED`, `TREE_SITTER_ITERATIONS`, and
  `TREE_SITTER_EDITS` run other or more edits;
- a check that the real-world C# files cloned into `examples/` fail to parse exactly as listed in
  `script/known-failures.txt`. The first run clones them. The example repositories are pinned to commits in
  `script/parse-examples`. After a grammar change or a moved pin alters that list, `script/parse-examples` rewrites
  it; review its diff before committing;
- a performance check (`test/unit/performance.test.ts`) that recovering from an error on each of 10,000 lines takes
  linear time, since consumers parse files while they are being edited. It loads the Wasm build through
  web-tree-sitter, which `bun run build/ci` rebuilds after regenerating the parser.

CI also runs these tests on Linux arm64 and macOS, where the Rust binding compiles the parser natively, and fuzzes the parser with libFuzzer and sanitizers
(`.github/workflows/robustness.yml`).

### References

- [C# language specification](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/language-specification/readme)
- [Official C# 8 Draft Language Spec](https://github.com/dotnet/csharpstandard/tree/draft-v8/standard) provides chapters that formally define the language grammar.
- [Roslyn C# language grammar export](https://github.com/dotnet/roslyn/blob/master/src/Compilers/CSharp/Portable/Generated/CSharp.Generated.g4)
- [SharpLab](https://sharplab.io) (web-based syntax tree playground based on Roslyn)
