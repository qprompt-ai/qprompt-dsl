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
    kind: container
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

    test('a step publishing for an output: false agent is rejected', async () => {
        document = await parse(`
graph: Invalid

agents:
  planValidator:
    kind: rules_engine
    output: false

workflows:
  demoFlow:
    channels:
      artifact: json
    steps:
      - name: validatePlan
        kind: validate
        agent: planValidator
        publish:
          - artifact
`);

        expect(
            checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
        ).toEqual(
            expect.stringContaining("declares output: false, so step 'validatePlan' must not publish to a channel")
        );
    });

    test('emit_state assigning an undeclared state field is rejected', async () => {
        document = await parse(`
graph: Invalid

states:
  global_state:
    failed: false

agents:
  planValidator:
    kind: rules_engine
    state: global_state
    emit_state:
      on_pass:
        failed: false
      on_fail:
        failed: true
        rule: "$rule.id"
`);

        expect(
            checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
        ).toEqual(
            expect.stringContaining("No associated state ('global_state') has a field named 'rule'")
        );
    });

    test('emit_state fields split across two associated states is accepted', async () => {
        document = await parse(`
graph: Valid

states:
  agent_state:
    failed: false
  validation_state:
    rule?: null

agents:
  planValidator:
    kind: rules_engine
    state:
      - agent_state
      - validation_state
    emit_state:
      on_pass:
        failed: false
      on_fail:
        failed: true
        rule: "$rule.id"
`);

        expect(
            checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
        ).toHaveLength(0);
    });

    test('selector agent with no candidate_models is rejected', async () => {
        document = await parse(`
graph: Invalid

agents:
  modelselector:
    kind: selector
    batch_size: 6
`);

        expect(
            checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
        ).toEqual(
            expect.stringContaining("Selector agent 'modelselector' must declare at least one candidate in 'candidate_models'.")
        );
    });

    test('schedule trigger with no cron is rejected', async () => {
        document = await parse(`
graph: Invalid

workflows:
  demoFlow:
    steps:
      - name: onlyStep
        kind: plan

tasks:
  demoTask:
    workflow: demoFlow
    trigger:
      type: schedule
`);

        expect(
            checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
        ).toEqual(
            expect.stringContaining("A 'schedule' trigger must set 'cron'.")
        );
    });

    test('webhook trigger with no method/path is rejected', async () => {
        document = await parse(`
graph: Invalid

workflows:
  demoFlow:
    steps:
      - name: onlyStep
        kind: plan

tasks:
  demoTask:
    workflow: demoFlow
    trigger:
      type: webhook
`);

        expect(
            checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
        ).toEqual(
            expect.stringContaining("A 'webhook' trigger must set both 'method' and 'path'.")
        );
    });

    test('a fully specified schedule trigger is accepted', async () => {
        document = await parse(`
graph: Valid

workflows:
  demoFlow:
    steps:
      - name: onlyStep
        kind: plan

tasks:
  demoTask:
    workflow: demoFlow
    trigger:
      type: schedule
      cron: "0 9 * * *"
`);

        expect(
            checkDocumentValid(document) || document?.diagnostics?.map(diagnosticToString)?.join('\n')
        ).toHaveLength(0);
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
