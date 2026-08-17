import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "map-node-next-js-imports",
      enforce: "pre",
      async resolveId(source, importer) {
        // src uses NodeNext-style relative imports ("../src/x.js") that point
        // at .ts sources; map the ".js" specifier to its ".ts" file so vitest
        // (which runs the TypeScript sources directly) can resolve them.
        if (!source.endsWith(".js") || source.startsWith(".") === false) return null;
        const resolved = await this.resolve(`${source.slice(0, -3)}.ts`, importer, { skipSelf: true });
        return resolved ?? null;
      },
    },
  ],
});
