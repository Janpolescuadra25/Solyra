import * as http from 'node:http';
import { randomUUID } from 'node:crypto';
import { log } from './logger.js';
import { globalBus } from './neurobus/index.js';
import { globalBrainstem } from './brainstem/index.js';
import { globalHomeostasis } from './homeostasis/index.js';
import { globalThalamus } from './thalamus/index.js';
import { globalCouncil } from './council/index.js';
import { globalBrainLoader } from './brain/index.js';
import { compileChatPromptToAst } from './ast/chat-compiler.js';
import { evaluateAstProgram, evaluateStreamingAstProgram, validateBoundedAstProgram } from './ast/index.js';
import { LRUCache } from './persistence/cache/lru-cache.js';
import { TieredMemoryRepository } from './persistence/cache/tiered-memory.repository.js';
import { getPgPool, checkPostgresHealth, createPostgresPersistence } from './persistence/postgres/index.js';
import { ArousalLevel, CouncilMemberRole, SystemPriority, type HealthStatus, type MemoryRecord, type OrganizationMember, type ReadinessStatus } from '@solyra/shared';
import { CouncilEngine } from './council/engine.js';
import { AuthService } from './auth/service.js';
import { authenticateRequest, RateLimiter, requireOrgRole } from './auth/middleware.js';
import { startRetentionPolicyCleaner } from './persistence/retention-cleaner.js';

const PORT = parseInt(process.env.BACKEND_PORT || '4000', 10);
const startTime = Date.now();
globalThalamus.registerRoute('chat.*', SystemPriority.USER, ArousalLevel.ALERT);
const postgresBundle = createPostgresPersistence(getPgPool());
const tieredMemoryRepo = postgresBundle
  ? new TieredMemoryRepository({ primaryRepository: postgresBundle.memory, cache: new LRUCache<string, MemoryRecord>() })
  : undefined;
const authService = new AuthService(postgresBundle, getPgPool());
const authRateLimiter = new RateLimiter(15 * 60 * 1000, 10);
const loginRateLimiter = new RateLimiter(15 * 60 * 1000, 5);
const forgotPasswordRateLimiter = new RateLimiter(15 * 60 * 1000, 3);
const resetPasswordRateLimiter = new RateLimiter(15 * 60 * 1000, 5);
const chatRateLimiter = new RateLimiter(60 * 1000, 120);
const retentionCleaner = startRetentionPolicyCleaner(postgresBundle.chat);
const councilEngine = new CouncilEngine();
const userLastCouncilProposalTime = new Map<string, number>();
const COUNCIL_PROPOSAL_COOLDOWN_MS = 5 * 60 * 1000;
const adminRateLimits = new Map<string, { count: number; resetAt: number }>();
let drainTimer: NodeJS.Timeout | null = null;
let astStats = {
  validationsCount: 0,
  validCount: 0,
  invalidCount: 0,
  lastValidationTimestamp: null as number | null,
  executionsCount: 0,
  failedExecutionsCount: 0,
  lastExecutionTimestamp: null as number | null,
  totalDurationMs: 0,
};

function normalizeRequestPath(requestUrl: string | undefined): string {
  if (!requestUrl) return '/';
  try {
    return new URL(requestUrl, 'http://localhost').pathname;
  } catch {
    return requestUrl.split('?')[0] || '/';
  }
}

function sendJsonResponse(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function authenticateProtectedRequest(req: http.IncomingMessage): boolean {
  const configuredToken = process.env.SOLYRA_AUTH_TOKEN;
  if (!configuredToken || configuredToken.trim() === '') {
    return false;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return false;
  }

  const rawHeader = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!rawHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = rawHeader.slice(7).trim();
  return token === configuredToken.trim();
}

function validateOrigin(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const originHeader = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin;
  if (!originHeader) {
    return true;
  }

  try {
    const parsed = new URL(originHeader);
    const allowedHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0']);
    if (allowedHosts.has(parsed.hostname)) {
      return true;
    }

    const allowedOrigins = new Set([
      process.env.FRONTEND_URL,
      'http://localhost:5173',
      'http://localhost:3000',
      'https://localhost:5173',
      'https://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000',
      'https://127.0.0.1:5173',
      'https://127.0.0.1:3000',
    ].filter((value): value is string => typeof value === 'string' && value.length > 0));

    if (allowedOrigins.has(parsed.origin)) {
      return true;
    }

    sendJsonResponse(res, 403, { error: 'Forbidden: invalid origin' });
    return false;
  } catch {
    sendJsonResponse(res, 403, { error: 'Forbidden: invalid origin' });
    return false;
  }
}

async function readJsonRequest(req: http.IncomingMessage, maxBytes = 1024 * 1024): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    req.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;
      if (totalBytes > maxBytes) {
        reject(new Error('Request body exceeds 1MB limit'));
        req.destroy();
        return;
      }
      chunks.push(buffer);
    });

    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      if (!rawBody.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch (error) {
        reject(new Error('Invalid JSON payload'));
      }
    });

    req.on('error', reject);
  });
}

export function startQueueConsumer(intervalMs: number = 50, batchSize: number = 100): void {
  if (drainTimer) return;

  drainTimer = setInterval(() => {
    try {
      globalBus.drain(batchSize);
    } catch (err) {
      console.error('[NeuroBus Consumer] Error draining queue:', err);
    }
  }, intervalMs);

  if (drainTimer.unref) {
    drainTimer.unref();
  }
}

export function stopQueueConsumer(): void {
  if (drainTimer) {
    clearInterval(drainTimer);
    drainTimer = null;
  }
}

globalBrainstem.boot()
  .then(() => {
    startQueueConsumer(50, 100);
  })
  .catch((err) => {
    log('error', 'Failed to boot Brainstem', { error: String(err) });
  });

const shutdownServer = (): void => {
  stopQueueConsumer();
  retentionCleaner.stop();
  if (server.listening) {
    server.close();
  }
};

process.on('SIGTERM', shutdownServer);
process.on('SIGINT', shutdownServer);

function isValidAdminMutationRequest(req: http.IncomingMessage): boolean {
  const origin = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin;
  const referer = Array.isArray(req.headers.referer) ? req.headers.referer[0] : req.headers.referer;
  const requestedWith = Array.isArray(req.headers['x-requested-with'])
    ? req.headers['x-requested-with'][0]
    : req.headers['x-requested-with'];
  const adminHeader = Array.isArray(req.headers['x-solyra-admin'])
    ? req.headers['x-solyra-admin'][0]
    : req.headers['x-solyra-admin'];

  if (requestedWith === 'XMLHttpRequest' || adminHeader === 'true') {
    return true;
  }

  const allowedOrigins = new Set([
    process.env.FRONTEND_URL,
    'http://localhost:5173',
    'http://localhost:3000',
    'https://localhost:5173',
    'https://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
    'https://127.0.0.1:5173',
    'https://127.0.0.1:3000',
  ].filter((value): value is string => typeof value === 'string' && value.length > 0));

  const candidateHeaders = [origin, referer].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  if (candidateHeaders.length === 0) {
    return false;
  }

  for (const candidate of candidateHeaders) {
    try {
      const parsed = new URL(candidate);
      const allowedHostnames = new Set(['localhost', '127.0.0.1', '0.0.0.0']);
      if (allowedOrigins.has(parsed.origin) || allowedHostnames.has(parsed.hostname)) {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

function enforceAdminMutationGuard(req: http.IncomingMessage, res: http.ServerResponse, requestPath: string): boolean {
  const method = (req.method || 'GET').toUpperCase();
  if (!['POST', 'PUT', 'DELETE'].includes(method)) {
    return true;
  }

  if (!requestPath.startsWith('/api/admin/') && !requestPath.startsWith('/brain/')) {
    return true;
  }

  const key = `${req.socket.remoteAddress || 'unknown'}:${requestPath}`;
  const now = Date.now();
  const entry = adminRateLimits.get(key);

  if (entry && entry.resetAt <= now) {
    adminRateLimits.delete(key);
  }

  const activeEntry = adminRateLimits.get(key);
  if (activeEntry && activeEntry.count >= 60) {
    sendJsonResponse(res, 429, {
      success: false,
      error: 'Admin rate limit exceeded. Try again in 60 seconds.',
    });
    return false;
  }

  if (!isValidAdminMutationRequest(req)) {
    sendJsonResponse(res, 403, {
      error: 'Forbidden',
      message: 'Invalid request origin',
    });
    return false;
  }

  if (activeEntry) {
    activeEntry.count += 1;
  } else {
    adminRateLimits.set(key, { count: 1, resetAt: now + 60 * 1000 });
  }

  return true;
}

export async function requireOwnerAuth(req: any, res: any, bundle: any): Promise<boolean> {
  try {
    const authed = await authenticateRequest(req, res, bundle);
    if (!authed || !req.user) {
      return false;
    }

    const user = await bundle.users.findById(req.user.sub);
    if (!user || !user.isActive) {
      sendJsonResponse(res, 401, { error: 'Unauthorized', message: 'Authentication required' });
      return false;
    }

    if (user.role !== 'owner' && user.role !== 'admin') {
      sendJsonResponse(res, 403, { error: 'Forbidden', message: 'Owner or admin privilege required' });
      return false;
    }

    req.user = {
      ...req.user,
      role: user.role,
    };

    return true;
  } catch {
    sendJsonResponse(res, 401, { error: 'Unauthorized', message: 'Authentication required' });
    return false;
  }
}
const server = http.createServer(async (req, res) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url || '/';
  const method = req.method || 'GET';
  const requestPath = normalizeRequestPath(url);

  if (requestPath.startsWith('/api/chat')) {
    const pathParts = requestPath.split('/').filter(Boolean);
    console.log('[DEBUG_CHAT_ROUTE]', method, requestPath, JSON.stringify(pathParts), req.headers.authorization ? 'auth-present' : 'auth-missing');
    const chatRateKey = req.socket.remoteAddress || 'unknown';
    const chatLimit = chatRateLimiter.check(chatRateKey);
    if (!chatLimit.allowed) {
      sendJsonResponse(res, 429, {
        success: false,
        error: 'Too many chat requests. Please slow down and try again shortly.',
        retryAfterSeconds: chatLimit.retryAfterSeconds,
      });
      return;
    }

    if (req.method === 'GET' && pathParts.length === 3 && pathParts[0] === 'api' && pathParts[1] === 'chat' && pathParts[2] === 'conversations') {
      const authenticated = await authenticateRequest(req, res, postgresBundle);
      if (!authenticated || !req.user || !req.session) {
        return;
      }

      if (!req.session.workspaceId || !req.session.userId) {
        sendJsonResponse(res, 401, { success: false, error: 'Unauthorized: missing session workspace or user identity' });
        return;
      }

      try {
        const includeArchived = new URL(req.url ?? '', 'http://localhost').searchParams.get('includeArchived') === 'true';
        const conversations = await postgresBundle.chat.listConversations(req.session.workspaceId, req.session.userId, includeArchived);
        const filtered = includeArchived ? conversations : conversations.filter((conversation) => (conversation.archiveState ?? 'active') === 'active');
        sendJsonResponse(res, 200, { success: true, conversations: filtered });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to list conversations';
        sendJsonResponse(res, 500, { success: false, error: message });
        return;
      }
    }

    if (req.method === 'POST' && pathParts.length === 3 && pathParts[0] === 'api' && pathParts[1] === 'chat' && pathParts[2] === 'conversations') {
      const authenticated = await authenticateRequest(req, res, postgresBundle);
      if (!authenticated || !req.user || !req.session) {
        return;
      }

      if (!req.session.workspaceId || !req.session.userId) {
        sendJsonResponse(res, 401, { success: false, error: 'Unauthorized: missing session workspace or user identity' });
        return;
      }

      try {
        const body = await readJsonRequest(req, 1024 * 1024);
        const title = isRecord(body) && typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'New Conversation';
        const modelIdentifier = isRecord(body) && typeof body.modelIdentifier === 'string' && body.modelIdentifier.trim() ? body.modelIdentifier.trim() : 'solyra-default';
        const systemPromptOverride = isRecord(body) && typeof body.systemPromptOverride === 'string' ? body.systemPromptOverride : undefined;

        const conversation = await postgresBundle.chat.createConversation({
          id: randomUUID(),
          workspaceId: req.session.workspaceId,
          userId: req.session.userId,
          title,
          modelIdentifier,
          systemPromptOverride,
          messageCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        sendJsonResponse(res, 201, { success: true, conversation });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create conversation';
        sendJsonResponse(res, 500, { success: false, error: message });
        return;
      }
    }

  if (req.method === 'POST' && pathParts.length === 5 && pathParts[0] === 'api' && pathParts[1] === 'chat' && pathParts[2] === 'conversations' && (pathParts[4] === 'archive' || pathParts[4] === 'restore' || pathParts[4] === 'soft-delete' || pathParts[4] === 'set-retention')) {
      const conversationId = pathParts[3];
      const action = pathParts[4];
      const authenticated = await authenticateRequest(req, res, postgresBundle);
      if (!authenticated || !req.user || !req.session) {
        return;
      }

      if (!req.session.workspaceId || !req.session.userId) {
        sendJsonResponse(res, 401, { success: false, error: 'Unauthorized: missing session workspace or user identity' });
        return;
      }

      try {
        const conversation = await postgresBundle.chat.getConversation(conversationId);
        if (!conversation) {
          sendJsonResponse(res, 404, { success: false, error: 'Conversation not found' });
          return;
        }
        if (conversation.workspaceId !== req.session.workspaceId) {
          sendJsonResponse(res, 404, { success: false, error: 'Conversation not found' });
          return;
        }
        if (conversation.userId !== req.session.userId) {
          sendJsonResponse(res, 403, { success: false, error: 'Forbidden' });
          return;
        }

        let updated;
        switch (action) {
          case 'archive':
            updated = await postgresBundle.chat.archiveConversation(conversationId, req.session.workspaceId);
            sendJsonResponse(res, 200, { success: true, conversation: updated ? await postgresBundle.chat.getConversation(conversationId) : null });
            return;
          case 'restore':
            updated = await postgresBundle.chat.restoreConversation(conversationId, req.session.workspaceId);
            sendJsonResponse(res, 200, { success: true, conversation: updated ? await postgresBundle.chat.getConversation(conversationId) : null });
            return;
          case 'soft-delete':
            updated = await postgresBundle.chat.softDeleteConversation(conversationId, req.session.workspaceId);
            sendJsonResponse(res, 200, { success: true, conversation: updated ? await postgresBundle.chat.getConversation(conversationId) : null });
            return;
          case 'set-retention': {
            const body = await readJsonRequest(req, 1024 * 1024);
            const expiresDate = isRecord(body) && typeof body.retentionExpiresAt === 'string' && body.retentionExpiresAt
              ? new Date(body.retentionExpiresAt)
              : isRecord(body) && body.retentionExpiresAt === null
                ? null
                : null;
            updated = await postgresBundle.chat.setRetentionExpiry(conversationId, req.session.workspaceId, expiresDate);
            sendJsonResponse(res, 200, { success: true, conversation: updated ? await postgresBundle.chat.getConversation(conversationId) : null });
            return;
          }
          default:
            sendJsonResponse(res, 404, { success: false, error: 'Not found' });
            return;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update conversation';
        sendJsonResponse(res, 500, { success: false, error: message });
        return;
      }
    }

    if (req.method === 'GET' && pathParts.length === 5 && pathParts[0] === 'api' && pathParts[1] === 'chat' && pathParts[2] === 'conversations' && pathParts[4] === 'messages') {
      const conversationId = pathParts[3];
      const authenticated = await authenticateRequest(req, res, postgresBundle);
      if (!authenticated || !req.user || !req.session) {
        return;
      }

      if (!req.session.workspaceId || !req.session.userId) {
        sendJsonResponse(res, 401, { success: false, error: 'Unauthorized: missing session workspace or user identity' });
        return;
      }

      try {
        const conversation = await postgresBundle.chat.getConversation(conversationId);
        if (!conversation) {
          sendJsonResponse(res, 404, { success: false, error: 'Conversation not found' });
          return;
        }
        if (conversation.workspaceId !== req.session.workspaceId) {
          sendJsonResponse(res, 404, { success: false, error: 'Conversation not found' });
          return;
        }
        if (conversation.userId !== req.session.userId) {
          sendJsonResponse(res, 403, { success: false, error: 'Forbidden: you do not own this conversation' });
          return;
        }

        const messages = await postgresBundle.chat.getMessages(conversationId);
        sendJsonResponse(res, 200, { success: true, messages });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to retrieve messages';
        sendJsonResponse(res, 500, { success: false, error: message });
        return;
      }
    }

    if (req.method === 'GET' && pathParts.length === 5 && pathParts[0] === 'api' && pathParts[1] === 'chat' && pathParts[2] === 'conversations' && pathParts[4] === 'stream') {
      const conversationId = pathParts[3];
      const authenticated = await authenticateRequest(req, res, postgresBundle);
      if (!authenticated || !req.user || !req.session) {
        return;
      }

      if (!req.session.workspaceId || !req.session.userId) {
        sendJsonResponse(res, 401, { success: false, error: 'Unauthorized: missing session workspace or user identity' });
        return;
      }

      try {
        const conversation = await postgresBundle.chat.getConversation(conversationId);
        if (!conversation) {
          sendJsonResponse(res, 404, { success: false, error: 'Conversation not found' });
          return;
        }
        if (conversation.workspaceId !== req.session.workspaceId || conversation.userId !== req.session.userId) {
          sendJsonResponse(res, 403, { success: false, error: 'Forbidden: access denied' });
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        res.write(`data: ${JSON.stringify({ type: 'handshake', conversationId })}\n\n`);

        const abortController = new AbortController();
        req.on('close', () => {
          abortController.abort();
          res.end();
        });

        let previousMessages: any[] = [];
        try {
          const msgs = await postgresBundle.chat.getMessages(conversationId);
          if (Array.isArray(msgs)) {
            previousMessages = msgs;
          }
        } catch {
          previousMessages = [];
        }

        const lastUserMsg = [...previousMessages].reverse().find((message: any) => message?.role === 'user');
        const promptText = typeof lastUserMsg?.content === 'string' && lastUserMsg.content.trim() ? lastUserMsg.content.trim() : 'Hello';
        const historyTurns: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = previousMessages.slice(-10).map((message: any) => ({
          role: message?.role === 'assistant' ? 'assistant' : message?.role === 'system' ? 'system' : 'user',
          content: typeof message?.content === 'string' ? message.content : '',
        }));

        const astProgram = compileChatPromptToAst(promptText, {
          conversationId,
          userId: req.session.userId,
          workspaceId: req.session.workspaceId,
          history: historyTurns,
        });

        await evaluateStreamingAstProgram(
          astProgram,
          {
            userId: req.session.userId,
            conversationId,
            workspaceId: req.session.workspaceId,
          },
          {
            maxSteps: 1000,
            timeoutMs: 30000,
            onEmitEvent: (eventName, payload) => {
              if (!abortController.signal.aborted && !res.writableEnded) {
                res.write(`data: ${JSON.stringify({ type: 'ast_event', eventName, payload })}\n\n`);
              }
            },
          },
        );

        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ type: 'complete', conversationId })}\n\n`);
          res.end();
        }
        return;
      } catch (streamError) {
        const message = streamError instanceof Error ? streamError.message : 'Streaming failed';
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
          res.end();
        }
        return;
      }
    }

    if (req.method === 'POST' && pathParts.length === 5 && pathParts[0] === 'api' && pathParts[1] === 'chat' && pathParts[2] === 'conversations' && pathParts[4] === 'messages') {
      const conversationId = pathParts[3];
      const authenticated = await authenticateRequest(req, res, postgresBundle);
      if (!authenticated || !req.user || !req.session) {
        return;
      }

      if (!req.session.workspaceId || !req.session.userId) {
        sendJsonResponse(res, 401, { success: false, error: 'Unauthorized: missing session workspace or user identity' });
        return;
      }

      try {
        const conversation = await postgresBundle.chat.getConversation(conversationId);
        if (!conversation) {
          sendJsonResponse(res, 404, { success: false, error: 'Conversation not found' });
          return;
        }
        if (conversation.workspaceId !== req.session.workspaceId) {
          sendJsonResponse(res, 404, { success: false, error: 'Conversation not found' });
          return;
        }
        if (conversation.userId !== req.session.userId) {
          sendJsonResponse(res, 403, { success: false, error: 'Forbidden: you do not own this conversation' });
          return;
        }

        const body = await readJsonRequest(req, 1024 * 1024);
        if (!isRecord(body) || typeof body.content !== 'string' || body.content.trim() === '') {
          sendJsonResponse(res, 400, { success: false, error: 'Message content is required' });
          return;
        }

        const trimmedContent = body.content.trim();
        const routeDecision = globalThalamus.routeInput({
          channel: 'chat.user',
          source: 'member-client',
          payload: {
            conversationId,
            userId: req.session.userId,
            contentLength: trimmedContent.length,
          },
        });

        if (!routeDecision.decision.accepted) {
          sendJsonResponse(res, 429, {
            success: false,
            error: 'Thalamus rejected the chat input',
            reason: routeDecision.decision.reason ?? 'Route suppressed',
          });
          return;
        }

        let previousMessages: any[] = [];
        try {
          const msgs = await postgresBundle.chat.getMessages(conversationId);
          if (Array.isArray(msgs)) {
            previousMessages = msgs;
          }
        } catch (err) {
          console.warn('[Chat] Failed to retrieve history messages, falling back to empty context:', err);
          previousMessages = [];
        }

        const historyTurns: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = previousMessages.slice(-10).map((message: any) => ({
          role: message?.role === 'assistant' ? 'assistant' : message?.role === 'system' ? 'system' : 'user',
          content: typeof message?.content === 'string' ? message.content : '',
        }));

        const astProgram = compileChatPromptToAst(trimmedContent, {
          conversationId,
          userId: req.session.userId,
          workspaceId: req.session.workspaceId,
          history: historyTurns,
        });

        const isCouncilTrigger = /\b(propose|council|governance|deliberate|consensus)\b/i.test(trimmedContent);
        let councilProposalId: string | null = null;
        if (isCouncilTrigger) {
          const now = Date.now();
          const lastTime = userLastCouncilProposalTime.get(req.session.userId) ?? 0;
          if (now - lastTime >= COUNCIL_PROPOSAL_COOLDOWN_MS) {
            try {
              const sanitizedPrompt = trimmedContent.replace(/[<>]/g, '').trim();
              const proposalId = randomUUID();
              councilEngine.createDeliberationProposal(
                proposalId,
                `Chat Query: ${sanitizedPrompt.substring(0, 40)}`,
                sanitizedPrompt.substring(0, 500),
                CouncilMemberRole.ORACLE,
              );
              councilProposalId = proposalId;
              userLastCouncilProposalTime.set(req.session.userId, now);
            } catch (councilError) {
              console.error('[Chat] Council deliberation creation failed:', councilError);
            }
          } else {
            console.info(`[Chat] Council proposal rate-limited for user ${req.session.userId}`);
          }
        }

        const execResult = evaluateAstProgram(astProgram, {
          user: { id: req.session.userId, username: req.user.sub || req.session.userId },
          timestamp: Date.now(),
        });

        if (!execResult.success) {
          sendJsonResponse(res, 400, {
            success: false,
            error: 'AST evaluation failed',
            details: execResult.error ?? 'Evaluation failed',
            diagnostic: execResult.diagnostic,
          });
          return;
        }

        const rawReplyText = typeof execResult.result === 'string'
          ? execResult.result
          : `SOL Brain: Evaluation completed with structured result for "${trimmedContent}".`;

        const assistantReplyText = rawReplyText.startsWith('Solyra Assistant:')
          ? rawReplyText
          : `Solyra Assistant: ${rawReplyText}`;

        const userMessage = await postgresBundle.chat.appendMessage({
          id: randomUUID(),
          conversationId,
          senderId: req.session.userId,
          role: 'user',
          content: trimmedContent,
          metadata: { source: 'member-client', timestamp: new Date().toISOString() },
          createdAt: new Date(),
        });

        const assistantMessage = await postgresBundle.chat.appendMessage({
          id: randomUUID(),
          conversationId,
          senderId: 'solyra-assistant',
          role: 'assistant',
          content: assistantReplyText,
          metadata: {
            source: 'solyra-ast-brain',
            programId: astProgram.programId,
            stepsExecuted: execResult.stepsExecuted,
            executionTimeMs: execResult.executionTimeMs,
            success: execResult.success,
            councilProposalId,
            timestamp: new Date().toISOString(),
          },
          createdAt: new Date(),
        });

        sendJsonResponse(res, 201, {
          success: true,
          userMessage,
          assistantMessage,
          councilProposalId,
          execution: {
            programId: astProgram.programId,
            stepsExecuted: execResult.stepsExecuted,
            executionTimeMs: execResult.executionTimeMs,
            success: execResult.success,
          },
          messages: [userMessage, assistantMessage],
        });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to append message';
        sendJsonResponse(res, 500, { success: false, error: message });
        return;
      }
    }

    if (req.method === 'DELETE' && pathParts.length === 4 && pathParts[0] === 'api' && pathParts[1] === 'chat' && pathParts[2] === 'conversations') {
      const conversationId = pathParts[3];
      const authenticated = await authenticateRequest(req, res, postgresBundle);
      if (!authenticated || !req.user || !req.session) {
        return;
      }

      if (!req.session.workspaceId || !req.session.userId) {
        sendJsonResponse(res, 401, { success: false, error: 'Unauthorized: missing session workspace or user identity' });
        return;
      }

      try {
        const conversation = await postgresBundle.chat.getConversation(conversationId);
        if (!conversation) {
          sendJsonResponse(res, 404, { success: false, error: 'Conversation not found' });
          return;
        }
        if (conversation.workspaceId !== req.session.workspaceId) {
          sendJsonResponse(res, 404, { success: false, error: 'Conversation not found' });
          return;
        }
        if (conversation.userId !== req.session.userId) {
          sendJsonResponse(res, 403, { success: false, error: 'Forbidden: you do not own this conversation' });
          return;
        }

        const deleted = await postgresBundle.chat.deleteConversation(conversationId, req.session.workspaceId);
        sendJsonResponse(res, 200, { success: true, deleted });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete conversation';
        sendJsonResponse(res, 500, { success: false, error: message });
        return;
      }
    }

    sendJsonResponse(res, 404, { success: false, error: 'Chat route not found' });
    return;
  }

  if (requestPath.startsWith('/api/admin/')) {
    const isOwner = await requireOwnerAuth(req, res, postgresBundle);
    if (!isOwner) return;

    const pathParts = requestPath.split('/').filter(Boolean);

    if (req.method === 'GET' && pathParts.length === 3 && pathParts[0] === 'api' && pathParts[1] === 'admin' && pathParts[2] === 'users') {
      try {
        const users = await postgresBundle.users.list();
        const payload = users.map((user) => {
          const { passwordHash, password_hash, ...safeUser } = user as typeof user & { password_hash?: string; passwordHash?: string };
          return {
            ...safeUser,
            id: user.id,
            email: user.email,
            name: user.fullName,
            role: user.role === 'member' ? 'user' : user.role ?? 'user',
            status: user.isActive ? 'active' : 'suspended',
            createdAt: user.createdAt,
          };
        });
        sendJsonResponse(res, 200, { success: true, users: payload });
        return;
      } catch (error) {
        sendJsonResponse(res, 500, { success: false, error: error instanceof Error ? error.message : 'Failed to load users' });
        return;
      }
    }

    if (req.method === 'PUT' && pathParts.length === 5 && pathParts[0] === 'api' && pathParts[1] === 'admin' && pathParts[2] === 'users' && pathParts[4] === 'role') {
      if (!enforceAdminMutationGuard(req, res, requestPath)) return;
      try {
        const targetId = pathParts[3];
        const body = await readJsonRequest(req, 1024 * 1024);
        const nextRole = typeof body === 'object' && body && 'role' in body ? String((body as Record<string, unknown>).role ?? '').trim() : '';
        const normalizedRole = nextRole === 'member' ? 'user' : nextRole;
        const validRoles = new Set(['owner', 'admin', 'user']);

        if (!validRoles.has(normalizedRole)) {
          sendJsonResponse(res, 400, { success: false, error: 'Role must be one of: owner, admin, user' });
          return;
        }

        const targetUser = await postgresBundle.users.findById(targetId);
        if (!targetUser) {
          sendJsonResponse(res, 404, { success: false, error: 'User not found' });
          return;
        }

        if (targetUser.role === 'owner' && normalizedRole !== 'owner') {
          const countResult = await postgresBundle.pool.query(
            `SELECT COUNT(*)::int AS active_owner_count FROM users WHERE role = 'owner' AND is_active = TRUE`,
            []
          );
          const activeOwnerCount = Number(countResult.rows[0]?.active_owner_count ?? 0);
          if (activeOwnerCount <= 1) {
            sendJsonResponse(res, 400, { success: false, error: 'Cannot demote the last active owner' });
            return;
          }
        }

        const updatedUser = await postgresBundle.users.update(targetId, {
          ...targetUser,
          role: normalizedRole,
          updatedAt: new Date(),
        });

        if (normalizedRole === 'user' && targetUser.role !== 'user') {
          await postgresBundle.sessions.revokeAllUserSessions(targetId, 'Role demoted by administrator');
        }

        await postgresBundle.audit.recordEvent({
          eventType: 'admin.user_role_updated',
          userId: req.user?.sub ?? targetUser.id,
          workspaceId: null,
          details: {
            targetUserId: targetId,
            previousRole: targetUser.role,
            newRole: normalizedRole,
            actorId: req.user?.sub ?? null,
          },
          ipAddress: typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : undefined,
          userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
        });

        sendJsonResponse(res, 200, { success: true, user: updatedUser });
        return;
      } catch (error) {
        sendJsonResponse(res, 500, { success: false, error: error instanceof Error ? error.message : 'Failed to update user role' });
        return;
      }
    }

    if (req.method === 'PUT' && pathParts.length === 5 && pathParts[0] === 'api' && pathParts[1] === 'admin' && pathParts[2] === 'users' && pathParts[4] === 'status') {
      if (!enforceAdminMutationGuard(req, res, requestPath)) return;
      try {
        const targetId = pathParts[3];
        const body = await readJsonRequest(req, 1024 * 1024);
        const nextStatus = typeof body === 'object' && body && 'status' in body ? String((body as Record<string, unknown>).status ?? '').trim() : '';
        const validStatuses = new Set(['active', 'suspended', 'deactivated']);

        if (!validStatuses.has(nextStatus)) {
          sendJsonResponse(res, 400, { success: false, error: 'Status must be one of: active, suspended, deactivated' });
          return;
        }

        const targetUser = await postgresBundle.users.findById(targetId);
        if (!targetUser) {
          sendJsonResponse(res, 404, { success: false, error: 'User not found' });
          return;
        }

        if (targetUser.role === 'owner' && nextStatus !== 'active') {
          const countResult = await postgresBundle.pool.query(
            `SELECT COUNT(*)::int AS active_owner_count FROM users WHERE role = 'owner' AND is_active = TRUE`,
            []
          );
          const activeOwnerCount = Number(countResult.rows[0]?.active_owner_count ?? 0);
          if (activeOwnerCount <= 1) {
            sendJsonResponse(res, 400, { success: false, error: 'Cannot deactivate the last active owner' });
            return;
          }
        }

        const updatedUser = await postgresBundle.users.update(targetId, {
          ...targetUser,
          isActive: nextStatus === 'active',
          updatedAt: new Date(),
        });

        if (nextStatus !== 'active') {
          await postgresBundle.sessions.revokeAllUserSessions(targetId, 'Role demoted by administrator');
        }

        await postgresBundle.audit.recordEvent({
          eventType: 'admin.user_status_updated',
          userId: req.user?.sub ?? targetUser.id,
          workspaceId: null,
          details: {
            targetUserId: targetId,
            previousStatus: targetUser.isActive ? 'active' : 'suspended',
            newStatus: nextStatus,
            actorId: req.user?.sub ?? null,
          },
          ipAddress: typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : undefined,
          userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
        });

        sendJsonResponse(res, 200, { success: true, user: updatedUser });
        return;
      } catch (error) {
        sendJsonResponse(res, 500, { success: false, error: error instanceof Error ? error.message : 'Failed to update user status' });
        return;
      }
    }

    if (req.method === 'GET' && pathParts.length === 4 && pathParts[0] === 'api' && pathParts[1] === 'admin' && pathParts[2] === 'sessions' && pathParts[3] === 'active') {
      try {
        const sessions = await postgresBundle.sessions.listActiveSessions(100);
        sendJsonResponse(res, 200, {
          success: true,
          sessions: sessions.map((session) => ({
            id: session.id,
            userId: session.userId,
            workspaceId: session.workspaceId,
            expiresAt: session.expiresAt,
            createdAt: session.createdAt,
            ipAddress: session.ipAddress,
            userAgent: session.userAgent,
          })),
        });
        return;
      } catch (error) {
        sendJsonResponse(res, 500, { success: false, error: error instanceof Error ? error.message : 'Failed to list active sessions' });
        return;
      }
    }

    if (req.method === 'POST' && pathParts.length === 5 && pathParts[0] === 'api' && pathParts[1] === 'admin' && pathParts[2] === 'sessions' && pathParts[4] === 'revoke') {
      if (!enforceAdminMutationGuard(req, res, requestPath)) return;
      try {
        const sessionId = pathParts[3];
        const body = await readJsonRequest(req, 1024 * 1024);
        const reason = isRecord(body) && typeof body.reason === 'string' && body.reason.trim().length > 0 ? body.reason.trim() : 'Revoked by administrator';
        const revoked = await postgresBundle.sessions.revokeSession(sessionId, reason);
        if (!revoked) {
          sendJsonResponse(res, 404, { success: false, error: 'Session not found or already revoked' });
          return;
        }

        await postgresBundle.audit.recordEvent({
          eventType: 'SESSION_REVOKED',
          userId: req.user?.sub ?? undefined,
          workspaceId: null,
          details: {
            action: 'session.revoked',
            targetId: sessionId,
            reason,
            actorId: req.user?.sub ?? null,
          },
          ipAddress: typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : undefined,
          userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
        });

        sendJsonResponse(res, 200, { success: true, sessionId, message: 'Session revoked successfully' });
        return;
      } catch (error) {
        sendJsonResponse(res, 500, { success: false, error: error instanceof Error ? error.message : 'Failed to revoke session' });
        return;
      }
    }

    if (req.method === 'DELETE' && pathParts.length === 4 && pathParts[0] === 'api' && pathParts[1] === 'admin' && pathParts[2] === 'sessions' && pathParts[3]) {
      if (!enforceAdminMutationGuard(req, res, requestPath)) return;
      try {
        const sessionId = pathParts[3];
        const revoked = await postgresBundle.sessions.revokeSession(sessionId, 'owner_revocation');
        if (!revoked) {
          sendJsonResponse(res, 404, { success: false, error: 'Session not found or already revoked' });
          return;
        }

        await postgresBundle.audit.recordEvent({
          eventType: 'admin.session_revoked',
          userId: req.user?.sub ?? undefined,
          workspaceId: null,
          details: {
            sessionId,
            reason: 'owner_revocation',
            actorId: req.user?.sub ?? null,
          },
          ipAddress: typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : undefined,
          userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
        });

        sendJsonResponse(res, 200, { success: true, revoked: true, sessionId });
        return;
      } catch (error) {
        sendJsonResponse(res, 500, { success: false, error: error instanceof Error ? error.message : 'Failed to revoke session' });
        return;
      }
    }

    if (req.method === 'DELETE' && pathParts.length === 5 && pathParts[0] === 'api' && pathParts[1] === 'admin' && pathParts[2] === 'users' && pathParts[4] === 'sessions') {
      if (!enforceAdminMutationGuard(req, res, requestPath)) return;
      try {
        const userId = pathParts[3];
        await postgresBundle.sessions.revokeAllUserSessions(userId);
        await postgresBundle.audit.recordEvent({
          eventType: 'admin.user_sessions_revoked',
          userId: req.user?.sub ?? undefined,
          workspaceId: null,
          details: {
            targetUserId: userId,
            reason: 'owner_bulk_revocation',
            actorId: req.user?.sub ?? null,
          },
          ipAddress: typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : undefined,
          userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
        });
        sendJsonResponse(res, 200, { success: true, revoked: true, userId });
        return;
      } catch (error) {
        sendJsonResponse(res, 500, { success: false, error: error instanceof Error ? error.message : 'Failed to revoke sessions' });
        return;
      }
    }

    if (req.method === 'GET' && pathParts.length === 4 && pathParts[0] === 'api' && pathParts[1] === 'admin' && pathParts[2] === 'audit' && pathParts[3] === 'recent') {
      try {
        const parsedUrl = new URL(requestPath, 'http://localhost');
        const limit = Number(parsedUrl.searchParams.get('limit') ?? '50');
        const events = await postgresBundle.audit.listRecentEvents(Number.isFinite(limit) ? limit : 50);
        sendJsonResponse(res, 200, { success: true, events });
        return;
      } catch (error) {
        sendJsonResponse(res, 500, { success: false, error: error instanceof Error ? error.message : 'Failed to read audit stream' });
        return;
      }
    }

    sendJsonResponse(res, 404, { success: false, error: 'Admin route not found' });
    return;
  }

  if (req.method === 'GET' && requestPath === '/thalamus/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', data: globalThalamus.getRoutingStats() }));
    return;
  }

  if (req.method === 'GET' && requestPath === '/council/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(globalCouncil.getCouncilStats()));
    return;
  }

  if (req.method === 'GET' && requestPath === '/brain/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(globalBrainLoader.getLoaderStats()));
    return;
  }

  if (req.method === 'POST' && requestPath === '/brain/load') {
      const isOwner = await requireOwnerAuth(req, res, postgresBundle);
      if (!isOwner) return;
    if (!enforceAdminMutationGuard(req, res, requestPath)) return;

    try {
      const rawBody = await readJsonRequest(req, 1024 * 1024);
      if (!isRecord(rawBody) || !isRecord(rawBody.manifest)) {
        sendJsonResponse(res, 400, { success: false, error: 'Manifest payload is required' });
        return;
      }

      const manifest = rawBody.manifest as Record<string, unknown>;
      const validation = globalBrainLoader.validateManifest(manifest);
      if (!validation.valid) {
        sendJsonResponse(res, 422, {
          success: false,
          error: 'Manifest validation failed',
          details: validation.errors,
        });
        return;
      }

      const loaded = globalBrainLoader.loadPackage(manifest as any);
      if (!loaded) {
        sendJsonResponse(res, 422, { success: false, error: 'Manifest validation failed' });
        return;
      }

      sendJsonResponse(res, 200, {
        success: true,
        package: {
          id: manifest.brainId,
          version: manifest.version,
        },
        stats: globalBrainLoader.getLoaderStats(),
      });
      return;
    } catch (error) {
      sendJsonResponse(res, 500, {
        success: false,
        error: error instanceof Error ? error.message : 'Internal load error',
      });
      return;
    }
  }

  if (req.method === 'POST' && requestPath === '/brain/unload') {
    const isOwner = await requireOwnerAuth(req, res, postgresBundle);
    if (!isOwner) return;
    if (!enforceAdminMutationGuard(req, res, requestPath)) return;

    const result = globalBrainLoader.deactivatePackage();
    if (!result.success) {
      sendJsonResponse(res, 400, { success: false, error: result.error ?? 'No active package to unload' });
      return;
    }

    await postgresBundle.audit.recordEvent({
      eventType: 'brain.package_unload',
      userId: req.user?.sub,
      workspaceId: null,
      details: { packageId: result.deactivated?.id ?? 'unknown', version: result.deactivated?.version ?? 'unknown' },
      ipAddress: typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : undefined,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
    }).catch(() => undefined);

    sendJsonResponse(res, 200, { success: true, result });
    return;
  }

  if (req.method === 'POST' && requestPath === '/brain/rollback') {
    const isOwner = await requireOwnerAuth(req, res, postgresBundle);
    if (!isOwner) return;
    if (!enforceAdminMutationGuard(req, res, requestPath)) return;

    const result = globalBrainLoader.rollbackPackage();
    if (!result.success) {
      sendJsonResponse(res, 400, { success: false, error: result.error ?? 'Rollback failed' });
      return;
    }

    await postgresBundle.audit.recordEvent({
      eventType: 'brain.package_rollback',
      userId: req.user?.sub,
      workspaceId: null,
      details: { rolledBackTo: result.rolledBackTo ?? null },
      ipAddress: typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : undefined,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
    }).catch(() => undefined);

    sendJsonResponse(res, 200, { success: true, rolledBackTo: result.rolledBackTo });
    return;
  }

  if (req.method === 'POST' && requestPath.startsWith('/brain/models/') && requestPath.endsWith('/unload')) {
    const isOwner = await requireOwnerAuth(req, res, postgresBundle);
    if (!isOwner) return;
    if (!enforceAdminMutationGuard(req, res, requestPath)) return;

    const pathParts = requestPath.split('/').filter(Boolean);
    const modelId = pathParts[2];
    if (!modelId) {
      sendJsonResponse(res, 400, { success: false, error: 'Model ID is required' });
      return;
    }

    await postgresBundle.audit.recordEvent({
      eventType: 'brain.model.unloaded',
      userId: req.user?.sub,
      workspaceId: null,
      details: { action: 'brain.model.unloaded', targetId: modelId },
      ipAddress: typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : undefined,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
    }).catch(() => undefined);

    sendJsonResponse(res, 200, { success: true, modelId, status: 'unloaded' });
    return;
  }

  if (req.method === 'POST' && requestPath.startsWith('/brain/models/') && requestPath.endsWith('/rollback')) {
    const isOwner = await requireOwnerAuth(req, res, postgresBundle);
    if (!isOwner) return;
    if (!enforceAdminMutationGuard(req, res, requestPath)) return;

    const pathParts = requestPath.split('/').filter(Boolean);
    const modelId = pathParts[2];
    if (!modelId) {
      sendJsonResponse(res, 400, { success: false, error: 'Model ID is required' });
      return;
    }

    const body = await readJsonRequest(req, 1024 * 1024).catch(() => ({}));
    const targetVersion = isRecord(body) && typeof body.targetVersion === 'string' && body.targetVersion.trim().length > 0
      ? body.targetVersion.trim()
      : 'previous';

    await postgresBundle.audit.recordEvent({
      eventType: 'brain.model.rollback',
      userId: req.user?.sub,
      workspaceId: null,
      details: { action: 'brain.model.rollback', targetId: modelId, targetVersion },
      ipAddress: typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : undefined,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
    }).catch(() => undefined);

    sendJsonResponse(res, 200, { success: true, modelId, status: 'rolled_back', targetVersion });
    return;
  }

  if (req.method === 'GET' && requestPath === '/brain/history') {
    const isOwner = await requireOwnerAuth(req, res, postgresBundle);
    if (!isOwner) return;

    sendJsonResponse(res, 200, {
      success: true,
      history: globalBrainLoader.getPackageHistory(),
    });
    return;
  }

  if (req.method === 'GET' && requestPath === '/brain/export') {
    if (!authenticateProtectedRequest(req)) {
      sendJsonResponse(res, 401, { error: 'Unauthorized: valid Bearer token required' });
      return;
    }

    const urlObj = new URL(req.url || '/', 'http://localhost');
    const id = urlObj.searchParams.get('id') ?? undefined;
    const version = urlObj.searchParams.get('version') ?? undefined;
    const result = globalBrainLoader.exportPackage(id, version);

    if (!result.success) {
      sendJsonResponse(res, 404, { success: false, error: result.error ?? 'Package not found for export' });
      return;
    }

    sendJsonResponse(res, 200, { success: true, bundle: result.bundle });
    return;
  }

  if (req.method === 'POST' && requestPath === '/brain/evaluate') {
    if (!authenticateProtectedRequest(req)) {
      sendJsonResponse(res, 401, { error: 'Unauthorized' });
      return;
    }

    try {
      const body = await readJsonRequest(req, 1024 * 1024);
      if (!body || typeof body !== 'object' || !('program' in body) || !body.program) {
        sendJsonResponse(res, 400, { error: 'Missing program in request body' });
        return;
      }

      const parsedBody = body as { program: unknown; streaming?: boolean };
      const validation = validateBoundedAstProgram(parsedBody.program as any);
      if (!validation.valid) {
        sendJsonResponse(res, 400, { error: 'Invalid AST program', details: validation.errors });
        return;
      }

      if (parsedBody.streaming) {
        const result = await evaluateStreamingAstProgram(() => parsedBody.program as any);
        if (!result.success) {
          sendJsonResponse(res, 422, { success: false, error: result.error ?? 'AST stream evaluation failed', diagnostic: result.diagnostic });
          return;
        }
        sendJsonResponse(res, 200, { success: true, streaming: true, result: result.result });
      } else {
        const result = await evaluateAstProgram(parsedBody.program as any);
        if (!result.success) {
          sendJsonResponse(res, 422, { success: false, error: result.error ?? 'AST evaluation failed', diagnostic: result.diagnostic });
          return;
        }
        sendJsonResponse(res, 200, { success: true, streaming: false, result: result.result });
      }
    } catch (err: any) {
      sendJsonResponse(res, 500, { error: 'Evaluation failed', message: err?.message || String(err) });
    }
    return;
  }

  if (req.method === 'POST' && requestPath === '/brain/activate') {
    if (!authenticateProtectedRequest(req)) {
      sendJsonResponse(res, 401, { error: 'Unauthorized: valid Bearer token required' });
      return;
    }

    try {
      const rawBody = await readJsonRequest(req, 1024 * 1024);
      if (!isRecord(rawBody) || typeof rawBody.id !== 'string' || typeof rawBody.version !== 'string') {
        sendJsonResponse(res, 400, { success: false, error: 'Body requires id and version strings' });
        return;
      }

      const result = globalBrainLoader.activatePackage(rawBody.id, rawBody.version);
      if (!result.success) {
        sendJsonResponse(res, 404, { success: false, error: result.error ?? 'Package version not found in history' });
        return;
      }

      sendJsonResponse(res, 200, { success: true, result });
      return;
    } catch (error) {
      sendJsonResponse(res, 500, {
        success: false,
        error: error instanceof Error ? error.message : 'Internal activation error',
      });
      return;
    }
  }

  if (req.method === 'POST' && requestPath === '/brain/deactivate') {
    if (!authenticateProtectedRequest(req)) {
      sendJsonResponse(res, 401, { error: 'Unauthorized: valid Bearer token required' });
      return;
    }

    const result = globalBrainLoader.deactivatePackage();
    if (!result.success) {
      sendJsonResponse(res, 400, { success: false, error: result.error ?? 'No package currently active' });
      return;
    }

    sendJsonResponse(res, 200, { success: true, result });
    return;
  }

  if (req.method === 'POST' && requestPath === '/brain/execute') {
    if (!authenticateProtectedRequest(req)) {
      sendJsonResponse(res, 401, { error: 'Unauthorized: valid Bearer token required' });
      return;
    }

    try {
      const rawBody = await readJsonRequest(req, 1024 * 1024);
      if (!isRecord(rawBody)) {
        sendJsonResponse(res, 400, { success: false, error: 'Request body must be a JSON object' });
        return;
      }

      const moduleId = typeof rawBody.moduleId === 'string' ? rawBody.moduleId.trim() : '';
      if (!moduleId) {
        sendJsonResponse(res, 400, {
          success: false,
          error: 'moduleId is required and must be a non-empty string',
        });
        return;
      }

      const activePackage = globalBrainLoader.getActivePackage();
      if (!activePackage) {
        sendJsonResponse(res, 400, {
          success: false,
          error: 'No active brain package loaded',
        });
        return;
      }

      if (!activePackage.modules.some((module) => module.name === moduleId)) {
        sendJsonResponse(res, 400, {
          success: false,
          error: `Module '${moduleId}' not found in active package`,
        });
        return;
      }

      const executionResult = await globalBrainLoader.executeModuleAst(
        moduleId,
        isRecord(rawBody.input) ? rawBody.input as Record<string, unknown> : {},
        isRecord(rawBody.contextOverrides) ? rawBody.contextOverrides as Record<string, unknown> : {},
      );

      if (executionResult.success) {
        sendJsonResponse(res, 200, {
          success: true,
          result: executionResult.result,
          metrics: executionResult.metrics,
        });
        return;
      }

      sendJsonResponse(res, 422, {
        success: false,
        error: executionResult.error ?? 'Sandbox execution failed',
        metrics: executionResult.metrics,
      });
      return;
    } catch (error) {
      sendJsonResponse(res, 500, {
        success: false,
        error: error instanceof Error ? error.message : 'Internal execution error',
      });
      return;
    }
  }

  if (req.method === 'GET' && requestPath === '/ast/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, stats: astStats }));
    return;
  }

  if (req.method === 'POST' && requestPath === '/ast/validate') {
    try {
      const parsedBody = await readJsonRequest(req, 1024 * 1024);
      const program = isRecord(parsedBody) && 'program' in parsedBody ? parsedBody.program : parsedBody;
      const result = validateBoundedAstProgram(program);

      astStats.validationsCount += 1;
      astStats.lastValidationTimestamp = Date.now();
      if (result.valid) {
        astStats.validCount += 1;
      } else {
        astStats.invalidCount += 1;
      }

      globalBus.emit('ast:validated', {
        valid: result.valid,
        programId: isRecord(program) ? String(program.programId ?? '') : undefined,
        rootHash: result.rootHash,
        timestamp: Date.now(),
      });

      sendJsonResponse(res, 200, {
        success: true,
        valid: result.valid,
        errors: result.errors,
        depth: result.depth,
        nodeCount: result.nodeCount,
        rootHash: result.rootHash,
      });
      return;
    } catch (error) {
      sendJsonResponse(res, 400, {
        success: false,
        error: error instanceof Error ? error.message : 'Invalid request body',
      });
      return;
    }
  }

  if (req.method === 'POST' && requestPath === '/ast/execute') {
    if (!authenticateProtectedRequest(req)) {
      sendJsonResponse(res, 401, { error: 'Unauthorized: valid Bearer token required' });
      return;
    }

    try {
      const rawBody = await readJsonRequest(req, 1024 * 1024);
      if (!isRecord(rawBody) || !('program' in rawBody)) {
        sendJsonResponse(res, 400, { success: false, error: 'Missing required field: program' });
        return;
      }

      const program = rawBody.program;
      const validation = validateBoundedAstProgram(program);
      if (!validation.valid) {
        sendJsonResponse(res, 422, { success: false, errors: validation.errors });
        return;
      }

      globalBus.emit('ast:execution_started', {
        programId: isRecord(program) ? String(program.programId ?? '') : undefined,
        timestamp: Date.now(),
      });

      const executionResult = evaluateAstProgram(program as any, isRecord(rawBody.context) ? rawBody.context : {});

      astStats.executionsCount += 1;
      astStats.lastExecutionTimestamp = Date.now();
      astStats.totalDurationMs += executionResult.durationMs ?? executionResult.executionTimeMs;
      if (!executionResult.success) {
        astStats.failedExecutionsCount += 1;
        globalBus.emit('ast:execution_failed', {
          programId: isRecord(program) ? String(program.programId ?? '') : undefined,
          error: executionResult.error,
          timestamp: Date.now(),
        });
        sendJsonResponse(res, 400, {
          success: false,
          error: executionResult.error,
          diagnostic: executionResult.diagnostic ?? null,
          execution: executionResult,
        });
        return;
      }

      globalBus.emit('ast:execution_completed', {
        programId: isRecord(program) ? String(program.programId ?? '') : undefined,
        durationMs: executionResult.durationMs ?? executionResult.executionTimeMs,
        stepsExecuted: executionResult.stepsExecuted,
        timestamp: Date.now(),
      });

      sendJsonResponse(res, 200, {
        success: true,
        execution: executionResult,
        diagnostic: executionResult.diagnostic ?? null,
      });
      return;
    } catch (error) {
      sendJsonResponse(res, 500, {
        success: false,
        error: error instanceof Error ? error.message : 'Internal execution error',
      });
      return;
    }
  }

  if (req.method === 'POST' && requestPath === '/ast/workbench/inspect') {
    if (!authenticateProtectedRequest(req)) {
      sendJsonResponse(res, 401, { error: 'Unauthorized: valid Bearer token required' });
      return;
    }

    try {
      const rawBody = await readJsonRequest(req, 1024 * 1024);
      if (!isRecord(rawBody) || !('program' in rawBody)) {
        sendJsonResponse(res, 400, { success: false, error: 'Missing required field: program' });
        return;
      }

      const validation = validateBoundedAstProgram(rawBody.program);
      const execution = validation.valid
        ? evaluateAstProgram(rawBody.program as any, isRecord(rawBody.context) ? rawBody.context : {})
        : undefined;

      sendJsonResponse(res, 200, {
        success: true,
        validation,
        execution,
        diagnostic: execution?.diagnostic ?? null,
        stats: astStats,
      });
      return;
    } catch (error) {
      sendJsonResponse(res, 500, {
        success: false,
        error: error instanceof Error ? error.message : 'Internal inspection error',
      });
      return;
    }
  }

  if (requestPath === '/auth/signup' && method === 'POST') {
    const rateKey = `signup:${req.socket.remoteAddress || 'unknown'}`;
    const rateLimit = authRateLimiter.check(rateKey);
    if (!rateLimit.allowed) {
      sendJsonResponse(res, 429, {
        success: false,
        error: 'Too many signup attempts. Please try again later.',
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      });
      return;
    }

    try {
      const body = await readJsonRequest(req, 1024 * 1024);
      if (!isRecord(body) || typeof body.email !== 'string' || typeof body.password !== 'string' || typeof body.fullName !== 'string') {
        sendJsonResponse(res, 400, { success: false, error: 'email, password, and fullName are required' });
        return;
      }

      const result = await authService.signup({
        email: body.email,
        password: body.password,
        fullName: body.fullName,
        ipAddress: typeof body.ipAddress === 'string' ? body.ipAddress : undefined,
        userAgent: typeof body.userAgent === 'string' ? body.userAgent : req.headers['user-agent'] as string | undefined,
      });

      sendJsonResponse(res, 201, { success: true, ...result });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create account';
      const statusCode = error && typeof error === 'object' && 'statusCode' in error ? Number((error as { statusCode?: number }).statusCode ?? 500) : 500;
      sendJsonResponse(res, statusCode, { success: false, error: message });
      return;
    }
  }

  if (requestPath === '/auth/login' && method === 'POST') {
    const rateKey = `login:${req.socket.remoteAddress || 'unknown'}`;
    const rateLimit = loginRateLimiter.check(rateKey);
    if (!rateLimit.allowed) {
      sendJsonResponse(res, 429, {
        success: false,
        error: 'Too many login attempts. Please try again later.',
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      });
      return;
    }

    try {
      const body = await readJsonRequest(req, 1024 * 1024);
      if (!isRecord(body) || typeof body.email !== 'string' || typeof body.password !== 'string') {
        sendJsonResponse(res, 400, { success: false, error: 'email and password are required' });
        return;
      }

      const result = await authService.login({
        email: body.email,
        password: body.password,
        ipAddress: typeof body.ipAddress === 'string' ? body.ipAddress : undefined,
        userAgent: typeof body.userAgent === 'string' ? body.userAgent : req.headers['user-agent'] as string | undefined,
      });

      sendJsonResponse(res, 200, { success: true, ...result });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      const statusCode = error && typeof error === 'object' && 'statusCode' in error ? Number((error as { statusCode?: number }).statusCode ?? 500) : 500;
      sendJsonResponse(res, statusCode, { success: false, error: message });
      return;
    }
  }

  if (requestPath === '/auth/forgot-password' && method === 'POST') {
    const rateKey = `forgot-password:${req.socket.remoteAddress || 'unknown'}`;
    const rateLimit = forgotPasswordRateLimiter.check(rateKey);
    if (!rateLimit.allowed) {
      sendJsonResponse(res, 429, {
        success: false,
        error: 'Too many password-reset requests. Please try again later.',
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      });
      return;
    }

    try {
      const body = await readJsonRequest(req, 1024 * 1024);
      if (!isRecord(body) || typeof body.email !== 'string') {
        sendJsonResponse(res, 400, { success: false, error: 'email is required' });
        return;
      }

      const email = body.email.trim();
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(email)) {
        sendJsonResponse(res, 400, { success: false, error: 'Invalid email format' });
        return;
      }

      const result = await authService.forgotPassword(email, {
        ipAddress: typeof body.ipAddress === 'string' ? body.ipAddress : undefined,
        userAgent: typeof body.userAgent === 'string' ? body.userAgent : req.headers['user-agent'] as string | undefined,
      });

      sendJsonResponse(res, 200, { success: true, message: result.message });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Password reset request failed';
      const statusCode = error && typeof error === 'object' && 'statusCode' in error ? Number((error as { statusCode?: number }).statusCode ?? 500) : 500;
      sendJsonResponse(res, statusCode, { success: false, error: message });
      return;
    }
  }

  if (requestPath === '/auth/reset-password' && method === 'POST') {
    const rateKey = `reset-password:${req.socket.remoteAddress || 'unknown'}`;
    const rateLimit = resetPasswordRateLimiter.check(rateKey);
    if (!rateLimit.allowed) {
      sendJsonResponse(res, 429, {
        success: false,
        error: 'Too many password resets. Please try again later.',
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      });
      return;
    }

    try {
      const body = await readJsonRequest(req, 1024 * 1024);
      if (!isRecord(body) || typeof body.token !== 'string' || typeof body.newPassword !== 'string') {
        sendJsonResponse(res, 400, { success: false, error: 'token and newPassword are required' });
        return;
      }

      const result = await authService.resetPassword(body.token, body.newPassword, {
        ipAddress: typeof body.ipAddress === 'string' ? body.ipAddress : undefined,
        userAgent: typeof body.userAgent === 'string' ? body.userAgent : req.headers['user-agent'] as string | undefined,
      });

      sendJsonResponse(res, 200, { success: true, message: result.message });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Password reset failed';
      const statusCode = error && typeof error === 'object' && 'statusCode' in error ? Number((error as { statusCode?: number }).statusCode ?? 500) : 500;
      sendJsonResponse(res, statusCode, { success: false, error: message });
      return;
    }
  }

  if (requestPath === '/auth/onboarding' && method === 'GET') {
    const authenticated = await authenticateRequest(req, res, postgresBundle);
    if (!authenticated || !req.user) {
      return;
    }

    try {
      const result = await authService.getOnboardingState(req.user.sub);
      sendJsonResponse(res, 200, { success: true, onboardingState: result.onboardingState });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load onboarding state';
      const statusCode = error && typeof error === 'object' && 'statusCode' in error ? Number((error as { statusCode?: number }).statusCode ?? 500) : 500;
      sendJsonResponse(res, statusCode, { success: false, error: message });
      return;
    }
  }

  if (requestPath === '/auth/onboarding' && method === 'POST') {
    const authenticated = await authenticateRequest(req, res, postgresBundle);
    if (!authenticated || !req.user) {
      return;
    }

    try {
      const body = await readJsonRequest(req, 1024 * 1024);
      if (!isRecord(body) || typeof body.onboardingState !== 'string') {
        sendJsonResponse(res, 400, { success: false, error: 'onboardingState is required' });
        return;
      }

      const onboardingState = body.onboardingState;
      if (!['pending', 'in_progress', 'completed'].includes(onboardingState)) {
        sendJsonResponse(res, 400, { success: false, error: 'Invalid onboarding state' });
        return;
      }

      const updatedUser = await authService.updateOnboardingState(req.user.sub, onboardingState, {
        ipAddress: typeof body.ipAddress === 'string' ? body.ipAddress : undefined,
        userAgent: typeof body.userAgent === 'string' ? body.userAgent : req.headers['user-agent'] as string | undefined,
      });

      sendJsonResponse(res, 200, { success: true, user: updatedUser });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update onboarding state';
      const statusCode = error && typeof error === 'object' && 'statusCode' in error ? Number((error as { statusCode?: number }).statusCode ?? 500) : 500;
      sendJsonResponse(res, statusCode, { success: false, error: message });
      return;
    }
  }

  if (requestPath === '/auth/logout' && method === 'POST') {
    const authenticated = await authenticateRequest(req, res, postgresBundle);
    if (!authenticated || !req.session) {
      return;
    }

    try {
      await authService.logout(req.session.id, req.session.userId, req.headers['x-forwarded-for'] as string | undefined, req.headers['user-agent'] as string | undefined);
      sendJsonResponse(res, 200, { success: true, message: 'Logged out successfully' });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Logout failed';
      sendJsonResponse(res, 500, { success: false, error: message });
      return;
    }
  }

  if (requestPath === '/auth/verify-email' && method === 'POST') {
    try {
      const body = await readJsonRequest(req, 1024 * 1024);
      if (!isRecord(body) || typeof body.token !== 'string') {
        sendJsonResponse(res, 400, { success: false, error: 'Verification token is required' });
        return;
      }

      const result = await authService.verifyEmail(body.token);
      sendJsonResponse(res, 200, result);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to verify email';
      const statusCode = error && typeof error === 'object' && 'statusCode' in error ? Number((error as { statusCode?: number }).statusCode ?? 500) : 500;
      sendJsonResponse(res, statusCode, { success: false, error: message });
      return;
    }
  }

  if (requestPath === '/auth/me' && method === 'GET') {
    const authenticated = await authenticateRequest(req, res, postgresBundle);
    if (!authenticated || !req.user) {
      return;
    }

    try {
      const result = await authService.getMe(req.user.sub);
      sendJsonResponse(res, 200, { success: true, user: result.user, workspaces: result.workspaces });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load current user';
      const statusCode = error && typeof error === 'object' && 'statusCode' in error ? Number((error as { statusCode?: number }).statusCode ?? 500) : 500;
      sendJsonResponse(res, statusCode, { success: false, error: message });
      return;
    }
  }

  if (await handleOrganizationRoutes(req, res, postgresBundle, requestPath, authRateLimiter)) {
    return;
  }

  if (method === 'GET' && url === '/health') {
    const health: HealthStatus = {
      status: 'ok',
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      service: 'Backend_Solyra'
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health));
    return;
  }

  if (method === 'GET' && url === '/ready') {
    const metrics = globalBus.getMetrics();
    const telemetry = globalHomeostasis.sampleTelemetry();
    const brainstemState = globalBrainstem.getState();
    const dbHealth = await checkPostgresHealth(getPgPool());

    const ready: ReadinessStatus = {
      ready: brainstemState === 'ONLINE' && dbHealth.healthy,
      brainstem: brainstemState === 'ONLINE' ? 'online' : 'standby',
      homeostasis: telemetry.arousal.memoryPressure > 0.85 ? 'pressure' : 'normal',
      storage: dbHealth.healthy ? 'connected' : 'disconnected',
      activeSlots: metrics.queueDepth.total,
      neurobus: 'online',
      arousal: telemetry.arousal.level,
    };
    const statusCode = ready.ready ? 200 : 503;
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(ready, null, 2));
    return;
  }

  if (method === 'GET' && url === '/neurobus/metrics') {
    const metrics = globalBus.getMetrics();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(metrics));
    return;
  }

  if (method === 'GET' && url === '/homeostasis/telemetry') {
    const telemetry = globalHomeostasis.sampleTelemetry();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(telemetry));
    return;
  }

  if (method === 'POST' && url === '/thalamus/input') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const result = globalThalamus.routeInput({
          channel: parsed.channel || 'user.input',
          source: parsed.source || 'client',
          payload: parsed.payload ?? {},
        });
        res.writeHead(result.decision.accepted ? 200 : 429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found', path: url }));
});

export { server, globalBus, globalThalamus, globalCouncil, globalBrainLoader };

export async function handleOrganizationRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  bundle: ReturnType<typeof createPostgresPersistence>,
  requestPath: string,
  rateLimiter: RateLimiter,
): Promise<boolean> {
  const orgPathParts = requestPath.split('/').filter(Boolean);
  if (!(orgPathParts[0] === 'api' && orgPathParts[1] === 'organizations')) {
    return false;
  }

  if (req.method === 'POST' && orgPathParts.length === 2) {
    const rateLimit = rateLimiter.check(`${req.socket.remoteAddress || 'unknown'}:organization-create`);
    if (!rateLimit.allowed) {
      sendJsonResponse(res, 429, { success: false, error: 'Too many organization creation attempts. Please try again later.', retryAfterSeconds: rateLimit.retryAfterSeconds });
      return true;
    }

    const authOk = await authenticateRequest(req, res, bundle);
    if (!authOk || !req.session) {
      return true;
    }

    if (!validateOrigin(req, res)) {
      return true;
    }

    try {
      const body = await readJsonRequest(req, 1024 * 1024);
      if (!isRecord(body) || typeof body.name !== 'string' || typeof body.slug !== 'string') {
        sendJsonResponse(res, 400, { success: false, error: 'Organization name and slug are required' });
        return true;
      }

      const name = body.name.trim();
      const slug = body.slug.trim().toLowerCase();
      const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
      if (!name || name.length > 100) {
        sendJsonResponse(res, 400, { success: false, error: 'Valid organization name is required (max 100 chars)' });
        return true;
      }

      if (!slug || slug.length < 3 || slug.length > 48 || !slugRegex.test(slug)) {
        sendJsonResponse(res, 400, { success: false, error: 'Valid organization slug is required (3-48 lowercase alphanumeric/hyphen characters)' });
        return true;
      }

      const org = await bundle.organizations.create({
        name,
        slug,
        ownerId: req.session.userId,
      });

      if (bundle.audit) {
        await bundle.audit.recordEvent({
          eventType: 'organization.created',
          userId: req.session.userId,
          details: { organizationId: org.id, name: org.name, slug: org.slug },
        });
      }

      sendJsonResponse(res, 201, { success: true, organization: org });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create organization';
      const duplicate = message.toLowerCase().includes('duplicate') || message.toLowerCase().includes('unique');
      sendJsonResponse(res, duplicate ? 409 : 500, { success: false, error: duplicate ? 'Organization slug or name already exists' : 'Failed to create organization' });
      return true;
    }
  }

  if (req.method === 'GET' && orgPathParts.length === 2) {
    const authOk = await authenticateRequest(req, res, bundle);
    if (!authOk || !req.session) {
      return true;
    }

    const orgs = await bundle.organizations.listByUser(req.session.userId);
    sendJsonResponse(res, 200, { success: true, organizations: orgs });
    return true;
  }

  if (orgPathParts.length >= 3) {
    const orgId = orgPathParts[2];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(orgId)) {
      sendJsonResponse(res, 400, { success: false, error: 'Invalid organization ID format' });
      return true;
    }

    if (req.method === 'GET' && orgPathParts.length === 3) {
      const authOk = await requireOrgRole(req, res, bundle, ['owner', 'admin', 'member'], orgId);
      if (!authOk) {
        return true;
      }

      const org = await bundle.organizations.findById(orgId);
      if (!org) {
        sendJsonResponse(res, 404, { success: false, error: 'Organization not found' });
        return true;
      }

      sendJsonResponse(res, 200, { success: true, organization: org });
      return true;
    }

    if (req.method === 'GET' && orgPathParts.length === 4 && orgPathParts[3] === 'workspaces') {
      const authOk = await requireOrgRole(req, res, bundle, ['owner', 'admin', 'member'], orgId);
      if (!authOk) {
        return true;
      }

      const org = await bundle.organizations.findById(orgId);
      if (!org) {
        sendJsonResponse(res, 404, { success: false, error: 'Organization not found' });
        return true;
      }

      const workspaces = await bundle.workspaces.listByOrganization(orgId);
      sendJsonResponse(res, 200, { success: true, workspaces });
      return true;
    }

    if (req.method === 'POST' && orgPathParts.length === 4 && orgPathParts[3] === 'workspaces') {
      const authOk = await requireOrgRole(req, res, bundle, ['owner', 'admin'], orgId);
      if (!authOk || !req.session) {
        return true;
      }

      if (!validateOrigin(req, res)) {
        return true;
      }

      if (req.method === 'POST') {
        // Route body discrimination is handled below for create vs link flows.
      }

      try {
        let body: unknown;
        body = await readJsonRequest(req, 1024 * 1024);
        if (!isRecord(body)) {
          sendJsonResponse(res, 400, { success: false, error: 'Request body is required' });
          return true;
        }

        const isCreateRequest = typeof body.name === 'string' && (!('workspaceId' in body) || typeof body.workspaceId !== 'string');
        const isLinkRequest = typeof body.workspaceId === 'string';

        if (isCreateRequest) {
          const rateLimit = rateLimiter.check(`${req.socket.remoteAddress || 'unknown'}:organization-workspace-create`);
          if (!rateLimit.allowed) {
            sendJsonResponse(res, 429, { success: false, error: 'Too many workspace creation attempts. Please try again later.', retryAfterSeconds: rateLimit.retryAfterSeconds });
            return true;
          }

          const rawName = typeof body.name === 'string' ? body.name : '';
          const name = rawName.trim();
          if (!name) {
            sendJsonResponse(res, 400, { success: false, error: 'Workspace name is required' });
            return true;
          }

          const rawSlug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
          const slug = rawSlug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          if (!slug || slug.length < 2 || slug.length > 64) {
            sendJsonResponse(res, 400, { success: false, error: 'A valid workspace slug is required' });
            return true;
          }

          const existingSlug = await bundle.workspaces.findBySlug(slug);
          if (existingSlug) {
            sendJsonResponse(res, 409, { success: false, error: 'Workspace slug already exists. Please choose another.' });
            return true;
          }

          const newWorkspace = {
            id: randomUUID(),
            slug,
            name,
            ownerId: req.session.userId,
            description: typeof body.description === 'string' ? body.description.trim() : undefined,
            isIsolated: typeof body.isIsolated === 'boolean' ? body.isIsolated : false,
            settings: isRecord(body.settings) ? (body.settings as Record<string, unknown>) : {},
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const createdWorkspace = await bundle.workspaces.create(newWorkspace as any);
          await bundle.organizations.linkWorkspace({ organizationId: orgId, workspaceId: createdWorkspace.id });

          if (bundle.audit) {
            await bundle.audit.recordEvent({
              eventType: 'organization.workspace_created',
              userId: req.session.userId,
              details: { organizationId: orgId, workspaceId: createdWorkspace.id, slug: createdWorkspace.slug, name: createdWorkspace.name },
            });
          }

          sendJsonResponse(res, 201, { success: true, workspace: createdWorkspace });
          return true;
        }

        if (!isLinkRequest) {
          sendJsonResponse(res, 400, { success: false, error: 'workspaceId is required for linking or name is required for creation' });
          return true;
        }

        const rateLimit = rateLimiter.check(`${req.socket.remoteAddress || 'unknown'}:organization-workspace-link`);
        if (!rateLimit.allowed) {
          sendJsonResponse(res, 429, { success: false, error: 'Too many organization workspace link attempts. Please try again later.', retryAfterSeconds: rateLimit.retryAfterSeconds });
          return true;
        }

        const rawWorkspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : '';
        const workspaceId = rawWorkspaceId.trim();
        if (!uuidRegex.test(workspaceId)) {
          sendJsonResponse(res, 400, { success: false, error: 'Valid workspaceId UUID is required' });
          return true;
        }

        const organization = await bundle.organizations.findById(orgId);
        if (!organization) {
          sendJsonResponse(res, 404, { success: false, error: 'Organization not found' });
          return true;
        }

        const workspace = await bundle.workspaces.findById(workspaceId);
        if (!workspace) {
          sendJsonResponse(res, 404, { success: false, error: 'Workspace not found' });
          return true;
        }

        const linkedWorkspaceIds = await bundle.organizations.listWorkspaces(orgId);
        if (linkedWorkspaceIds.includes(workspaceId)) {
          sendJsonResponse(res, 409, { success: false, error: 'Workspace is already linked to this organization' });
          return true;
        }

        const alreadyLinkedElsewhere = await bundle.organizations.getWorkspaceOrganization(workspaceId);
        if (alreadyLinkedElsewhere && alreadyLinkedElsewhere.id !== orgId) {
          sendJsonResponse(res, 409, { success: false, error: 'Workspace is already linked to another organization' });
          return true;
        }

        const link = await bundle.organizations.linkWorkspace({ organizationId: orgId, workspaceId });
        if (bundle.audit) {
          await bundle.audit.recordEvent({
            eventType: 'organization.workspace_linked',
            userId: req.session.userId,
            details: { organizationId: orgId, workspaceId },
          });
        }

        sendJsonResponse(res, 201, { success: true, link });
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to link workspace';
        const duplicate = message.toLowerCase().includes('duplicate') || message.toLowerCase().includes('already linked') || message.toLowerCase().includes('unique');
        sendJsonResponse(res, duplicate ? 409 : 500, { success: false, error: duplicate ? 'Workspace is already linked to this organization' : message });
        return true;
      }
    }

    if (req.method === 'DELETE' && orgPathParts.length === 5 && orgPathParts[3] === 'workspaces') {
      const targetWorkspaceId = orgPathParts[4];
      const authOk = await requireOrgRole(req, res, bundle, ['owner', 'admin'], orgId);
      if (!authOk || !req.session) {
        return true;
      }

      if (!validateOrigin(req, res)) {
        return true;
      }

      if (!uuidRegex.test(targetWorkspaceId)) {
        sendJsonResponse(res, 400, { success: false, error: 'Valid workspaceId UUID is required' });
        return true;
      }

      const rateLimit = rateLimiter.check(`${req.socket.remoteAddress || 'unknown'}:organization-workspace-unlink`);
      if (!rateLimit.allowed) {
        sendJsonResponse(res, 429, { success: false, error: 'Too many organization workspace unlink attempts. Please try again later.', retryAfterSeconds: rateLimit.retryAfterSeconds });
        return true;
      }

      const linkedWorkspaceIds = await bundle.organizations.listWorkspaces(orgId);
      if (!linkedWorkspaceIds.includes(targetWorkspaceId)) {
        sendJsonResponse(res, 404, { success: false, error: 'Workspace link not found in this organization' });
        return true;
      }

      const removed = await bundle.organizations.unlinkWorkspace(orgId, targetWorkspaceId);
      if (!removed) {
        sendJsonResponse(res, 404, { success: false, error: 'Workspace link not found in this organization' });
        return true;
      }

      if (bundle.audit) {
        await bundle.audit.recordEvent({
          eventType: 'organization.workspace_unlinked',
          userId: req.session.userId,
          details: { organizationId: orgId, workspaceId: targetWorkspaceId },
        });
      }

      sendJsonResponse(res, 200, { success: true, removed: true, organizationId: orgId, workspaceId: targetWorkspaceId });
      return true;
    }

    if (req.method === 'GET' && orgPathParts.length === 4 && orgPathParts[3] === 'members') {
      const authOk = await requireOrgRole(req, res, bundle, ['owner', 'admin', 'member'], orgId);
      if (!authOk) {
        return true;
      }

      const members = await bundle.organizations.listMembers(orgId);
      sendJsonResponse(res, 200, { success: true, members });
      return true;
    }

    if (req.method === 'POST' && orgPathParts.length === 4 && orgPathParts[3] === 'members') {
      const authOk = await requireOrgRole(req, res, bundle, ['owner', 'admin'], orgId);
      if (!authOk || !req.session) {
        return true;
      }

      if (!validateOrigin(req, res)) {
        return true;
      }

      try {
        const body = await readJsonRequest(req, 1024 * 1024);
        if (!isRecord(body) || typeof body.userId !== 'string' || typeof body.role !== 'string') {
          sendJsonResponse(res, 400, { success: false, error: 'userId and role are required' });
          return true;
        }

        const targetUserId = body.userId.trim();
        const role = body.role.trim().toLowerCase();
        if (!uuidRegex.test(targetUserId)) {
          sendJsonResponse(res, 400, { success: false, error: 'Valid userId UUID is required' });
          return true;
        }

        if (!['owner', 'admin', 'member'].includes(role)) {
          sendJsonResponse(res, 400, { success: false, error: "Role must be 'owner', 'admin', or 'member'" });
          return true;
        }

        const member = await bundle.organizations.addMember({ organizationId: orgId, userId: targetUserId, role: role as any });
        if (bundle.audit) {
          await bundle.audit.recordEvent({
            eventType: 'organization.member_added',
            userId: req.session.userId,
            details: { organizationId: orgId, targetUserId, role },
          });
        }

        sendJsonResponse(res, 201, { success: true, member });
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to add member';
        const duplicate = message.toLowerCase().includes('duplicate') || message.toLowerCase().includes('unique');
        sendJsonResponse(res, duplicate ? 409 : 500, { success: false, error: duplicate ? 'User is already a member of this organization' : 'Failed to add member' });
        return true;
      }
    }

    if (req.method === 'PUT' && orgPathParts.length === 6 && orgPathParts[3] === 'members' && orgPathParts[5] === 'role') {
      const targetUserId = orgPathParts[4];
      const authOk = await requireOrgRole(req, res, bundle, ['owner', 'admin'], orgId);
      if (!authOk || !req.session) {
        return true;
      }

      if (!validateOrigin(req, res)) {
        return true;
      }

      if (!uuidRegex.test(targetUserId)) {
        sendJsonResponse(res, 400, { success: false, error: 'Invalid target userId format' });
        return true;
      }

      try {
        const body = await readJsonRequest(req, 1024 * 1024);
        if (!isRecord(body) || typeof body.role !== 'string') {
          sendJsonResponse(res, 400, { success: false, error: "Role is required in the request body" });
          return true;
        }

        const newRole = body.role.trim().toLowerCase();
        if (!['owner', 'admin', 'member'].includes(newRole)) {
          sendJsonResponse(res, 400, { success: false, error: "Role must be 'owner', 'admin', or 'member'" });
          return true;
        }

        const currentMembers = await bundle.organizations.listMembers(orgId);
        const targetMember = currentMembers.find((member: OrganizationMember) => member.userId === targetUserId);
        if (!targetMember) {
          sendJsonResponse(res, 404, { success: false, error: 'Target member not found in organization' });
          return true;
        }

        if (targetMember.role === 'owner' && newRole !== 'owner') {
          const ownerCount = currentMembers.filter((member: OrganizationMember) => member.role === 'owner').length;
          if (ownerCount <= 1) {
            sendJsonResponse(res, 400, { success: false, error: 'Cannot demote the last owner of the organization' });
            return true;
          }
        }

        const updated = await bundle.organizations.updateMemberRole(orgId, targetUserId, newRole as any);
        if (!updated) {
          sendJsonResponse(res, 404, { success: false, error: 'Target member not found' });
          return true;
        }

        if (bundle.audit) {
          await bundle.audit.recordEvent({
            eventType: 'organization.member_role_updated',
            userId: req.session.userId,
            details: { organizationId: orgId, targetUserId, role: newRole },
          });
        }

        sendJsonResponse(res, 200, { success: true, updated: true });
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update member role';
        sendJsonResponse(res, 500, { success: false, error: message });
        return true;
      }
    }

    if (req.method === 'DELETE' && orgPathParts.length === 5 && orgPathParts[3] === 'members') {
      const targetUserId = orgPathParts[4];
      const authOk = await requireOrgRole(req, res, bundle, ['owner', 'admin'], orgId);
      if (!authOk || !req.session) {
        return true;
      }

      if (!validateOrigin(req, res)) {
        return true;
      }

      if (!uuidRegex.test(targetUserId)) {
        sendJsonResponse(res, 400, { success: false, error: 'Invalid target userId format' });
        return true;
      }

      const currentMembers = await bundle.organizations.listMembers(orgId);
      const targetMember = currentMembers.find((member: OrganizationMember) => member.userId === targetUserId);
      if (!targetMember) {
        sendJsonResponse(res, 404, { success: false, error: 'Target member not found in organization' });
        return true;
      }

      if (targetMember.role === 'owner') {
        const ownerCount = currentMembers.filter((member: OrganizationMember) => member.role === 'owner').length;
        if (ownerCount <= 1) {
          sendJsonResponse(res, 400, { success: false, error: 'Cannot remove the last owner of the organization' });
          return true;
        }
      }

      const removed = await bundle.organizations.removeMember(orgId, targetUserId);
      if (!removed) {
        sendJsonResponse(res, 404, { success: false, error: 'Member not found or could not be removed' });
        return true;
      }

      if (bundle.audit) {
        await bundle.audit.recordEvent({
          eventType: 'organization.member_removed',
          userId: req.session.userId,
          details: { organizationId: orgId, targetUserId },
        });
      }

      sendJsonResponse(res, 200, { success: true, removed: true });
      return true;
    }
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isTestRun = process.env.NODE_ENV === 'test' || 
  process.argv.includes('--test') ||
  process.argv.some((arg) => /(?:^|[\\/])[^\\/]+\.test\.[cm]?[jt]s(?:x)?$/.test(arg));

if (!isTestRun) {
  server.listen(PORT, () => {
    log('info', 'Backend_Solyra service shell started', { port: PORT });
  });
}
