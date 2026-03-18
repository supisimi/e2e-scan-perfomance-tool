import type { ScanEvent } from './scanEvent';
import type { SessionMetrics } from './sessionMetrics';
import type { WorkflowDefinition } from './workflowDefinition';
import type { WorkflowProgressState } from './workflowProgressState';

export interface SessionLink {
  label: string;
  url: string;
}

export interface TestSession {
  id: string;
  workflowId: WorkflowDefinition['id'];
  testerName: string;
  startedAt: string;
  endedAt?: string;
  site: string;
  deviceSerialNumber: string;
  firmwareVersion: string;
  softwareVersion: string;
  configuration: string;
  environmentalNotes?: string;
  comments?: string;
  links: SessionLink[];
  eventLog: ScanEvent[];
  progress: WorkflowProgressState;
  metrics?: SessionMetrics;
}
