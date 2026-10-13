import type {
  AstBinaryOperator,
  AstUnaryOperator,
  BoundedAstProgram,
} from '@solyra/shared';
import { hashCanonicalAst } from './serializer.js';

export interface AstValidationError {
  code: string;
  message: string;
  path?: string;
  node?: unknown;
}

export interface AstValidationResult {
  valid: boolean;
  errors: AstValidationError[];
  depth: number;
  nodeCount: number;
  rootHash?: string;
}

const VALID_BINARY_OPERATORS = new Set<AstBinaryOperator>([
  'EQUALS',
  'NOT_EQUALS',
  'GREATER_THAN',
  'LESS_THAN',
  'AND',
  'OR',
  'ADD',
  'SUBTRACT',
]);

const VALID_UNARY_OPERATORS = new Set<AstUnaryOperator>(['NOT', 'NEGATE']);
const PROGRAM_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const EVENT_NAME_RE = /^[a-zA-Z0-9_:.]{1,64}$/;

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
    EMIT_EVENT: 'EmitEventStatement',
    EmitEventStatement: 'EmitEventStatement',
    RETURN: 'ReturnStatement',
    ReturnStatement: 'ReturnStatement',
  };

  return mapping[value] ?? value;
}

function addError(errors: AstValidationError[], code: string, message: string, path?: string, node?: unknown): void {
  errors.push({ code, message, path, node });
}

function validateAstNode(node: unknown, path: string): { depth: number; nodeCount: number; errors: AstValidationError[] } {
  const errors: AstValidationError[] = [];

  if (!isObjectLike(node)) {
    addError(errors, 'INVALID_NODE_TYPE', `Node at ${path} must be an object`, path, node);
    return { depth: 0, nodeCount: 0, errors };
  }

  const normalizedType = normalizeNodeType(node.type);

  switch (normalizedType) {
    case 'Literal': {
      const value = node.value;
      if (
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean' &&
        value !== null
      ) {
        addError(errors, 'INVALID_LITERAL', `Literal at ${path} has an unsupported value`, path, node);
      }
      return { depth: 1, nodeCount: 1, errors };
    }

    case 'Identifier': {
      if (typeof node.name !== 'string' || node.name.trim().length === 0) {
        addError(errors, 'INVALID_IDENTIFIER', `Identifier at ${path} requires a non-empty name`, path, node);
      }
      return { depth: 1, nodeCount: 1, errors };
    }

    case 'BinaryExpression': {
      const operator = node.operator;
      if (typeof operator !== 'string' || !VALID_BINARY_OPERATORS.has(operator as AstBinaryOperator)) {
        addError(errors, 'INVALID_OPERATOR', `Binary expression operator at ${path} is invalid: ${String(operator)}`, path, node);
      }

      const leftResult = validateAstNode(node.left, `${path}.left`);
      const rightResult = validateAstNode(node.right, `${path}.right`);
      const mergedErrors = [...errors, ...leftResult.errors, ...rightResult.errors];
      return {
        depth: 1 + Math.max(leftResult.depth, rightResult.depth),
        nodeCount: 1 + leftResult.nodeCount + rightResult.nodeCount,
        errors: mergedErrors,
      };
    }

    case 'UnaryExpression': {
      const operator = node.operator;
      if (typeof operator !== 'string' || !VALID_UNARY_OPERATORS.has(operator as AstUnaryOperator)) {
        addError(errors, 'INVALID_OPERATOR', `Unary expression operator at ${path} is invalid: ${String(operator)}`, path, node);
      }

      const operand = node.argument ?? node.operand;
      const operandResult = validateAstNode(operand, `${path}.argument`);
      const mergedErrors = [...errors, ...operandResult.errors];
      return {
        depth: 1 + operandResult.depth,
        nodeCount: 1 + operandResult.nodeCount,
        errors: mergedErrors,
      };
    }

    case 'IfStatement': {
      const conditionResult = validateAstNode(node.condition, `${path}.condition`);
      const consequent = Array.isArray(node.consequent) ? node.consequent : [];
      const alternate = Array.isArray(node.alternate) ? node.alternate : [];

      const childErrors: AstValidationError[] = [...conditionResult.errors];
      let childDepth = conditionResult.depth;
      let childCount = conditionResult.nodeCount;

      for (let index = 0; index < consequent.length; index += 1) {
        const result = validateAstNode(consequent[index], `${path}.consequent[${index}]`);
        childErrors.push(...result.errors);
        childDepth = Math.max(childDepth, result.depth);
        childCount += result.nodeCount;
      }

      for (let index = 0; index < alternate.length; index += 1) {
        const result = validateAstNode(alternate[index], `${path}.alternate[${index}]`);
        childErrors.push(...result.errors);
        childDepth = Math.max(childDepth, result.depth);
        childCount += result.nodeCount;
      }

      return {
        depth: 1 + childDepth,
        nodeCount: 1 + childCount,
        errors: [...errors, ...childErrors],
      };
    }

    case 'EmitEventStatement': {
      if (typeof node.eventName !== 'string' || !EVENT_NAME_RE.test(node.eventName)) {
        addError(errors, 'INVALID_EVENT_NAME', `Event name at ${path} is invalid`, path, node);
      }

      if (!isObjectLike(node.payload)) {
        addError(errors, 'INVALID_PAYLOAD', `Event payload at ${path} must be an object`, path, node);
        return { depth: 1, nodeCount: 1, errors };
      }

      let payloadDepth = 0;
      let payloadNodeCount = 0;
      const payloadErrors: AstValidationError[] = [];

      for (const [key, value] of Object.entries(node.payload)) {
        const result = validateAstNode(value, `${path}.payload.${key}`);
        payloadErrors.push(...result.errors);
        payloadDepth = Math.max(payloadDepth, result.depth);
        payloadNodeCount += result.nodeCount;
      }

      return {
        depth: 1 + payloadDepth,
        nodeCount: 1 + payloadNodeCount,
        errors: [...errors, ...payloadErrors],
      };
    }

    case 'ReturnStatement': {
      if (node.value === undefined) {
        addError(errors, 'INVALID_RETURN', `Return statement at ${path} must contain a value`, path, node);
        return { depth: 1, nodeCount: 1, errors };
      }

      const valueResult = validateAstNode(node.value, `${path}.value`);
      return {
        depth: 1 + valueResult.depth,
        nodeCount: 1 + valueResult.nodeCount,
        errors: [...errors, ...valueResult.errors],
      };
    }

    default: {
      addError(errors, 'INVALID_NODE_TYPE', `Unsupported node type at ${path}: ${String(node.type)}`, path, node);
      return { depth: 0, nodeCount: 0, errors };
    }
  }
}

export function validateBoundedAstProgram(program: unknown): AstValidationResult {
  const errors: AstValidationError[] = [];

  if (!isObjectLike(program)) {
    return {
      valid: false,
      errors: [{ code: 'INVALID_PROGRAM', message: 'Program must be an object', node: program }],
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
  if (!Number.isInteger(rawMaxDepth) || rawMaxDepth < 1 || rawMaxDepth > 32) {
    addError(errors, 'INVALID_MAX_DEPTH', 'maxDepth must be an integer between 1 and 32', 'maxDepth', record.maxDepth);
  }

  const body = Array.isArray(record.body) ? record.body : [];
  if (!Array.isArray(record.body)) {
    addError(errors, 'INVALID_BODY', 'body must be an array of AST nodes', 'body', record.body);
  }

  let actualDepth = 0;
  let totalNodeCount = 0;

  for (let index = 0; index < body.length; index += 1) {
    const result = validateAstNode(body[index], `body[${index}]`);
    errors.push(...result.errors);
    actualDepth = Math.max(actualDepth, result.depth);
    totalNodeCount += result.nodeCount;
  }

  const maxDepthLimit = Number.isInteger(rawMaxDepth) ? rawMaxDepth : 32;
  if (actualDepth > maxDepthLimit) {
    addError(errors, 'MAX_DEPTH_EXCEEDED', `Actual AST depth ${actualDepth} exceeds maxDepth ${maxDepthLimit}`, 'maxDepth', record.maxDepth);
  }

  if (totalNodeCount > 500) {
    addError(errors, 'MAX_NODES_EXCEEDED', `AST node count ${totalNodeCount} exceeds the 500-node safety limit`, 'body', body);
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
