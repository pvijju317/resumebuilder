#!/usr/bin/env bash
# Definition of done: no TODO/FIXME without an issue reference, e.g. TODO(#12).
set -euo pipefail
hits=$(grep -rnE '\b(TODO|FIXME)\b' apps packages scripts \
  --include='*.ts' --include='*.tsx' --include='*.js' --include='*.css' --include='*.prisma' \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=generated \
  | grep -vE '(TODO|FIXME)\(#[0-9]+\)' | grep -v 'check-todos.sh' || true)
if [ -n "$hits" ]; then
  echo "TODO/FIXME without issue reference:"; echo "$hits"; exit 1
fi
echo "check-todos: ok"
