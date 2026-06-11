import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const targetUrl =
  process.env.GEIWOHUO_URL ||
  "https://sso.geiwohuo.com/#/pfmp/return-management/return-order-list";

const username = process.env.GEIWOHUO_USERNAME;
const password = process.env.GEIWOHUO_PASSWORD;
const otpWaitMs = Number(process.env.GEIWOHUO_OTP_WAIT_MS || 5 * 60 * 1000);
const maxProducts = Number(process.env.MAX_PRODUCTS || 3);
const artifactDir = path.resolve("output/playwright");

if (!username || !password) {
  console.error(
    "Missing credentials. Set GEIWOHUO_USERNAME and GEIWOHUO_PASSWORD before running.",
  );
  process.exit(1);
}

await mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  headless: process.env.HEADLESS === "1",
  slowMo: Number(process.env.PLAYWRIGHT_SLOWMO || 80),
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
});
const page = await context.newPage();
page.setDefaultTimeout(Number(process.env.PLAYWRIGHT_TIMEOUT || 30000));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function humanPause(label) {
  const min = Number(process.env.HUMAN_DELAY_MIN_MS || 2000);
  const max = Number(process.env.HUMAN_DELAY_MAX_MS || 5000);
  const delay = Math.floor(min + Math.random() * (max - min + 1));
  console.log(`Waiting ${Math.round(delay / 1000)}s before ${label}`);
  await sleep(delay);
}

async function firstVisible(locators) {
  for (const locator of locators) {
    const count = await locator.count().catch(() => 0);
    for (let i = 0; i < count; i += 1) {
      const candidate = locator.nth(i);
      if (await candidate.isVisible().catch(() => false)) {
        return candidate;
      }
    }
  }
  return null;
}

async function click(locator, label) {
  await humanPause(label);
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.click();
}

async function fill(locator, value, label) {
  await humanPause(label);
  await locator.fill(value);
}

async function login() {
  console.log(`Opening ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});

  if (!page.url().includes("/#/login/")) {
    console.log("Already logged in or redirected past login.");
    return;
  }

  const usernameInput = await firstVisible([
    page.getByPlaceholder(/账号|用户名|手机号|手机|user|account|login/i),
    page.getByLabel(/账号|用户名|手机号|手机|user|account|login/i),
    page.locator('input[type="text"]'),
    page.locator("input:not([type])"),
  ]);
  const passwordInput = await firstVisible([
    page.getByPlaceholder(/密码|password/i),
    page.getByLabel(/密码|password/i),
    page.locator('input[type="password"]'),
  ]);

  if (!usernameInput || !passwordInput) {
    await page.screenshot({
      path: path.join(artifactDir, "collect-login-fields-not-found.png"),
      fullPage: true,
    });
    throw new Error("Could not find username or password input.");
  }

  await fill(usernameInput, username, "enter username");
  await fill(passwordInput, password, "enter password");

  const submitButton = await firstVisible([
    page.getByRole("button", { name: /登录|登入|sign in|login/i }),
    page.locator('button[type="submit"]'),
    page.locator(".login-button, .login-btn, .submit, .ant-btn-primary"),
  ]);

  if (submitButton) {
    await click(submitButton, "click login");
  } else {
    await humanPause("press Enter to login");
    await passwordInput.press("Enter");
  }

  await Promise.race([
    page
      .waitForURL((url) => !url.toString().includes("/#/login/"), {
        timeout: 20000,
      })
      .catch(() => null),
    page
      .getByPlaceholder(/短信验证码|验证码|OTP/i)
      .first()
      .waitFor({ state: "visible", timeout: 20000 })
      .catch(() => null),
    page
      .getByText(/手机号码验证|短信验证码|OTP码/i)
      .first()
      .waitFor({ state: "visible", timeout: 20000 })
      .catch(() => null),
  ]);

  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1000);

  const otpIndicator = await firstVisible([
    page.getByPlaceholder(/短信验证码|验证码|OTP/i),
    page.getByText(/手机号码验证|短信验证码|OTP码/i),
  ]);

  if (otpIndicator) {
    console.log(
      `OTP verification is visible. Waiting ${Math.round(
        otpWaitMs / 1000,
      )} seconds for manual verification in the browser...`,
    );

    await Promise.race([
      page
        .waitForURL((url) => !url.toString().includes("/#/login/"), {
          timeout: otpWaitMs,
        })
        .catch(() => null),
      otpIndicator.waitFor({ state: "hidden", timeout: otpWaitMs }).catch(() => null),
    ]);
  }

  if (page.url().includes("/#/login/")) {
    await page.screenshot({
      path: path.join(artifactDir, "collect-still-on-login.png"),
      fullPage: true,
    });
    throw new Error("Still on login page after submitting credentials.");
  }

  await page.waitForLoadState("networkidle").catch(() => {});
}

async function navigateToProductDetails() {
  const dataMenu = await firstVisible([
    page.getByText("数据", { exact: true }),
    page.locator("text=数据"),
  ]);
  if (dataMenu) {
    await click(dataMenu, "open 数据 menu");
  }

  const productAnalysis = await firstVisible([
    page.getByText("商品分析", { exact: true }),
    page.locator("text=商品分析"),
  ]);
  if (productAnalysis) {
    await click(productAnalysis, "open 商品分析");
  } else {
    await humanPause("navigate directly to 商品分析");
    await page.goto("https://sso.geiwohuo.com/#/sbn/merchandise/newGoodsPreview", {
      waitUntil: "domcontentloaded",
    });
  }

  await page.waitForLoadState("networkidle").catch(() => {});

  const detailsTab = await firstVisible([
    page.getByText("商品明细", { exact: true }),
    page.locator("text=商品明细"),
  ]);
  if (detailsTab) {
    await click(detailsTab, "open 商品明细");
  } else {
    await humanPause("navigate directly to 商品明细");
    await page.goto("https://sso.geiwohuo.com/#/sbn/merchandise/details", {
      waitUntil: "domcontentloaded",
    });
  }

  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);
}

function yesterdayLabels() {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return [`${yyyy}/${mm}/${dd}`, `${yyyy}-${mm}-${dd}`];
}

function normalizeSeriesValue(value) {
  if (Array.isArray(value)) return value.at(-1);
  if (value && typeof value === "object") return value.value ?? value.y ?? value.data;
  return value;
}

function extractYesterdaySalesFromRow(rowText) {
  const match = rowText.match(/(?:是|否)\s+([0-9]+)\s+[0-9]+/);
  if (!match) return null;
  return Number(match[1]);
}

function extractSalesFromCharts(charts) {
  const labels = yesterdayLabels();

  for (const chart of charts) {
    const xAxis = Array.isArray(chart.xAxis) ? chart.xAxis[0] : chart.xAxis;
    const dates = xAxis?.data || [];
    const dateIndex = dates.findIndex((date) =>
      labels.some((label) => String(date).includes(label)),
    );

    const seriesList = Array.isArray(chart.series) ? chart.series : [];
    const salesSeries =
      seriesList.find((series) => String(series.name || "").includes("销量")) ||
      seriesList[0];

    if (salesSeries?.data?.length) {
      const index = dateIndex >= 0 ? dateIndex : salesSeries.data.length - 1;
      return {
        date: dates[index] || labels[0],
        sales: normalizeSeriesValue(salesSeries.data[index]),
        seriesName: salesSeries.name || "",
      };
    }
  }

  return { date: labels[0], sales: null, seriesName: "" };
}

function findYesterdaySalesInJson(payload) {
  const labels = yesterdayLabels();
  const salesKeyPattern =
    /^(销量|saleQty|salesQty|saleNum|salesNum|salesVolume|saleCount|salesCount|payQty|payNum|orderSaleQty|orderSalesQty)$/i;
  const excludedSalesKeyPattern = /onsale|on_sale|saleFlag|saleStatus/i;
  const dateKeyPattern = /date|dt|day|stat|time/i;
  const candidates = [];

  function walk(value, pathParts = []) {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        walk(value[i], pathParts.concat(String(i)));
      }
      return;
    }

    if (!value || typeof value !== "object") return;

    const entries = Object.entries(value);
    const dateEntry = entries.find(([key, entryValue]) => {
      if (!dateKeyPattern.test(key)) return false;
      return labels.some((label) => String(entryValue).includes(label));
    });

    if (dateEntry) {
      const salesEntry = entries.find(([key, entryValue]) => {
        return (
          salesKeyPattern.test(key) &&
          !excludedSalesKeyPattern.test(key) &&
          Number.isFinite(Number(entryValue))
        );
      });

      if (salesEntry) {
        candidates.push({
          date: String(dateEntry[1]),
          sales: Number(salesEntry[1]),
          seriesName: salesEntry[0],
          path: pathParts.join("."),
        });
      }
    }

    for (const [key, entryValue] of entries) {
      walk(entryValue, pathParts.concat(key));
    }
  }

  walk(payload);
  return candidates[0] || null;
}

function captureJsonResponses() {
  const responses = [];

  const handler = async (response) => {
    const request = response.request();
    if (request.resourceType() !== "xhr" && request.resourceType() !== "fetch") {
      return;
    }

    const contentType = response.headers()["content-type"] || "";
    if (!contentType.includes("json")) return;

    try {
      const payload = await response.json();
      responses.push({
        url: response.url(),
        payload,
        salesCandidate: findYesterdaySalesInJson(payload),
      });
    } catch {
      // Some endpoints report JSON content but return an empty body.
    }
  };

  page.on("response", handler);
  return {
    responses,
    stop() {
      page.off("response", handler);
    },
  };
}

async function visibleTrendTargets() {
  return page.evaluate(() => {
    function visibleRect(element) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const visible =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth &&
        style.visibility !== "hidden" &&
        style.display !== "none";

      return visible ? rect : null;
    }

    const trendLinks = [...document.querySelectorAll("a, button, span, div")]
      .filter((element) => element.innerText?.trim() === "查看趋势")
      .map((element) => {
        const rect = visibleRect(element);
        if (!rect) return null;
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          top: rect.top,
          text: element.innerText,
        };
      })
      .filter(Boolean);

    const rowMap = new Map();
    const spuPattern = /SPU[:：]\s*([A-Za-z0-9_-]+)/;

    for (const element of document.querySelectorAll("tr, [class*='table-row'], [class*='TableRow']")) {
      const text = element.innerText || "";
      const spu = text.match(spuPattern)?.[1];
      if (!spu) continue;

      const rect = visibleRect(element);
      if (!rect) continue;

      const key = `${spu}:${Math.round(rect.top / 12)}`;
      if (!rowMap.has(key)) {
        rowMap.set(key, {
          rowText: text,
          spu,
          sku: text.match(/SKC?[:：]\s*([A-Za-z0-9_-]+)/)?.[1] || "",
          y: rect.top + rect.height / 2,
          top: rect.top,
          height: rect.height,
        });
      }
    }

    const rows = [...rowMap.values()].sort((a, b) => a.y - b.y);
    const targets = [];

    for (const row of rows) {
      const link = trendLinks
        .map((candidate) => ({
          ...candidate,
          distance: Math.abs(candidate.y - row.y),
        }))
        .filter((candidate) => candidate.distance <= Math.max(row.height / 2, 36))
        .sort((a, b) => a.distance - b.distance)[0];

      if (!link) continue;

      targets.push({
        x: link.x,
        y: link.y,
        rowText: row.rowText,
        spu: row.spu,
        sku: row.sku,
        linkY: link.y,
        rowY: row.y,
      });
    }

    return targets.sort((a, b) => a.y - b.y);
  });
}

async function readTrendModal() {
  await page.waitForTimeout(2500);

  const modalText = await page
    .locator(".sui-modal, .ant-modal, [role='dialog']")
    .first()
    .innerText()
    .catch(() => page.locator("body").innerText());

  const spu = modalText.match(/SPU[:：]\s*([A-Za-z0-9_-]+)/)?.[1] || "";
  const sku = modalText.match(/SKC?[:：]\s*([A-Za-z0-9_-]+)/)?.[1] || "";

  const charts = await page.evaluate(() => {
    const echartsApi = window.echarts;
    if (!echartsApi?.getInstanceByDom) return [];

    return [...document.querySelectorAll("[_echarts_instance_]")]
      .map((element) => echartsApi.getInstanceByDom(element)?.getOption())
      .filter(Boolean);
  });

  const chartSales = extractSalesFromCharts(charts);

  return {
    spu,
    sku,
    ...chartSales,
    rawText: modalText,
  };
}

async function closeTrendModal() {
  const closeButton = await firstVisible([
    page.locator(".sui-modal__close, .ant-modal-close").first(),
    page.getByRole("button", { name: /close|关闭/i }),
    page.locator("[aria-label='Close'], [aria-label='关闭']").first(),
  ]);

  if (closeButton) {
    await click(closeButton, "close trend modal");
  } else {
    await humanPause("press Escape to close trend modal");
    await page.keyboard.press("Escape");
  }

  await page
    .locator(".sui-modal, .ant-modal, [role='dialog']")
    .first()
    .waitFor({ state: "hidden", timeout: 10000 })
    .catch(() => {});
  await page.waitForTimeout(1000);
}

async function clickNextPageIfAvailable() {
  const nextButton = await firstVisible([
    page.locator(".sui-pagination-next:not(.is-disabled)").first(),
    page.locator(".btn-next:not([disabled])").first(),
    page.locator("button[aria-label*='next' i]:not([disabled])").first(),
    page.locator("button[aria-label*='下一页']:not([disabled])").first(),
  ]);

  if (!nextButton) return false;

  await click(nextButton, "go to next 商品明细 page");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);
  return true;
}

async function collectTrends() {
  const results = [];
  let pageNo = 1;

  while (maxProducts === 0 || results.length < maxProducts) {
    console.log(`Scanning 商品明细 page ${pageNo}`);
    await page.waitForTimeout(2000);

    let trendTargets = await visibleTrendTargets();
    const linkCount = trendTargets.length;
    await writeFile(
      path.join(artifactDir, `trend-targets-page-${pageNo}.json`),
      JSON.stringify(trendTargets, null, 2),
    );

    if (linkCount === 0) {
      await page.screenshot({
        path: path.join(artifactDir, `no-trend-links-page-${pageNo}.png`),
        fullPage: true,
      });
      throw new Error("Could not find 查看趋势 links.");
    }

    for (let i = 0; i < linkCount; i += 1) {
      if (maxProducts !== 0 && results.length >= maxProducts) break;

      trendTargets = await visibleTrendTargets();
      const target = trendTargets[i];
      if (!target) break;

      const rowText = target.rowText || "";
      const sniffer = captureJsonResponses();

      await humanPause(`open trend ${results.length + 1}`);
      await page.mouse.click(target.x, target.y);
      await page.waitForTimeout(5000);
      sniffer.stop();

      const trend = await readTrendModal();
      const responseSales = sniffer.responses.find((item) => item.salesCandidate)
        ?.salesCandidate;
      const tableSales = extractYesterdaySalesFromRow(rowText);
      const sales = trend.sales ?? responseSales?.sales ?? tableSales;
      const date = trend.sales == null && responseSales ? responseSales.date : trend.date;
      const seriesName =
        trend.sales == null && responseSales
          ? responseSales.seriesName
          : trend.seriesName || (tableSales == null ? "" : "tableRowSales");

      results.push({
        index: results.length + 1,
        page: pageNo,
        row: i + 1,
        spu:
          target.spu ||
          rowText.match(/SPU[:：]\s*([A-Za-z0-9_-]+)/)?.[1] ||
          trend.spu ||
          "",
        sku:
          target.sku ||
          rowText.match(/SKC?[:：]\s*([A-Za-z0-9_-]+)/)?.[1] ||
          trend.sku ||
          "",
        date,
        yesterdaySales: sales,
        seriesName,
      });

      console.log(
        `Collected #${results.length}: SPU=${results.at(-1).spu || "-"}, ${date} sales=${sales ?? "-"}`,
      );

      if (sales == null || process.env.DEBUG_RESPONSES === "1") {
        const debugPath = path.join(
          artifactDir,
          `trend-debug-${results.length}.json`,
        );
        await writeFile(
          debugPath,
          JSON.stringify(
            sniffer.responses.map((item) => ({
              url: item.url,
              salesCandidate: item.salesCandidate,
              payload: item.payload,
            })),
            null,
            2,
          ),
        );
        console.log(`Saved debug responses: ${debugPath}`);
      }

      await closeTrendModal();
    }

    if (maxProducts !== 0 && results.length >= maxProducts) break;

    const moved = await clickNextPageIfAvailable();
    if (!moved) break;
    pageNo += 1;
  }

  return results;
}

try {
  await login();
  await navigateToProductDetails();

  const results = await collectTrends();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(artifactDir, `product-trends-${timestamp}.json`);
  const csvPath = path.join(artifactDir, `product-trends-${timestamp}.csv`);

  await writeFile(jsonPath, JSON.stringify(results, null, 2));
  await writeFile(
    csvPath,
    ["index,page,row,spu,sku,date,yesterdaySales,seriesName"]
      .concat(
        results.map((item) =>
          [
            item.index,
            item.page,
            item.row,
            item.spu,
            item.sku,
            item.date,
            item.yesterdaySales,
            item.seriesName,
          ]
            .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
            .join(","),
        ),
      )
      .join("\n"),
  );

  console.log(`Saved JSON: ${jsonPath}`);
  console.log(`Saved CSV: ${csvPath}`);

  if (process.env.KEEP_BROWSER_OPEN !== "0") {
    console.log("Browser is visible and will stay open. Press Ctrl+C here when finished.");
    await new Promise(() => {});
  }
} finally {
  if (process.env.KEEP_BROWSER_OPEN === "0") {
    await browser.close();
  }
}
