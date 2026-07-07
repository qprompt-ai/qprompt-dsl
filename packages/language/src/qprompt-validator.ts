import type { ValidationAcceptor, ValidationChecks } from 'langium';
import type { Agent, EmitState, QpromptAstType, Resource, Step, Trigger, Workflow } from './generated/ast.js';
import type { QpromptServices } from './qprompt-module.js';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: QpromptServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.QpromptValidator;
    const checks: ValidationChecks<QpromptAstType> = {
        Workflow: validator.checkWorkflowHasSteps,
        EmitState: [validator.checkEmitStateSetsFailed, validator.checkEmitStateAssignmentsAreDeclared],
        Resource: validator.checkKnowledgeBaseFieldsExclusive,
        Step: validator.checkStepMatchesAgentIO,
        Agent: validator.checkSelectorHasCandidates,
        Trigger: validator.checkTriggerHasRequiredFields
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

    checkEmitStateAssignmentsAreDeclared(emitState: EmitState, accept: ValidationAcceptor): void {
        const states = emitState.$container.state.map(ref => ref.ref).filter(state => state !== undefined);
        if (states.length === 0) {
            return;
        }
        const declaredFields = new Set(states.flatMap(state => state.fields.map(field => field.name)));
        const stateNames = states.map(state => state.name).join("', '");

        for (const branch of [emitState.onPass, emitState.onFail]) {
            for (const assignment of branch.assignments) {
                if (!declaredFields.has(assignment.name)) {
                    accept('error', `No associated state ('${stateNames}') has a field named '${assignment.name}' — declare it in a 'state' block first.`, { node: assignment, property: 'name' });
                }
            }
        }
    }

    checkKnowledgeBaseFieldsExclusive(resource: Resource, accept: ValidationAcceptor): void {
        if (resource.path !== undefined && resource.paths.length > 0) {
            accept('error', "Specify exactly one of 'path' or 'paths', not both.", { node: resource });
        }
    }

    checkStepMatchesAgentIO(step: Step, accept: ValidationAcceptor): void {
        const agent = step.agent?.ref;
        if (!agent) {
            return;
        }
        if (agent.output === false && step.publish.length > 0) {
            accept('error', `Agent '${agent.name}' declares output: false, so step '${step.name}' must not publish to a channel — use emit_state instead.`, { node: step, property: 'publish' });
        }
        if (agent.input === false && step.subscribe.length > 0) {
            accept('error', `Agent '${agent.name}' declares input: false, so step '${step.name}' must not subscribe to a channel.`, { node: step, property: 'subscribe' });
        }
    }

    checkSelectorHasCandidates(agent: Agent, accept: ValidationAcceptor): void {
        if (agent.kind !== 'selector') {
            return;
        }
        if (agent.candidateModels.length === 0) {
            accept('error', `Selector agent '${agent.name}' must declare at least one candidate in 'candidate_models'.`, { node: agent, property: 'kind' });
        }
    }

    checkTriggerHasRequiredFields(trigger: Trigger, accept: ValidationAcceptor): void {
        if (trigger.type === 'schedule' && trigger.cron === undefined) {
            accept('error', "A 'schedule' trigger must set 'cron'.", { node: trigger, property: 'type' });
        }
        if (trigger.type === 'webhook' && (trigger.method === undefined || trigger.path === undefined)) {
            accept('error', "A 'webhook' trigger must set both 'method' and 'path'.", { node: trigger, property: 'type' });
        }
    }

}
