import type { MetricKey, WorkflowPhaseKey } from './workflowDefinition';

export interface MetricWindow {
  startedAt?: string;
  endedAt?: string;
  durationMs: number;
}

export interface PhaseMetric {
  key: WorkflowPhaseKey;
  totalScans: number;
  successfulScans: number;
  failedScans: number;
  averageScanIntervalMs: number;
  window: MetricWindow;
}

export interface FullCycleMetric {
  key: 'fullCycle';
  totalScans: number;
  successfulScans: number;
  failedScans: number;
  window: MetricWindow;
}

export interface SessionMetrics {
  generatedAt: string;
  keys: readonly MetricKey[];
  byPhase: Record<WorkflowPhaseKey, PhaseMetric>;
  fullCycle: FullCycleMetric;
}
