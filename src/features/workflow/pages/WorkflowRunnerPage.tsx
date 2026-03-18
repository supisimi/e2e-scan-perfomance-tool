import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
type ScanInputMode = 'auto' | ScanType;
type BlockKey = 'start' | 'short4' | 'mixed' | 'long4' | 'mid4' | 'end';

interface WorkflowStep {
  index: number;
  block: BlockKey;
  expectedType: ScanType;
  phase?: 'short4' | 'mixed' | 'long4' | 'mid4';
  label: string;
}

const MIXED_PATTERN: ScanType[] = ['parcel', 'pallet', 'ceiling', 'parcel'];

const WORKFLOW_STEPS: WorkflowStep[] = [
  { index: 0, block: 'start', expectedType: 'start', label: 'Start Barcode' },
  ...Array.from({ length: 4 }, (_, index) => ({
    index: index + 1,
    block: 'short4' as const,
    expectedType: 'parcel' as const,
    phase: 'short4' as const,
    label: `Short Block ${index + 1}/4`,
  })),
  ...Array.from({ length: 16 }, (_, index) => ({
    index: index + 5,
    block: 'mixed' as const,
    expectedType: MIXED_PATTERN[index % MIXED_PATTERN.length],
    phase: 'mixed' as const,
    label: `Mixed Block ${index + 1}/16`,
  })),
  ...Array.from({ length: 4 }, (_, index) => ({
    index: index + 21,
    block: 'long4' as const,
    expectedType: 'ceiling' as const,
    phase: 'long4' as const,
    label: `Long Block ${index + 1}/4`,
  })),
  ...Array.from({ length: 4 }, (_, index) => ({
    index: index + 25,
    block: 'mid4' as const,
    expectedType: 'parcel' as const,
    phase: 'mid4' as const,
    label: `Mid Block ${index + 1}/4`,
  })),
  { index: 29, block: 'end', expectedType: 'start', label: 'End Cycle Barcode' },
];

const BLOCK_ORDER: BlockKey[] = ['start', 'short4', 'mixed', 'long4', 'mid4', 'end'];

const BLOCK_LABELS: Record<BlockKey, string> = {
  start: 'Start Barcode',
  short4: 'Short Block',
  mixed: 'Mixed Block',
  long4: 'Long Block',
  mid4: 'Mid Block',
  end: 'Final Barcode',
};

function formatDuration(durationMs: number) {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function getStepProgress(eventLog: ScanEvent[]) {
  const accepted = eventLog.filter(
    (event) =>
      event.type === 'scan-received' &&
      event.metadata?.workflowId === 'multi-range-v1' &&
      event.metadata?.matchedExpectation === true
  );

  return Math.min(accepted.length, WORKFLOW_STEPS.length);
}

function getBlockProgressCounters(stepIndex: number) {
  const counters: Record<BlockKey, { completed: number; expected: number }> = {
    start: { completed: 0, expected: 1 },
    short4: { completed: 0, expected: 4 },
    mixed: { completed: 0, expected: 16 },
    long4: { completed: 0, expected: 4 },
    mid4: { completed: 0, expected: 4 },
    end: { completed: 0, expected: 1 },
  };

  for (let index = 0; index < stepIndex; index += 1) {
    const step = WORKFLOW_STEPS[index];
    counters[step.block].completed += 1;
  }

  return counters;
}

function getBlockTimers(eventLog: ScanEvent[], nowMs: number) {
  const result: Record<BlockKey, number> = {
    start: 0,
    short4: 0,
    mixed: 0,
    long4: 0,
    mid4: 0,
    end: 0,
  };

  for (const block of BLOCK_ORDER) {
    const blockEvents = eventLog
      .filter(
        (event) =>
          event.type === 'scan-received' &&
          event.metadata?.workflowId === 'multi-range-v1' &&
          event.metadata?.workflowBlock === block
      )
      .sort((left, right) => left.occurredAtMs - right.occurredAtMs);

    if (blockEvents.length === 0) {
      continue;
    }

    const first = blockEvents[0].occurredAtMs;
    const last = blockEvents[blockEvents.length - 1].occurredAtMs;

    result[block] = blockEvents.length > 1 ? last - first : Math.max(0, nowMs - first);
  }

  return result;
}

export function WorkflowRunnerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSessionId = searchParams.get('sessionId') ?? '';

  const { sessions, isLoading: isLoadingSessions, refreshSessions } = useSessions();
  const { loadSession, appendEvent, updateExistingSession, isSaving, error } = useSessionPersistence();

  const [selectedSessionId, setSelectedSessionId] = useState(initialSessionId);
  const [activeSession, setActiveSession] = useState<TestSession>();
  const scannerInputRef = useRef<HTMLInputElement>(null);
  const [scannerBuffer, setScannerBuffer] = useState('');
  const [scannerCharTimestamps, setScannerCharTimestamps] = useState<number[]>([]);
  const [manualInput, setManualInput] = useState('');
  const [scanMode, setScanMode] = useState<ScanInputMode>('auto');
  const [statusMessage, setStatusMessage] = useState('');
  const [lastCapturedBarcode, setLastCapturedBarcode] = useState('');
  const [lastCapturedAtMs, setLastCapturedAtMs] = useState<number>();
  const [validationMessage, setValidationMessage] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [sessionStartedAtMs, setSessionStartedAtMs] = useState<number>(Date.now());
  const [pausedAccumulatedMs, setPausedAccumulatedMs] = useState<number>(0);
  const [pauseStartedAtMs, setPauseStartedAtMs] = useState<number>();
  const [clockTick, setClockTick] = useState<number>(Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setClockTick(Date.now());
    }, 250);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    scannerInputRef.current?.focus();

    function maintainScannerFocus() {
      const activeElement = document.activeElement;
      if (activeElement === scannerInputRef.current) {
        return;
      }

      if (
        activeElement instanceof HTMLElement &&
        activeElement.dataset.scannerFallback === 'true'
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

  useEffect(() => {
    if (!selectedSessionId) {
      setActiveSession(undefined);
      return;
    }

    async function loadSelectedSession() {
      const loaded = await loadSession(selectedSessionId);
      setActiveSession(loaded);
      setStatusMessage('');

      if (loaded) {
        setSessionStartedAtMs(new Date(loaded.startedAt).getTime());
      }
    }

    void loadSelectedSession();
  }, [selectedSessionId, loadSession]);

  const workflowStepIndex = useMemo(
    () => (activeSession ? getStepProgress(activeSession.eventLog) : 0),
    [activeSession]
  );

  const currentStep = WORKFLOW_STEPS[workflowStepIndex];
  const isCompleted = workflowStepIndex >= WORKFLOW_STEPS.length;

  const elapsedSessionMs = useMemo(() => {
    const pausedActiveDuration = isPaused && pauseStartedAtMs ? clockTick - pauseStartedAtMs : 0;
    return Math.max(0, clockTick - sessionStartedAtMs - pausedAccumulatedMs - pausedActiveDuration);
  }, [clockTick, isPaused, pauseStartedAtMs, pausedAccumulatedMs, sessionStartedAtMs]);

  const blockCounters = useMemo(() => getBlockProgressCounters(workflowStepIndex), [workflowStepIndex]);

  const blockTimers = useMemo(
    () => getBlockTimers(activeSession?.eventLog ?? [], clockTick),
    [activeSession?.eventLog, clockTick]
  );

  function isLikelyScannerBurst(barcodeText: string, timestamps: number[]) {
    if (barcodeText.length < 4 || timestamps.length <= 1) {
      return false;
    }

    const first = timestamps[0];
    const last = timestamps[timestamps.length - 1];
    const averageIntervalMs = (last - first) / (timestamps.length - 1);

    return averageIntervalMs <= 45;
  }

  async function processCapturedBarcode(
    rawBarcode: string,
    source: 'scanner' | 'manual',
    capturedAtMs: number
  ) {
    if (!activeSession || !currentStep || isPaused || isSaving || isCompleted) {
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
      manualOverride: scanMode === 'auto' ? undefined : scanMode,
    });

    const inferredType = autoClassification.type;
    const actualType = finalClassification.type;
    const matchedExpectation = actualType === currentStep.expectedType;

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
        inferredScanType: inferredType,
        matchedExpectation,
        manualOverride: scanMode !== 'auto',
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
          : `Recorded mismatch. Expected ${currentStep.expectedType}, got ${actualType}.`
      );
      setValidationMessage(
        matchedExpectation
          ? `Matched expected type: ${currentStep.expectedType}.`
          : actualType === 'unknown'
            ? `Unknown barcode type. Expected ${currentStep.expectedType}. Use manual override to correct.`
            : `Mismatch: expected ${currentStep.expectedType}, captured ${actualType}.`
      );
    }
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
      setValidationMessage('Input ignored as manual typing. Use Manual Input for keyboard testing.');
      setScannerBuffer('');
      setScannerCharTimestamps([]);
      return;
    }

    const capturedAtMs = Date.now();
    await processCapturedBarcode(capturedBarcode, 'scanner', capturedAtMs);
    setScannerBuffer('');
    setScannerCharTimestamps([]);
  }

  async function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = manualInput.trim();
    if (!value) {
      return;
    }

    await processCapturedBarcode(value, 'manual', Date.now());
    setManualInput('');
  }

  async function handleScannerKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (isPaused || isCompleted || isSaving) {
      return;
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      await completeScannerBuffer();
      return;
    }

    if (event.key === 'Backspace') {
      event.preventDefault();
      setScannerBuffer((previous) => previous.slice(0, -1));
      setScannerCharTimestamps((previous) => previous.slice(0, -1));
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setScannerBuffer('');
      setScannerCharTimestamps([]);
      return;
    }

    if (event.key.length === 1) {
      event.preventDefault();
      const nowMs = Date.now();
      setScannerBuffer((previous) => `${previous}${event.key}`);
      setScannerCharTimestamps((previous) => [...previous, nowMs]);
    }
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

  async function handlePauseResume() {
    if (!activeSession) {
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
    setStatusMessage('Workflow reset. Event log cleared.');
  }

  const markCompletedIfNeeded = useCallback(async () => {
    if (!activeSession || !isCompleted || activeSession.endedAt) {
      return;
    }

    const updated = await updateExistingSession({
      ...activeSession,
      endedAt: new Date().toISOString(),
    });

    setActiveSession(updated);
    setStatusMessage('Workflow completed. Final start barcode received.');
  }, [activeSession, isCompleted, updateExistingSession]);

  useEffect(() => {
    void markCompletedIfNeeded();
  }, [markCompletedIfNeeded]);

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
              <p className="runner-card-value">{isCompleted ? 'Completed' : BLOCK_LABELS[currentStep.block]}</p>
            </div>
            <div className="runner-card">
              <p className="runner-card-title">Expected Next Scan</p>
              <p className="runner-card-value">{isCompleted ? 'None' : currentStep.expectedType}</p>
            </div>
            <div className="runner-card">
              <p className="runner-card-title">Session Timer</p>
              <p className="runner-card-value">{formatDuration(elapsedSessionMs)}</p>
            </div>
            <div className="runner-card">
              <p className="runner-card-title">Progress</p>
              <p className="runner-card-value">
                {workflowStepIndex}/{WORKFLOW_STEPS.length}
              </p>
            </div>
          </div>

          <div className="runner-actions">
            <button type="button" className="btn-secondary" onClick={() => void handlePauseResume()} disabled={isSaving}>
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

          <form className="runner-scan-form" onSubmit={handleManualSubmit}>
            <label className="session-field">
              <span className="session-label">Manual Input (Fallback)</span>
              <input
                className="session-input"
                data-scanner-fallback="true"
                value={manualInput}
                onChange={(event) => setManualInput(event.target.value)}
                placeholder="Type barcode and press Record"
                disabled={isPaused || isCompleted || isSaving}
              />
            </label>

            <label className="session-field">
              <span className="session-label">Manual Override</span>
              <select
                className="session-input"
                value={scanMode}
                onChange={(event) => setScanMode(event.target.value as ScanInputMode)}
                disabled={isPaused || isCompleted || isSaving}
              >
                <option value="auto">Auto detect</option>
                <option value="parcel">parcel</option>
                <option value="pallet">pallet</option>
                <option value="ceiling">ceiling</option>
                <option value="start">start</option>
                <option value="unknown">unknown</option>
              </select>
            </label>

            <button type="submit" className="btn-primary" disabled={isPaused || isCompleted || isSaving}>
              Record Manual Scan
            </button>
          </form>

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
                  <tr key={block}>
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
            <h3>Live Metrics</h3>
            <table className="history-table" aria-label="Live workflow metrics">
              <caption className="visually-hidden">Live workflow metrics by block and full cycle</caption>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Total</th>
                  <th>Success</th>
                  <th>Failed</th>
                  <th>Avg Interval (ms)</th>
                  <th>Duration (ms)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>short4</td>
                  <td>{activeSession.metrics?.byPhase.short4.totalScans ?? 0}</td>
                  <td>{activeSession.metrics?.byPhase.short4.successfulScans ?? 0}</td>
                  <td>{activeSession.metrics?.byPhase.short4.failedScans ?? 0}</td>
                  <td>{activeSession.metrics?.byPhase.short4.averageScanIntervalMs ?? 0}</td>
                  <td>{activeSession.metrics?.byPhase.short4.window.durationMs ?? 0}</td>
                </tr>
                <tr>
                  <td>mixed</td>
                  <td>{activeSession.metrics?.byPhase.mixed.totalScans ?? 0}</td>
                  <td>{activeSession.metrics?.byPhase.mixed.successfulScans ?? 0}</td>
                  <td>{activeSession.metrics?.byPhase.mixed.failedScans ?? 0}</td>
                  <td>{activeSession.metrics?.byPhase.mixed.averageScanIntervalMs ?? 0}</td>
                  <td>{activeSession.metrics?.byPhase.mixed.window.durationMs ?? 0}</td>
                </tr>
                <tr>
                  <td>long4</td>
                  <td>{activeSession.metrics?.byPhase.long4.totalScans ?? 0}</td>
                  <td>{activeSession.metrics?.byPhase.long4.successfulScans ?? 0}</td>
                  <td>{activeSession.metrics?.byPhase.long4.failedScans ?? 0}</td>
                  <td>{activeSession.metrics?.byPhase.long4.averageScanIntervalMs ?? 0}</td>
                  <td>{activeSession.metrics?.byPhase.long4.window.durationMs ?? 0}</td>
                </tr>
                <tr>
                  <td>mid4</td>
                  <td>{activeSession.metrics?.byPhase.mid4.totalScans ?? 0}</td>
                  <td>{activeSession.metrics?.byPhase.mid4.successfulScans ?? 0}</td>
                  <td>{activeSession.metrics?.byPhase.mid4.failedScans ?? 0}</td>
                  <td>{activeSession.metrics?.byPhase.mid4.averageScanIntervalMs ?? 0}</td>
                  <td>{activeSession.metrics?.byPhase.mid4.window.durationMs ?? 0}</td>
                </tr>
                <tr>
                  <td>fullCycle</td>
                  <td>{activeSession.metrics?.fullCycle.totalScans ?? 0}</td>
                  <td>{activeSession.metrics?.fullCycle.successfulScans ?? 0}</td>
                  <td>{activeSession.metrics?.fullCycle.failedScans ?? 0}</td>
                  <td>—</td>
                  <td>{activeSession.metrics?.fullCycle.window.durationMs ?? 0}</td>
                </tr>
              </tbody>
            </table>
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
                  <th>Actual</th>
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
                      <td>{new Date(event.occurredAt).toLocaleTimeString()}</td>
                      <td>{String(event.metadata?.workflowBlock ?? 'n/a')}</td>
                      <td>{String(event.metadata?.expectedScanType ?? 'n/a')}</td>
                      <td>{String(event.metadata?.actualScanType ?? 'n/a')}</td>
                      <td>{event.isSuccessful === false ? 'Mismatch' : 'Accepted'}</td>
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
