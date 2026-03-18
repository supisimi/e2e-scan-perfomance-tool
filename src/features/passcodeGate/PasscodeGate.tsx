import { FormEvent, ReactNode, useMemo, useState } from 'react';

const UNLOCKED_SESSION_KEY = 'scan-performance:passcode-unlocked';

interface PasscodeGateProps {
  children: ReactNode;
}

function getStoredUnlockedFlag() {
  return sessionStorage.getItem(UNLOCKED_SESSION_KEY) === '1';
}

function setStoredUnlockedFlag(isUnlocked: boolean) {
  if (isUnlocked) {
    sessionStorage.setItem(UNLOCKED_SESSION_KEY, '1');
    return;
  }

  sessionStorage.removeItem(UNLOCKED_SESSION_KEY);
}

export function PasscodeGate({ children }: PasscodeGateProps) {
  const configuredPasscode = useMemo(() => (import.meta.env.VITE_APP_PASSCODE ?? '').trim(), []);
  const isGateEnabled = configuredPasscode.length > 0;

  const [passcodeInput, setPasscodeInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(() => {
    if (!isGateEnabled) {
      return true;
    }

    return getStoredUnlockedFlag();
  });

  function handleUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isGateEnabled) {
      setIsUnlocked(true);
      return;
    }

    if (passcodeInput === configuredPasscode) {
      setStoredUnlockedFlag(true);
      setIsUnlocked(true);
      setErrorMessage('');
      setPasscodeInput('');
      return;
    }

    setErrorMessage('Invalid passcode. Please try again.');
  }

  if (isUnlocked) {
    return <>{children}</>;
  }

  return (
    <section className="passcode-gate-screen">
      <div className="passcode-gate-card">
        <h1>Session Access</h1>
        <p className="muted">
          This passcode gate is a lightweight UI lock only and not a real security mechanism.
        </p>

        <form className="passcode-gate-form" onSubmit={handleUnlock}>
          <label className="session-field">
            <span className="session-label">Passcode</span>
            <input
              type="password"
              className="session-input"
              value={passcodeInput}
              onChange={(event) => setPasscodeInput(event.target.value)}
              autoFocus
              required
            />
          </label>

          <button type="submit" className="btn-primary">
            Unlock
          </button>
        </form>

        {errorMessage ? <p className="field-error">{errorMessage}</p> : null}
      </div>
    </section>
  );
}
