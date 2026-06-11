// 設定の初期値。options 画面で上書きできる。
// 辞書は複数（最大 MAX_DICTS 件）登録でき、それぞれが右クリックメニューに並ぶ。
// 既定は英辞郎 on the WEB（GET 検索: https://eow.alc.co.jp/search?q=WORD）。
const MAX_DICTS = 5;
const DEFAULT_DICTS = [
  {
    name: "英辞郎",
    baseUrl: "https://eow.alc.co.jp/search",
    paramName: "q",
    enabled: true,
  },
];

const MENU_PARENT_ID = "ridict-parent";
const MENU_ID_PREFIX = "ridict-lookup-"; // 後ろに dicts のインデックスが付く

// 保存済みの辞書リストを返す。読み取り専用にしておくこと。
// （ここで storage に書き込むと onChanged 経由で rebuildMenus が多重起動し、
// removeAll と create が交錯して duplicate id エラーになる。移行は onInstalled で行う）
async function getDicts() {
  const stored = await chrome.storage.sync.get(["dicts", "baseUrl", "paramName"]);

  if (Array.isArray(stored.dicts) && stored.dicts.length > 0) {
    // enabled が無い古いデータは ON 扱いに正規化する（storage には書き戻さない）。
    return stored.dicts
      .slice(0, MAX_DICTS)
      .map((d) => ({ ...d, enabled: d.enabled !== false }));
  }

  // 未移行の v0.1.0 設定（baseUrl / paramName 直置き）があれば、それを 1 件として扱う。
  if (stored.baseUrl && stored.paramName) {
    return [
      { name: "辞書", baseUrl: stored.baseUrl, paramName: stored.paramName, enabled: true },
    ];
  }

  return DEFAULT_DICTS;
}

// v0.1.0 の単一辞書設定を dicts 配列に移行する（インストール／更新時に一度だけ）。
async function migrateStorage() {
  const stored = await chrome.storage.sync.get(["dicts", "baseUrl", "paramName"]);
  if (Array.isArray(stored.dicts) && stored.dicts.length > 0) return;

  const dicts =
    stored.baseUrl && stored.paramName
      ? [{ name: "辞書", baseUrl: stored.baseUrl, paramName: stored.paramName, enabled: true }]
      : DEFAULT_DICTS;
  await chrome.storage.sync.set({ dicts });
  await chrome.storage.sync.remove(["baseUrl", "paramName"]);
}

// 右クリックメニューを辞書リストに合わせて作り直す。
// 1 件なら従来どおり単一項目、2 件以上なら親メニューの下に辞書名を並べる。
//
// 【Chrome の制約】ひとつの拡張機能がコンテキストメニューの最上位に置ける項目は
// ひとつだけ。2 つ以上作ると Chrome が自動的に拡張機能名（"ridict"）を親にして
// 折りたたむため、複数辞書をフラットに並べることはそもそもできない。
// それなら親のラベルは自前で作った方が「「%s」を辞書で調べる」と選択語を出せて
// 分かりやすい、というのがこの実装の理由。
async function rebuildMenus() {
  const dicts = await getDicts();
  await chrome.contextMenus.removeAll();

  // OFF の辞書はメニューに出さない。ID は dicts 配列の「元の」インデックスで振り、
  // onClicked 側の dicts[index] 参照が OFF を挟んでもズレないようにする。
  const enabled = dicts
    .map((dict, index) => ({ dict, index }))
    .filter(({ dict }) => dict.enabled);

  if (enabled.length === 0) return; // 全 OFF: メニュー自体を出さない

  if (enabled.length === 1) {
    const { dict, index } = enabled[0];
    createMenu({
      id: MENU_ID_PREFIX + index,
      title: `「%s」を${dict.name}で調べる`,
      contexts: ["selection"],
    });
    return;
  }

  createMenu({
    id: MENU_PARENT_ID,
    title: "「%s」を辞書で調べる",
    contexts: ["selection"],
  });
  enabled.forEach(({ dict, index }) => {
    createMenu({
      id: MENU_ID_PREFIX + index,
      parentId: MENU_PARENT_ID,
      title: dict.name,
      contexts: ["selection"],
    });
  });
}

// contextMenus.create のラッパー。コールバックで lastError を拾わないと
// 「Unchecked runtime.lastError」として拡張機能カードのエラー欄に蓄積されるため、
// ここで握ってサービスワーカーのコンソールに出す。
// （エラー欄のログは再読み込みでは消えず、「すべてクリア」か削除でしか消えない点にも注意）
function createMenu(properties) {
  chrome.contextMenus.create(properties, () => {
    if (chrome.runtime.lastError) {
      console.warn("contextMenus.create 失敗:", chrome.runtime.lastError.message);
    }
  });
}

// rebuildMenus は必ず 1 つずつ順番に実行する。
// 同時に走ると removeAll と create が交錯して duplicate id エラーになるため。
let rebuildQueue = Promise.resolve();
function scheduleRebuild() {
  rebuildQueue = rebuildQueue.then(rebuildMenus).catch((e) => console.error(e));
  return rebuildQueue;
}

// インストール／更新時: 旧設定を移行してからメニューを登録。
chrome.runtime.onInstalled.addListener(async () => {
  await migrateStorage();
  await scheduleRebuild();
});

// options 画面で辞書設定が変わったらメニューを作り直す。
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.dicts) {
    scheduleRebuild();
  }
});

// メニュークリック時: 英字を抽出して URL を組み立て、隣のタブで開く。
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const id = String(info.menuItemId);
  if (!id.startsWith(MENU_ID_PREFIX)) return;

  const word = extractEnglish(info.selectionText || "");
  if (!word) return;

  const dicts = await getDicts();
  const dict = dicts[Number(id.slice(MENU_ID_PREFIX.length))];
  if (!dict) return;

  const url = buildUrl(dict.baseUrl, dict.paramName, word);
  if (!url) return;

  chrome.tabs.create({
    url,
    index: tab ? tab.index + 1 : undefined, // 元タブのすぐ右に開く
  });
});

// 選択範囲から半角英字の語だけを取り出す（' と - は語中なら残す）。
// 例: "りんご apple を食べる" -> "apple"
function extractEnglish(text) {
  const tokens = text.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g);
  return tokens ? tokens.join(" ") : "";
}

// baseUrl にクエリパラメータを付与して検索 URL を作る。
function buildUrl(baseUrl, paramName, word) {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set(paramName, word);
    return url.toString();
  } catch {
    return ""; // baseUrl が不正な場合は何もしない
  }
}
