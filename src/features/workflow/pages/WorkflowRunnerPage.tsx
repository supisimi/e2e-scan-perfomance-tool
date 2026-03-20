import { Fragment, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSessionPersistence, useSessions } from '../../../data';
import { EmptyState, ErrorState } from '../../../shared/components';
import {
  classifyBarcodeType,
  DEFAULT_BARCODE_CLASSIFICATION_SETTINGS,
  type BarcodeType,
} from '../../../lib/barcodeClassifier';
import type { ScanEvent, TestSession } from '../../../types';

type ScanType = BarcodeType;
type BlockKey =
  | 'start'
  | 'travelStartToShort'
  | 'short4'
  | 'travelShortToMixed'
  | 'mixed'
  | 'travelMixedToLong'
  | 'long4'
  | 'travelLongToMid'
  | 'mid4'
  | 'travelMidToEnd'
  | 'end';

interface WorkflowStep {
  index: number;
  block: BlockKey;
  expectedType: ScanType;
  phase?: 'short4' | 'mixed' | 'long4' | 'mid4';
  label: string;
  expectedBarcodeContent: string;
  expectedLabel: string;
}

interface BarcodeConfiguration {
  startBarcode: string;
  finalBarcode: string;
  palletBarcode: string;
  palletCeilingBarcode: string;
  parcelBarcodes: [string, string, string, string];
  ceilingBarcodes: [string, string, string, string];
}

const BLOCK_ORDER: BlockKey[] = [
  'start',
  'travelStartToShort',
  'short4',
  'travelShortToMixed',
  'mixed',
  'travelMixedToLong',
  'long4',
  'travelLongToMid',
  'mid4',
  'travelMidToEnd',
  'end',
];

const PRIMARY_BLOCK_ORDER: Array<'start' | 'short4' | 'mixed' | 'long4' | 'mid4' | 'end'> = [
  'start',
  'short4',
  'mixed',
  'long4',
  'mid4',
  'end',
];

const BLOCK_TRANSITIONS: Array<{
  from: 'start' | 'short4' | 'mixed' | 'long4' | 'mid4';
  to: 'short4' | 'mixed' | 'long4' | 'mid4' | 'end';
  travel: 'travelStartToShort' | 'travelShortToMixed' | 'travelMixedToLong' | 'travelLongToMid' | 'travelMidToEnd';
}> = [
  { from: 'start', to: 'short4', travel: 'travelStartToShort' },
  { from: 'short4', to: 'mixed', travel: 'travelShortToMixed' },
  { from: 'mixed', to: 'long4', travel: 'travelMixedToLong' },
  { from: 'long4', to: 'mid4', travel: 'travelLongToMid' },
  { from: 'mid4', to: 'end', travel: 'travelMidToEnd' },
];

const BLOCK_LABELS: Record<BlockKey, string> = {
  start: 'Start Barcode',
  travelStartToShort: 'Travel: Start → Short',
  short4: 'Short Block',
  travelShortToMixed: 'Travel: Short → Mixed',
  mixed: 'Mixed Block',
  travelMixedToLong: 'Travel: Mixed → Long',
  long4: 'Long Block',
  travelLongToMid: 'Travel: Long → Mid',
  mid4: 'Mid Block',
  travelMidToEnd: 'Travel: Mid → Final',
  end: 'Final Barcode',
};

const INITIAL_BARCODE_CONFIGURATION: BarcodeConfiguration = {
  startBarcode: 'START',
  finalBarcode: 'FINAL',
  palletBarcode: 'PALLET',
  palletCeilingBarcode: 'PALLETCEILING',
  parcelBarcodes: ['PARCEL1', 'PARCEL2', 'PARCEL3', 'PARCEL4'],
  ceilingBarcodes: ['CEILING1', 'CEILING2', 'CEILING3', 'CEILING4'],
};

function normalizeBarcodeContent(input: string) {
  return input.trim().toLowerCase();
}

function buildWorkflowSteps(config: BarcodeConfiguration): WorkflowStep[] {
  const steps: WorkflowStep[] = [];
  let index = 0;

  steps.push({
    index,
    block: 'start',
    expectedType: 'start',
    label: 'Start Barcode',
    expectedBarcodeContent: config.startBarcode,
    expectedLabel: 'Start barcode',
  });
  index += 1;

  for (let parcelIndex = 0; parcelIndex < 4; parcelIndex += 1) {
    steps.push({
      index,
      block: 'short4',
      expectedType: 'parcel',
      phase: 'short4',
      label: `Short Block ${parcelIndex + 1}/4`,
      expectedBarcodeContent: config.parcelBarcodes[parcelIndex],
      expectedLabel: `Parcel ${parcelIndex + 1}`,
    });
    index += 1;
  }

  for (let roundIndex = 0; roundIndex < 4; roundIndex += 1) {
    steps.push({
      index,
      block: 'mixed',
      expectedType: 'parcel',
      phase: 'mixed',
      label: `Mixed Round ${roundIndex + 1} Parcel`,
      expectedBarcodeContent: config.parcelBarcodes[roundIndex],
      expectedLabel: 'Any remaining parcel barcode',
    });
    index += 1;

    steps.push({
      index,
      block: 'mixed',
      expectedType: 'pallet',
      phase: 'mixed',
      label: `Mixed Round ${roundIndex + 1} Pallet`,
      expectedBarcodeContent: config.palletBarcode,
      expectedLabel: 'Pallet barcode',
    });
    index += 1;

    steps.push({
      index,
      block: 'mixed',
      expectedType: 'ceiling',
      phase: 'mixed',
      label: `Mixed Round ${roundIndex + 1} Pallet Ceiling`,
      expectedBarcodeContent: config.palletCeilingBarcode,
      expectedLabel: 'Pallet ceiling barcode',
    });
    index += 1;
  }

  for (let ceilingIndex = 0; ceilingIndex < 4; ceilingIndex += 1) {
    steps.push({
      index,
      block: 'long4',
      expectedType: 'ceiling',
      phase: 'long4',
      label: `Long Block ${ceilingIndex + 1}/4`,
      expectedBarcodeContent: config.ceilingBarcodes[ceilingIndex],
      expectedLabel: `Ceiling ${ceilingIndex + 1}`,
    });
    index += 1;
  }

  for (let parcelIndex = 0; parcelIndex < 4; parcelIndex += 1) {
    steps.push({
      index,
      block: 'mid4',
      expectedType: 'parcel',
      phase: 'mid4',
      label: `Mid Block ${parcelIndex + 1}/4`,
      expectedBarcodeContent: config.parcelBarcodes[parcelIndex],
      expectedLabel: `Parcel ${parcelIndex + 1}`,
    });
    index += 1;
  }

  steps.push({
    index,
    block: 'end',
    expectedType: 'start',
    label: 'Final Barcode',
    expectedBarcodeContent: config.finalBarcode,
    expectedLabel: 'Final barcode',
  });

  return steps;
}

function isEditableElement(element: Element | null) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.isContentEditable) {
    return true;
  }

  if (element.dataset.scannerEditable === 'true') {
    return true;
  }

  return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT';
}

function formatDuration(durationMs: number) {
  const safeDurationMs = Math.max(0, Math.floor(durationMs));
  const totalSeconds = Math.floor(safeDurationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  const milliseconds = (safeDurationMs % 1000).toString().padStart(3, '0');
  return `${minutes}:${seconds}.${milliseconds}`;
}

function formatDateTimeWithMilliseconds(timestamp: string) {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

function getStepProgress(eventLog: ScanEvent[]) {
  const accepted = eventLog.filter(
    (event) =>
      event.type === 'scan-received' &&
      event.metadata?.workflowId === 'multi-range-v1' &&
      event.metadata?.matchedExpectation === true
  );

  return Math.max(0, accepted.length);
}

function getBlockProgressCounters(stepIndex: number, workflowSteps: WorkflowStep[]) {
  const counters: Record<BlockKey, { completed: number; expected: number }> = {
    start: { completed: 0, expected: 0 },
    travelStartToShort: { completed: 0, expected: 1 },
    short4: { completed: 0, expected: 0 },
    travelShortToMixed: { completed: 0, expected: 1 },
    mixed: { completed: 0, expected: 0 },
    travelMixedToLong: { completed: 0, expected: 1 },
    long4: { completed: 0, expected: 0 },
    travelLongToMid: { completed: 0, expected: 1 },
    mid4: { completed: 0, expected: 0 },
    travelMidToEnd: { completed: 0, expected: 1 },
    end: { completed: 0, expected: 0 },
  };

  for (const step of workflowSteps) {
    counters[step.block].expected += 1;
  }

  for (let index = 0; index < stepIndex; index += 1) {
    const step = workflowSteps[index];
    counters[step.block].completed += 1;
  }

  const firstIndexByBlock = new Map<
    'start' | 'short4' | 'mixed' | 'long4' | 'mid4' | 'end',
    number
  >();

  for (const step of workflowSteps) {
    if (!firstIndexByBlock.has(step.block as 'start' | 'short4' | 'mixed' | 'long4' | 'mid4' | 'end')) {
      firstIndexByBlock.set(step.block as 'start' | 'short4' | 'mixed' | 'long4' | 'mid4' | 'end', step.index);
    }
  }

  for (const transition of BLOCK_TRANSITIONS) {
    const nextFirstIndex = firstIndexByBlock.get(transition.to);
    if (nextFirstIndex === undefined) {
      continue;
    }

    counters[transition.travel].completed = stepIndex > nextFirstIndex ? 1 : 0;
  }

  return counters;
}

function getBlockTimers(eventLog: ScanEvent[], nowMs: number, workflowSteps: WorkflowStep[]) {
  const result: Record<BlockKey, number> = {
    start: 0,
    travelStartToShort: 0,
    short4: 0,
    travelShortToMixed: 0,
    mixed: 0,
    travelMixedToLong: 0,
    long4: 0,
    travelLongToMid: 0,
    mid4: 0,
    travelMidToEnd: 0,
    end: 0,
  };

  const expectedCountByBlock = new Map<'start' | 'short4' | 'mixed' | 'long4' | 'mid4' | 'end', number>();
  for (const block of PRIMARY_BLOCK_ORDER) {
    expectedCountByBlock.set(block, 0);
  }

  for (const step of workflowSteps) {
    const block = step.block as 'start' | 'short4' | 'mixed' | 'long4' | 'mid4' | 'end';
    expectedCountByBlock.set(block, (expectedCountByBlock.get(block) ?? 0) + 1);
  }

  const acceptedScanEvents = eventLog.filter(
    (event) =>
      event.type === 'scan-received' &&
      event.metadata?.workflowId === 'multi-range-v1' &&
      event.metadata?.matchedExpectation === true
  );

  const eventsByBlock = new Map<'start' | 'short4' | 'mixed' | 'long4' | 'mid4' | 'end', ScanEvent[]>();
  for (const block of PRIMARY_BLOCK_ORDER) {
    eventsByBlock.set(block, []);
  }

  for (const event of acceptedScanEvents) {
    const block = event.metadata?.workflowBlock as 'start' | 'short4' | 'mixed' | 'long4' | 'mid4' | 'end' | undefined;
    if (!block || !eventsByBlock.has(block)) {
      continue;
    }

    eventsByBlock.get(block)?.push(event);
  }

  for (const block of PRIMARY_BLOCK_ORDER) {
    const blockEvents = (eventsByBlock.get(block) ?? []).sort((left, right) => left.occurredAtMs - right.occurredAtMs);

    if (blockEvents.length === 0) {
      continue;
    }

    const first = blockEvents[0].occurredAtMs;
    const last = blockEvents[blockEvents.length - 1].occurredAtMs;
    const expectedCount = expectedCountByBlock.get(block) ?? 0;
    const isCompleted = blockEvents.length >= expectedCount;
    result[block] = isCompleted ? Math.max(0, last - first) : Math.max(0, nowMs - first);
  }

  for (const transition of BLOCK_TRANSITIONS) {
    const fromEvents = (eventsByBlock.get(transition.from) ?? []).sort((left, right) => left.occurredAtMs - right.occurredAtMs);
    const toEvents = (eventsByBlock.get(transition.to) ?? []).sort((left, right) => left.occurredAtMs - right.occurredAtMs);

    if (fromEvents.length === 0) {
      continue;
    }

    const fromExpectedCount = expectedCountByBlock.get(transition.from) ?? 0;
    const fromCompleted = fromEvents.length >= fromExpectedCount;
    if (!fromCompleted) {
      continue;
    }

    const fromLast = fromEvents[fromEvents.length - 1].occurredAtMs;

    if (toEvents.length > 0) {
      const toFirst = toEvents[0].occurredAtMs;
      result[transition.travel] = Math.max(0, toFirst - fromLast);
    } else {
      result[transition.travel] = Math.max(0, nowMs - fromLast);
    }
  }

  return result;
}

function getActiveBlock(stepIndex: number, workflowSteps: WorkflowStep[]) {
  const currentStep = workflowSteps[stepIndex];
  if (!currentStep) {
    return 'end' as BlockKey;
  }

  const firstIndexByBlock = new Map<
    'start' | 'short4' | 'mixed' | 'long4' | 'mid4' | 'end',
    number
  >();
  for (const step of workflowSteps) {
    if (!firstIndexByBlock.has(step.block as 'start' | 'short4' | 'mixed' | 'long4' | 'mid4' | 'end')) {
      firstIndexByBlock.set(step.block as 'start' | 'short4' | 'mixed' | 'long4' | 'mid4' | 'end', step.index);
    }
  }

  for (const transition of BLOCK_TRANSITIONS) {
    const nextFirstIndex = firstIndexByBlock.get(transition.to);
    if (nextFirstIndex !== undefined && stepIndex === nextFirstIndex) {
      return transition.travel;
    }
  }

  return currentStep.block;
}

export function WorkflowRunnerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSessionId = searchParams.get('sessionId') ?? '';

  const { sessions, isLoading: isLoadingSessions, refreshSessions } = useSessions();
  const { loadSession, appendEvent, updateExistingSession, isSaving, error } = useSessionPersistence();

  const [selectedSessionId, setSelectedSessionId] = useState(initialSessionId);
  const [activeSession, setActiveSession] = useState<TestSession>();
  const scannerInputRef = useRef<HTMLInputElement>(null);
  const scannerFlushTimeoutRef = useRef<number>();
  const scannerBufferRef = useRef('');
  const scannerCharTimestampsRef = useRef<number[]>([]);
  const [scannerBuffer, setScannerBuffer] = useState('');
  const [scannerCharTimestamps, setScannerCharTimestamps] = useState<number[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [lastCapturedBarcode, setLastCapturedBarcode] = useState('');
  const [lastCapturedAtMs, setLastCapturedAtMs] = useState<number>();
  const [validationMessage, setValidationMessage] = useState('');
  const [expandedCycleIndex, setExpandedCycleIndex] = useState<number | null>(null);
  const [isBarcodeConfigOpen, setIsBarcodeConfigOpen] = useState(false);
  const [barcodeConfiguration, setBarcodeConfiguration] = useState<BarcodeConfiguration>(
    INITIAL_BARCODE_CONFIGURATION
  );
  const [isSessionRunning, setIsSessionRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [sessionStartedAtMs, setSessionStartedAtMs] = useState<number>(Date.now());
  const [pausedAccumulatedMs, setPausedAccumulatedMs] = useState<number>(0);
  const [pauseStartedAtMs, setPauseStartedAtMs] = useState<number>();
  const [clockTick, setClockTick] = useState<number>(Date.now());
  const savedCompletedCycleCountRef = useRef(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setClockTick(Date.now());
    }, 250);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    scannerBufferRef.current = scannerBuffer;
  }, [scannerBuffer]);

  useEffect(() => {
    scannerCharTimestampsRef.current = scannerCharTimestamps;
  }, [scannerCharTimestamps]);

  useEffect(() => {
    scannerInputRef.current?.focus();

    function maintainScannerFocus() {
      const activeElement = document.activeElement;
      if (activeElement === scannerInputRef.current) {
        return;
      }

      if (
        activeElement instanceof HTMLElement &&
        (activeElement.isContentEditable || activeElement.dataset.scannerEditable === 'true')
      ) {
        return;
      }

      scannerInputRef.current?.focus();
    }

    window.addEventListener('click', maintainScannerFocus);
    window.addEventListener('focus', maintainScannerFocus);

    return () => {
      window.removeEventListener('click', maintainScannerFocus);
      window.removeEventListener('focus', maintainScannerFocus);
    };
  }, []);

  useEffect(() => {
    if (!selectedSessionId && sessions.length > 0) {
      setSelectedSessionId(sessions[0].id);
    }
  }, [selectedSessionId, sessions]);

  const workflowSteps = useMemo(() => buildWorkflowSteps(barcodeConfiguration), [barcodeConfiguration]);

  useEffect(() => {
    if (!selectedSessionId) {
      setActiveSession(undefined);
      return;
    }

    async function loadSelectedSession() {
      const loaded = await loadSession(selectedSessionId);
      setActiveSession(loaded);
      setStatusMessage('');
      setExpandedCycleIndex(null);

      if (loaded) {
        setSessionStartedAtMs(new Date(loaded.startedAt).getTime());
        const acceptedCount = getStepProgress(loaded.eventLog);
        savedCompletedCycleCountRef.current = Math.floor(acceptedCount / workflowSteps.length);
      } else {
        savedCompletedCycleCountRef.current = 0;
      }

      setIsSessionRunning(false);
      setIsPaused(false);
      setPausedAccumulatedMs(0);
      setPauseStartedAtMs(undefined);
    }

    void loadSelectedSession();
  }, [selectedSessionId, loadSession, workflowSteps.length]);

  const acceptedWorkflowEvents = useMemo(
    () =>
      (activeSession?.eventLog ?? [])
        .filter(
          (event) =>
            event.type === 'scan-received' &&
            event.metadata?.workflowId === 'multi-range-v1' &&
            event.metadata?.matchedExpectation === true
        )
        .sort((left, right) => left.occurredAtMs - right.occurredAtMs),
    [activeSession?.eventLog]
  );

  const totalAcceptedCount = acceptedWorkflowEvents.length;
  const completedCycleCount = Math.floor(totalAcceptedCount / workflowSteps.length);
  const currentCycleAcceptedCount = totalAcceptedCount % workflowSteps.length;
  const currentCycleAcceptedEvents = useMemo(
    () => acceptedWorkflowEvents.slice(completedCycleCount * workflowSteps.length),
    [acceptedWorkflowEvents, completedCycleCount, workflowSteps.length]
  );

  const workflowStepIndex = currentCycleAcceptedCount;
  const currentStep = workflowSteps[workflowStepIndex];

  const elapsedSessionMs = useMemo(() => {
    if (!isSessionRunning) {
      return 0;
    }

    const pausedActiveDuration = isPaused && pauseStartedAtMs ? clockTick - pauseStartedAtMs : 0;
    return Math.max(0, clockTick - sessionStartedAtMs - pausedAccumulatedMs - pausedActiveDuration);
  }, [clockTick, isPaused, isSessionRunning, pauseStartedAtMs, pausedAccumulatedMs, sessionStartedAtMs]);

  const blockCounters = useMemo(
    () => getBlockProgressCounters(workflowStepIndex, workflowSteps),
    [workflowStepIndex, workflowSteps]
  );

  const activeBlock = useMemo(
    () => getActiveBlock(workflowStepIndex, workflowSteps),
    [workflowStepIndex, workflowSteps]
  );

  const blockTimers = useMemo(
    () => getBlockTimers(currentCycleAcceptedEvents, clockTick, workflowSteps),
    [clockTick, currentCycleAcceptedEvents, workflowSteps]
  );

  const fullCycleDurationMs = useMemo(() => {
    const startEvent = currentCycleAcceptedEvents.find((event) => event.metadata?.workflowBlock === 'start');
    const finalEvent = currentCycleAcceptedEvents
      .slice()
      .reverse()
      .find((event) => event.metadata?.workflowBlock === 'end');

    if (!startEvent) {
      return 0;
    }

    if (!finalEvent) {
      return Math.max(0, clockTick - startEvent.occurredAtMs);
    }

    return Math.max(0, finalEvent.occurredAtMs - startEvent.occurredAtMs);
  }, [clockTick, currentCycleAcceptedEvents]);

  const completedCycleSummaries = useMemo(() => {
    const summaries: Array<{
      cycleNumber: number;
      completedAt: string;
      fullCycleDurationMs: number;
      blockDurations: Record<BlockKey, number>;
    }> = [];

    for (let cycleIndex = 0; cycleIndex < completedCycleCount; cycleIndex += 1) {
      const startIndex = cycleIndex * workflowSteps.length;
      const cycleEvents = acceptedWorkflowEvents.slice(startIndex, startIndex + workflowSteps.length);
      const firstEvent = cycleEvents[0];
      const lastEvent = cycleEvents[cycleEvents.length - 1];

      if (!firstEvent || !lastEvent) {
        continue;
      }

      summaries.push({
        cycleNumber: cycleIndex + 1,
        completedAt: lastEvent.occurredAt,
        fullCycleDurationMs: Math.max(0, lastEvent.occurredAtMs - firstEvent.occurredAtMs),
        blockDurations: getBlockTimers(cycleEvents, lastEvent.occurredAtMs, workflowSteps),
      });
    }

    return summaries;
  }, [acceptedWorkflowEvents, completedCycleCount, workflowSteps]);

  const blockAverages = useMemo(() => {
    const stats: Record<BlockKey, { count: number; averageMs: number }> = {
      start: { count: 0, averageMs: 0 },
      travelStartToShort: { count: 0, averageMs: 0 },
      short4: { count: 0, averageMs: 0 },
      travelShortToMixed: { count: 0, averageMs: 0 },
      mixed: { count: 0, averageMs: 0 },
      travelMixedToLong: { count: 0, averageMs: 0 },
      long4: { count: 0, averageMs: 0 },
      travelLongToMid: { count: 0, averageMs: 0 },
      mid4: { count: 0, averageMs: 0 },
      travelMidToEnd: { count: 0, averageMs: 0 },
      end: { count: 0, averageMs: 0 },
    };

    for (const block of BLOCK_ORDER) {
      const durations = completedCycleSummaries
        .map((cycle) => cycle.blockDurations[block])
        .filter((duration) => duration > 0);

      if (durations.length === 0) {
        continue;
      }

      const total = durations.reduce((sum, duration) => sum + duration, 0);
      stats[block] = {
        count: durations.length,
        averageMs: Math.round(total / durations.length),
      };
    }

    return stats;
  }, [completedCycleSummaries]);

  const fullCycleAverageMs = useMemo(() => {
    if (completedCycleSummaries.length === 0) {
      return 0;
    }

    const total = completedCycleSummaries.reduce((sum, cycle) => sum + cycle.fullCycleDurationMs, 0);
    return Math.round(total / completedCycleSummaries.length);
  }, [completedCycleSummaries]);

  const expectedBarcodeContentForCurrentStep = currentStep ? currentStep.expectedBarcodeContent : '';

  function isLikelyScannerBurst(barcodeText: string, timestamps: number[]) {
    if (barcodeText.length < 4 || timestamps.length <= 1) {
      return false;
    }

    const first = timestamps[0];
    const last = timestamps[timestamps.length - 1];
    const averageIntervalMs = (last - first) / (timestamps.length - 1);

    return averageIntervalMs <= 120;
  }

  async function processCapturedBarcode(
    rawBarcode: string,
    source: 'scanner',
    capturedAtMs: number
  ) {
    if (!activeSession || !currentStep || !isSessionRunning || isPaused || isSaving) {
      return;
    }

    const rawValue = rawBarcode.trim();
    if (!rawValue) {
      return;
    }

    const autoClassification = classifyBarcodeType(rawValue, {
      settings: DEFAULT_BARCODE_CLASSIFICATION_SETTINGS,
    });

    const finalClassification = classifyBarcodeType(rawValue, {
      settings: DEFAULT_BARCODE_CLASSIFICATION_SETTINGS,
    });

    const inferredType = autoClassification.type;
    const classifiedType = finalClassification.type;
    const normalizedActualBarcode = normalizeBarcodeContent(finalClassification.normalizedValue);
    const matchedEventsForBlock = currentCycleAcceptedEvents.filter(
      (event) =>
        event.type === 'scan-received' &&
        event.metadata?.workflowId === 'multi-range-v1' &&
        event.metadata?.workflowBlock === currentStep.block &&
        event.metadata?.matchedExpectation === true
    );

    const matchedBarcodesForBlock = new Set(
      matchedEventsForBlock
        .map((event) => normalizeBarcodeContent(event.barcode?.normalizedValue ?? ''))
        .filter((value) => value.length > 0)
    );

    const remainingParcelValues = barcodeConfiguration.parcelBarcodes
      .map((barcode) => normalizeBarcodeContent(barcode))
      .filter((barcode) => barcode.length > 0 && !matchedBarcodesForBlock.has(barcode));

    const remainingCeilingValues = barcodeConfiguration.ceilingBarcodes
      .map((barcode) => normalizeBarcodeContent(barcode))
      .filter((barcode) => barcode.length > 0 && !matchedBarcodesForBlock.has(barcode));

    let expectedContent = normalizeBarcodeContent(currentStep.expectedBarcodeContent);
    let matchedExpectedContent = normalizedActualBarcode === expectedContent;

    if (currentStep.block === 'short4' || currentStep.block === 'mid4') {
      matchedExpectedContent = remainingParcelValues.includes(normalizedActualBarcode);
      expectedContent = remainingParcelValues.join(' | ');
    }

    if (currentStep.block === 'mixed' && currentStep.expectedType === 'parcel') {
      matchedExpectedContent = remainingParcelValues.includes(normalizedActualBarcode);
      expectedContent = remainingParcelValues.join(' | ');
    }

    if (currentStep.block === 'long4') {
      matchedExpectedContent = remainingCeilingValues.includes(normalizedActualBarcode);
      expectedContent = remainingCeilingValues.join(' | ');
    }

    const hasExpectedContent = expectedContent.length > 0;
    const actualType =
      classifiedType === 'unknown' && hasExpectedContent && matchedExpectedContent
        ? currentStep.expectedType
        : classifiedType;
    const matchedExpectation = matchedExpectedContent;

    const saved = await appendEvent(activeSession.id, {
      type: 'scan-received',
      phase: currentStep.phase,
      classifier: currentStep.phase,
      isSuccessful: matchedExpectation,
      occurredAt: new Date(capturedAtMs).toISOString(),
      occurredAtMs: capturedAtMs,
      barcode: {
        rawValue,
        normalizedValue: finalClassification.normalizedValue,
        source: 'keyboard-wedge',
        characterCount: finalClassification.characterCount,
      },
      metadata: {
        workflowId: 'multi-range-v1',
        workflowStepIndex: currentStep.index,
        workflowBlock: currentStep.block,
        expectedScanType: currentStep.expectedType,
        actualScanType: actualType,
        classifiedScanType: classifiedType,
        inferredScanType: inferredType,
        matchedExpectation,
        ...(hasExpectedContent ? { expectedBarcodeContent: expectedContent } : {}),
        matchedExpectedBarcodeContent: matchedExpectedContent,
        manualOverride: false,
        matchedBy: finalClassification.matchedBy,
        matchedRule: finalClassification.matchedRule ?? 'n/a',
        inputSource: source,
      },
    });

    if (saved) {
      setActiveSession(saved);
      setLastCapturedBarcode(rawValue);
      setLastCapturedAtMs(capturedAtMs);
      setStatusMessage(
        matchedExpectation
          ? `Accepted: ${actualType}. Next step advanced.`
          : hasExpectedContent
            ? `Recorded mismatch. Expected ${currentStep.expectedType} and content "${expectedContent}", got ${actualType}.`
            : `Recorded mismatch. Expected ${currentStep.expectedType}, got ${actualType}.`
      );
      setValidationMessage(
        matchedExpectation
          ? `Matched expected barcode content for ${currentStep.label}.`
          : hasExpectedContent
            ? `Mismatch: expected "${expectedContent}", captured "${finalClassification.normalizedValue}".`
            : `No expected barcode content configured for ${currentStep.label}.`
      );
    }
  }

  function updateStartBarcode(value: string) {
    setBarcodeConfiguration((previous) => ({ ...previous, startBarcode: value }));
  }

  function updateFinalBarcode(value: string) {
    setBarcodeConfiguration((previous) => ({ ...previous, finalBarcode: value }));
  }

  function updatePalletBarcode(value: string) {
    setBarcodeConfiguration((previous) => ({ ...previous, palletBarcode: value }));
  }

  function updatePalletCeilingBarcode(value: string) {
    setBarcodeConfiguration((previous) => ({ ...previous, palletCeilingBarcode: value }));
  }

  function updateParcelBarcode(index: number, value: string) {
    setBarcodeConfiguration((previous) => {
      const parcelBarcodes = [...previous.parcelBarcodes] as BarcodeConfiguration['parcelBarcodes'];
      parcelBarcodes[index] = value;

      return {
        ...previous,
        parcelBarcodes,
      };
    });
  }

  function updateCeilingBarcode(index: number, value: string) {
    setBarcodeConfiguration((previous) => {
      const ceilingBarcodes = [...previous.ceilingBarcodes] as BarcodeConfiguration['ceilingBarcodes'];
      ceilingBarcodes[index] = value;

      return {
        ...previous,
        ceilingBarcodes,
      };
    });
  }

  async function completeScannerBuffer(
    barcodeOverride?: string,
    timestampsOverride?: number[]
  ) {
    const capturedBarcode = (barcodeOverride ?? scannerBuffer).trim();
    const timestamps = timestampsOverride ?? scannerCharTimestamps;

    if (!capturedBarcode) {
      setScannerBuffer('');
      setScannerCharTimestamps([]);
      return;
    }

    if (!isLikelyScannerBurst(capturedBarcode, timestamps)) {
      setValidationMessage('Input ignored as manual typing. Scanner capture only.');
      setScannerBuffer('');
      setScannerCharTimestamps([]);
      return;
    }

    const capturedAtMs = Date.now();
    await processCapturedBarcode(capturedBarcode, 'scanner', capturedAtMs);
    setScannerBuffer('');
    setScannerCharTimestamps([]);
  }

  function scheduleScannerFlush() {
    if (scannerFlushTimeoutRef.current) {
      window.clearTimeout(scannerFlushTimeoutRef.current);
    }

    scannerFlushTimeoutRef.current = window.setTimeout(() => {
      void completeScannerBuffer(scannerBufferRef.current, scannerCharTimestampsRef.current);
    }, 90);
  }

  async function processScannerKey(key: string) {
    if (!isSessionRunning || isPaused || isSaving) {
      return;
    }

    if (key === 'Enter' || key === 'Tab') {
      await completeScannerBuffer();
      return;
    }

    if (key === 'Backspace') {
      setScannerBuffer((previous) => previous.slice(0, -1));
      setScannerCharTimestamps((previous) => previous.slice(0, -1));
      return;
    }

    if (key === 'Escape') {
      setScannerBuffer('');
      setScannerCharTimestamps([]);
      return;
    }

    if (key.length === 1) {
      const nowMs = Date.now();
      setScannerBuffer((previous) => {
        const next = `${previous}${key}`;
        scannerBufferRef.current = next;
        return next;
      });
      setScannerCharTimestamps((previous) => {
        const next = [...previous, nowMs];
        scannerCharTimestampsRef.current = next;
        return next;
      });
      scheduleScannerFlush();
    }
  }

  async function handleScannerKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    event.preventDefault();
    await processScannerKey(event.key);
  }

  async function handleScannerInputChange(value: string) {
    if (value.includes('\n') || value.includes('\r')) {
      const normalized = value.replace(/[\r\n]+/g, '').trim();

      if (normalized) {
        const syntheticTimestamps = Array.from({ length: normalized.length }, (_, index) =>
          Date.now() + index * 5
        );
        setScannerBuffer(normalized);
        setScannerCharTimestamps(syntheticTimestamps);
        await completeScannerBuffer(normalized, syntheticTimestamps);
      }

      return;
    }

    setScannerBuffer(value);
  }

  useEffect(() => {
    function onWindowKeyDown(event: globalThis.KeyboardEvent) {
      if (isEditableElement(document.activeElement)) {
        return;
      }

      if (!isSessionRunning || isPaused || isSaving) {
        return;
      }

      event.preventDefault();
      void processScannerKey(event.key);
    }

    window.addEventListener('keydown', onWindowKeyDown);

    return () => {
      window.removeEventListener('keydown', onWindowKeyDown);
    };
  }, [isPaused, isSaving, isSessionRunning, processScannerKey]);

  useEffect(() => {
    return () => {
      if (scannerFlushTimeoutRef.current) {
        window.clearTimeout(scannerFlushTimeoutRef.current);
      }
    };
  }, []);

  async function handlePauseResume() {
    if (!activeSession || !isSessionRunning) {
      return;
    }

    if (isPaused) {
      const pausedFor = pauseStartedAtMs ? Date.now() - pauseStartedAtMs : 0;
      setPausedAccumulatedMs((previous) => previous + pausedFor);
      setPauseStartedAtMs(undefined);
      setIsPaused(false);

      const saved = await appendEvent(activeSession.id, {
        type: 'session-note',
        note: 'Workflow resumed',
        metadata: {
          workflowId: 'multi-range-v1',
          action: 'resume',
        },
      });

      if (saved) {
        setActiveSession(saved);
      }

      scannerInputRef.current?.focus();

      return;
    }

    setPauseStartedAtMs(Date.now());
    setIsPaused(true);

    const saved = await appendEvent(activeSession.id, {
      type: 'session-note',
      note: 'Workflow paused',
      metadata: {
        workflowId: 'multi-range-v1',
        action: 'pause',
      },
    });

    if (saved) {
      setActiveSession(saved);
    }

    scannerInputRef.current?.focus();
  }

  async function handleReset() {
    if (!activeSession) {
      return;
    }

    const resetSession: TestSession = {
      ...activeSession,
      eventLog: [],
      endedAt: undefined,
    };

    const saved = await updateExistingSession(resetSession);
    setActiveSession(saved);
    setSessionStartedAtMs(Date.now());
    setPausedAccumulatedMs(0);
    setPauseStartedAtMs(undefined);
    setIsPaused(false);
    setIsSessionRunning(false);
    setStatusMessage('Workflow reset. Event log cleared.');
  }

  async function handleStartSession() {
    if (!activeSession || isSaving || isSessionRunning) {
      return;
    }

    const nowMs = Date.now();
    setSessionStartedAtMs(nowMs);
    setPausedAccumulatedMs(0);
    setPauseStartedAtMs(undefined);
    setIsPaused(false);
    setIsSessionRunning(true);
    setStatusMessage('Session timer started.');

    const saved = await appendEvent(activeSession.id, {
      type: 'session-note',
      note: 'Workflow timer started',
      metadata: {
        workflowId: 'multi-range-v1',
        action: 'start',
      },
    });

    if (saved) {
      setActiveSession(saved);
    }
  }

  useEffect(() => {
    async function persistCompletedCycleNote() {
      if (!activeSession) {
        return;
      }

      if (completedCycleCount <= savedCompletedCycleCountRef.current) {
        return;
      }

      const latestCycle = completedCycleSummaries[completedCycleCount - 1];
      if (!latestCycle) {
        return;
      }

      savedCompletedCycleCountRef.current = completedCycleCount;
      setStatusMessage(`Cycle ${latestCycle.cycleNumber} completed in ${formatDuration(latestCycle.fullCycleDurationMs)}.`);

      const saved = await appendEvent(activeSession.id, {
        type: 'session-note',
        note: `Cycle ${latestCycle.cycleNumber} completed`,
        metadata: {
          workflowId: 'multi-range-v1',
          action: 'cycle-complete',
          cycleNumber: latestCycle.cycleNumber,
          cycleDurationMs: latestCycle.fullCycleDurationMs,
        },
      });

      if (saved) {
        setActiveSession(saved);
      }
    }

    void persistCompletedCycleNote();
  }, [activeSession, appendEvent, completedCycleCount, completedCycleSummaries]);

  function handleSessionChange(sessionId: string) {
    setSelectedSessionId(sessionId);
    setSearchParams((previousParams) => {
      const updated = new URLSearchParams(previousParams);
      updated.set('sessionId', sessionId);
      return updated;
    });
  }

  return (
    <section className="panel runner-panel">
      <h2>Guided Workflow Runner</h2>
      <p className="muted">Workflow: multi-range-v1</p>

      <div className="runner-toolbar">
        <label className="runner-inline-label">
          Active Session
          <select
            className="session-input"
            value={selectedSessionId}
            onChange={(event) => handleSessionChange(event.target.value)}
            disabled={isLoadingSessions || sessions.length === 0}
          >
            {sessions.length === 0 ? <option value="">No sessions available</option> : null}
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.testerName} — {new Date(session.startedAt).toLocaleString()}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="btn-secondary" onClick={() => void refreshSessions()}>
          Refresh Sessions
        </button>
      </div>

      {error ? <ErrorState title="Runner error" description={error} /> : null}

      {!activeSession ? (
        <EmptyState
          title="No active session selected"
          description="Create or select a session to run the guided workflow."
        />
      ) : null}

      {activeSession ? (
        <>
          <div className="runner-status-grid">
            <div className="runner-card">
              <p className="runner-card-title">Current Block</p>
              <p className="runner-card-value">{BLOCK_LABELS[activeBlock]}</p>
            </div>
            <div className="runner-card">
              <p className="runner-card-title">Expected Next Scan</p>
              <p className="runner-card-value">{currentStep.expectedLabel}</p>
            </div>
            <div className={isSessionRunning && !isPaused ? 'runner-card runner-card-active' : 'runner-card'}>
              <p className="runner-card-title">Session Timer</p>
              <p className="runner-card-value">{formatDuration(elapsedSessionMs)}</p>
            </div>
            <div className="runner-card">
              <p className="runner-card-title">Progress</p>
              <p className="runner-card-value">
                {workflowStepIndex}/{workflowSteps.length}
              </p>
            </div>
          </div>

          <div className="runner-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => void handleStartSession()}
              disabled={isSessionRunning || isSaving}
            >
              Start Session
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void handlePauseResume()}
              disabled={!isSessionRunning || isSaving}
            >
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            <button type="button" className="btn-danger" onClick={() => void handleReset()} disabled={isSaving}>
              Reset
            </button>
          </div>

          <input
            ref={scannerInputRef}
            className="runner-hidden-scanner-input"
            aria-label="Scanner capture"
            value={scannerBuffer}
            onChange={(event) => void handleScannerInputChange(event.target.value)}
            onKeyDown={(event) => void handleScannerKeyDown(event)}
            autoComplete="off"
            spellCheck={false}
            tabIndex={-1}
          />

          <div className="runner-progress-panel">
            <div className="session-links-header">
              <h3>Expected Barcode Content</h3>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsBarcodeConfigOpen((previous) => !previous)}
                aria-expanded={isBarcodeConfigOpen}
              >
                {isBarcodeConfigOpen ? 'Hide' : 'Show'}
              </button>
            </div>

            {isBarcodeConfigOpen ? (
              <>
                <p className="muted">
                  Define exact barcode values before start. Matching is exact (case-insensitive, trimmed).
                </p>
                <div className="session-form-grid">
                  <label className="session-field">
                    <span className="session-label">Start Barcode</span>
                    <input
                      className="session-input"
                      data-scanner-editable="true"
                      value={barcodeConfiguration.startBarcode}
                      onChange={(event) => updateStartBarcode(event.target.value)}
                      placeholder="Expected start barcode content"
                      disabled={isSessionRunning}
                    />
                  </label>

                  <label className="session-field">
                    <span className="session-label">Final Barcode</span>
                    <input
                      className="session-input"
                      data-scanner-editable="true"
                      value={barcodeConfiguration.finalBarcode}
                      onChange={(event) => updateFinalBarcode(event.target.value)}
                      placeholder="Expected final barcode content"
                      disabled={isSessionRunning}
                    />
                  </label>

                  <label className="session-field">
                    <span className="session-label">Pallet Barcode</span>
                    <input
                      className="session-input"
                      data-scanner-editable="true"
                      value={barcodeConfiguration.palletBarcode}
                      onChange={(event) => updatePalletBarcode(event.target.value)}
                      placeholder="Expected pallet barcode content"
                      disabled={isSessionRunning}
                    />
                  </label>

                  <label className="session-field">
                    <span className="session-label">Pallet Ceiling Barcode</span>
                    <input
                      className="session-input"
                      data-scanner-editable="true"
                      value={barcodeConfiguration.palletCeilingBarcode}
                      onChange={(event) => updatePalletCeilingBarcode(event.target.value)}
                      placeholder="Expected pallet ceiling barcode content"
                      disabled={isSessionRunning}
                    />
                  </label>

                  {barcodeConfiguration.parcelBarcodes.map((barcodeValue, index) => (
                    <label key={`parcel-${index + 1}`} className="session-field">
                      <span className="session-label">Parcel Barcode {index + 1}</span>
                      <input
                        className="session-input"
                        data-scanner-editable="true"
                        value={barcodeValue}
                        onChange={(event) => updateParcelBarcode(index, event.target.value)}
                        placeholder={`Expected parcel barcode ${index + 1}`}
                        disabled={isSessionRunning}
                      />
                    </label>
                  ))}

                  {barcodeConfiguration.ceilingBarcodes.map((barcodeValue, index) => (
                    <label key={`ceiling-${index + 1}`} className="session-field">
                      <span className="session-label">Ceiling Barcode {index + 1}</span>
                      <input
                        className="session-input"
                        data-scanner-editable="true"
                        value={barcodeValue}
                        onChange={(event) => updateCeilingBarcode(index, event.target.value)}
                        placeholder={`Expected ceiling barcode ${index + 1}`}
                        disabled={isSessionRunning}
                      />
                    </label>
                  ))}
                </div>

                <p className="muted">
                  Active expected content: {expectedBarcodeContentForCurrentStep || 'Not set for this step'}
                </p>
              </>
            ) : null}
          </div>

          <div className="runner-progress-panel">
            <h3>Scanner Capture</h3>
            <p className="muted">
              Hidden scanner input is active globally. Complete scans with Enter, Tab, or newline.
            </p>
            <p>
              Last Captured: {lastCapturedBarcode || '—'}
              {lastCapturedAtMs ? ` at ${new Date(lastCapturedAtMs).toLocaleTimeString()}` : ''}
            </p>
            {validationMessage ? (
              <p className={validationMessage.startsWith('Mismatch') ? 'field-error' : 'status-ok'}>
                {validationMessage}
              </p>
            ) : null}
          </div>

          <div className="runner-progress-panel">
            <h3>Block Progress & Timers</h3>
            <table className="history-table" aria-label="Workflow block progress and timers">
              <caption className="visually-hidden">Workflow block progress and timers</caption>
              <thead>
                <tr>
                  <th>Block</th>
                  <th>Progress</th>
                  <th>Timer</th>
                </tr>
              </thead>
              <tbody>
                {BLOCK_ORDER.map((block) => (
                  <tr key={block} className={activeBlock === block ? 'block-row-active' : undefined}>
                    <td>{BLOCK_LABELS[block]}</td>
                    <td>
                      {blockCounters[block].completed}/{blockCounters[block].expected}
                    </td>
                    <td>{formatDuration(blockTimers[block])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="runner-progress-panel">
            <h3>Completed Cycles</h3>
            {completedCycleSummaries.length === 0 ? (
              <p className="muted">No completed full cycles yet.</p>
            ) : (
              <table className="history-table" aria-label="Completed cycle summaries">
                <thead>
                  <tr>
                    <th>Cycle</th>
                    <th>Completed At</th>
                    <th>Full Cycle Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {completedCycleSummaries.map((cycle, index) => (
                    <Fragment key={`cycle-${cycle.cycleNumber}`}>
                      <tr>
                        <td>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() =>
                              setExpandedCycleIndex((previous) => (previous === index ? null : index))
                            }
                          >
                            Cycle {cycle.cycleNumber}
                          </button>
                        </td>
                        <td>{formatDateTimeWithMilliseconds(cycle.completedAt)}</td>
                        <td>{formatDuration(cycle.fullCycleDurationMs)}</td>
                      </tr>
                      {expandedCycleIndex === index ? (
                        <tr>
                          <td colSpan={3}>
                            <table className="history-table" aria-label={`Cycle ${cycle.cycleNumber} block timings`}>
                              <thead>
                                <tr>
                                  <th>Block</th>
                                  <th>Duration</th>
                                </tr>
                              </thead>
                              <tbody>
                                {BLOCK_ORDER.map((block) => (
                                  <tr key={`${cycle.cycleNumber}-${block}`}>
                                    <td>{BLOCK_LABELS[block]}</td>
                                    <td>{formatDuration(cycle.blockDurations[block])}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="runner-progress-panel">
            <h3>Session Block Averages</h3>
            <table className="history-table" aria-label="Average block durations and counts in session">
              <thead>
                <tr>
                  <th>Block</th>
                  <th>Recorded Count</th>
                  <th>Average Duration</th>
                </tr>
              </thead>
              <tbody>
                {BLOCK_ORDER.map((block) => (
                  <tr key={`avg-${block}`}>
                    <td>{BLOCK_LABELS[block]}</td>
                    <td>{blockAverages[block].count}</td>
                    <td>{formatDuration(blockAverages[block].averageMs)}</td>
                  </tr>
                ))}
                <tr>
                  <td>Full Cycle</td>
                  <td>{completedCycleSummaries.length}</td>
                  <td>{formatDuration(fullCycleAverageMs)}</td>
                </tr>
              </tbody>
            </table>
            <p className="muted">Current in-progress full cycle: {formatDuration(fullCycleDurationMs)}</p>
          </div>

          <div className="runner-progress-panel">
            <h3>Recent Event Log</h3>
            <table className="history-table" aria-label="Recent event log">
              <caption className="visually-hidden">Recent workflow scan events</caption>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Block</th>
                  <th>Expected</th>
                  <th>Actual Barcode</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {activeSession.eventLog
                  .filter((event) => event.type === 'scan-received')
                  .slice(-8)
                  .reverse()
                  .map((event) => (
                    <tr key={event.id}>
                      <td>{formatDateTimeWithMilliseconds(event.occurredAt)}</td>
                      <td>{String(event.metadata?.workflowBlock ?? 'n/a')}</td>
                      <td>{String(event.metadata?.expectedBarcodeContent ?? 'n/a')}</td>
                      <td>{event.barcode?.normalizedValue ?? 'n/a'}</td>
                      <td className={event.isSuccessful === false ? 'log-result-mismatch' : 'log-result-accepted'}>
                        {event.isSuccessful === false ? 'Mismatch' : 'Accepted'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {statusMessage ? <p className="status-ok" role="status" aria-live="polite">{statusMessage}</p> : null}
    </section>
  );
}
