// CSV com ";" e BOM UTF-8: abre corretamente no Excel em português.
const SEP = ';';

function cell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return '﻿' + rows.map((r) => r.map(cell).join(SEP)).join('\r\n');
}
