import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
const vault = process.env.GITPAD_TEST_VAULT ?? join(tmpdir(), 'gitpad-ui-' + randomUUID());
process.env.GITPAD_TEST_VAULT = vault;
export default defineConfig({
  testDir:'tests/ui',workers:1,fullyParallel:false,timeout:45_000,
  reporter:[['list'],['json',{outputFile:'artifacts/playwright.json'}],['html',{open:'never'}]],
  use:{baseURL:'http://127.0.0.1:5173',trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:[
    {command:'dotnet run --no-launch-profile --project apps/GitPadPlus.DevHost --urls http://127.0.0.1:7342',url:'http://127.0.0.1:7342/health',reuseExistingServer:false,env:{GITPAD_TEST_VAULT:vault},timeout:90_000},
    {command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort',url:'http://127.0.0.1:5173',reuseExistingServer:false},
  ],
});
