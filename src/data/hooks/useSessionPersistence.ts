import { useCallback, useState } from 'react';
import type { ScanEvent, TestSession } from '../../types';
import {
  appendSessionEvent,
  createSession,
  exportSessionToJson,
  getSessionById,
  replaceSessionEventLog,
  updateSession,
} from '../sessionRepository';

export interface UseSessionPersistenceResult {
  isSaving: boolean;
  error?: string;
  createOrSaveSession: (session: Omit<TestSession, 'id' | 'progress' | 'metrics'> & Partial<Pick<TestSession, 'id' | 'progress' | 'metrics'>>) => Promise<TestSession>;
  updateExistingSession: (session: TestSession) => Promise<TestSession>;
  loadSession: (sessionId: string) => Promise<TestSession | undefined>;
  replaceEventLog: (sessionId: string, eventLog: ScanEvent[]) => Promise<TestSession | undefined>;
  appendEvent: (
    sessionId: string,
    event: Omit<ScanEvent, 'id' | 'sessionId' | 'occurredAt' | 'occurredAtMs'> &
      Partial<Pick<ScanEvent, 'id' | 'sessionId' | 'occurredAt' | 'occurredAtMs'>>
  ) => Promise<TestSession | undefined>;
  exportSessionJson: (sessionId: string) => Promise<string | undefined>;
}

export function useSessionPersistence(): UseSessionPersistenceResult {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>();

  const withSavingState = useCallback(async <T,>(operation: () => Promise<T>) => {
    try {
      setIsSaving(true);
      setError(undefined);
      return await operation();
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : 'Session persistence failed.';
      setError(message);
      throw unknownError;
    } finally {
      setIsSaving(false);
    }
  }, []);

  const createOrSaveSession = useCallback(
    (session: Omit<TestSession, 'id' | 'progress' | 'metrics'> & Partial<Pick<TestSession, 'id' | 'progress' | 'metrics'>>) =>
      withSavingState(() => createSession(session)),
    [withSavingState]
  );

  const updateExistingSession = useCallback(
    (session: TestSession) => withSavingState(() => updateSession(session)),
    [withSavingState]
  );

  const loadSession = useCallback((sessionId: string) => getSessionById(sessionId), []);

  const replaceEventLog = useCallback(
    (sessionId: string, eventLog: ScanEvent[]) => withSavingState(() => replaceSessionEventLog(sessionId, eventLog)),
    [withSavingState]
  );

  const appendEvent = useCallback(
    (
      sessionId: string,
      event: Omit<ScanEvent, 'id' | 'sessionId' | 'occurredAt' | 'occurredAtMs'> &
        Partial<Pick<ScanEvent, 'id' | 'sessionId' | 'occurredAt' | 'occurredAtMs'>>
    ) => withSavingState(() => appendSessionEvent(sessionId, event)),
    [withSavingState]
  );

  const exportSessionJson = useCallback(
    (sessionId: string) => withSavingState(() => exportSessionToJson(sessionId)),
    [withSavingState]
  );

  return {
    isSaving,
    error,
    createOrSaveSession,
    updateExistingSession,
    loadSession,
    replaceEventLog,
    appendEvent,
    exportSessionJson,
  };
}
