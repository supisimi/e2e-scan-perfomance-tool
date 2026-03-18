export const WORKFLOW_PHASES = ['short4', 'mixed', 'long4', 'mid4'] as const;

export type WorkflowPhaseKey = (typeof WORKFLOW_PHASES)[number];
export type MetricKey = WorkflowPhaseKey | 'fullCycle';

export interface WorkflowStepDefinition {
  id: string;
  name: string;
  phase: WorkflowPhaseKey;
  expectedScanCount: number;
  description?: string;
}

export interface WorkflowDefinition {
  id: 'multi-range-v1' | (string & {});
  name: string;
  version: string;
  scannerInputMode: 'keyboard-wedge' | (string & {});
  metricsPhases: readonly WorkflowPhaseKey[];
  steps: readonly WorkflowStepDefinition[];
}
