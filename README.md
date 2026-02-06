# TurboPick

TurboPick is a fuzzy picker for VS Code designed to feel intuitive and fast.

Built entirely in TypeScript, TurboPick works seamlessly across all platforms without native dependencies.

## Why TurboPick?

Essential features:

- **Natural Fuzzy Matching**: Fzf-like fuzzy matching, which is more intuitive.
- **Blazing Speed**: Results stream in incrementally, keeping the UI responsive.
- **Cross-Platform**: Works out of the box on Windows, macOS, and Linux without any additional setup.

## Getting Started

Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) and type `turbopick` to see available commands:

- **Search Files**: Search files in your workspace.
- **Search Document Symbols**: Search symbols in the current document.
- **Search Workspace Symbols**: Search symbols across the entire workspace.
- **Search Lines**: Search lines in the current document.
- **Search Workspace Lines**: Search lines across the entire workspace.

## Configuration

You can tweak the experience in your VS Code settings:

- `turbopick.preview`: Toggles the code preview panel when searching document symbols (default: `true`).

## Related Work

This extension is heavily inspired by [fzf](https://github.com/junegunn/fzf).
