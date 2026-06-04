#!/usr/bin/env bash
#
# Hoolix installer for macOS and Linux
# Modern, friendly, and robust.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/JayLLM/hoolix/main/install.sh | bash
#

set -euo pipefail

REPO="JayLLM/hoolix"
BINARY_NAME="hoolix"

# Colors (only if stdout is a terminal)
if [ -t 1 ]; then
  CYAN='\033[0;36m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  RED='\033[0;31m'
  NC='\033[0m'
else
  CYAN='' GREEN='' YELLOW='' RED='' NC=''
fi

print_banner() {
  echo ""
  echo -e "  ${CYAN}◆ hoolix — The MCP server platform.${NC}"
  echo ""
  echo -e "  ${YELLOW}Recommended install: npm install -g hoolix${NC}"
  echo -e "  ${CYAN}(npm is provenance-verified and updates with: npm update -g hoolix)${NC}"
  echo ""
  echo -e "  This script installs the standalone binary. Continuing..."
  echo ""
}

info()    { echo -e "${CYAN}→ $*${NC}"; }
success() { echo -e "${GREEN}✓ $*${NC}"; }
warn()    { echo -e "${YELLOW}! $*${NC}"; }
error()   { echo -e "${RED}✗ $*${NC}"; }

show_help() {
  cat << EOF
Hoolix Installer (macOS / Linux)

Usage:
  curl -fsSL https://raw.githubusercontent.com/JayLLM/hoolix/main/install.sh | bash
  ./install.sh --version v0.2.0 --prefix /opt/hoolix

Options:
  --version <tag|latest>   Specific release or "latest"
  --prefix <dir>           Custom installation directory
  --stable                 Ignore prereleases when resolving "latest"
  --no-path-update         Do not modify PATH
  --help                   Show this help
EOF
  exit 0
}

# Simple argument parsing
VERSION="latest"
PREFIX=""
NO_PATH_UPDATE=false
STABLE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --version) VERSION="$2"; shift 2 ;;
    --prefix) PREFIX="$2"; shift 2 ;;
    --stable) STABLE=true; shift ;;
    --no-path-update) NO_PATH_UPDATE=true; shift ;;
    --help) show_help ;;
    *) echo "Unknown option: $1"; show_help ;;
  esac
done

print_banner

# Detect OS and Arch
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$OS" in
  linux*)  OS="linux" ;;
  darwin*) OS="darwin" ;;
  *) error "Unsupported OS: $OS"; exit 1 ;;
esac

case "$ARCH" in
  x86_64)  ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *) error "Unsupported architecture: $ARCH"; exit 1 ;;
esac

ASSET_NAME="${BINARY_NAME}-${OS}-${ARCH}"
info "Detected: ${OS}-${ARCH} → ${ASSET_NAME}"

resolve_release() {
  if [ "$VERSION" = "latest" ]; then
    info "Querying GitHub releases..."
    RELEASES_JSON=$(curl -fsSL -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/${REPO}/releases?per_page=20")

    if [ "$STABLE" = true ]; then
      VERSION=$(printf '%s' "$RELEASES_JSON" | tr -d '\n' | sed 's/},[[:space:]]*{/}\n{/g' | grep '"draft": *false' | grep '"prerelease": *false' | head -n 1 | grep -o '"tag_name": *"[^"]*"' | cut -d'"' -f4 || true)
    else
      VERSION=$(printf '%s' "$RELEASES_JSON" | tr -d '\n' | sed 's/},[[:space:]]*{/}\n{/g' | grep '"draft": *false' | head -n 1 | grep -o '"tag_name": *"[^"]*"' | cut -d'"' -f4 || true)
    fi
  else
    VERSION="${VERSION#v}"
    VERSION="v${VERSION}"
    info "Querying GitHub release ${VERSION}..."
  fi

  if [ -z "$VERSION" ]; then
    error "No matching GitHub release found for ${REPO}."
    echo ""
    echo "Check releases: https://github.com/${REPO}/releases"
    exit 1
  fi

  RELEASE_JSON=$(curl -fsSL -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${REPO}/releases/tags/${VERSION}")

  if ! printf '%s' "$RELEASE_JSON" | grep -q "\"name\": *\"${ASSET_NAME}\""; then
    error "Release ${VERSION} does not contain ${ASSET_NAME}."
    echo ""
    echo "Available assets:"
    printf '%s' "$RELEASE_JSON" | grep -o '"name": *"[^"]*"' | cut -d'"' -f4 | sed 's/^/  /'
    exit 1
  fi

  if printf '%s' "$RELEASE_JSON" | grep -q '"prerelease": *true'; then
    warn "Installing prerelease build ${VERSION}."
  else
    success "Selected release: ${VERSION}"
  fi
}

resolve_release

# === Normal installation path ===
DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/${ASSET_NAME}"
info "Download URL: $DOWNLOAD_URL"

# Determine install directory
if [ -n "$PREFIX" ]; then
  INSTALL_DIR="$PREFIX"
else
  INSTALL_DIR="$HOME/.local/bin"
fi

mkdir -p "$INSTALL_DIR"
TARGET="$INSTALL_DIR/$BINARY_NAME"

info "Installing to: $TARGET"

# Download with progress
TMP_FILE=$(mktemp)
info "Downloading binary..."

if curl -fL --progress-bar -o "$TMP_FILE" "$DOWNLOAD_URL"; then
  echo ""   # curl progress-bar doesn't always end with newline
  success "Download complete."
else
  echo ""
  error "Download failed."
  warn "This usually means no release has been published yet."
  rm -f "$TMP_FILE" || true
  exit 1
fi

# SHA-256 checksum verification (optional — non-fatal if checksum file unavailable)
CHECKSUM_URL="https://github.com/${REPO}/releases/download/${VERSION}/SHA256SUMS"
info "Verifying SHA-256 checksum..."
if CHECKSUMS=$(curl -fsSL --max-time 10 "$CHECKSUM_URL" 2>/dev/null); then
  EXPECTED_HASH=$(printf '%s' "$CHECKSUMS" | grep -F "$ASSET_NAME" | awk '{print $1}' || true)
  if [ -n "$EXPECTED_HASH" ]; then
    if command -v sha256sum >/dev/null 2>&1; then
      ACTUAL_HASH=$(sha256sum "$TMP_FILE" | awk '{print $1}')
    elif command -v shasum >/dev/null 2>&1; then
      ACTUAL_HASH=$(shasum -a 256 "$TMP_FILE" | awk '{print $1}')
    else
      ACTUAL_HASH=""
      warn "sha256sum / shasum not found — skipping checksum verification."
    fi
    if [ -n "$ACTUAL_HASH" ]; then
      if [ "$ACTUAL_HASH" = "$EXPECTED_HASH" ]; then
        success "SHA-256 checksum verified."
      else
        error "SHA-256 mismatch — download may be corrupted."
        warn "Use 'npm install -g hoolix' for provenance-verified installs."
        rm -f "$TMP_FILE" || true
        exit 1
      fi
    fi
  else
    warn "Binary not found in SHA256SUMS — skipping checksum verification."
  fi
else
  warn "SHA256SUMS not available — skipping checksum verification."
  warn "For verified installs: npm install -g hoolix"
fi

# Install
mv "$TMP_FILE" "$TARGET"
chmod +x "$TARGET"
success "Binary installed: $TARGET"

# Verify
if "$TARGET" --version >/dev/null 2>&1; then
  success "Version check passed."
else
  warn "Binary installed but could not execute (check manually)."
fi

# PATH handling
if [ "$NO_PATH_UPDATE" = false ]; then
  if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    warn "Add this line to your shell config (~/.bashrc, ~/.zshrc, etc.):"
    echo ""
    echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo ""
    warn "Then restart your terminal or run: source ~/.zshrc (or equivalent)"
  else
    success "Install directory already in PATH."
  fi
fi

echo ""
success "Installation complete!"
echo ""
echo "Next steps:"
echo "  hoolix --help"
echo "  hoolix doctor"
echo "  hoolix create \"My Docs\" --url https://example.com/llms.txt --yes"
echo ""
echo "Full documentation: https://github.com/$REPO"
