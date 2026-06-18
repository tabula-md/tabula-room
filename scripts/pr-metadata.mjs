#!/usr/bin/env node
import fs from "node:fs";
import { resolveAgentContext, upsertAgentSection } from "./lib/agent-context.mjs";
import { currentBranch, getRepoNameWithOwner, gh, ghJson, parseList, requiredValue } from "./lib/github.mjs";

const defaultOwnerLogin = "taehalim";
const labelCatalog = JSON.parse(fs.readFileSync(new URL("../.github/labels.json", import.meta.url), "utf8"));
const labelDefinitionsByName = new Map(labelCatalog.map((label) => [label.name, label]));
const labelNamesByLowercase = new Map(labelCatalog.map((label) => [label.name.toLowerCase(), label.name]));

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

if (options.listLabels) {
  printLabelCatalog();
  process.exit(0);
}

if (options.labels.length === 0) {
  console.error("Select one PR label explicitly with `--label <name>`.");
  printLabelCatalog();
  process.exit(1);
}

const repo = options.repo ?? getRepoNameWithOwner();
const pullRequest = getPullRequest(repo, options.pr);
const labels = options.labels.map(resolveCatalogLabelName);
const assignees = options.assignees.length > 0 ? options.assignees : parseList(process.env.TABULA_PR_ASSIGNEES || defaultOwnerLogin);
const reviewerCandidates = options.noReviewers
  ? []
  : options.reviewers.length > 0
    ? options.reviewers
    : parseList(process.env.TABULA_PR_REVIEWERS || defaultOwnerLogin);
const reviewers = reviewerCandidates.filter((login) => login !== pullRequest.author?.login);
const skippedReviewers = reviewerCandidates.filter((login) => login === pullRequest.author?.login);
const agentContext = resolveAgentContext({ agent: options.agent, session: options.session });
const shouldUpdateAgentContext = !options.noAgentContext && agentContext.tool !== "Unknown" && agentContext.session !== "Unknown";
const resolvedLabels = labels.map((label) => ensureGitHubLabel(repo, label, options.dryRun));

if (!options.dryRun) {
  if (resolvedLabels.length > 0) {
    gh(["api", "--method", "POST", `repos/${repo}/issues/${pullRequest.number}/labels`, ...resolvedLabels.flatMap((label) => ["-f", `labels[]=${label}`])]);
  }

  if (assignees.length > 0) {
    gh(["api", "--method", "POST", `repos/${repo}/issues/${pullRequest.number}/assignees`, ...assignees.flatMap((assignee) => ["-f", `assignees[]=${assignee}`])]);
  }

  if (reviewers.length > 0) {
    gh(["api", "--method", "POST", `repos/${repo}/pulls/${pullRequest.number}/requested_reviewers`, ...reviewers.flatMap((reviewer) => ["-f", `reviewers[]=${reviewer}`])]);
  }

  if (shouldUpdateAgentContext) {
    gh(["api", "--method", "PATCH", `repos/${repo}/pulls/${pullRequest.number}`, "-f", `body=${upsertAgentSection(pullRequest.body, agentContext)}`]);
  }
}

console.log(`PR metadata target: ${repo}#${pullRequest.number}`);
console.log(`URL: ${pullRequest.url}`);
console.log(`Labels: ${resolvedLabels.join(", ") || "none"}`);
console.log(`Assignees: ${assignees.join(", ") || "none"}`);
console.log(`Reviewers: ${reviewers.join(", ") || "none"}`);
console.log(`Agent: ${options.noAgentContext ? "skipped" : `${agentContext.tool} / ${agentContext.session}`}`);
if (skippedReviewers.length > 0) {
  console.log(`Skipped self-reviewer: ${skippedReviewers.join(", ")}. GitHub does not allow requesting review from the PR author.`);
}
if (options.dryRun) {
  console.log("Dry run: no GitHub metadata was changed.");
}

function parseArgs(argv) {
  const parsed = {
    agent: null,
    assignees: [],
    dryRun: false,
    help: false,
    labels: [],
    listLabels: false,
    noAgentContext: false,
    noReviewers: false,
    pr: null,
    repo: null,
    reviewers: [],
    session: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    if (arg === "--list-labels") {
      parsed.listLabels = true;
      continue;
    }
    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }
    if (arg === "--no-reviewers") {
      parsed.noReviewers = true;
      continue;
    }
    if (arg === "--no-agent-context") {
      parsed.noAgentContext = true;
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
    if (arg === "--agent") {
      parsed.agent = requiredValue(arg, next);
      index += 1;
      continue;
    }
    if (arg === "--session") {
      parsed.session = requiredValue(arg, next);
      index += 1;
      continue;
    }
    if (arg === "--assignee" || arg === "--assignees") {
      parsed.assignees.push(...parseList(requiredValue(arg, next)));
      index += 1;
      continue;
    }
    if (arg === "--label" || arg === "--labels") {
      parsed.labels.push(...parseList(requiredValue(arg, next)));
      index += 1;
      continue;
    }
    if (arg === "--reviewer" || arg === "--reviewers") {
      parsed.reviewers.push(...parseList(requiredValue(arg, next)));
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return parsed;
}

function getPullRequest(repo, prNumber) {
  const args = [
    "pr",
    "view",
    prNumber ? String(prNumber) : currentBranch(),
    "--repo",
    repo,
    "--json",
    "number,author,url,body"
  ];
  return ghJson(args);
}

function ensureGitHubLabel(repo, labelName, dryRun) {
  const labels = ghJson(["api", `repos/${repo}/labels?per_page=100`]);
  const exact = labels.find((label) => label.name === labelName);
  if (exact) {
    return exact.name;
  }

  const definition = labelDefinitionsByName.get(labelName);
  if (!definition) {
    throw new Error(`Unknown label: ${labelName}`);
  }

  if (!dryRun) {
    gh([
      "api",
      "--method",
      "POST",
      `repos/${repo}/labels`,
      "-f",
      `name=${labelName}`,
      "-f",
      `color=${definition.color}`,
      "-f",
      `description=${definition.description}`
    ]);
  }

  return labelName;
}

function resolveCatalogLabelName(value) {
  const resolved = labelNamesByLowercase.get(String(value).toLowerCase());
  if (!resolved) {
    throw new Error(`Unknown label: ${value}. Run npm run pr:metadata -- --list-labels.`);
  }
  return resolved;
}

function printLabelCatalog() {
  console.log("Available Tabula Room PR labels:");
  for (const label of labelCatalog) {
    console.log(`- ${label.name}: ${label.description}`);
  }
}

function printHelp() {
  console.log(`Usage: npm run pr:metadata -- [options]

Options:
  --pr <number>              PR number. Defaults to the PR for the current branch.
  --repo <owner/name>        GitHub repository. Defaults to the current repo.
  --assignee <login[,..]>    GitHub assignee. Defaults to TABULA_PR_ASSIGNEES or taehalim.
  --agent <name>             Agent/tool name for the PR Agent section.
  --label <label[,..]>       GitHub label selected from .github/labels.json. Required.
  --list-labels              Print selectable labels and exit.
  --session <id>             Agent session id for the PR Agent section.
  --reviewer <login[,..]>    GitHub reviewer. Defaults to TABULA_PR_REVIEWERS or taehalim.
  --no-agent-context         Do not update the PR Agent section.
  --no-reviewers             Do not request reviewers.
  --dry-run                  Print the intended metadata without changing GitHub.
`);
}
