// 設定の初期値。options 画面で上書きできる。
// 辞書は複数（最大 MAX_DICTS 件）登録でき、それぞれが右クリックメニューに並ぶ。
// 既定は英辞郎 on the WEB（GET 検索: https://eow.alc.co.jp/search?q=WORD）。
const MAX_DICTS = 5;
const DEFAULT_DICTS = [
  {
    name: "英辞郎",
    baseUrl: "https://eow.alc.co.jp/search",
    paramName: "q",
  },
];

const MENU_PARENT_ID = "ridict-parent";
const MENU_ID_PREFIX = "ridict-lookup-"; // 後ろに dicts のインデックスが付く

// 保存済みの辞書リストを返す。旧形式（baseUrl / paramName 直置き）からの移行も行う。
async function getDicts() {
  const stored = await chrome.storage.sync.get(["dicts", "baseUrl", "paramName"]);

  if (Array.isArray(stored.dicts) && stored.dicts.length > 0) {
    return stored.dicts.slice(0, MAX_DICTS);
  }

  // v0.1.0 の単一辞書設定が残っていれば 1 件目として引き継ぐ。
  if (stored.baseUrl && stored.paramName) {
    const dicts = [
      { name: "辞書", baseUrl: stored.baseUrl, paramName: stored.paramName },
    ];
    await chrome.storage.sync.set({ dicts });
    await chrome.storage.sync.remove(["baseUrl", "paramName"]);
    return dicts;
  }

  await chrome.storage.sync.set({ dicts: DEFAULT_DICTS });
  return DEFAULT_DICTS;
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

  if (dicts.length === 1) {
    chrome.contextMenus.create({
      id: MENU_ID_PREFIX + "0",
      title: `「%s」を${dicts[0].name}で調べる`,
      contexts: ["selection"],
    });
    return;
  }

  chrome.contextMenus.create({
    id: MENU_PARENT_ID,
    title: "「%s」を辞書で調べる",
    contexts: ["selection"],
  });
  dicts.forEach((dict, i) => {
    chrome.contextMenus.create({
      id: MENU_ID_PREFIX + i,
      parentId: MENU_PARENT_ID,
      title: dict.name,
      contexts: ["selection"],
    });
  });
}

// インストール／更新時にメニューを登録。
chrome.runtime.onInstalled.addListener(rebuildMenus);

// options 画面で辞書設定が変わったらメニューを作り直す。
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.dicts) {
    rebuildMenus();
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
