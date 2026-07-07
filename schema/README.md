# qprompt IR

`qprompt-ir.schema.json` is the versioned contract between this repo (producer:
`qprompt-cli generate <file>.qprompt --format ir`) and any downstream codegen
repo that turns a graph into runnable code — e.g. `qprompt-langgraph`.

It is deliberately **not** the Langium AST. The AST is an implementation
detail of the grammar (`packages/language/src/qprompt.langium`) and changes
shape with grammar refactors that have nothing to do with codegen. The IR:

- drops all Langium-internal fields (`$container`, `$cstNode`, `$document`, `$type`)
- resolves every cross-reference (`[Model:ID]`, `[Step:ID]`, ...) to the plain
  name string it points at, instead of a linked node
- normalizes a couple of grammar quirks a consumer shouldn't have to know
  about (e.g. `StateField`'s bare `null` literal vs. a quoted `"null"` string)
- flattens `Task.inputs`/`outputs` from key/value pair arrays into plain
  string-keyed objects

## Versioning

`irVersion` (semver, top-level field) versions this shape independently of
`qprompt-dsl`'s own package version. Bump the **major** version on any
breaking change (renamed/removed field, changed type, changed cardinality).
Additive, optional fields are a minor bump. Consumers should check
`irVersion`'s major component before assuming a shape.

## Regenerating

```sh
cd packages/cli
node bin/cli.js generate <file>.qprompt --format ir -d <destination>
```
