import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = process.env.OUT ?? "./out-loop";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("console", (m) => { if (m.type() === "error") console.log("console.error:", m.text()); });
const post = (fn) => Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), fn()]);

// Board empty state
await page.goto(`${BASE}/`);
await page.screenshot({ path: `${OUT}/00-board-empty.png`, fullPage: true });

// Brief with win metric
await page.goto(`${BASE}/briefs/new`);
await page.check('input[name="winMetric"][value="line_add_rate"]');
await page.fill("#clientName", "メンズライフクリニック");
await page.fill("#offer", "LINE限定 55%OFF クーポン");
await page.fill("#target", "30代男性、初めて検討、価格を比較中");
await page.fill("#exitContext", "料金ページで戻る操作");
await page.fill("#primary", "#1a3a6b");
await page.fill("#accent", "#e5484d");
// fewer cells: 2 axes x text only x static
await page.uncheck('input[name="appealAxes"][value="pain"]');
await page.uncheck('input[name="visualAxes"][value="photo"]');
await page.uncheck('input[name="motions"][value="blink"]');
await page.click('button:has-text("挑戦者候補を生成する")');
await page.waitForURL(/\/briefs\/br_/, { timeout: 60000 });
const briefUrl = page.url();
await page.waitForLoadState("networkidle");
const cards = await page.locator('a[href^="/creatives/"] img').count();
console.log("candidates:", cards);

// Critique all (rules fallback)
await post(() => page.click('button:has-text("案を辛口分析")'));
await page.waitForSelector("text=辛口 ", { timeout: 30000 });
console.log("critique chips:", await page.locator("text=/辛口 \\d+/").count());
await page.screenshot({ path: `${OUT}/01-brief-critiqued.png`, fullPage: true });

// Creative page critique panel
const first = await page.locator('a[href^="/creatives/"]').first().getAttribute("href");
await page.goto(`${BASE}${first}`);
await page.waitForLoadState("networkidle");
console.log("critique panel:", await page.locator("text=ダメな理由").count(), await page.locator("text=直し方").count());
await page.screenshot({ path: `${OUT}/02-creative-critique.png`, fullPage: true });

// Submit -> approve via portal (both)
await page.goto(briefUrl);
await post(() => page.click('button:has-text("チェックした案をクライアントに提出")'));
const reviewHref = await page.locator('a[href^="/review/"]').first().getAttribute("href");
await page.goto(`${BASE}${reviewHref}`);
for (let i = 0; i < 2; i++) {
  await page.locator('input[name="reviewer"]').first().fill("山田");
  await post(() => page.locator('button:has-text("この案を承認")').first().click());
  await page.waitForTimeout(500);
}
await page.goto(briefUrl);
await page.waitForLoadState("networkidle");
console.log("approved awaiting launch:", await page.locator('button:has-text("配信開始")').count());

// Launch both: first becomes champion
await Promise.all([page.waitForURL(/msg=/, { timeout: 30000 }), page.locator('button:has-text("配信開始")').first().click()]);
await page.waitForLoadState("networkidle");
await Promise.all([page.waitForURL(/msg=.*|err=.*/, { timeout: 30000 }), page.locator('button:has-text("配信開始")').first().click()]);
await page.waitForLoadState("networkidle");
await page.screenshot({ path: `${OUT}/03-experiment-live.png`, fullPage: true });

// Enter results: champion 4000/240/96, challenger 4000/320/180 -> challenger should win
// (1000 impressions is no longer enough: the sequential test needs p <= 0.05 valid under repeated looks)
const forms = page.locator('form:has(button:has-text("結果を保存"))');
console.log("result forms:", await forms.count());
async function fillResults(form, imp, clk, adds, cv) {
  await form.locator('input[name="impressions"]').fill(String(imp));
  await form.locator('input[name="clicks"]').fill(String(clk));
  await form.locator('input[name="lineAdds"]').fill(String(adds));
  await form.locator('input[name="conversions"]').fill(String(cv));
  await post(() => form.locator('button:has-text("結果を保存")').click());
  await page.waitForTimeout(400);
}
await fillResults(forms.nth(0), 4000, 240, 96, 12);
await fillResults(page.locator('form:has(button:has-text("結果を保存"))').nth(1), 4000, 320, 180, 24);
await page.waitForSelector("text=勝ち判定", { timeout: 15000 });
const verdict = await page.locator("text=/勝ち判定|負け判定|計測中|データ不足/").first().innerText();
console.log("verdict:", verdict);
await page.screenshot({ path: `${OUT}/04-results.png`, fullPage: true });

// Promote
await page.locator('input[name="nextHypothesis"]').first().fill("数字を大きくして限定性を足す");
const promote = page.locator('button:has-text("チャンピオンに昇格")').first();
console.log("promote enabled:", await promote.isEnabled());
{ const before = page.url(); await Promise.all([page.waitForURL((u) => u.toString() !== before && /msg=|err=/.test(u.toString()), { timeout: 30000 }), promote.click()]); }
if (/err=/.test(page.url())) { console.log("FAIL promote redirected with error:", decodeURIComponent(page.url())); process.exitCode = 1; }
await page.waitForLoadState("networkidle");
await page.screenshot({ path: `${OUT}/05-promoted.png`, fullPage: true });
console.log("learning entries:", await page.locator("text=/^勝ち$/").count());

// Board
await page.goto(`${BASE}/`);
await page.waitForLoadState("networkidle");
await page.screenshot({ path: `${OUT}/06-board.png`, fullPage: true });
console.log("board concluded this week:", await page.locator("text=今週、結論の出た仮説").locator("..").innerText());

await browser.close();
