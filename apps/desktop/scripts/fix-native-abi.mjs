#!/usr/bin/env node
// electron-rebuild/@electron/rebuild (usado internamente pelo
// electron-builder com npmRebuild:true) baixa o prebuild ERRADO de
// better-sqlite3 neste tipo de ambiente (ABI do Node em vez do Electron,
// mesmo com o alvo certo pedido) — por isso `npmRebuild: false` no
// electron-builder.yml e este fix manual e direto antes de empacotar.
// Ver docs/PACKAGING.md.
//
// IMPORTANTE: plataforma/arquitetura vêm de `process.platform`/`process.arch`
// (a máquina que está rodando ESTE script agora), nunca hardcoded — bug real
// encontrado quando um usuário testou o pacote gerado neste sandbox Linux
// num Mac de verdade: o valor fixo `--platform=linux` de uma versão anterior
// deste script instalava um binário ELF do Linux dentro do pacote Mac,
// crashando com `dlopen ... not a mach-o file` ao abrir o app de verdade.
// Um único run deste script só corrige o binário nativo pra UMA
// plataforma/arquitetura por vez (a do host atual) — gerar pacotes de mais
// de uma arquitetura (ex: mac x64 + arm64 no mesmo `electron-builder` run)
// deixa a arquitetura que não bate com o host com o binário nativo ERRADO.
// Ver "Sétimo problema real" em docs/PACKAGING.md.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);
const electronPackageJson = require("electron/package.json");
const electronVersion = electronPackageJson.version;

const betterSqlite3PackageJsonPath = require.resolve("better-sqlite3/package.json");
const betterSqlite3Dir = dirname(betterSqlite3PackageJsonPath);

const platform = process.env["DIGIFY_NATIVE_PLATFORM"] ?? process.platform;
const arch = process.env["DIGIFY_NATIVE_ARCH"] ?? process.arch;

console.log(
  `Corrigindo ABI nativo de better-sqlite3 para Electron ${electronVersion} (${platform}/${arch}) em ${betterSqlite3Dir}`,
);

execFileSync(
  "npx",
  ["prebuild-install", "--runtime=electron", `--target=${electronVersion}`, `--arch=${arch}`, `--platform=${platform}`],
  { cwd: betterSqlite3Dir, stdio: "inherit" },
);
