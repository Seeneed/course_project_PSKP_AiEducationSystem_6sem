#!/bin/sh
set -eu

CERT_DIR="/etc/nginx/certs"
TLS_CRT="$CERT_DIR/tls.crt"
TLS_KEY="$CERT_DIR/tls.key"
CUSTOM_CRT="$CERT_DIR/custom.crt"
CUSTOM_KEY="$CERT_DIR/custom.key"

mkdir -p "$CERT_DIR"

if [ -f "$CUSTOM_CRT" ] && [ -f "$CUSTOM_KEY" ]; then
  echo "Using trusted local certificate from custom.crt / custom.key (e.g. mkcert)."
  cp "$CUSTOM_CRT" "$TLS_CRT"
  cp "$CUSTOM_KEY" "$TLS_KEY"
elif [ -f "$TLS_CRT" ] && [ -f "$TLS_KEY" ]; then
  echo "Using existing tls.crt / tls.key."
else
  echo "Generating self-signed TLS certificate (browser will show a warning)..."
  openssl req -x509 -nodes -days 365 \
    -newkey rsa:2048 \
    -keyout "$TLS_KEY" \
    -out "$TLS_CRT" \
    -subj "/C=UA/ST=Local/L=Local/O=EducationSystem/OU=Dev/CN=localhost"
fi
