import type { NutritionPer100 } from '@/domain/nutrition/facts';

/**
 * Generic nutrition per 100 g (or per 100 ml for liquids), for every canonical
 * ingredient in the catalogue.
 *
 * These are plausible values for the raw or as-sold product, in the shape a
 * source like NEVO publishes. They are DEMO DATA: good enough to make portion
 * scaling and product comparison behave realistically, not a substitute for a
 * verified food-composition database. `NutritionDataProvider` is the seam where
 * a real source replaces them.
 *
 * Order of arguments: kcal, protein, carbohydrates, sugars, fat, saturated fat,
 * fibre, salt — all in grams except kcal.
 */
function n(
  kcal: number,
  protein: number,
  carbohydrates: number,
  sugars: number,
  fat: number,
  saturatedFat: number,
  fiber: number,
  salt: number,
): NutritionPer100 {
  return { kcal, protein, carbohydrates, sugars, fat, saturatedFat, fiber, salt };
}

export const INGREDIENT_NUTRITION_PER_100: Readonly<Record<string, NutritionPer100>> = {
  // ---- Groente & fruit ----------------------------------------------------
  ui: n(40, 1.1, 9.3, 4.2, 0.1, 0.04, 1.7, 0.01),
  'rode-ui': n(42, 1.2, 9.5, 4.9, 0.1, 0.04, 1.7, 0.01),
  knoflook: n(149, 6.4, 33, 1.0, 0.5, 0.09, 2.1, 0.04),
  wortel: n(41, 0.9, 9.6, 4.7, 0.2, 0.03, 2.8, 0.17),
  broccoli: n(34, 2.8, 6.6, 1.7, 0.4, 0.04, 2.6, 0.08),
  bloemkool: n(25, 1.9, 5.0, 1.9, 0.3, 0.13, 2.0, 0.08),
  courgette: n(17, 1.2, 3.1, 2.5, 0.3, 0.08, 1.0, 0.02),
  aubergine: n(25, 1.0, 5.9, 3.5, 0.2, 0.03, 3.0, 0.01),
  'paprika-rood': n(31, 1.0, 6.0, 4.2, 0.3, 0.06, 2.1, 0.01),
  'paprika-geel': n(27, 1.0, 6.3, 4.9, 0.2, 0.03, 0.9, 0.01),
  tomaat: n(18, 0.9, 3.9, 2.6, 0.2, 0.03, 1.2, 0.01),
  cherrytomaat: n(20, 0.9, 4.0, 3.0, 0.2, 0.03, 1.3, 0.01),
  champignons: n(22, 3.1, 3.3, 2.0, 0.3, 0.05, 1.0, 0.01),
  spinazie: n(23, 2.9, 3.6, 0.4, 0.4, 0.06, 2.2, 0.2),
  sperziebonen: n(31, 1.8, 7.0, 3.3, 0.1, 0.03, 2.7, 0.01),
  prei: n(61, 1.5, 14, 3.9, 0.3, 0.04, 1.8, 0.05),
  aardappel: n(77, 2.0, 17, 0.8, 0.1, 0.03, 2.2, 0.01),
  'zoete-aardappel': n(86, 1.6, 20, 4.2, 0.1, 0.02, 3.0, 0.14),
  komkommer: n(15, 0.7, 3.6, 1.7, 0.1, 0.04, 0.5, 0.01),
  ijsbergsla: n(14, 0.9, 3.0, 1.8, 0.1, 0.02, 1.2, 0.02),
  rucola: n(25, 2.6, 3.7, 2.1, 0.7, 0.09, 1.6, 0.07),
  avocado: n(160, 2.0, 8.5, 0.7, 15, 2.1, 6.7, 0.02),
  citroen: n(29, 1.1, 9.3, 2.5, 0.3, 0.04, 2.8, 0.01),
  limoen: n(30, 0.7, 11, 1.7, 0.2, 0.02, 2.8, 0.01),
  spitskool: n(25, 1.3, 5.8, 3.2, 0.1, 0.03, 2.5, 0.05),
  boerenkool: n(49, 4.3, 8.8, 2.3, 0.9, 0.09, 3.6, 0.09),
  andijvie: n(17, 1.3, 3.4, 0.3, 0.2, 0.05, 3.1, 0.05),
  pompoen: n(26, 1.0, 6.5, 2.8, 0.1, 0.05, 0.5, 0.01),
  doperwten: n(81, 5.4, 14, 5.7, 0.4, 0.07, 5.1, 0.01),
  bosui: n(32, 1.8, 7.3, 2.3, 0.2, 0.03, 2.6, 0.04),
  gember: n(80, 1.8, 18, 1.7, 0.8, 0.2, 2.0, 0.03),
  tauge: n(30, 3.0, 5.9, 4.1, 0.2, 0.05, 1.8, 0.02),
  snijbonen: n(31, 1.8, 7.0, 3.3, 0.1, 0.03, 2.7, 0.01),
  appel: n(52, 0.3, 14, 10, 0.2, 0.03, 2.4, 0.01),
  venkel: n(31, 1.2, 7.3, 3.9, 0.2, 0.07, 3.1, 0.13),
  'rode-peper': n(40, 1.9, 8.8, 5.3, 0.4, 0.04, 1.5, 0.02),

  // ---- Vlees, vis & vervangers -------------------------------------------
  kipfilet: n(106, 22.5, 0, 0, 1.8, 0.5, 0, 0.15),
  kipdijfilet: n(145, 19, 0, 0, 7.5, 2.1, 0, 0.16),
  'gehakt-rund': n(202, 19, 0, 0, 14, 5.9, 0, 0.15),
  'gehakt-half': n(234, 17, 0.5, 0.4, 18, 7.2, 0, 0.3),
  runderstoof: n(152, 21, 0, 0, 7.5, 3.1, 0, 0.14),
  varkenshaas: n(109, 21.5, 0, 0, 2.5, 0.9, 0, 0.14),
  spekblokjes: n(300, 15, 0.5, 0.5, 26, 10, 0, 2.5),
  runderlever: n(129, 20, 3.9, 0, 3.6, 1.2, 0, 0.19),
  zalmfilet: n(208, 20, 0, 0, 13.4, 3.1, 0, 0.12),
  'gerookte-zalm': n(180, 22, 0.5, 0.5, 10, 2.0, 0, 3.0),
  tonijnsteak: n(132, 28, 0, 0, 1.3, 0.4, 0, 0.11),
  kabeljauw: n(82, 18, 0, 0, 0.7, 0.14, 0, 0.2),
  garnalen: n(99, 21, 0.2, 0, 1.7, 0.3, 0, 1.2),
  ei: n(143, 12.6, 0.7, 0.4, 9.5, 3.1, 0, 0.35),
  'vega-gehakt': n(168, 17, 6.0, 1.0, 8.0, 1.0, 3.5, 1.1),
  tofu: n(121, 12, 1.5, 0.6, 7.0, 1.0, 1.0, 0.03),
  tempeh: n(192, 19, 8.0, 1.0, 11, 2.2, 5.0, 0.02),
  falafel: n(233, 8.0, 22, 2.0, 12, 1.6, 6.0, 1.2),

  // ---- Zuivel -------------------------------------------------------------
  melk: n(46, 3.5, 4.7, 4.7, 1.5, 1.0, 0, 0.11),
  yoghurt: n(62, 3.4, 4.5, 4.5, 3.3, 2.2, 0, 0.12),
  'griekse-yoghurt': n(97, 5.0, 3.6, 3.6, 7.0, 4.8, 0, 0.12),
  kookroom: n(195, 2.6, 3.4, 3.4, 19, 13, 0, 0.1),
  'creme-fraiche': n(300, 2.4, 3.0, 3.0, 31, 21, 0, 0.1),
  'geraspte-kaas': n(375, 25, 0.5, 0.5, 30, 20, 0, 1.8),
  parmezaan: n(402, 32, 0.8, 0.8, 30, 19, 0, 1.6),
  mozzarella: n(254, 18, 1.5, 1.0, 20, 13, 0, 0.6),
  feta: n(264, 14, 1.5, 1.0, 22, 15, 0, 2.5),
  'blauwe-kaas': n(353, 21, 2.3, 0.5, 29, 19, 0, 3.5),
  roomboter: n(738, 0.7, 0.6, 0.6, 82, 54, 0, 0.02),
  kwark: n(55, 10, 3.5, 3.5, 0.2, 0.1, 0, 0.1),

  // ---- Brood & granen (droog gewogen) -------------------------------------
  spaghetti: n(356, 12.5, 71, 3.0, 1.5, 0.3, 3.0, 0.01),
  penne: n(356, 12.5, 71, 3.0, 1.5, 0.3, 3.0, 0.01),
  macaroni: n(356, 12.5, 71, 3.0, 1.5, 0.3, 3.0, 0.01),
  lasagnebladen: n(360, 13, 71, 3.0, 2.0, 0.5, 3.0, 0.02),
  'witte-rijst': n(355, 7.0, 78, 0.2, 0.9, 0.2, 1.4, 0.01),
  basmatirijst: n(349, 8.0, 77, 0.2, 0.9, 0.2, 1.3, 0.01),
  zilvervliesrijst: n(353, 7.5, 72, 0.7, 2.7, 0.6, 3.5, 0.01),
  couscous: n(358, 12, 72, 0.5, 1.5, 0.3, 5.0, 0.02),
  bulgur: n(342, 12, 64, 0.4, 1.3, 0.2, 12.5, 0.02),
  quinoa: n(368, 14, 57, 4.6, 6.1, 0.7, 7.0, 0.02),
  mie: n(350, 11, 70, 2.0, 2.0, 0.5, 3.0, 0.6),
  wraps: n(300, 8.0, 50, 2.5, 7.0, 3.0, 3.0, 1.2),
  pitabrood: n(275, 9.0, 53, 1.5, 1.2, 0.3, 2.5, 1.1),
  stokbrood: n(270, 9.0, 52, 2.5, 1.5, 0.4, 2.8, 1.2),
  paneermeel: n(370, 12, 72, 3.5, 3.0, 0.6, 4.0, 1.3),
  bloem: n(341, 10, 71, 1.5, 1.2, 0.2, 2.8, 0.01),

  // ---- Conserven ----------------------------------------------------------
  tomatenblokjes: n(22, 1.2, 3.4, 3.0, 0.2, 0.03, 1.2, 0.05),
  passata: n(32, 1.4, 5.5, 5.0, 0.2, 0.04, 1.5, 0.1),
  tomatenpuree: n(82, 4.3, 13, 11, 0.5, 0.1, 3.0, 0.2),
  kokosmelk: n(185, 1.6, 3.0, 2.5, 18, 16, 0.5, 0.05),
  kikkererwten: n(119, 6.5, 15, 0.8, 2.5, 0.3, 5.5, 0.35),
  kidneybonen: n(105, 7.0, 14, 0.6, 0.5, 0.1, 6.5, 0.35),
  'bruine-bonen': n(105, 7.0, 14, 0.6, 0.5, 0.1, 6.5, 0.35),
  'zwarte-bonen': n(110, 7.5, 15, 0.5, 0.6, 0.1, 6.8, 0.35),
  linzen: n(116, 9.0, 15, 0.6, 0.4, 0.1, 5.5, 0.3),
  mais: n(86, 3.0, 16, 4.5, 1.2, 0.2, 2.5, 0.35),
  'tonijn-blik': n(116, 26, 0, 0, 1.0, 0.3, 0, 0.9),
  olijven: n(145, 1.0, 3.8, 0.5, 15, 2.0, 3.3, 3.3),
  'zongedroogde-tomaten': n(213, 5.0, 23, 18, 11, 1.5, 6.0, 2.0),

  // ---- Kruiden, olie & voorraad -------------------------------------------
  zout: n(0, 0, 0, 0, 0, 0, 0, 100),
  peper: n(251, 10, 64, 0.6, 3.3, 1.4, 25, 0.05),
  olijfolie: n(828, 0, 0, 0, 92, 13, 0, 0),
  zonnebloemolie: n(828, 0, 0, 0, 92, 11, 0, 0),
  sojasaus: n(60, 6.0, 5.5, 1.7, 0.1, 0.01, 0.8, 16),
  ketjap: n(250, 3.0, 58, 55, 0.2, 0.05, 0.3, 6.0),
  sambal: n(60, 2.0, 8.0, 4.0, 1.5, 0.2, 2.5, 8.0),
  'rode-currypasta': n(130, 3.0, 18, 8.0, 4.0, 1.5, 4.0, 8.5),
  paprikapoeder: n(282, 14, 54, 10, 13, 2.1, 35, 0.07),
  komijn: n(375, 18, 44, 2.3, 22, 1.5, 11, 0.42),
  kerriepoeder: n(325, 14, 58, 2.8, 14, 2.3, 33, 0.13),
  kurkuma: n(312, 9.7, 67, 3.2, 3.3, 1.8, 22, 0.07),
  'italiaanse-kruiden': n(265, 9.0, 50, 2.0, 7.0, 2.0, 30, 0.1),
  oregano: n(265, 9.0, 69, 4.1, 4.3, 1.6, 42, 0.06),
  chilipoeder: n(282, 12, 50, 7.2, 14, 2.5, 35, 2.9),
  kaneel: n(247, 4.0, 81, 2.2, 1.2, 0.3, 53, 0.03),
  groentebouillon: n(180, 8.0, 22, 8.0, 6.0, 3.0, 1.0, 48),
  'verse-peterselie': n(36, 3.0, 6.3, 0.9, 0.8, 0.13, 3.3, 0.14),
  'verse-basilicum': n(23, 3.2, 2.7, 0.3, 0.6, 0.04, 1.6, 0.01),
  'verse-koriander': n(23, 2.1, 3.7, 0.9, 0.5, 0.01, 2.8, 0.11),
  mosterd: n(66, 4.4, 5.8, 1.5, 3.3, 0.2, 3.3, 3.5),
  honing: n(304, 0.3, 82, 82, 0, 0, 0.2, 0.01),
  pindakaas: n(588, 25, 20, 9.0, 50, 10, 6.0, 1.0),
  sesamzaad: n(573, 18, 23, 0.3, 50, 7.0, 12, 0.03),
  walnoten: n(654, 15, 14, 2.6, 65, 6.1, 6.7, 0.01),
  cashewnoten: n(553, 18, 30, 5.9, 44, 7.8, 3.3, 0.03),
  azijn: n(19, 0.1, 0.4, 0.4, 0, 0, 0, 0.01),
};
