#!/usr/bin/env node
import fs from "node:fs";
import { getRepoNameWithOwner, gh, ghJson } from "./lib/github.mjs";

const labelCatalog = JSON.parse(fs.readFileSync(new URL("../.github/labels.json", import.meta.url), "utf8"));
const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

const repo = options.repo ?? getRepoNameWithOwner();
const existingLabels = ghJson(["api", `repos/${repo}/labels?per_page=100`]);
const existingByLowercaseName = new Map(existingLabels.map((label) => [label.name.toLowerCase(), label]));
const results = [];

for (const label of labelCatalog) {
  const existing = existingByLowercaseName.get(label.name.toLowerCase());
  if (!existing) {
    if (!options.dryRun) {
      gh([
        "api",
        "--method",
        "POST",
        `repos/${repo}/labels`,
        "-f",
        `name=${label.name}`,
        "-f",
        `color=${label.color}`,
        "-f",
        `description=${label.description}`
      ]);
    }
    results.push({ label: label.name, action: "created" });
    continue;
  }

  const needsUpdate =
    existing.name !== label.name ||
    existing.color.toLowerCase() !== label.color.toLowerCase() ||
    (existing.description ?? "") !== label.description;

  if (needsUpdate) {
    if (!options.dryRun) {
      gh([
        "api",
        "--method",
        "PATCH",
        `repos/${repo}/labels/${encodeURIComponent(existing.name)}`,
        "-f",
        `new_name=${label.name}`,
        "-f",
        `color=${label.color}`,
        "-f",
        `description=${label.description}`
      ]);
    }
    results.push({ label: label.name, action: "updated" });
    continue;
  }

  results.push({ label: label.name, action: "ok" });
}

console.log(`Label sync target: ${repo}`);
for (const result of results) {
  console.log(`- ${result.label}: ${result.action}`);
}
if (options.dryRun) {
  console.log("Dry run: no GitHub labels were changed.");
}

function parseArgs(argv) {
  const parsed = {
    dryRun: false,
    help: false,
    repo: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (arg === "--repo") {
      if (!next || next.startsWith("--")) {
        throw new Error("--repo requires an owner/name value.");
      }
      parsed.repo = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage: npm run labels:sync -- [options]

Options:
  --repo <owner/name>  GitHub repository. Defaults to the current repo.
  --dry-run            Print intended label changes without changing GitHub.
`);
}
