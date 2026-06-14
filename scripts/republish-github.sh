#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/4 Refresh GitHub auth (needs delete_repo scope)"
gh auth refresh -h github.com -s delete_repo

echo "==> 2/4 Delete old GitHub repo"
gh repo delete kkrasnova/KRAINA --yes

echo "==> 3/4 Create fresh repo with the same name"
gh repo create kkrasnova/KRAINA --public --description "KRAINA"

echo "==> 4/4 Push single clean commit"
git remote set-url origin https://github.com/kkrasnova/KRAINA.git
git push -u origin main --force

echo ""
echo "Done. Open https://github.com/kkrasnova/KRAINA"
echo "Contributors should show only kkrasnova."
echo ""
echo "Re-connect deployments (kraina-api, kraina-db) in Firebase/Vercel/etc."
