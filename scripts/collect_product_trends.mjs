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

function formatDateLabels(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return [`${yyyy}/${mm}/${dd}`, `${yyyy}-${mm}-${dd}`];
}

function normalizeTrendDate(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!match) {
    throw new Error(`Invalid TREND_DATES date: ${trimmed}. Use YYYY/MM/DD or YYYY-MM-DD.`);
  }

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return formatDateLabels(date);
}

function trendDateLabels() {
  const configured = String(process.env.TREND_DATES || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (configured.length) {
    return configured.map((value) => normalizeTrendDate(value));
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return [formatDateLabels(yesterday)];
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

  return {
    spu,
    sku,
    rawText: modalText,
  };
}

async function readTooltipSalesForDate(labels) {
  const [slashLabel, dashLabel] = labels;
  const hoverTarget = await page.evaluate((labels) => {
    function isVisible(element) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    }

    const modal =
      document.querySelector(".sui-modal, .ant-modal, [role='dialog']") ||
      document.body;
    const canvases = [...modal.querySelectorAll("canvas")].filter(isVisible);
    const chartRect =
      canvases
        .map((canvas) => canvas.getBoundingClientRect())
        .sort((a, b) => b.width * b.height - a.width * a.height)[0] || null;

    const dateNodes = [...modal.querySelectorAll("*")].filter((element) => {
      const text = element.textContent?.trim();
      if (!text || !labels.some((label) => text === label || text.includes(label))) {
        return false;
      }
      if (text.length > 40) return false;
      return isVisible(element);
    });

    const dateRect =
      dateNodes
        .map((element) => element.getBoundingClientRect())
        .sort((a, b) => b.top - a.top)[0] || null;

    if (dateRect && chartRect) {
      const x = dateRect.left + dateRect.width / 2;
      return {
        x,
        yCandidates: [
          chartRect.top + chartRect.height * 0.75,
          chartRect.top + chartRect.height * 0.6,
          chartRect.top + chartRect.height * 0.45,
          chartRect.top + chartRect.height * 0.3,
          chartRect.top + chartRect.height * 0.15,
        ],
        source: "date-label-and-canvas",
      };
    }

    if (dateRect) {
      const x = dateRect.left + dateRect.width / 2;
      return {
        x,
        yCandidates: [80, 120, 160, 200, 240, 280, 320].map((offset) =>
          Math.max(20, dateRect.top - offset),
        ),
        source: "date-label-estimated-plot",
      };
    }

    if (chartRect) {
      const x = chartRect.right - 8;
      return {
        x,
        yCandidates: [
          chartRect.top + chartRect.height * 0.75,
          chartRect.top + chartRect.height * 0.6,
          chartRect.top + chartRect.height * 0.45,
          chartRect.top + chartRect.height * 0.3,
          chartRect.top + chartRect.height * 0.15,
        ],
        source: "canvas-right-edge",
      };
    }

    return null;
  }, [slashLabel, dashLabel]);

  if (!hoverTarget) {
    return {
      date: slashLabel,
      sales: null,
      tooltipText: "",
      hoverSource: "not-found",
    };
  }

  async function getTooltipText() {
    return page.evaluate((labels) => {
    const candidates = [...document.querySelectorAll("body *")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const text = element.innerText?.trim() || element.textContent?.trim() || "";
        return {
          text,
          area: rect.width * rect.height,
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            style.opacity !== "0",
        };
      })
      .filter(
        (item) =>
          item.visible &&
          item.text.length <= 200 &&
          item.area <= 80000 &&
          item.text.includes("销量") &&
          labels.some((label) => item.text.includes(label)) &&
          /销量\s+[0-9][0-9,]*(?:\.[0-9]+)?/.test(item.text),
      )
      .sort((a, b) => a.area - b.area);

    return candidates[0]?.text || "";
    }, [slashLabel, dashLabel]);
  }

  let tooltipText = "";
  let hoverY = null;
  let hoverX = hoverTarget.x;
  let elementsAtPoint = [];

  await humanPause(`hover ${slashLabel} on trend chart`);
  const xCandidates = [-60, -40, -20, 0, 20, 40].map(
    (offset) => hoverTarget.x + offset,
  );
  for (const x of xCandidates) {
    for (const y of hoverTarget.yCandidates || []) {
      await page.mouse.move(x, y, { steps: 8 });
      await page.waitForTimeout(350);

      tooltipText = await getTooltipText();
      hoverX = x;
      hoverY = y;
      elementsAtPoint = await page.evaluate(
        ({ x: pointX, y: pointY }) =>
          document.elementsFromPoint(pointX, pointY).slice(0, 8).map((element) => ({
            tag: element.tagName,
            className: String(element.className || ""),
            text: (element.innerText || element.textContent || "").trim().slice(0, 120),
          })),
        { x, y },
      );
      if (tooltipText) break;
    }
    if (tooltipText) break;
  }

  const salesMatch = tooltipText.match(/销量\s*([0-9][0-9,]*(?:\.[0-9]+)?)/);

  return {
    date: slashLabel,
    sales: salesMatch ? Number(salesMatch[1].replaceAll(",", "")) : null,
    seriesName: salesMatch ? "tooltipSales" : "",
    tooltipText,
    hoverSource: hoverTarget.source,
    hoverX,
    hoverY,
    elementsAtPoint,
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
  const datesToRead = trendDateLabels();

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

      await humanPause(`open trend ${results.length + 1}`);
      await page.mouse.click(target.x, target.y);
      await page.waitForTimeout(5000);

      const trend = await readTrendModal();

      for (const labels of datesToRead) {
        const tooltip = await readTooltipSalesForDate(labels);

        results.push({
          index: results.length + 1,
          page: pageNo,
          row: i + 1,
          spu: trend.spu || target.spu || "",
          sku: trend.sku || target.sku || "",
          date: tooltip.date,
          sales: tooltip.sales,
          seriesName: tooltip.seriesName,
          tooltipText: tooltip.tooltipText,
          hoverSource: tooltip.hoverSource,
        });

        console.log(
          `Collected #${results.length}: SPU=${results.at(-1).spu || "-"}, ${tooltip.date} sales=${tooltip.sales ?? "-"}`,
        );

        if (tooltip.sales == null) {
          await page.screenshot({
            path: path.join(artifactDir, `tooltip-missing-${results.length}.png`),
            fullPage: true,
          });
          const debugPath = path.join(
            artifactDir,
            `trend-debug-${results.length}.json`,
          );
          await writeFile(
            debugPath,
            JSON.stringify({ target, trend, tooltip }, null, 2),
          );
          console.log(`Saved tooltip debug: ${debugPath}`);
        }
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
    ["index,page,row,spu,sku,date,sales,seriesName,hoverSource,tooltipText"]
      .concat(
        results.map((item) =>
          [
            item.index,
            item.page,
            item.row,
            item.spu,
            item.sku,
            item.date,
            item.sales,
            item.seriesName,
            item.hoverSource,
            item.tooltipText,
          ]
            .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
            .join(","),
        ),
      )
      .join("\n"),
  );

  console.log(`Saved JSON: ${jsonPath}`);
  console.log(`Saved CSV: ${csvPath}`);

  if (process.env.KEEP_BROWSER_OPEN === "1") {
    console.log("Browser is visible and will stay open. Press Ctrl+C here when finished.");
    await new Promise(() => {});
  }
} finally {
  if (process.env.KEEP_BROWSER_OPEN !== "1") {
    await browser.close();
  }
}
