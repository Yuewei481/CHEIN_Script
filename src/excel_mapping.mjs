import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

function columnToIndex(column) {
  const normalized = String(column || "A").trim().toUpperCase();
  let index = 0;

  for (const char of normalized) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }

  return index - 1;
}

export async function loadSpuMapping(account) {
  if (!account.sourceExcel) return new Map();

  const excelPath = path.resolve(account.sourceExcel);
  if (!fs.existsSync(excelPath)) {
    throw new Error(`Excel mapping file does not exist: ${excelPath}`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);
  const sheet =
    (account.sourceExcelSheet && workbook.getWorksheet(account.sourceExcelSheet)) ||
    workbook.worksheets[0];

  if (!sheet) {
    throw new Error(`Sheet "${account.sourceExcelSheet || "(first sheet)"}" not found in ${excelPath}`);
  }

  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    rows.push(row.values.slice(1).map((value) => value ?? ""));
  });

  const [headers = [], ...dataRows] = rows;
  const spuIndex = columnToIndex(account.sourceExcelSpuColumn);
  const mapping = new Map();

  for (const row of dataRows) {
    const spu = String(row[spuIndex] || "").trim();
    if (!spu) continue;

    const details = {};
    headers.forEach((header, index) => {
      const key = String(header || `column_${index + 1}`).trim();
      details[key] = row[index] ?? "";
    });

    mapping.set(spu, details);
  }

  return mapping;
}

export async function mergeTrendRowsForAccount(trends, account) {
  const mapping = await loadSpuMapping(account);

  return trends.map((trend) => ({
    account: account.name,
    groupTitle: account.groupTitle,
    spu: trend.spu,
    sku: trend.sku,
    date: trend.date,
    sales: trend.sales ?? trend.yesterdaySales,
    ...mapping.get(trend.spu),
  }));
}
