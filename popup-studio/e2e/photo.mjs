// QA: photo visual from an LP OG image; invitation/choice must not duplicate; layout switch in editor; legacy-free paths.
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const OUT = process.env.OUT ?? "./out-photo";
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const post = (fn) => Promise.all([page.waitForResponse((r) => r.request().method() === "POST"), fn()]);

await page.goto(`${BASE}/briefs/new`);
await page.fill("#clientName", "テスト歯科クリニック");
await page.fill("#lpUrl", "http://localhost:3200/");
await page.fill("#offer", "矯正相談 無料");
await page.fill("#target", "20代女性、歯並びが気になる、費用を比較中");
await page.fill("#exitContext", "料金ページで戻る操作");
for (const id of ["compatibility", "invitation", "pain", "campaign", "quiz", "type_choice", "price"]) {
  const el = page.locator(`input[name="appealAxes"][value="${id}"]`);
  if (["compatibility", "invitation", "type_choice", "campaign"].includes(id)) await el.check(); else await el.uncheck();
}
await page.check('input[name="visualAxes"][value="art"]');
await page.check('input[name="visualAxes"][value="photo"]');
await page.click('button:has-text("挑戦者候補を生成する")');
await page.waitForURL(/\/briefs\/br_/, { timeout: 120000 });
await page.waitForLoadState("networkidle");
console.log("flash:", await page.locator('[role="status"]').first().innerText().catch(() => "(none)"));
console.log("brand chips:", await page.locator("text=/主色 #/").first().innerText());
const links = await page.locator('a[href^="/creatives/"]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute("href")))]);
console.log("creatives (expect 6 = question x2 + invitation + campaign x2 + choice):", links.length);
let i = 0;
for (const href of links) {
  const id = href.split("/").pop();
  const res = await page.request.get(`${BASE}/api/creatives/${id}/image?fmt=png`);
  const buf = await res.body();
  fs.writeFileSync(`${OUT}/${String(i++).padStart(2, "0")}-${id}.png`, buf);
  console.log(href, res.status(), buf.length, "degraded:", res.headers()["x-degraded"] ?? "-", "cache:", res.headers()["cache-control"]);
}
// Editor: switch a question creative to 多択型 with options, and to 写真 visual
await page.goto(`${BASE}${links[0]}`);
await page.waitForLoadState("networkidle");
await page.selectOption("#templateId", "choice");
await page.fill("#options", "ワイヤー矯正、マウスピース矯正");
await post(() => page.click('button:has-text("保存して再描画")'));
await page.waitForLoadState("networkidle");
console.log("after switch chips:", await page.locator(".chip").allInnerTexts().then((a) => a.slice(0, 6).join(" | ")));
console.log("preflight after switch:", await page.locator("text=プリフライト").first().locator("..").innerText().then((t) => t.split("\n").slice(0, 4).join(" / ")));
const id0 = links[0].split("/").pop();
const res = await page.request.get(`${BASE}/api/creatives/${id0}/image?fmt=png&v=2`);
fs.writeFileSync(`${OUT}/switched.png`, await res.body());
await page.screenshot({ path: `${OUT}/editor.png`, fullPage: true });
console.log("console errors:", errors.length ? errors : "none");
await browser.close();
