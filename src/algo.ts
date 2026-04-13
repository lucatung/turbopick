import * as fs from "fs";
import * as path from "path";

export interface MatchResult {
    score: number;
    positions: number[];
}

interface WasmAlgoExports {
    memory: { buffer: ArrayBufferLike };
    alloc: (len: number) => number;
    dealloc: (ptr: number, len: number) => void;
    fuzzy_match: (
        textPtr: number,
        textLen: number,
        patternPtr: number,
        patternLen: number,
        outPositionsPtr: number,
        outPositionsLen: number,
    ) => number;
}

const WASM_NO_MATCH = -2147483648;
const WASM_ERROR = -2147483647;

let wasmExports: WasmAlgoExports | null = null;
let wasmLoadAttempted = false;

const webAssemblyApi = (globalThis as { WebAssembly?: any }).WebAssembly;

function tryLoadWasm(): WasmAlgoExports | null {
    if (wasmLoadAttempted) {
        return wasmExports;
    }

    wasmLoadAttempted = true;

    try {
        if (!webAssemblyApi) {
            return null;
        }

        const candidateWasmPaths = [
            path.join(__dirname, "algo.wasm"),
            path.join(__dirname, "..", "dist", "algo.wasm"),
            path.join(process.cwd(), "dist", "algo.wasm"),
        ];

        const wasmPath = candidateWasmPaths.find((p) => fs.existsSync(p));
        if (!wasmPath) {
            return null;
        }

        const wasmBytes = fs.readFileSync(wasmPath);
        const module = new webAssemblyApi.Module(wasmBytes);
        const instance = new webAssemblyApi.Instance(module, {});

        const exports = instance.exports as Partial<WasmAlgoExports>;

        if (
            !exports.memory ||
            typeof (exports.memory as { buffer?: unknown }).buffer === "undefined" ||
            typeof exports.alloc !== "function" ||
            typeof exports.dealloc !== "function" ||
            typeof exports.fuzzy_match !== "function"
        ) {
            return null;
        }

        wasmExports = exports as WasmAlgoExports;
        return wasmExports;
    } catch {
        return null;
    }
}

export function fuzzyMatch(text: string, pattern: string): MatchResult | null {
    if (!pattern) {
        return { score: 0, positions: [] };
    }
    if (!text || pattern.length > text.length) {
        return null;
    }

    const exports = tryLoadWasm();
    if (!exports) {
        return null;
    }

    const textLen = text.length;
    const patLen = pattern.length;
    const outBytes = patLen * 4;
    const dataLen = textLen + patLen;
    const outOffset = (dataLen + 3) & ~3;
    const needed = outOffset + outBytes;

    const ptr = exports.alloc(needed);
    if (ptr === 0) {
        return null;
    }

    const textPtr = ptr;
    const patternPtr = ptr + textLen;
    const outPtr = ptr + outOffset;

    try {
        const mem = new Uint8Array(exports.memory.buffer, textPtr, dataLen);
        for (let i = 0; i < textLen; i++) {
            mem[i] = text.charCodeAt(i) & 0xff;
        }
        for (let i = 0; i < patLen; i++) {
            mem[textLen + i] = pattern.charCodeAt(i) & 0xff;
        }

        const score = exports.fuzzy_match(
            textPtr, textLen,
            patternPtr, patLen,
            outPtr, patLen,
        );

        if (score === WASM_NO_MATCH || score === WASM_ERROR) {
            return null;
        }

        const positions = Array.from(
            new Int32Array(exports.memory.buffer, outPtr, patLen),
        );

        return { score, positions };
    } catch {
        return null;
    } finally {
        exports.dealloc(ptr, needed);
    }
}
