import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { expandToString as s } from "langium/generate";
import { clearDocuments, parseHelper } from "langium/test";
import type { Graph } from "qprompt-language";
import { createQpromptServices, isGraph } from "qprompt-language";

let services: ReturnType<typeof createQpromptServices>;
let parse:    ReturnType<typeof parseHelper<Graph>>;
let document: LangiumDocument<Graph> | undefined;

const VALID = `
graph: LinkingDemo

states:
  global_state:
    failed: false

agents:
  testplanner:
    kind: llm
    state: global_state

workflows:
  demoFlow:
    channels:
      test_plan: txt
    steps:
      - name: planTest
        kind: plan
        agent: testplanner
        publish:
          - test_plan
      - name: lint
        kind: validate
        agent: testplanner
        subscribe:
          - test_plan
        on_fail: planTest
`;

const BROKEN = `
graph: LinkingDemo

workflows:
  demoFlow:
    steps:
      - name: onlyStep
        kind: plan
        agent: nonexistentAgent
        on_fail: nonexistentStep
`;

beforeAll(async () => {
    services = createQpromptServices(EmptyFileSystem);
    parse = parseHelper<Graph>(services.Qprompt);
});

afterEach(async () => {
    document && clearDocuments(services.shared, [ document ]);
});

describe('Linking tests', () => {

    test('resolves step.agent, step.onFail, agent.state and channel refs', async () => {
        document = await parse(VALID);
        expect(checkDocumentValid(document)).toBeUndefined();

        const graph = document.parseResult.value;
        const [planTest, lint] = graph.workflows[0].steps;

        expect(planTest.agent?.ref?.name).toBe('testplanner');
        expect(lint.onFail?.ref?.name).toBe('planTest');
        expect(graph.agents[0].state?.ref?.name).toBe('global_state');
        expect(planTest.publish[0]?.ref?.name).toBe('test_plan');
        expect(lint.subscribe[0]?.ref?.name).toBe('test_plan');
    });

    test('reports link errors for unresolved references', async () => {
        document = await parse(BROKEN);
        expect(checkDocumentValid(document)).toBeUndefined();

        const step = document.parseResult.value.workflows[0].steps[0];

        expect(step.agent?.ref).toBeUndefined();
        expect(step.agent?.error?.message).toBeTruthy();

        expect(step.onFail?.ref).toBeUndefined();
        expect(step.onFail?.error?.message).toBeTruthy();
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
