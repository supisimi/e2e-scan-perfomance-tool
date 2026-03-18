import type {
  FullCycleMetric,
  PhaseMetric,
  ScanEvent,
  SessionMetrics,
  WorkflowDefinition,
  WorkflowPhaseKey,
} from '../types';
import { MULTI_RANGE_V1_WORKFLOW } from './workflowDefinition';

function byTimestampAscending(left: ScanEvent, right: ScanEvent) {
  return left.occurredAtMs - right.occurredAtMs;
}

function getAcceptedScanEvents(events: ScanEvent[]) {
  return events
    .filter((event) => event.type === 'scan-accepted' || event.type === 'scan-received')
    .slice()
    .sort(byTimestampAscending);
}

function inferPhase(event: ScanEvent): WorkflowPhaseKey | null {
  const blockFromMetadata = event.metadata?.workflowBlock;
  if (
    blockFromMetadata === 'short4' ||
    blockFromMetadata === 'mixed' ||
    blockFromMetadata === 'long4' ||
    blockFromMetadata === 'mid4'
  ) {
    return blockFromMetadata;
  }

  if (event.phase) {
    return event.phase;
  }

  if (event.classifier && event.classifier !== 'unknown') {
    return event.classifier;
  }

  return null;
}

function createEmptyPhaseMetric(key: WorkflowPhaseKey): PhaseMetric {
  return {
    key,
    totalScans: 0,
    successfulScans: 0,
    failedScans: 0,
    averageScanIntervalMs: 0,
    window: {
      durationMs: 0,
    },
  };
}

function calculateAverageIntervalMs(events: ScanEvent[]) {
  if (events.length <= 1) {
    return 0;
  }

  let totalInterval = 0;

  for (let index = 1; index < events.length; index += 1) {
    totalInterval += events[index].occurredAtMs - events[index - 1].occurredAtMs;
  }

  return Math.round(totalInterval / (events.length - 1));
}

function setMetricWindow(metric: PhaseMetric, events: ScanEvent[]) {
  if (events.length === 0) {
    return;
  }

  const startedAt = events[0].occurredAt;
  const endedAt = events[events.length - 1].occurredAt;

  metric.window = {
    startedAt,
    endedAt,
    durationMs: events[events.length - 1].occurredAtMs - events[0].occurredAtMs,
  };
}

function createFullCycleMetric(events: ScanEvent[]): FullCycleMetric {
  if (events.length === 0) {
    return {
      key: 'fullCycle',
      totalScans: 0,
      successfulScans: 0,
      failedScans: 0,
      window: { durationMs: 0 },
    };
  }

  const successfulScans = events.filter((event) => event.isSuccessful !== false).length;

  return {
    key: 'fullCycle',
    totalScans: events.length,
    successfulScans,
    failedScans: events.length - successfulScans,
    window: {
      startedAt: events[0].occurredAt,
      endedAt: events[events.length - 1].occurredAt,
      durationMs: events[events.length - 1].occurredAtMs - events[0].occurredAtMs,
    },
  };
}

export function calculateSessionMetrics(
  eventLog: ScanEvent[],
  workflow: WorkflowDefinition = MULTI_RANGE_V1_WORKFLOW
): SessionMetrics {
  const acceptedEvents = getAcceptedScanEvents(eventLog);

  const byPhase = workflow.metricsPhases.reduce<Record<WorkflowPhaseKey, PhaseMetric>>((accumulator, phase) => {
    accumulator[phase] = createEmptyPhaseMetric(phase);
    return accumulator;
  }, {} as Record<WorkflowPhaseKey, PhaseMetric>);

  const eventsByPhase = workflow.metricsPhases.reduce<Record<WorkflowPhaseKey, ScanEvent[]>>(
    (accumulator, phase) => {
      accumulator[phase] = [];
      return accumulator;
    },
    {} as Record<WorkflowPhaseKey, ScanEvent[]>
  );

  for (const event of acceptedEvents) {
    const phase = inferPhase(event);

    if (!phase || !eventsByPhase[phase]) {
      continue;
    }

    eventsByPhase[phase].push(event);
  }

  for (const phase of workflow.metricsPhases) {
    const metric = byPhase[phase];
    const phaseEvents = eventsByPhase[phase];

    metric.totalScans = phaseEvents.length;
    metric.successfulScans = phaseEvents.filter((event) => event.isSuccessful !== false).length;
    metric.failedScans = metric.totalScans - metric.successfulScans;
    metric.averageScanIntervalMs = calculateAverageIntervalMs(phaseEvents);
    setMetricWindow(metric, phaseEvents);
  }

  return {
    generatedAt: new Date().toISOString(),
    keys: [...workflow.metricsPhases, 'fullCycle'],
    byPhase,
    fullCycle: createFullCycleMetric(acceptedEvents),
  };
}
