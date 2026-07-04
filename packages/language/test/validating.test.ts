import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { expandToString as s } from "langium/generate";
import { parseHelper } from "langium/test";
import type { Diagnostic } from "vscode-languageserver-types";
import type { Graph } from "qprompt-language";
import { createQpromptServices, isGraph } from "qprompt-language";

let services: ReturnType<typeof createQpromptServices>;
let parse:    (input: string) => Promise<LangiumDocument<Graph>>;
let document: LangiumDocument<Graph> | undefined;

beforeAll(async () => {
    services = createQpromptServices(EmptyFileSystem);
    const doParse = parseHelper<Graph>(services.Qprompt);
    parse = (input: string) => doParse(input, { validation: true });
});

describe('Validating', () => {

    test('check no errors on a fully valid graph', async () => {
        document = await parse(`
graph: Valid

agents:
  testplanner:
    kind: llm

workflows:
  demoFlow:
    steps:
      - name: planTest
        kind: plan
        agent: testplanner
`);

        expect(
            checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
        ).toHaveLength(0);
    });

    test('workflow with no steps is rejected', async () => {
        document = await parse(`
graph: Invalid

workflows:
  emptyFlow:
    max_loops: 1
`);

        expect(
            checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
        ).toEqual(
            expect.stringContaining('Workflow must declare at least one step.')
        );
    });

    test('emit_state branch missing "failed" is rejected', async () => {
        document = await parse(`
graph: Invalid

agents:
  syntaxvalidator:
    kind: eslint
    emit_state:
      on_pass:
        failed: false
      on_fail:
        phase: "lint"
`);

        expect(
            checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
        ).toEqual(
            expect.stringContaining("emit_state.on_fail must explicitly set 'failed'.")
        );
    });

    test('resource with both path and paths is rejected', async () => {
        document = await parse(`
graph: Invalid

resources:
  docs:
    type: knowledge_base
    path: single.md
    paths:
      - a.md
      - b.md
`);

        expect(
            checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
        ).toEqual(
            expect.stringContaining("Specify exactly one of 'path' or 'paths', not both.")
        );
    });
});

function checkDocumentValid(document: LangiumDocument): string | undefined {
    return document.parseResult.parserErrors.length && s`
        Parser errors:
          ${document.parseResult.parserErrors.map(e => e.message).join('\n  ')}
    `
        || document.parseResult.value === undefined && `ParseResult is 'undefined'.`
        || !isGraph(document.parseResult.value) && `Root AST object is a ${document.parseResult.value.$type}, expected a 'Graph'.`
        || undefined;
}

function diagnosticToString(d: Diagnostic) {
    return `[${d.range.start.line}:${d.range.start.character}..${d.range.end.line}:${d.range.end.character}]: ${d.message}`;
}
