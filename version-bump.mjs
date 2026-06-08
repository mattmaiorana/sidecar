import { readFileSync, writeFileSync } from "fs";

// Read the target version from the npm lifecycle env (set by `npm version`).
const targetVersion = process.env.npm_package_version;

// Bump the version in manifest.json, keeping the existing minAppVersion.
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t") + "\n");

// Record this version -> minAppVersion in versions.json so old installs resolve correctly.
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t") + "\n");
