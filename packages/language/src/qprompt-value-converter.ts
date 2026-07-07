import type { CstNode, GrammarAST, ValueType } from 'langium';
import { DefaultValueConverter, ValueConverter } from 'langium';

/**
 * The grammar's STRING terminal matches three delimiter styles
 * (`"""multi-line"""`, `"single"`, `'single'`), but Langium's
 * DefaultValueConverter.convertString always strips exactly one character
 * off each end — correct for the 1-char delimiters, but it leaves a stray
 * leading/trailing `""` on every triple-quoted block (used for `prompt:`).
 */
export class QpromptValueConverter extends DefaultValueConverter {
    protected override runConverter(rule: GrammarAST.AbstractRule, input: string, cstNode: CstNode): ValueType {
        if (rule.name.toUpperCase() === 'STRING' && input.startsWith('"""') && input.endsWith('"""')) {
            return ValueConverter.convertString(input.slice(2, -2));
        }
        return super.runConverter(rule, input, cstNode);
    }
}
