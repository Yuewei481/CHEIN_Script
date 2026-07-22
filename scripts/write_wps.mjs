import "dotenv/config";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const artifactDir = path.resolve("output/playwright");

function env(name, fallback = "") {
  return process.env[name] ?? fallback;
}

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function envFlag(name, fallback = false) {
  const value = process.env[name];
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "y"].includes(value.toLowerCase());
}

const config = {
  docUrl: env("WPS_DOC_URL", "https://www.kdocs.cn/l/chfPxzOOiHeN"),
  sheetName: env("WPS_SHEET_NAME", "运营数据记录表"),
  groupTitle: env("WPS_GROUP_TITLE", "CHEIN 1"),
  scanRange: env("WPS_SCAN_RANGE", "A1:AZ2000"),
  selectAll: envFlag("WPS_SELECT_ALL", false),
  horizontalScrollX: envNumber("WPS_HORIZONTAL_SCROLL_X", 0),
  horizontalDragX: envNumber("WPS_HORIZONTAL_DRAG_X", 0),
  matchedJson: env("MATCHED_TRENDS_JSON"),
  dryRun: envFlag("WPS_DRY_RUN", false),
  initialWaitMs: envNumber("WPS_INITIAL_WAIT_MS", 600000),
  minDelayMs: envNumber("HUMAN_DELAY_MIN_MS", 2000),
  maxDelayMs: envNumber("HUMAN_DELAY_MAX_MS", 5000),
  headless: envFlag("HEADLESS", false),
  closeAfterRun: envFlag("CLOSE_CHROME_AFTER_RUN", true),
  keepBrowserOnError: envFlag("KEEP_BROWSER_ON_ERROR", false),
  userDataDir: env("WPS_USER_DATA_DIR") || path.join(os.tmpdir(), "chein-wps-profile"),
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function humanPause(label) {
  const span = Math.max(0, config.maxDelayMs - config.minDelayMs);
  const ms = config.minDelayMs + Math.floor(Math.random() * (span + 1));
  console.log(`Waiting ${ms}ms: ${label}`);
  await sleep(ms);
}

async function latestMatchedJson() {
  const files = await fs.readdir(artifactDir);
  const matchedFiles = files
    .filter((file) => /^matched-trends-.*\.json$/.test(file))
    .sort();

  if (!matchedFiles.length) {
    throw new Error("No matched trend JSON files found. Run match:excel first.");
  }

  return path.join(artifactDir, matchedFiles.at(-1));
}

function columnNameToIndex(name) {
  let index = 0;
  for (const char of String(name).trim().toUpperCase()) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

function columnIndexToName(index) {
  let value = index + 1;
  let name = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }

  return name;
}

function parseCellAddress(address) {
  const match = String(address).trim().match(/^([A-Za-z]+)(\d+)$/);
  if (!match) throw new Error(`Invalid cell address: ${address}`);
  return {
    col: columnNameToIndex(match[1]),
    row: Number(match[2]),
  };
}

function parseRangeStart(range) {
  return parseCellAddress(String(range).split(":")[0]);
}

function toCellAddress(row, col) {
  return `${columnIndexToName(col)}${row}`;
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

function normalizeDate(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!match) return text;
  const [, year, month, day] = match;
  return `${Number(year)}/${Number(month)}/${Number(day)}`;
}

function parseTsv(text) {
  return String(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.split("\t"));
}

function findGroupBounds(groupRow, groupTitle) {
  const start = groupRow.findIndex((value) => normalizeText(value) === normalizeText(groupTitle));
  if (start === -1) {
    throw new Error(`Could not find group title "${groupTitle}" in the copied first row.`);
  }

  let end = groupRow.length - 1;
  for (let col = start + 1; col < groupRow.length; col += 1) {
    if (normalizeText(groupRow[col])) {
      end = col - 1;
      break;
    }
  }

  return { start, end };
}

function findHeaderColumn(headerRow, start, end, pattern, label) {
  for (let col = start; col <= end; col += 1) {
    if (pattern.test(String(headerRow[col] ?? ""))) return col;
  }

  throw new Error(`Could not find "${label}" header under the configured WPS group.`);
}

export function resolveWrites(copiedText, matchedRows, options) {
  const matrix = parseTsv(copiedText);
  const rangeStart = parseRangeStart(options.scanRange);
  const groupRow = matrix[0] || [];
  const headerRow = matrix[1] || [];
  const { start, end } = findGroupBounds(groupRow, options.groupTitle);
  const dateCol = findHeaderColumn(headerRow, start, end, /日期/, "日期");
  const nameCol = findHeaderColumn(headerRow, start, end, /SKU|商品|名称|名字/, "SKU/商品名字");
  const salesCol = findHeaderColumn(headerRow, start, end, /销量/, "销量");
  const rowIndex = new Map();

  for (let row = 2; row < matrix.length; row += 1) {
    const date = normalizeDate(matrix[row]?.[dateCol]);
    const productName = normalizeText(matrix[row]?.[nameCol]);
    if (!date || !productName) continue;
    rowIndex.set(`${date}::${productName}`, row);
  }

  const writes = [];
  const missing = [];

  for (const item of matchedRows) {
    const key = `${normalizeDate(item.date)}::${normalizeText(item.productName)}`;
    const row = rowIndex.get(key);
    if (row == null) {
      missing.push(item);
      continue;
    }

    writes.push({
      ...item,
      cell: toCellAddress(rangeStart.row + row, rangeStart.col + salesCol),
    });
  }

  return {
    columns: {
      groupStart: toCellAddress(rangeStart.row, rangeStart.col + start),
      groupEnd: toCellAddress(rangeStart.row, rangeStart.col + end),
      date: columnIndexToName(rangeStart.col + dateCol),
      productName: columnIndexToName(rangeStart.col + nameCol),
      sales: columnIndexToName(rangeStart.col + salesCol),
    },
    writes,
    missing,
  };
}

async function clickSheetTab(page, sheetName) {
  await page.getByText(sheetName, { exact: true }).first().waitFor({
    state: "visible",
    timeout: config.initialWaitMs,
  });
  await waitForBlockingPopup(page);
  await humanPause(`click sheet ${sheetName}`);
  await waitForBlockingPopup(page);

  const viewport = page.viewportSize();
  const minY = viewport?.height ? viewport.height - 130 : 600;
  const candidates = page.getByText(sheetName, { exact: true });
  const handles = await candidates.elementHandles();
  for (const handle of handles) {
    const box = await handle.boundingBox();
    if (!box || box.y < minY) continue;

    try {
      await handle.click({ force: true });
      await sleep(1000);
      return;
    } catch {
      // Try the next visible bottom tab before falling back.
    }
  }

  const tab = page.getByText(sheetName, { exact: true }).last();
  try {
    await tab.click();
  } catch (error) {
    await waitForBlockingPopup(page);
    await tab.click();
  }
  await sleep(1000);
}

async function hasBlockingPopup(page) {
  return page.evaluate(() => {
    const popup = document.querySelector("#util-popup");
    if (!popup) return false;

    const rect = popup.getBoundingClientRect();
    const style = window.getComputedStyle(popup);
    return (
      popup.getAttribute("data-fullviewport") === "true" &&
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.pointerEvents !== "none"
    );
  });
}

async function waitForBlockingPopup(page) {
  if (!(await hasBlockingPopup(page))) return;

  console.log(`WPS popup is visible. Please finish or close it in Chrome; waiting up to ${config.initialWaitMs}ms.`);
  await page.waitForFunction(
    () => {
      const popup = document.querySelector("#util-popup");
      if (!popup) return true;

      const rect = popup.getBoundingClientRect();
      const style = window.getComputedStyle(popup);
      return (
        popup.getAttribute("data-fullviewport") !== "true" ||
        rect.width === 0 ||
        rect.height === 0 ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.pointerEvents === "none"
      );
    },
    null,
    { timeout: config.initialWaitMs },
  );
  await sleep(1500);
}

async function focusNameBox(page) {
  const exactNameBox = page.locator(".name-box input.edit-box").first();
  if (await exactNameBox.isVisible().catch(() => false)) {
    await exactNameBox.click({ clickCount: 3, force: true });
    return;
  }

  const candidates = page.locator('input.edit-box, input, textarea, [contenteditable="true"]');
  const handles = await candidates.elementHandles();

  for (const handle of handles) {
    const box = await handle.boundingBox();
    if (!box) continue;
    if (box.x > 260 || box.y < 60 || box.y > 140 || box.width < 40 || box.width > 260) continue;

    try {
      await handle.click({ clickCount: 3, force: true });
      return;
    } catch {
      break;
    }
  }

  throw new Error("Could not reliably focus the WPS name box; aborting to avoid typing into sheet cells.");
}

async function selectRange(page, range) {
  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  await humanPause(`select ${range}`);
  await focusNameBox(page);
  await page.keyboard.press(`${modifier}+A`);
  await page.keyboard.type(range);
  await page.keyboard.press("Enter");
  await sleep(1000);
}

async function readClipboard(page) {
  try {
    return await page.evaluate(() => navigator.clipboard.readText());
  } catch {
    if (process.platform === "darwin") {
      return execFileSync("pbpaste", { encoding: "utf8" });
    }
    throw new Error("Could not read clipboard after copying WPS range.");
  }
}

async function copySelectedRange(page) {
  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  await humanPause("copy selected WPS range");
  await page.keyboard.press(`${modifier}+C`);
  await sleep(1500);
  return readClipboard(page);
}

async function copyWholeSheet(page) {
  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  if (config.horizontalScrollX) {
    await humanPause(`horizontal scroll ${config.horizontalScrollX}`);
    await page.mouse.wheel(config.horizontalScrollX, 0);
    await sleep(1000);
  }
  if (config.horizontalDragX) {
    await humanPause(`horizontal scrollbar drag ${config.horizontalDragX}`);
    const y = page.viewportSize()?.height ? page.viewportSize().height - 58 : 610;
    await page.mouse.move(120, y);
    await page.mouse.down();
    await page.mouse.move(120 + config.horizontalDragX, y, { steps: 12 });
    await page.mouse.up();
    await sleep(1000);
  }
  await humanPause("focus WPS grid");
  await page.mouse.click(120, 260);
  await humanPause("select whole WPS sheet");
  await page.keyboard.press(`${modifier}+A`);
  await page.keyboard.press(`${modifier}+A`);
  await sleep(1000);
  return copySelectedRange(page);
}

async function writeCell(page, cell, value) {
  await selectRange(page, cell);
  await humanPause(`write ${cell}`);
  await page.keyboard.type(String(value ?? ""));
  await page.keyboard.press("Enter");
}

async function main() {
  if (config.selectAll && !config.dryRun) {
    throw new Error("WPS_SELECT_ALL is only supported with WPS_DRY_RUN=1.");
  }

  const matchedJsonPath = config.matchedJson || (await latestMatchedJson());
  const matchedRows = JSON.parse(await fs.readFile(matchedJsonPath, "utf8"));

  const browser = await chromium.launchPersistentContext(config.userDataDir, {
    channel: "chrome",
    headless: config.headless,
    viewport: null,
    permissions: ["clipboard-read", "clipboard-write"],
  });

  const page = browser.pages()[0] || (await browser.newPage());

  try {
    await page.goto(config.docUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
    await clickSheetTab(page, config.sheetName);
    const copiedText = config.selectAll
      ? await copyWholeSheet(page)
      : await selectRange(page, config.scanRange).then(() => copySelectedRange(page));
    const copiedPath = path.join(
      artifactDir,
      `wps-copied-${new Date().toISOString().replace(/[:.]/g, "-")}.tsv`,
    );
    await fs.writeFile(copiedPath, copiedText);
    console.log(`Copied WPS range saved: ${copiedPath}`);
    const plan = resolveWrites(copiedText, matchedRows, {
      ...config,
      scanRange: config.selectAll ? "A1" : config.scanRange,
    });

    console.log(`Loaded matched rows: ${matchedJsonPath}`);
    console.log(`WPS group: ${config.groupTitle}`);
    console.log(`Detected columns: ${JSON.stringify(plan.columns)}`);
    console.log(`Writable rows: ${plan.writes.length}`);
    console.log(`Missing rows: ${plan.missing.length}`);

    if (plan.missing.length) {
      const missingPath = path.join(
        artifactDir,
        `wps-missing-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
      );
      await fs.writeFile(missingPath, JSON.stringify(plan.missing, null, 2));
      console.log(`Missing rows saved: ${missingPath}`);
    }

    if (config.dryRun) {
      console.log("Dry run enabled. Planned writes:");
      for (const item of plan.writes) {
        console.log(`${item.cell}: ${item.date} ${item.productName} => ${item.sales}`);
      }
      return;
    }

    for (const item of plan.writes) {
      await writeCell(page, item.cell, item.sales);
    }

    console.log(`Finished WPS writes: ${plan.writes.length}`);
  } catch (error) {
    if (config.keepBrowserOnError) {
      console.error(error);
      console.log("Keeping Chrome open because KEEP_BROWSER_ON_ERROR=1.");
      return;
    }
    throw error;
  } finally {
    if (config.closeAfterRun && !config.keepBrowserOnError) {
      await browser.close();
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
