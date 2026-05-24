#!/usr/bin/env bash
# Regenerate content/ai-input.css from ai-input/component.css (scoped to #perso-xxl-panel).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/ai-input/component.css"
OUT="$ROOT/content/ai-input.css"

python3 - "$SRC" "$OUT" <<'PY'
import re
import sys

src_path, out_path = sys.argv[1], sys.argv[2]
text = open(src_path, encoding="utf-8").read()

def prefix_selector(sel: str) -> str:
    sel = sel.strip()
    if not sel:
        return sel
    parts = [p.strip() for p in sel.split(",")]
    out = []
    for part in parts:
        if part == ":root":
            out.append("#perso-xxl-panel")
        elif part.startswith("#perso-xxl-panel"):
            out.append(part)
        else:
            out.append(f"#perso-xxl-panel {part}")
    return ", ".join(out)

def transform(text: str) -> str:
    out = []
    i = 0
    n = len(text)

    while i < n:
        if text[i:i+2] == "/*":
            end = text.find("*/", i + 2)
            if end == -1:
                out.append(text[i:])
                break
            out.append(text[i:end + 2])
            i = end + 2
            continue

        if text[i] in " \t\r\n":
            out.append(text[i])
            i += 1
            continue

        if text[i] == "@":
            start = i
            depth = 0
            while i < n:
                ch = text[i]
                if ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        out.append(text[start:i + 1])
                        i += 1
                        break
                i += 1
            continue

        start = i
        while i < n and text[i] != "{":
            i += 1
        if i >= n:
            out.append(text[start:])
            break

        selector = text[start:i].strip()
        body_start = i
        depth = 0
        while i < n:
            ch = text[i]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    body = text[body_start:i + 1]
                    out.append(f"{prefix_selector(selector)}{body}")
                    i += 1
                    break
            i += 1

    return "".join(out)

header = (
    "/* AUTO-GENERATED from ai-input/component.css — edit that file, then run:\n"
    "   bash scripts/sync-ai-input-css.sh */\n\n"
)
open(out_path, "w", encoding="utf-8").write(header + transform(text).rstrip() + "\n")
print(f"Wrote {out_path}")
PY
