// v0.6: recommended hypotheses -> generate -> approve -> launch -> multi-day CSV with a champion
// pre-period -> same-period comparison + sequential test + trend chart -> client report (signed,
// separate from the review link) -> weekly North Star chart on the board -> report at 390px.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = process.env.OUT ?? "./out-v06";
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); if (!ok) failed++; };
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const submit = async (fn) => { const before = page.url(); await Promise.all([page.waitForURL((u) => u.toString() !== before && /msg=|err=/.test(u.toString()), { timeout: 60000 }), fn()]); const err = /err=/.test(page.url()); await page.waitForLoadState("networkidle"); const t = await page.locator('[role="status"]').first().innerText().catch(() => "(none)"); await page.goto(page.url().split("?")[0]); await page.waitForLoadState("networkidle"); if (err) { console.log("FAIL action error:", t); failed++; } return t; };
const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

// Brief with one hook: one grid hypothesis, one creative
await page.goto(`${BASE}/briefs/new`);
await page.fill("#clientName", "v06テスト証券");
await page.selectOption("#industry", "金融・保険");
await page.fill("#offer", "口座開設で2000円プレゼント");
await page.fill("#target", "30代会社員、NISAを検討中");
for (const id of ["compatibility", "invitation", "pain", "campaign", "quiz", "type_choice", "price"]) {
  const el = page.locator(`input[name="appealAxes"][value="${id}"]`);
  if (id === "compatibility") await el.check(); else await el.uncheck();
}
await page.click('button:has-text("挑戦者候補を生成する")');
await page.waitForURL(/\/briefs\/br_/, { timeout: 120000 });
await page.waitForLoadState("networkidle");
const briefUrl = page.url().split("?")[0];

// Recommendations: none of them is the hook already in play; adding one moves it to the backlog
const recBox = page.locator("text=次に試す仮説のおすすめ").locator("xpath=ancestor::div[contains(@class,'rounded-md')][1]");
const recHooks = await recBox.locator("li .chip.bg-accent-soft").allInnerTexts();
check("recommendations shown", recHooks.length >= 1, recHooks.join(" / "));
check("recommendations skip the hook in play", !recHooks.includes("相性診断"));
const firstRec = recHooks[0];
const openBefore = await page.locator("h2", { hasText: "仮説バックログ" }).innerText();
console.log("add recommendation:", await submit(() => recBox.locator('button:has-text("バックログに追加")').first().click()));
const openAfter = await page.locator("h2", { hasText: "仮説バックログ" }).innerText();
check("backlog grew", openBefore !== openAfter, `${openBefore} -> ${openAfter}`);
const recAfter = await page.locator("text=次に試す仮説のおすすめ").locator("xpath=ancestor::div[contains(@class,'rounded-md')][1]").locator("li .chip.bg-accent-soft").allInnerTexts().catch(() => []);
check("added hook no longer recommended", !recAfter.includes(firstRec));
check("added hypothesis is from the learning library", (await page.locator("text=学びログから ・ おすすめ").count()) > 0);
console.log("generate:", await submit(() => page.locator('button:has-text("この仮説で案を作る")').first().click()));

// Submit, approve via portal, launch both (first = champion)
console.log("submit:", await submit(() => page.click('button:has-text("チェックした案をクライアントに提出")')));
const reviewHref = await page.locator('a[href^="/review/"]').first().getAttribute("href");
const reportHref = await page.locator('a[href^="/report/"]').first().getAttribute("href");
await page.goto(`${BASE}${reviewHref}`);
const n = await page.locator('button:has-text("この案を承認")').count();
for (let i = 0; i < n; i++) {
  await page.locator('input[name="reviewer"]').first().fill("佐藤");
  await Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), page.locator('button:has-text("この案を承認")').first().click()]);
  await page.waitForTimeout(400);
}
await page.goto(briefUrl);
await page.waitForLoadState("networkidle");
let launches = 0;
while ((await page.locator('button:has-text("配信開始")').count()) > 0 && launches < 3) {
  await submit(() => page.locator('button:has-text("配信開始")').first().click());
  launches++;
}
check("two creatives live", launches === 2, String(launches));

// Champion ran 2 days before the challenger at a high rate (6%), then 2.5% alongside it; challenger 4.5%.
const ids = await page.locator('form:has(button:has-text("結果を保存")) input[name="creativeId"]').evaluateAll((els) => els.map((e) => e.value));
const [champ, chal] = ids;
const csv = ["creative_id,date,impressions,clicks,line_adds,conversions",
  `${champ},${day(3)},1000,50,60,5`, `${champ},${day(2)},2000,100,120,10`, `${champ},${day(1)},4000,180,170,14`, `${champ},${day(0)},6000,260,220,18`,
  `${chal},${day(1)},2000,100,90,8`, `${chal},${day(0)},4000,200,180,16`].join("\n");
await page.locator("summary:has-text('配信結果を CSV で取り込む')").click();
await page.fill('textarea[name="csv"]', csv);
console.log("import:", await submit(() => page.click('button:has-text("取り込む")')));
const body = await page.locator("main").innerText().catch(() => page.locator("body").innerText());
check("same-period comparison", /同時期比較（チャンピオンは挑戦者の配信開始以降 4,000 表示）/.test(body));
check("sequential p shown", /逐次検定 p=/.test(body));
check("verdict won", /勝ち判定/.test(body));
check("trend chart rendered", (await page.locator('svg[aria-label$="の推移"]').count()) >= 1);
check("promote enabled", await page.locator('button:has-text("チャンピオンに昇格")').first().isEnabled());
await page.screenshot({ path: `${OUT}/brief.png`, fullPage: true });

// Client report: signed, separate link, no internal chrome
await page.goto(`${BASE}${reportHref}`);
await page.waitForLoadState("networkidle");
const report = await page.locator("body").innerText();
check("report renders", /検証レポート/.test(report) && /v06テスト証券 様/.test(report));
check("report hides internal nav", (await page.locator('a:has-text("実験ボード")').count()) === 0 && !/生成AI未接続/.test(report));
check("report shows running test", /検証中の案/.test(report) && /現行より良い結果が確定しました/.test(report));
check("report has trend", (await page.locator('svg[aria-label$="の推移"]').count()) >= 1);
check("report avoids internal jargon", !/チャンピオン|逐次検定 p=|辛口/.test(report));
await page.screenshot({ path: `${OUT}/report.png`, fullPage: true });
const swapReview = await page.goto(`${BASE}/report/${reviewHref.split("/").pop()}`);
check("review token does not open the report", swapReview.status() === 404, String(swapReview.status()));
const swapReport = await page.goto(`${BASE}/review/${reportHref.split("/").pop()}`);
check("report token does not open the review portal", swapReport.status() === 404, String(swapReport.status()));
errors.splice(0); // the two 404s above are deliberate

// Promote, then the board shows the weekly North Star chart
await page.goto(briefUrl);
await page.waitForLoadState("networkidle");
console.log("promote:", await submit(() => page.locator('button:has-text("チャンピオンに昇格")').first().click()));
await page.goto(`${BASE}/`);
await page.waitForLoadState("networkidle");
check("weekly chart on board", (await page.locator('svg[aria-label="週ごとの結論数"]').count()) === 1);
check("cycle time shown", (await page.locator("text=仮説 → 結論の日数（中央値）").count()) === 1);
await page.screenshot({ path: `${OUT}/board.png`, fullPage: true });

// Report after promotion: lift vs the first popup
await page.goto(`${BASE}${reportHref}`);
await page.waitForLoadState("networkidle");
const after = await page.locator("body").innerText();
check("report lists the win", /これまでの結果と学び/.test(after) && /勝ち/.test(after));
check("report shows lift vs first popup", /最初のポップアップ比\s*\n?\s*[+-]\d+%/.test(after));

// Report at phone width
const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
await m.goto(`${BASE}${reportHref}`);
await m.waitForLoadState("networkidle");
const sw = await m.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
check("report fits 390px", sw[0] <= sw[1], `scrollWidth=${sw[0]} client=${sw[1]}`);
await m.screenshot({ path: `${OUT}/report-mobile.png`, fullPage: true });

check("no console errors", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(failed ? `v06: ${failed} failed` : "v06: all passed");
process.exitCode = failed ? 1 : 0;
