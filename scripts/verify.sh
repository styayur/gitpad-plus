#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm --filter @gitpad-plus/sdk build
dotnet restore tests/dotnet/GitPadPlus.Core.Tests.csproj --locked-mode
dotnet test tests/dotnet/GitPadPlus.Core.Tests.csproj --no-restore -c Release --logger 'trx;LogFileName=core.trx' --results-directory artifacts/dotnet
pnpm test:ui
pnpm audit --json > artifacts/npm-audit.json
dotnet list src/GitPadPlus.Core/GitPadPlus.Core.csproj package --vulnerable --include-transitive --format json > artifacts/nuget-audit.json
dotnet list src/GitPadPlus.Core/GitPadPlus.Core.csproj package --include-transitive --format json > artifacts/nuget-audit.inventory.json
node scripts/security-gate.mjs
node scripts/licenses.mjs
