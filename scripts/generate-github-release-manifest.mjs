#!/usr/bin/env node
/**
 * Generate `release/latest.json` for the Tauri updater from the signed
 * installer artifacts produced by `npm run tauri build`.
 *
 * Usage:
 *   npm run release:manifest -- --repo=OWNER/REPO [--installer=nsis|msi] [--notes="..."]
 *
 * Examples:
 *   npm run release:manifest -- --repo=debateos/debateos-search
 *   npm run release:manifest -- --repo=debateos/debateos-search --installer=msi --notes="Fixes search cache"
 *
 * Output:
 *   release/latest.json
 *
 * The manifest URL points to the GitHub Release asset for the chosen installer
 * type and embeds the contents of its `.sig` file in the `signature` field.
 * Upload all three artifacts (installer, .sig, latest.json) as release assets
 * on the tagged release.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const out = {};
  for (const raw of argv.slice(2)) {
    if (!raw.startsWith("--")) continue;
    const eq = raw.indexOf("=");
    if (eq < 0) {
      out[raw.slice(2)] = "true";
    } else {
      out[raw.slice(2, eq)] = raw.slice(eq + 1);
    }
  }
  return out;
}

function die(msg) {
  console.error(`\nerror: ${msg}\n`);
  process.exit(1);
}

const args = parseArgs(process.argv);

const repo = args.repo;
if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
  die(
    "missing or invalid --repo=OWNER/REPO. Example:\n" +
    "  npm run release:manifest -- --repo=debateos/debateos-search"
  );
}

const installer = (args.installer ?? "nsis").toLowerCase();
if (installer !== "nsis" && installer !== "msi") {
  die("--installer must be 'nsis' or 'msi'");
}

const notes = args.notes ?? "See GitHub release page.";

// Single source of truth for the version.
const pkg = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
const version = pkg.version;
if (!version) die("could not read version from package.json");

// Resolve the local installer + .sig produced by `npm run tauri build`.
const bundleDir = join(projectRoot, "src-tauri", "target", "release", "bundle");
const local =
  installer === "nsis"
    ? {
        installer: join(bundleDir, "nsis", `DebateOS Search_${version}_x64-setup.exe`),
        sig:       join(bundleDir, "nsis", `DebateOS Search_${version}_x64-setup.exe.sig`),
        assetName: `DebateOS-Search_${version}_x64-setup.exe`,
      }
    : {
        installer: join(bundleDir, "msi", `DebateOS Search_${version}_x64_en-US.msi`),
        sig:       join(bundleDir, "msi", `DebateOS Search_${version}_x64_en-US.msi.sig`),
        assetName: `DebateOS-Search_${version}_x64_en-US.msi`,
      };

if (!existsSync(local.installer)) {
  die(
    `installer not found at:\n  ${local.installer}\n` +
    `Run \`npm run tauri build\` first, or pass a different --installer.`
  );
}
if (!existsSync(local.sig)) {
  die(
    `signature not found at:\n  ${local.sig}\n` +
    `Sign with:\n` +
    `  npx @tauri-apps/cli signer sign --private-key-path ".tauri/signing.key" --password "" "${local.installer}"`
  );
}

const signature = readFileSync(local.sig, "utf8").trim();
// Tauri stores the minisign signature blob base64-wrapped. The base64
// encoding of "untrusted comment:" starts with `dW50cnVzdGVkIGNvbW1lbnQ6`,
// so a valid Tauri-emitted .sig file begins with that. We also accept the
// raw `untrusted comment:` form for signatures produced by minisign directly.
const looksValid =
  signature.startsWith("dW50cnVzdGVkIGNvbW1lbnQ6") ||
  signature.startsWith("untrusted comment:");
if (!looksValid) {
  die(`signature file at ${local.sig} doesn't look like a Tauri-emitted minisign signature.`);
}

// GitHub asset URL — `releases/download/<tag>/<asset-name>` is the stable
// per-version URL. The Tauri endpoint itself uses `releases/latest/download/`
// to auto-resolve the manifest; the installer URL embedded *in* the manifest
// is pinned to the tagged release so signatures stay valid.
const assetUrl =
  `https://github.com/${repo}/releases/download/v${version}/${local.assetName}`;

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature,
      url: assetUrl,
    },
  },
};

const outDir = join(projectRoot, "release");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "latest.json");
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

console.log(`wrote ${outPath}`);
console.log("");
console.log("Upload these as assets to the GitHub release tagged v" + version + ":");
console.log("  1. " + local.installer.replace(/^.*[\\/]/, ""));
console.log("  2. " + local.sig.replace(/^.*[\\/]/, ""));
console.log("  3. latest.json");
console.log("");
console.log("Asset must be renamed to: " + local.assetName);
console.log("(GitHub normalizes spaces but matching exactly is safer)");
