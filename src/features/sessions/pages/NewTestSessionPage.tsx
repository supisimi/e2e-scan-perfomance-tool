import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionPersistence } from '../../../data';
import type { SessionLink, TestSession } from '../../../types';
import { SessionLinksField, SessionTextAreaField, SessionTextField } from '../components';

interface SessionFormState {
  testerName: string;
  startedAtLocal: string;
  site: string;
  deviceSerialNumber: string;
  firmwareVersion: string;
  softwareVersion: string;
  configuration: string;
  environmentalNotes: string;
  comments: string;
  links: SessionLink[];
}

type RequiredFieldKey =
  | 'testerName'
  | 'startedAtLocal'
  | 'site'
  | 'deviceSerialNumber'
  | 'firmwareVersion'
  | 'softwareVersion'
  | 'configuration';

type ValidationErrors = Partial<Record<RequiredFieldKey, string>>;

function toLocalDateTimeInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function createInitialFormState(): SessionFormState {
  return {
    testerName: '',
    startedAtLocal: toLocalDateTimeInputValue(new Date()),
    site: '',
    deviceSerialNumber: '',
    firmwareVersion: '',
    softwareVersion: '',
    configuration: '',
    environmentalNotes: '',
    comments: '',
    links: [],
  };
}

function validateRequiredFields(form: SessionFormState): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!form.testerName.trim()) {
    errors.testerName = 'Tester name is required.';
  }
  if (!form.startedAtLocal.trim()) {
    errors.startedAtLocal = 'Date/time is required.';
  }
  if (!form.site.trim()) {
    errors.site = 'Location/site is required.';
  }
  if (!form.deviceSerialNumber.trim()) {
    errors.deviceSerialNumber = 'Device serial number is required.';
  }
  if (!form.firmwareVersion.trim()) {
    errors.firmwareVersion = 'Firmware version is required.';
  }
  if (!form.softwareVersion.trim()) {
    errors.softwareVersion = 'Software/app version is required.';
  }
  if (!form.configuration.trim()) {
    errors.configuration = 'Configuration is required.';
  }

  return errors;
}

function toIsoDateTime(localDateTimeValue: string) {
  return new Date(localDateTimeValue).toISOString();
}

function toSessionInput(form: SessionFormState, commentsPrefix?: string): Omit<TestSession, 'id' | 'progress' | 'metrics'> {
  const comments = commentsPrefix ? `${commentsPrefix}${form.comments ? ` ${form.comments}` : ''}` : form.comments;

  return {
    workflowId: 'multi-range-v1',
    testerName: form.testerName.trim(),
    startedAt: toIsoDateTime(form.startedAtLocal),
    site: form.site.trim(),
    deviceSerialNumber: form.deviceSerialNumber.trim(),
    firmwareVersion: form.firmwareVersion.trim(),
    softwareVersion: form.softwareVersion.trim(),
    configuration: form.configuration.trim(),
    environmentalNotes: form.environmentalNotes.trim() || undefined,
    comments: comments.trim() || undefined,
    links: form.links
      .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
      .filter((link) => link.label || link.url),
    eventLog: [],
  };
}

export function NewTestSessionPage() {
  const navigate = useNavigate();
  const { createOrSaveSession, isSaving, error } = useSessionPersistence();

  const [formState, setFormState] = useState<SessionFormState>(() => createInitialFormState());
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [statusMessage, setStatusMessage] = useState<string>();

  const canSubmit = useMemo(() => !isSaving, [isSaving]);

  function updateField<Key extends keyof SessionFormState>(key: Key, value: SessionFormState[Key]) {
    setFormState((previous) => ({ ...previous, [key]: value }));
  }

  async function saveDraft() {
    const requiredErrors = validateRequiredFields(formState);
    setValidationErrors(requiredErrors);

    if (Object.keys(requiredErrors).length > 0) {
      setStatusMessage('Fill in required fields before saving draft.');
      return;
    }

    const saved = await createOrSaveSession(toSessionInput(formState, '[Draft]'));
    setStatusMessage(`Draft saved (${saved.id}).`);
  }

  async function startSession() {
    const requiredErrors = validateRequiredFields(formState);
    setValidationErrors(requiredErrors);

    if (Object.keys(requiredErrors).length > 0) {
      setStatusMessage('Fill in required fields before starting session.');
      return;
    }

    const saved = await createOrSaveSession(toSessionInput(formState));
    setStatusMessage(`Session started (${saved.id}).`);
    navigate(`/runner?sessionId=${saved.id}`);
  }

  return (
    <section className="panel session-panel">
      <h2>New Test Session</h2>
      <p className="muted">Create a new scan-performance test session and persist it locally.</p>

      <div className="session-form-grid">
        <SessionTextField
          id="testerName"
          label="Tester Name"
          required
          value={formState.testerName}
          onChange={(event) => updateField('testerName', event.target.value)}
          error={validationErrors.testerName}
          placeholder="Alex Example"
        />

        <SessionTextField
          id="startedAt"
          label="Date/Time"
          required
          type="datetime-local"
          value={formState.startedAtLocal}
          onChange={(event) => updateField('startedAtLocal', event.target.value)}
          error={validationErrors.startedAtLocal}
        />

        <SessionTextField
          id="site"
          label="Location/Site"
          required
          value={formState.site}
          onChange={(event) => updateField('site', event.target.value)}
          error={validationErrors.site}
          placeholder="Munich Lab"
        />

        <SessionTextField
          id="serial"
          label="Device Serial Number"
          required
          value={formState.deviceSerialNumber}
          onChange={(event) => updateField('deviceSerialNumber', event.target.value)}
          error={validationErrors.deviceSerialNumber}
          placeholder="SN-12345"
        />

        <SessionTextField
          id="firmware"
          label="Firmware Version"
          required
          value={formState.firmwareVersion}
          onChange={(event) => updateField('firmwareVersion', event.target.value)}
          error={validationErrors.firmwareVersion}
          placeholder="FW-1.2.3"
        />

        <SessionTextField
          id="software"
          label="Software/App Version"
          required
          value={formState.softwareVersion}
          onChange={(event) => updateField('softwareVersion', event.target.value)}
          error={validationErrors.softwareVersion}
          placeholder="App-2.0.1"
        />

        <SessionTextAreaField
          id="configuration"
          label="Configuration"
          required
          rows={3}
          value={formState.configuration}
          onChange={(event) => updateField('configuration', event.target.value)}
          error={validationErrors.configuration}
          placeholder="Scanner profile, test mode, and relevant toggles"
        />

        <SessionTextAreaField
          id="environmentalNotes"
          label="Environmental Notes"
          rows={3}
          value={formState.environmentalNotes}
          onChange={(event) => updateField('environmentalNotes', event.target.value)}
          placeholder="Lighting, temperature, interference notes"
        />

        <SessionTextAreaField
          id="comments"
          label="Comments"
          rows={3}
          value={formState.comments}
          onChange={(event) => updateField('comments', event.target.value)}
          placeholder="Any additional remarks"
        />

        <SessionLinksField links={formState.links} onChange={(links) => updateField('links', links)} />
      </div>

      <div className="session-actions">
        <button type="button" className="btn-secondary" onClick={saveDraft} disabled={!canSubmit}>
          Save as Draft
        </button>
        <button type="button" className="btn-primary" onClick={startSession} disabled={!canSubmit}>
          Start Session
        </button>
      </div>

      {statusMessage ? <p className="status-ok">{statusMessage}</p> : null}
      {error ? <p className="field-error">{error}</p> : null}
    </section>
  );
}
