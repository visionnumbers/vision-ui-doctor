# Agent skill installation

Documentation checked 2026-10-17. These are local filesystem adapters, not claims
that any particular agent version has been launched or activated in this test.
No browser audit, network service, authentication or package download is required.

## Runtime first, skill second

Use Node.js22+ and a complete maintained Vision UI Doctor checkout (or a locally
packaged runtime with DX1). Chrome/Chromium is needed later for audits, not for
skill installation. The supported source command is:

```powershell
node 'D:\Tools\vision-ui-doctor\src\cli.js' install
```

If you separately installed/linked this package and its executable is on PATH,
the same entrypoint is `vision-ui-doctor install`. Existing package metadata maps
that executable to src/cli.js. This task does not install global software or
publish a registry package. No `npx vision-ui-doctor` download is advertised.

The installer probes Node and the public CLI's offline help for DX1 scan support.
It installs four small files plus an ownership manifest: identical canonical
SKILL.md, references/cli.md, scripts/vud.mjs and a local runtime.json binding.
It does **not** copy the scanner runtime or install Node/Chrome/dependencies.
The helper invokes the bound public-cli.js by argument array, preserving the
application working directory and exit status. Absolute paths handle spaces.
If the runtime moves/disappears, `--check` fails with reinstall instructions.
Moving to another machine requires installing its runtime and rebinding the skill.

## Targets and verified discovery locations

Every path below ends with `/vision-ui-doctor/`. `~` is the OS user home, not
the source checkout. Project paths resolve under --project-root or the directory
from which the installer was invoked. User/global installation is per OS user,
not machine-wide/admin deployment.

| Target | Project installation | User/global installation | Confirm in the host |
| --- | --- | --- | --- |
| Codex | .agents/skills | ~/.agents/skills | /skills or $vision-ui-doctor; restart if needed |
| Claude Code | .claude/skills | ~/.claude/skills | /vision-ui-doctor in local Claude Code |
| Gemini CLI | .agents/skills (documented alias) | ~/.agents/skills (documented alias) | /skills reload, then /skills list; host activation consent still applies |
| Antigravity IDE | .agents/skills | ~/.gemini/config/skills | Agent side panel > Customizations |
| Cursor | .agents/skills | ~/.agents/skills | Customize > Skills > Agent Decides |

Sources: [Codex](https://learn.chatgpt.com/docs/build-skills),
[Claude Code](https://code.claude.com/docs/en/skills),
[Gemini CLI](https://geminicli.com/docs/cli/using-agent-skills/),
[Antigravity IDE](https://antigravity.google/docs/skills?app=antigravity-ide),
[Cursor](https://cursor.com/docs/skills),
[Agent Skills format](https://agentskills.io/specification).

The documented shared roots avoid unnecessary copies across Codex/Gemini/Cursor
and Antigravity projects. Selecting Claude as well needs its native separate
folder; Cursor also discovers Claude folders, so two identical entries may appear.
The installer reports that overlap explicitly; it does not create divergent
content per agent. Antigravity CLI's user directory differs from the IDE and is
not this adapter's target. Older agent versions may use different paths.

## Commands

Run the source executable by absolute path from the actual application directory:

```powershell
$installer = 'D:\Tools\vision-ui-doctor\src\cli.js'
node $installer install --list
node $installer install --agent codex --scope project --project-root 'D:\My App'
node $installer install --agent claude-code --scope project --project-root 'D:\My App'
node $installer install --agent gemini-cli --scope user
node $installer install --agent antigravity --scope user
node $installer install --agent cursor --scope project --project-root 'D:\My App'
# Multiple targets; shared destinations receive one identical bundle:
node $installer install --agent codex,gemini-cli,antigravity,cursor --scope project --project-root 'D:\My App'
node $installer install --status --scope project --project-root 'D:\My App'
node $installer uninstall --agent codex --scope project --project-root 'D:\My App'
```

Agent flags may be repeated. `--scope global` aliases user. Without explicit
agents/scope, a real terminal prompts for single/multiple selection, scope and
confirmation after showing destinations. Non-interactive callers must specify
both. Listing/status do not mutate skills. To bind a different maintained runtime,
use `--runtime 'D:\Other Tool\src\public-cli.js'` on install.

Status checks manifest/content ownership and offline runtime accessibility. Then
run `node 'ABSOLUTE_INSTALLED_SKILL/scripts/vud.mjs' --check` if needed, and confirm
discovery inside the actual host. Filesystem status does not imply host activation,
enablement, permission or cloud availability.

## Collision and uninstall behavior

All destinations are preflighted before writes. Existing unmanaged/modified skill
files, symlink/reparse ancestors, known legacy aliases and opposite project/user
scope duplicates cause refusal. Identical owned installs are idempotent. There
is no overwrite/force option; preserve local edits and resolve a collision explicitly.
Repository-owned skill source lives only in `skills/vision-ui-doctor/`, including
its references and helper. `.agents/skills/vision-ui-doctor/` is an ignored,
installer-managed project destination, including in this source checkout. Do not
track a discovery pointer or edit generated files there; maintain the canonical
source and install/rebind locally instead. Local runtime paths and ownership
manifests must stay out of Git. Existing modified/older installs still require
explicit preservation and ownership-safe removal before reinstalling.

Shared bundles record selected agent registrations. Uninstalling one registration
leaves files while another remains. The last uninstall verifies fixed file names
and hashes, removes only owned files/manifest, and removes only empty bundle
directories. Unrelated files/configurations remain; modified bundle files block
uninstall. Empty parent skill roots can remain. No recursive production deletion.
Concurrent edits/installers and all other projects' hidden/plugin/system skill
registries are not comprehensively inventoried; avoid concurrent operations and
check host discovery for duplicates beyond the known roots.

## Updating an owned skill (including DX2 to DX3)

An existing identical bundle is idempotent; newer canonical content is intentionally
not silently copied over an installation. Back up the installed directory outside
agent discovery roots (keep local bindings/manifest private), then inspect
`install --status --agent codex --scope project` using the maintained installer.
With explicit update approval, use its existing `uninstall --agent codex --scope
project` followed by `install --agent codex --scope project`, then run the installed
helper `--check` and confirm host discovery/refresh. Substitute the actual agent,
scope and project-root consistently; do not update other projects implicitly.

Uninstall first verifies stored ownership hashes, including the previous version's
instructions. Locally modified/unmanaged files block both replacement and removal:
stop, preserve the edits and resolve them explicitly; do not forge hashes, delete
manifests or force an overwrite. Shared bundles retain other agent registrations;
coordinate approval for all registered agents and reinstall the same selected
agents rather than silently dropping ownership. Unrelated files remain; if their
remaining directory blocks reinstall, stop and preserve/resolve it separately.
This is a two-step operation, not an atomic updater: if reinstall fails, report it
and retain the backup. Refreshing discovery is separate from filesystem success.

## Other Agent Skills hosts

Supply a declarative JSON adapter (no executable hooks):

```json
{"schemaVersion":1,"id":"other-agent","name":"Other Agent","project":".other/skills","user":".other/skills"}
```

Then use `install --adapter host.json --agent other-agent --scope project` (also
pass the adapter for status/uninstall). Roots must be relative, traversal-free
paths ending in /skills. Verify that host's discovery contract yourself. This
extension mechanism does not certify compatibility with untested agents.

## Compatibility and release boundaries

Local agents with filesystem/shell access only. Remote/cloud agents do not gain
access to this machine's absolute runtime merely because they can read SKILL.md.
In particular, local Claude personal skills and unsynced Cursor skills have host-
specific cloud behavior documented above. No cloud sync/settings are changed.
Project runtime.json contains local machine paths: do not commit it blindly for
other machines. Reinstall/rebind per environment; the installer never commits.

Before public release, separately approve/version/package and verify the npm
artifact/executables plus actual host discovery on intended OS/agent versions.
The package allowlist includes src/skills/guides/examples and public metadata,
excluding internal Docs/reports/.temp/tests. None of this establishes browser
reliability, complete route coverage or stable-release acceptance.
