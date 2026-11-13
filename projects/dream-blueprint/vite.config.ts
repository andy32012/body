import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

async function listBuildFiles(directory: string, prefix = ""): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = prefix + entry.name;
    if (entry.isDirectory()) {
      files.push(...await listBuildFiles(path.join(directory, entry.name), relativePath + "/"));
    } else if (entry.isFile() && relativePath !== "sw.js" && !relativePath.endsWith(".map")) {
      files.push(relativePath);
    }
  }
  return files.sort();
}

function offlineApp(): Plugin {
  let root: string;
  return {
    name: "dream-blueprint-offline",
    configResolved(resolved) { root = resolved.root; },
    apply: "build",
    transformIndexHtml() {
      return [
        { tag: "link", attrs: { rel: "manifest", href: "./manifest.webmanifest" }, injectTo: "head" },
        { tag: "link", attrs: { rel: "apple-touch-icon", href: "./icon-192.png" }, injectTo: "head" },
        { tag: "meta", attrs: { name: "theme-color", content: "#10162f" }, injectTo: "head" },
        { tag: "script", attrs: { defer: true, src: "./register-sw.js" }, injectTo: "body" }
      ];
    },
    async writeBundle(output) {
      if (!output.dir) throw new Error("找不到靜態網站的輸出資料夾。");
      const directory = path.resolve(output.dir);
      const files = await listBuildFiles(directory);
      const gallery: Record<string, string> = {};
      const version = createHash("sha256");
      for (const file of files) {
        const bytes = await readFile(path.join(directory, file));
        version.update(file).update("\0").update(bytes);
        if (/^cosmos\/.*\.(?:webp|avif|jpe?g|png)$/i.test(file)) {
          gallery[file] = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
        }
      }
      const config = {
        version: version.digest("hex").slice(0, 16),
        core: files.filter(file => !(file in gallery)),
        gallery,
        fallback: "cosmos/n01.webp"
      };
      const worker = await readFile(path.join(root, "scripts/service-worker.js"), "utf8");
      await writeFile(path.join(directory, "sw.js"), "const config = " + JSON.stringify(config) + ";\n" + worker);
    }
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), offlineApp()],
  server: { host: "0.0.0.0" },
  preview: { host: "0.0.0.0" }
});


