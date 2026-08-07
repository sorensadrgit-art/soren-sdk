## 2024-08-01 - Redundant Regex Compilation in Filter Loops
**Learning:** In `packages/core/src/inspector/workspaces.ts`, `globToRegExp` was being called inside a `.some()` loop within a `.filter()` loop, recompiling identical strings into Regex objects repeatedly. This O(N*M) creation pattern can lead to significant bottlenecks in large mono-repos.
**Action:** Always pre-compile regular expressions and expensive mappings into arrays or maps *before* mapping or filtering over large datasets.
## 2026-08-05 - [Array Sorting Allocation Overhead]
**Learning:** The codebase heavily relied on creating intermediate arrays and joining them with `\0` during `sort` callbacks to simplify lexicographical sorting of objects. This pattern causes O(n log n) string and array allocations during sorting, placing heavy pressure on the garbage collector.
**Action:** Replace `[a.x, a.y].join("\0").localeCompare([b.x, b.y].join("\0"))` with sequential `localeCompare` checks inside the sort callback to avoid intermediate allocations.
