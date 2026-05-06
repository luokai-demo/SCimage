import { spawn } from "node:child_process";

const steps = [
  ["lint", "npm", ["run", "lint"]],
  ["python", "npm", ["run", "test:python"]],
  ["genealogy-unit", "npm", ["run", "test:genealogy-unit"]],
  ["vue-regression", "npm", ["run", "test:vue-regression"]],
  ["browser-smoke", "npm", ["run", "test:browser"]],
  ["build", "npm", ["run", "build"]],
  ["static-assets", "npm", ["run", "build:check"]],
];

for (const [name, command, args] of steps) {
  console.log(`\n[verify:release] ${name}`);
  const code = await run(command, args);
  if (code !== 0) {
    console.error(`\n[verify:release] ${name} 失败，退出码 ${code}`);
    process.exit(code);
  }
}

console.log("\n[verify:release] 发布前校验通过。");

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    child.on("exit", (code, signal) => {
      resolve(signal ? 1 : code ?? 1);
    });
  });
}
