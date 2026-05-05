import fs from "node:fs";
import path from "node:path";

const staticDir = path.join(process.cwd(), "webapp/static");
const assetsDir = path.join(staticDir, "assets");
const indexPath = path.join(staticDir, "index.html");

if (!fs.existsSync(indexPath)) {
  console.error("webapp/static/index.html 不存在，请先执行构建。");
  process.exit(1);
}

const html = fs.readFileSync(indexPath, "utf8");
const referencedAssets = new Set(
  [...html.matchAll(/\/assets\/(index-[^"')\s<>]+\.(?:js|css))/g)].map((match) => match[1]),
);
const actualAssets = fs.existsSync(assetsDir)
  ? fs.readdirSync(assetsDir).filter((name) => /^index-.+\.(js|css)$/.test(name))
  : [];

const missing = [...referencedAssets].filter((name) => !actualAssets.includes(name));
const stale = actualAssets.filter((name) => !referencedAssets.has(name));
const expectedKinds = new Set([...referencedAssets].map((name) => path.extname(name)));
const failures = [];

if (!referencedAssets.size) {
  failures.push("index.html 没有引用构建后的 index-*.js/css 资源。");
}
if (!expectedKinds.has(".js")) {
  failures.push("index.html 缺少构建后的 JS 资源引用。");
}
if (!expectedKinds.has(".css")) {
  failures.push("index.html 缺少构建后的 CSS 资源引用。");
}
missing.forEach((name) => failures.push(`index.html 引用了不存在的资源：${name}`));
stale.forEach((name) => failures.push(`发现未被 index.html 引用的旧构建资源：${name}`));

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`static assets ok: ${[...referencedAssets].join(", ")}`);
}
