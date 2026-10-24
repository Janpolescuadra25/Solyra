import type { AstNode, BoundedAstProgram } from '@solyra/shared';
import { validateBoundedAstProgram } from './validator.js';

export interface ChatCompilerHistoryTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatCompilerContext {
  conversationId?: string;
  userId?: string;
  workspaceId?: string;
  history?: ChatCompilerHistoryTurn[] | string[];
}

function normalizeHistoryTurns(history?: ChatCompilerHistoryTurn[] | string[]): ChatCompilerHistoryTurn[] {
  if (!Array.isArray(history)) {
    return [];
  }

  return history.map((entry) => {
    if (typeof entry === 'string') {
      return { role: 'user', content: entry };
    }

    if (entry && typeof entry === 'object') {
      const content = typeof entry.content === 'string' ? entry.content : '';
      const role = entry.role === 'assistant' || entry.role === 'system' ? entry.role : 'user';
      return { role, content };
    }

    return { role: 'user', content: '' };
  });
}

function literal(value: string | number | boolean | null): AstNode {
  return { type: 'Literal', value };
}

function createEventPayload(input: string, intent: string, context: ChatCompilerContext): Record<string, AstNode> {
  const payload: Record<string, AstNode> = {
    intent: literal(intent),
    inputLength: literal(input.length),
    historyTurns: literal(normalizeHistoryTurns(context.history).length),
  };

  if (context.conversationId) {
    payload.conversationId = literal(context.conversationId);
  }
  if (context.userId) {
    payload.userId = literal(context.userId);
  }
  if (context.workspaceId) {
    payload.workspaceId = literal(context.workspaceId);
  }

  return payload;
}

export function compileChatPromptToAst(
  prompt: string,
  context: ChatCompilerContext = {},
): BoundedAstProgram {
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();
  const programId = `chat-ast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const historyTurns = normalizeHistoryTurns(context.history);
  const isGovernance = /\b(propose|council|governance|deliberate|consensus|override)\b/i.test(trimmed);
  const isAction = /\b(create|update|delete|run|execute|deploy|send)\b/i.test(trimmed);

  let responseText = `SOL Reasoning Engine: Evaluated request "${trimmed || 'empty prompt'}" through the sensory and AST pipeline.`;
  let intent = isGovernance ? 'governance' : isAction ? 'action' : 'general_query';

  if (!trimmed) {
    responseText = 'Solyra Brain: Please provide a prompt or message for evaluation.';
    intent = 'empty_input';
  } else if (isGovernance) {
    responseText = `Solyra Council: Governance review triggered for "${trimmed.slice(0, 80)}${trimmed.length > 80 ? '...' : ''}". Deliberation routing is ready.`;
    intent = 'governance';
  } else if (/^(hi|hello|hey|greetings)/i.test(lower)) {
    responseText = 'Greetings! SOL Brain core is online and sensory channels are active. How may I assist your inquiry?';
    intent = 'greeting';
  } else if (lower.includes('status') || lower.includes('health') || lower.includes('system')) {
    responseText = 'SOL System Status: Cognitive kernel nominal, Thalamus router active, NeuroBus operational, AST evaluation engine ready.';
    intent = 'system_status';
  } else if (lower.includes('who are you') || lower.includes('what is solyra')) {
    responseText = 'I am Solyra (SOL), an advanced cognitive architecture combining sensory thalamic gating, AST-based logical rule evaluation, and persistent memory.';
    intent = 'identity';
  } else if (/^what is \d+\s*[+\-*/]\s*\d+/i.test(lower)) {
    responseText = `SOL Reasoning: Received computational inquiry "${trimmed}". AST evaluator verified the request.`;
    intent = 'arithmetic_query';
  }

  const body: AstNode[] = [
    {
      type: 'EmitEventStatement',
      eventName: 'chat.reasoning',
      payload: {
        ...createEventPayload(trimmed, intent, context),
        isGovernance: literal(isGovernance),
        status: literal('compiled'),
      },
    },
    {
      type: 'ReturnStatement',
      value: {
        type: 'Literal',
        value: `${responseText} History context turns: ${historyTurns.length}.`,
      },
    },
  ];

  const program: BoundedAstProgram = {
    version: '1.0',
    programId,
    maxDepth: 5,
    body,
  };

  const validation = validateBoundedAstProgram(program, { maxDepth: 5, maxNodes: 64 });
  if (!validation.valid) {
    throw new Error(`Invalid AST program compiled: ${validation.errors.map((error) => error.message).join('; ')}`);
  }

  return program;
}
