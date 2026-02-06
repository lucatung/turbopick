import * as vscode from "vscode";
import { fuzzyMatch } from "./algo";

export interface TurboPickItem extends vscode.QuickPickItem {
  data?: any;
}

// Configuration for batch processing
const BATCH_SIZE = 1000;
const YIELD_THRESHOLD_MS = 15;
const UPDATE_INTERVAL_MS = 100;

export class FuzzyPicker {
  private quickPick: vscode.QuickPick<TurboPickItem>;
  private allItems: TurboPickItem[] = [];
  private currentQuery: string = "";
  private pendingSearch: NodeJS.Timeout | null = null;
  private wasAccepted: boolean = false;

  constructor(placeholder: string) {
    this.quickPick = vscode.window.createQuickPick<TurboPickItem>();
    this.quickPick.placeholder = placeholder;
    this.quickPick.matchOnDescription = false;
    this.quickPick.matchOnDetail = false;

    this.quickPick.onDidHide(() => {
      if (!this.wasAccepted) {
        this.onCancel();
      }
      this.dispose();
    });
    this.quickPick.onDidChangeValue((value) => {
      this.currentQuery = value;
      this.triggerSearch();
    });
    this.quickPick.onDidChangeActive((items) => {
      if (items.length > 0) {
        this.onActive(items[0]);
      }
    });
    this.quickPick.onDidAccept(() => {
      this.wasAccepted = true;
      const selected = this.quickPick.selectedItems[0];
      if (selected) {
        this.handleSelection(selected);
      }
      this.dispose();
    });
  }

  public show() {
    this.quickPick.show();
  }

  public setPending() {
    this.quickPick.busy = true;
  }

  public setItems(items: TurboPickItem[]) {
    this.allItems = items;
    // Initial show (no query)
    this.quickPick.busy = false;
    this.triggerSearch();
  }

  private dispose() {
    this.quickPick.dispose();
  }

  // Callbacks to be set by caller
  public onAccept: (item: TurboPickItem) => void = () => {};
  public onActive: (item: TurboPickItem) => void = () => {};
  public onCancel: () => void = () => {};

  private handleSelection(item: TurboPickItem) {
    this.onAccept(item);
  }

  private triggerSearch() {
    if (this.pendingSearch) {
      clearTimeout(this.pendingSearch);
    }

    this.pendingSearch = setTimeout(() => {
      this.performSearch(this.currentQuery);
    }, 200);
  }

  private async performSearch(query: string) {
    this.quickPick.busy = true;

    // Show all or top 100 for empty query
    if (!query) {
      this.quickPick.items = this.allItems.slice(0, 100);
      this.quickPick.busy = false;
      return;
    }

    const matchedItems: (TurboPickItem & { score: number })[] = [];

    let processedCount = 0;
    const startTime = Date.now();
    let lastUpdateTime = startTime;

    // Use a local ref to items to avoid issues if allItems changes
    const items = this.allItems;

    const searchEpoch = query;

    const processChunk = async () => {
      if (this.currentQuery !== searchEpoch) {
        return; // Cancelled by new query
      }

      let chunkStart = Date.now();

      while (processedCount < items.length) {
        // Process one item
        const item = items[processedCount];
        const label = item.label;
        const result = fuzzyMatch(label, query);

        if (result) {
          matchedItems.push({ ...item, score: result.score, alwaysShow: true });
        }

        processedCount++;

        if (processedCount % BATCH_SIZE === 0) {
          const now = Date.now();
          if (now - chunkStart > YIELD_THRESHOLD_MS) {
            if (now - lastUpdateTime > UPDATE_INTERVAL_MS) {
              this.updateResults(matchedItems);
              lastUpdateTime = now;
            }

            // Yield to event loop
            await new Promise((resolve) => setTimeout(resolve, 0));

            // Resume check
            if (this.currentQuery !== searchEpoch) {
              return;
            }

            // Reset chunk timer
            chunkStart = Date.now();
          }
        }
      }

      if (this.currentQuery === searchEpoch) {
        this.updateResults(matchedItems);
        this.quickPick.busy = false;
      }
    };

    await processChunk();
  }

  private updateResults(matches: (TurboPickItem & { score: number })[]) {
    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);
    this.quickPick.items = matches;
  }
}

export async function pickFile() {
  const picker = new FuzzyPicker("Search files...");
  picker.setPending();
  picker.show();

  // TODO: Avoid hardcoding ignore pattern. Maybe read from config or use vscode's exclude settings?
  const uris = await vscode.workspace.findFiles("**/*", "**/node_modules/**");

  const items: TurboPickItem[] = uris.map((uri) => ({
    label: vscode.workspace.asRelativePath(uri),
    description: uri.fsPath,
    data: uri,
  }));

  picker.setItems(items);

  picker.onAccept = (item) => {
    if (item.data instanceof vscode.Uri) {
      vscode.window.showTextDocument(item.data);
    }
  };
}

export async function pickDocumentSymbol() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const originalSelection = editor.selection;

  const config = vscode.workspace.getConfiguration("turbopick");
  const enablePreview = config.get<boolean>("preview", true);

  const picker = new FuzzyPicker("Search document symbols...");

  if (enablePreview) {
    picker.onActive = (item) => {
      if (item.data && item.data.range && item.data.uri) {
        if (
          vscode.window.activeTextEditor &&
          vscode.window.activeTextEditor.document.uri.toString() ===
            item.data.uri.toString()
        ) {
          const e = vscode.window.activeTextEditor;
          e.revealRange(item.data.range, vscode.TextEditorRevealType.InCenter);
          e.selection = new vscode.Selection(
            item.data.range.start,
            item.data.range.start,
          );
        }
      }
    };

    picker.onCancel = () => {
      if (vscode.window.activeTextEditor === editor) {
        editor.selection = originalSelection;
        editor.revealRange(
          new vscode.Range(originalSelection.active, originalSelection.active),
          vscode.TextEditorRevealType.InCenter,
        );
      }
    };
  }

  picker.setPending();
  picker.show();

  const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
    "vscode.executeDocumentSymbolProvider",
    editor.document.uri,
  );

  if (!symbols) {
    picker.setItems([]);
    return;
  }

  const items: TurboPickItem[] = [];
  const flatten = (syms: vscode.DocumentSymbol[], parent?: string) => {
    for (const s of syms) {
      items.push({
        label: s.name,
        description: vscode.SymbolKind[s.kind],
        detail: parent ? `in ${parent}` : undefined,
        data: { uri: editor.document.uri, range: s.selectionRange },
      });
      if (s.children) {
        flatten(s.children, s.name);
      }
    }
  };

  if (symbols.length > 0 && "children" in symbols[0]) {
    flatten(symbols as unknown as vscode.DocumentSymbol[]);
  } else {
    (symbols as unknown as vscode.SymbolInformation[]).forEach((s) => {
      items.push({
        label: s.name,
        description: vscode.SymbolKind[s.kind],
        data: { uri: s.location.uri, range: s.location.range },
      });
    });
  }

  picker.setItems(items);

  picker.onAccept = (item) => {
    if (item.data && item.data.range) {
      vscode.window.showTextDocument(item.data.uri, {
        selection: new vscode.Selection(
          item.data.range.start,
          item.data.range.start,
        ),
      });
    }
  };
}

export async function pickWorkspaceSymbol() {
  const picker = new FuzzyPicker("Search workspace symbols...");
  picker.setPending();
  picker.show();

  const symbols = await vscode.commands.executeCommand<
    vscode.SymbolInformation[]
  >("vscode.executeWorkspaceSymbolProvider", "");

  const items: TurboPickItem[] = (symbols || []).map((s) => ({
    label: s.name,
    description: s.containerName || vscode.SymbolKind[s.kind],
    data: { uri: s.location.uri, range: s.location.range },
  }));

  picker.setItems(items);

  picker.onAccept = (item) => {
    if (item.data) {
      vscode.window.showTextDocument(item.data.uri, {
        selection: new vscode.Selection(
          item.data.range.start,
          item.data.range.start,
        ),
      });
    }
  };
}

export function pickLines() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const picker = new FuzzyPicker("Search lines...");
  picker.show();

  const lines = editor.document.getText().split("\n");
  const items: TurboPickItem[] = lines
    .map((line, i) => ({
      label: line.trim(),
      description: `:${i + 1}`,
      detail: line,
      data: { uri: editor.document.uri, line: i },
    }))
    .filter((item) => item.label.length > 0);

  picker.setItems(items);

  picker.onAccept = (item) => {
    if (item.data) {
      const pos = new vscode.Position(item.data.line, 0);
      vscode.window.showTextDocument(item.data.uri, {
        selection: new vscode.Selection(pos, pos),
      });
    }
  };
}

function isBinary(buffer: Uint8Array): boolean {
  const checkLen = Math.min(8000, buffer.length);
  for (let i = 0; i < checkLen; i++) {
    if (buffer[i] === 0) {
      return true;
    }
  }
  return false;
}

export async function pickWorkspaceLines() {
  const picker = new FuzzyPicker("Search workspace lines...");
  picker.setPending();
  picker.show();

  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Indexing workspace...",
      cancellable: true,
    },
    async (progress, token) => {
      const uris = await vscode.workspace.findFiles(
        "**/*",
        "**/node_modules/**",
      );

      // TODO: Limit file count to avoid OOM?
      const targetUris = uris;

      const items: TurboPickItem[] = [];
      const decoder = new TextDecoder("utf-8");

      const total = targetUris.length;
      let processed = 0;

      // Concurrency limit
      const limit = 10;

      for (let i = 0; i < targetUris.length; i += limit) {
        if (token.isCancellationRequested) {
          break;
        }

        const chunk = targetUris.slice(i, i + limit);
        await Promise.all(
          chunk.map(async (uri) => {
            try {
              const stat = await vscode.workspace.fs.stat(uri);
              if (stat.size > 1024 * 1024) {
                return;
              } // Skip files > 1MB

              const content = await vscode.workspace.fs.readFile(uri);
              if (isBinary(content)) {
                return;
              }

              const text = decoder.decode(content);
              const lines = text.split(/\r?\n/);

              lines.forEach((line, lineIdx) => {
                const trimmed = line.trim();
                if (trimmed.length > 0 && trimmed.length < 300) {
                  items.push({
                    label: trimmed,
                    description: `${vscode.workspace.asRelativePath(uri)}:${lineIdx + 1}`,
                    detail: line,
                    data: { uri, line: lineIdx },
                  });
                }
              });
            } catch (e) {
              // Ignore read errors
            } finally {
              processed++;
              progress.report({
                increment: (1 / total) * 100,
                message: `${processed}/${total}`,
              });
            }
          }),
        );
      }

      if (!token.isCancellationRequested) {
        picker.setItems(items);
      }
    },
  );

  picker.onAccept = (item) => {
    if (item.data) {
      const pos = new vscode.Position(item.data.line, 0);
      vscode.window.showTextDocument(item.data.uri, {
        selection: new vscode.Selection(pos, pos),
      });
    }
  };
}
