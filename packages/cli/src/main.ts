import type { Graph } from 'qprompt-language';
import { createQpromptServices, QpromptLanguageMetaData } from 'qprompt-language';
import chalk from 'chalk';
import { Command } from 'commander';
import { extractAstNode } from './util.js';
import { generateJsonDump } from './generator.js';
import { NodeFileSystem } from 'langium/node';
import * as url from 'node:url';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

const packagePath = path.resolve(__dirname, '..', 'package.json');
const packageContent = await fs.readFile(packagePath, 'utf-8');

export const generateAction = async (fileName: string, opts: GenerateOptions): Promise<void> => {
    const services = createQpromptServices(NodeFileSystem).Qprompt;
    const model = await extractAstNode<Graph>(fileName, services);
    const generatedFilePath = generateJsonDump(model, fileName, opts.destination);
    console.log(chalk.green(`Graph JSON generated successfully: ${generatedFilePath}`));
};

export type GenerateOptions = {
    destination?: string;
}

export default function(): void {
    const program = new Command();

    program.version(JSON.parse(packageContent).version);

    const fileExtensions = QpromptLanguageMetaData.fileExtensions.join(', ');
    program
        .command('generate')
        .argument('<file>', `source file (possible file extensions: ${fileExtensions})`)
        .option('-d, --destination <dir>', 'destination directory of generating')
        .description('parses and validates a qprompt graph, then dumps the resulting AST as JSON')
        .action(generateAction);

    program.parse(process.argv);
}
