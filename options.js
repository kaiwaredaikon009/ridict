// 辞書は最大 MAX_DICTS 件。background.js 側と合わせること。
const MAX_DICTS = 5;
const DEFAULT_DICTS = [
  {
    name: "英辞郎",
    baseUrl: "https://eow.alc.co.jp/search",
    paramName: "q",
  },
];

const dictsEl = document.getElementById("dicts");
const templateEl = document.getElementById("dict-template");
const addEl = document.getElementById("add");
const statusEl = document.getElementById("status");

// 辞書 1 件分の入力行を追加する。
function addRow(dict = { name: "", baseUrl: "", paramName: "" }) {
  const row = templateEl.content.firstElementChild.cloneNode(true);
  row.querySelector(".name").value = dict.name;
  row.querySelector(".baseUrl").value = dict.baseUrl;
  row.querySelector(".paramName").value = dict.paramName;
  row.querySelector(".remove").addEventListener("click", () => {
    row.remove();
    renumber();
  });
  dictsEl.appendChild(row);
  renumber();
}

// 見出し番号と追加・削除ボタンの状態を行数に合わせて更新する。
function renumber() {
  const rows = dictsEl.querySelectorAll(".dict");
  rows.forEach((row, i) => {
    row.querySelector("h2").textContent = `辞書 ${i + 1}`;
    // 最後の 1 件は削除させない（メニューが空になるのを防ぐ）。
    row.querySelector(".remove").hidden = rows.length === 1;
  });
  addEl.hidden = rows.length >= MAX_DICTS;
}

// 保存済みの設定を読み込んでフォームに反映。
async function load() {
  const { dicts } = await chrome.storage.sync.get({ dicts: DEFAULT_DICTS });
  const list = Array.isArray(dicts) && dicts.length > 0 ? dicts : DEFAULT_DICTS;
  list.slice(0, MAX_DICTS).forEach(addRow);
}

// 入力値を検証して保存。
async function save() {
  const dicts = [];
  for (const row of dictsEl.querySelectorAll(".dict")) {
    const name = row.querySelector(".name").value.trim();
    const baseUrl = row.querySelector(".baseUrl").value.trim();
    const paramName = row.querySelector(".paramName").value.trim();
    const label = row.querySelector("h2").textContent;

    if (!name || !baseUrl || !paramName) {
      showStatus(`${label}: 表示名・URL・パラメータ名をすべて入力してください。`, true);
      return;
    }
    try {
      new URL(baseUrl); // URL として妥当か確認
    } catch {
      showStatus(`${label}: URL の形式が正しくありません。`, true);
      return;
    }
    dicts.push({ name, baseUrl, paramName });
  }

  await chrome.storage.sync.set({ dicts });
  showStatus("保存しました。", false);
}

function showStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#cf222e" : "#1a7f37";
  if (!isError) {
    setTimeout(() => (statusEl.textContent = ""), 1500);
  }
}

addEl.addEventListener("click", () => addRow());
document.getElementById("save").addEventListener("click", save);
load();
