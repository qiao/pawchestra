# Code

This module of `AGENTS.md` gives the rules of the TypeScript code and its style.

## TypeScript

- **Compiler options.** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `verbatimModuleSyntax`, `isolatedModules`, `noImplicitOverride`, `noImplicitReturns`,
  `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`,
  and `noPropertyAccessFromIndexSignature` are on.
- **Erasable syntax.** Declare a field and assign it in the constructor. Use a union of string
  literals in place of an `enum`. Write no constructor parameter properties.
- **Index signatures.** Read a key of an index signature with brackets: `counts['violin']`.
- **Oxlint.** `pnpm lint` runs `oxlint --type-aware .`, which needs `oxlint-tsgolint`. The
  `correctness`, `suspicious`, and `perf` categories are errors. Use `toSorted()` in place of
  `sort()`. `.oxlintrc.json` lists each rule that is off, and the commit that turned it off gives
  the reason. The anti-slop plugin adds the rules of `tools/oxlint/anti-slop/rules/`. For
  example, a symbol name must not contain "shape", and only an I/O boundary may use a `typeof`
  check.
- **Record types.** Give the exact keys when you know them. When the keys are dynamic, type the
  values. Use a specific value type in place of `Record<string, unknown>`.
- **Casts.** Narrow a type with a `value is T` type guard or a generic. The anti-slop rules
  refuse a double cast (`as unknown as T`), also in a test. At one boundary conversion, a single
  cast with a `SAFETY:` comment is permitted.
- **Pure ESM.** Use `import type` for an import of types only.
- **Naming.** Follow the [Google TypeScript Style Guide](https://ts.dev/style/). Use no
  underscore prefixes.
- **Initialisms.** Write a standalone initialism in upper case (`MIDI`, `GM`, `SF3`). Use
  camelCase inside a compound identifier (`MidiFile`, `parseSmf`).

## Code style

- **Format.** oxfmt formats TypeScript with `.oxfmtrc.json`: a print width of 100, 2 spaces,
  semicolons, and single quotes. CI checks the format. It checks `tools/` with its subfolders,
  except the plugin code of `tools/oxlint/`. Format a Python script of `tools/` with
  `uvx ruff format --line-length 100 --config "format.quote-style='single'" <file>`.
- **Blank lines.** Put one empty line between top-level declarations. Use blank lines or
  separate files for structure, with no banner comments and no divider comments.
- **Code blocks.** Inside a function body, put one empty line between the logical steps. For
  example, put it between the input checks, the calculation, and the return of the result. A
  step is a group of statements that does one task.
- **Braces.** All `if`, `else`, `for`, and `while` blocks use curly braces.
- **Conditional members.** Add a conditional property inside an explicit `if` statement. Spread
  only valid objects or arrays, never `cond && value`.
- **Presence checks.** Use `if (foo)` or `if (!foo)` for objects, arrays, and instances. Use
  `!== undefined` or `!== null` only when `0`, `''`, `NaN`, or `false` is a valid value.
- **Readonly.** Use `readonly` for immutable properties, parameters, and arrays (`readonly T[]`).
- **Getters.** A public read accessor with no arguments is a getter. A method that makes a new
  instance or does an action stays a method.
- **Visibility.** Make class members private by default. Write a private member as an ES
  `#private` member, because the minifier renames a `#` name and keeps a TypeScript `private`
  name whole. Keep TypeScript `private` for a member that a test reads with element access,
  such as `engine['synth']`.
