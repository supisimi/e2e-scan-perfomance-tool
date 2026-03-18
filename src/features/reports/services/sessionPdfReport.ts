import { jsPDF } from 'jspdf';
import type { TestSession } from '../../../types';
import { toSafeFileToken } from './download';

interface PdfCursor {
  doc: jsPDF;
  pageWidth: number;
  pageHeight: number;
  margin: number;
  lineHeight: number;
  y: number;
}

function createCursor() {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  return {
    doc,
    pageWidth,
    pageHeight,
    margin: 40,
    lineHeight: 16,
    y: 46,
  } satisfies PdfCursor;
}

function ensureSpace(cursor: PdfCursor, lines = 1) {
  if (cursor.y + lines * cursor.lineHeight > cursor.pageHeight - cursor.margin) {
    cursor.doc.addPage();
    cursor.y = cursor.margin;
  }
}

function writeHeading(cursor: PdfCursor, text: string) {
  ensureSpace(cursor, 2);
  cursor.doc.setFont('helvetica', 'bold');
  cursor.doc.setFontSize(13);
  cursor.doc.text(text, cursor.margin, cursor.y);
  cursor.y += cursor.lineHeight + 2;
}

function writeBodyLine(cursor: PdfCursor, label: string, value: string) {
  ensureSpace(cursor, 1);
  cursor.doc.setFont('helvetica', 'bold');
  cursor.doc.setFontSize(10);
  cursor.doc.text(`${label}:`, cursor.margin, cursor.y);

  cursor.doc.setFont('helvetica', 'normal');
  const wrapped = cursor.doc.splitTextToSize(value || '—', cursor.pageWidth - cursor.margin * 2 - 90);
  cursor.doc.text(wrapped, cursor.margin + 90, cursor.y);
  cursor.y += cursor.lineHeight * Math.max(1, wrapped.length);
}

function writeParagraph(cursor: PdfCursor, text: string) {
  ensureSpace(cursor, 1);
  cursor.doc.setFont('helvetica', 'normal');
  cursor.doc.setFontSize(10);
  const wrapped = cursor.doc.splitTextToSize(text || '—', cursor.pageWidth - cursor.margin * 2);
  cursor.doc.text(wrapped, cursor.margin, cursor.y);
  cursor.y += cursor.lineHeight * Math.max(1, wrapped.length);
}

function summarizeEvents(session: TestSession) {
  const totalEvents = session.eventLog.length;
  const totalScanEvents = session.eventLog.filter((event) => event.type === 'scan-received').length;
  const invalidScans = session.eventLog.filter(
    (event) => event.type === 'scan-received' && (event.isSuccessful === false || event.metadata?.actualScanType === 'unknown')
  ).length;

  return {
    totalEvents,
    totalScanEvents,
    invalidScans,
  };
}

export function exportSessionSummaryPdf(session: TestSession) {
  const cursor = createCursor();
  const { doc } = cursor;
  const eventSummary = summarizeEvents(session);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Scan Performance Session Report', cursor.margin, cursor.y);
  cursor.y += cursor.lineHeight * 2;

  writeHeading(cursor, 'Session Metadata');
  writeBodyLine(cursor, 'Session ID', session.id);
  writeBodyLine(cursor, 'Workflow', session.workflowId);
  writeBodyLine(cursor, 'Tester', session.testerName);
  writeBodyLine(cursor, 'Start', new Date(session.startedAt).toLocaleString());
  writeBodyLine(cursor, 'End', session.endedAt ? new Date(session.endedAt).toLocaleString() : 'In progress');
  writeBodyLine(cursor, 'Site', session.site);
  writeBodyLine(cursor, 'Device Serial', session.deviceSerialNumber);
  writeBodyLine(cursor, 'Firmware', session.firmwareVersion);
  writeBodyLine(cursor, 'Software', session.softwareVersion);
  writeBodyLine(cursor, 'Configuration', session.configuration);

  writeHeading(cursor, 'Workflow Timing Summary');
  writeBodyLine(cursor, 'Full Cycle', `${session.metrics?.fullCycle.window.durationMs ?? 0} ms`);
  writeBodyLine(cursor, 'short4', `${session.metrics?.byPhase.short4.window.durationMs ?? 0} ms`);
  writeBodyLine(cursor, 'mixed', `${session.metrics?.byPhase.mixed.window.durationMs ?? 0} ms`);
  writeBodyLine(cursor, 'long4', `${session.metrics?.byPhase.long4.window.durationMs ?? 0} ms`);
  writeBodyLine(cursor, 'mid4', `${session.metrics?.byPhase.mid4.window.durationMs ?? 0} ms`);

  writeHeading(cursor, 'Event Log Summary');
  writeBodyLine(cursor, 'Total Events', String(eventSummary.totalEvents));
  writeBodyLine(cursor, 'Scan Events', String(eventSummary.totalScanEvents));
  writeBodyLine(cursor, 'Invalid Scans', String(eventSummary.invalidScans));

  const recentEvents = session.eventLog
    .slice()
    .sort((left, right) => right.occurredAtMs - left.occurredAtMs)
    .slice(0, 8);

  for (const event of recentEvents) {
    writeParagraph(
      cursor,
      `${new Date(event.occurredAt).toLocaleString()} | ${event.type} | expected=${String(event.metadata?.expectedScanType ?? 'n/a')} actual=${String(event.metadata?.actualScanType ?? 'n/a')}`
    );
  }

  writeHeading(cursor, 'Comments and Notes');
  writeBodyLine(cursor, 'Environmental Notes', session.environmentalNotes ?? '—');
  writeBodyLine(cursor, 'Comments', session.comments ?? '—');

  if (session.links.length > 0) {
    writeBodyLine(
      cursor,
      'Links',
      session.links.map((link) => `${link.label}: ${link.url}`).join(' | ')
    );
  }

  const fileName = `session_${toSafeFileToken(session.id)}_summary.pdf`;
  doc.save(fileName);
}
