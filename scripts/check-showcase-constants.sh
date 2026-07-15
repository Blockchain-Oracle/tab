#!/bin/sh
set -eu

pattern='atlas|ATL-|maya\.chen|atlascoffee|searchgrid|arxival|mapgrid|lexiconapi|newswire|datamall|research\.lab|Research Agent v2|0x7F3a|TAB-7B4A2|482913|9wKpQ2|abu@example|0x8f2e6c1a|1783088581|leash provision|@leash/mcp'

if grep -rniEI \
  --binary-files=without-match \
  --exclude-dir=node_modules \
  --exclude-dir=.next \
  --exclude-dir=dist \
  --exclude-dir=.turbo \
  --exclude-dir=coverage \
  "$pattern" apps packages; then
  printf '%s\n' "ERROR: Fabricated showcase constant found in product source." >&2
  exit 1
fi
