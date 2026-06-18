import { spawnSync } from "node:child_process";

export function currentBranch() {
  const result = spawnSync("git", ["branch", "--show-current"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error("Could not resolve current branch.");
  }

  return result.stdout.trim();
}

export function getRepoNameWithOwner() {
  const repo = ghJson(["repo", "view", "--json", "nameWithOwner"]);
  if (!repo.nameWithOwner) {
    throw new Error("Could not resolve GitHub repository. Pass --repo owner/name.");
  }
  return repo.nameWithOwner;
}

export function ghJson(args) {
  return JSON.parse(gh(args));
}

export function gh(args, options = {}) {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.status !== 0) {
    const command = `gh ${args.join(" ")}`;
    const details = result.stderr?.trim() || result.stdout?.trim() || "No details.";
    throw new Error(`${command} failed: ${details}`);
  }

  return options.trim === false ? result.stdout : result.stdout.trim();
}

export function requiredValue(flag, value) {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

export function parseList(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function checkConventionalTitle(title) {
  return /^(feat|fix|docs|refactor|test|build|ci|chore|perf|style|revert)(\([a-z0-9-]+\))?: [a-z0-9].+/.test(title);
}
