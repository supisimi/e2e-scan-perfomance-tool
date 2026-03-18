import type { ScanEvent, TestSession } from '../../../types';
import { downloadTextFile, toSafeFileToken } from './download';

function toCsvCell(value: unknown) {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function toCsvRow(values: unknown[]) {
  return values.map((value) => toCsvCell(value)).join(',');
}

function eventToCsvRow(event: ScanEvent) {
  return toCsvRow([
    event.id,
    event.occurredAt,
    event.occurredAtMs,
    event.type,
    event.phase ?? '',
    event.classifier ?? '',
    event.isSuccessful ?? '',
    event.barcode?.rawValue ?? '',
    event.barcode?.normalizedValue ?? '',
    event.barcode?.source ?? '',
    event.metadata?.expectedScanType ?? '',
    event.metadata?.actualScanType ?? '',
    event.metadata?.matchedExpectation ?? '',
    event.note ?? '',
    event.link ?? '',
  ]);
}

export function buildEventLogCsv(session: TestSession) {
  const header = toCsvRow([
    'event_id',
    'occurred_at',
    'occurred_at_ms',
    'event_type',
    'phase',
    'classifier',
    'is_successful',
    'raw_barcode',
    'normalized_barcode',
    'barcode_source',
    'expected_scan_type',
    'actual_scan_type',
    'matched_expectation',
    'note',
    'link',
  ]);

  const body = session.eventLog
    .slice()
    .sort((left, right) => left.occurredAtMs - right.occurredAtMs)
    .map((event) => eventToCsvRow(event));

  return [header, ...body].join('\n');
}

export function exportSessionEventLogCsv(session: TestSession) {
  const csv = buildEventLogCsv(session);
  const fileName = `session_${toSafeFileToken(session.id)}_events.csv`;
  downloadTextFile(fileName, csv, 'text/csv;charset=utf-8');
}
