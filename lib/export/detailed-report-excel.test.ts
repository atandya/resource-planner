import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { exportDetailedReportToExcel } from '@/lib/export/excel-export';
import type { DetailedReportRow } from '@/lib/export/detailed-report';

/**
 * The Month column is the reason this sheet exists in its own renderer: it must
 * round-trip as a real Excel date (1st of the month, UTC) so Excel sorts and
 * pivot-groups it as a date across a year boundary — text months would order
 * Apr/Aug/Dec. Everything else here guards the "semi-raw dataset" contract:
 * filter dropdowns, a frozen header, and NO totals row.
 */

const ROWS: DetailedReportRow[] = [
  {
    department: 'Creative',
    employee: 'Abdul',
    brand: 'BAF',
    projectName: 'Campaign A',
    projectType: 'campaign',
    month: '2025-10-01',
    plannedHours: 12.5,
  },
  {
    department: 'Creative',
    employee: 'Abdul',
    brand: 'BAF',
    projectName: 'Campaign A',
    projectType: 'campaign',
    month: '2026-01-01',
    plannedHours: 8,
  },
  {
    department: '',
    employee: 'Siti',
    brand: 'Unknown Brand',
    projectName: 'pitch:9',
    projectType: 'pitch',
    month: '2025-12-01',
    plannedHours: 3.5,
  },
];

async function loadSheet(buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const ws = wb.getWorksheet('Detailed Data');
  if (!ws) throw new Error('Detailed Data sheet missing');
  return ws;
}

function rowValues(ws: ExcelJS.Worksheet, rowNumber: number): unknown[] {
  return (ws.getRow(rowNumber).values as unknown[]).slice(1);
}

describe('exportDetailedReportToExcel', () => {
  it('writes the columns in report order', async () => {
    const ws = await loadSheet(await exportDetailedReportToExcel(ROWS));
    expect(rowValues(ws, 1)).toEqual([
      'Department',
      'Employee',
      'Brand',
      'Project Name',
      'Project Type',
      'Month',
      'Planned Hours',
    ]);
  });

  it('writes a data row verbatim, blank department included', async () => {
    const ws = await loadSheet(await exportDetailedReportToExcel(ROWS));
    const values = rowValues(ws, 4);
    expect(String(values[0] ?? '')).toBe('');
    expect(values.slice(1, 5)).toEqual(['Siti', 'Unknown Brand', 'pitch:9', 'pitch']);
    expect(values[6]).toBe(3.5);
  });

  it('stores Month as a real date on the 1st of the month (UTC), displayed as mmm yyyy', async () => {
    const ws = await loadSheet(await exportDetailedReportToExcel(ROWS));

    const october = ws.getRow(2).getCell(6);
    expect(october.value).toBeInstanceOf(Date);
    const octoberDate = october.value as Date;
    expect(octoberDate.getUTCFullYear()).toBe(2025);
    expect(octoberDate.getUTCMonth()).toBe(9); // October
    expect(octoberDate.getUTCDate()).toBe(1);
    expect(october.numFmt).toBe('mmm yyyy');

    // Across the year boundary: the next row is January of the following year,
    // which only sorts after October because both are dates, not text.
    const january = ws.getRow(3).getCell(6);
    expect(january.value).toBeInstanceOf(Date);
    const januaryDate = january.value as Date;
    expect(januaryDate.getUTCFullYear()).toBe(2026);
    expect(januaryDate.getUTCMonth()).toBe(0);
    expect(januaryDate.getUTCDate()).toBe(1);
    expect(january.numFmt).toBe('mmm yyyy');
  });

  it('stores Planned Hours as a 1-decimal number, not text', async () => {
    const ws = await loadSheet(await exportDetailedReportToExcel(ROWS));
    const hours = ws.getRow(2).getCell(7);
    expect(hours.value).toBe(12.5);
    expect(typeof hours.value).toBe('number');
    expect(hours.numFmt).toBe('#,##0.0');
  });

  it('freezes the header row and puts filter dropdowns over the used range', async () => {
    const ws = await loadSheet(await exportDetailedReportToExcel(ROWS));
    const [view] = ws.views as ExcelJS.WorksheetViewFrozen[];
    expect(view.state).toBe('frozen');
    expect(view.ySplit).toBe(1);
    // Round-tripped through the file, autoFilter comes back as its A1 ref:
    // header row through the last data row, all seven columns.
    expect(ws.autoFilter).toBe(`A1:G${ROWS.length + 1}`);
  });

  it('adds no totals row — a totals row would poison every pivot built on this sheet', async () => {
    const ws = await loadSheet(await exportDetailedReportToExcel(ROWS));
    expect(ws.rowCount).toBe(ROWS.length + 1);
  });

  it('produces a header-only sheet when there are no rows', async () => {
    const ws = await loadSheet(await exportDetailedReportToExcel([]));
    expect(ws.rowCount).toBe(1);
    expect(rowValues(ws, 1)[0]).toBe('Department');
  });
});
