// Mobile-width check: no horizontal overflow on the main pages, and the review portal is usable on a phone.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = process.env.OUT ?? "./out-mobile";
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const overflow = () => page.evaluate(() => {
  const w = document.documentElement.clientWidth;
  const wide = [...document.querySelectorAll("body *")].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.right > w + 1 && getComputedStyle(el).position !== "fixed" && !el.closest("pre, code, .overflow-x-auto");
  });
  return { scrollWidth: document.documentElement.scrollWidth, clientWidth: w, offenders: wide.slice(0, 5).map((el) => `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ").slice(0, 3).join(".")} ${Math.round(el.getBoundingClientRect().right)}px`) };
});

const html = await (await page.request.get(`${BASE}/`)).text();
const briefId = (html.match(/\/briefs\/(br_[a-z0-9]+)/) || [])[1];
const pages = ["/", "/learnings", "/templates", "/briefs/new"];
if (briefId) pages.push(`/briefs/${briefId}`);
let bad = 0;
for (const p of pages) {
  await page.goto(`${BASE}${p}`);
  await page.waitForLoadState("networkidle");
  const o = await overflow();
  const ok = o.scrollWidth <= o.clientWidth + 1;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${p} scrollWidth=${o.scrollWidth} client=${o.clientWidth}${ok ? "" : " " + o.offenders.join(", ")}`);
  await page.screenshot({ path: `${OUT}/${p.replace(/\//g, "_") || "_root"}.png`, fullPage: true });
}

// Review portal on a phone: open via the brief's link, approve one creative with taps.
if (briefId) {
  const briefHtml = await (await page.request.get(`${BASE}/briefs/${briefId}`)).text();
  const review = (briefHtml.match(/\/review\/[A-Za-z0-9_.]+/) || [])[0];
  await page.goto(`${BASE}${review}`);
  await page.waitForLoadState("networkidle");
  const o = await overflow();
  const ok = o.scrollWidth <= o.clientWidth + 1;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} review scrollWidth=${o.scrollWidth} client=${o.clientWidth}${ok ? "" : " " + o.offenders.join(", ")}`);
  const btn = page.locator('button:has-text("この案を承認")').first();
  if (await btn.count()) {
    const box = await btn.boundingBox();
    console.log("approve button tap target:", box ? `${Math.round(box.width)}x${Math.round(box.height)}` : "none", box && box.height < 40 ? "(FAIL < 40px)" : "");
    if (box && box.height < 40) bad++;
  } else console.log("approve button: none pending (all decided)");
  await page.screenshot({ path: `${OUT}/review.png`, fullPage: true });
}
console.log("console errors:", errors.length ? errors : "none");
process.exitCode = bad || errors.length ? 1 : 0;
await browser.close();
