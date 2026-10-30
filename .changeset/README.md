# Changesets

This folder stores [Changesets](https://github.com/changesets/changesets) entries for this monorepo.

## Preferred version path (statusline build tooling)

1. In a feature PR, run `npx changeset` (from the repo root) and commit the generated markdown under `.changeset/`.
2. After merge to `main`, `.github/workflows/release.yml` opens a **Version Packages** PR.
3. Merge that PR. `cc-shannon-statusline` is `private` ("Not published to npm") — `changeset publish` skips it. Claude Code marketplace plugins here still treat a push to `main` as the installable revision (commit SHA); plugin manifests omit `version` on purpose.

Only `plugins/cc-shannon-statusline` has a `package.json` today. The other plugins have no npm package.

Do not add secrets here. See the root README **Release** section.
