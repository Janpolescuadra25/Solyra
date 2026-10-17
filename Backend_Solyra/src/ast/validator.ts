import type {
  AstBinaryOperator,
  AstUnaryOperator,
  AstValidationError,
  AstValidationResult,
  BoundedAstProgram,
} from '@solyra/shared';
import { hashCanonicalAst } from './serializer.js';

export interface AstValidationOptions {
  maxDepth?: number;
  maxNodes?: number;
}

const VALID_BINARY_OPERATORS = new Set<string>([
  'EQUALS',
  'NOT_EQUALS',
  'GREATER_THAN',
  'LESS_THAN',
  'AND',
  'OR',
  'ADD',
  'SUBTRACT',
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  '&&',
  '||',
]);

const VALID_UNARY_OPERATORS = new Set<string>(['NOT', 'NEGATE', '!', '-']);
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
const PROGRAM_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const EVENT_NAME_RE = /^[a-zA-Z0-9_:.]{1,64}$/;
const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidIdentifierName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    IDENTIFIER_RE.test(value) &&
    !PROTOTYPE_KEYS.has(value)
  );
}

function normalizeNodeType(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const mapping: Record<string, string> = {
    LITERAL: 'Literal',
    Literal: 'Literal',
    Identifier: 'Identifier',
    BINARY_EXPR: 'BinaryExpression',
    BinaryExpression: 'BinaryExpression',
    UNARY_EXPR: 'UnaryExpression',
    UnaryExpression: 'UnaryExpression',
    IF_STATEMENT: 'IfStatement',
    IfStatement: 'IfStatement',
    AssignmentStatement: 'AssignmentStatement',
    PropertyAccess: 'PropertyAccess',
    CallExpression: 'CallExpression',
    EMIT_EVENT: 'EmitEventStatement',
    EmitEventStatement: 'EmitEventStatement',
    RETURN: 'ReturnStatement',
    ReturnStatement: 'ReturnStatement',
  };

  return mapping[value] ?? value;
}

function addError(errors: AstValidationError[], code: string, message: string, path?: string, node?: unknown): void {
  const nodeData = isObjectLike(node)
    ? {
        nodeType: typeof (node as Record<string, unknown>).type === 'string'
          ? normalizeNodeType((node as Record<string, unknown>).type) ?? undefined
          : undefined,
        nodeId: typeof (node as Record<string, unknown>).id === 'string'
          ? String((node as Record<string, unknown>).id)
          : undefined,
      }
    : {};

  errors.push({
    path: path ?? 'root',
    code,
    message,
    ...nodeData,
  });
}

function validateAstNode(
  node: unknown,
  path: string,
  maxDepth: number,
  currentDepth: number,
  maxNodes: number,
  tracker: { count: number; aborted: boolean },
): { depth: number; nodeCount: number; errors: AstValidationError[] } {
  const errors: AstValidationError[] = [];

  if (tracker.aborted) {
    return { depth: currentDepth, nodeCount: 0, errors };
  }

  if (currentDepth > maxDepth) {
    tracker.aborted = true;
    addError(errors, 'MAX_DEPTH_EXCEEDED', `Depth ${currentDepth} exceeds maxDepth ${maxDepth}`, path, node);
    return { depth: currentDepth, nodeCount: 0, errors };
  }

  if (!isObjectLike(node)) {
    addError(errors, 'INVALID_NODE_TYPE', `Node at ${path} must be an object`, path, node);
    return { depth: currentDepth, nodeCount: 0, errors };
  }

  const normalizedType = normalizeNodeType(node.type);
  const nodeDepth = currentDepth + 1;
  tracker.count += 1;

  if (tracker.count > maxNodes) {
    tracker.aborted = true;
    addError(errors, 'MAX_NODES_EXCEEDED', `AST node count ${tracker.count} exceeds the ${maxNodes}-node safety limit`, path, node);
    return { depth: nodeDepth, nodeCount: 1, errors };
  }

  switch (normalizedType) {
    case 'Literal': {
      const value = node.value;
      if (
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean' &&
        value !== null
      ) {
        addError(errors, 'INVALID_LITERAL', `Literal at ${path} has unsupported value`, path, node);
      }
      return { depth: nodeDepth, nodeCount: 1, errors };
    }

    case 'Identifier': {
      if (!isValidIdentifierName(node.name)) {
        addError(errors, 'INVALID_IDENTIFIER', `Identifier at ${path} must be a safe variable name`, path, node);
      }
      return { depth: nodeDepth, nodeCount: 1, errors };
    }

    case 'BinaryExpression': {
      if (nodeDepth > maxDepth) {
        tracker.aborted = true;
        addError(errors, 'MAX_DEPTH_EXCEEDED', `Depth ${nodeDepth} exceeds maxDepth ${maxDepth}`, path, node);
        return { depth: nodeDepth, nodeCount: 1, errors };
      }

      const operator = node.operator;
      if (typeof operator !== 'string' || !VALID_BINARY_OPERATORS.has(operator)) {
        addError(errors, 'INVALID_OPERATOR', `Binary expression operator at ${path} is invalid: ${String(operator)}`, path, node);
      }

      const leftResult = validateAstNode(node.left, `${path}.left`, maxDepth, nodeDepth, maxNodes, tracker);
      const rightResult = validateAstNode(node.right, `${path}.right`, maxDepth, nodeDepth, maxNodes, tracker);
      const mergedErrors = [...errors, ...leftResult.errors, ...rightResult.errors];
      return {
        depth: Math.max(nodeDepth, leftResult.depth, rightResult.depth),
        nodeCount: 1 + leftResult.nodeCount + rightResult.nodeCount,
        errors: mergedErrors,
      };
    }

    case 'UnaryExpression': {
      if (nodeDepth > maxDepth) {
        tracker.aborted = true;
        addError(errors, 'MAX_DEPTH_EXCEEDED', `Depth ${nodeDepth} exceeds maxDepth ${maxDepth}`, path, node);
        return { depth: nodeDepth, nodeCount: 1, errors };
      }

      const operator = node.operator;
      if (typeof operator !== 'string' || !VALID_UNARY_OPERATORS.has(operator)) {
        addError(errors, 'INVALID_OPERATOR', `Unary expression operator at ${path} is invalid: ${String(operator)}`, path, node);
      }

      const operand = node.argument ?? node.operand;
      const operandResult = validateAstNode(operand, `${path}.argument`, maxDepth, nodeDepth, maxNodes, tracker);
      const mergedErrors = [...errors, ...operandResult.errors];
      return {
        depth: Math.max(nodeDepth, operandResult.depth),
        nodeCount: 1 + operandResult.nodeCount,
        errors: mergedErrors,
      };
    }

    case 'IfStatement': {
      if (nodeDepth > maxDepth) {
        tracker.aborted = true;
        addError(errors, 'MAX_DEPTH_EXCEEDED', `Depth ${nodeDepth} exceeds maxDepth ${maxDepth}`, path, node);
        return { depth: nodeDepth, nodeCount: 1, errors };
      }

      const condition = node.condition ?? node.test;
      const consequent = Array.isArray(node.consequent) ? node.consequent : Array.isArray(node.thenBranch) ? node.thenBranch : [];
      const alternate = Array.isArray(node.alternate) ? node.alternate : Array.isArray(node.elseBranch) ? node.elseBranch : [];

      const conditionResult = validateAstNode(condition, `${path}.condition`, maxDepth, nodeDepth, maxNodes, tracker);
      const childErrors: AstValidationError[] = [...errors, ...conditionResult.errors];
      let childDepth = conditionResult.depth;
      let childCount = conditionResult.nodeCount;

      for (let index = 0; index < consequent.length; index += 1) {
        const result = validateAstNode(consequent[index], `${path}.consequent[${index}]`, maxDepth, nodeDepth, maxNodes, tracker);
        childErrors.push(...result.errors);
        childDepth = Math.max(childDepth, result.depth);
        childCount += result.nodeCount;
      }

      for (let index = 0; index < alternate.length; index += 1) {
        const result = validateAstNode(alternate[index], `${path}.alternate[${index}]`, maxDepth, nodeDepth, maxNodes, tracker);
        childErrors.push(...result.errors);
        childDepth = Math.max(childDepth, result.depth);
        childCount += result.nodeCount;
      }

      return {
        depth: Math.max(nodeDepth, childDepth),
        nodeCount: 1 + childCount,
        errors: childErrors,
      };
    }

    case 'AssignmentStatement': {
      if (nodeDepth > maxDepth) {
        tracker.aborted = true;
        addError(errors, 'MAX_DEPTH_EXCEEDED', `Depth ${nodeDepth} exceeds maxDepth ${maxDepth}`, path, node);
        return { depth: nodeDepth, nodeCount: 1, errors };
      }

      if (!isValidIdentifierName(node.target)) {
        addError(errors, 'INVALID_ASSIGNMENT_TARGET', `Assignment target at ${path} is not a safe identifier`, path, node);
      }

      const valueResult = validateAstNode(node.value, `${path}.value`, maxDepth, nodeDepth, maxNodes, tracker);
      return {
        depth: Math.max(nodeDepth, valueResult.depth),
        nodeCount: 1 + valueResult.nodeCount,
        errors: [...errors, ...valueResult.errors],
      };
    }

    case 'PropertyAccess': {
      if (nodeDepth > maxDepth) {
        tracker.aborted = true;
        addError(errors, 'MAX_DEPTH_EXCEEDED', `Depth ${nodeDepth} exceeds maxDepth ${maxDepth}`, path, node);
        return { depth: nodeDepth, nodeCount: 1, errors };
      }

      if (typeof node.property !== 'string' || !isValidIdentifierName(node.property)) {
        addError(errors, 'INVALID_PROPERTY', `Property at ${path} is not a safe identifier`, path, node);
      }

      const objectResult = validateAstNode(node.object, `${path}.object`, maxDepth, nodeDepth, maxNodes, tracker);
      return {
        depth: Math.max(nodeDepth, objectResult.depth),
        nodeCount: 1 + objectResult.nodeCount,
        errors: [...errors, ...objectResult.errors],
      };
    }

    case 'CallExpression': {
      if (nodeDepth > maxDepth) {
        tracker.aborted = true;
        addError(errors, 'MAX_DEPTH_EXCEEDED', `Depth ${nodeDepth} exceeds maxDepth ${maxDepth}`, path, node);
        return { depth: nodeDepth, nodeCount: 1, errors };
      }

      if (typeof node.callee !== 'string' || !SAFE_CALLS.has(node.callee)) {
        addError(errors, 'UNAUTHORIZED_CALL', `Call target at ${path} is not in the safe function whitelist`, path, node);
      }

      const args = Array.isArray(node.arguments) ? node.arguments : [];
      let argDepth = nodeDepth;
      let argNodeCount = 0;
      const argErrors: AstValidationError[] = [];

      for (let index = 0; index < args.length; index += 1) {
        const result = validateAstNode(args[index], `${path}.arguments[${index}]`, maxDepth, nodeDepth, maxNodes, tracker);
        argErrors.push(...result.errors);
        argDepth = Math.max(argDepth, result.depth);
        argNodeCount += result.nodeCount;
      }

      return {
        depth: Math.max(nodeDepth, argDepth),
        nodeCount: 1 + argNodeCount,
        errors: [...errors, ...argErrors],
      };
    }

    case 'EmitEventStatement': {
      if (nodeDepth > maxDepth) {
        tracker.aborted = true;
        addError(errors, 'MAX_DEPTH_EXCEEDED', `Depth ${nodeDepth} exceeds maxDepth ${maxDepth}`, path, node);
        return { depth: nodeDepth, nodeCount: 1, errors };
      }

      const eventName = typeof node.eventName === 'string' ? node.eventName : typeof node.eventType === 'string' ? node.eventType : undefined;
      if (typeof eventName !== 'string' || !EVENT_NAME_RE.test(eventName)) {
        addError(errors, 'INVALID_EVENT_NAME', `Event name at ${path} is invalid`, path, node);
      }

      const payload = isObjectLike(node.payload) ? node.payload : {};
      let payloadDepth = nodeDepth;
      let payloadNodeCount = 0;
      const payloadErrors: AstValidationError[] = [];

      for (const [key, value] of Object.entries(payload)) {
        if (PROTOTYPE_KEYS.has(key)) {
          addError(errors, 'PROTOTYPE_POLLUTION', `Unsafe payload key '${key}' is prohibited`, `${path}.payload.${key}`, value);
          continue;
        }

        const result = validateAstNode(value, `${path}.payload.${key}`, maxDepth, nodeDepth, maxNodes, tracker);
        payloadErrors.push(...result.errors);
        payloadDepth = Math.max(payloadDepth, result.depth);
        payloadNodeCount += result.nodeCount;
      }

      return {
        depth: Math.max(nodeDepth, payloadDepth),
        nodeCount: 1 + payloadNodeCount,
        errors: [...errors, ...payloadErrors],
      };
    }

    case 'ReturnStatement': {
      if (nodeDepth > maxDepth) {
        tracker.aborted = true;
        addError(errors, 'MAX_DEPTH_EXCEEDED', `Depth ${nodeDepth} exceeds maxDepth ${maxDepth}`, path, node);
        return { depth: nodeDepth, nodeCount: 1, errors };
      }

      if (node.value === undefined) {
        addError(errors, 'INVALID_RETURN', `Return statement at ${path} must contain a value`, path, node);
        return { depth: nodeDepth, nodeCount: 1, errors };
      }

      const valueResult = validateAstNode(node.value, `${path}.value`, maxDepth, nodeDepth, maxNodes, tracker);
      return {
        depth: Math.max(nodeDepth, valueResult.depth),
        nodeCount: 1 + valueResult.nodeCount,
        errors: [...errors, ...valueResult.errors],
      };
    }

    default: {
      addError(errors, 'INVALID_NODE_TYPE', `Unsupported node type at ${path}: ${String(node.type)}`, path, node);
      return { depth: nodeDepth, nodeCount: 1, errors };
    }
  }
}

export function validateBoundedAstProgram(program: unknown, options: AstValidationOptions = {}): AstValidationResult {
  const errors: AstValidationError[] = [];
  const maxDepth = Number.isInteger(options.maxDepth) ? options.maxDepth! : 32;
  const maxNodes = Number.isInteger(options.maxNodes) ? options.maxNodes! : 500;

  if (!isObjectLike(program)) {
    return {
      valid: false,
      errors: [{ path: 'root', code: 'INVALID_PROGRAM', message: 'Program must be an object', node: program }],
      depth: 0,
      nodeCount: 0,
    };
  }

  const record = program as Record<string, unknown>;

  if (typeof record.version !== 'string' || record.version !== '1.0') {
    addError(errors, 'INVALID_VERSION', 'Program version must be "1.0"', 'version', record.version);
  }

  if (typeof record.programId !== 'string' || !PROGRAM_ID_RE.test(record.programId)) {
    addError(errors, 'INVALID_PROGRAM_ID', 'programId must be a non-empty string matching ^[a-zA-Z0-9_-]{1,64}$', 'programId', record.programId);
  }

  const rawMaxDepth = typeof record.maxDepth === 'number' ? record.maxDepth : Number.NaN;
  if (!Number.isInteger(rawMaxDepth) || rawMaxDepth < 1 || rawMaxDepth > 64) {
    addError(errors, 'INVALID_MAX_DEPTH', 'maxDepth must be an integer between 1 and 64', 'maxDepth', record.maxDepth);
  }

  const body = Array.isArray(record.body) ? record.body : [];
  if (!Array.isArray(record.body) || body.length === 0) {
    addError(errors, 'INVALID_BODY', 'body must be a non-empty array of AST nodes', 'body', record.body);
  }

  let actualDepth = 0;
  let totalNodeCount = 0;
  const effectiveMaxDepth = Number.isInteger(rawMaxDepth) ? rawMaxDepth : maxDepth;
  const tracker = { count: 0, aborted: false };

  for (let index = 0; index < body.length; index += 1) {
    const result = validateAstNode(body[index], `body[${index}]`, effectiveMaxDepth, 0, maxNodes, tracker);
    errors.push(...result.errors);
    actualDepth = Math.max(actualDepth, result.depth);
    totalNodeCount = tracker.count;
    if (tracker.aborted) {
      break;
    }
  }

  if (actualDepth > effectiveMaxDepth) {
    addError(errors, 'MAX_DEPTH_EXCEEDED', `Actual AST depth ${actualDepth} exceeds maxDepth ${effectiveMaxDepth}`, 'maxDepth', record.maxDepth);
  }

  if (tracker.count > maxNodes) {
    addError(errors, 'MAX_NODES_EXCEEDED', `AST node count ${tracker.count} exceeds the ${maxNodes}-node safety limit`, 'body', body);
  }

  const valid = errors.length === 0;
  const result: AstValidationResult = {
    valid,
    errors,
    depth: actualDepth,
    nodeCount: totalNodeCount,
  };

  if (valid) {
    const typedProgram = program as unknown as BoundedAstProgram;
    result.rootHash = hashCanonicalAst(typedProgram);
  }

  return result;
}
