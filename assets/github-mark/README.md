# GitHub mark

The link to the repository after the logo shows the GitHub mark, the Invertocat (design 2.8).
`GITHUB_MARKUP` in `src/ui/icons.ts` holds the path of the file below, with no change.

| Item | Value |
|---|---|
| Source | Primer Octicons, <https://github.com/primer/octicons> |
| Source file | `icons/mark-github-24.svg`, view box 24 × 24 |
| Commit | `ea8e6bb79894cc7e85564ee9b53d86b418738d04` (2026-03-18), the last commit that changed the file |
| Source file SHA-256 | `bce494189797623c34e39a41c2c38a132bdca23ce4e6ac06b70116ed7e91ce26` |
| License | MIT, Copyright (c) 2026 GitHub Inc. `LICENSE.txt` in this folder is the `LICENSE` of the repository |
| License SHA-256 | `da259c8bd0de62713ccdcf88910aebca810644f98c2c912bad814fc79ea778df` |

## Logo rules

The mark is a trademark of GitHub, Inc. The logo rules of GitHub (<https://github.com/logos>)
apply in addition to the license:

- A project can use the Invertocat as a social button that links to its GitHub project.
- The Invertocat shows only in white, black, or in few cases gray or green.
- A page must not change the color, the shape, or the proportions of the mark, and must not
  combine it with other words or design elements.

Thus the page shows the mark in the neutral gray `--github-mark` (`#c8c8c8`), and white on a
hover, at its own proportions. A gap separates it from the name "Pawchestra", so it is a link of
its own and no part of the logo of the app.

## Third-party license file

`githubMarkEntry()` of `tools/licenses.ts` adds this license to the third-party license file
(design 7.3).
