import fs from "node:fs/promises";

const BASE_URL = "https://kumamoto-tabeteouen.com";
const AREA_NAMES = ["県北", "阿蘇", "熊本市", "県央", "県南", "天草"];
const AREA_PATTERNS = [
  /^(荒尾市|玉名市|山鹿市|菊池市|合志市|玉名郡|菊池郡)/,
  /^(阿蘇市|阿蘇郡)/,
  /^熊本市/,
  /^(宇土市|宇城市|下益城郡|上益城郡)/,
  /^(八代市|八代郡|水俣市|葦北郡|人吉市|球磨郡)/,
  /^(上天草市|天草市)/,
];

function normalize(value) {
  return value
    .normalize("NFKC")
    .replace(/[‐‑‒–—―−ー]/g, "-")
    .replace(/[\s　]+/g, "")
    .toLowerCase();
}

function comparableName(value) {
  return normalize(value
    .replace(/（宴会・食事※宿泊費に含まれているものを除く）/g, "")
    .replace(/宿泊$/g, ""));
}

function decodeHtml(value) {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .trim();
}

function parsePage(html, areaIndex) {
  const rows = [...html.matchAll(/<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi)]
    .map((match) => ({
      name: decodeHtml(match[1]),
      address: decodeHtml(match[2]),
      area: AREA_NAMES[areaIndex],
    }));
  const dateMatch = html.match(/※\s*(\d{4})年(\d{1,2})月(\d{1,2})日現在/);
  return {
    rows,
    publishedDate: dateMatch
      ? `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`
      : null,
  };
}

function areaForAddress(address) {
  const index = AREA_PATTERNS.findIndex((pattern) => pattern.test(normalize(address)));
  return index >= 0 ? AREA_NAMES[index] : "不明";
}

function formatStore(store) {
  return `${store.name}｜${store.address}`;
}

function printItems(title, items) {
  console.log(`\n${title}: ${items.length}件`);
  for (const item of items) console.log(`  - [${item.area}] ${formatStore(item)}`);
}

async function main() {
  const [storesText, mapSource, ...responses] = await Promise.all([
    fs.readFile("app/data/stores.json", "utf8"),
    fs.readFile("app/store-map.tsx", "utf8"),
    ...AREA_NAMES.map((_, index) => fetch(`${BASE_URL}/store-area-${String(index + 1).padStart(2, "0")}.html`)),
  ]);

  const failed = responses.filter((response) => !response.ok);
  if (failed.length) {
    throw new Error(`公式ページの取得に失敗しました: ${failed.map((response) => `${response.url} (${response.status})`).join(", ")}`);
  }

  const pages = await Promise.all(responses.map((response) => response.text()));
  const parsed = pages.map(parsePage);
  const websiteDates = [...new Set(parsed.map((page) => page.publishedDate).filter(Boolean))];
  const webStores = parsed.flatMap((page) => page.rows);
  const currentStores = JSON.parse(storesText).map((store) => ({
    ...store,
    area: areaForAddress(store.address),
  }));
  const currentDateMatch = mapSource.match(/(\d{4})年(\d{1,2})月(\d{1,2})日時点/);
  const currentDate = currentDateMatch
    ? `${currentDateMatch[1]}-${currentDateMatch[2].padStart(2, "0")}-${currentDateMatch[3].padStart(2, "0")}`
    : null;

  const currentByKey = new Map(currentStores.map((store) => [`${normalize(store.name)}\0${normalize(store.address)}`, store]));
  const webByKey = new Map(webStores.map((store) => [`${normalize(store.name)}\0${normalize(store.address)}`, store]));
  let webOnly = webStores.filter((store) => !currentByKey.has(`${normalize(store.name)}\0${normalize(store.address)}`));
  let currentOnly = currentStores.filter((store) => !webByKey.has(`${normalize(store.name)}\0${normalize(store.address)}`));

  const labelChanges = [];
  for (const webStore of [...webOnly]) {
    const candidates = currentOnly.filter((store) => normalize(store.address) === normalize(webStore.address));
    const match = candidates.find((store) => comparableName(store.name) === comparableName(webStore.name))
      ?? (candidates.length === 1 ? candidates[0] : null);
    if (!match) continue;
    labelChanges.push({ web: webStore, current: match });
    webOnly = webOnly.filter((store) => store !== webStore);
    currentOnly = currentOnly.filter((store) => store !== match);
  }

  console.log("公式Web参加店 更新確認");
  console.log(`公式Web基準日: ${websiteDates.join(", ") || "取得不能"}`);
  console.log(`現在データ基準日: ${currentDate || "取得不能"}`);
  if (currentDate && websiteDates.some((date) => date < currentDate)) {
    console.log("警告: 公式Webの表示日付は現在データより古いため、差分を削除として自動反映しないでください。");
  }

  console.log("\nエリア別件数 (公式Web / 現在データ)");
  for (const area of AREA_NAMES) {
    const webCount = webStores.filter((store) => store.area === area).length;
    const currentCount = currentStores.filter((store) => store.area === area).length;
    console.log(`  ${area}: ${webCount} / ${currentCount} (${currentCount - webCount >= 0 ? "+" : ""}${currentCount - webCount})`);
  }
  console.log(`  合計: ${webStores.length} / ${currentStores.length} (${currentStores.length - webStores.length >= 0 ? "+" : ""}${currentStores.length - webStores.length})`);

  printItems("公式Webにのみ掲載", webOnly);
  printItems("現在データにのみ掲載", currentOnly);
  console.log(`\n同一住所の表記変更候補: ${labelChanges.length}件`);
  for (const change of labelChanges) {
    console.log(`  - [${change.web.area}] Web: ${change.web.name}`);
    console.log(`    現在: ${change.current.name}｜${change.current.address}`);
  }
}

main().catch((error) => {
  console.error(`更新確認に失敗しました: ${error.message}`);
  process.exitCode = 1;
});
