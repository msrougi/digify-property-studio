import type { ObjectCategory } from "@digify/domain";
import type { CocoClass } from "./cocoClasses.js";

/**
 * Mapeia as 80 classes do COCO para as categorias do domínio
 * (docs/reference/original-docs/08 - AI Agents.md, "AI Object Recognition").
 *
 * Só `temporary` é removível por padrão (packages/domain/src/entities/DetectedObject.ts).
 * Móveis e eletrodomésticos fixos (mesmo não sendo "estruturais" no sentido de
 * parede/porta/janela) vão para `decorative` — nunca removíveis, conforme
 * "Nunca remover: móveis, eletrodomésticos fixos" do catálogo original.
 *
 * O COCO não tem classes de "structural" (parede/porta/janela) nem de
 * "luxury" muito específicas — mapeamento é uma primeira aproximação
 * razoável, revisável quando tivermos dados reais de uso.
 */
const CATEGORY_BY_COCO_CLASS: Record<CocoClass, ObjectCategory> = {
  // Móveis e eletrodomésticos fixos — nunca removíveis.
  chair: "decorative",
  couch: "decorative",
  bed: "decorative",
  "dining table": "decorative",
  toilet: "decorative",
  sink: "decorative",
  refrigerator: "decorative",
  oven: "decorative",
  microwave: "decorative",
  toaster: "decorative",
  bench: "decorative",

  // Decoração fixa.
  "potted plant": "decorative",
  vase: "decorative",
  clock: "decorative",
  book: "decorative",
  "teddy bear": "decorative",

  // Eletrônicos de valor — luxury.
  tv: "luxury",
  laptop: "luxury",
  "wine glass": "luxury",
  skis: "luxury",
  snowboard: "luxury",
  surfboard: "luxury",

  // Pertences pessoais / bagunça temporária — candidatos reais a remoção.
  backpack: "temporary",
  umbrella: "temporary",
  handbag: "temporary",
  suitcase: "temporary",
  tie: "temporary",
  bottle: "temporary",
  cup: "temporary",
  bowl: "temporary",
  fork: "temporary",
  knife: "temporary",
  spoon: "temporary",
  banana: "temporary",
  apple: "temporary",
  sandwich: "temporary",
  orange: "temporary",
  broccoli: "temporary",
  carrot: "temporary",
  "hot dog": "temporary",
  pizza: "temporary",
  donut: "temporary",
  cake: "temporary",
  remote: "temporary",
  "cell phone": "temporary",
  mouse: "temporary",
  keyboard: "temporary",
  scissors: "temporary",
  toothbrush: "temporary",
  "hair drier": "temporary",
  "sports ball": "temporary",
  skateboard: "temporary",
  frisbee: "temporary",
  kite: "temporary",
  "baseball bat": "temporary",
  "baseball glove": "temporary",
  "tennis racket": "temporary",

  // Pessoas e animais — nunca candidatos a remoção automática.
  person: "personal",
  cat: "personal",
  dog: "personal",
  bird: "personal",
  horse: "personal",
  sheep: "personal",
  cow: "personal",
  elephant: "personal",
  bear: "personal",
  zebra: "personal",
  giraffe: "personal",

  // Veículos — não se encaixam bem em nenhuma categoria do domínio hoje;
  // tratados como "personal" (nunca removíveis automaticamente) até o
  // domínio ganhar uma categoria própria.
  bicycle: "personal",
  car: "personal",
  motorcycle: "personal",
  airplane: "personal",
  bus: "personal",
  train: "personal",
  truck: "personal",
  boat: "personal",
  "traffic light": "personal",
  "fire hydrant": "personal",
  "stop sign": "personal",
  "parking meter": "personal",
};

export function mapCocoClassToObjectCategory(cocoClass: CocoClass): ObjectCategory {
  return CATEGORY_BY_COCO_CLASS[cocoClass];
}
