import type { Graph } from 'qprompt-language';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractDestinationAndName } from './util.js';

/**
 * Placeholder codegen target: dumps the parsed graph as JSON.
 * Real code generation (e.g. emitting a LangGraph/Python agent graph)
 * is a separate design effort left for a later pass.
 */
export function generateJsonDump(model: Graph, filePath: string, destination: string | undefined): string {
    const data = extractDestinationAndName(filePath, destination);
    const generatedFilePath = `${path.join(data.destination, data.name)}.json`;

    const json = JSON.stringify(model, (key, value) => {
        if (key === '$container' || key === '$cstNode' || key === '$document') {
            return undefined;
        }
        // Cross-references: emit the referenced name instead of resolving `.ref`,
        // which avoids cycles between mutually-referencing nodes (e.g. two steps
        // pointing at each other via on_fail/on_complete).
        if (value && typeof value === 'object' && typeof (value as { $refText?: unknown }).$refText === 'string') {
            return (value as { $refText: string }).$refText;
        }
        return value;
    }, 2);

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, json);
    return generatedFilePath;
}
