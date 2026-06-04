import type { IngestionProgress } from '../ingestion/types.js';

export type AppProgressStage =
  | IngestionProgress['stage']
  | 'index'
  | 'register'
  | 'credential'
  | 'delete'
  | 'verify'
  | 'done';

export interface AppProgressEvent {
  stage: AppProgressStage;
  message: string;
  current?: number;
  total?: number;
  percent?: number;
}

export type AppProgressHandler = (event: AppProgressEvent) => void;

export function emitProgress(
  handler: AppProgressHandler | undefined,
  event: AppProgressEvent,
): void {
  handler?.(event);
}

export function fromIngestionProgress(progress: IngestionProgress): AppProgressEvent {
  return {
    stage: progress.stage,
    message: progress.message,
    current: progress.current,
    total: progress.total,
    percent: progress.percent,
  };
}
