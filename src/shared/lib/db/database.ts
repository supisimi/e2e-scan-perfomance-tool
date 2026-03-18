import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { CaptureRecord } from '../../types/capture';

interface CaptureDB extends DBSchema {
  captures: {
    key: string;
    value: CaptureRecord;
    indexes: {
      'by-created-at': string;
      'by-test-run-name': string;
    };
  };
}

const DB_NAME = 'test-data-capture-db';
const DB_VERSION = 1;

let databasePromise: Promise<IDBPDatabase<CaptureDB>> | null = null;

export function getDatabase() {
  if (!databasePromise) {
    databasePromise = openDB<CaptureDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore('captures', { keyPath: 'id' });
        store.createIndex('by-created-at', 'createdAt');
        store.createIndex('by-test-run-name', 'testRunName');
      },
    });
  }

  return databasePromise;
}
