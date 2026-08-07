import { describe, expect, it } from "vitest";
import { COCO_CLASSES, type CocoClass } from "../cocoClasses.js";
import { mapCocoClassToObjectCategory } from "../objectCategoryMapping.js";
import { isRemovableForCleaning } from "../removableForCleaning.js";

/**
 * Classes que NUNCA podem ser apagadas automaticamente. Errar aqui não é um
 * detalhe de qualidade: é apagar a cama, a pia ou uma pessoa do vídeo do
 * cliente.
 */
const JAMAIS_REMOVIVEL: CocoClass[] = [
  // Móveis e eletrodomésticos — o pedido explícito foi "deixar só os móveis e
  // eletrodomésticos".
  "bed",
  "couch",
  "chair",
  "dining table",
  "bench",
  "toilet",
  "sink",
  "refrigerator",
  "oven",
  "microwave",
  "toaster",
  // Decoração que VALORIZA o anúncio. Uma versão anterior apagava a planta e o
  // resultado ficou pior que o original.
  "potted plant",
  "vase",
  "clock",
  "tv",
  // Pessoas e animais.
  "person",
  "cat",
  "dog",
  "bird",
  // Veículos.
  "car",
  "bicycle",
  "motorcycle",
  "truck",
];

/** O que o corretor de fato quer fora do quadro. */
const DEVE_SER_REMOVIVEL: CocoClass[] = [
  "bottle",
  "cup",
  "bowl",
  "wine glass",
  "backpack",
  "handbag",
  "suitcase",
  "book",
  "laptop",
  "remote",
  "cell phone",
  "toothbrush",
  "teddy bear",
];

describe("isRemovableForCleaning", () => {
  it.each(JAMAIS_REMOVIVEL)("nunca apaga '%s'", (cocoClass) => {
    expect(isRemovableForCleaning(cocoClass)).toBe(false);
  });

  it.each(DEVE_SER_REMOVIVEL)("apaga '%s'", (cocoClass) => {
    expect(isRemovableForCleaning(cocoClass)).toBe(true);
  });

  it("nunca apaga nada que o domínio trate como pessoa, animal ou veículo", () => {
    // Invariante cruzado com `objectCategoryMapping.ts`: aquela é a fonte de
    // verdade sobre o que é gente/bicho/carro. Se alguém mover uma classe pra
    // lá, esta lista tem que continuar respeitando — sem depender de lembrar.
    const pessoais = COCO_CLASSES.filter(
      (cocoClass) => mapCocoClassToObjectCategory(cocoClass) === "personal",
    );
    expect(pessoais.length).toBeGreaterThan(0);
    expect(pessoais.filter((cocoClass) => isRemovableForCleaning(cocoClass))).toEqual([]);
  });

  it("é uma lista fechada — classe desconhecida entra como protegida", () => {
    // O comportamento seguro diante do inesperado é NÃO apagar.
    expect(isRemovableForCleaning("classe-que-nao-existe" as CocoClass)).toBe(false);
  });
});
