// Create a brief with all three layouts and a pale LP-like accent, save every PNG for inspection.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = process.env.OUT ?? "./out-visual";
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto(`${BASE}/briefs/new`);
await page.fill("#clientName", "メンズライフクリニック");
await page.fill("#offer", "LINE限定 55%OFF クーポン");
await page.fill("#target", "30代男性、初めて検討、価格を比較中");
await page.fill("#exitContext", "料金ページで戻る操作");
await page.fill("#primary", "#2430a5");
await page.fill("#accent", "#98bfe6"); // pale accent like the one extracted from the real LP
await page.check('input[name="appealAxes"][value="campaign"]');
await page.uncheck('input[name="appealAxes"][value="invitation"]');
await page.click('button:has-text("挑戦者候補を生成する")');
await page.waitForURL(/\/briefs\/br_/, { timeout: 60000 });
await page.waitForLoadState("networkidle");
console.log("flash:", await page.locator('[role="status"]').first().innerText().catch(() => "(none)"));
console.log("next step:", await page.locator("text=次にやること").locator("..").innerText());
await page.screenshot({ path: `${OUT}/brief.png`, fullPage: true });

const srcs = await page.locator('a[href^="/creatives/"] img').evaluateAll((els) => els.map((e) => e.getAttribute("src")));
let i = 0;
for (const src of srcs) {
  const res = await page.request.get(`${BASE}${src}`);
  const buf = await res.body();
  console.log(src, res.status(), res.headers()["cache-control"], buf.length);
  fs.writeFileSync(`${OUT}/v${i++}.png`, buf);
}
// Empty submit should flash an error
await page.locator('input[name="creativeIds"]').evaluateAll((els) => els.forEach((e) => { e.checked = false; }));
await Promise.all([page.waitForURL(/err=/), page.click('button:has-text("チェックした案をクライアントに提出")')]);
console.log("empty submit flash:", await page.locator('[role="status"]').first().innerText());
// Edit page round trip
await page.click('a:has-text("ブリーフを編集")');
await page.waitForURL(/\/edit/);
await page.fill("#offer", "LINE限定 60%OFF クーポン");
await Promise.all([page.waitForURL(/msg=/), page.click('button:has-text("ブリーフを保存")')]);
console.log("edit flash:", await page.locator('[role="status"]').first().innerText());
console.log("console errors:", errors.length ? errors : "none");
await browser.close();
