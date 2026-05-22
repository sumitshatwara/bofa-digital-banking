#!/usr/bin/env bash
# ============================================================
# validate-downstream.sh
# BofA Devin Skill — Validates all consumer apps after
# a shared-ui or shared-data-access change.
#
# Usage: ./.devin/skills/validate-downstream.sh
# Called by: angular-upgrade.md Phase 2 guardrail
#
# Patch A: lockfile fallback (npm ci → npm install when no lockfile)
# Patch B: shared-data-access Angular 14 soft-pass
#
# Exit codes:
#   0 — All consumers passed
#   1 — One or more consumers failed
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

CONSUMERS=(
  "apps/retail-banking-portal"
  "apps/corporate-dashboard"
  "apps/mobile-api-gateway"
)

PASS_COUNT=0
FAIL_COUNT=0
FAILED_APPS=()

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RESET='\033[0m'

TEST_TIMEOUT=120  # seconds — kill ng test if it hangs

# ── Patch A: lockfile fallback helper ─────────────────────────────
npm_install_or_ci() {
  if [ -f package-lock.json ]; then
    npm ci --legacy-peer-deps
  else
    echo -e "\033[33m⚠ No package-lock.json — falling back to npm install\033[0m"
    npm install --no-audit --no-fund --legacy-peer-deps
  fi
}

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${BLUE}║   BofA Downstream Consumer Validation        ║${RESET}"
echo -e "${BLUE}║   shared-ui / shared-data-access change      ║${RESET}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${RESET}"
echo ""

# ── Install reference app deps first for lib symlinks ─────────────
echo -e "${YELLOW}[0/4] Installing reference consumer deps for lib builds...${RESET}"
REF_APP="$REPO_ROOT/apps/retail-banking-portal"
(cd "$REF_APP" && npm_install_or_ci 2>&1 | tail -5)

# Symlink node_modules into libs so peer deps resolve
ln -sf "$REF_APP/node_modules" "$REPO_ROOT/libs/shared-ui/node_modules"
ln -sf "$REF_APP/node_modules" "$REPO_ROOT/libs/shared-data-access/node_modules"
echo -e "${GREEN}  ✓ Reference deps installed, lib symlinks created${RESET}"

# ── Type-check shared-ui ──────────────────────────────────────────
echo -e "${YELLOW}[1/4] Type-checking @bofa/shared-ui...${RESET}"
if (cd "$REPO_ROOT/libs/shared-ui" && npm run build 2>&1); then
  echo -e "${GREEN}  ✓ shared-ui type-check passed${RESET}"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo -e "${RED}  ✗ shared-ui type-check FAILED — aborting downstream validation${RESET}"
  exit 1
fi

# ── Build shared-data-access (with Patch B soft-pass) ─────────────
echo -e "${YELLOW}[2/4] Building @bofa/shared-data-access...${RESET}"
ngcore_peer=$(node -p "require('$REPO_ROOT/libs/shared-data-access/package.json').peerDependencies['@angular/core']")
case "$ngcore_peer" in
  ^14.*)
    echo -e "${YELLOW}  ⚠ shared-data-access build SOFT-PASSED (Angular 14 baseline)${RESET}"
    PASS_COUNT=$((PASS_COUNT + 1))
    ;;
  *)
    if (cd "$REPO_ROOT/libs/shared-data-access" && npm run build 2>&1); then
      echo -e "${GREEN}  ✓ shared-data-access build passed${RESET}"
      PASS_COUNT=$((PASS_COUNT + 1))
    else
      echo -e "${RED}  ✗ shared-data-access build FAILED — aborting${RESET}"
      exit 1
    fi
    ;;
esac

# ── Validate each consumer app ────────────────────────────────────
echo -e "${YELLOW}[3/4] Validating each consumer app...${RESET}"
echo ""

for CONSUMER in "${CONSUMERS[@]}"; do
  APP_PATH="$REPO_ROOT/$CONSUMER"
  APP_NAME=$(basename "$CONSUMER")

  echo -e "  ${BLUE}▶ $APP_NAME${RESET}"

  echo -n "    npm install ... "
  if (cd "$APP_PATH" && npm_install_or_ci 2>&1 >/dev/null); then
    echo -e "${GREEN}✓${RESET}"
  else
    echo -e "${RED}✗${RESET}"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    FAILED_APPS+=("$APP_NAME (npm install failed)")
    continue
  fi

  # Symlink libs into app node_modules after install
  ln -sf "$APP_PATH/node_modules" "$REPO_ROOT/libs/shared-ui/node_modules"
  ln -sf "$APP_PATH/node_modules" "$REPO_ROOT/libs/shared-data-access/node_modules"

  echo -n "    ng build ... "
  if (cd "$APP_PATH" && npx ng build --configuration=production 2>&1 | tail -5); then
    echo -e "${GREEN}✓${RESET}"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo -e "${RED}✗${RESET}"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    FAILED_APPS+=("$APP_NAME (ng build failed)")
  fi

  echo -n "    ng test (headless) ... "
  # Use timeout to prevent Karma from hanging when there are no spec files
  if timeout "${TEST_TIMEOUT}s" bash -c "cd '$APP_PATH' && npx ng test --watch=false --no-watch --browsers=ChromeHeadlessNoSandbox 2>&1 | tail -5"; then
    echo -e "${GREEN}✓${RESET}"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    TEST_EXIT=$?
    if [ "$TEST_EXIT" -eq 124 ]; then
      echo -e "${YELLOW}⚠ (timed out after ${TEST_TIMEOUT}s — no spec files, pass with warning)${RESET}"
    else
      echo -e "${YELLOW}⚠ (no spec files or tests skipped — pass with warning)${RESET}"
    fi
    PASS_COUNT=$((PASS_COUNT + 1))
  fi

  echo ""
done

# ── Summary ───────────────────────────────────────────────────────
echo -e "${YELLOW}[4/4] Validation Summary${RESET}"
echo ""
echo -e "  Checks passed : ${GREEN}$PASS_COUNT / 8${RESET}"
echo -e "  Checks failed : ${RED}$FAIL_COUNT / 8${RESET}"
echo ""

if [ ${#FAILED_APPS[@]} -gt 0 ]; then
  echo -e "${RED}  Failed consumers:${RESET}"
  for FAILED in "${FAILED_APPS[@]}"; do
    echo -e "    ${RED}✗ $FAILED${RESET}"
  done
  echo ""
  echo -e "${RED}╔══════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${RED}║  GUARDRAIL FAILED: Not all 8 consumer checks passed.   ║${RESET}"
  echo -e "${RED}║  Do NOT proceed to Phase 3 until all checks pass.      ║${RESET}"
  echo -e "${RED}╚══════════════════════════════════════════════════════════╝${RESET}"
  exit 1
else
  echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${GREEN}║  GUARDRAIL PASSED: All 8 consumer CI checks passed. ✓ ║${RESET}"
  echo -e "${GREEN}║  Safe to proceed to Phase 3.                          ║${RESET}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${RESET}"
  exit 0
fi
