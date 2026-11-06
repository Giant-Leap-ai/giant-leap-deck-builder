#!/bin/sh
# Prints one digest per protected path. Verifiers compare these to the values recorded before the v2 build.
#   sh tools/regression/protected-digest.sh         the four recorded paths (this output is fixed; do not change it)
#   sh tools/regression/protected-digest.sh --all   also the protected paths that have no recorded digest: legacy,
#                                                   decks/one-giant-leap (without export/, which the release gate may
#                                                   regenerate), its export/, and tools/regression/baselines (git-ignored,
#                                                   so this is its only integrity check). Record these before a pass and
#                                                   compare after it.
cd "$(dirname "$0")/../.." || exit 1
digest() { printf '%s ' "$1"; shift; find "$@" -type f ! -name .DS_Store -print0 | sort -z | xargs -0 shasum | shasum | cut -c1-16; }
for p in _archive cinema engine/tween.js tools/regression/baseline-one-giant-leap; do
  digest "$p" "$p"
done
if [ "$1" = "--all" ]; then
  digest legacy legacy
  digest decks/one-giant-leap decks/one-giant-leap ! -path 'decks/one-giant-leap/export/*'
  digest decks/one-giant-leap/export decks/one-giant-leap/export
  if [ -d tools/regression/baselines ]; then digest tools/regression/baselines tools/regression/baselines; else echo 'tools/regression/baselines absent'; fi
fi
