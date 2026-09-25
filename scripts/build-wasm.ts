const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const artifact = path.join(
  root,
  "src/rust/target/wasm32-unknown-unknown/release/algo.wasm",
);
const output = path.join(root, "dist/algo.wasm");

execSync(
  "cargo build --manifest-path src/rust/Cargo.toml --release --target wasm32-unknown-unknown",
  { cwd: root, stdio: "inherit" },
);

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.copyFileSync(artifact, output);
console.log(`Built ${path.relative(root, output)}`);
