#!/usr/bin/env node
// zissl — Copyright (C) 2026 Eliyahu Moshe Leinkram
// SPDX-License-Identifier: AGPL-3.0-or-later
// Full notice: see LICENSE and NOTICE.md at the repo root.

/**
 * THE GOLDEN GATE, RUN BY A MACHINE — `npm test`.
 *
 * The comparison itself has to happen in a browser: hydra-synth is WebGL, zissl
 * is WebGPU, and only a real Chrome has both. So this serves the repo, drives a
 * headless Chrome at harness/index.html, and reads back the verdicts the page
 * computes — then prints them as a table and sets the exit code.
 *
 * It also runs the gate's OWN self-test: one sketch is re-rendered with a small
 * deliberate nudge, and the run only passes if the gate CATCHES it. A gate that
 * cannot fail is decoration.
 *
 *   node scripts/gate.mjs              # full gate + coverage + self-test
 *   node scripts/gate.mjs --head       # watch it happen in a visible window
 *   node scripts/gate.mjs --no-selftest
 *
 * Chrome: whatever CHROME_PATH points at, else a puppeteer cache download, else
 * the system Google Chrome. No binary is bundled or fetched by this repo.
 */
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HEAD = process.argv.includes("--head");
const SELFTEST = !process.argv.includes("--no-selftest");
const SELFTEST_SKETCH = "osc"; // the nudge lands here; it must go red

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".wgsl": "text/plain; charset=utf-8",
};

function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
      if (!path.startsWith(ROOT)) {
        res.writeHead(403).end("no");
        return;
      }
      const body = await readFile(path);
      res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

/** A Chrome we can drive — env, puppeteer's cache, or the installed browser. */
async function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const cache = join(homedir(), ".cache/puppeteer/chrome");
  if (existsSync(cache)) {
    const builds = (await readdir(cache)).sort();
    for (const build of builds.reverse()) {
      const p = join(cache, build, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
      if (existsSync(p)) return p;
      const linux = join(cache, build, "chrome-linux64/chrome");
      if (existsSync(linux)) return linux;
    }
  }
  for (const p of [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ]) {
    if (existsSync(p)) return p;
  }
  return null;
}

const bar = (s = "─") => s.repeat(72);

async function main() {
  let puppeteer;
  try {
    puppeteer = (await import("puppeteer-core")).default;
  } catch {
    console.error(
      "zissl gate: puppeteer-core is not installed.\n" +
        "  npm i -D puppeteer-core   (then `npm test`)\n" +
        "  or open harness/index.html in a WebGPU browser and read the table by eye.",
    );
    process.exit(2);
  }
  const chrome = await findChrome();
  if (!chrome) {
    console.error("zissl gate: no Chrome found. Set CHROME_PATH to a Chrome/Chromium binary.");
    process.exit(2);
  }

  const { server, port } = await serve();
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: HEAD ? false : "new",
    args: [
      "--enable-unsafe-webgpu",
      "--enable-features=Vulkan,UseSkiaRenderer",
      "--use-angle=default",
      "--ignore-gpu-blocklist",
      "--enable-gpu",
      "--no-sandbox",
    ],
  });

  const runPage = async (query = "") => {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto(`http://127.0.0.1:${port}/harness/index.html${query}`, { waitUntil: "load" });
    await page.waitForFunction("window.__done === true", { timeout: 180_000 }).catch(() => {});
    const out = await page.evaluate(() => ({
      gate: window.__gate ?? null,
      coverage: window.__coverage ?? null,
      done: window.__done === true,
    }));
    await page.close();
    return { ...out, errors };
  };

  let code = 0;
  try {
    const { gate, coverage, done, errors } = await runPage();
    if (!done || !gate) {
      console.error("zissl gate: the harness never finished.");
      for (const e of errors.slice(0, 8)) console.error("  " + e);
      process.exitCode = 1;
      return;
    }

    console.log(bar());
    console.log("zissl golden gate — every sketch pixel-diffed against hydra-synth");
    console.log(bar());
    console.log("sketch".padEnd(26) + "MAE".padStart(7) + "corr".padStart(9) + "  >8/255".padStart(9) + "   verdict");
    for (const r of gate) {
      const label =
        !r.pass ? "FAIL" + (r.err ? " — " + r.err : "")
          : r.kind === "beyond" ? "beyond hydra" + (r.twinMae != null ? ` (twin ${r.twinMae.toFixed(2)})` : "")
            : r.kind === "divergence" ? "ours, by design" + (r.twinMae != null ? ` (twin ${r.twinMae.toFixed(2)})` : "")
              : "pass";
      console.log(
        r.name.padEnd(26) +
          (isNaN(r.mae) ? "—" : r.mae.toFixed(2)).padStart(7) +
          (isNaN(r.corr) ? "—" : r.corr.toFixed(4)).padStart(9) +
          (isNaN(r.hotFrac) ? "—" : (r.hotFrac * 100).toFixed(2) + "%").padStart(9) +
          "   " + label,
      );
    }
    const passed = gate.filter((r) => r.pass).length;
    const matched = gate.filter((r) => r.kind === "match");
    const worst = matched.filter((r) => !isNaN(r.mae)).sort((a, b) => b.mae - a.mae)[0];
    console.log(bar());
    console.log(
      `${matched.filter((r) => r.pass).length}/${matched.length} sketches match hydra pixel for pixel` +
        (worst ? ` — worst MAE ${worst.mae.toFixed(2)} (${worst.name})` : ""),
    );
    const notes = gate.filter((r) => r.note);
    if (notes.length) {
      console.log(bar("·"));
      for (const r of notes) {
        console.log(`${r.kind === "beyond" ? "beyond hydra" : "divergence"}: ${r.name} — ${r.note}`);
      }
      console.log(bar("·"));
    }

    // --- the coverage contract ---
    if (coverage?.err) {
      console.log(`COVERAGE ERROR — ${coverage.err}`);
      code = 1;
    } else if (coverage) {
      if (coverage.missing.length) {
        console.log(`COVERAGE FAIL — hydra has, zissl lacks: ${coverage.missing.join(", ")}`);
        code = 1;
      }
      if (coverage.untested.length) {
        console.log(`COVERAGE FAIL — no sketch exercises: ${coverage.untested.join(", ")}`);
        code = 1;
      }
      if (!coverage.missing.length && !coverage.untested.length) {
        console.log(`coverage: all ${coverage.total} of hydra's operators exist here and are exercised`);
      }
      if (coverage.extras.length) console.log(`(zissl's own additions: ${coverage.extras.join(", ")})`);
    }
    if (passed !== gate.length) code = 1;

    // --- the self-test: the gate must be able to fail ---
    if (SELFTEST) {
      const mutated = await runPage(`?mutate=${SELFTEST_SKETCH}`);
      const row = mutated.gate?.find((r) => r.name === SELFTEST_SKETCH);
      if (!row) {
        console.log(`SELF-TEST ERROR — the mutation run produced no "${SELFTEST_SKETCH}" row`);
        code = 1;
      } else if (row.pass) {
        console.log(`SELF-TEST FAIL — a nudged "${SELFTEST_SKETCH}" still passed (MAE ${row.mae.toFixed(2)}): this gate is blind`);
        code = 1;
      } else {
        const collateral = mutated.gate.filter((r) => !r.pass && r.name !== SELFTEST_SKETCH);
        console.log(
          `self-test: a nudged "${SELFTEST_SKETCH}" was caught (MAE ${row.mae.toFixed(2)})` +
            (collateral.length ? ` — note: ${collateral.length} other sketch(es) also failed` : ""),
        );
      }
    }
    console.log(bar());
    console.log(code === 0 ? "GATE GREEN" : "GATE RED");
  } finally {
    await browser.close();
    server.close();
  }
  process.exitCode = code;
}

await main();
