import { build } from "vite";
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
await import("./export-character.mjs");
await build({
  configFile: false,
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve("popup.html"),
        overlay: resolve("overlay.html"),
        preview: resolve("preview.html"),
        offscreen: resolve("offscreen.html"),
        background: resolve("src/background/index.ts"),
      },
      output: { entryFileNames: "[name].js" },
    },
  },
});
await build({
  configFile: false,
  publicDir: false,
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve("src/content/index.ts"),
      name: "DestroyContent",
      formats: ["iife"],
      fileName: () => "content.js",
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
const manifest = JSON.parse(await readFile("public/manifest.json", "utf8"));
await writeFile("dist/manifest.json", JSON.stringify(manifest, null, 2));
for (const icon of Object.values(manifest.icons)) await stat(resolve("dist", icon));
for (const file of ["manrope-latin.woff2", "source-han-ui.woff2"])
  await stat(resolve("dist/assets/fonts", file));
const audioCatalog = JSON.parse(
  await readFile("public/assets/audio/catalog.json", "utf8"),
);
const registeredAudio = new Set(
  Object.values(audioCatalog).map((item) => item.file),
);
for (const file of registeredAudio) await stat("dist/assets/audio/" + file);
let audioBytes = 0;
for (const f of await readdir("dist/assets/audio")) {
  if (/\.(wav|flac|aiff|mp3)$/i.test(f))
    throw new Error("Unapproved audio format: " + f);
  if (/\.(ogg|opus|m4a|aac)$/i.test(f) && !registeredAudio.has(f))
    throw new Error("Unregistered audio: " + f);
  if (/\.(ogg|opus|m4a|aac)$/.test(f))
    audioBytes += (await stat("dist/assets/audio/" + f)).size;
}
if (audioBytes > 3000000) throw new Error("Audio exceeds 3 MB");
console.log(`Extension built: dist; audio ${audioBytes} / 3,000,000 bytes`);
