#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function validateReleaseVersion({ expectedVersion, rootDir = defaultRootDir }) {
  const version = expectedVersion?.trim();
  if (!version) {
    throw new ReleaseVersionError("Usage: node scripts/validate-release-version.mjs <version>");
  }

  const packageJson = readJson(path.join(rootDir, "package.json"));
  const packageLock = readJson(path.join(rootDir, "package-lock.json"));
  const checks = [
    ["package.json", packageJson.version],
    ["package-lock.json", packageLock.version],
    ["package-lock.json packages[\"\"].version", packageLock.packages?.[""]?.version],
  ];

  const errors = checks
    .filter(([, actualVersion]) => actualVersion !== version)
    .map(
      ([name, actualVersion]) =>
        `${name} version ${actualVersion ?? "<missing>"} does not match release version ${version}.`,
    );

  if (errors.length > 0) {
    throw new ReleaseVersionError(errors.join("\n"));
  }

  return `Release version ${version} matches package metadata.`;
}

export class ReleaseVersionError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReleaseVersionError";
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    console.log(validateReleaseVersion({ expectedVersion: process.argv[2] }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
