#!/usr/bin/env bash
# SessionStart hook: turn on caveman compression mode for every new session.
cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Caveman mode is ON for this session at level `full`. Read .claude/skills/caveman/SKILL.md and apply it to every response until the user says \"stop caveman\", \"normal mode\", or \"/caveman off\". Reply in the user's own language. Companion skills installed: /caveman-review, /caveman-commit, /caveman-compress, /caveman-explore, /caveman-stats, /caveman-help."}}
JSON
