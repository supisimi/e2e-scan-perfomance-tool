import type { WorkflowPhaseKey } from './workflowDefinition';

export type ScanEventType =
  | 'scan-received'
  | 'scan-accepted'
  | 'scan-rejected'
  | 'phase-transition'
  | 'session-note'
  | 'session-link';

export interface BarcodePayload {
  rawValue: string;
  normalizedValue: string;
  source: 'keyboard-wedge' | (string & {});
  characterCount: number;
}

export interface ScanEvent {
  id: string;
  sessionId: string;
  occurredAt: string;
  occurredAtMs: number;
  type: ScanEventType;
  phase?: WorkflowPhaseKey;
  barcode?: BarcodePayload;
  classifier?: WorkflowPhaseKey | 'unknown';
  isSuccessful?: boolean;
  note?: string;
  link?: string;
  metadata?: Record<string, string | number | boolean>;
}
