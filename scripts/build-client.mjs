/**
 * Build the browser client bundle (dist/client.js) for the web shell's
 * `dsh.client` loader, plus a smoke check that materializes it.
 *
 * The bundle format matches the shell's expectations (see the published
 * `@deepseek-ai/dsh-client-*` bundles): a CJS factory registered through
 * `window.__ModuleLoader__.load`, with framework packages left external so
 * the loader's module table resolves them.
 */
import { build } from "esbuild";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const PACKAGE_ID = "@winterchenhuan/dsh-shadow-mind";
const OUT_FILE = "dist/client.js";

const banner = `window.__ModuleLoader__.load({\n\tid: ${JSON.stringify(PACKAGE_ID)},\n\tfactory: (require) => {\n\t\tvar module = { exports: {} };\n\t\tvar exports = module.exports;\n\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });\n`;

const footer = `\t\treturn module.exports;\n\t}\n});\n`;

await build({
  entryPoints: ["src/client/index.ts"],
  outfile: OUT_FILE,
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: ["es2022"],
  external: ["react", "react/jsx-runtime"],
  banner: { js: banner },
  footer: { js: footer },
  sourcemap: true,
  sourcesContent: true,
  logLevel: "info",
});

// --- Smoke check: materialize the bundle exactly like the shell loader does. ---
const source = readFileSync(OUT_FILE, "utf8");
if (!source.startsWith("window.__ModuleLoader__.load(")) {
  throw new Error(`${OUT_FILE}: expected ModuleLoader wrapper as the first statement`);
}
if (!source.includes('id: "@winterchenhuan/dsh-shadow-mind"')) {
  throw new Error(`${OUT_FILE}: wrapper id does not match the package name`);
}

const requireShim = (specifier) => {
  const local = createRequire(import.meta.url);
  if (specifier === "react" || specifier === "react/jsx-runtime") {
    return local(specifier);
  }
  throw new Error(`client bundle requires unexpected external: ${specifier}`);
};

let entry;
const window = {
  __ModuleLoader__: {
    load: (value) => {
      entry = value;
    },
  },
};
// The bundle is a plain script assigning window.__ModuleLoader__; evaluate it
// in a fresh function scope so `module`/`exports` come from the factory
// closure, then materialize the factory exactly like the shell loader does.
new Function("window", source)(window);
if (entry === undefined || typeof entry.factory !== "function") {
  throw new Error(`${OUT_FILE}: loader did not register a factory`);
}
const exported = entry.factory(requireShim);
if (typeof exported.apply !== "function") {
  throw new Error(`${OUT_FILE}: bundle does not export apply`);
}
if (!Array.isArray(exported.inject) || !exported.inject.includes("slots") || !exported.inject.includes("remote")) {
  throw new Error(`${OUT_FILE}: bundle inject list is missing slots/remote`);
}
console.log(`[build-client] ${OUT_FILE} OK (${source.length} bytes, exports: ${Object.keys(exported).join(", ")})`);
