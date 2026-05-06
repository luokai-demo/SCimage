import { spawn } from "node:child_process";
import { createServer } from "node:net";

const command = process.argv[2];
const commandArgs = process.argv.slice(3);

if (!command) {
  console.error("usage: node scripts/run_with_vite.mjs <command> [...args]");
  process.exit(1);
}

const host = process.env.SCIMAGE_VITE_HOST || "127.0.0.1";
const port = process.env.SCIMAGE_VITE_PORT || String(await findAvailablePort(host));
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
let childProcess = null;
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

process.once("SIGINT", () => void shutdown(130));
process.once("SIGTERM", () => void shutdown(143));

let exitCode = 1;
try {
  await waitForServer(baseUrl);
  childProcess = spawn(command, commandArgs, {
    stdio: "inherit",
    env: {
      ...process.env,
      SCIMAGE_BASE_URL: process.env.SCIMAGE_BASE_URL || baseUrl,
    },
  });

  exitCode = await new Promise((resolve) => {
    childProcess.on("exit", (code, signal) => {
      if (signal) resolve(1);
      else resolve(code ?? 1);
    });
  });
} catch (error) {
  console.error(serverOutput);
  console.error(error instanceof Error ? error.message : String(error));
  exitCode = 1;
} finally {
  await stopServer();
}

process.exit(exitCode);

async function findAvailablePort(hostname) {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, hostname, resolve);
  });
  const address = probe.address();
  const selectedPort = typeof address === "object" && address ? address.port : 5173;
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.close(resolve);
  });
  return selectedPort;
}

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

async function shutdown(code) {
  if (childProcess) childProcess.kill("SIGTERM");
  await stopServer();
  process.exit(code);
}

async function stopServer() {
  if (server.exitCode !== null) return;
  server.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 1000);
    server.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
