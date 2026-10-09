import * as http from 'node:http';
import { log } from './logger.js';
import { globalBus } from './neurobus/index.js';
import { globalBrainstem } from './brainstem/index.js';
import { globalHomeostasis } from './homeostasis/index.js';
import { globalThalamus } from './thalamus/index.js';
import type { HealthStatus, ReadinessStatus } from '@solyra/shared';

const PORT = parseInt(process.env.BACKEND_PORT || '4000', 10);
const startTime = Date.now();

globalBrainstem.boot().catch((err) => {
  log('error', 'Failed to boot Brainstem', { error: String(err) });
});

export const server = http.createServer(async (req, res) => {
  const url = req.url || '/';
  const method = req.method || 'GET';

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

    const ready: ReadinessStatus = {
      ready: brainstemState === 'ONLINE',
      brainstem: brainstemState === 'ONLINE' ? 'online' : 'standby',
      homeostasis: telemetry.arousal.memoryPressure > 0.85 ? 'pressure' : 'normal',
      storage: 'connected',
      activeSlots: metrics.queueDepth.total,
      neurobus: 'online',
      arousal: telemetry.arousal.level,
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(ready));
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

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    log('info', 'Backend_Solyra service shell started', { port: PORT });
  });
}
