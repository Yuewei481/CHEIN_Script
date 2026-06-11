import fs from "node:fs/promises";
import path from "node:path";
import { loadSyncConfig } from "../src/config.mjs";
import { mergeTrendRowsForAccount } from "../src/excel_mapping.mjs";

const artifactDir = path.resolve("output/playwright");

async function latestTrendJson() {
  const files = await fs.readdir(artifactDir);
  const trendFiles = files
    .filter((file) => /^product-trends-.*\.json$/.test(file))
    .sort();

  if (!trendFiles.length) {
    throw new Error("No product trend JSON files found. Run collect:product-trends first.");
  }

  return path.join(artifactDir, trendFiles.at(-1));
}

function toWorksheetRows(rows) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [
    headers,
    ...rows.map((row) => headers.map((header) => row[header] ?? "")),
  ];
}

async function writePreparedFiles(rows) {
  await fs.mkdir(artifactDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(artifactDir, `wps-ready-${timestamp}.json`);
  const csvPath = path.join(artifactDir, `wps-ready-${timestamp}.csv`);
  const rowsMatrix = toWorksheetRows(rows);

  await fs.writeFile(jsonPath, JSON.stringify(rows, null, 2));
  await fs.writeFile(
    csvPath,
    rowsMatrix
      .map((row) =>
        row
          .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n"),
  );

  return { jsonPath, csvPath };
}

async function main() {
  const config = loadSyncConfig();
  const trendJsonPath = process.env.PRODUCT_TRENDS_JSON || (await latestTrendJson());
  const trends = JSON.parse(await fs.readFile(trendJsonPath, "utf8"));
  const allRows = [];

  for (const account of config.accounts) {
    allRows.push(...(await mergeTrendRowsForAccount(trends, account)));
  }

  const { jsonPath, csvPath } = await writePreparedFiles(allRows);

  console.log(`Loaded trends: ${trendJsonPath}`);
  console.log(`Prepared rows: ${allRows.length}`);
  console.log(`Prepared JSON: ${jsonPath}`);
  console.log(`Prepared CSV: ${csvPath}`);

  if (config.wps.writeMode !== "prepare") {
    console.log(
      "WPS browser writing is not enabled yet. Keep WPS_WRITE_MODE=prepare until the WPS sheet layout is calibrated.",
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
