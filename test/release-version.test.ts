import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ReleaseVersionError, validateReleaseVersion } from "../scripts/validate-release-version.mjs";

describe("release version validation", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "tabula-room-release-"));
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it("accepts matching package metadata", async () => {
    await writePackageMetadata("1.2.3");

    expect(validateReleaseVersion({ expectedVersion: "1.2.3", rootDir })).toBe(
      "Release version 1.2.3 matches package metadata.",
    );
  });

  it("rejects missing release versions", () => {
    expect(() => validateReleaseVersion({ expectedVersion: "", rootDir })).toThrow(ReleaseVersionError);
    expect(() => validateReleaseVersion({ expectedVersion: "", rootDir })).toThrow(/Usage/);
  });

  it("rejects mismatched package metadata", async () => {
    await writePackageMetadata("1.2.3", { packageJsonVersion: "1.2.4" });

    expect(() => validateReleaseVersion({ expectedVersion: "1.2.3", rootDir })).toThrow(
      /package\.json version 1\.2\.4 does not match release version 1\.2\.3/,
    );
  });

  it("rejects mismatched lockfile root metadata", async () => {
    await writePackageMetadata("1.2.3", { lockfileRootVersion: "1.2.4" });

    expect(() => validateReleaseVersion({ expectedVersion: "1.2.3", rootDir })).toThrow(
      /package-lock\.json packages\[""\]\.version version 1\.2\.4 does not match release version 1\.2\.3/,
    );
  });

  async function writePackageMetadata(
    version: string,
    overrides: { packageJsonVersion?: string; packageLockVersion?: string; lockfileRootVersion?: string } = {},
  ) {
    await fs.writeFile(
      path.join(rootDir, "package.json"),
      `${JSON.stringify({ name: "tabula-room", version: overrides.packageJsonVersion ?? version }, null, 2)}\n`,
    );
    await fs.writeFile(
      path.join(rootDir, "package-lock.json"),
      `${JSON.stringify(
        {
          name: "tabula-room",
          version: overrides.packageLockVersion ?? version,
          packages: {
            "": {
              name: "tabula-room",
              version: overrides.lockfileRootVersion ?? version,
            },
          },
        },
        null,
        2,
      )}\n`,
    );
  }
});
