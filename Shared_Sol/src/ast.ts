/**
 * Bounded JSON AST Domain-Specific Language (DSL) Specification.
 * Pure code-logic execution format for SOL brain rules.
 */

export type AstLiteral = { type: 'Literal'; value: string | number | boolean | null };

export type AstBinaryOperator =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'GREATER_THAN'
  | 'LESS_THAN'
  | 'AND'
  | 'OR'
  | 'ADD'
  | 'SUBTRACT';

export type AstUnaryOperator = 'NOT' | 'NEGATE';

export interface AstIdentifier {
  type: 'Identifier';
  name: string;
}

export interface AstBinaryExpression {
  type: 'BinaryExpression';
  operator: AstBinaryOperator;
  left: AstNode;
  right: AstNode;
}

export interface AstUnaryExpression {
  type: 'UnaryExpression';
  operator: AstUnaryOperator;
  argument: AstNode;
}

export interface AstIfStatement {
  type: 'IfStatement';
  condition: AstNode;
  consequent: AstNode[];
  alternate?: AstNode[];
}

export interface AstAssignmentStatement {
  type: 'AssignmentStatement';
  target: string;
  value: AstNode;
}

export interface AstPropertyAccess {
  type: 'PropertyAccess';
  object: AstNode;
  property: string;
}

export interface AstCallExpression {
  type: 'CallExpression';
  callee: string;
  arguments: AstNode[];
}

export interface AstEmitEventStatement {
  type: 'EmitEventStatement';
  eventName: string;
  payload: Record<string, AstNode>;
}

export interface AstReturnStatement {
  type: 'ReturnStatement';
  value: AstNode;
}

export type AstNode =
  | AstLiteral
  | AstIdentifier
  | AstBinaryExpression
  | AstUnaryExpression
  | AstIfStatement
  | AstAssignmentStatement
  | AstPropertyAccess
  | AstCallExpression
  | AstEmitEventStatement
  | AstReturnStatement;

export interface BoundedAstProgram {
  version: '1.0';
  programId: string;
  maxDepth: number;
  body: AstNode[];
}

export interface AstValidationError {
  path: string;
  code: string;
  message: string;
  nodeType?: string;
  nodeId?: string;
  node?: unknown;
}

export interface AstValidationResult {
  valid: boolean;
  errors: AstValidationError[];
  depth?: number;
  nodeCount?: number;
  rootHash?: string;
}

export interface AstExecutionDiagnostic {
  path: string;
  code: string;
  message: string;
  nodeType?: string;
  nodeId?: string;
  step?: number;
  details?: Record<string, unknown>;
}

export interface AstExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  diagnostic?: AstExecutionDiagnostic;
  stepsExecuted: number;
  events: Array<{ eventName: string; payload: unknown }>;
  executionTimeMs: number;
  durationMs?: number;
  emittedEvents?: Array<{ eventName: string; payload: unknown }>;
}
