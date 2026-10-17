#!/bin/sh
# Prints one digest per protected path. Verifiers compare these to the values recorded before the v2 build.
cd "$(dirname "$0")/../.." || exit 1
for p in _archive cinema engine/tween.js tools/regression/baseline-one-giant-leap; do
  printf '%s ' "$p"; find "$p" -type f ! -name .DS_Store -print0 | sort -z | xargs -0 shasum | shasum | cut -c1-16
done
