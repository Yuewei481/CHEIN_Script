import "dotenv/config";

function env(name, fallback = "") {
  return process.env[name] ?? fallback;
}

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export function loadSyncConfig() {
  const accountCount = envNumber("ACCOUNT_COUNT", 1);
  const accounts = [];

  for (let i = 1; i <= accountCount; i += 1) {
    accounts.push({
      index: i,
      name: env(`ACCOUNT_${i}_NAME`, `CHEIN ${i}`),
      sourceExcel: env(`ACCOUNT_${i}_SOURCE_EXCEL`),
      sourceExcelSheet: env(`ACCOUNT_${i}_SOURCE_EXCEL_SHEET`),
      sourceExcelSpuColumn: env(`ACCOUNT_${i}_SOURCE_EXCEL_SPU_COLUMN`, "E"),
      sourceExcelNameColumn: env(`ACCOUNT_${i}_SOURCE_EXCEL_NAME_COLUMN`, "B"),
      groupTitle: env(`ACCOUNT_${i}_GROUP_TITLE`, `CHEIN ${i}`),
    });
  }

  return {
    accounts,
  };
}
