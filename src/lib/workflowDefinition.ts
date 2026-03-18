import type {
  WorkflowDefinition,
  WorkflowPhaseKey,
  WorkflowProgressState,
  WorkflowStepProgress,
} from '../types';

export const MULTI_RANGE_V1_WORKFLOW: WorkflowDefinition = {
  id: 'multi-range-v1',
  name: 'Multi-Range Workflow',
  version: '1.0.0',
  scannerInputMode: 'keyboard-wedge',
  metricsPhases: ['short4', 'mixed', 'long4', 'mid4'],
  steps: [
    {
      id: 'short4-step',
      name: 'Short 4 Characters',
      phase: 'short4',
      expectedScanCount: 4,
      description: 'Validate short range barcode scans (4 chars).',
    },
    {
      id: 'mixed-step',
      name: 'Mixed Payload',
      phase: 'mixed',
      expectedScanCount: 4,
      description: 'Validate mixed alphanumeric payload scans.',
    },
    {
      id: 'long4-step',
      name: 'Long 4 Scans',
      phase: 'long4',
      expectedScanCount: 4,
      description: 'Validate long payload barcode scans.',
    },
    {
      id: 'mid4-step',
      name: 'Mid 4 Scans',
      phase: 'mid4',
      expectedScanCount: 4,
      description: 'Validate medium payload barcode scans.',
    },
  ],
};

const ORDERED_PHASES = MULTI_RANGE_V1_WORKFLOW.metricsPhases;

function emptyPhaseCompletion(): Record<WorkflowPhaseKey, number> {
  return ORDERED_PHASES.reduce<Record<WorkflowPhaseKey, number>>((accumulator, phase) => {
    accumulator[phase] = 0;
    return accumulator;
  }, {} as Record<WorkflowPhaseKey, number>);
}

function createStepProgress(workflow: WorkflowDefinition): WorkflowStepProgress[] {
  return workflow.steps.map((step) => ({
    stepId: step.id,
    phase: step.phase,
    completedScans: 0,
    expectedScanCount: step.expectedScanCount,
  }));
}

export function getDefaultWorkflowDefinition() {
  return MULTI_RANGE_V1_WORKFLOW;
}

export function createInitialWorkflowProgressState(
  workflow: WorkflowDefinition = MULTI_RANGE_V1_WORKFLOW
): WorkflowProgressState {
  const firstStep = workflow.steps[0];

  return {
    workflowId: workflow.id,
    activeStepId: firstStep.id,
    activePhase: firstStep.phase,
    isCompleted: false,
    completedSteps: 0,
    totalSteps: workflow.steps.length,
    phaseCompletion: emptyPhaseCompletion(),
    stepProgress: createStepProgress(workflow),
  };
}
