import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const targetUrl =
  process.env.GEIWOHUO_URL ||
  "https://sso.geiwohuo.com/#/pfmp/return-management/return-order-list";

const username = process.env.GEIWOHUO_USERNAME;
const password = process.env.GEIWOHUO_PASSWORD;

if (!username || !password) {
  console.error(
    "Missing credentials. Set GEIWOHUO_USERNAME and GEIWOHUO_PASSWORD before running.",
  );
  process.exit(1);
}

const artifactDir = path.resolve("output/playwright");
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
const otpWaitMs = Number(process.env.GEIWOHUO_OTP_WAIT_MS || 5 * 60 * 1000);

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

try {
  console.log(`Opening ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});

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
      path: path.join(artifactDir, "login-fields-not-found.png"),
      fullPage: true,
    });
    throw new Error("Could not find username or password input.");
  }

  await usernameInput.fill(username);
  await passwordInput.fill(password);

  const submitButton = await firstVisible([
    page.getByRole("button", { name: /登录|登入|sign in|login/i }),
    page.locator('button[type="submit"]'),
    page.locator(".login-button, .login-btn, .submit, .ant-btn-primary"),
  ]);

  if (submitButton) {
    await submitButton.click();
  } else {
    await passwordInput.press("Enter");
  }

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
  } else {
    await page.waitForTimeout(3000);
  }

  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);

  const screenshotPath = path.join(artifactDir, "after-login.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });

  console.log(`Current URL: ${page.url()}`);
  console.log(`Screenshot: ${screenshotPath}`);

  if (process.env.KEEP_BROWSER_OPEN !== "0") {
    console.log("Browser is visible and will stay open. Press Ctrl+C here when finished.");
    await new Promise(() => {});
  }
} finally {
  if (process.env.KEEP_BROWSER_OPEN === "0") {
    await browser.close();
  }
}
