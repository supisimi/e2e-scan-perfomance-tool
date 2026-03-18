export interface CaptureRecord {
  id: string;
  testRunName: string;
  scannerId: string;
  scanDurationMs: number;
  success: boolean;
  createdAt: string;
  notes?: string;
}

export interface CreateCaptureInput {
  testRunName: string;
  scannerId: string;
  scanDurationMs: number;
  success: boolean;
  notes?: string;
}
