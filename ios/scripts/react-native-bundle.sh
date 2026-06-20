#!/bin/bash
set -eo pipefail

if [[ -f "$PODS_ROOT/../.xcode.env" ]]; then
  # shellcheck disable=SC1091
  source "$PODS_ROOT/../.xcode.env"
fi
if [[ -f "$PODS_ROOT/../.xcode.env.local" ]]; then
  # shellcheck disable=SC1091
  source "$PODS_ROOT/../.xcode.env.local"
fi

export PROJECT_ROOT="$PROJECT_DIR/../app"

# Debug builds load JS from Metro; skip Hermes bundling during Xcode build.
if [[ "$CONFIGURATION" = *Debug* ]]; then
  export SKIP_BUNDLING=1
fi

if [[ -z "$ENTRY_FILE" && -z "$SKIP_BUNDLING" ]]; then
  export ENTRY_FILE="$("$NODE_BINARY" -e "require(require.resolve('expo/scripts/resolveAppEntry.js', { paths: ['$PROJECT_ROOT'] }))" "$PROJECT_ROOT" ios absolute | tail -n 1)"
fi

if [[ -z "$CLI_PATH" ]]; then
  export CLI_PATH="$("$NODE_BINARY" --print "require.resolve('@expo/cli', { paths: [require.resolve('expo/package.json', { paths: ['$PROJECT_ROOT'] })] })")"
fi

if [[ -z "$BUNDLE_COMMAND" ]]; then
  export BUNDLE_COMMAND="export:embed"
fi

if [[ -f "$PODS_ROOT/../.xcode.env.updates" ]]; then
  # shellcheck disable=SC1091
  source "$PODS_ROOT/../.xcode.env.updates"
fi
if [[ -f "$PODS_ROOT/../.xcode.env.local" ]]; then
  # shellcheck disable=SC1091
  source "$PODS_ROOT/../.xcode.env.local"
fi

RN_XCODE="$("$NODE_BINARY" --print "require.resolve('react-native/package.json', { paths: ['$PROJECT_ROOT'] }).replace('/package.json', '/scripts/react-native-xcode.sh')")"
# shellcheck disable=SC1090
source "$RN_XCODE"
