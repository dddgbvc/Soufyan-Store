# ECC skills — vendored subset

Four skills copied from [affaan-m/ECC](https://github.com/affaan-m/ECC) instead of
installing the full `ecc@ecc` plugin.

## Why a subset

The full plugin ships 380 skills and 68 agents. Its frontmatter index is loaded into
**every** session whether or not a skill is used — `claude plugin details ecc` reports
**~40,600 always-on tokens**, roughly 20% of a 200k context window spent before the
first prompt. Claude Code 2.1.238 has no per-skill enable/disable setting, so the
plugin is all-or-nothing.

Vendoring only what this repo needs costs **~250 always-on tokens** — a ~99% reduction.
Full skill bodies (~42KB total) load only when a skill is actually invoked.

## What was taken

| Skill | Why it fits this repo |
|---|---|
| `seo` | Arabic RTL storefront for a local business; OG tags and `meta description` already present, structured data and sitemap are not |
| `ecc-security-review` | `worker.js` proxies the Kimi API and ships `Access-Control-Allow-Origin: "*"` with a TODO to restrict it; covers secrets handling and API endpoint review |
| `deployment-patterns` | The API lives in a Cloudflare Worker — deploy, health check, rollback |
| `browser-qa` | Single-page site; visual and interaction verification after changes |

Deliberately skipped: `frontend-patterns` (React/Next.js-specific, this site is vanilla
HTML/CSS), and the other 375 skills as irrelevant here.

`security-review` was renamed to `ecc-security-review` — the original name collides with
a Claude Code built-in skill of the same name.

## Source

- Repo: `https://github.com/affaan-m/ECC.git`
- Commit: `d8409a4b0813771235555e32e3d8046a73988bfa` (ECC v2.2.0, 2026-08-19)
- Paths: `skills/{seo,security-review,deployment-patterns,browser-qa}/`

Files are unmodified except the `name:` field of `ecc-security-review`. None of the four
reference `CLAUDE_PLUGIN_ROOT` or sibling plugin files, so they work standalone.

## Re-syncing

```bash
git clone --depth 1 https://github.com/affaan-m/ECC.git /tmp/ecc
cp -r /tmp/ecc/skills/{seo,deployment-patterns,browser-qa} .claude/skills/
cp -r /tmp/ecc/skills/security-review .claude/skills/ecc-security-review
sed -i 's/^name: security-review$/name: ecc-security-review/' .claude/skills/ecc-security-review/SKILL.md
```

These are not tracked in `skills-lock.json` — that file is managed by the `skills` CLI
for the `jakubkrehel/skills` sources and uses a hash scheme this subset does not follow.

## Installing the full plugin instead

`.claude/settings.json` registers the ECC marketplace but does **not** enable the plugin,
so it costs nothing until you opt in:

```bash
claude plugin install ecc@ecc
```

Note that the plugin also activates 23 hooks (`PreToolUse`, `PostToolUse`, `Stop`,
`SessionStart`/`End`, `PreCompact`) and an MCP server (`chrome-devtools` via
`npx -y chrome-devtools-mcp@latest`). Hooks default to on; `/plugin configure ecc@ecc`
sets `hooks_enabled` and `hook_profile`.
