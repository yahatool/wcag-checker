import "./style.css";
import { DEFAULT_PROFILE, type Profile, type WcagLevel, type WcagVersion } from "../criteria";
import type { ScanResult, WorkerReply } from "../shared/messages";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Panel root element is missing");
root.innerHTML = [
  '<header><h1>WCAG Checker</h1><p>テキストのコントラスト不足を背景と同じ色で可視化します。</p></header>',
  '<section class="controls" aria-label="検査条件">',
  '<label>WCAG バージョン <select id="version"><option>2.0</option><option>2.1</option><option selected>2.2</option></select></label>',
  '<label>適合レベル <select id="level"><option>A</option><option selected>AA</option><option>AAA</option></select></label>',
  '<div class="actions"><button id="start" type="button">検査して可視化</button><button id="stop" type="button" disabled>停止して元に戻す</button></div>',
  '</section><p id="status" role="status" aria-live="polite">対象ページを確認しています。</p>',
  '<section id="results" hidden aria-label="検査結果"><h2>検査結果</h2><p id="summary"></p><ol id="findings"></ol>',
  '<h3>未判定</h3><p id="unknown-count"></p><ol id="unknown"></ol></section>',
  '<p class="note">自動検査だけでは WCAG への適合を保証できません。背景画像、iframe、Shadow DOM などは検査範囲外または未判定です。</p>',
].join("");

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error("Missing panel element: " + id);
  return element as T;
}
const version = required<HTMLSelectElement>("version");
const level = required<HTMLSelectElement>("level");
const start = required<HTMLButtonElement>("start");
const stop = required<HTMLButtonElement>("stop");
const status = required<HTMLParagraphElement>("status");
const results = required<HTMLElement>("results");
const summary = required<HTMLElement>("summary");
const findings = required<HTMLOListElement>("findings");
const unknownCount = required<HTMLElement>("unknown-count");
const unknown = required<HTMLOListElement>("unknown");
const port = chrome.runtime.connect({ name: "wcag-checker-panel" });
const tabId = chrome.devtools.inspectedWindow.tabId;
const pending = new Map<number, { resolve: (reply: WorkerReply) => void; reject: (error: Error) => void }>();
let sequence = 0;
let origin: string | undefined;
let active = false;
let busy = false;
let generation = 0;

function profile(): Profile {
  return { version: version.value as WcagVersion, level: level.value as WcagLevel };
}
function setStatus(message: string): void { status.textContent = message; }
function updateButtons(): void {
  start.disabled = busy || !origin || level.value === "A";
  stop.disabled = busy || !active;
  version.disabled = busy;
  level.disabled = busy;
}
function render(result: ScanResult): void {
  results.hidden = false;
  findings.replaceChildren();
  unknown.replaceChildren();
  summary.textContent = "WCAG " + result.profile.version + "・" + result.profile.level + "（" + (result.profile.level === "AAA" ? "1.4.3 / 1.4.6" : "1.4.3") + "）：" + result.checked + " 件を判定、" + result.findings.length + " 件が基準未満。";
  for (const item of result.findings) {
    const li = document.createElement("li");
    li.textContent = item.selector + "「" + item.sample + "」 — " + item.ratio + ":1 / 必要 " + item.threshold + ":1（" + item.criterion + "、" + (item.large ? "大きな文字" : "通常文字") + "）";
    findings.append(li);
  }
  unknownCount.textContent = result.unknown.length + " 件。";
  for (const item of result.unknown) {
    const li = document.createElement("li");
    li.textContent = item.selector + " — " + item.reason;
    unknown.append(li);
  }
}
port.onMessage.addListener((reply: WorkerReply) => {
  if (reply.requestId === undefined) {
    if (reply.type === "RESULT" && active && reply.result.profile.version === version.value && reply.result.profile.level === level.value) render(reply.result);
    return;
  }
  const waiting = pending.get(reply.requestId);
  if (!waiting) return;
  pending.delete(reply.requestId);
  if (reply.type === "ERROR") waiting.reject(new Error(reply.message));
  else waiting.resolve(reply);
});
port.onDisconnect.addListener(() => {
  for (const waiting of pending.values()) waiting.reject(new Error("拡張機能との接続が切れました。"));
  pending.clear();
  active = false;
  setStatus("拡張機能との接続が切れました。DevTools を開き直してください。");
  updateButtons();
});
function send(command: { type: "STOP"; tabId: number } | { type: "RUN"; tabId: number; origin: string; profile: Profile }): Promise<WorkerReply> {
  const requestId = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject });
    port.postMessage({ ...command, requestId });
  });
}
function readOrigin(): void {
  const current = ++generation;
  origin = undefined;
  updateButtons();
  chrome.devtools.inspectedWindow.eval("location.origin", (value, error) => {
    if (current !== generation) return;
    if (error || typeof value !== "string") { setStatus("このページの URL を取得できません。"); return; }
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol) || url.origin !== value) throw new Error();
      origin = value;
      setStatus(level.value === "A" ? "レベル A にはテキストのコントラスト達成基準がありません。" : "検査の準備ができました。");
    } catch { setStatus("保護ページや特殊な URL は検査できません。"); }
    updateButtons();
  });
}
async function run(): Promise<void> {
  if (busy || !origin || level.value === "A") return;
  busy = true; updateButtons();
  const requestedOrigin = origin;
  const selected = profile();
  try {
    const url = new URL(requestedOrigin);
    const granted = await chrome.permissions.request({ origins: [url.protocol + "//" + url.hostname + "/*"] });
    if (!granted) { setStatus("サイトへのアクセス許可がないため、検査できません。"); return; }
    setStatus("検査中です…");
    const reply = await send({ type: "RUN", tabId, origin: requestedOrigin, profile: selected });
    if (reply.type !== "RESULT") throw new Error("結果を受け取れませんでした。");
    active = true;
    render(reply.result);
    setStatus("可視化中です。停止すると元の色に戻ります。");
  } catch (error) { setStatus(error instanceof Error ? error.message : "検査できませんでした。"); }
  finally { busy = false; updateButtons(); }
}
async function stopAndClear(): Promise<boolean> {
  if (busy) return false;
  busy = true; updateButtons();
  let stopped = false;
  try { await send({ type: "STOP", tabId }); stopped = true; }
  catch (error) { setStatus(error instanceof Error ? error.message : "停止できませんでした。"); }
  finally {
    if (stopped) { active = false; results.hidden = true; }
    busy = false;
    updateButtons();
  }
  return stopped;
}
start.addEventListener("click", () => { void run(); });
stop.addEventListener("click", () => { void stopAndClear().then((stopped) => { if (stopped) setStatus("表示を元に戻しました。"); }); });
async function onProfileChange(): Promise<void> {
  const wasActive = active;
  if (wasActive && !await stopAndClear()) return;
  else results.hidden = true;
  if (level.value === "A") setStatus("レベル A にはテキストのコントラスト達成基準がありません。");
  else if (wasActive) setStatus("条件を変更しました。再検査するには「検査して可視化」を押してください。");
  else setStatus("検査の準備ができました。");
  updateButtons();
}
version.addEventListener("change", () => { void onProfileChange(); });
level.addEventListener("change", () => { void onProfileChange(); });
chrome.devtools.network.onNavigated.addListener(() => {
  for (const waiting of pending.values()) waiting.reject(new Error("ページが移動しました。"));
  pending.clear();
  active = false;
  results.hidden = true;
  void send({ type: "STOP", tabId }).catch(() => {});
  readOrigin();
});
window.addEventListener("pagehide", () => port.disconnect());
version.value = DEFAULT_PROFILE.version;
level.value = DEFAULT_PROFILE.level;
readOrigin();
