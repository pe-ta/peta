import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = process.env.OUT ?? "./out";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("console", (m) => { if (m.type() === "error") console.log("console.error:", m.text()); });

// 1. New brief
await page.goto(`${BASE}/briefs/new`);
await page.fill("#clientName", "メンズライフクリニック");
await page.fill("#lpUrl", "https://example.com/lp");
await page.fill("#offer", "LINE限定 55%OFF クーポン");
await page.fill("#target", "30代男性、初めて検討、価格を比較中");
await page.fill("#exitContext", "料金ページで戻る操作");
await page.fill("#ngWords", "激安、完治");
await page.fill("#primary", "#1a3a6b");
await page.fill("#accent", "#e5484d");
await page.click('button[type="submit"]');
await page.waitForURL(/\/briefs\/br_/, { timeout: 60000 });
const briefUrl = page.url();
console.log("brief:", briefUrl);
await page.waitForLoadState("networkidle");
await page.screenshot({ path: `${OUT}/01-brief.png`, fullPage: true });

const cards = await page.locator('a[href^="/creatives/"] img').count();
console.log("creative thumbnails:", cards);

// 2. Check image endpoints directly
const imgSrcs = await page.locator('a[href^="/creatives/"] img').evaluateAll((els) => els.map((e) => e.getAttribute("src")));
let i = 0;
for (const src of imgSrcs) {
  const res = await page.request.get(`${BASE}${src}`);
  const buf = await res.body();
  console.log(`${src} -> ${res.status()} ${res.headers()["content-type"]} ${buf.length} bytes frames=${res.headers()["x-frames"]}`);
  fs.writeFileSync(`${OUT}/img-${i++}.${res.headers()["content-type"].includes("gif") ? "gif" : "png"}`, buf);
}

// 3. Edit one creative
const firstCreative = await page.locator('a[href^="/creatives/"]').first().getAttribute("href");
await page.goto(`${BASE}${firstCreative}`);
await page.waitForLoadState("networkidle");
await page.screenshot({ path: `${OUT}/02-creative.png`, fullPage: true });
await page.fill("#headline", "必ず治るNo.1クリニック、激安で今だけ"); // intentionally risky copy
await Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), page.click('button:has-text("保存して再描画")')]);
await page.waitForSelector("text=NGワード", { timeout: 15000 });
const preflightText = await page.locator("text=プリフライト").first().locator("..").locator("..").innerText();
console.log("preflight after risky edit:\n", preflightText.split("\n").slice(0, 12).join("\n"));
await page.screenshot({ path: `${OUT}/03-creative-preflight.png`, fullPage: true });

// 4. Submit to client and approve via portal
await page.goto(briefUrl);
await page.click('button:has-text("チェックした案をクライアントに提出")');
await page.waitForLoadState("networkidle");
const reviewHref = await page.locator('a[href^="/review/"]').first().getAttribute("href");
console.log("review link:", reviewHref);
await page.goto(`${BASE}${reviewHref}`);
await page.waitForLoadState("networkidle");
await page.screenshot({ path: `${OUT}/04-review.png`, fullPage: true });
const forms = await page.locator("form").count();
console.log("review forms:", forms);
await page.locator('input[name="reviewer"]').first().fill("山田（マーケ部）");
await Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), page.locator('button:has-text("この案を承認")').first().click()]);
await page.waitForSelector("text=承認済みです", { timeout: 15000 });
console.log("approved banner:", await page.locator("text=承認済みです").count());
await page.locator('input[name="reviewer"]').first().fill("山田（マーケ部）");
await page.locator('label:has-text("訴求の方向性") input').first().check();
await page.locator('textarea[name="comment"]').first().fill("価格より診断の訴求を強めたい");
await Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), page.locator('button:has-text("修正を依頼")').first().click()]);
await page.waitForSelector("text=修正依頼", { timeout: 15000 });
await page.screenshot({ path: `${OUT}/05-review-after.png`, fullPage: true });

// 5. Brief page shows feedback; export zip
await page.goto(briefUrl);
await page.waitForLoadState("networkidle");
console.log("feedback entries:", await page.locator('h3:has-text("フィードバック（")').first().innerText());
await page.screenshot({ path: `${OUT}/06-brief-after.png`, fullPage: true });
const exportHref = await page.locator('a[href$="/export"]').getAttribute("href");
const zip = await page.request.get(`${BASE}${exportHref}`);
const zbuf = await zip.body();
fs.writeFileSync(`${OUT}/export.zip`, zbuf);
console.log("zip:", zip.status(), zip.headers()["content-type"], zbuf.length, "bytes");

// 6. Bad token
const bad = await page.request.get(`${BASE}/review/br_xxx.deadbeef`);
console.log("bad token status:", bad.status());

await browser.close();
