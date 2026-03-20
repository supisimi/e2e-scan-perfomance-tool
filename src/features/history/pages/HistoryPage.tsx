import { Link } from 'react-router-dom';
import { useSessions } from '../../../data';
import { EmptyState, ErrorState, LoadingState } from '../../../shared/components';

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

function getInvalidScanCount(eventLog: Array<{ type: string; isSuccessful?: boolean; metadata?: Record<string, unknown> }>) {
  return eventLog.filter(
    (event) =>
      event.type === 'scan-received' &&
      (event.isSuccessful === false || event.metadata?.actualScanType === 'unknown')
  ).length;
}

export function HistoryPage() {
  const { sessions, isLoading, error, refreshSessions } = useSessions();

  return (
    <section className="panel">
      <h2>Session History</h2>
      <p className="muted">Completed and in-progress test sessions stored locally.</p>

      {isLoading ? <LoadingState title="Loading session history" /> : null}
      {!isLoading && error ? (
        <ErrorState
          title="Unable to load session history"
          description={error}
          action={
            <button type="button" className="btn-secondary" onClick={() => void refreshSessions()}>
              Retry
            </button>
          }
        />
      ) : null}
      {!isLoading && !error && sessions.length === 0 ? (
        <EmptyState
          title="No sessions yet"
          description="Create a new session to start capturing workflow events and metrics."
          action={
            <Link to="/sessions/new" className="dashboard-link">
              Create New Session
            </Link>
          }
        />
      ) : null}

      {!isLoading && !error && sessions.length > 0 ? (
        <table className="history-table" aria-label="Session history table">
          <caption className="visually-hidden">Session history with status and timing summary</caption>
          <thead>
            <tr>
              <th>Date</th>
              <th>Tester</th>
              <th>Site</th>
              <th>Status</th>
              <th>Full Cycle</th>
              <th>Invalid Scans</th>
              <th>Open</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.id}>
                <td>{new Date(session.startedAt).toLocaleString()}</td>
                <td>{session.testerName}</td>
                <td>{session.site}</td>
                <td>{session.endedAt ? 'Completed' : 'In Progress'}</td>
                <td>{formatDuration(session.metrics?.fullCycle.window.durationMs ?? 0)}</td>
                <td>{getInvalidScanCount(session.eventLog)}</td>
                <td>
                  <Link to={`/sessions/${session.id}`} className="dashboard-link" aria-label={`Open session ${session.id}`}>
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
