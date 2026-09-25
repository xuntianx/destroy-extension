import { build } from "vite";
import { resolve } from "node:path";
import { copyFile, mkdir } from "node:fs/promises";
await build({
  configFile: false,
  build: {
    outDir: "artifacts/fixture",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        article: resolve("tests/fixtures/article.html"),
        extensionHost: resolve("tests/fixtures/extension-host.html"),
        overlay: resolve("overlay.html"),
        popupReview: resolve("tests/fixtures/popup-review.html"),
        preview: resolve("preview.html"),
        typography: resolve("tests/fixtures/typography.html"),
        motion: resolve("tests/fixtures/motion.html"),
        isolation: resolve("tests/fixtures/isolation.html"),
        inputFrame: resolve("tests/fixtures/input-frame.html"),
        unresponsiveFrame: resolve("tests/fixtures/unresponsive-frame.html"),
      },
    },
  },
});
await mkdir("artifacts/fixture/tests/fixtures", { recursive: true });
await copyFile(
  "tests/fixtures/landscape.svg",
  "artifacts/fixture/tests/fixtures/landscape.svg",
);

await mkdir("artifacts/fixture/tests/fixtures/fonts", { recursive: true });
await copyFile(
  "tests/fixtures/fonts/OFL.txt",
  "artifacts/fixture/tests/fixtures/fonts/OFL.txt",
);
