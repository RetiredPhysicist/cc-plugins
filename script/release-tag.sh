#!/usr/bin/env bash
#
# Create the release tag for one package.
#
#   script/release-tag.sh <package>
#
# The tag is `<package>-v<version>`, taken from that package's package.json.
# Push only that tag; pushing every tag would re-publish old versions.
set -euo pipefail

package="${1:-}"
if [ -z "$package" ]; then
  echo "usage: $0 <package>" >&2
  exit 1
fi

dir="packages/$package"
test -d "$dir" || { echo "unknown package: $package" >&2; exit 1; }

version=$(node -p "require('./$dir/package.json').version")
tag="$package-v$version"

if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
  echo "tag already exists: $tag" >&2
  exit 1
fi

git tag "$tag"
echo "created $tag"
echo "push it with: git push origin $tag"
