#!/usr/bin/env node
// electron-rebuild/@electron/rebuild (usado internamente pelo
// electron-builder com npmRebuild:true) baixa o prebuild ERRADO de
// better-sqlite3 neste tipo de ambiente (ABI do Node em vez do Electron,
// mesmo com o alvo certo pedido) — por isso `npmRebuild: false` no
// electron-builder.yml e este fix manual e direto antes de empacotar.
// Ver docs/PACKAGING.md.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);
const electronPackageJson = require("electron/package.json");
const electronVersion = electronPackageJson.version;

const betterSqlite3PackageJsonPath = require.resolve("better-sqlite3/package.json");
const betterSqlite3Dir = dirname(betterSqlite3PackageJsonPath);

console.log(`Corrigindo ABI nativo de better-sqlite3 para Electron ${electronVersion} em ${betterSqlite3Dir}`);

execFileSync(
  "npx",
  ["prebuild-install", "--runtime=electron", `--target=${electronVersion}`, "--arch=x64", "--platform=linux"],
  { cwd: betterSqlite3Dir, stdio: "inherit" },
);
