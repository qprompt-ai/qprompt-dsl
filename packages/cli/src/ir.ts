import type {
    Agent, Channel, EmitState, Graph, Mount, Model, RagConfig, Resource, Route, Rule,
    State, StateField, Step, Task, Trigger, Workflow
} from 'qprompt-language';
import type { AstNode, Reference } from 'langium';
import { GrammarUtils } from 'langium';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractDestinationAndName } from './util.js';

/**
 * Shape version of the IR emitted below — independent of this package's own
 * npm version. See ../../../schema/README.md for the bump policy.
 */
const IR_VERSION = '1.0.0';

type Scalar = string | number | boolean | undefined;

function refName<T extends AstNode & { name: string }>(ref: Reference<T> | undefined): string | undefined {
    return ref?.ref?.name ?? ref?.$refText;
}

function refNames<T extends AstNode & { name: string }>(refs: Reference<T>[]): string[] {
    return refs.map(r => r.ref?.name ?? r.$refText);
}

/**
 * StateField.value's grammar alternatives are `NUMBER | BooleanLiteral |
 * 'null' | STRING | ID` — the bare `null` keyword and a quoted `"null"`
 * string both parse to the JS string "null", so the only way to tell them
 * apart is the raw source text behind the `value` assignment (a keyword
 * match has no surrounding quotes, a STRING match does).
 */
function stateFieldValue(field: StateField): string | number | boolean | null {
    if (field.value === 'null') {
        const raw = GrammarUtils.findNodeForProperty(field.$cstNode, 'value')?.text;
        if (raw === 'null') {
            return null;
        }
    }
    return field.value;
}

function buildRagConfig(rag: RagConfig | undefined) {
    if (!rag) return undefined;
    return {
        loader: rag.loader,
        splitter: rag.splitter,
        chunkSize: rag.chunkSize,
        chunkOverlap: rag.chunkOverlap,
        embeddings: rag.embeddings && {
            provider: rag.embeddings.provider,
            model: rag.embeddings.model
        },
        vectorStore: rag.vectorStore && {
            type: rag.vectorStore.type,
            persistPath: rag.vectorStore.persistPath
        },
        retrieval: rag.retrieval && {
            strategy: rag.retrieval.strategy,
            topK: rag.retrieval.topK
        }
    };
}

function buildResource(resource: Resource) {
    return {
        name: resource.name,
        type: resource.type,
        path: resource.path,
        paths: resource.paths.length ? resource.paths : undefined,
        rag: buildRagConfig(resource.rag),
        host: resource.host,
        port: resource.port,
        dbName: resource.dbName,
        user: resource.user,
        baseUrl: resource.baseUrl,
        token: resource.token,
        credential: resource.credential
    };
}

function buildModel(model: Model) {
    return {
        name: model.name,
        provider: model.provider,
        model: model.model,
        contextSize: model.contextSize,
        runtimeFlags: model.runtimeFlags
    };
}

function buildMount(mount: Mount) {
    return { local: mount.local, container: mount.container };
}

function buildRule(rule: Rule) {
    return {
        id: rule.id,
        type: rule.type,
        check: rule.check,
        field: rule.field,
        pattern: rule.pattern,
        startWith: rule.startWith,
        mustContain: rule.mustContain,
        values: rule.values,
        message: rule.message
    };
}

function buildEmitState(emitState: EmitState | undefined) {
    if (!emitState) return undefined;
    const toMap = (assignments: EmitState['onPass']) =>
        Object.fromEntries(assignments.assignments.map(a => [a.name, a.value]));
    return { onPass: toMap(emitState.onPass), onFail: toMap(emitState.onFail) };
}

function buildAgent(agent: Agent) {
    return {
        name: agent.name,
        kind: agent.kind,
        description: agent.description,
        input: agent.input,
        output: agent.output,
        model: refName(agent.model),
        temperature: agent.temperature,
        context: refNames(agent.context),
        state: refNames(agent.state),
        prompt: agent.prompt,
        image: agent.image,
        command: agent.command,
        workdir: agent.workdir,
        mounts: agent.mounts.map(buildMount),
        env: agent.env.map(e => ({ name: e.name, value: e.value })),
        connection: refName(agent.connection),
        query: agent.query,
        toolName: agent.toolName,
        toolConfig: agent.toolConfig,
        method: agent.method,
        url: agent.url,
        ruleset: agent.ruleset,
        ruleFile: agent.ruleFile,
        policyRef: refName(agent.policyRef),
        criteriaFile: agent.criteriaFile,
        min: agent.min,
        rules: agent.rules.map(buildRule),
        emitState: buildEmitState(agent.emitState),
        candidateModels: refNames(agent.candidateModels),
        batchSize: agent.batchSize,
        scoreThreshold: agent.scoreThreshold
    };
}

function buildChannel(channel: Channel) {
    return { name: channel.name, type: channel.type, description: channel.description };
}

function buildRoute(route: Route) {
    return { condition: route.condition, target: refName(route.target)! };
}

function buildStep(step: Step) {
    return {
        name: step.name,
        kind: step.kind,
        agent: refName(step.agent),
        subscribe: refNames(step.subscribe),
        publish: refNames(step.publish),
        onFail: refName(step.onFail),
        onComplete: refName(step.onComplete),
        retry: step.retry,
        timeout: step.timeout,
        routes: step.routes.map(buildRoute)
    };
}

function buildWorkflow(workflow: Workflow) {
    return {
        name: workflow.name,
        channels: workflow.channels.map(buildChannel),
        steps: workflow.steps.map(buildStep),
        loopOnFail: refNames(workflow.loopOnFail),
        maxLoops: workflow.maxLoops
    };
}

function buildTrigger(trigger: Trigger | undefined) {
    if (!trigger) return undefined;
    return {
        type: trigger.type,
        cron: trigger.cron,
        timezone: trigger.timezone,
        method: trigger.method,
        path: trigger.path
    };
}

function buildTask(task: Task) {
    return {
        name: task.name,
        workflow: refName(task.workflow),
        inputs: Object.fromEntries(task.inputs.map(i => [i.key, i.value as Scalar])),
        outputs: Object.fromEntries(task.outputs.map(o => [o.key, o.value as Scalar])),
        trigger: buildTrigger(task.trigger)
    };
}

function buildState(state: State) {
    return {
        name: state.name,
        fields: state.fields.map((f): { name: string; optional: boolean; value: string | number | boolean | null } => ({
            name: f.name,
            optional: f.optional,
            value: stateFieldValue(f)
        }))
    };
}

export interface QpromptIR {
    irVersion: string;
    graph: string;
    states: ReturnType<typeof buildState>[];
    resources: ReturnType<typeof buildResource>[];
    models: ReturnType<typeof buildModel>[];
    agents: ReturnType<typeof buildAgent>[];
    workflows: ReturnType<typeof buildWorkflow>[];
    tasks: ReturnType<typeof buildTask>[];
}

export function buildIR(model: Graph): QpromptIR {
    return {
        irVersion: IR_VERSION,
        graph: model.name,
        states: model.states.map(buildState),
        resources: model.resources.map(buildResource),
        models: model.models.map(buildModel),
        agents: model.agents.map(buildAgent),
        workflows: model.workflows.map(buildWorkflow),
        tasks: model.tasks.map(buildTask)
    };
}

export function generateIR(model: Graph, filePath: string, destination: string | undefined): string {
    const data = extractDestinationAndName(filePath, destination);
    const generatedFilePath = `${path.join(data.destination, data.name)}.ir.json`;

    // JSON.stringify omits object properties whose value is undefined, so
    // every optional grammar field we left unset above simply disappears
    // instead of round-tripping as an explicit null.
    const ir = buildIR(model);

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, JSON.stringify(ir, null, 2));
    return generatedFilePath;
}
