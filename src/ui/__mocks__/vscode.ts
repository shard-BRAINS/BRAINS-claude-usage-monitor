// Minimal fake of the vscode namespace for use in vitest tests.
// Import via: vi.mock('vscode', () => import('./__mocks__/vscode'))

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}

// ---------------------------------------------------------------------------
// Uri stub
// ---------------------------------------------------------------------------

export class Uri {
  readonly scheme: string = 'file';
  readonly authority: string = '';
  readonly path: string;
  readonly query: string = '';
  readonly fragment: string = '';
  readonly fsPath: string;
  private constructor(fsPath: string) {
    this.fsPath = fsPath;
    this.path = fsPath;
  }

  toString(): string {
    return this.fsPath;
  }

  toJSON(): unknown {
    return { scheme: this.scheme, path: this.path, fsPath: this.fsPath };
  }

  with(_change: {
    scheme?: string;
    authority?: string;
    path?: string;
    query?: string;
    fragment?: string;
  }): Uri {
    return new Uri(this.fsPath);
  }

  static file(p: string): Uri {
    return new Uri(p);
  }

  static joinPath(base: Uri, ...parts: string[]): Uri {
    const sep = '/';
    const joined = [base.fsPath, ...parts].join(sep);
    return new Uri(joined);
  }
}

// ---------------------------------------------------------------------------
// Webview stub
// ---------------------------------------------------------------------------

export interface FakeWebview {
  options: Record<string, unknown>;
  html: string;
  cspSource: string;
  asWebviewUri(uri: Uri): Uri;
  postMessage(message: unknown): Thenable<boolean>;
}

export function makeFakeWebview(): FakeWebview {
  return {
    options: {},
    html: '',
    cspSource: 'https://fake.vscode-cdn.net',
    asWebviewUri(uri: Uri) {
      return uri;
    },
    postMessage(_message: unknown) {
      return Promise.resolve(true);
    },
  };
}

export interface FakeWebviewView {
  webview: FakeWebview;
  onDidDispose(callback: () => void): { dispose(): void };
}

export function makeFakeWebviewView(): FakeWebviewView {
  return {
    webview: makeFakeWebview(),
    onDidDispose(_callback: () => void): { dispose(): void } {
      return { dispose() {} };
    },
  };
}

export class ThemeColor {
  constructor(public id: string) {}
}

export class MarkdownString {
  value: string = '';
  isTrusted: boolean = false;
  supportHtml: boolean = false;
  constructor(v?: string) {
    if (v) this.value = v;
  }
  appendMarkdown(s: string): this {
    this.value += s;
    return this;
  }
}

export interface FakeStatusBarItem {
  alignment: StatusBarAlignment;
  priority: number;
  text: string;
  backgroundColor: ThemeColor | undefined;
  tooltip: MarkdownString | undefined;
  shown: boolean;
  show(): void;
  hide(): void;
  dispose(): void;
}

export const window = {
  createStatusBarItem(
    alignment: StatusBarAlignment,
    priority: number,
  ): FakeStatusBarItem {
    return {
      alignment,
      priority,
      text: '',
      backgroundColor: undefined,
      tooltip: undefined,
      shown: false,
      show() {
        this.shown = true;
      },
      hide() {
        this.shown = false;
      },
      dispose() {},
    };
  },
  registerWebviewViewProvider(
    _viewId: string,
    _provider: unknown,
  ): { dispose(): void } {
    return { dispose() {} };
  },
};

export const context = {
  subscriptions: [] as { dispose(): void }[],
};

// ---------------------------------------------------------------------------
// workspace stub
// ---------------------------------------------------------------------------

// In-memory config store: section+key -> value
const _configStore: Map<string, unknown> = new Map();

export function __setConfig(section: string, key: string, value: unknown): void {
  _configStore.set(`${section}.${key}`, value);
}

export function __clearConfig(): void {
  _configStore.clear();
}

// Listeners registered via onDidChangeConfiguration
type ConfigChangeListener = (e: { affectsConfiguration(key: string): boolean }) => void;
const _configListeners: ConfigChangeListener[] = [];

export function __clearListeners(): void {
  _configListeners.length = 0;
}

export const workspace = {
  getConfiguration(section: string): {
    get<T>(key: string, defaultValue?: T): T | undefined;
    has(key: string): boolean;
    update(key: string, value: unknown, target?: ConfigurationTarget): Thenable<void>;
  } {
    return {
      get<T>(key: string, _defaultValue?: T): T | undefined {
        const stored = _configStore.get(`${section}.${key}`);
        return stored !== undefined ? (stored as T) : _defaultValue;
      },
      has(key: string): boolean {
        return _configStore.has(`${section}.${key}`);
      },
      update(key: string, value: unknown, _target?: ConfigurationTarget): Thenable<void> {
        _configStore.set(`${section}.${key}`, value);
        return Promise.resolve();
      },
    };
  },

  onDidChangeConfiguration(listener: ConfigChangeListener): { dispose(): void } {
    _configListeners.push(listener);
    return {
      dispose() {
        const idx = _configListeners.indexOf(listener);
        if (idx !== -1) _configListeners.splice(idx, 1);
      },
    };
  },

  /** Test-only: fire a fake configuration change event. */
  __fireConfigChange(changedKey: string): void {
    const event = {
      affectsConfiguration(key: string): boolean {
        return key === changedKey || changedKey.startsWith(key + '.');
      },
    };
    for (const listener of _configListeners) {
      listener(event);
    }
  },
};

// ---------------------------------------------------------------------------
// Memento stub
// ---------------------------------------------------------------------------

export function makeFakeMemento(): {
  keys(): readonly string[];
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): Thenable<void>;
  __snapshot(): Record<string, unknown>;
} {
  const store = new Map<string, unknown>();
  return {
    keys(): readonly string[] {
      return Array.from(store.keys());
    },
    get<T>(key: string, defaultValue: T): T {
      return store.has(key) ? (store.get(key) as T) : defaultValue;
    },
    update(key: string, value: unknown): Thenable<void> {
      store.set(key, value);
      return Promise.resolve();
    },
    __snapshot(): Record<string, unknown> {
      return Object.fromEntries(store);
    },
  };
}
