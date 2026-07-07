import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { exportBrandReportToExcel } from '@/lib/export/excel-export';
import type { BrandReportRow } from '@/lib/export/brand-report';

async function readSheet(buffer: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const ws = wb.getWorksheet('Brand Report');
  if (!ws) throw new Error('Brand Report sheet missing');
  const out: string[][] = [];
  ws.eachRow((row) => {
    const values = row.values as unknown[];
    out.push(values.slice(1).map((v) => (v == null ? '' : String(v))));
  });
  return out;
}

describe('exportBrandReportToExcel', () => {
  it('omits the Other Hours column when no row has other hours', async () => {
    const rows: BrandReportRow[] = [
      { brand: 'BAF', employee: 'Andi', campaignHours: 120.5, pitchHours: 30, otherHours: 0, totalHours: 150.5 },
    ];
    const sheet = await readSheet(await exportBrandReportToExcel(rows));
    expect(sheet[0]).toEqual(['Brand', 'Employee', 'Campaign Hours', 'Pitch Hours', 'Total Hours']);
    expect(sheet[1]).toEqual(['BAF', 'Andi', '120.5', '30', '150.5']);
  });

  it('includes the Other Hours column when a row has other hours', async () => {
    const rows: BrandReportRow[] = [
      { brand: 'BAF', employee: 'Andi', campaignHours: 10, pitchHours: 0, otherHours: 5, totalHours: 15 },
    ];
    const sheet = await readSheet(await exportBrandReportToExcel(rows));
    expect(sheet[0]).toEqual([
      'Brand',
      'Employee',
      'Campaign Hours',
      'Pitch Hours',
      'Other Hours',
      'Total Hours',
    ]);
    expect(sheet[1]).toEqual(['BAF', 'Andi', '10', '0', '5', '15']);
  });
});
