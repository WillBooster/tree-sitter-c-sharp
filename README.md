# @willbooster/tree-sitter-c-sharp

This is a fork of [tree-sitter/tree-sitter-c-sharp](https://github.com/tree-sitter/tree-sitter-c-sharp). We are grateful to its authors and
contributors. This is not an official release of that project.

C# grammar for [tree-sitter](https://github.com/tree-sitter/tree-sitter) based upon the Roslyn grammar with changes in order to:

- Deal with differences between the parsing technologies
- Work around some bugs in that grammar
- Handle `#if`, `#else`, `#elif`, `#endif` blocks
- Support syntax highlighting/parsing of fragments
- Simplify the output tree
- Reduce parser state count and complexity
- Be in-line with tree-sitter's convention where applicable

### Status

Comprehensive supports C# 1 through 14.0 with the following exceptions:

- [ ] `async`, `var` and `await` cannot be used as identifiers everywhere they are valid
- [ ] File-based apps preprocessor directives (`#:property`, `#:package`, `#:sdk`, `#:project`) are not yet recognized

### References

- [Official C# 8 Draft Language Spec](https://github.com/dotnet/csharpstandard/tree/draft-v8/standard) provides chapters that formally define the language grammar.
- [Roslyn C# language grammar export](https://github.com/dotnet/roslyn/blob/master/src/Compilers/CSharp/Portable/Generated/CSharp.Generated.g4)
- [SharpLab](https://sharplab.io) (web-based syntax tree playground based on Roslyn)
