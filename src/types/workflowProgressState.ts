import type { WorkflowDefinition, WorkflowPhaseKey } from './workflowDefinition';

export interface WorkflowStepProgress {
  stepId: string;
  phase: WorkflowPhaseKey;
  completedScans: number;
  expectedScanCount: number;
  startedAt?: string;
  completedAt?: string;
}

export interface WorkflowProgressState {
  workflowId: WorkflowDefinition['id'];
  activeStepId: string;
  activePhase: WorkflowPhaseKey;
  isCompleted: boolean;
  completedSteps: number;
  totalSteps: number;
  phaseCompletion: Record<WorkflowPhaseKey, number>;
  stepProgress: WorkflowStepProgress[];
}
