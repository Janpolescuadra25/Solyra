import type {
  AstExecutionDiagnostic,
  AstExecutionResult,
  AstNode,
  BoundedAstProgram,
} from '@solyra/shared';

const PROTOTYPE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SAFE_CALLS = new Set([
  'Math.abs',
  'Math.min',
  'Math.max',
  'Math.round',
  'Math.floor',
  'Math.ceil',
  'Math.sqrt',
  'clamp',
]);

export interface EvaluatorOptions {
  maxSteps?: number;
  timeoutMs?: number;
  onEmitEvent?: (eventName: string, payload: Record<string, unknown>) => void;
}

class AstRuntimeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'AstRuntimeError';
  }
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getNodeId(node: unknown): string | undefined {
  if (isObjectLike(node)) {
    const id = node.id;
    return typeof id === 'string' ? id : undefined;
  }
  return undefined;
}

function assertSafeIdentifier(name: string, kind: string): void {
  if (PROTOTYPE_KEYS.has(name)) {
    throw new AstRuntimeError('INVALID_IDENTIFIER', `Access to prototype property '${name}' is strictly forbidden`, { kind, name });
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new AstRuntimeError('INVALID_IDENTIFIER', `${kind} '${name}' is not a valid identifier`, { kind, name });
  }
}

function normalizeOperator(operator: string): string {
  const lookup: Record<string, string> = {
    ADD: '+',
    SUBTRACT: '-',
    MULTIPLY: '*',
    DIVIDE: '/',
    MODULO: '%',
    EQUALS: '==',
    NOT_EQUALS: '!=',
    GREATER_THAN: '>',
    LESS_THAN: '<',
    AND: '&&',
    OR: '||',
    NOT: '!',
    NEGATE: '-',
  };
  return lookup[operator] ?? operator;
}

function buildDiagnostic(
  path: string,
  code: string,
  message: string,
  node: AstNode | undefined,
  step: number,
  details?: Record<string, unknown>,
): AstExecutionDiagnostic {
  return {
    path: path || 'root',
    code,
    message,
    nodeType: node?.type,
    nodeId: getNodeId(node),
    step,
    details,
  };
}

export function evaluateAstProgram(
  program: BoundedAstProgram,
  initialContext: Record<string, unknown> = {},
  options: EvaluatorOptions = {},
): AstExecutionResult {
  const startTime = Date.now();
  const maxSteps = options.maxSteps ?? 1000;
  const timeoutMs = options.timeoutMs ?? 1000;
  const emittedEvents: Array<{ eventName: string; payload: unknown }> = [];

  const scope: Record<string, unknown> = Object.create(null);
  for (const [key, value] of Object.entries(initialContext)) {
    if (!PROTOTYPE_KEYS.has(key)) {
      scope[key] = value;
    }
  }

  let stepsExecuted = 0;
  const executionState: { path: string; currentNode?: AstNode } = {
    path: 'root',
    currentNode: undefined,
  };

  function checkStepLimit(path: string): void {
    const nextStep = stepsExecuted + 1;
    if (nextStep > maxSteps) {
      stepsExecuted = maxSteps;
      throw new AstRuntimeError('STEP_BUDGET_EXCEEDED', `Execution step limit of ${maxSteps} exceeded`, { step: maxSteps, path, maxSteps });
    }

    stepsExecuted = nextStep;
    if (Date.now() - startTime > timeoutMs) {
      throw new AstRuntimeError('TIMEOUT_EXCEEDED', `Execution timeout of ${timeoutMs}ms exceeded`, { step: stepsExecuted, path, timeoutMs });
    }
  }

  const RETURN_SIGNAL = '__isReturn';

  function isReturnSignal(value: unknown): value is { __isReturn: true; value: unknown } {
    return isObjectLike(value) && value.__isReturn === true;
  }

  function evaluateSequence(statements: AstNode[], path: string): unknown {
    let lastValue: unknown = undefined;

    for (let index = 0; index < statements.length; index += 1) {
      const evaluated = evaluateNode(statements[index], `${path}[${index}]`);
      if (isReturnSignal(evaluated)) {
        return evaluated;
      }
      lastValue = evaluated;
    }

    return lastValue;
  }

  function evaluateNode(node: AstNode, path = 'root'): unknown {
    executionState.path = path;
    executionState.currentNode = node;
    checkStepLimit(path);

    switch (node.type) {
      case 'Literal': {
        return node.value;
      }

      case 'Identifier': {
        assertSafeIdentifier(node.name, 'Identifier');
        if (node.name in scope) {
          return scope[node.name];
        }
        throw new AstRuntimeError('UNDECLARED_IDENTIFIER', `Identifier '${node.name}' is not defined in scope`, { name: node.name, path });
      }

      case 'AssignmentStatement': {
        assertSafeIdentifier(node.target, 'Assignment target');
        const assignedValue = evaluateNode(node.value, `${path}.value`);
        if (isReturnSignal(assignedValue)) {
          return assignedValue;
        }
        scope[node.target] = assignedValue;
        return assignedValue;
      }

      case 'BinaryExpression': {
        const operator = normalizeOperator(node.operator);

        if (operator === '&&') {
          const left = evaluateNode(node.left, `${path}.left`);
          if (!left) {
            return left;
          }
          return evaluateNode(node.right, `${path}.right`);
        }

        if (operator === '||') {
          const left = evaluateNode(node.left, `${path}.left`);
          if (left) {
            return left;
          }
          return evaluateNode(node.right, `${path}.right`);
        }

        const leftValue = evaluateNode(node.left, `${path}.left`);
        const rightValue = evaluateNode(node.right, `${path}.right`);
        const left = Number(leftValue);
        const right = Number(rightValue);

        switch (operator) {
          case '+':
            return Number(left) + Number(right);
          case '-':
            return Number(left) - Number(right);
          case '*':
            return Number(left) * Number(right);
          case '/':
            if (Number(right) === 0) {
              throw new AstRuntimeError('DIVISION_BY_ZERO', 'Division by zero', { left, right, operator, path });
            }
            return Number(left) / Number(right);
          case '%':
            return Number(left) % Number(right);
          case '==':
            return left === right;
          case '!=':
            return left !== right;
          case '<':
            return left < right;
          case '<=':
            return left <= right;
          case '>':
            return left > right;
          case '>=':
            return left >= right;
          default:
            throw new AstRuntimeError('INVALID_OPERATOR', `Unsupported binary operator: ${node.operator}`, { operator: node.operator, path });
        }
      }

      case 'UnaryExpression': {
        const operand = evaluateNode(node.argument, `${path}.argument`);
        const operator = normalizeOperator(node.operator);

        switch (operator) {
          case '-':
            return -(Number(operand));
          case '!':
            return !operand;
          case 'NOT':
            return !operand;
          case 'NEGATE':
            return -(Number(operand));
          default:
            throw new AstRuntimeError('INVALID_OPERATOR', `Unsupported unary operator: ${node.operator}`, { operator: node.operator, path });
        }
      }

      case 'IfStatement': {
        const conditionValue = evaluateNode(node.condition ?? (node as any).test, `${path}.condition`);
        const condition = Boolean(conditionValue);
        const branchStatements = condition
          ? Array.isArray(node.consequent) ? node.consequent : []
          : Array.isArray(node.alternate) ? node.alternate : [];

        const branchValue = evaluateSequence(branchStatements, `${path}.${condition ? 'consequent' : 'alternate'}`);
        if (isReturnSignal(branchValue)) {
          return branchValue;
        }

        return branchValue;
      }

      case 'PropertyAccess': {
        const source = evaluateNode(node.object, `${path}.object`) as Record<string, unknown> | undefined;
        if (!source || (typeof source !== 'object' && typeof source !== 'function')) {
          throw new AstRuntimeError('INVALID_PROPERTY_ACCESS', `Cannot access property '${node.property}' on non-object`, { property: node.property, path });
        }

        const property = node.property;
        assertSafeIdentifier(property, 'Property');
        return source[property];
      }

      case 'CallExpression': {
        const callee = node.callee;
        if (!SAFE_CALLS.has(callee)) {
          throw new AstRuntimeError('UNAUTHORIZED_CALL', `Unauthorized callee function: ${callee}`, { callee, path });
        }

        const args = node.arguments.map((arg, index) => evaluateNode(arg, `${path}.arguments[${index}]`));

        switch (callee) {
          case 'Math.abs':
            return Math.abs(Number(args[0] ?? 0));
          case 'Math.min':
            return Math.min(...args.map((value) => Number(value)));
          case 'Math.max':
            return Math.max(...args.map((value) => Number(value)));
          case 'Math.round':
            return Math.round(Number(args[0] ?? 0));
          case 'Math.floor':
            return Math.floor(Number(args[0] ?? 0));
          case 'Math.ceil':
            return Math.ceil(Number(args[0] ?? 0));
          case 'Math.sqrt':
            return Math.sqrt(Number(args[0] ?? 0));
          case 'clamp': {
            const value = Number(args[0] ?? 0);
            const min = Number(args[1] ?? value);
            const max = Number(args[2] ?? value);
            return Math.min(Math.max(value, min), max);
          }
          default:
            throw new AstRuntimeError('UNAUTHORIZED_CALL', `Unauthorized callee function: ${callee}`, { callee, path });
        }
      }

      case 'EmitEventStatement': {
        const payload: Record<string, unknown> = {};
        const sourcePayload = isObjectLike(node.payload) ? node.payload : {};

        for (const [key, value] of Object.entries(sourcePayload)) {
          if (PROTOTYPE_KEYS.has(key)) {
            throw new AstRuntimeError('PROTOTYPE_POLLUTION', `Payload key '${key}' is forbidden`, { key, path });
          }
          payload[key] = evaluateNode(value as AstNode, `${path}.payload.${key}`);
        }

        const eventName = node.eventName ?? (node as any).eventType ?? 'unknown.event';
        emittedEvents.push({ eventName, payload });
        if (options.onEmitEvent) {
          options.onEmitEvent(eventName, payload);
        }
        return true;
      }

      case 'ReturnStatement': {
        return { __isReturn: true, value: evaluateNode(node.value, `${path}.value`) };
      }

      default: {
        throw new AstRuntimeError('RUNTIME_ERROR', `Unknown AST node type: ${(node as any).type}`, { type: (node as any).type, path });
      }
    }
  }

  try {
    let finalResult: unknown = undefined;
    for (let index = 0; index < program.body.length; index += 1) {
      const evaluated = evaluateNode(program.body[index], `body[${index}]`);
      if (isReturnSignal(evaluated)) {
        finalResult = evaluated.value;
        break;
      }
      finalResult = evaluated;
    }

    const executionTimeMs = Date.now() - startTime;
    return {
      success: true,
      result: finalResult,
      stepsExecuted,
      events: emittedEvents,
      executionTimeMs,
      durationMs: executionTimeMs,
      emittedEvents,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown evaluation error';
    const diagnostic = buildDiagnostic(
      executionState.path || 'root',
      error instanceof AstRuntimeError ? error.code : 'RUNTIME_ERROR',
      errorMessage,
      executionState.currentNode,
      stepsExecuted,
      error instanceof AstRuntimeError ? error.details : undefined,
    );
    const executionTimeMs = Date.now() - startTime;

    return {
      success: false,
      error: errorMessage,
      diagnostic,
      stepsExecuted,
      events: emittedEvents,
      executionTimeMs,
      durationMs: executionTimeMs,
      emittedEvents,
    };
  }
}

export async function evaluateStreamingAstProgram(
  programLoader: () => Promise<BoundedAstProgram> | BoundedAstProgram,
  initialContext: Record<string, unknown> = {},
  options: EvaluatorOptions = {},
): Promise<AstExecutionResult> {
  const startTime = Date.now();
  const maxSteps = options.maxSteps ?? 1000;
  const timeoutMs = options.timeoutMs ?? 1000;
  const emittedEvents: Array<{ eventName: string; payload: unknown }> = [];

  const scope: Record<string, unknown> = Object.create(null);
  for (const [key, value] of Object.entries(initialContext)) {
    if (!PROTOTYPE_KEYS.has(key)) {
      scope[key] = value;
    }
  }

  let stepsExecuted = 0;
  const executionState: { path: string; currentNode?: AstNode } = {
    path: 'root',
    currentNode: undefined,
  };

  function checkStepLimit(path: string): void {
    const nextStep = stepsExecuted + 1;
    if (nextStep > maxSteps) {
      stepsExecuted = maxSteps;
      throw new AstRuntimeError('STEP_BUDGET_EXCEEDED', `Execution step limit of ${maxSteps} exceeded`, { step: maxSteps, path, maxSteps });
    }

    stepsExecuted = nextStep;
    if (Date.now() - startTime > timeoutMs) {
      throw new AstRuntimeError('TIMEOUT_EXCEEDED', `Execution timeout of ${timeoutMs}ms exceeded`, { step: stepsExecuted, path, timeoutMs });
    }
  }

  async function maybeYield(): Promise<void> {
    if (stepsExecuted > 0 && stepsExecuted % 250 === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }

  const RETURN_SIGNAL = '__isReturn';

  function isReturnSignal(value: unknown): value is { __isReturn: true; value: unknown } {
    return isObjectLike(value) && value.__isReturn === true;
  }

  async function evaluateSequence(statements: AstNode[], path: string): Promise<unknown> {
    let lastValue: unknown = undefined;

    for (let index = 0; index < statements.length; index += 1) {
      const evaluated = await evaluateNode(statements[index], `${path}[${index}]`);
      if (isReturnSignal(evaluated)) {
        return evaluated;
      }
      lastValue = evaluated;
    }

    return lastValue;
  }

  async function evaluateNode(node: AstNode, path = 'root'): Promise<unknown> {
    executionState.path = path;
    executionState.currentNode = node;
    checkStepLimit(path);
    await maybeYield();

    switch (node.type) {
      case 'Literal': {
        return node.value;
      }

      case 'Identifier': {
        assertSafeIdentifier(node.name, 'Identifier');
        if (node.name in scope) {
          return scope[node.name];
        }
        throw new AstRuntimeError('UNDECLARED_IDENTIFIER', `Identifier '${node.name}' is not defined in scope`, { name: node.name, path });
      }

      case 'AssignmentStatement': {
        assertSafeIdentifier(node.target, 'Assignment target');
        const assignedValue = await evaluateNode(node.value, `${path}.value`);
        if (isReturnSignal(assignedValue)) {
          return assignedValue;
        }
        scope[node.target] = assignedValue;
        return assignedValue;
      }

      case 'BinaryExpression': {
        const operator = normalizeOperator(node.operator);

        if (operator === '&&') {
          const left = await evaluateNode(node.left, `${path}.left`);
          if (!left) {
            return left;
          }
          return await evaluateNode(node.right, `${path}.right`);
        }

        if (operator === '||') {
          const left = await evaluateNode(node.left, `${path}.left`);
          if (left) {
            return left;
          }
          return await evaluateNode(node.right, `${path}.right`);
        }

        const leftValue = await evaluateNode(node.left, `${path}.left`);
        const rightValue = await evaluateNode(node.right, `${path}.right`);
        const left = Number(leftValue);
        const right = Number(rightValue);

        switch (operator) {
          case '+':
            return Number(left) + Number(right);
          case '-':
            return Number(left) - Number(right);
          case '*':
            return Number(left) * Number(right);
          case '/':
            if (Number(right) === 0) {
              throw new AstRuntimeError('DIVISION_BY_ZERO', 'Division by zero', { left, right, operator, path });
            }
            return Number(left) / Number(right);
          case '%':
            return Number(left) % Number(right);
          case '==':
            return left === right;
          case '!=':
            return left !== right;
          case '<':
            return left < right;
          case '<=':
            return left <= right;
          case '>':
            return left > right;
          case '>=':
            return left >= right;
          default:
            throw new AstRuntimeError('INVALID_OPERATOR', `Unsupported binary operator: ${node.operator}`, { operator: node.operator, path });
        }
      }

      case 'UnaryExpression': {
        const operand = await evaluateNode(node.argument, `${path}.argument`);
        const operator = normalizeOperator(node.operator);

        switch (operator) {
          case '-':
            return -(Number(operand));
          case '!':
            return !operand;
          case 'NOT':
            return !operand;
          case 'NEGATE':
            return -(Number(operand));
          default:
            throw new AstRuntimeError('INVALID_OPERATOR', `Unsupported unary operator: ${node.operator}`, { operator: node.operator, path });
        }
      }

      case 'IfStatement': {
        const conditionValue = await evaluateNode(node.condition ?? (node as any).test, `${path}.condition`);
        const condition = Boolean(conditionValue);
        const branchStatements = condition
          ? Array.isArray(node.consequent) ? node.consequent : []
          : Array.isArray(node.alternate) ? node.alternate : [];

        const branchValue = await evaluateSequence(branchStatements, `${path}.${condition ? 'consequent' : 'alternate'}`);
        if (isReturnSignal(branchValue)) {
          return branchValue;
        }

        return branchValue;
      }

      case 'PropertyAccess': {
        const source = await evaluateNode(node.object, `${path}.object`) as Record<string, unknown> | undefined;
        if (!source || (typeof source !== 'object' && typeof source !== 'function')) {
          throw new AstRuntimeError('INVALID_PROPERTY_ACCESS', `Cannot access property '${node.property}' on non-object`, { property: node.property, path });
        }

        const property = node.property;
        assertSafeIdentifier(property, 'Property');
        return source[property];
      }

      case 'CallExpression': {
        const callee = node.callee;
        if (!SAFE_CALLS.has(callee)) {
          throw new AstRuntimeError('UNAUTHORIZED_CALL', `Unauthorized callee function: ${callee}`, { callee, path });
        }

        const args = await Promise.all(node.arguments.map((arg, index) => evaluateNode(arg, `${path}.arguments[${index}]`)));

        switch (callee) {
          case 'Math.abs':
            return Math.abs(Number(args[0] ?? 0));
          case 'Math.min':
            return Math.min(...args.map((value) => Number(value)));
          case 'Math.max':
            return Math.max(...args.map((value) => Number(value)));
          case 'Math.round':
            return Math.round(Number(args[0] ?? 0));
          case 'Math.floor':
            return Math.floor(Number(args[0] ?? 0));
          case 'Math.ceil':
            return Math.ceil(Number(args[0] ?? 0));
          case 'Math.sqrt':
            return Math.sqrt(Number(args[0] ?? 0));
          case 'clamp': {
            const value = Number(args[0] ?? 0);
            const min = Number(args[1] ?? value);
            const max = Number(args[2] ?? value);
            return Math.min(Math.max(value, min), max);
          }
          default:
            throw new AstRuntimeError('UNAUTHORIZED_CALL', `Unauthorized callee function: ${callee}`, { callee, path });
        }
      }

      case 'EmitEventStatement': {
        const payload: Record<string, unknown> = {};
        const sourcePayload = isObjectLike(node.payload) ? node.payload : {};

        for (const [key, value] of Object.entries(sourcePayload)) {
          if (PROTOTYPE_KEYS.has(key)) {
            throw new AstRuntimeError('PROTOTYPE_POLLUTION', `Payload key '${key}' is forbidden`, { key, path });
          }
          payload[key] = await evaluateNode(value as AstNode, `${path}.payload.${key}`);
        }

        const eventName = node.eventName ?? (node as any).eventType ?? 'unknown.event';
        emittedEvents.push({ eventName, payload });
        if (options.onEmitEvent) {
          options.onEmitEvent(eventName, payload);
        }
        return true;
      }

      case 'ReturnStatement': {
        return { __isReturn: true, value: await evaluateNode(node.value, `${path}.value`) };
      }

      default: {
        throw new AstRuntimeError('RUNTIME_ERROR', `Unknown AST node type: ${(node as any).type}`, { type: (node as any).type, path });
      }
    }
  }

  try {
    const program = await programLoader();
    let finalResult: unknown = undefined;
    for (let index = 0; index < program.body.length; index += 1) {
      const evaluated = await evaluateNode(program.body[index], `body[${index}]`);
      if (isReturnSignal(evaluated)) {
        finalResult = evaluated.value;
        break;
      }
      finalResult = evaluated;
    }

    const executionTimeMs = Date.now() - startTime;
    return {
      success: true,
      result: finalResult,
      stepsExecuted,
      events: emittedEvents,
      executionTimeMs,
      durationMs: executionTimeMs,
      emittedEvents,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown evaluation error';
    const diagnostic = buildDiagnostic(
      executionState.path || 'root',
      error instanceof AstRuntimeError ? error.code : 'RUNTIME_ERROR',
      errorMessage,
      executionState.currentNode,
      stepsExecuted,
      error instanceof AstRuntimeError ? error.details : undefined,
    );
    const executionTimeMs = Date.now() - startTime;

    return {
      success: false,
      error: errorMessage,
      diagnostic,
      stepsExecuted,
      events: emittedEvents,
      executionTimeMs,
      durationMs: executionTimeMs,
      emittedEvents,
    };
  }
}
