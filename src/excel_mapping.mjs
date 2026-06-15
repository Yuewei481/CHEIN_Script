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

function cellToText(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    if ("text" in value) return String(value.text ?? "").trim();
    if ("result" in value) return String(value.result ?? "").trim();
    if ("richText" in value) {
      return value.richText.map((entry) => entry.text || "").join("").trim();
    }
  }

  return String(value).trim();
}

export async function loadSpuMapping(account) {
  if (!account.sourceExcel) {
    throw new Error(`ACCOUNT_${account.index}_SOURCE_EXCEL is required for Excel matching.`);
  }

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

  const spuIndex = columnToIndex(account.sourceExcelSpuColumn);
  const nameIndex = columnToIndex(account.sourceExcelNameColumn);
  const mapping = new Map();

  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values.slice(1);
    const spu = cellToText(values[spuIndex]);
    if (!spu) return;

    mapping.set(spu, {
      productName: cellToText(values[nameIndex]),
      sourceRow: row.number,
    });
  });

  return mapping;
}

export async function mergeTrendRowsForAccount(trends, account) {
  const mapping = await loadSpuMapping(account);

  return trends
    .map((trend) => {
      const spu = cellToText(trend.spu);
      const matchedProduct = mapping.get(spu);
      if (!spu || !matchedProduct) return null;

      return {
        spu,
        productName: matchedProduct.productName,
        date: trend.date,
        sales: trend.sales ?? trend.yesterdaySales ?? "",
      };
    })
    .filter(Boolean);
}
