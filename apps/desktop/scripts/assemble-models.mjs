#!/usr/bin/env node
// Remonta modelos grandes demais pra versionar inteiros no GitHub (limite de
// 100MB por arquivo) a partir das partes versionadas em `<modelo>.parts/`.
//
// Motivo real: `lama_inpainting.onnx` (~196MB) não cabe no GitHub nem em
// anexo de chat, então quem clonava o repositório simplesmente não tinha o
// modelo — e `HomeStagingActCapability` caía no fallback `delogo` sem alarde
// nenhum, fazendo o inpainting generativo parecer "não funcionar". Com as
// partes versionadas, um `git clone` + build já entrega o modelo real.
//
// Idempotente: se o arquivo final já existe e o SHA-256 bate, não refaz nada.
// Valida sempre o hash do resultado — remontagem parcial ou parte corrompida
// falha alto, nunca produz um `.onnx` silenciosamente inválido.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MODELS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "models");

function sha256OfFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assemble(partsDir) {
  const manifestPath = join(partsDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    console.warn(`aviso: ${partsDir} sem manifest.json — ignorando`);
    return;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const target = join(MODELS_DIR, manifest.target);

  if (existsSync(target)) {
    if (statSync(target).size === manifest.sizeBytes && sha256OfFile(target) === manifest.sha256) {
      console.log(`${manifest.target}: já presente e íntegro`);
      return;
    }
    console.log(`${manifest.target}: presente mas não bate com o manifest — refazendo`);
    rmSync(target);
  }

  console.log(`${manifest.target}: remontando de ${manifest.parts.length} partes...`);
  writeFileSync(target, Buffer.alloc(0));
  for (const part of manifest.parts) {
    const partPath = join(partsDir, part);
    if (!existsSync(partPath)) {
      rmSync(target, { force: true });
      throw new Error(`parte faltando: ${partPath} (clone incompleto?)`);
    }
    appendFileSync(target, readFileSync(partPath));
  }

  const actual = sha256OfFile(target);
  if (actual !== manifest.sha256) {
    rmSync(target, { force: true });
    throw new Error(
      `${manifest.target}: SHA-256 não bate após remontagem.\n  esperado: ${manifest.sha256}\n  obtido:   ${actual}`,
    );
  }
  console.log(`${manifest.target}: OK (${(manifest.sizeBytes / 1024 / 1024).toFixed(1)} MB, SHA-256 confere)`);
}

if (!existsSync(MODELS_DIR)) {
  console.log("sem diretório de modelos — nada a remontar");
  process.exit(0);
}

const partsDirs = readdirSync(MODELS_DIR)
  .filter((entry) => entry.endsWith(".parts"))
  .map((entry) => join(MODELS_DIR, entry))
  .filter((path) => statSync(path).isDirectory());

if (partsDirs.length === 0) {
  console.log("nenhum modelo dividido em partes — nada a remontar");
  process.exit(0);
}

for (const partsDir of partsDirs) assemble(partsDir);
