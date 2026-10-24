#!/usr/bin/env bash
# Strip "Co-authored-by: Cursor" from commit messages in THIS repo, then update origin/main.
# Does not rewrite author name or email. Does not mirror every ref.
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "Install git-filter-repo first."
  exit 1
fi

ORIGIN="$(git remote get-url origin)"

git filter-repo --force --message-callback '
import re
message = re.sub(
    br"\n*Co-authored-by: Cursor <cursoragent@cursor.com>\s*",
    b"\n",
    message,
)
return re.sub(br"\n+\Z", b"\n", message)
'

git remote add origin "$ORIGIN"
git fetch origin
git push --force-with-lease origin main
echo "Updated origin/main. GitHub may take a minute to drop the co-author."
