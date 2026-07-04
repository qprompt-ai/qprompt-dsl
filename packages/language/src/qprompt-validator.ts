import type { ValidationAcceptor, ValidationChecks } from 'langium';
import type { EmitState, QpromptAstType, Resource, Workflow } from './generated/ast.js';
import type { QpromptServices } from './qprompt-module.js';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: QpromptServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.QpromptValidator;
    const checks: ValidationChecks<QpromptAstType> = {
        Workflow: validator.checkWorkflowHasSteps,
        EmitState: validator.checkEmitStateSetsFailed,
        Resource: validator.checkKnowledgeBaseFieldsExclusive
    };
    registry.register(checks, validator);
}

/**
 * Implementation of custom validations.
 */
export class QpromptValidator {

    checkWorkflowHasSteps(workflow: Workflow, accept: ValidationAcceptor): void {
        if (workflow.steps.length === 0) {
            accept('error', 'Workflow must declare at least one step.', { node: workflow, property: 'name' });
        }
    }

    checkEmitStateSetsFailed(emitState: EmitState, accept: ValidationAcceptor): void {
        const hasFailedAssignment = (branch: EmitState['onPass'] | EmitState['onFail']) =>
            branch.assignments.some(assignment => assignment.name === 'failed');

        if (!hasFailedAssignment(emitState.onPass)) {
            accept('error', "emit_state.on_pass must explicitly set 'failed'.", { node: emitState.onPass });
        }
        if (!hasFailedAssignment(emitState.onFail)) {
            accept('error', "emit_state.on_fail must explicitly set 'failed'.", { node: emitState.onFail });
        }
    }

    checkKnowledgeBaseFieldsExclusive(resource: Resource, accept: ValidationAcceptor): void {
        if (resource.path !== undefined && resource.paths.length > 0) {
            accept('error', "Specify exactly one of 'path' or 'paths', not both.", { node: resource });
        }
    }

}
