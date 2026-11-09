# 3D character (optional)

The game ships with a procedural character so it works with no assets. To use a real rigged,
animated character, put a glTF binary here named **`player.glb`**. It's picked up automatically
on the next page load.

Recommended (free, CC0, no attribution required):

1. Download **KayKit – Adventurers** from https://kaylousberg.itch.io/kaykit-adventurers
   (and optionally **KayKit – Character Animations**, https://kaylousberg.itch.io/kaykit-character-animations).
2. From the pack's glTF folder, copy one character (e.g. `Knight.glb`, `Rogue.glb`) here as `player.glb`.
   Use a file that already includes animations, or merge the animations in Blender and export GLB.

Requirements: feet at y = 0, facing +Z. Any height works (the game rescales it to about 1.65 m).
Clip names are matched loosely: `idle`, `walk` / `Walking_A`, `run` / `Running_A`, `jump`,
and `cheer` / `wave`.

Check the licence of any other pack before shipping. For example, Quaternius packs use their own licence and come as FBX, so they need converting.
