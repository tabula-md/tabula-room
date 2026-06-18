#!/usr/bin/env node
import { evaluateBashCommand } from "./lib/command-policy.mjs";
import { findBashCommand, readHookPayload } from "./lib/hook-io.mjs";

const payload = await readHookPayload();
const command = findBashCommand(payload);

if (!command) {
  process.exit(0);
}

const result = evaluateBashCommand(command);

if (result.decision === "block") {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: result.message
    }
  }));
  process.exit(0);
}

if (result.decision === "warn") {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: `Tabula Codex hook warning: ${result.message}`
    }
  }));
}

process.exit(0);
