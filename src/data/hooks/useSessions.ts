import { useCallback, useEffect, useState } from 'react';
import type { TestSession } from '../../types';
import {
  deleteSession,
  importSessionFromJson,
  listSessions,
  seedDemoSessions,
} from '../sessionRepository';

export interface UseSessionsResult {
  sessions: TestSession[];
  isLoading: boolean;
  error?: string;
  refreshSessions: () => Promise<void>;
  removeSession: (sessionId: string) => Promise<void>;
  importSessionJson: (jsonPayload: string) => Promise<TestSession>;
  seedDemoData: (options?: { force?: boolean; count?: number }) => Promise<void>;
}

export function useSessions(): UseSessionsResult {
  const [sessions, setSessions] = useState<TestSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();

  const refreshSessions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(undefined);
      const loaded = await listSessions();
      setSessions(loaded);
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : 'Failed to load sessions.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const removeSession = useCallback(async (sessionId: string) => {
    await deleteSession(sessionId);
    await refreshSessions();
  }, [refreshSessions]);

  const importSessionJson = useCallback(async (jsonPayload: string) => {
    const imported = await importSessionFromJson(jsonPayload);
    await refreshSessions();
    return imported;
  }, [refreshSessions]);

  const seedDemoData = useCallback(async (options?: { force?: boolean; count?: number }) => {
    await seedDemoSessions(options);
    await refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  return {
    sessions,
    isLoading,
    error,
    refreshSessions,
    removeSession,
    importSessionJson,
    seedDemoData,
  };
}
