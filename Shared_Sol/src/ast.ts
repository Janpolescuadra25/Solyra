/**
 * Bounded JSON AST Domain-Specific Language (DSL) Specification.
 * Pure code-logic execution format for SOL brain rules.
 */

export type AstLiteral =
  | { type: 'Literal'; value: string | number | boolean | null }
  | { type: 'Identifier'; name: string };

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
  | AstBinaryExpression
  | AstUnaryExpression
  | AstIfStatement
  | AstEmitEventStatement
  | AstReturnStatement;

export interface BoundedAstProgram {
  version: '1.0';
  programId: string;
  maxDepth: number;
  body: AstNode[];
}
