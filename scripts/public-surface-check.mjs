#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const trackedFiles = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const forbiddenPaths = new Map([
  ["AGENTS.md", "local agent instructions do not belong in the public OSS repo"],
  ["CLAUDE.md", "local agent instructions do not belong in the public OSS repo"],
  ["WORKFLOW.md", "maintainer workflow belongs outside the public OSS repo"],
  ["WORKFLOW.ko.md", "maintainer workflow belongs outside the public OSS repo"],
  ["TODO.md", "maintainer planning notes belong outside the public OSS repo"],
  ["TODO.ko.md", "maintainer planning notes belong outside the public OSS repo"],
  ["CHANGELOG.md", "release notes should be published through GitHub Releases"],
  ["CONTRIBUTING.md", "public contribution policy is not ready yet"],
  ["SECURITY.md", "public security policy is not ready yet"],
  ["pm2.json", "provider-specific process config belongs outside the public OSS repo"],
  ["pm2.production.json", "provider-specific process config belongs outside the public OSS repo"],
]);

const forbiddenPrefixes = new Map([
  [".codex/", "local agent hooks do not belong in the public OSS repo"],
  [".linear/", "private tracker templates do not belong in the public OSS repo"],
  ["docs/", "maintainer docs belong outside the public OSS repo"],
  ["knowledge/", "maintainer knowledge belongs outside the public OSS repo"],
  ["ops/", "provider-specific operations files belong outside the public OSS repo"],
]);

const secretPatterns = [
  { label: "OpenAI API key", pattern: /\bsk-(?:proj_)?[A-Za-z0-9_-]{20,}\b/g },
  { label: "GitHub token", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g },
  { label: "GitHub fine-grained token", pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { label: "private key block", pattern: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/g },
];

const errors = [];

for (const file of trackedFiles) {
  if (!existsSync(file)) {
    continue;
  }

  const forbiddenPathReason = forbiddenPaths.get(file);
  if (forbiddenPathReason) {
    errors.push(`${file}: ${forbiddenPathReason}`);
  }

  for (const [prefix, reason] of forbiddenPrefixes) {
    if (file.startsWith(prefix)) {
      errors.push(`${file}: ${reason}`);
    }
  }

  const buffer = readFileSync(file);
  if (buffer.includes(0)) {
    continue;
  }

  const text = buffer.toString("utf8");
  for (const { label, pattern } of secretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      errors.push(`${file}: contains ${label}`);
    }
  }
}

if (errors.length > 0) {
  console.error("Public surface check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Public surface check passed (${trackedFiles.length} tracked files).`);
