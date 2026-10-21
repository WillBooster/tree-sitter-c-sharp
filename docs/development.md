# Parser generation and validation

## Regenerate the parser

Use `script/tree-sitter` for CLI commands so generation and native parsing match the runtime locked in `Cargo.lock`.
Keep the Web runtime in `package.json` at the same version; `test/unit/runtimeVersion.test.ts` checks this contract.
The first CLI invocation downloads a matching release binary or builds it with Cargo; the source build needs the CMake pinned in `mise.toml`.

After changing the grammar, scanner, `tree-sitter.json`, a corpus case, or a tracked example, run `bun run build/ci` and commit the generated `src/` files.
Stage added or removed examples with `git add -A examples` before generation: `script/generate` trains only on the Git-tracked example list.
See `script/generate` for profile inputs and temporary output paths.

## Refresh example results

Run `script/parse-examples` after changing the grammar, examples, or clone pins, and review changes to `script/known-failures.txt` before committing.
The script's cloned checkouts are disposable; keep local work elsewhere.

The tracked `examples/JsonWriter.cs` and `examples/JsonSerializerInternalWriter.cs` are verbatim MIT-licensed snapshots from Newtonsoft.Json commit `52fa3aef1f2cadcd3a3f874251eddc98d3efbbaa`, under `Src/Newtonsoft.Json/` and its `Serialization/` directory respectively.
Refresh these training inputs independently of the clone pins in `script/parse-examples` so changing a test checkout does not change profile training.

## Reproduce incremental failures

Run `TREE_SITTER_SEED=<seed> bun run test test/unit/incremental.test.ts`.
`TREE_SITTER_ITERATIONS` and `TREE_SITTER_EDITS` control the number of random edits.
Run `cargo test` for the saved native edit regressions.

## Browser and Workers checks

Install Chromium once with `bun playwright install chromium` before running `test/unit/browser.test.ts`.
Run `test/unit/workers.test.ts` to exercise both Workers compatibility modes.
