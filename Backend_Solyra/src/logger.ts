/**
 * Solyra Structured JSON Logger
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export function log(level: LogLevel, message: string, meta: Record<string, unknown> = {}): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: 'Backend_Solyra',
    ...meta,
  };
  console.log(JSON.stringify(entry));
}
