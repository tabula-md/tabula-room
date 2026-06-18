#!/usr/bin/env node
import { formatAgentSection, parseAgentSection } from "./lib/agent-context.mjs";
import { currentBranch, getRepoNameWithOwner, gh, ghJson, requiredValue } from "./lib/github.mjs";

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

validateOptions(options);

const repo = options.repo ?? getRepoNameWithOwner();
const pullRequest = getPullRequest(repo, options.pr);
const body = renderPrBody(options, pullRequest.body);

if (!options.dryRun) {
  gh(["api", "--method", "PATCH", `repos/${repo}/pulls/${pullRequest.number}`, "-f", `body=${body}`]);
}

console.log(`PR body target: ${repo}#${pullRequest.number}`);
console.log(`URL: ${pullRequest.url}`);
console.log(options.dryRun ? body : "PR body updated.");

function parseArgs(argv) {
  const parsed = {
    dryRun: false,
    evidence: [],
    help: false,
    implementationNotes: [],
    pr: null,
    repo: null,
    reviewFocus: [],
    risk: [],
    securityImpact: [],
    summary: [],
    validationAutomated: [],
    validationManual: [],
    validationNotRun: []
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
      parsed.repo = requiredValue(arg, next);
      index += 1;
      continue;
    }
    if (arg === "--pr") {
      parsed.pr = requiredValue(arg, next);
      index += 1;
      continue;
    }
    if (arg === "--summary") {
      parsed.summary.push(requiredValue(arg, next));
      index += 1;
      continue;
    }
    if (arg === "--review-focus") {
      parsed.reviewFocus.push(requiredValue(arg, next));
      index += 1;
      continue;
    }
    if (arg === "--implementation-notes") {
      parsed.implementationNotes.push(requiredValue(arg, next));
      index += 1;
      continue;
    }
    if (arg === "--validation-automated") {
      parsed.validationAutomated.push(requiredValue(arg, next));
      index += 1;
      continue;
    }
    if (arg === "--validation-manual") {
      parsed.validationManual.push(requiredValue(arg, next));
      index += 1;
      continue;
    }
    if (arg === "--validation-not-run") {
      parsed.validationNotRun.push(requiredValue(arg, next));
      index += 1;
      continue;
    }
    if (arg === "--security-impact") {
      parsed.securityImpact.push(requiredValue(arg, next));
      index += 1;
      continue;
    }
    if (arg === "--risk") {
      parsed.risk.push(requiredValue(arg, next));
      index += 1;
      continue;
    }
    if (arg === "--evidence") {
      parsed.evidence.push(requiredValue(arg, next));
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return parsed;
}

function validateOptions(bodyOptions) {
  const missing = [];
  for (const [label, values] of [
    ["--summary", bodyOptions.summary],
    ["--review-focus", bodyOptions.reviewFocus],
    ["--implementation-notes", bodyOptions.implementationNotes],
    ["--security-impact", bodyOptions.securityImpact],
    ["--risk", bodyOptions.risk],
    ["--evidence", bodyOptions.evidence]
  ]) {
    if (normalizeItems(values).length === 0) {
      missing.push(label);
    }
  }

  if (
    normalizeItems([
      ...bodyOptions.validationAutomated,
      ...bodyOptions.validationManual,
      ...bodyOptions.validationNotRun
    ]).length === 0
  ) {
    missing.push("--validation-automated/--validation-manual/--validation-not-run");
  }

  if (missing.length > 0) {
    throw new Error(`PR body requires meaningful content for: ${missing.join(", ")}.`);
  }
}

function renderPrBody(bodyOptions, existingBody) {
  const agent = parseAgentSection(existingBody);
  const sections = [
    renderSection("Summary", bodyOptions.summary),
    renderSection("Review Focus", bodyOptions.reviewFocus),
    renderSection("Implementation Notes", bodyOptions.implementationNotes)
  ];

  if (agent.present) {
    sections.push(formatAgentSection({ tool: agent.tool || "Unknown", session: agent.session || "Unknown" }));
  }

  sections.push(
    renderValidationSection(bodyOptions),
    renderSection("Security Impact", bodyOptions.securityImpact),
    renderSection("Risk", bodyOptions.risk),
    renderSection("Evidence", bodyOptions.evidence)
  );

  return `${sections.join("\n\n")}\n`;
}

function renderSection(title, items) {
  return [`## ${title}`, "", ...normalizeItems(items).map((item) => `- ${item}`)].join("\n");
}

function renderValidationSection(bodyOptions) {
  return [
    "## Validation",
    "",
    renderValidationGroup("Automated", bodyOptions.validationAutomated),
    renderValidationGroup("Manual", bodyOptions.validationManual),
    renderValidationGroup("Not run", bodyOptions.validationNotRun)
  ].join("\n");
}

function renderValidationGroup(label, items) {
  const values = normalizeItems(items);
  if (values.length === 0) {
    return `- ${label}: None.`;
  }
  if (values.length === 1) {
    return `- ${label}: ${values[0]}`;
  }
  return [`- ${label}:`, ...values.map((item) => `  - ${item}`)].join("\n");
}

function normalizeItems(items) {
  return items
    .flatMap((item) => String(item ?? "").split(/\n+/))
    .map((item) => item.trim())
    .filter((item) => item && item !== "-");
}

function getPullRequest(repo, prNumber) {
  const args = ["pr", "view", prNumber ? String(prNumber) : currentBranch(), "--repo", repo, "--json", "number,url,body"];
  return ghJson(args);
}

function printHelp() {
  console.log(`Usage: npm run pr:body -- [options]

Options:
  --pr <number>                       PR number. Defaults to the PR for the current branch.
  --repo <owner/name>                 GitHub repository. Defaults to the current repo.
  --summary <text>                    Outcome summary. Repeatable.
  --review-focus <text>               What reviewers should inspect. Repeatable.
  --implementation-notes <text>       Decisions or tradeoffs. Repeatable.
  --validation-automated <text>       Automated validation run. Repeatable.
  --validation-manual <text>          Manual validation run. Repeatable.
  --validation-not-run <text>         Validation intentionally skipped. Repeatable.
  --security-impact <text>            Security impact, especially key/plaintext/ciphertext impact. Repeatable.
  --risk <text>                       Remaining risk. Repeatable.
  --evidence <text>                   Screenshots/video or explicit Not visual note. Repeatable.
  --dry-run                           Print the generated body without changing GitHub.
`);
}
