# Release Process — DebateOS Search

How to ship a new version of DebateOS Search through **GitHub Releases**. The
in-app updater (Settings → About & Updates) fetches its manifest directly
from the latest GitHub release asset, verifies its minisign signature against
the public key bundled in the app, and installs the signed MSI/NSIS update.

> **Current status:** the updater endpoint in `src-tauri/tauri.conf.json` points at
> `https://github.com/apollomarianiworks/debateos-search/releases/latest/download/latest.json`.
> `releases/latest/download/` auto-resolves to the newest published release, so this
> endpoint URL never has to change. Until at least one release has been published
> with a `latest.json` asset attached, the in-app **Check for updates** button
> reports **"Update server isn't reachable from this build."** — which is honest,
> not broken.

---

## One-time setup (release maintainer only)

### 1. Signing keypair

The repo ships with a development signing keypair under `.tauri/signing.key`
(public half at `.tauri/signing.key.pub`, also embedded into
`tauri.conf.json → plugins.updater.pubkey`). The private key is gitignored.

For a real release you have two choices:

- **Use the dev key as-is.** Fine for small projects. The private key file lives
  only on the release maintainer's machine. **Anyone with the private key can
  sign updates that the app will trust** — guard it like an SSH private key.
- **Rotate to a fresh keypair.** Recommended before first public release.

```powershell
# Generate a fresh keypair (will overwrite the existing dev key with -f)
npx @tauri-apps/cli signer generate -f -w .tauri/signing.key
```

Copy the **public key** (the contents of `.tauri/signing.key.pub`, a base64
blob) into `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.

> Rotating the key **invalidates all previously-installed copies' ability to
> auto-update.** They'll need a fresh manual install with the new pubkey baked
> in before they can resume getting updates.

### 2. GitHub endpoint (already wired)

`src-tauri/tauri.conf.json` already points at the
`apollomarianiworks/debateos-search` repository:

```jsonc
"endpoints": [
  "https://github.com/apollomarianiworks/debateos-search/releases/latest/download/latest.json"
]
```

The HTTP capability allowlist in `src-tauri/capabilities/default.json` already
includes `github.com`, `objects.githubusercontent.com`, and `api.github.com`,
so the updater can reach the asset (and its 302 redirect target on
`objects.githubusercontent.com`) without any further capability edits.

Commit both changes once. After that, no per-release config changes — every
new release re-resolves through `releases/latest/download/`.

---

## Per-release steps

### 1. Bump the version

Bump in three places (they must match):

- `package.json → version`
- `src-tauri/tauri.conf.json → version`
- `src-tauri/Cargo.toml → [package].version`

Then:

```powershell
npm install   # refresh package-lock
```

### 2. Build the installers (signed update artifacts come for free)

The Tauri CLI signs during the bundle step when it sees the **string** form of
the env var. The path form (`*_PATH`) is read inconsistently on Windows, so
prefer reading the key into a variable first:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw "$PWD\.tauri\signing.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""   # empty unless you set one
npm run tauri build
```

If the env var doesn't propagate (`A public key has been found, but no private
key…` error), the build still produces the `.msi` / `.exe` installers — they
just lack `.sig` files. You can sign them after the fact:

```powershell
npx @tauri-apps/cli signer sign `
  --private-key-path ".tauri\signing.key" `
  --password "" `
  "src-tauri\target\release\bundle\msi\DebateOS Search_<version>_x64_en-US.msi"

npx @tauri-apps/cli signer sign `
  --private-key-path ".tauri\signing.key" `
  --password "" `
  "src-tauri\target\release\bundle\nsis\DebateOS Search_<version>_x64-setup.exe"
```

This produces, in `src-tauri/target/release/bundle/`:

| File | Used for |
|---|---|
| `msi/DebateOS Search_<version>_x64_en-US.msi` | First-install (Windows Installer) |
| `nsis/DebateOS Search_<version>_x64-setup.exe` | First-install (NSIS alternative) |
| `msi/DebateOS Search_<version>_x64_en-US.msi.sig` | Minisign signature of the MSI |
| `nsis/DebateOS Search_<version>_x64-setup.exe.sig` | Minisign signature of the NSIS exe |

Tauri 2 uses the MSI/NSIS installer **as** the update payload — there's no
separate `.app.tar.gz`. The `.sig` files contain the signature the updater
verifies against the public key baked into the app.

> The `createUpdaterArtifacts: true` field in `bundle` (already set) is what
> tells Tauri to emit the `.sig` files. Without it you'd ship installers but
> existing copies couldn't be auto-upgraded.

### 3. Generate the GitHub Releases updater manifest

For GitHub Releases, create the updater manifest from the installer and `.sig`
that `npm run tauri build` produced:

```powershell
npm run release:manifest -- --repo=apollomarianiworks/debateos-search --installer=nsis
```

This writes:

```text
release/latest.json
```

The app's built-in updater endpoint is:

```text
https://github.com/apollomarianiworks/debateos-search/releases/latest/download/latest.json
```

So `latest.json` must be uploaded as a release asset along with the installer
and its `.sig` file. The manifest generated by the script points to the tagged
release asset URL for the selected installer.

Use `--installer=msi` only if you intentionally want the updater to install the
MSI. The NSIS installer is the default because it is the friendlier interactive
Windows installer path for this app.

### 4. Create the GitHub release

Tag the version locally and push:

```powershell
git tag v0.2.0
git push origin v0.2.0
```

In the GitHub UI: **Releases → Draft a new release**, pick the tag, paste the
release notes, then upload these as **release assets** (rename to use
hyphens — GitHub normalizes spaces but matching exactly is safer):

- `DebateOS-Search_<version>_x64-setup.exe` *(or `…_x64_en-US.msi` if you
  chose `--installer=msi`)*
- `DebateOS-Search_<version>_x64-setup.exe.sig` *(matching `.sig`)*
- `release/latest.json`

Click **Publish release**. Within seconds,
`https://github.com/<OWNER>/<REPO>/releases/latest/download/latest.json`
will resolve to your manifest.

> CLI alternative:
> ```powershell
> gh release create v0.2.0 `
>   "src-tauri\target\release\bundle\nsis\DebateOS Search_0.2.0_x64-setup.exe#DebateOS-Search_0.2.0_x64-setup.exe" `
>   "src-tauri\target\release\bundle\nsis\DebateOS Search_0.2.0_x64-setup.exe.sig#DebateOS-Search_0.2.0_x64-setup.exe.sig" `
>   "release\latest.json" `
>   --title "v0.2.0" --notes-file CHANGELOG.md
> ```

### 5. Verify

On a machine that already has the previous version installed:

1. Open the app → Settings → **About & Updates**
2. Click **Check for updates**
3. Confirm the new version appears with release notes
4. Click **Download & install** → app should restart on the new version

If the check fails, the on-screen error tells you exactly what went wrong
(404 = bad URL, signature error = wrong private key was used to sign, etc.).

---

## Endpoint URL placeholders

Tauri substitutes these tokens in the endpoint URL on each request:

- `{{target}}` — `windows`, `darwin`, `linux`
- `{{arch}}` — `x86_64`, `aarch64`, etc.
- `{{current_version}}` — the version of the currently-installed app

The default endpoint we ship uses all three so a single endpoint can decide
what update (if any) to serve to each install.

---

## What the in-app updater does NOT do

- ❌ Does not check on startup. Users must press the button.
- ❌ Does not store update history.
- ❌ Does not show release notes from anywhere other than the manifest itself.
- ❌ Does not roll back. If a bad update ships, fix forward with a new version.

---

## What survives an update

- `%APPDATA%\com.debateos.search\settings.json` (Brave key, provider, mode)
- WebView2 user-data dir: search-result cache, source registry, local document
  index, last query

A successful update is effectively the user double-clicking a newer MSI — the
identifier (`com.debateos.search`) and WiX `upgradeCode` are stable across
versions, so Windows treats it as an upgrade rather than a parallel install.
