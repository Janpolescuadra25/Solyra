import * as http from 'node:http';
import { randomUUID } from 'node:crypto';
import { log } from './logger.js';
import { globalBus } from './neurobus/index.js';
import { globalBrainstem } from './brainstem/index.js';
import { globalHomeostasis } from './homeostasis/index.js';
import { globalThalamus } from './thalamus/index.js';
import { globalCouncil } from './council/index.js';
import { globalBrainLoader } from './brain/index.js';
import { evaluateAstProgram, validateBoundedAstProgram } from './ast/index.js';
import { getPgPool, checkPostgresHealth, createPostgresPersistence } from './persistence/postgres/index.js';
import type { HealthStatus, ReadinessStatus } from '@solyra/shared';
import { AuthService } from './auth/service.js';
import { authenticateRequest, RateLimiter } from './auth/middleware.js';

const PORT = parseInt(process.env.BACKEND_PORT || '4000', 10);
const startTime = Date.now();
const postgresBundle = createPostgresPersistence(getPgPool());
const authService = new AuthService(postgresBundle, getPgPool());
const authRateLimiter = new RateLimiter(15 * 60 * 1000, 10);
const loginRateLimiter = new RateLimiter(15 * 60 * 1000, 5);
const forgotPasswordRateLimiter = new RateLimiter(15 * 60 * 1000, 3);
const resetPasswordRateLimiter = new RateLimiter(15 * 60 * 1000, 5);
const chatRateLimiter = new RateLimiter(60 * 1000, 120);
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
  if (server.listening) {
    server.close();
  }
};

process.on('SIGTERM', shutdownServer);
process.on('SIGINT', shutdownServer);

export async function requireOwnerAuth(req: any, res: any, bundle: any): Promise<boolean> {
  const authed = await authenticateRequest(req, res, bundle);
  if (!authed) return false;
  if (!req.user || (req.user.role !== 'owner' && req.user.role !== 'admin')) {
    sendJsonResponse(res, 403, { success: false, error: 'Forbidden: Owner or administrator privilege required' });
    return false;
  }
  return true;
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
        const conversations = await postgresBundle.chat.listConversations(req.session.workspaceId, req.session.userId);
        sendJsonResponse(res, 200, { success: true, conversations });
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
        const userMessage = await postgresBundle.chat.appendMessage({
          id: randomUUID(),
          conversationId,
          senderId: req.session.userId,
          role: 'user',
          content: trimmedContent,
          createdAt: new Date(),
        });

        const assistantReplyText = `Solyra Assistant: I received your request: "${trimmedContent}". Conversational engine is active and ready for collaborative tasks.`;
        const assistantMessage = await postgresBundle.chat.appendMessage({
          id: randomUUID(),
          conversationId,
          senderId: 'solyra-assistant',
          role: 'assistant',
          content: assistantReplyText,
          createdAt: new Date(),
        });

        sendJsonResponse(res, 201, {
          success: true,
          userMessage,
          assistantMessage,
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

  if (req.method === 'GET' && requestPath === '/thalamus/stats') {
      const isOwner = await requireOwnerAuth(req, res, postgresBundle);
      if (!isOwner) return;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', data: globalThalamus.getRoutingStats() }));
    return;
  }

  if (req.method === 'GET' && requestPath === '/council/stats') {
      const isOwner = await requireOwnerAuth(req, res, postgresBundle);
      if (!isOwner) return;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(globalCouncil.getCouncilStats()));
    return;
  }

  if (req.method === 'GET' && requestPath === '/brain/stats') {
      const isOwner = await requireOwnerAuth(req, res, postgresBundle);
      if (!isOwner) return;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(globalBrainLoader.getLoaderStats()));
    return;
  }

  if (req.method === 'POST' && requestPath === '/brain/load') {
      const isOwner = await requireOwnerAuth(req, res, postgresBundle);
      if (!isOwner) return;
    if (!authenticateProtectedRequest(req)) {
      sendJsonResponse(res, 401, { error: 'Unauthorized: valid Bearer token required' });
      return;
    }

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
    if (!authenticateProtectedRequest(req)) {
      sendJsonResponse(res, 401, { error: 'Unauthorized: valid Bearer token required' });
      return;
    }

    const result = globalBrainLoader.deactivatePackage();
    if (!result.success) {
      sendJsonResponse(res, 400, { success: false, error: result.error ?? 'No active package to unload' });
      return;
    }

    sendJsonResponse(res, 200, { success: true, result });
    return;
  }

  if (req.method === 'POST' && requestPath === '/brain/rollback') {
    if (!authenticateProtectedRequest(req)) {
      sendJsonResponse(res, 401, { error: 'Unauthorized: valid Bearer token required' });
      return;
    }

    const result = globalBrainLoader.rollbackPackage();
    if (!result.success) {
      sendJsonResponse(res, 400, { success: false, error: result.error ?? 'Rollback failed' });
      return;
    }

    sendJsonResponse(res, 200, { success: true, rolledBackTo: result.rolledBackTo });
    return;
  }

  if (req.method === 'GET' && requestPath === '/brain/history') {
    if (!authenticateProtectedRequest(req)) {
      sendJsonResponse(res, 401, { error: 'Unauthorized: valid Bearer token required' });
      return;
    }

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

export { globalBus, globalThalamus, globalCouncil, globalBrainLoader };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    log('info', 'Backend_Solyra service shell started', { port: PORT });
  });
}
