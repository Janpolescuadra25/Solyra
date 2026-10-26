import { IChatRepository } from './postgres/repositories/chat.repository.js';

export interface RetentionCleanerHandle {
  stop: () => void;
  triggerSweep: (now?: Date) => Promise<number>;
}

export function startRetentionPolicyCleaner(
  chatRepository: IChatRepository,
  intervalMs: number = 60000,
  batchSize: number = 50,
): RetentionCleanerHandle {
  let isRunning = false;

  const runSweep = async (now: Date = new Date()): Promise<number> => {
    if (isRunning) {
      return 0;
    }

    isRunning = true;
    try {
      const cleanedCount = await chatRepository.cleanupExpiredConversations(now, batchSize);
      if (cleanedCount > 0) {
        console.log(`[RetentionCleaner] Swept and soft-deleted ${cleanedCount} expired conversation(s)`);
      }
      return cleanedCount;
    } catch (error) {
      console.error('[RetentionCleaner] Error during retention cleanup sweep:', error);
      return 0;
    } finally {
      isRunning = false;
    }
  };

  const timer = setInterval(() => {
    void runSweep();
  }, intervalMs);

  if (timer.unref) {
    timer.unref();
  }

  return {
    stop: () => {
      clearInterval(timer);
    },
    triggerSweep: runSweep,
  };
}
