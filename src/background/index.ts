import { isProfile } from "../criteria";
import type { PanelCommand, ScanResult, WorkerReply } from "../shared/messages";

const sessions = new Map<ChromePort, number>();

function hostPattern(origin: string): string {
  const url = new URL(origin);
  return `${url.protocol}//${url.hostname}/*`;
}

function isCommand(value: unknown): value is PanelCommand {
  if (!value || typeof value !== "object") return false;
  const command = value as Record<string, unknown>;
  if (!Number.isSafeInteger(command.tabId) || Number(command.tabId) < 0 || !Number.isSafeInteger(command.requestId)) return false;
  if (command.type === "STOP") return true;
  if (command.type !== "RUN" || typeof command.origin !== "string" || !isProfile(command.profile)) return false;
  try {
    const url = new URL(command.origin);
    return ["http:", "https:"].includes(url.protocol) && url.origin === command.origin;
  } catch { return false; }
}

async function stop(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "STOP" }, { frameId: 0 });
  } catch { /* Navigation or permission revocation already discarded the page. */ }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "wcag-checker-content") {
    if (port.sender?.id !== chrome.runtime.id || port.sender.tab?.id === undefined || port.sender.frameId !== 0) port.disconnect();
    return;
  }
  if (port.name !== "wcag-checker-panel" || port.sender?.id !== chrome.runtime.id ||
      !port.sender.url?.startsWith(chrome.runtime.getURL("panel.html"))) {
    port.disconnect();
    return;
  }

  let generation = 0;
  let connected = true;

  port.onMessage.addListener((value: unknown) => {
    if (!isCommand(value)) { port.postMessage({ type: "ERROR", message: "不正な要求です。" } satisfies WorkerReply); return; }
    const current = ++generation;
    void (async () => {
      if (value.type === "STOP") {
        await stop(value.tabId);
        sessions.delete(port);
        if (connected) port.postMessage({ type: "STOPPED", requestId: value.requestId } satisfies WorkerReply);
        return;
      }
      const permitted = await chrome.permissions.contains({ origins: [hostPattern(value.origin)] });
      if (!permitted) throw new Error("このサイトへのアクセスが許可されていません。");
      const tab = await chrome.tabs.get(value.tabId);
      if (!tab.url || new URL(tab.url).origin !== value.origin) throw new Error("検査対象のページが移動しました。再実行してください。");
      await chrome.scripting.executeScript({ target: { tabId: value.tabId, allFrames: false }, files: ["inspected-page.js"], world: "ISOLATED" });
      if (!connected || current !== generation) return;
      const result = await chrome.tabs.sendMessage(value.tabId, { type: "RUN", profile: value.profile }, { frameId: 0 }) as ScanResult;
      if (!connected || current !== generation) { await stop(value.tabId); return; }
      sessions.set(port, value.tabId);
      port.postMessage({ type: "RESULT", requestId: value.requestId, result } satisfies WorkerReply);
    })().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "検査できませんでした。";
      if (connected && current === generation) port.postMessage({ type: "ERROR", requestId: value.requestId, message } satisfies WorkerReply);
    });
  });

  port.onDisconnect.addListener(() => {
    connected = false;
    generation++;
    const tabId = sessions.get(port);
    sessions.delete(port);
    if (tabId !== undefined) void stop(tabId);
  });
});

chrome.runtime.onMessage.addListener((value: unknown, sender) => {
  if (!value || typeof value !== "object" || (value as { type?: unknown }).type !== "SCAN_UPDATE") return;
  if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || sender.tab?.id === undefined) return;
  const result = (value as { result?: unknown }).result;
  if (!result || typeof result !== "object") return;
  for (const [port, tabId] of sessions) {
    if (tabId === sender.tab.id) port.postMessage({ type: "RESULT", result: result as ScanResult } satisfies WorkerReply);
  }
});
