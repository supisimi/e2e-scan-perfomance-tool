import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSessionPersistence } from '../../../data';
import { deleteSession } from '../../../data/sessionRepository';
import type { TestSession } from '../../../types';
import {
  exportSessionEventLogCsv,
  exportSessionJsonFile,
  exportSessionSummaryPdf,
} from '../../reports/services';

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
  return new Date(timestamp).toLocaleString([], {
    hour12: false,
    fractionalSecondDigits: 3,
  });
}

function getInvalidScanCount(session: TestSession) {
  return session.eventLog.filter(
    (event) => event.type === 'scan-received' && (event.isSuccessful === false || event.metadata?.actualScanType === 'unknown')
  ).length;
}

function summarizeEventTypes(session: TestSession) {
  const summary = new Map<string, number>();

  for (const event of session.eventLog) {
    summary.set(event.type, (summary.get(event.type) ?? 0) + 1);
  }

  return [...summary.entries()].sort((left, right) => right[1] - left[1]);
}

interface SessionMetadataForm {
  testerName: string;
  startedAtLocal: string;
  site: string;
  deviceSerialNumber: string;
  firmwareVersion: string;
  softwareVersion: string;
  configuration: string;
  environmentalNotes: string;
  comments: string;
}

function toDateTimeLocal(iso: string) {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function createMetadataForm(session: TestSession): SessionMetadataForm {
  return {
    testerName: session.testerName,
    startedAtLocal: toDateTimeLocal(session.startedAt),
    site: session.site,
    deviceSerialNumber: session.deviceSerialNumber,
    firmwareVersion: session.firmwareVersion,
    softwareVersion: session.softwareVersion,
    configuration: session.configuration,
    environmentalNotes: session.environmentalNotes ?? '',
    comments: session.comments ?? '',
  };
}

export function SessionDetailPage() {
  const navigate = useNavigate();
  const { sessionId = '' } = useParams();
  const { loadSession, createOrSaveSession, updateExistingSession, isSaving, error } = useSessionPersistence();
  const [session, setSession] = useState<TestSession>();
  const [statusMessage, setStatusMessage] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [metadataForm, setMetadataForm] = useState<SessionMetadataForm>();

  useEffect(() => {
    async function load() {
      if (!sessionId) {
        setSession(undefined);
        return;
      }

      const loaded = await loadSession(sessionId);
      setSession(loaded);

      if (loaded) {
        setMetadataForm(createMetadataForm(loaded));
      }
    }

    void load();
  }, [loadSession, sessionId]);

  const eventTypeSummary = useMemo(() => (session ? summarizeEventTypes(session) : []), [session]);

  const orderedEventLog = useMemo(() => {
    if (!session) {
      return [];
    }

    return session.eventLog.slice().sort((left, right) => right.occurredAtMs - left.occurredAtMs);
  }, [session]);

  function handleExportJson() {
    if (!session) {
      return;
    }

    exportSessionJsonFile(session);
    setStatusMessage('Session exported as JSON.');
  }

  function handleExportCsv() {
    if (!session) {
      return;
    }

    exportSessionEventLogCsv(session);
    setStatusMessage('Raw event log exported as CSV.');
  }

  function handleExportPdf() {
    if (!session) {
      return;
    }

    exportSessionSummaryPdf(session);
    setStatusMessage('Session PDF summary exported.');
  }

  function updateMetadataField<Key extends keyof SessionMetadataForm>(
    key: Key,
    value: SessionMetadataForm[Key]
  ) {
    setMetadataForm((previous) => {
      if (!previous) {
        return previous;
      }

      return {
        ...previous,
        [key]: value,
      };
    });
  }

  function handleCancelEdit() {
    if (!session) {
      return;
    }

    setMetadataForm(createMetadataForm(session));
    setIsEditMode(false);
  }

  async function handleSaveMetadata() {
    if (!session || !metadataForm) {
      return;
    }

    const updated = await updateExistingSession({
      ...session,
      testerName: metadataForm.testerName.trim(),
      startedAt: new Date(metadataForm.startedAtLocal).toISOString(),
      site: metadataForm.site.trim(),
      deviceSerialNumber: metadataForm.deviceSerialNumber.trim(),
      firmwareVersion: metadataForm.firmwareVersion.trim(),
      softwareVersion: metadataForm.softwareVersion.trim(),
      configuration: metadataForm.configuration.trim(),
      environmentalNotes: metadataForm.environmentalNotes.trim() || undefined,
      comments: metadataForm.comments.trim() || undefined,
    });

    setSession(updated);
    setMetadataForm(createMetadataForm(updated));
    setIsEditMode(false);
    setStatusMessage('Session metadata updated.');
  }

  async function handleDuplicateSession() {
    if (!session) {
      return;
    }

    const duplicate = await createOrSaveSession({
      workflowId: session.workflowId,
      testerName: session.testerName,
      startedAt: new Date().toISOString(),
      site: session.site,
      deviceSerialNumber: session.deviceSerialNumber,
      firmwareVersion: session.firmwareVersion,
      softwareVersion: session.softwareVersion,
      configuration: session.configuration,
      environmentalNotes: session.environmentalNotes,
      comments: session.comments,
      links: session.links,
      eventLog: [],
    });

    navigate(`/sessions/${duplicate.id}`);
  }

  async function handleDeleteSession() {
    if (!session) {
      return;
    }

    const confirmed = window.confirm('Delete this session permanently?');
    if (!confirmed) {
      return;
    }

    await deleteSession(session.id);
    navigate('/dashboard');
  }

  if (!sessionId) {
    return (
      <section className="panel session-panel">
        <h2>Session Detail</h2>
        <p className="field-error">No session id provided.</p>
      </section>
    );
  }

  if (!session) {
    return (
      <section className="panel session-panel">
        <h2>Session Detail</h2>
        <p>{isSaving ? 'Loading session...' : 'Session not found.'}</p>
      </section>
    );
  }

  return (
    <section className="panel session-panel">
      <h2>Session Detail</h2>
      <p className="muted">Export data and review session summary information.</p>

      <div className="session-detail-actions">
        <button type="button" className="btn-secondary" onClick={handleExportJson}>
          Export Session JSON
        </button>
        <button type="button" className="btn-secondary" onClick={handleExportCsv}>
          Export Event Log CSV
        </button>
        <button type="button" className="btn-primary" onClick={handleExportPdf}>
          Export PDF Summary
        </button>
        <button type="button" className="btn-secondary" onClick={() => setIsEditMode(true)}>
          Edit Metadata
        </button>
        <button type="button" className="btn-secondary" onClick={() => void handleDuplicateSession()}>
          Duplicate Session
        </button>
        <button type="button" className="btn-danger" onClick={() => void handleDeleteSession()}>
          Delete Session
        </button>
      </div>

      {isEditMode && metadataForm ? (
        <div className="runner-progress-panel">
          <h3>Edit Metadata</h3>
          <div className="session-form-grid">
            <label className="session-field">
              <span className="session-label">Tester Name</span>
              <input
                className="session-input"
                value={metadataForm.testerName}
                onChange={(event) => updateMetadataField('testerName', event.target.value)}
              />
            </label>

            <label className="session-field">
              <span className="session-label">Date/Time</span>
              <input
                className="session-input"
                type="datetime-local"
                value={metadataForm.startedAtLocal}
                onChange={(event) => updateMetadataField('startedAtLocal', event.target.value)}
              />
            </label>

            <label className="session-field">
              <span className="session-label">Location/Site</span>
              <input
                className="session-input"
                value={metadataForm.site}
                onChange={(event) => updateMetadataField('site', event.target.value)}
              />
            </label>

            <label className="session-field">
              <span className="session-label">Device Serial Number</span>
              <input
                className="session-input"
                value={metadataForm.deviceSerialNumber}
                onChange={(event) => updateMetadataField('deviceSerialNumber', event.target.value)}
              />
            </label>

            <label className="session-field">
              <span className="session-label">Firmware Version</span>
              <input
                className="session-input"
                value={metadataForm.firmwareVersion}
                onChange={(event) => updateMetadataField('firmwareVersion', event.target.value)}
              />
            </label>

            <label className="session-field">
              <span className="session-label">Software/App Version</span>
              <input
                className="session-input"
                value={metadataForm.softwareVersion}
                onChange={(event) => updateMetadataField('softwareVersion', event.target.value)}
              />
            </label>

            <label className="session-field session-field-full">
              <span className="session-label">Configuration</span>
              <textarea
                className="session-textarea"
                rows={3}
                value={metadataForm.configuration}
                onChange={(event) => updateMetadataField('configuration', event.target.value)}
              />
            </label>

            <label className="session-field session-field-full">
              <span className="session-label">Environmental Notes</span>
              <textarea
                className="session-textarea"
                rows={3}
                value={metadataForm.environmentalNotes}
                onChange={(event) => updateMetadataField('environmentalNotes', event.target.value)}
              />
            </label>

            <label className="session-field session-field-full">
              <span className="session-label">Comments</span>
              <textarea
                className="session-textarea"
                rows={3}
                value={metadataForm.comments}
                onChange={(event) => updateMetadataField('comments', event.target.value)}
              />
            </label>
          </div>

          <div className="session-actions">
            <button type="button" className="btn-primary" onClick={() => void handleSaveMetadata()}>
              Save Metadata
            </button>
            <button type="button" className="btn-secondary" onClick={handleCancelEdit}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="runner-status-grid">
        <div className="runner-card">
          <p className="runner-card-title">Session ID</p>
          <p className="runner-card-value">{session.id}</p>
        </div>
        <div className="runner-card">
          <p className="runner-card-title">Tester</p>
          <p className="runner-card-value">{session.testerName}</p>
        </div>
        <div className="runner-card">
          <p className="runner-card-title">Site</p>
          <p className="runner-card-value">{session.site}</p>
        </div>
        <div className="runner-card">
          <p className="runner-card-title">Status</p>
          <p className="runner-card-value">{session.endedAt ? 'Completed' : 'In Progress'}</p>
        </div>
      </div>

      <div className="runner-progress-panel">
        <h3>Full Metrics Summary</h3>
        <table className="history-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Duration</th>
              <th>Total Scans</th>
              <th>Successful</th>
              <th>Invalid</th>
              <th>Avg Interval (ms)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Full Cycle</td>
              <td>{formatDuration(session.metrics?.fullCycle.window.durationMs ?? 0)}</td>
              <td>{session.metrics?.fullCycle.totalScans ?? 0}</td>
              <td>{session.metrics?.fullCycle.successfulScans ?? 0}</td>
              <td>{session.metrics?.fullCycle.failedScans ?? 0}</td>
              <td>—</td>
            </tr>
            <tr>
              <td>short4</td>
              <td>{formatDuration(session.metrics?.byPhase.short4.window.durationMs ?? 0)}</td>
              <td>{session.metrics?.byPhase.short4.totalScans ?? 0}</td>
              <td>{session.metrics?.byPhase.short4.successfulScans ?? 0}</td>
              <td>{session.metrics?.byPhase.short4.failedScans ?? 0}</td>
              <td>{session.metrics?.byPhase.short4.averageScanIntervalMs ?? 0}</td>
            </tr>
            <tr>
              <td>mixed</td>
              <td>{formatDuration(session.metrics?.byPhase.mixed.window.durationMs ?? 0)}</td>
              <td>{session.metrics?.byPhase.mixed.totalScans ?? 0}</td>
              <td>{session.metrics?.byPhase.mixed.successfulScans ?? 0}</td>
              <td>{session.metrics?.byPhase.mixed.failedScans ?? 0}</td>
              <td>{session.metrics?.byPhase.mixed.averageScanIntervalMs ?? 0}</td>
            </tr>
            <tr>
              <td>long4</td>
              <td>{formatDuration(session.metrics?.byPhase.long4.window.durationMs ?? 0)}</td>
              <td>{session.metrics?.byPhase.long4.totalScans ?? 0}</td>
              <td>{session.metrics?.byPhase.long4.successfulScans ?? 0}</td>
              <td>{session.metrics?.byPhase.long4.failedScans ?? 0}</td>
              <td>{session.metrics?.byPhase.long4.averageScanIntervalMs ?? 0}</td>
            </tr>
            <tr>
              <td>mid4</td>
              <td>{formatDuration(session.metrics?.byPhase.mid4.window.durationMs ?? 0)}</td>
              <td>{session.metrics?.byPhase.mid4.totalScans ?? 0}</td>
              <td>{session.metrics?.byPhase.mid4.successfulScans ?? 0}</td>
              <td>{session.metrics?.byPhase.mid4.failedScans ?? 0}</td>
              <td>{session.metrics?.byPhase.mid4.averageScanIntervalMs ?? 0}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="runner-progress-panel">
        <h3>Block-by-Block Timing</h3>
        <table className="history-table">
          <thead>
            <tr>
              <th>Block</th>
              <th>Started</th>
              <th>Ended</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>short4</td>
              <td>{session.metrics?.byPhase.short4.window.startedAt ? new Date(session.metrics.byPhase.short4.window.startedAt).toLocaleTimeString() : '—'}</td>
              <td>{session.metrics?.byPhase.short4.window.endedAt ? new Date(session.metrics.byPhase.short4.window.endedAt).toLocaleTimeString() : '—'}</td>
              <td>{formatDuration(session.metrics?.byPhase.short4.window.durationMs ?? 0)}</td>
            </tr>
            <tr>
              <td>mixed</td>
              <td>{session.metrics?.byPhase.mixed.window.startedAt ? new Date(session.metrics.byPhase.mixed.window.startedAt).toLocaleTimeString() : '—'}</td>
              <td>{session.metrics?.byPhase.mixed.window.endedAt ? new Date(session.metrics.byPhase.mixed.window.endedAt).toLocaleTimeString() : '—'}</td>
              <td>{formatDuration(session.metrics?.byPhase.mixed.window.durationMs ?? 0)}</td>
            </tr>
            <tr>
              <td>long4</td>
              <td>{session.metrics?.byPhase.long4.window.startedAt ? new Date(session.metrics.byPhase.long4.window.startedAt).toLocaleTimeString() : '—'}</td>
              <td>{session.metrics?.byPhase.long4.window.endedAt ? new Date(session.metrics.byPhase.long4.window.endedAt).toLocaleTimeString() : '—'}</td>
              <td>{formatDuration(session.metrics?.byPhase.long4.window.durationMs ?? 0)}</td>
            </tr>
            <tr>
              <td>mid4</td>
              <td>{session.metrics?.byPhase.mid4.window.startedAt ? new Date(session.metrics.byPhase.mid4.window.startedAt).toLocaleTimeString() : '—'}</td>
              <td>{session.metrics?.byPhase.mid4.window.endedAt ? new Date(session.metrics.byPhase.mid4.window.endedAt).toLocaleTimeString() : '—'}</td>
              <td>{formatDuration(session.metrics?.byPhase.mid4.window.durationMs ?? 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="runner-progress-panel">
        <h3>Raw Event Log</h3>
        <p>Total Events: {session.eventLog.length}</p>
        <p>Invalid Scan Count: {getInvalidScanCount(session)}</p>
        <table className="history-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Type</th>
              <th>Phase</th>
              <th>Expected</th>
              <th>Actual</th>
              <th>Matched</th>
              <th>Barcode</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {orderedEventLog.map((event) => (
              <tr key={event.id}>
                <td>{formatDateTimeWithMilliseconds(event.occurredAt)}</td>
                <td>{event.type}</td>
                <td>{event.phase ?? '—'}</td>
                <td>{String(event.metadata?.expectedScanType ?? '—')}</td>
                <td>{String(event.metadata?.actualScanType ?? '—')}</td>
                <td>{String(event.metadata?.matchedExpectation ?? '—')}</td>
                <td>{event.barcode?.normalizedValue ?? '—'}</td>
                <td>{event.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="runner-progress-panel">
        <h3>Event Type Summary</h3>
        <table className="history-table">
          <thead>
            <tr>
              <th>Event Type</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            {eventTypeSummary.map(([eventType, count]) => (
              <tr key={eventType}>
                <td>{eventType}</td>
                <td>{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="runner-progress-panel">
        <h3>Comments and Notes</h3>
        <p>
          <strong>Environmental Notes:</strong> {session.environmentalNotes ?? '—'}
        </p>
        <p>
          <strong>Comments:</strong> {session.comments ?? '—'}
        </p>
        {session.links.length > 0 ? (
          <ul className="session-detail-links">
            {session.links.map((link) => (
              <li key={`${link.label}-${link.url}`}>
                <a href={link.url} target="_blank" rel="noreferrer">
                  {link.label || link.url}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="runner-progress-panel">
        <Link to="/dashboard" className="nav-link">
          Back to Dashboard
        </Link>
      </div>

      {statusMessage ? <p className="status-ok">{statusMessage}</p> : null}
      {error ? <p className="field-error">{error}</p> : null}
    </section>
  );
}
