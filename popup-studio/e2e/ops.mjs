// v0.5 experiment-operations loop: backlog -> creatives -> approval -> launch -> CSV import -> verdict -> promote -> hypothesis concluded; board + learnings + templates.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = process.env.OUT ?? "./out-ops";
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const submit = async (fn) => { const before = page.url(); await Promise.all([page.waitForURL((u) => u.toString() !== before && /msg=|err=/.test(u.toString()), { timeout: 60000 }), fn()]); await page.waitForLoadState("networkidle"); const t = await page.locator('[role="status"]').first().innerText().catch(() => "(none)"); await page.goto(page.url().split("?")[0]); await page.waitForLoadState("networkidle"); return t; };

// Brief with one hook so the initial grid is small
await page.goto(`${BASE}/briefs/new`);
await page.fill("#clientName", "テスト英会話スクール");
await page.selectOption("#industry", "教育・スクール");
await page.fill("#offer", "無料体験レッスン");
await page.fill("#target", "20代社会人、英語学習を再開したい、料金が気になる");
await page.fill("#exitContext", "料金ページで戻る操作");
for (const id of ["compatibility", "invitation", "pain", "campaign", "quiz", "type_choice", "price"]) {
  const el = page.locator(`input[name="appealAxes"][value="${id}"]`);
  if (id === "compatibility") await el.check(); else await el.uncheck();
}
await page.click('button:has-text("挑戦者候補を生成する")');
await page.waitForURL(/\/briefs\/br_/, { timeout: 120000 });
await page.waitForLoadState("networkidle");
const briefUrl = page.url().split("?")[0];
console.log("initial creatives:", await page.locator('a[href^="/creatives/"] img').count());

// Add a hypothesis and generate from it (grid hypotheses already exist and show "案を追加生成", so match exact text)
await page.fill('input[name="title"]:visible', "招待状型は様子見で離脱する層のタップ率を上げる");
await page.fill('input[name="rationale"]:visible', "過去の勝ち型。銀行・証券で実績");
await page.selectOption('select[name="hook"]:visible', "invitation");
await page.selectOption('select[name="priority"]:visible', "1");
console.log("add hypothesis:", await submit(() => page.click('button:text-is("追加")')));
console.log("backlog rows:", await page.locator("text=優先 1").count());
console.log("generate:", await submit(() => page.click('button:has-text("この仮説で案を作る")')));
console.log("creatives after:", await page.locator('a[href^="/creatives/"] img').count(), "status chips:", await page.locator("text=案を作成中").count());

// Submit all, approve all via portal
console.log("submit:", await submit(() => page.click('button:has-text("チェックした案をクライアントに提出")')));
const reviewHref = await page.locator('a[href^="/review/"]').first().getAttribute("href");
await page.goto(`${BASE}${reviewHref}`);
const n = await page.locator('button:has-text("この案を承認")').count();
for (let i = 0; i < n; i++) {
  await page.locator('input[name="reviewer"]').first().fill("山田");
  await Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), page.locator('button:has-text("この案を承認")').first().click()]);
  await page.waitForTimeout(400);
}
await page.goto(briefUrl);
await page.waitForLoadState("networkidle");
// Launch all approved (first = champion)
let launches = 0;
while ((await page.locator('button:has-text("配信開始")').count()) > 0 && launches < 3) {
  await submit(() => page.locator('button:has-text("配信開始")').first().click());
  launches++;
}
console.log("launched:", launches, "stage chip on brief:", await page.locator("text=検証中").count() > 0);

// CSV import: champion loses to challenger
const ids = await page.locator('form:has(button:has-text("結果を保存")) input[name="creativeId"]').evaluateAll((els) => els.map((e) => e.value));
console.log("live ids:", ids.length);
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const csv = ["creative_id,date,impressions,clicks,line_adds,conversions",
  `${ids[0]},${yesterday},600,30,12,1`, `${ids[0]},${today},1200,60,24,3`,
  ...ids.slice(1).map((id) => `${id},${yesterday},600,45,25,3\n${id},${today},1200,95,55,7`),
  `zc=cr_unknown,${today},10,1,0,0`].join("\n");
await page.locator("summary:has-text('配信結果を CSV で取り込む')").click();
await page.fill('textarea[name="csv"]', csv);
console.log("import:", await submit(() => page.click('button:has-text("取り込む")')));
console.log("estimate line:", await page.locator("text=/見込み|勝ち判定|負け判定/").first().innerText().catch(() => "(none)"));
await page.screenshot({ path: `${OUT}/brief-live.png`, fullPage: true });

// Promote the winner
const promote = page.locator('button:has-text("チャンピオンに昇格")').first();
console.log("promote enabled:", await promote.isEnabled());
await page.locator('input[name="nextHypothesis"]').first().fill("次は悩み共感型を試す");
console.log("promote:", await submit(() => promote.click()));
console.log("hypothesis concluded:", await page.locator("text=結論済み").count() > 0, "learning chips:", await page.locator("text=/^勝ち$/").count());

// Board
await page.goto(`${BASE}/`);
await page.waitForLoadState("networkidle");
console.log("board stage:", await page.locator(".chip", { hasText: /検証中|次の仮説が必要|結論を出す|配信待ち/ }).first().innerText().catch(() => "(none)"));
console.log("board next action:", await page.locator("text=次にやること").first().locator("..").innerText().then((t) => t.split("\n")[1]));
await page.screenshot({ path: `${OUT}/board.png`, fullPage: true });

// Learnings + templates
await page.goto(`${BASE}/learnings`);
await page.waitForLoadState("networkidle");
console.log("learnings tables:", await page.locator("table").count(), "won cells:", await page.locator("td.text-accent").filter({ hasText: /^[1-9]/ }).count());
await page.screenshot({ path: `${OUT}/learnings.png`, fullPage: true });
await page.goto(`${BASE}/templates`);
await page.waitForLoadState("networkidle");
console.log("template cards:", await page.locator("img[alt]").count());
await page.screenshot({ path: `${OUT}/templates.png`, fullPage: true });
console.log("console errors:", errors.length ? errors : "none");
await browser.close();
