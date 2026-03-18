import type { TestSession, ScanEvent } from '../types';
import { calculateSessionMetrics } from '../lib/metrics';
import { createInitialWorkflowProgressState, getDefaultWorkflowDefinition } from '../lib/workflowDefinition';
import { getDb } from './db';

function byStartedAtDescending(left: TestSession, right: TestSession) {
  return right.startedAt.localeCompare(left.startedAt);
}

function validateTestSession(candidate: unknown): candidate is TestSession {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }

  const value = candidate as Partial<TestSession>;

  return (
    typeof value.id === 'string' &&
    typeof value.workflowId === 'string' &&
    typeof value.testerName === 'string' &&
    typeof value.startedAt === 'string' &&
    typeof value.site === 'string' &&
    typeof value.deviceSerialNumber === 'string' &&
    typeof value.firmwareVersion === 'string' &&
    typeof value.softwareVersion === 'string' &&
    typeof value.configuration === 'string' &&
    Array.isArray(value.links) &&
    Array.isArray(value.eventLog) &&
    !!value.progress
  );
}

function createSessionId() {
  return crypto.randomUUID();
}

function createEventId() {
  return crypto.randomUUID();
}

export async function listSessions(): Promise<TestSession[]> {
  const db = await getDb();
  const sessions = await db.getAll('sessions');

  return sessions.sort(byStartedAtDescending);
}

export async function getSessionById(sessionId: string): Promise<TestSession | undefined> {
  const db = await getDb();
  return db.get('sessions', sessionId);
}

export async function saveSession(session: TestSession): Promise<TestSession> {
  const db = await getDb();
  const sessionToSave: TestSession = {
    ...session,
    metrics: calculateSessionMetrics(session.eventLog),
  };

  await db.put('sessions', sessionToSave);
  return sessionToSave;
}

export async function createSession(
  input: Omit<TestSession, 'id' | 'progress' | 'metrics'> &
    Partial<Pick<TestSession, 'id' | 'progress' | 'metrics'>>
): Promise<TestSession> {
  const workflow = getDefaultWorkflowDefinition();

  const session: TestSession = {
    ...input,
    id: input.id ?? createSessionId(),
    progress: input.progress ?? createInitialWorkflowProgressState(workflow),
    metrics: input.metrics ?? calculateSessionMetrics(input.eventLog),
  };

  return saveSession(session);
}

export async function updateSession(session: TestSession): Promise<TestSession> {
  return saveSession(session);
}

export async function deleteSession(sessionId: string): Promise<void> {
  const db = await getDb();
  await db.delete('sessions', sessionId);
}

export async function replaceSessionEventLog(
  sessionId: string,
  eventLog: ScanEvent[]
): Promise<TestSession | undefined> {
  const existing = await getSessionById(sessionId);

  if (!existing) {
    return undefined;
  }

  const updated = await saveSession({
    ...existing,
    eventLog,
  });

  return updated;
}

export async function appendSessionEvent(
  sessionId: string,
  eventInput: Omit<ScanEvent, 'id' | 'sessionId' | 'occurredAt' | 'occurredAtMs'> &
    Partial<Pick<ScanEvent, 'id' | 'sessionId' | 'occurredAt' | 'occurredAtMs'>>
): Promise<TestSession | undefined> {
  const existing = await getSessionById(sessionId);

  if (!existing) {
    return undefined;
  }

  const now = new Date();
  const event: ScanEvent = {
    ...eventInput,
    id: eventInput.id ?? createEventId(),
    sessionId,
    occurredAt: eventInput.occurredAt ?? now.toISOString(),
    occurredAtMs: eventInput.occurredAtMs ?? now.getTime(),
  };

  return replaceSessionEventLog(sessionId, [...existing.eventLog, event]);
}

export async function exportSessionToJson(sessionId: string): Promise<string | undefined> {
  const session = await getSessionById(sessionId);

  if (!session) {
    return undefined;
  }

  return JSON.stringify(session, null, 2);
}

export async function importSessionFromJson(jsonPayload: string): Promise<TestSession> {
  const parsed: unknown = JSON.parse(jsonPayload);

  if (!validateTestSession(parsed)) {
    throw new Error('Invalid session JSON payload.');
  }

  return saveSession(parsed);
}

function createDemoSession(offset: number): TestSession {
  const workflow = getDefaultWorkflowDefinition();
  const startedAtDate = new Date(Date.now() - offset * 1000 * 60 * 60);
  const startedAt = startedAtDate.toISOString();
  const sessionId = createSessionId();

  const demoEvents: ScanEvent[] = workflow.metricsPhases.map((phase, index) => {
    const occurredAtMs = startedAtDate.getTime() + (index + 1) * 15000;

    return {
      id: createEventId(),
      sessionId,
      occurredAt: new Date(occurredAtMs).toISOString(),
      occurredAtMs,
      type: 'scan-accepted',
      phase,
      isSuccessful: true,
      barcode: {
        rawValue: `${phase.toUpperCase()}-${index + 1}`,
        normalizedValue: `${phase.toUpperCase()}-${index + 1}`,
        characterCount: `${phase.toUpperCase()}-${index + 1}`.length,
        source: 'keyboard-wedge',
      },
      classifier: phase,
    };
  });

  return {
    id: sessionId,
    workflowId: workflow.id,
    testerName: `Demo Tester ${offset + 1}`,
    startedAt,
    endedAt: new Date(startedAtDate.getTime() + 2 * 60 * 1000).toISOString(),
    site: `Site ${offset + 1}`,
    deviceSerialNumber: `SN-00${offset + 1}`,
    firmwareVersion: 'FW-1.0.0',
    softwareVersion: 'SW-1.0.0',
    configuration: 'Default demo configuration',
    environmentalNotes: 'Indoor test bench, stable lighting',
    comments: 'Demo session for onboarding and UI checks',
    links: [
      {
        label: 'Test Plan',
        url: 'https://example.com/test-plan',
      },
    ],
    eventLog: demoEvents,
    progress: createInitialWorkflowProgressState(workflow),
    metrics: calculateSessionMetrics(demoEvents, workflow),
  };
}

export async function seedDemoSessions(options?: {
  force?: boolean;
  count?: number;
}): Promise<TestSession[]> {
  const force = options?.force ?? false;
  const count = options?.count ?? 2;

  const existing = await listSessions();
  if (existing.length > 0 && !force) {
    return existing;
  }

  if (force) {
    const db = await getDb();
    const transaction = db.transaction('sessions', 'readwrite');
    await transaction.store.clear();
    await transaction.done;
  }

  const created: TestSession[] = [];

  for (let index = 0; index < count; index += 1) {
    const demoSession = createDemoSession(index);
    created.push(await saveSession(demoSession));
  }

  return created;
}
