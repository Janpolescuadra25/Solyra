import * as http from 'node:http';
import { log } from './logger.js';
import { globalBus } from './neurobus/index.js';
import { globalBrainstem } from './brainstem/index.js';
import { globalHomeostasis } from './homeostasis/index.js';
import { globalThalamus } from './thalamus/index.js';
import { globalCouncil } from './council/index.js';
import { globalBrainLoader } from './brain/index.js';
import { evaluateAstProgram, validateBoundedAstProgram } from './ast/index.js';
import { getPgPool, checkPostgresHealth } from './persistence/postgres/index.js';
import type { HealthStatus, ReadinessStatus } from '@solyra/shared';

const PORT = parseInt(process.env.BACKEND_PORT || '4000', 10);
const startTime = Date.now();
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

export const server = http.createServer(async (req, res) => {
  const url = req.url || '/';
  const method = req.method || 'GET';
  const requestPath = normalizeRequestPath(url);

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
