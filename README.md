# TurboPick

TurboPick is a fuzzy picker for VS Code designed to feel intuitive and fast.

Built entirely in TypeScript, TurboPick works seamlessly across all platforms without native dependencies.

> **Note**: This plugin is currently in **Alpha**, which means it's still in early development and may have bugs or missing features. Feel free to provide feedback!

## Why TurboPick?

- **Natural Fuzzy Matching**: Fzf-like fuzzy matching.
- **Blazing Speed**: Results stream in incrementally, keeping the UI responsive.
- **Cross-Platform**: Works out of the box on Windows, macOS, and Linux without any additional setup.

## Getting Started

Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) and type `turbopick` to see available commands:

- **Search Files**: Search files in your workspace.
- **Search Document Symbols**: Search symbols in the current document.
- **Search Workspace Symbols**: Search symbols across the entire workspace.
- **Search Lines**: Search lines in the current document.
- **Search Workspace Lines**: Search lines across the entire workspace.
  > **Warning**: Be careful when using this in large workspaces, as it may use a significant amount of memory.

## Configuration

You can tweak the experience in your VS Code settings:

- `turbopick.preview`: Toggles the code preview panel when searching document symbols (default: `true`).

## TODO

- Ability to ignore file patterns when searching files, workspace lines, or workspace symbols.
- Add more commands.

## Related Work

This extension is heavily inspired by [fzf](https://github.com/junegunn/fzf).
