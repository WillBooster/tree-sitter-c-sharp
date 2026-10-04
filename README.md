# @willbooster/tree-sitter-c-sharp

[![npm version](https://img.shields.io/npm/v/@willbooster/tree-sitter-c-sharp.svg)](https://www.npmjs.com/package/@willbooster/tree-sitter-c-sharp)
[![license](https://img.shields.io/npm/l/@willbooster/tree-sitter-c-sharp.svg)](https://www.npmjs.com/package/@willbooster/tree-sitter-c-sharp)
[![Test](https://github.com/WillBooster/tree-sitter-c-sharp/actions/workflows/test.yml/badge.svg)](https://github.com/WillBooster/tree-sitter-c-sharp/actions/workflows/test.yml)
[![Test rust](https://github.com/WillBooster/tree-sitter-c-sharp/actions/workflows/test-rust.yml/badge.svg)](https://github.com/WillBooster/tree-sitter-c-sharp/actions/workflows/test-rust.yml)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![wbfy](https://img.shields.io/badge/wbfy-20.28.6-1e90ff.svg)](https://github.com/WillBooster/shared/tree/main/packages/wbfy)
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
- A pointer dereference can be assigned to only when its operand is a variable, an address, a parenthesized or
  postfix expression, or a cast of one of these or of an invocation (`*p = 1`, `*(p + 1) = 1`, `*(int*)p = 1`,
  `*dst++ = 1`); `*++p = 1` and `*f() = 1` are not recognized
- File-based apps preprocessor directives (`#:property`, `#:package`, `#:sdk`, `#:project`) are not yet recognized

## Usage

The npm package ships `tree-sitter-c_sharp.wasm` for
[@willbooster/web-tree-sitter](https://www.npmjs.com/package/@willbooster/web-tree-sitter), which runs in Node.js, Bun,
browsers, and Cloudflare Workers. In Node.js and Bun, load it from the package:

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

In Rust, depend on the [crate](https://crates.io/crates/willbooster-tree-sitter-c-sharp) and on
[willbooster-tree-sitter](https://crates.io/crates/willbooster-tree-sitter), the runtime this package is tested and
fuzzed with, whose fixes keep incremental reparses consistent with fresh parses (the grammar also loads in the upstream
`tree-sitter` crate 0.27, whose error recovery never ends on some malformed input):

```toml
[dependencies]
tree-sitter = { package = "willbooster-tree-sitter", version = "1.0.4" }
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

`script/tree-sitter` (also `bun run tree-sitter`) runs the tree-sitter CLI of WillBooster/tree-sitter at the runtime
version locked in `Cargo.lock`, so the parser is generated, built, tested, and fuzzed with the generator and the
runtime this package ships. The first run downloads that CLI from its GitHub Release into `.tmp/`, or builds it with
`cargo` (with the `cmake` that `mise.toml` pins) when the download fails or the release has no binary that runs here. The `tree-sitter-cli` package provides
only the types of the grammar DSL that `grammar.js` checks against; its `tree-sitter` binary is upstream's.

`bun run test` runs:

- the corpus in `test/corpus`, with the native build and with the Wasm build (the first run downloads the WASI SDK);
- an incremental-parsing check (`test/unit/incremental.test.ts`): `script/fuzz-corpus` runs `tree-sitter fuzz`, which
  edits each corpus case at random, reparses it, undoes the edits, and reparses again. `TREE_SITTER_SEED`,
  `TREE_SITTER_ITERATIONS`, and `TREE_SITTER_EDITS` run other or more edits;
- a check that the real-world C# files cloned into `examples/` fail to parse exactly as listed in
  `script/known-failures.txt`. The first run clones them. The example repositories are pinned to commits in
  `script/parse-examples`. After a grammar change or a moved pin alters that list, `script/parse-examples` rewrites
  it; review its diff before committing;
- a performance check (`test/unit/performance.test.ts`) that recovering from an error on each line takes linear time
  (ten times the lines take about ten times the CPU time, under a ceiling), since consumers parse files while they are
  being edited. It loads the Wasm build through @willbooster/web-tree-sitter, which `bun run build/ci` rebuilds after
  regenerating the parser;
- a check that `package.json` and `Cargo.lock` test the same runtime version (`test/unit/runtimeVersion.test.ts`);
- checks that the Wasm build parses C# with @willbooster/web-tree-sitter in Chromium (`test/unit/browser.test.ts`,
  which needs Chromium installed once by `bunx playwright install chromium`) and in Cloudflare Workers with and without
  `nodejs_compat` (`test/unit/workers.test.ts`).

The tests and `script/parse-examples` compile the parser into `.tmp/tree-sitter-lib` rather than the CLI's cache shared
by every checkout; `script/fuzz-corpus` builds a per-run parser in `.tmp/fuzz` and deletes it afterwards. `mise.toml`
sets `TREE_SITTER_LIBDIR` to `.tmp/tree-sitter-lib` as well, so other `tree-sitter` commands run in the checkout use
this checkout's parser too.

`cargo test` also replays edits that `tree-sitter fuzz` found to break incremental parsing on runtimes without the
fixes of willbooster-tree-sitter.

CI also runs these tests on Linux arm64 and macOS, where the Rust binding compiles the parser natively, and fuzzes the
parser with libFuzzer and sanitizers on the willbooster-tree-sitter runtime locked in `Cargo.lock`
(`.github/workflows/robustness.yml`).

### References

- [C# language specification](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/language-specification/readme)
- [Official C# 8 Draft Language Spec](https://github.com/dotnet/csharpstandard/tree/draft-v8/standard) provides
  chapters that formally define the language grammar.
- [Roslyn C# language grammar export](https://github.com/dotnet/roslyn/blob/master/src/Compilers/CSharp/Portable/Generated/CSharp.Generated.g4)
- [SharpLab](https://sharplab.io) (web-based syntax tree playground based on Roslyn)
