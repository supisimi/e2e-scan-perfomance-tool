import { FormEvent, useState } from 'react';
import { saveCapture } from '../../../shared/lib/db/captureRepository';

export function CapturePage() {
  const [testRunName, setTestRunName] = useState('');
  const [scannerId, setScannerId] = useState('');
  const [scanDurationMs, setScanDurationMs] = useState<number>(0);
  const [success, setSuccess] = useState(true);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<string>('');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await saveCapture({
      testRunName,
      scannerId,
      scanDurationMs,
      success,
      notes: notes || undefined,
    });

    setStatus('Record saved to IndexedDB.');
    setTestRunName('');
    setScannerId('');
    setScanDurationMs(0);
    setSuccess(true);
    setNotes('');
  }

  return (
    <section className="panel">
      <h2>Legacy Capture Entry</h2>
      <p className="muted">Legacy standalone record entry (session workflow pages are preferred).</p>

      <form className="capture-form" onSubmit={onSubmit}>
        <label>
          Test Run Name
          <input
            value={testRunName}
            onChange={(event) => setTestRunName(event.target.value)}
            required
            placeholder="Regression 2026-03-18"
          />
        </label>

        <label>
          Scanner ID
          <input
            value={scannerId}
            onChange={(event) => setScannerId(event.target.value)}
            required
            placeholder="SCN-01"
          />
        </label>

        <label>
          Scan Duration (ms)
          <input
            type="number"
            min={0}
            value={scanDurationMs}
            onChange={(event) => setScanDurationMs(Number(event.target.value))}
            required
          />
        </label>

        <label>
          Result
          <select value={success ? 'success' : 'failure'} onChange={(event) => setSuccess(event.target.value === 'success')}>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
          </select>
        </label>

        <label>
          Notes
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
        </label>

        <button type="submit">Save Record</button>
      </form>

      {status ? <p className="status-ok">{status}</p> : null}
    </section>
  );
}
