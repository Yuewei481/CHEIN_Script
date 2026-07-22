import { spawn } from "node:child_process";
import path from "node:path";

const root = path.resolve(".");
const node = process.execPath;

function runStep(label, script, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    console.log(`\n==> ${label}`);
    const child = spawn(node, [script], {
      cwd: root,
      env: {
        ...process.env,
        ...extraEnv,
      },
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label} failed with exit code ${code}`));
    });
  });
}

const dryRunArg = process.argv.includes("--dry-run");
const wpsDryRun =
  dryRunArg
    ? "1"
    : process.env.SYNC_DRY_RUN === "1"
    ? "1"
    : process.env.SYNC_DRY_RUN === "0"
      ? "0"
      : process.env.WPS_DRY_RUN || "0";

await runStep("Collect CHEIN product trends", "scripts/collect_product_trends.mjs");
await runStep("Match collected rows with Excel", "scripts/match_excel.mjs");
await runStep("Write matched rows to WPS", "scripts/write_wps.mjs", {
  WPS_DRY_RUN: wpsDryRun,
});

console.log("\nCHEIN sync finished.");
