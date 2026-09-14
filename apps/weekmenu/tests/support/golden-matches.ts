/**
 * Ground truth for product → canonical ingredient matching.
 *
 * Every line is a real product name from the Albert Heijn data in the
 * Checkjebon snapshot of 14 September 2026, paired with the canonical
 * ingredient a matcher might map it to, and labelled by hand.
 *
 * The labels are a judgement about *substitutability in a recipe*, not about
 * language. "AH Gesneden uien" is an onion that someone else chopped; "Verkade
 * shuttles kaas & ui" is a biscuit. Both contain the word.
 *
 *   VALID     a recipe asking for this ingredient can use this product
 *   INVALID   it cannot — a different food, or altered past substitution
 *   AMBIGUOUS a reasonable person could argue either way, so the matcher must
 *             not decide it alone: anything here belongs in review
 *
 * The rule the labels follow, stated once so it can be argued with:
 *
 *   - brand and shop qualifiers never change the answer (Conimex Sojasaus is
 *     soy sauce; AH Terra Tempeh is tempeh)
 *   - preparation that preserves the food keeps it valid (sliced, grated,
 *     peeled, unsalted, organic, lactose-free, low-salt, 0% fat)
 *   - a different food noun makes it invalid however much it shares (cake,
 *     wafel, quiche, worst, verspakket, maaltijdhapje, salade, boreks)
 *   - an added flavour or second ingredient makes a base ingredient invalid
 *     (kwark met aardbei is not kwark for a recipe that adds its own)
 *   - cooked-and-ready versions of raw ingredients are ambiguous, not valid:
 *     grilled chicken is chicken, and not what a recipe frying chicken wants
 *
 * AMBIGUOUS is deliberately used sparingly. It is not a dustbin for hard cases;
 * it is reserved for products where the honest answer is "it depends on the
 * recipe", and its only purpose is to keep them out of the automatic tier.
 */

export type GoldenLabel = 'VALID' | 'INVALID' | 'AMBIGUOUS';

export interface GoldenExample {
  readonly productName: string;
  readonly ingredientId: string;
  readonly label: GoldenLabel;
}

/** `label | product name | canonical ingredient id` */
const CORPUS = `
V|AH Biologisch Bloemkool|bloemkool
V|AH Bloemkool roosjes|bloemkool
I|AH Braadworst bloemkool|bloemkool
I|AH Biologisch Groentehapje bloemkool 6m+|bloemkool
A|AH Bloemkool broccoli kleinverpakking|bloemkool
V|AH Biologisch Boerenkool|boerenkool
V|AH Biologisch Boerenkool deelblokjes|boerenkool
V|AH Boerenkool kleinverpakking|boerenkool
I|AH Hollandse stamppot boerenkool rookworst|boerenkool
I|AH Verse stamppot boerenkool|boerenkool
V|AH Bosui|bosui
V|AH Biologisch Broccoli|broccoli
I|AH Biologisch Groentehapje broccoli stamppotje 6+|broccoli
I|AH Biologisch Maaltijdhapje wortels broccoli pasta 8+|broccoli
I|AH Pluche broccoli|broccoli
I|AH Quiche broccoli kaas|broccoli
V|AH Terra Hollandse bruine bonen|bruine-bonen
V|AH Terra Biologisch hollandse bruine bonen|bruine-bonen
V|AH Biologisch Volkoren bulgur|bulgur
V|Duru Bulgur grof|bulgur
I|Olvarit Hutspot met bulgur en linzen 12m+|bulgur
V|AH Biologisch Cashewnoten ongezouten|cashewnoten
V|AH Biologisch Cashewnoten ongebrand|cashewnoten
V|AH Biologisch Cashewnoten gezouten|cashewnoten
V|AH Witte champignons|champignons
V|AH Champignons gesneden|champignons
V|AH Gesneden champignons|champignons
I|AH Gesneden verspakket orzo champignons|champignons
I|AH Luxe wok Japans champignons peultjes|champignons
V|AH Biologisch Cherrytomaten|cherrytomaat
V|AH Sweet cherry cherrytomaten|cherrytomaat
V|AH Citroen|citroen
V|AH Biologisch Citroenen|citroen
I|AH Bruisend mineraalwater citroen|citroen
I|AH Bruisend mineraalwater citroen 6-pack|citroen
V|AH Biologisch Courgette|courgette
I|AH Courgette spaghetti|courgette
I|AH Culi's Gnocchi Courgette Verspakket|courgette
I|Bonduelle Pasta pronto fusilli courgette broccoli|courgette
I|AH Biologisch Groentehapje pastinaak courgette 8+|courgette
V|AH Biologisch Couscous|couscous
I|AH Biologisch Couscous met gemengde groente 6m+|couscous
I|AH Biologisch Maaltijdhapje couscous pastinaak kip 6+|couscous
V|AH Biologisch Creme fraiche|creme-fraiche
V|AH Creme fraiche 30% vet|creme-fraiche
V|AH Creme fraiche light 15% vet|creme-fraiche
V|AH Biologisch Eieren S M L|ei
V|AH Scharreleieren|ei
I|AH Advocaat van scharreleieren|ei
V|AH Terra Biologische falafel|falafel
A|AH Terra Falafel pikant|falafel
V|Garden Gourmet Falafel|falafel
V|AH Griekse feta|feta
V|AH Biologisch Griekse feta|feta
V|AH Griekse feta 2-pack|feta
I|AH Diepvries spinazie feta boreks|feta
V|AH Biologisch Garnalen|garnalen
V|AH Biologisch Garnalen rauw en gepeld|garnalen
A|AH Cocktail garnalen|garnalen
V|AH Biologisch Half-om-half gehakt|gehakt-half
V|AH Biologisch Rundergehakt|gehakt-rund
V|AH Biologisch Mager rundergehakt|gehakt-rund
V|AH Greenfields Rundergehakt|gehakt-rund
A|AH Biologisch Rundergehakt balletjes|gehakt-rund
I|AH Ginger power verse gember appel citroen|gember
I|AH Hot ginger 75% gember verse gember appel|gember
V|AH Biologisch Gerookte zalm|gerookte-zalm
V|AH Gerookte zalm 30% verlaagd in zout|gerookte-zalm
I|AH Excellent Gerookte zalm salade|gerookte-zalm
I|AH Maaltijdsalade gerookte zalm|gerookte-zalm
V|Dodoni Griekse yoghurt 0% vet|griekse-yoghurt
V|Dodoni Griekse yoghurt 5% vet|griekse-yoghurt
V|AH Honing|honing
V|AH Honing vloeibaar mild en zoet|honing
I|AH Geitenkaas honing 40+|honing
I|AH Gepofte tarwe met honing|honing
V|AH IJsbergsla|ijsbergsla
V|AH Fijngesneden ijsbergsla|ijsbergsla
V|AH IJsbergsla fijngesneden|ijsbergsla
A|AH IJsbergsla melange|ijsbergsla
I|AH Grillworst met Italiaanse kruiden kaas|italiaanse-kruiden
I|AH Mini maiswafels Italiaanse kruiden|italiaanse-kruiden
V|Euroma Italiaanse kruiden vriesdroog|italiaanse-kruiden
I|Calvé Salademix Italiaanse kruiden 3-pack|italiaanse-kruiden
V|AH Kabeljauwfilet|kabeljauw
A|AH Kabeljauwfilet Provencaals|kabeljauw
V|Mama's Kabeljauwfilet|kabeljauw
V|AH Kaneel gemalen|kaneel
I|AH Appelmoes kaneel 0% suiker toegevoegd|kaneel
I|AH Biologisch Rode kool met peertjes en kaneel|kaneel
I|AH Biologisch Kruiden kaneel munt|kaneel
V|Verstegen Kerriepoeder|kerriepoeder
V|AH Ketjap manis|ketjap
V|Conimex Ketjap manis|ketjap
V|BioFan Ketjap manis|ketjap
V|AH Terra Biologisch kidneybonen|kidneybonen
V|AH Kipfilet|kipfilet
V|AH Biologisch Scharrel kipfilet|kipfilet
V|AH Kipfilet naturel|kipfilet
I|AH Kipfiletreepjes shoarma|kipfilet
A|Iglo Ping & klaar gegrilde kipfilet|kipfilet
A|Streeckgenoten Ovengebakken kipfilet|kipfilet
I|AH Kipfilet salade|kipfilet
V|AH Knoflook|knoflook
V|AH Biologisch Knoflook|knoflook
I|AH Knoflook croutons|knoflook
I|AH Knoflooksaus|knoflook
I|AH Stokbrood knoflook|knoflook
V|AH Biogarde magere kwark|kwark
V|AH Lactosevrije magere kwark|kwark
I|AH Magere kwark met magere yoghurt aardbei|kwark
I|AH Magere kwark met magere yoghurt vanille|kwark
I|AH Magere kwark mager yoghurt stracciatella|kwark
V|AH Melk halfvol|melk
V|AH Houdbare halfvolle melk|melk
I|AH Chocolademelk|melk
I|AH Melkchocolade reep|melk
V|AH Mosterd mild|mosterd
V|AH Dijon mosterd|mosterd
I|AH Mosterdsoep|mosterd
V|AH Olijfolie traditioneel|olijfolie
V|AH Biologisch Olijfolie extra vierge|olijfolie
I|AH Olijfolie mayonaise|olijfolie
V|AH Oregano|oregano
V|Euroma Oregano gedroogd|oregano
V|AH Paprika rood|paprika-rood
V|AH Biologisch Rode paprika|paprika-rood
A|AH Gegrilde rode paprika|paprika-rood
I|AH Luchtige boter gegrilde paprika|paprika-rood
I|AH Paprika rijstzoutjes gezouten|paprika-rood
I|AH Paprika chips|paprika-rood
V|AH Parmigiano reggiano|parmezaan
V|AH Geraspte parmezaan|parmezaan
I|AH Parmezaan crackers|parmezaan
V|AH Passata|passata
A|AH Biologisch Passata di pomodoro fijn gekruid|passata
V|AH Paneermeel|paneermeel
V|AH Paneermeel naturel beschuit|paneermeel
V|AH Prei|prei
V|AH Fijngesneden prei|prei
I|AH Preisoep|prei
V|AH Biologisch Quinoa|quinoa
I|AH Biologisch Rijstwafels quinoa|quinoa
V|AH Witte rijst|witte-rijst
V|AH Biologisch Witte rijst|witte-rijst
I|AH Rijstwafels naturel|witte-rijst
I|AH Rijstzoutjes|witte-rijst
V|AH Roomboter ongezouten|roomboter
V|AH Roomboter gezouten|roomboter
I|AH Roomboter cake|roomboter
I|AH Roomboter custardcakes|roomboter
I|AH Diepvries roomboter appelflappen|roomboter
I|AH Roomboter croissant|roomboter
V|AH Kookroom 20%|kookroom
V|AH Rode ui|rode-ui
V|AH Gesneden rode uien|rode-ui
V|AH Biologisch Rode uien|rode-ui
V|AH Gele uien|ui
V|AH Gesneden uien|ui
V|AH Gesneden uien grootverpakking|ui
V|AH Uien|ui
I|Verkade Ovengebakken shuttles kaas & ui|ui
I|AH Uiensoep|ui
I|AH Uienringen diepvries|ui
V|AH Rundergehakt|gehakt-rund
V|AH Runderstoofvlees|runderstoof
V|AH Biologisch Runderriblappen|runderstoof
I|AH Runderstoofpotje kant en klaar|runderstoof
V|AH Spaghetti|spaghetti
V|AH Biologisch Spaghetti|spaghetti
I|AH Spaghetti bolognese maaltijd|spaghetti
V|AH Sperziebonen|sperziebonen
V|AH Gebroken sperziebonen|sperziebonen
V|AH Verse spinazie|spinazie
V|AH Babyspinazie|spinazie
V|AH Bladspinazie|spinazie
I|AH Spinazie a la creme diepvries|spinazie
I|AH Diepvries spinazie feta boreks|spinazie
V|AH Spitskool|spitskool
V|AH Gesneden spitskool|spitskool
V|AH Fijngesneden spitskool|spitskool
V|Conimex Sojasaus|sojasaus
V|Kikkoman Sojasaus|sojasaus
V|Kikkoman Sojasaus minder zout|sojasaus
V|Go-Tan Sojasaus|sojasaus
V|Fairtrade Original Biologische sojasaus|sojasaus
V|AH Tomatenpuree|tomatenpuree
V|AH Biologisch Tomatenpuree|tomatenpuree
V|AH Tomatenblokjes|tomatenblokjes
V|AH Biologisch Tomatenblokjes|tomatenblokjes
V|AH Tomaat|tomaat
V|AH Biologisch Tomaten|tomaat
I|AH Tomatensoep|tomaat
I|AH Tomatenketchup|tomaat
I|AH Gedroogde tomaten in olie|tomaat
V|AH Terra Tempeh|tempeh
A|AH Terra Tempeh ketjap|tempeh
V|AH Terra Biologische tofu|tofu
A|AH Terra Bio tofureepjes mild gekruid|tofu
V|AH Wortelen|wortel
V|AH Biologisch Winterpeen|wortel
I|AH Wortelsap|wortel
I|AH Biologisch Maaltijdhapje wortels broccoli pasta 8+|wortel
V|AH Zonnebloemolie|zonnebloemolie
V|AH Zout fijn|zout
I|AH Dikke rijstwafels zonder toegevoegd zout|zout
I|AH Gezouten pinda's|zout
V|AH Varkenshaas|varkenshaas
A|AH Varkenshaas culinair gekruid|varkenshaas
V|AH Spekblokjes|spekblokjes
V|AH Gerookte spekblokjes|spekblokjes
V|AH Geraspte belegen kaas|geraspte-kaas
V|AH Goudse belegen geraspte kaas 48+|geraspte-kaas
V|AH Cheddar geraspte kaas|geraspte-kaas
I|AH Geraspte kaas speciaal voor pizza|geraspte-kaas
V|AH Groentebouillon|groentebouillon
V|Maggi Groentebouillonblokjes|groentebouillon
V|AH Andijvie|andijvie
V|AH Andijvie gesneden|andijvie
V|AH Andijvie fijngesneden grootverpakking|andijvie
I|AH Andijviestamppot vers|andijvie
V|AH Pompoen|pompoen
I|AH Gesneden verspakket mac'n cheese pompoen|pompoen
I|AH Biologisch Maaltijdhapje pompoen rijst & kip 8+|pompoen
V|AH Aardappelen kruimig|aardappel
V|AH Vastkokende aardappelen|aardappel
I|AH Aardappelsalade|aardappel
I|AH Aardappelpuree vers|aardappel
V|AH Bloem|bloem
V|AH Patent tarwebloem|bloem
I|AH Digestive volkoren met tarwebloem|bloem
V|AH Wraps tarwe|wraps
V|Santa Maria Tortilla wraps|wraps
V|AH Pitabroodjes|pitabrood
V|AH Mie|mie
V|Conimex Mie|mie
I|AH Mie goreng maaltijdmix|mie
V|AH Tonijnsteak|tonijnsteak
V|AH Blauwe kaas|blauwe-kaas
V|AH Danish blue|blauwe-kaas
V|AH Appel elstar|appel
V|AH Biologisch Appels jonagold|appel
I|AH Appelmoes|appel
I|AH Appeltaart|appel
V|AH Witte wijnazijn|azijn
V|AH Biologisch Witte wijnazijn|azijn
V|AH Komijn gemalen|komijn
V|Verstegen Komijnpoeder|komijn
V|AH Verse peterselie|verse-peterselie
V|AH Peterselie|verse-peterselie
V|AH Rode peper|rode-peper
V|AH Zilvervliesrijst|zilvervliesrijst
V|AH Biologisch Zilvervlies rijst|zilvervliesrijst
`;

export const GOLDEN_EXAMPLES: readonly GoldenExample[] = CORPUS.trim()
  .split('\n')
  .map((line) => {
    const [code, productName, ingredientId] = line.split('|');
    const label: GoldenLabel = code === 'V' ? 'VALID' : code === 'I' ? 'INVALID' : 'AMBIGUOUS';
    return { productName: productName!.trim(), ingredientId: ingredientId!.trim(), label };
  });
