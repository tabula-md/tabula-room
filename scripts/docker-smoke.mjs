#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";

const imageName = process.env.TABULA_ROOM_DOCKER_IMAGE || "tabula-room:ci";
const containerName = `tabula-room-smoke-${process.pid}`;
let containerStarted = false;

try {
  await run("docker", ["build", "-t", imageName, "."]);
  await outputOf("docker", [
    "run",
    "--rm",
    "--detach",
    "--name",
    containerName,
    "--publish",
    "127.0.0.1::3002",
    "--env",
    "TABULA_ROOM_ALLOWED_ORIGINS=http://localhost:5173",
    imageName,
  ]);
  containerStarted = true;

  const port = await publishedPort(containerName);
  const health = await waitForHealth(`http://127.0.0.1:${port}/health`);
  if (health.service !== "tabula-room" || health.ok !== true) {
    throw new Error(`Unexpected health response: ${JSON.stringify(health)}`);
  }

  console.log(`Docker smoke passed: ${imageName} served /health on port ${port}.`);
} finally {
  if (containerStarted) {
    await outputOf("docker", ["stop", containerName], { allowFailure: true });
  }
}

async function publishedPort(name) {
  const output = await outputOf("docker", ["port", name, "3002/tcp"]);
  const port = output.trim().match(/:(\d+)$/)?.[1];
  if (!port) {
    throw new Error(`Could not resolve published port for ${name}: ${output}`);
  }
  return port;
}

async function waitForHealth(url) {
  const deadline = Date.now() + 30_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.json();
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw lastError ?? new Error("Timed out waiting for /health");
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      cwd: process.cwd(),
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0 || options.allowFailure) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
      }
    });
  });
}

function outputOf(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd: process.cwd(), env: process.env }, (error, stdout, stderr) => {
      if (error) {
        if (options.allowFailure) {
          resolve(stdout);
          return;
        }
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout);
    });
  });
}
