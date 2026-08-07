import type { CocoClass } from "./cocoClasses.js";

/**
 * Classes COCO que a limpeza automática pode APAGAR da imagem.
 *
 * Por que esta lista existe separada de `objectCategoryMapping.ts`: aquele
 * mapeamento alimenta o relatório e o Property Score, onde listar um item é
 * barato e reversível. Aqui a ação é destrutiva — some pixel do vídeo do
 * cliente. As duas coisas merecem listas diferentes, e esta é
 * deliberadamente mais curta.
 *
 * O critério é "objeto solto que ninguém compra junto com o imóvel": louça,
 * comida, pertences pessoais, eletrônicos de mão. Fica de fora tudo que
 * *ajuda a vender* — planta, vaso, quadro, relógio, TV —, porque removê-los
 * piora o anúncio em vez de melhorar. Aprendido na prática: uma versão
 * anterior apagava planta e lustre e o resultado ficou pior que o original.
 *
 * Móvel, eletrodoméstico, pessoa, animal e veículo nunca chegam aqui.
 */
const REMOVABLE_FOR_CLEANING: ReadonlySet<CocoClass> = new Set<CocoClass>([
  // Louça e utensílios
  "bottle",
  "wine glass",
  "cup",
  "bowl",
  "fork",
  "knife",
  "spoon",

  // Comida à mostra
  "banana",
  "apple",
  "sandwich",
  "orange",
  "broccoli",
  "carrot",
  "hot dog",
  "pizza",
  "donut",
  "cake",

  // Pertences pessoais largados
  "backpack",
  "handbag",
  "suitcase",
  "umbrella",
  "tie",
  "book",

  // Eletrônicos de mão (a TV fica: é benfeitoria, não bagunça)
  "laptop",
  "mouse",
  "keyboard",
  "remote",
  "cell phone",

  // Higiene e miudezas de bancada
  "toothbrush",
  "hair drier",
  "scissors",

  // Brinquedos e material esportivo pelo chão
  "teddy bear",
  "sports ball",
  "skateboard",
  "frisbee",
  "kite",
  "baseball bat",
  "baseball glove",
  "tennis racket",
  "skis",
  "snowboard",
  "surfboard",
]);

export function isRemovableForCleaning(cocoClass: CocoClass): boolean {
  return REMOVABLE_FOR_CLEANING.has(cocoClass);
}
