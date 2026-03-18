import { getDatabase } from './database';
import type { CaptureRecord, CreateCaptureInput } from '../../types/capture';

function createCaptureId() {
  return crypto.randomUUID();
}

export async function saveCapture(input: CreateCaptureInput): Promise<CaptureRecord> {
  const record: CaptureRecord = {
    id: createCaptureId(),
    createdAt: new Date().toISOString(),
    ...input,
  };

  const db = await getDatabase();
  await db.put('captures', record);
  return record;
}

export async function listCaptures(): Promise<CaptureRecord[]> {
  const db = await getDatabase();
  const records = await db.getAllFromIndex('captures', 'by-created-at');

  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
