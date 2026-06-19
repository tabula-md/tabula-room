import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fallbackVersion = "0.0.0";

export function resolveServiceVersion({
  cwd = process.cwd(),
  env = process.env,
}: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
} = {}) {
  const envVersion = env.npm_package_version?.trim();
  if (envVersion) {
    return envVersion;
  }

  return readPackageVersion(cwd) ?? fallbackVersion;
}

function readPackageVersion(cwd: string) {
  for (const packageJsonPath of packageJsonCandidates(cwd)) {
    const version = readVersionFromPackageJson(packageJsonPath);
    if (version) {
      return version;
    }
  }
  return null;
}

function packageJsonCandidates(cwd: string) {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return [
    path.join(cwd, "package.json"),
    path.resolve(moduleDir, "../package.json"),
    path.resolve(moduleDir, "../../package.json"),
  ].filter((candidate, index, candidates) => candidates.indexOf(candidate) === index);
}

function readVersionFromPackageJson(packageJsonPath: string) {
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { version?: unknown };
    return typeof packageJson.version === "string" && packageJson.version.trim() ? packageJson.version : null;
  } catch {
    return null;
  }
}
