import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INCLUDED_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".mjs",
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

const RULES = [
  {
    name: "禁止密钥前缀字符串或类名片段",
    pattern: new RegExp("s" + "k-"),
    message: "不要在源码、测试或样式里写密钥前缀片段，隐私钩子会把它当作真实 API Key。",
  },
  {
    name: "禁止模板拼接外部 URL 字面量",
    pattern: /https?:\/\/\$\{/,
    message: "不要写完整模板 URL 字面量；需要拼接地址时用 URL 对象逐段设置。",
  },
  {
    name: "禁止 task 前缀类名片段",
    pattern: new RegExp("(?:class(?:Name)?|class-name|id|data-[\\w-]+|selector|querySelector|getElementById)[^;\\n]*ta" + "s" + "k-"),
    message: "UI 类名和选择器不要使用 task 前缀片段；继续使用 job-，避免和密钥扫描规则互相误伤。",
  },
];

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
  const lines = fs.readFileSync(fullPath, "utf8").split("\n");
  lines.forEach((line, index) => {
    RULES.forEach((rule) => {
      if (!rule.pattern.test(line)) return;
      failures.push(`${relativePath}:${index + 1}: ${rule.name}。${rule.message}`);
    });
  });
}

walk(ROOT);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("privacy string check ok");
}
