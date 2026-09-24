import { criteriaFor, isProfile, type Profile } from "../criteria";
import { composite, contrastRatio, parseColor, rgbCss, type Rgba } from "../contrast";
import type { Finding, ScanResult, Unknown } from "../shared/messages";

interface SavedColor { value: string; priority: string; applied: string }
interface Controller {
  dispose(): void;
}
declare global { interface Window { __wcagCheckerController?: Controller } }

window.__wcagCheckerController?.dispose();

const saved = new Map<HTMLElement, SavedColor>();
let observer: MutationObserver | undefined;
let updateTimer: number | undefined;
let activeProfile: Profile | undefined;
let disposed = false;
let pagePort: ChromePort | undefined;

function closePort(): void {
  const port = pagePort;
  pagePort = undefined;
  port?.disconnect();
}

function restore(): void {
  observer?.disconnect();
  if (updateTimer !== undefined) clearTimeout(updateTimer);
  updateTimer = undefined;
  for (const [element, color] of saved) {
    // Preserve page-side changes to the color made while visualization was active.
    if (element.style.getPropertyValue("color") !== color.applied || element.style.getPropertyPriority("color") !== "important") continue;
    if (color.value) element.style.setProperty("color", color.value, color.priority);
    else element.style.removeProperty("color");
  }
  saved.clear();
}

function selector(element: Element): string {
  const path: string[] = [];
  for (let current: Element | null = element; current && path.length < 5; current = current.parentElement) {
    const parent: Element | null = current.parentElement;
    const siblings = parent ? Array.from(parent.children).filter((child) => child.tagName === current!.tagName) : [];
    const ordinal = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : "";
    path.unshift(`${current.tagName.toLowerCase()}${ordinal}`);
  }
  return path.join(" > ");
}

function background(element: Element): { color?: Rgba; reason?: string } {
  const chain: Element[] = [];
  for (let current: Element | null = element; current; current = current.parentElement) chain.unshift(current);
  let color: Rgba = { r: 255, g: 255, b: 255, a: 1 };
  for (const current of chain) {
    const style = getComputedStyle(current);
    if (style.backgroundImage !== "none") return { reason: "背景画像またはグラデーション" };
    if (style.opacity !== "1" || style.mixBlendMode !== "normal" || style.filter !== "none" || style.backdropFilter !== "none") return { reason: "透過・フィルター・ブレンド" };
    const layer = parseColor(style.backgroundColor);
    if (!layer) return { reason: "背景色を解析できません" };
    color = composite(layer, color);
  }
  return { color };
}

function visible(element: HTMLElement, node: Text): boolean {
  if (element.closest("script,style,noscript,template,svg,canvas,[hidden],[inert]")) return false;
  for (let current: Element | null = element; current; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (style.display === "none" || style.contentVisibility === "hidden" || style.opacity === "0") return false;
  }
  if (getComputedStyle(element).visibility !== "visible") return false;
  const range = document.createRange();
  range.selectNodeContents(node);
  return Array.from(range.getClientRects()).some((rect) => rect.width > 0 && rect.height > 0);
}

function scan(profile: Profile): ScanResult {
  restore();
  const result: ScanResult = { profile, findings: [], unknown: [], checked: 0 };
  const criteria = criteriaFor(profile);
  if (criteria.length === 0) return result;
  const toVisualize: Array<{ element: HTMLElement; color: Rgba }> = [];
  const walker = document.createTreeWalker(document.body ?? document.documentElement, NodeFilter.SHOW_TEXT);
  const seen = new Set<HTMLElement>();
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const element = node.parentElement;
    if (!element || seen.has(element) || !node.textContent?.trim() || !visible(element, node)) continue;
    seen.add(element);
    const location = selector(element);
    const style = getComputedStyle(element);
    if (element.closest(":disabled,[aria-hidden='true']")) {
      result.unknown.push({ selector: location, reason: "非アクティブまたは補助技術から非表示" });
      continue;
    }
    const bg = background(element);
    const foreground = parseColor(style.color);
    const size = Number.parseFloat(style.fontSize);
    const weight = Number.parseInt(style.fontWeight, 10);
    if (!bg.color || !foreground || !Number.isFinite(size) || !Number.isFinite(weight)) {
      result.unknown.push({ selector: location, reason: bg.reason ?? "文字色または文字サイズを解析できません" });
      continue;
    }
    if (style.webkitTextFillColor && style.webkitTextFillColor !== style.color) {
      result.unknown.push({ selector: location, reason: "文字の塗り色が color と異なります" });
      continue;
    }
    const large = size >= 24 || (size >= 18 + 2 / 3 && weight >= 700);
    const ratio = contrastRatio(composite(foreground, bg.color), bg.color);
    result.checked++;
    const failed = criteria.filter((criterion) => ratio < (large ? criterion.large : criterion.normal));
    if (failed.length === 0) continue;
    const strictest = failed[failed.length - 1];
    const finding: Finding = {
      selector: location,
      sample: node.textContent.trim().slice(0, 80),
      ratio: Math.round(ratio * 100) / 100,
      threshold: large ? strictest.large : strictest.normal,
      criterion: strictest.id,
      large,
    };
    result.findings.push(finding);
    toVisualize.push({ element, color: bg.color });
  }
  for (const { element, color } of toVisualize) {
    const applied = rgbCss(color);
    const value = element.style.getPropertyValue("color");
    const priority = element.style.getPropertyPriority("color");
    element.style.setProperty("color", applied, "important");
    saved.set(element, { value, priority, applied: element.style.getPropertyValue("color") });
  }
  return result;
}

function observe(): void {
  if (!activeProfile) return;
  observer = new MutationObserver((mutations) => {
    if (mutations.every((mutation) => mutation.type === "attributes" && mutation.attributeName === "style" &&
      mutation.target instanceof HTMLElement && saved.get(mutation.target)?.applied === mutation.target.style.getPropertyValue("color"))) return;
    if (updateTimer !== undefined) clearTimeout(updateTimer);
    updateTimer = window.setTimeout(() => {
      if (!activeProfile || disposed) return;
      const result = scan(activeProfile);
      observe();
      void chrome.runtime.sendMessage({ type: "SCAN_UPDATE", result }).catch(() => {});
    }, 200);
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["style", "class", "hidden", "aria-hidden"] });
}

function onMessage(message: unknown, _sender: unknown, respond: (result?: ScanResult) => void): void {
  if (!message || typeof message !== "object") return;
  const command = message as { type?: unknown; profile?: unknown };
  if (command.type === "STOP") { activeProfile = undefined; restore(); closePort(); respond(); return; }
  if (command.type !== "RUN" || !isProfile(command.profile)) return;
  activeProfile = command.profile;
  const result = scan(command.profile);
  if (!pagePort) {
    pagePort = chrome.runtime.connect({ name: "wcag-checker-content" });
    pagePort.onDisconnect.addListener(() => {
      pagePort = undefined;
      activeProfile = undefined;
      restore();
    });
  }
  observe();
  respond(result);
}

chrome.runtime.onMessage.addListener(onMessage);
window.__wcagCheckerController = {
  dispose() {
    disposed = true;
    activeProfile = undefined;
    restore();
    closePort();
    chrome.runtime.onMessage.removeListener(onMessage);
  },
};
