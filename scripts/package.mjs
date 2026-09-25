import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { zipSync } from "fflate";
const files = {};
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else
      files[relative("dist", path).split("\\").join("/")] = new Uint8Array(
        await readFile(path),
      );
  }
}
await walk("dist");
const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8"));
if (
  !files["content.js"] ||
  !files["background.js"] ||
  !files["popup.html"] ||
  !files["offscreen.html"] ||
  !files["overlay.html"] ||
  !files["assets/monster/monster.svg"]
)
  throw Error("Incomplete extension build");
await mkdir("artifacts", { recursive: true });
const path = `artifacts/destroy-${manifest.version}.zip`;
await writeFile(path, zipSync(files, { level: 6 }));
console.log(path);
