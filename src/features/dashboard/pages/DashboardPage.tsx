import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useSessions } from '../../../data';
import { EmptyState, ErrorState, LoadingState } from '../../../shared/components';
import type { TestSession } from '../../../types';

interface DashboardFilters {
  deviceSerialNumber: string;
  firmwareVersion: string;
  testerName: string;
  site: string;
  dateFrom: string;
  dateTo: string;
}

const INITIAL_FILTERS: DashboardFilters = {
  deviceSerialNumber: '',
  firmwareVersion: '',
  testerName: '',
  site: '',
  dateFrom: '',
  dateTo: '',
};

function toDateOnlyValue(input: string) {
  return input.slice(0, 10);
}

function matchesDateRange(session: TestSession, filters: DashboardFilters) {
  const dateOnly = toDateOnlyValue(session.startedAt);

  if (filters.dateFrom && dateOnly < filters.dateFrom) {
    return false;
  }

  if (filters.dateTo && dateOnly > filters.dateTo) {
    return false;
  }

  return true;
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

function getInvalidScanCount(session: TestSession) {
  return session.eventLog.filter(
    (event) =>
      event.type === 'scan-received' &&
      (event.isSuccessful === false || event.metadata?.actualScanType === 'unknown')
  ).length;
}

function getMetricDuration(session: TestSession, key: 'fullCycle' | 'short4' | 'mixed' | 'long4' | 'mid4') {
  if (!session.metrics) {
    return 0;
  }

  if (key === 'fullCycle') {
    return session.metrics.fullCycle.window.durationMs;
  }

  return session.metrics.byPhase[key].window.durationMs;
}

function getAverageDuration(sessions: TestSession[], key: 'fullCycle' | 'short4' | 'mixed' | 'long4' | 'mid4') {
  if (sessions.length === 0) {
    return 0;
  }

  const total = sessions.reduce((sum, session) => sum + getMetricDuration(session, key), 0);
  return Math.round(total / sessions.length);
}

function getUniqueValues(sessions: TestSession[], selector: (session: TestSession) => string) {
  return [...new Set(sessions.map(selector).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right)
  );
}

export function DashboardPage() {
  const { sessions, isLoading, error, seedDemoData, refreshSessions } = useSessions();
  const [filters, setFilters] = useState<DashboardFilters>(INITIAL_FILTERS);
  const [isSeeding, setIsSeeding] = useState(false);

  const filterOptions = useMemo(
    () => ({
      deviceSerialNumbers: getUniqueValues(sessions, (session) => session.deviceSerialNumber),
      firmwareVersions: getUniqueValues(sessions, (session) => session.firmwareVersion),
      testerNames: getUniqueValues(sessions, (session) => session.testerName),
      sites: getUniqueValues(sessions, (session) => session.site),
    }),
    [sessions]
  );

  const filteredSessions = useMemo(() => {
    return sessions
      .filter((session) => {
        if (filters.deviceSerialNumber && session.deviceSerialNumber !== filters.deviceSerialNumber) {
          return false;
        }
        if (filters.firmwareVersion && session.firmwareVersion !== filters.firmwareVersion) {
          return false;
        }
        if (filters.testerName && session.testerName !== filters.testerName) {
          return false;
        }
        if (filters.site && session.site !== filters.site) {
          return false;
        }

        return matchesDateRange(session, filters);
      })
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  }, [filters, sessions]);

  const totals = useMemo(() => {
    const totalRuns = filteredSessions.length;

    return {
      totalRuns,
      averageFullCycle: getAverageDuration(filteredSessions, 'fullCycle'),
      averageShort4: getAverageDuration(filteredSessions, 'short4'),
      averageMixed: getAverageDuration(filteredSessions, 'mixed'),
      averageLong4: getAverageDuration(filteredSessions, 'long4'),
      averageMid4: getAverageDuration(filteredSessions, 'mid4'),
      invalidScanCount: filteredSessions.reduce((sum, session) => sum + getInvalidScanCount(session), 0),
    };
  }, [filteredSessions]);

  const chartRows = useMemo(() => {
    return [...filteredSessions]
      .sort((left, right) => left.startedAt.localeCompare(right.startedAt))
      .map((session) => ({
        id: session.id,
        runLabel: `${new Date(session.startedAt).toLocaleDateString()} ${session.testerName}`,
        fullCycle: getMetricDuration(session, 'fullCycle'),
        short4: getMetricDuration(session, 'short4'),
        mixed: getMetricDuration(session, 'mixed'),
        long4: getMetricDuration(session, 'long4'),
        mid4: getMetricDuration(session, 'mid4'),
        invalidScans: getInvalidScanCount(session),
      }));
  }, [filteredSessions]);

  async function handleSeedDemo(force: boolean) {
    try {
      setIsSeeding(true);
      await seedDemoData({ force, count: 6 });
      await refreshSessions();
    } finally {
      setIsSeeding(false);
    }
  }

  return (
    <section className="panel dashboard-panel">
      <h2>Session Dashboard</h2>
      <p className="muted">Overview for completed and in-progress sessions with comparison charts.</p>

      <div className="session-actions" aria-label="Dashboard data actions">
        <button type="button" className="btn-secondary" onClick={() => void handleSeedDemo(false)} disabled={isSeeding}>
          Seed Demo Data
        </button>
        <button type="button" className="btn-secondary" onClick={() => void handleSeedDemo(true)} disabled={isSeeding}>
          Reset and Seed Demo
        </button>
      </div>

      <div className="dashboard-filters-grid">
        <label className="session-field">
          <span className="session-label">Device Serial Number</span>
          <select
            className="session-input"
            value={filters.deviceSerialNumber}
            onChange={(event) => setFilters((previous) => ({ ...previous, deviceSerialNumber: event.target.value }))}
          >
            <option value="">All</option>
            {filterOptions.deviceSerialNumbers.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="session-field">
          <span className="session-label">Firmware Version</span>
          <select
            className="session-input"
            value={filters.firmwareVersion}
            onChange={(event) => setFilters((previous) => ({ ...previous, firmwareVersion: event.target.value }))}
          >
            <option value="">All</option>
            {filterOptions.firmwareVersions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="session-field">
          <span className="session-label">Tester Name</span>
          <select
            className="session-input"
            value={filters.testerName}
            onChange={(event) => setFilters((previous) => ({ ...previous, testerName: event.target.value }))}
          >
            <option value="">All</option>
            {filterOptions.testerNames.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="session-field">
          <span className="session-label">Site</span>
          <select
            className="session-input"
            value={filters.site}
            onChange={(event) => setFilters((previous) => ({ ...previous, site: event.target.value }))}
          >
            <option value="">All</option>
            {filterOptions.sites.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="session-field">
          <span className="session-label">Date From</span>
          <input
            className="session-input"
            type="date"
            value={filters.dateFrom}
            onChange={(event) => setFilters((previous) => ({ ...previous, dateFrom: event.target.value }))}
          />
        </label>

        <label className="session-field">
          <span className="session-label">Date To</span>
          <input
            className="session-input"
            type="date"
            value={filters.dateTo}
            onChange={(event) => setFilters((previous) => ({ ...previous, dateTo: event.target.value }))}
          />
        </label>
      </div>

      <div className="dashboard-kpi-grid">
        <div className="runner-card">
          <p className="runner-card-title">Total Runs</p>
          <p className="runner-card-value">{totals.totalRuns}</p>
        </div>
        <div className="runner-card">
          <p className="runner-card-title">Average Full Cycle Time</p>
          <p className="runner-card-value">{formatDuration(totals.averageFullCycle)}</p>
        </div>
        <div className="runner-card">
          <p className="runner-card-title">Average short4 Time</p>
          <p className="runner-card-value">{formatDuration(totals.averageShort4)}</p>
        </div>
        <div className="runner-card">
          <p className="runner-card-title">Average mixed Time</p>
          <p className="runner-card-value">{formatDuration(totals.averageMixed)}</p>
        </div>
        <div className="runner-card">
          <p className="runner-card-title">Average long4 Time</p>
          <p className="runner-card-value">{formatDuration(totals.averageLong4)}</p>
        </div>
        <div className="runner-card">
          <p className="runner-card-title">Average mid4 Time</p>
          <p className="runner-card-value">{formatDuration(totals.averageMid4)}</p>
        </div>
        <div className="runner-card">
          <p className="runner-card-title">Invalid Scan Count</p>
          <p className="runner-card-value">{totals.invalidScanCount}</p>
        </div>
      </div>

      <div className="dashboard-chart-grid">
        <div className="runner-progress-panel chart-panel">
          <h3>Cycle/Block Duration Comparison</h3>
          <div className="dashboard-chart-wrap">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartRows} margin={{ top: 12, right: 20, left: 12, bottom: 18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis dataKey="runLabel" tick={{ fill: '#d4d4d8', fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#d4d4d8', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46' }}
                  labelStyle={{ color: '#e4e4e7' }}
                />
                <Legend />
                <Line type="monotone" dataKey="fullCycle" stroke="#22c55e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="short4" stroke="#60a5fa" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="mixed" stroke="#f59e0b" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="long4" stroke="#a78bfa" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="mid4" stroke="#f43f5e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="runner-progress-panel chart-panel">
          <h3>Invalid Scans by Run</h3>
          <div className="dashboard-chart-wrap">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartRows} margin={{ top: 12, right: 20, left: 12, bottom: 18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis dataKey="runLabel" tick={{ fill: '#d4d4d8', fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#d4d4d8', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46' }}
                  labelStyle={{ color: '#e4e4e7' }}
                />
                <Legend />
                <Bar dataKey="invalidScans" fill="#ef4444" name="Invalid Scans" />
                <Bar dataKey="fullCycle" fill="#64748b" name="Full Cycle (ms)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="runner-progress-panel">
        <h3>Latest Runs</h3>
        {isLoading ? (
          <LoadingState title="Loading sessions" description="Gathering metrics and latest run data." />
        ) : null}
        {!isLoading && error ? (
          <ErrorState
            title="Unable to load sessions"
            description={error}
            action={
              <button type="button" className="btn-secondary" onClick={() => void refreshSessions()}>
                Retry
              </button>
            }
          />
        ) : null}
        {!isLoading && !error && filteredSessions.length === 0 ? (
          <EmptyState
            title="No sessions match current filters"
            description="Adjust filters or seed demo data to explore dashboard charts."
          />
        ) : null}

        {!isLoading && !error && filteredSessions.length > 0 ? (
          <table className="history-table" aria-label="Latest runs">
            <caption className="visually-hidden">Latest session runs and key metrics</caption>
            <thead>
              <tr>
                <th>Date</th>
                <th>Tester</th>
                <th>Site</th>
                <th>Device Serial</th>
                <th>Firmware</th>
                <th>Status</th>
                <th>Full Cycle</th>
                <th>Invalid Scans</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.slice(0, 12).map((session) => (
                <tr key={session.id}>
                  <td>{new Date(session.startedAt).toLocaleString()}</td>
                  <td>{session.testerName}</td>
                  <td>{session.site}</td>
                  <td>{session.deviceSerialNumber}</td>
                  <td>{session.firmwareVersion}</td>
                  <td>{session.endedAt ? 'Completed' : 'In Progress'}</td>
                  <td>{formatDuration(getMetricDuration(session, 'fullCycle'))}</td>
                  <td>{getInvalidScanCount(session)}</td>
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
      </div>
    </section>
  );
}
