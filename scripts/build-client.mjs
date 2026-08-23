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
  // The shell's module table resolves bare "react" but injects no React
  // global — JSX must compile to the automatic runtime (jsx-runtime imports),
  // not the classic React.createElement transform.
  jsx: "automatic",
  external: [
    "react",
    "react/jsx-runtime",
    // Shared shell modules (module-table rows): the runtime's client face
    // carries zustand singletons and slot registry state, so it must be
    // required from the loader table like every tree bundle does — never
    // inlined, or two module instances would fight over the same stores.
    "@deepseek-ai/dsh-client-runtime/client",
  ],
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

// Tree-bundle externals resolved through real node_modules (the smoke check
// only needs the runtime's exported functions, not live shell singletons).
function treeExternal(specifier) {
  const local = createRequire(import.meta.url);
  // Platform modules are ordinary node packages locally; the runtime's
  // ui-slots face is likewise a ModuleLoader closure, so unwrap it the same way.
  if (specifier === "@deepseek-ai/cordis" || specifier === "react" || specifier === "react/jsx-runtime") {
    return local(specifier);
  }
  if (specifier === "@deepseek-ai/dsh-client-ui-slots") {
    return local("@deepseek-ai/dsh-client-ui-slots");
  }
  throw new Error(`runtime external not shimmed: ${specifier}`);
}

const requireShim = (specifier) => {
  const local = createRequire(import.meta.url);
  if (specifier === "react" || specifier === "react/jsx-runtime") {
    return local(specifier);
  }
  // Materialize the runtime's client face the way the shell module table
  // would: its published lib/client.js is itself a ModuleLoader closure, so
  // evaluate it in this scope and hand the resulting exports back.
  if (specifier === "@deepseek-ai/dsh-client-runtime/client") {
    // The package exports map does not expose ./lib/client.js, so resolve
    // through the package root instead of createRequire.resolve.
    const runtimeRoot = local.resolve("@deepseek-ai/dsh-client-runtime/package.json");
    const source = local("fs").readFileSync(
      runtimeRoot.replace(/package\.json$/, "lib/client.js"),
      "utf8",
    );
    const exports = {};
    const load = (value) => {
      Object.assign(exports, value.factory(treeExternal));
    };
    new Function("window", source)({ __ModuleLoader__: { load } });
    return exports;
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
