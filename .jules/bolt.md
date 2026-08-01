## 2024-08-01 - Redundant Regex Compilation in Filter Loops
**Learning:** In `packages/core/src/inspector/workspaces.ts`, `globToRegExp` was being called inside a `.some()` loop within a `.filter()` loop, recompiling identical strings into Regex objects repeatedly. This O(N*M) creation pattern can lead to significant bottlenecks in large mono-repos.
**Action:** Always pre-compile regular expressions and expensive mappings into arrays or maps *before* mapping or filtering over large datasets.
