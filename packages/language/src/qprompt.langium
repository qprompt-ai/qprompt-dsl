// ================
// Language: qprompt
// Purpose: Declare graphs of LLM agents (resources, models, agents,
//          workflows of steps with conditional routing, tasks) in a
//          TOON style indentation-significant syntax.
// ================

grammar Qprompt

// ----------------
// Entry Point
// ----------------
entry Graph:
    NL* 'graph:' name=ID NL*
    (
          'states:' NL+ INDENT NL* (states+=State NL*)* DEDENT
        | 'resources:' NL+ INDENT NL* (resources+=Resource NL*)* DEDENT
        | 'models:' NL+ INDENT NL* (models+=Model NL*)* DEDENT
        | 'agents:' NL+ INDENT NL* (agents+=Agent NL*)* DEDENT
        | 'workflows:' NL+ INDENT NL* (workflows+=Workflow NL*)* DEDENT
        | 'tasks:' NL+ INDENT NL* (tasks+=Task NL*)* DEDENT
    )*;

// ----------------
// State
// ----------------
// A named, shared state schema, keyed by field name with a literal
// default value. Agents opt in to reading it via `state: <name>`;
State:
    name=ID ':' NL+ INDENT NL* (fields+=StateField)* DEDENT;

StateField:
    name=ID optional?='?'? ':' value=(NUMBER | BooleanLiteral | 'null' | STRING | ID) NL*;

BooleanLiteral returns boolean:
    'true' | 'false';

EmitState:
    NL+ INDENT NL*
        'on_pass:' onPass=StateAssignments
        'on_fail:' onFail=StateAssignments
    DEDENT;

StateAssignments:
    NL+ INDENT NL* (assignments+=StateAssignment)* DEDENT;

StateAssignment:
    name=ID ':' value=(NUMBER | BooleanLiteral | STRING) NL*;

// ----------------
// Resources
// ----------------
Resource:
    name=ID ':' NL+ INDENT NL*
        (
              'type:' type=ResourceType NL*
            | 'path:' path=Scalar NL*
            | 'paths:' NL+ INDENT NL* ('-' paths+=Scalar NL*)* DEDENT
            | 'rag:' rag=RagConfig
            | 'host:' host=Scalar NL*
            | 'port:' port=NUMBER NL*
            | 'name:' dbName=Scalar NL*
            | 'user:' user=Scalar NL*
            | 'base_url:' baseUrl=Scalar NL*
            | 'token:' token=Scalar NL*
            // The *name* of an environment variable or secrets-vault key
            // the runtime resolves at execution time — never a literal
            // password/token value. Keeps secrets out of source-controlled
            // .qprompt files while still declaring that this resource
            // needs one.
            | 'credential:' credential=Scalar NL*
        )*
    DEDENT;

ResourceType returns string:
    'knowledge_base' | 'database' | 'api_endpoint' | 'rule_set' | 'file_system' | ID;

RagConfig:
    NL+ INDENT NL*
        (
              'loader:' loader=RagLoader NL*
            | 'splitter:' splitter=RagSplitter NL*
            | 'chunk_size:' chunkSize=NUMBER NL*
            | 'chunk_overlap:' chunkOverlap=NUMBER NL*
            | 'embeddings:' embeddings=EmbeddingsConfig
            | 'vector_store:' vectorStore=VectorStoreConfig
            | 'retrieval:' retrieval=RetrievalConfig
        )*
    DEDENT;

RagLoader returns string:
    'web' | 'fs' | 'api' | ID;

RagSplitter returns string:
    'recursive' | 'token' | 'markdown' | ID;

EmbeddingsConfig:
    NL+ INDENT NL*
        (
              'provider:' provider=EmbeddingsProvider NL*
            | 'model:' model=Scalar NL*
        )*
    DEDENT;

EmbeddingsProvider returns string:
    'huggingface' | 'openai' | 'mistral' | ID;

VectorStoreConfig:
    NL+ INDENT NL*
        (
              'type:' type=VectorStoreType NL*
            | 'persist_path:' persistPath=Scalar NL*
        )*
    DEDENT;

VectorStoreType returns string:
    'faiss' | 'chroma' | ID;

RetrievalConfig:
    NL+ INDENT NL*
        (
              'strategy:' strategy=RetrievalStrategy NL*
            | 'top_k:' topK=NUMBER NL*
        )*
    DEDENT;

RetrievalStrategy returns string:
    'similarity' | 'mmr' | 'hybrid' | 'keyword' | ID;

// ----------------
// Models
// ----------------
// `provider: docker` (the default when omitted) mirrors Docker
// Compose's top-level `models:` provisioning block (docs.docker.com/
// ai/compose/models-and-compose) field-for-field, so a Model entry maps
// directly onto a compose model entry with no invented fields to
// translate: `model:` is the OCI artifact reference (e.g.
// ai/qwen3:14B-Q6_K — the tag itself, not a separate field, is how two
// variants of a base model, like a finetuned vs. a lora checkpoint, are
// distinguished), `context_size:`/`runtime_flags:` are passed straight
// through to the inference engine Docker Model Runner starts for it.
// Docker Model Runner owns the endpoint/port entirely — there's no
// port/serving_backend/GPU field to declare here, since compose injects
// an endpoint URL into whichever *service* references this model, not
// into the model declaration itself.
//
// `provider: local` is reserved for a non-containerized runtime (e.g.
// an already-running Ollama on the host) — not implemented yet
// (checkDockerModelHasRef only validates the docker case), but the
// field exists now so declaring one doesn't require a grammar change
// later, only filling in its actual fields when that work happens.
Model:
    name=ID ':' NL+ INDENT NL*
        (
              'provider:' provider=ModelProvider NL*
            | 'model:' model=Scalar NL*
            | 'context_size:' contextSize=NUMBER NL*
            | 'runtime_flags:' NL+ INDENT NL* ('-' runtimeFlags+=STRING NL*)* DEDENT
        )*
    DEDENT;

ModelProvider returns string:
    'docker' | 'local' | ID;

// ----------------
// Agents
// ----------------
Agent:
    name=ID ':' NL+ INDENT NL*
        (
              'kind:' kind=AgentKind NL*
            // 'type:' is accepted as a synonym for 'kind:' — this project's
            // own drafts have gone back and forth between the two names,
            // so both are supported rather than picking one and having
            // the other silently fail to parse.
            | 'type:' kind=AgentKind NL*
            | 'description:' description=Scalar NL*
            // Declares the agent's data-flow contract, independent of any
            // one workflow step: does it consume/produce a channel value,
            // or does it only ever emit_state (e.g. a validator that just
            // reports pass/fail)? Enforced by checkAgentPublishMatchesOutput
            // / checkAgentSubscribeMatchesInput in the validator.
            | 'input:' input=BooleanLiteral NL*
            | 'output:' output=BooleanLiteral NL*
            | 'model:' model=[Model:ID] NL*
            | 'temperature:' temperature=NUMBER NL*
            | 'context:' NL+ INDENT NL* ('-' context+=[Resource:ID] NL*)* DEDENT
            // An agent can associate with one state (shorthand) or several
            // (list form) — e.g. a validator reading shared pipeline
            // control fields from `agent_state` while also writing its own
            // rule/reason fields to a dedicated `validation_state`.
            | 'state:' (
                  state+=[State:ID] NL*
                | NL+ INDENT NL* ('-' state+=[State:ID] NL*)* DEDENT
              )
            | 'prompt:' prompt=STRING NL*
            | 'image:' image=Scalar NL*
            | 'command:' command=Scalar NL*
            | 'workdir:' workdir=Scalar NL*
            | 'mounts:' NL+ INDENT NL* (mounts+=Mount NL*)* DEDENT
            | 'env:' NL+ INDENT NL* (env+=EnvVar NL*)* DEDENT
            | 'connection:' connection=[Resource:ID] NL*
            | 'query:' query=Scalar NL*
            | 'tool_name:' toolName=Scalar NL*
            | 'tool_config:' toolConfig=Scalar NL*
            | 'method:' method=HttpMethod NL*
            | 'url:' url=Scalar NL*
            | 'ruleset:' ruleset=Scalar NL*
            | 'rule_file:' ruleFile=Scalar NL*
            | 'policy_ref:' policyRef=[Resource:ID] NL*
            | 'criteria_file:' criteriaFile=Scalar NL*
            | 'min:' min=NUMBER NL*
            | 'rules:' NL+ INDENT NL* (rules+=Rule NL*)* DEDENT
            | 'emit_state:' emitState=EmitState
            // Batched-relevance-scoring tool/model filtering, for
            // `kind: selector` agents — scores `candidate_models` in
            // groups of `batch_size` against the current instruction and
            // keeps only those at or above `score_threshold` (0-5 scale),
            // instead of dumping every candidate's full description into
            // one prompt. Declarative only: which model this selects for
            // a given run is a runtime/codegen concern, not modeled here.
            | 'candidate_models:' NL+ INDENT NL* ('-' candidateModels+=[Model:ID] NL*)* DEDENT
            | 'batch_size:' batchSize=NUMBER NL*
            | 'score_threshold:' scoreThreshold=NUMBER NL*
        )*
    DEDENT;

// Describes HOW an agent's work executes, not what specific tool,
// technique, or purpose it serves. Each value here is a distinct
// execution mechanism: llm (calls a model), container (runs inside
// Docker), process (runs as a bare host command), db (executes a query
// over a connection), http (makes a request), rules_engine (evaluates
// declarative rules with no external call at all), selector (batched
// relevance-scoring candidate filtering).
AgentKind returns string:
    'llm' | 'container' | 'process' | 'db' | 'http' | 'rules_engine' | 'selector' | ID;

HttpMethod returns string:
    'get' | 'post' | 'put' | 'delete' | ID;

Mount:
    '-' 'local:' local=Scalar NL*
    (INDENT ('container:' container=Scalar NL*)* DEDENT)?;

EnvVar:
    '-' name=ID '=' value=Scalar NL*;

// A single validation rule for a `rules_engine`-kind agent. Fields are
// intentionally open (`type`/`check` are free-form) since real-world
// usage hasn't settled on a fixed rule vocabulary yet.
Rule:
    '-' 'id:' id=ID NL*
    (INDENT
        (
              'type:' type=Scalar NL*
            | 'check:' check=Scalar NL*
            // Which piece of data this rule inspects — the whole input
            // (e.g. a text plan, where `pattern`/`start_with`/
            // `must_contain` apply to the entire thing) when omitted, or
            // a specific field (e.g. a JSON field like `status`) when
            // set, checked against `values` (e.g. "one of these").
            | 'field:' field=Scalar NL*
            | 'pattern:' pattern=STRING NL*
            | 'start_with:' startWith=STRING NL*
            | 'must_contain:' NL+ INDENT NL* ('-' mustContain+=Scalar NL*)* DEDENT
            | 'values:' NL+ INDENT NL* ('-' values+=Scalar NL*)* DEDENT
            // Named `message`, not `error`, since `error:` needs to stay
            // available as an ordinary (non-keyword) state field name —
            // Langium's keyword extraction is grammar-global, so a fixed
            // 'error:' keyword here would shadow it everywhere, including
            // inside StateField's generic `name=ID ':' value` pattern.
            | 'message:' message=STRING NL*
        )*
    DEDENT)?;

// ----------------
// Workflows
// ----------------
Workflow:
    name=ID ':' NL+ INDENT NL*
        (
              'channels:' NL+ INDENT NL* (channels+=Channel NL*)* DEDENT
            | 'steps:' NL+ INDENT NL* (steps+=Step NL*)* DEDENT
            | 'loop_on_fail:' NL+ INDENT NL* ('-' loopOnFail+=[Step:ID] NL*)* DEDENT
            | 'max_loops:' maxLoops=NUMBER NL*
        )*
    DEDENT;

Channel:
    name=ID ':'
    (
          type=ChannelType NL*
        | NL+ INDENT NL*
            (
                  'type:' type=ChannelType NL*
                | 'description:' description=STRING NL*
            )*
          DEDENT
    );

ChannelType returns string:
    'txt' | 'json' | 'ts' | 'js' | 'image' | 'embedding' | 'metrics' | 'html' | 'xml' | ID;

Step:
    '-' 'name:' name=ID NL*
    (INDENT
        (
              'kind:' kind=StepKind NL*
            | 'agent:' agent=[Agent:ID] NL*
            | 'subscribe:' NL+ INDENT NL* ('-' subscribe+=[Channel:ID] NL*)* DEDENT
            | 'publish:' NL+ INDENT NL* ('-' publish+=[Channel:ID] NL*)* DEDENT
            | 'on_fail:' onFail=[Step:ID] NL*
            | 'on_complete:' onComplete=[Step:ID] NL*
            | 'retry:' retry=NUMBER NL*
            | 'timeout:' timeout=NUMBER NL*
            | 'routes:' NL+ INDENT NL* (routes+=Route NL*)* DEDENT
        )*
    DEDENT)?;

StepKind returns string:
    'select' | 'plan' | 'generate' | 'correct' | 'validate' | 'execute' | 'debug' | ID;

Route:
    '-' 'if:' condition=STRING 'then:' target=[Step:ID] NL*;

// ----------------
// Tasks
// ----------------
Task:
    name=ID ':' NL+ INDENT NL*
        (
              'workflow:' workflow=[Workflow:ID] NL*
            | 'inputs:' NL+ INDENT NL* (inputs+=InputOutputPair)* DEDENT
            | 'outputs:' NL+ INDENT NL* (outputs+=OutputMount)* DEDENT
            // Absent entirely means "invoked manually/directly" (today's
            // only mode). `inputs:` still supplies static defaults either
            // way — for a webhook trigger the runtime is expected to merge
            // the incoming payload over these defaults, not replace them.
            | 'trigger:' trigger=Trigger
        )*
    DEDENT;

InputOutputPair:
    key=ID ':' value=Scalar NL*;

Trigger:
    NL+ INDENT NL*
        (
              'type:' type=TriggerType NL*
            | 'cron:' cron=STRING NL*
            | 'timezone:' timezone=Scalar NL*
            | 'method:' method=HttpMethod NL*
            | 'path:' path=Scalar NL*
        )*
    DEDENT;

TriggerType returns string:
    'schedule' | 'webhook' | 'manual' | ID;

OutputMount:
    key=ID ':' value=('memory' | Scalar) NL*;

// ----------------
// Values
// ----------------
Scalar returns string:
    BARE_TOKEN | STRING | ID;

// ----------------
// Terminals
// ----------------
// Chevrotain's default lexer picks the first token type (in this
// declaration order) whose pattern matches at the current position —
// NOT the longest overall match — so order here is priority, not
// cosmetic. INDENT/DEDENT's fixed placeholder patterns must come
// before BARE_TOKEN (otherwise BARE_TOKEN would grab a same-position
// prefix of them first); BARE_TOKEN must come before ID (otherwise ID
// would grab just the leading alnum run of e.g. a URL and leave the
// rest, like "https" + "://docs.cypress.io", as two tokens); STRING
// and NUMBER don't overlap with BARE_TOKEN's character class except
// for decimal literals like "0.9", so NUMBER is placed first to win
// that tie. Keyword tokens auto-extracted from quoted literals in the
// grammar (e.g. 'graph:', 'true') are handled separately by Langium's
// automatic longer-alt mechanism and always take priority regardless
// of this order.
terminal INDENT: ':synthetic-indent:';
terminal DEDENT: ':synthetic-dedent:';
terminal STRING: /"""[\s\S]*?"""|"[^"]*"|'[^']*'/;
terminal NUMBER returns number: /[0-9]+(\.[0-9]+)?/;
// Unquoted path/URL/image-ref-style values: must contain at least one
// of . - / : and never start with '-' (so it can't collide with the
// list-item marker keyword) or with '//' (so it can't shadow the line
// comment terminal). Ends on an alnum/underscore OR a trailing '/'
// (directory paths like /docs/legal_agreements/).
terminal BARE_TOKEN: /(?!\/\/)[a-zA-Z0-9_]*[.\-\/:][a-zA-Z0-9_.\-\/:]*[a-zA-Z0-9_\/]/;
terminal ID: /[_a-zA-Z][\w_]*/;
terminal NL: /[\r\n]+/;

hidden terminal WS: /[ \t]+/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
