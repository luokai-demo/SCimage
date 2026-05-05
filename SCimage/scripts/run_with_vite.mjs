import { spawn } from "node:child_process";

const command = process.argv[2];
const commandArgs = process.argv.slice(3);

if (!command) {
  console.error("usage: node scripts/run_with_vite.mjs <command> [...args]");
  process.exit(1);
}

const host = process.env.SCIMAGE_VITE_HOST || "127.0.0.1";
const port = process.env.SCIMAGE_VITE_PORT || "5173";
const baseUrlObject = new URL("http:local");
baseUrlObject.hostname = host;
baseUrlObject.port = port;
baseUrlObject.pathname = "/";
const baseUrl = baseUrlObject.toString();
const server = spawn(
  "npm",
  ["run", "dev", "--", "--host", host, "--port", port, "--strictPort"],
  {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, BROWSER: "none" },
  },
);

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

const ready = await waitForServer(baseUrl).catch((error) => {
  console.error(serverOutput);
  throw error;
});

if (!ready) {
  console.error(serverOutput);
  process.exit(1);
}

const child = spawn(command, commandArgs, {
  stdio: "inherit",
  env: {
    ...process.env,
    SCIMAGE_BASE_URL: process.env.SCIMAGE_BASE_URL || baseUrl,
  },
});

const exitCode = await new Promise((resolve) => {
  child.on("exit", (code, signal) => {
    if (signal) resolve(1);
    else resolve(code ?? 1);
  });
});

server.kill("SIGTERM");
await new Promise((resolve) => {
  const timer = setTimeout(resolve, 1000);
  server.on("exit", () => {
    clearTimeout(timer);
    resolve();
  });
});

process.exit(exitCode);

async function waitForServer(url) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    if (server.exitCode !== null) {
      throw new Error(`Vite dev server exited with code ${server.exitCode}.`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // Keep waiting until Vite finishes binding the port.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Vite dev server did not become ready at ${url}.`);
}
