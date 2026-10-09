import * as http from 'node:http';
import { log } from './logger.js';
import { globalBus } from './neurobus/index.js';
import type { HealthStatus, ReadinessStatus } from '@solyra/shared';

const PORT = parseInt(process.env.BACKEND_PORT || '4000', 10);
const startTime = Date.now();

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
    const ready: ReadinessStatus = {
      ready: true,
      brainstem: 'standby',
      homeostasis: 'normal',
      storage: 'connected',
      activeSlots: metrics.queueDepth.total,
      neurobus: 'online'
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

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found', path: url }));
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    log('info', 'Backend_Solyra service shell started', { port: PORT });
  });
}
