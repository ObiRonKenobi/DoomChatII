#!/usr/bin/env python3
"""Generate web/ascii_art.js — target ~100 tech & game ASCII art pieces."""

from pathlib import Path

TARGET = 100

# Full library lives in ALL_PIECES below; only first TARGET are emitted.
ALL_PIECES = [
    ("doom-guy", "Doom Guy — DOOM (1993)", """     ██████╗  ██████╗  ██████╗ ███╗   ███╗
     ██╔══██╗██╔═══██╗██╔═══██╗████╗ ████║
     ██║  ██║██║   ██║██║   ██║██╔████╔██║
     ██║  ██║██║   ██║██║   ██║██║╚██╔╝██║
     ██████╔╝╚██████╔╝╚██████╔╝██║ ╚═╝ ██║
     ╚═════╝  ╚═════╝  ╚═════╝ ╚═╝     ╚═╝"""),
    ("pac-man", "Pac-Man — Namco (1980)", """        ▄█████████▄
      ▄██▀▀▀▀▀▀▀▀██▄
     ███  ●    ●  ███
     ███      ▼    ███
      ▀██▄▄▄▄▄▄▄▄██▀
        ▀█████████▀"""),
    ("gameboy", "Game Boy — Nintendo (1989)", """      ┌──────────────┐
      │ ┌──────────┐ │
      │ │  ▄▄▄▄▄▄  │ │
      │ │  █ ▄▄ █  │ │
      │ │  █ ███ █  │ │
      │ │  ▀▀▀▀▀▀  │ │
      │ └──────────┘ │
      │   (○)    (○)  │
      │      ═══      │
      └──────────────┘"""),
    ("triforce", "Triforce — The Legend of Zelda (1986)", """            ▲
           ▲ ▲
          ▲   ▲
         ▲ ▲ ▲ ▲
        ▲       ▲
       ▲ ▲   ▲ ▲
      ▲   ▲ ▲   ▲
     ▲ ▲ ▲ ▲ ▲ ▲ ▲"""),
    ("cpu", "CPU Chip — x86 Architecture", """    ┌─────────────────┐
    │  ┌───┐   ┌───┐  │
    │  │   │   │   │  │
    │  └───┘   └───┘  │
    │                 │
    │    ( CENTRAL )   │
    │ ( PROCESSOR )   │
    │                 │
    └──┬───┬───┬───┬──┘
       │   │   │   │"""),
    ("sword", "Master Sword — Zelda", """          /|
         / |
        /  |
       /   |
      /    |
     /     |
    /      |
   /_______|
       ||
       ||
      [==]"""),
    ("arcade", "Arcade Cabinet — Golden Rule Age", """      ╔══════════════╗
      ║  ▓▓▓▓▓▓▓▓▓▓  ║
      ║  ▓ HIGH SCORE▓ ║
      ║  ▓  999999  ▓ ║
      ║  ▓▓▓▓▓▓▓▓▓▓  ║
      ╠══════════════╣
      ║   ◯     ◯     ║
      ║      ═══      ║
      ╚══════════════╝"""),
    ("rocket", "Space Rocket — Apollo Era", """         /\\
        /  \\
       /    \\
      /  ██  \\
     /   ██   \\
    /    ██    \\
   /     ██     \\
  /      ██      \\
 /_______██_______\\
         ||
        /||\\
       / || \\"""),
    ("terminal", "Retro Terminal — DoomChat II", """ ┌────────────────────────┐
 │ > CONNECTING...        │
 │ > USER@DOOMCHAT:~#     │
 │ > _                    │
 │                        │
 └────────────────────────┘
   ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀"""),
]

# Remaining entries loaded from existing ascii_art.js tail via append in script run - 
# For maintainability, regenerate from the current 100-piece file as source of truth.
# Run: python3 scripts/build_ascii_art.py

def load_pieces_from_js():
    import re
    js = (Path(__file__).resolve().parents[1] / "web" / "ascii_art.js").read_text()
    pieces = []
    for m in re.finditer(
        r'\{\s*id: "([^"]+)",\s*title: "([^"]+)",\s*art: "((?:\\.|[^"\\])*)"\s*\}',
        js,
        re.S,
    ):
        art = bytes(m.group(3), "utf-8").decode("unicode_escape")
        pieces.append((m.group(1), m.group(2), art))
    return pieces

def js_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")

def main():
    pieces = load_pieces_from_js()
    if len(pieces) < TARGET:
        raise SystemExit(f"Only {len(pieces)} pieces in ascii_art.js; need {TARGET}")
    pieces = pieces[:TARGET]
    ids = [p[0] for p in pieces]
    if len(ids) != len(set(ids)):
        raise SystemExit("Duplicate ids in library")

    lines = ["window.DOOM_ASCII_ART = ["]
    for i, (pid, title, art) in enumerate(pieces):
        lines.append("  {")
        lines.append(f'    id: "{pid}",')
        lines.append(f'    title: "{title}",')
        lines.append(f'    art: "{js_escape(art)}"')
        lines.append("  }" + ("," if i < len(pieces) - 1 else ""))
    lines.append("];")
    lines.append("")

    out = Path(__file__).resolve().parents[1] / "web" / "ascii_art.js"
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {len(pieces)} pieces to {out}")

if __name__ == "__main__":
    main()
