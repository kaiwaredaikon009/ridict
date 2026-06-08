// 設定の初期値。options 画面で上書きできる。
// 既定は英辞郎 on the WEB（GET 検索: https://eow.alc.co.jp/search?q=WORD）。
const DEFAULTS = {
  baseUrl: "https://eow.alc.co.jp/search",
  paramName: "q",
};

const MENU_ID = "ridict-lookup";

// インストール／更新時: 既定値の補完と右クリックメニューの登録。
chrome.runtime.onInstalled.addListener(async () => {
  // 既存の設定は壊さず、未設定の項目だけ既定値で埋める。
  const current = await chrome.storage.sync.get(DEFAULTS);
  await chrome.storage.sync.set(current);

  chrome.contextMenus.create({
    id: MENU_ID,
    title: "「%s」を辞書で調べる",
    contexts: ["selection"], // テキスト選択時のみ表示
  });
});

// メニュークリック時: 英字を抽出して URL を組み立て、隣のタブで開く。
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;

  const word = extractEnglish(info.selectionText || "");
  if (!word) return;

  const { baseUrl, paramName } = await chrome.storage.sync.get(DEFAULTS);
  const url = buildUrl(baseUrl, paramName, word);
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
