import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INCLUDED_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".mjs",
  ".py",
  ".ts",
  ".vue",
]);
const IGNORED_DIRS = new Set([
  ".git",
  ".local",
  ".npm-cache",
  ".build-venv-macos",
  ".build-venv-windows",
  "build",
  "dist",
  "generated",
  "node_modules",
  "test-results",
  "__pycache__",
]);
const IGNORED_PREFIXES = [
  "webapp/static/assets/",
];

const failures = [];

function shouldIgnore(relativePath) {
  return IGNORED_PREFIXES.some((prefix) => relativePath.startsWith(prefix));
}

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    const relativePath = path.relative(ROOT, fullPath).split(path.sep).join("/");
    if (shouldIgnore(relativePath)) continue;
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!entry.isFile() || !INCLUDED_EXTENSIONS.has(path.extname(entry.name))) continue;
    checkFile(fullPath, relativePath);
  }
}

function checkFile(fullPath, relativePath) {
  const content = fs.readFileSync(fullPath, "utf8");
  if (content.length && !content.endsWith("\n")) {
    failures.push(`${relativePath}: 缺少文件末尾换行`);
  }
  const lines = content.split("\n");
  lines.forEach((line, index) => {
    if (/[ \t]+$/.test(line)) {
      failures.push(`${relativePath}:${index + 1}: 行尾有多余空白`);
    }
  });
}

walk(ROOT);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("format check ok");
}
