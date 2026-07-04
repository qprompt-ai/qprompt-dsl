// ================
// Language: qprompt
// Purpose: Declare graphs of LLM agents (resources, models, agents,
//          workflows of steps with conditional routing, tasks) in a
//          TOON/YAML-style indentation-significant syntax.
// ================

grammar Qprompt

// ----------------
// Entry Point
// ----------------
entry Graph:
    NL* 'graph:' name=ID NL*
    (
          'states:' NL+ INDENT (states+=State)* DEDENT
        | 'resources:' NL+ INDENT (resources+=Resource)* DEDENT
        | 'models:' NL+ INDENT (models+=Model)* DEDENT
        | 'agents:' NL+ INDENT (agents+=Agent)* DEDENT
        | 'workflows:' NL+ INDENT (workflows+=Workflow)* DEDENT
        | 'tasks:' NL+ INDENT (tasks+=Task)* DEDENT
    )*;

// ----------------
// State
// ----------------
// A named, shared state schema, keyed by field name with a literal
// default value. Agents opt in to reading it via `state: <name>`;
// only validator/executor-kind agents may write to it, via `emit_state`.
State:
    name=ID ':' NL+ INDENT (fields+=StateField)* DEDENT;

StateField:
    name=ID optional?='?'? ':' value=(NUMBER | BooleanLiteral | 'null' | STRING | ID) NL*;

BooleanLiteral returns boolean:
    'true' | 'false';

EmitState:
    NL+ INDENT
        'on_pass:' onPass=StateAssignments
        'on_fail:' onFail=StateAssignments
    DEDENT;

StateAssignments:
    NL+ INDENT (assignments+=StateAssignment)* DEDENT;

StateAssignment:
    name=ID ':' value=(NUMBER | BooleanLiteral | STRING) NL*;

// ----------------
// Resources
// ----------------
Resource:
    name=ID ':' NL+ INDENT
        (
              'type:' type=ResourceType NL*
            | 'path:' path=Scalar NL*
            | 'paths:' NL+ INDENT ('-' paths+=Scalar NL*)* DEDENT
            | 'rag:' rag=RagConfig
            | 'host:' host=Scalar NL*
            | 'port:' port=NUMBER NL*
            | 'name:' dbName=Scalar NL*
            | 'user:' user=Scalar NL*
            | 'base_url:' baseUrl=Scalar NL*
            | 'token:' token=Scalar NL*
        )*
    DEDENT;

ResourceType returns string:
    'knowledge_base' | 'database' | 'api_endpoint' | 'rule_set' | 'file_system' | ID;

RagConfig:
    NL+ INDENT
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
    NL+ INDENT
        (
              'provider:' provider=EmbeddingsProvider NL*
            | 'model:' model=Scalar NL*
        )*
    DEDENT;

EmbeddingsProvider returns string:
    'huggingface' | 'openai' | 'mistral' | ID;

VectorStoreConfig:
    NL+ INDENT
        (
              'type:' type=VectorStoreType NL*
            | 'persist_path:' persistPath=Scalar NL*
        )*
    DEDENT;

VectorStoreType returns string:
    'faiss' | 'chroma' | ID;

RetrievalConfig:
    NL+ INDENT
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
Model:
    name=ID ':' NL+ INDENT
        (
              'image:' image=Scalar NL*
            | 'serving_backend:' servingBackend=ServingBackend NL*
            | 'port:' port=NUMBER NL*
            | 'gpu_memory_utilization:' gpuMemoryUtilization=NUMBER NL*
            | 'quantization:' quantization=Scalar NL*
            | 'temperature:' temperature=NUMBER NL*
            | 'max_tokens:' maxTokens=NUMBER NL*
            | 'mode:' mode=LlmMode NL*
        )*
    DEDENT;

ServingBackend returns string:
    'vllm' | 'llama-cpp' | 'tgi' | ID;

LlmMode returns string:
    'base' | 'finetuned' | 'lora' | 'quantized' | ID;

// ----------------
// Agents
// ----------------
// Flattened: every field that used to live under a nested
// LlmConfig/ValidatorConfig/ExecutorConfig now sits directly on the
// agent, matching the no-config-wrapper authoring style.
Agent:
    name=ID ':' NL+ INDENT
        (
              'kind:' kind=AgentKind NL*
            | 'description:' description=Scalar NL*
            | 'model:' model=[Model:ID] NL*
            | 'temperature:' temperature=NUMBER NL*
            | 'mode:' mode=LlmMode NL*
            | 'context:' NL+ INDENT ('-' context+=[Resource:ID] NL*)* DEDENT
            | 'state:' state=[State:ID] NL*
            | 'prompt:' prompt=STRING NL*
            | 'image:' image=Scalar NL*
            | 'command:' command=Scalar NL*
            | 'workdir:' workdir=Scalar NL*
            | 'mounts:' NL+ INDENT (mounts+=Mount)* DEDENT
            | 'env:' NL+ INDENT (env+=EnvVar)* DEDENT
            | 'connection:' connection=[Resource:ID] NL*
            | 'query:' query=Scalar NL*
            | 'tool_name:' toolName=Scalar NL*
            | 'tool_config:' toolConfig=Scalar NL*
            | 'method:' method=HttpMethod NL*
            | 'url:' url=Scalar NL*
            | 'ruleset:' ruleset=Scalar NL*
            | 'rule_file:' ruleFile=Scalar NL*
            | 'criteria_file:' criteriaFile=Scalar NL*
            | 'min:' min=NUMBER NL*
            | 'rules:' NL+ INDENT (rules+=Rule)* DEDENT
            | 'emit_state:' emitState=EmitState
        )*
    DEDENT;

AgentKind returns string:
    'llm' | 'executor' | 'validator' | 'container' | 'http' | 'process' | 'fs' | 'db'
    | 'eslint' | 'istanbul' | 'rules_engine' | 'custom_script' | ID;

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
            | 'pattern:' pattern=STRING NL*
            | 'start_with:' startWith=STRING NL*
            | 'must_contain:' NL+ INDENT ('-' mustContain+=Scalar NL*)* DEDENT
            | 'values:' NL+ INDENT ('-' values+=Scalar NL*)* DEDENT
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
    name=ID ':' NL+ INDENT
        (
              'channels:' NL+ INDENT (channels+=Channel)* DEDENT
            | 'steps:' NL+ INDENT (steps+=Step)* DEDENT
            | 'loop_on_fail:' NL+ INDENT ('-' loopOnFail+=[Step:ID] NL*)* DEDENT
            | 'max_loops:' maxLoops=NUMBER NL*
        )*
    DEDENT;

Channel:
    name=ID ':'
    (
          type=ChannelType NL*
        | NL+ INDENT
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
            | 'subscribe:' NL+ INDENT ('-' subscribe+=[Channel:ID] NL*)* DEDENT
            | 'publish:' NL+ INDENT ('-' publish+=[Channel:ID] NL*)* DEDENT
            | 'on_fail:' onFail=[Step:ID] NL*
            | 'on_complete:' onComplete=[Step:ID] NL*
            | 'retry:' retry=NUMBER NL*
            | 'timeout:' timeout=NUMBER NL*
            | 'routes:' NL+ INDENT (routes+=Route)* DEDENT
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
    name=ID ':' NL+ INDENT
        (
              'workflow:' workflow=[Workflow:ID] NL*
            | 'inputs:' NL+ INDENT (inputs+=InputOutputPair)* DEDENT
            | 'outputs:' NL+ INDENT (outputs+=OutputMount)* DEDENT
        )*
    DEDENT;

InputOutputPair:
    key=ID ':' value=Scalar NL*;

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
// list-item marker keyword), and must not end on a bare separator.
terminal BARE_TOKEN: /[a-zA-Z0-9_]*[.\-\/:][a-zA-Z0-9_.\-\/:]*[a-zA-Z0-9_]/;
terminal ID: /[_a-zA-Z][\w_]*/;
terminal NL: /[\r\n]+/;

hidden terminal WS: /[ \t]+/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
