import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { expandToString as s } from "langium/generate";
import { parseHelper } from "langium/test";
import type { Graph } from "qprompt-language";
import { createQpromptServices, isGraph } from "qprompt-language";

let services: ReturnType<typeof createQpromptServices>;
let parse:    ReturnType<typeof parseHelper<Graph>>;
let document: LangiumDocument<Graph> | undefined;

// DSL content is intentionally left-aligned at column 0: indentation is
// semantically significant in qprompt, so the fixture's own indentation
// must not be entangled with this file's TypeScript indentation.
const EXAMPLE = `
graph: CypressTestGeneration

states:
  global_state:
    failed: false
    phase?: null

resources:

  cypressDocs:
    type: knowledge_base
    paths:
      - https://docs.cypress.io
    rag:
      loader: web
      splitter: recursive
      chunk_size: 400
      chunk_overlap: 50

      embeddings:
        provider: huggingface
        model: sentence-transformers/all-MiniLM-L6-v2

      vector_store:
        type: faiss
        persist_path: .rag/cypress/docs

      retrieval:
        strategy: similarity
        top_k: 4

models:
  qwen3:
    image: ai/qwen3:14B-Q6_K
    serving_backend: vllm // comment on the same line
    port: 8080

agents:

  testplanner:
    kind: llm
    model: qwen3
    context:
      - cypressDocs
    state: global_state
    prompt: """
      You are a meticulous test planning expert.
    """

  planValidator:
    kind: rules_engine
    rules:
      - id: no_code
        pattern: "no-code-pattern"
      - id: structure
        check: structure
        must_contain:
          - Steps
        message: "Planner output missing required structure."
    state: global_state

workflows:
  cypressFlow:
    channels:
      given_query: txt
      test_plan:
        type: txt
        description: "Structured test plan"

    steps:
      - name: planTest
        kind: plan
        agent: testplanner
        subscribe:
          - given_query
        publish:
          - test_plan
      - name: lint
        kind: validate
        agent: planValidator
        subscribe:
          - test_plan
        on_fail: planTest

tasks:
  loginTest:
    workflow: cypressFlow
    inputs:
      given_query: "Write a Cypress test for the login page"
    outputs:
      test_plan: out/plan.txt
`;

beforeAll(async () => {
    services = createQpromptServices(EmptyFileSystem);
    parse = parseHelper<Graph>(services.Qprompt);
});

describe('Parsing tests', () => {

    test('parse a full example graph', async () => {
        document = await parse(EXAMPLE);

        expect(checkDocumentValid(document)).toBeUndefined();

        const graph = document.parseResult.value;
        expect(graph.name).toBe('CypressTestGeneration');
        expect(graph.states).toHaveLength(1);
        expect(graph.resources).toHaveLength(1);
        expect(graph.models).toHaveLength(1);
        expect(graph.agents).toHaveLength(2);
        expect(graph.workflows).toHaveLength(1);
        expect(graph.tasks).toHaveLength(1);

        expect(graph.agents.map(a => a.name)).toEqual(['testplanner', 'planValidator']);
        expect(graph.workflows[0].steps.map(s => s.name)).toEqual(['planTest', 'lint']);
    });

    test('threads nested config values through correctly', async () => {
        document = await parse(EXAMPLE);
        expect(checkDocumentValid(document)).toBeUndefined();

        const resource = document.parseResult.value.resources[0];
        expect(resource.paths).toEqual(['https://docs.cypress.io']);
        expect(resource.rag?.chunkSize).toBe(400);
        expect(resource.rag?.embeddings?.provider).toBe('huggingface');
        expect(resource.rag?.vectorStore?.type).toBe('faiss');
    });

    test('parses both channel forms and the rules_engine rule list', async () => {
        document = await parse(EXAMPLE);
        expect(checkDocumentValid(document)).toBeUndefined();

        const [given_query, test_plan] = document.parseResult.value.workflows[0].channels;
        expect(given_query.type).toBe('txt');
        expect(test_plan.type).toBe('txt');
        expect(test_plan.description).toBe('Structured test plan');

        const rules = document.parseResult.value.agents[1].rules;
        expect(rules.map(r => r.id)).toEqual(['no_code', 'structure']);
        expect(rules[1].mustContain).toEqual(['Steps']);
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
