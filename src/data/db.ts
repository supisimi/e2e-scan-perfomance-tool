import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { TestSession } from '../types';

interface ScanPerformanceDB extends DBSchema {
  sessions: {
    key: string;
    value: TestSession;
    indexes: {
      'by-started-at': string;
      'by-site': string;
      'by-tester': string;
    };
  };
}

const DB_NAME = 'scan-performance-tool-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<ScanPerformanceDB>> | null = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<ScanPerformanceDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('sessions')) {
          const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
          sessionStore.createIndex('by-started-at', 'startedAt');
          sessionStore.createIndex('by-site', 'site');
          sessionStore.createIndex('by-tester', 'testerName');
        }
      },
    });
  }

  return dbPromise;
}

export type { ScanPerformanceDB };
