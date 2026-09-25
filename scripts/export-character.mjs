import { mkdir, writeFile } from "node:fs/promises";
import { SVG } from "../src/content/rig.js";
await mkdir("public/assets/monster", { recursive: true });
await writeFile("public/assets/monster/monster.svg", SVG.trim() + "\n");
