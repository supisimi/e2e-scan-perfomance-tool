import type { TestSession } from '../../../types';
import { downloadTextFile, toSafeFileToken } from './download';

export function exportSessionJsonFile(session: TestSession) {
  const payload = JSON.stringify(session, null, 2);
  const fileName = `session_${toSafeFileToken(session.id)}.json`;
  downloadTextFile(fileName, payload, 'application/json;charset=utf-8');
}
