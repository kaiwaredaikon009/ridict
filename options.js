const DEFAULTS = {
  baseUrl: "https://eow.alc.co.jp/search",
  paramName: "q",
};

const baseUrlEl = document.getElementById("baseUrl");
const paramNameEl = document.getElementById("paramName");
const statusEl = document.getElementById("status");

// 保存済みの設定を読み込んでフォームに反映。
async function load() {
  const cfg = await chrome.storage.sync.get(DEFAULTS);
  baseUrlEl.value = cfg.baseUrl;
  paramNameEl.value = cfg.paramName;
}

// 入力値を検証して保存。
async function save() {
  const baseUrl = baseUrlEl.value.trim();
  const paramName = paramNameEl.value.trim();

  if (!baseUrl || !paramName) {
    showStatus("URL とパラメータ名を入力してください。", true);
    return;
  }
  try {
    new URL(baseUrl); // URL として妥当か確認
  } catch {
    showStatus("URL の形式が正しくありません。", true);
    return;
  }

  await chrome.storage.sync.set({ baseUrl, paramName });
  showStatus("保存しました。", false);
}

function showStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#cf222e" : "#1a7f37";
  if (!isError) {
    setTimeout(() => (statusEl.textContent = ""), 1500);
  }
}

document.getElementById("save").addEventListener("click", save);
load();
