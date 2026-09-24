interface ChromeEvent<T extends (...args: any[]) => unknown> {
  addListener(callback: T): void;
  removeListener(callback: T): void;
}
interface ChromePort {
  name: string;
  sender?: { id?: string; url?: string; frameId?: number; tab?: { id?: number } };
  onMessage: ChromeEvent<(message: any) => void>;
  onDisconnect: ChromeEvent<() => void>;
  postMessage(message: unknown): void;
  disconnect(): void;
}
declare const chrome: {
  devtools: {
    panels: { create(title: string, iconPath: string, pagePath: string): void };
    inspectedWindow: { tabId: number; eval(expression: string, callback: (value: unknown, error?: unknown) => void): void };
    network: { onNavigated: ChromeEvent<(url: string) => void> };
  };
  runtime: {
    id: string;
    getURL(path: string): string;
    connect(options: { name: string }): ChromePort;
    onConnect: ChromeEvent<(port: ChromePort) => void>;
    onMessage: ChromeEvent<(message: any, sender: { id?: string; frameId?: number; tab?: { id?: number } }, respond: (value?: any) => void) => void>;
    sendMessage(message: unknown): Promise<unknown>;
  };
  permissions: {
    request(options: { origins: string[] }): Promise<boolean>;
    contains(options: { origins: string[] }): Promise<boolean>;
  };
  tabs: {
    get(tabId: number): Promise<{ url?: string }>;
    sendMessage(tabId: number, message: unknown, options?: { frameId: number }): Promise<unknown>;
  };
  scripting: {
    executeScript(options: { target: { tabId: number; allFrames: boolean }; files: string[]; world: "ISOLATED" }): Promise<unknown>;
  };
};
