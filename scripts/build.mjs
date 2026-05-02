import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, mergeConfig } from "vite";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));
const outDir = resolve(workspaceRoot, "dist");
const manifestPath = resolve(outDir, ".vite", "manifest.json");

await build(
  mergeConfig({ base: "./" }, {
    build: {
      outDir: "dist",
      emptyOutDir: true,
      manifest: true,
      rollupOptions: {
        input: {
          app: "src/main.js",
        },
        output: {
          entryFileNames: "assets/app.js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
  }),
);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const entry =
  manifest["src/main.js"] ||
  Object.values(manifest).find((value) => value && typeof value === "object" && value.isEntry);

if (!entry?.file) {
  throw new Error("Could not resolve built logging UI entry from Vite manifest.");
}

const sourceHtml = await readFile(resolve(workspaceRoot, "index.src.html"), "utf8");
const cssLinks = Array.isArray(entry.css)
  ? entry.css.map((file) => `    <link rel="stylesheet" href="./${file}" />`).join("\n")
  : "";

const builtHtml = sourceHtml
  .replace("</head>", `${cssLinks ? `${cssLinks}\n` : ""}  </head>`)
  .replace(
    '<script type="module" src="/src/main.js"></script>',
    `<script type="module" src="./${entry.file}"></script>`,
  );

await writeFile(resolve(outDir, "index.html"), builtHtml, "utf8");
