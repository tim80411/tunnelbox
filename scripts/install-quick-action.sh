#!/bin/bash
set -e

SERVICES_DIR="$HOME/Library/Services"
WORKFLOW_NAME="Add to TunnelBox.workflow"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE="$SCRIPT_DIR/../resources/quick-action/$WORKFLOW_NAME"

if [ ! -d "$SOURCE" ]; then
  echo "Error: Quick Action workflow not found at $SOURCE"
  exit 1
fi

mkdir -p "$SERVICES_DIR"

# Remove old version if exists
if [ -d "$SERVICES_DIR/$WORKFLOW_NAME" ]; then
  rm -rf "$SERVICES_DIR/$WORKFLOW_NAME"
  echo "Removed existing Quick Action"
fi

cp -r "$SOURCE" "$SERVICES_DIR/"

# Clear quarantine attribute if present
xattr -r -d com.apple.quarantine "$SERVICES_DIR/$WORKFLOW_NAME" 2>/dev/null || true

# Refresh the services menu
/System/Library/CoreServices/pbs -update 2>/dev/null || true

echo "Quick Action installed successfully!"
echo ""
echo "Usage: Right-click a folder in Finder > Quick Actions > Add to TunnelBox"
echo ""
echo "Note: The TunnelBox app must be packaged and installed for the"
echo "tunnelbox:// protocol to work. In dev mode, use drag-and-drop or paste instead."
