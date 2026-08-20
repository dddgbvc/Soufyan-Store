// مولّد ملف Excel المرافق لكل مستند.
// الفرق الجوهري عن النسخة السابقة: الأرقام تُكتب كأرقام حقيقية مع تنسيق
// عملة، لا كنصوص — فتصبح قابلة للجمع والفرز داخل Excel.

import ExcelJS from "npm:exceljs@4.4.0";
import type { SheetSpec } from "./documents.ts";
import type { StoreInfo } from "./pdf.ts";

const MONEY_FMT = '#,##0 "د.ع";[Red]-#,##0 "د.ع"';
const NAVY = "FF13203A";
const NAVY_SOFT = "FF253251";
const CARD = "FFF2F5F9";
const GOLD = "FFC9973F";

export async function buildSheet(spec: SheetSpec, store: StoreInfo): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = store.name;
  wb.created = new Date();

  const ws = wb.addWorksheet(spec.sheetName, {
    views: [{ rightToLeft: true, showGridLines: false, state: "frozen", ySplit: 0 }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const lastCol = Math.max(spec.columns.length, 4);
  const colLetter = (n: number) => ws.getColumn(n).letter;
  const span = (row: number) => `A${row}:${colLetter(lastCol)}${row}`;

  ws.columns = spec.columns.map((c) => ({ width: c.width }));
  while (ws.columns.length < lastCol) ws.columns.push({ width: 16 } as any);

  // ------------------------------- الترويسة -------------------------------
  ws.mergeCells(span(1));
  const titleCell = ws.getCell("A1");
  titleCell.value = store.name;
  titleCell.font = { name: "Arial", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  ws.getRow(1).height = 28;

  ws.mergeCells(span(2));
  const subCell = ws.getCell("A2");
  subCell.value = `${store.subtitle}  |  ${store.address}  |  ${store.phones.join(" - ")}`;
  subCell.font = { name: "Arial", size: 9, color: { argb: "FFFFFFFF" } };
  subCell.alignment = { horizontal: "center" };
  subCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_SOFT } };

  ws.mergeCells(span(3));
  const docCell = ws.getCell("A3");
  docCell.value = spec.title;
  docCell.font = { name: "Arial", size: 12, bold: true, color: { argb: NAVY } };
  docCell.alignment = { horizontal: "center" };
  docCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7E9CC" } };
  ws.getRow(3).height = 22;

  // ------------------------------ بطاقة المعلومات ------------------------------
  let row = 5;
  for (let i = 0; i < spec.info.length; i += 2) {
    const r = ws.getRow(row);
    r.getCell(1).value = spec.info[i].label;
    r.getCell(2).value = spec.info[i].value;
    if (spec.info[i + 1]) {
      r.getCell(3).value = spec.info[i + 1].label;
      r.getCell(4).value = spec.info[i + 1].value;
    }
    [1, 3].forEach((c) => {
      r.getCell(c).font = { name: "Arial", size: 10, bold: true, color: { argb: "FF5A6376" } };
      r.getCell(c).alignment = { horizontal: "right" };
    });
    [2, 4].forEach((c) => {
      r.getCell(c).font = { name: "Arial", size: 10 };
      r.getCell(c).alignment = { horizontal: "right" };
    });
    for (let c = 1; c <= lastCol; c++) {
      r.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: CARD } };
    }
    row++;
  }

  row++; // سطر فاصل

  // -------------------------------- الجدول --------------------------------
  const headerRowIndex = row;
  const header = ws.getRow(headerRowIndex);
  spec.columns.forEach((col, i) => {
    const cell = header.getCell(i + 1);
    cell.value = col.label;
    cell.font = { name: "Arial", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_SOFT } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: GOLD } } };
  });
  header.height = 20;
  row++;

  spec.rows.forEach((values, index) => {
    const r = ws.getRow(row);
    spec.columns.forEach((col, i) => {
      const cell = r.getCell(i + 1);
      const raw = values[i];
      if (col.type === "number") {
        cell.value = typeof raw === "number" ? raw : Number(raw) || 0;
        cell.numFmt = MONEY_FMT;
        cell.alignment = { horizontal: "left" };
      } else {
        cell.value = raw ?? "";
        cell.alignment = { horizontal: "right", wrapText: true, vertical: "middle" };
      }
      cell.font = { name: "Arial", size: 10 };
      cell.border = { bottom: { style: "hair", color: { argb: "FFDDE1E8" } } };
      if (index % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F9FB" } };
      }
    });
    row++;
  });

  if (spec.rows.length) {
    ws.autoFilter = {
      from: { row: headerRowIndex, column: 1 },
      to: { row: headerRowIndex + spec.rows.length, column: spec.columns.length },
    };
    ws.views = [{
      rightToLeft: true,
      showGridLines: false,
      state: "frozen",
      xSplit: 0,
      ySplit: headerRowIndex,
    }];
  }

  // ------------------------------ المجاميع ------------------------------
  row++;
  for (const item of spec.summary) {
    const r = ws.getRow(row);
    r.getCell(1).value = item.label;
    r.getCell(1).font = { name: "Arial", size: item.strong ? 11.5 : 10, bold: !!item.strong };
    r.getCell(1).alignment = { horizontal: "right" };
    const valueCell = r.getCell(2);
    valueCell.value = item.value;
    if (item.money && typeof item.value === "number") valueCell.numFmt = MONEY_FMT;
    valueCell.font = {
      name: "Arial",
      size: item.strong ? 12 : 10.5,
      bold: !!item.strong,
      color: { argb: item.strong ? NAVY : "FF333A48" },
    };
    valueCell.alignment = { horizontal: "left" };
    if (item.strong) {
      [1, 2].forEach((c) => {
        r.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDF1F6" } };
        r.getCell(c).border = { top: { style: "thin", color: { argb: NAVY } } };
      });
    }
    row++;
  }

  row++;
  ws.mergeCells(span(row));
  const statusCell = ws.getCell(`A${row}`);
  statusCell.value = spec.status;
  statusCell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  statusCell.alignment = { horizontal: "center" };
  statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };

  row += 2;
  ws.mergeCells(span(row));
  const footCell = ws.getCell(`A${row}`);
  footCell.value = store.footer;
  footCell.font = { name: "Arial", size: 8.5, color: { argb: "FF8A93A5" } };
  footCell.alignment = { horizontal: "center" };

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
