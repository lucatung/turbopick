import * as vscode from "vscode";
import {
  pickFile,
  pickDocumentSymbol,
  pickWorkspaceSymbol,
  pickLines,
  pickWorkspaceLines,
} from "./picker";

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "turbopick" is active!');

  context.subscriptions.push(
    vscode.commands.registerCommand("turbopick.searchFiles", pickFile),
    vscode.commands.registerCommand(
      "turbopick.searchDocumentSymbols",
      pickDocumentSymbol,
    ),
    vscode.commands.registerCommand(
      "turbopick.searchWorkspaceSymbols",
      pickWorkspaceSymbol,
    ),
    vscode.commands.registerCommand("turbopick.searchLines", pickLines),
    vscode.commands.registerCommand(
      "turbopick.searchWorkspaceLines",
      pickWorkspaceLines,
    ),
  );
}

export function deactivate() {}
