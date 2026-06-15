import fs from "node:fs/promises";
import path from "node:path";
import { loadSyncConfig } from "../src/config.mjs";
import { mergeTrendRowsForAccount } from "../src/excel_mapping.mjs";

const artifactDir = path.resolve("output/playwright");
const outputHeaders = ["spu", "productName", "date", "sales"];

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
  return [
    outputHeaders,
    ...rows.map((row) => outputHeaders.map((header) => row[header] ?? "")),
  ];
}

async function writeMatchedFiles(rows) {
  await fs.mkdir(artifactDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(artifactDir, `matched-trends-${timestamp}.json`);
  const csvPath = path.join(artifactDir, `matched-trends-${timestamp}.csv`);
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

  const { jsonPath, csvPath } = await writeMatchedFiles(allRows);

  console.log(`Loaded trends: ${trendJsonPath}`);
  console.log(`Matched rows: ${allRows.length}`);
  console.log(`Matched JSON: ${jsonPath}`);
  console.log(`Matched CSV: ${csvPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
