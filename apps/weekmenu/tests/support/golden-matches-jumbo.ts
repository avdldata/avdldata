import type { GoldenExample } from './golden-matches';

/**
 * Ground truth for Jumbo, labelled the same way as the Albert Heijn corpus.
 *
 * A second chain is the real test of whether the matcher generalises or was
 * quietly fitted to one shop's naming habits. Jumbo writes names differently —
 * capitalised words, the pack size appended, far more A-brands — so a matcher
 * that only worked on "AH Biologisch Broccoli" would show up here immediately.
 *
 * Same three labels and the same rule: substitutability in a recipe, not
 * similarity of words. Brand and pack noise never change the answer, a
 * preparation that preserves the food keeps it valid, a different food noun
 * makes it invalid, and anything a reasonable cook would argue about is
 * AMBIGUOUS and belongs in review.
 */

const CORPUS = `
V|Jumbo Biologisch Aubergine 1 Stuk|aubergine
I|Nizhyn Aubergine Puree 450g|aubergine
A|Sera Geroosterde Aubergine 650g|aubergine
V|Jumbo Avocado|avocado
I|Garnier Loving Blends - Conditioner - Avocado Olie & Shea Boter - 250 ml|avocado
I|Jumbo Duo Avocado Dip met Mexicaantjes 140 g|avocado
V|Jumbo Witte Wijnazijn 250 ml|azijn
V|Jumbo Basmatirijst 4,5 kg|basmatirijst
V|Daawat Snelkokende Bruine Basmatirijst 1kg|basmatirijst
I|Lassie Basmatirijst builtje 4 x 75 g|basmatirijst
V|Jumbo Gorgonzola Dolce 200 g|blauwe-kaas
I|Alberto Vriesvers Penne Gorgonzola 350g|blauwe-kaas
V|Jumbo Biologisch Tarwebloem 1 kg|bloem
V|Tarwebloem 1 kg|bloem
V|Efendi Tarwebloem 1KG|bloem
I|Ajax Allesreiniger Rode Bloem 1L|bloem
I|Familie Nijland Honingklaver Bloem 50+ Kaas ca. 300 g|bloem
V|Jumbo Biologische Bloemkool 1 Stuk|bloemkool
V|Jumbo Bloemkool|bloemkool
I|Jumbo Bloemkool Rijst 600 g|bloemkool
I|Jumbo Bloemkool Saucijs 500 g|bloemkool
I|Honig Basis voor Bloemkool Ovenschotel 36 g|bloemkool
V|Jumbo Biologisch Boerenkool 450 g|boerenkool
V|Jumbo Boerenkool 450 g|boerenkool
V|HAK Boerenkool 340 g|boerenkool
I|Jumbo Smoothiemix Green Reviver Boerenkool, Banaan, Mango & Citroengras 250 g|boerenkool
I|Jumbo Stamppot Boerenkool 1 kg|boerenkool
V|Jumbo Bosui|bosui
V|Jumbo Biologisch Broccoli Roosjes 450 g|broccoli
V|Jumbo Biologische Broccoli|broccoli
I|Dalla Costa Veggie Pasta with Spinach, Broccoli and Basil 250 g|broccoli
I|Ella's Kitchen Organic Pears Peas + Broccoli 4m+ 120 g|broccoli
I|Jumbo Kastanjechampignon & Broccoli Ovengroente 600 g|broccoli
V|Bonduelle Bruine bonen 175g|bruine-bonen
V|Jumbo Biologische Bruine Bonen 205 g|bruine-bonen
V|Hak Bruine Bonen 370 g|bruine-bonen
I|Unox Extra Rijkgevuld Soep In Zak Bruine Bonen 570 ml|bruine-bonen
V|Jumbo Bulgur 300 g|bulgur
V|Duru Bulgur Tarwe Grof 1000 g|bulgur
V|Lassie Bio Bulgur 275 g|bulgur
I|Olvarit Hutspot met Bulgur en Kalkoen|bulgur
V|Jumbo Cashewnoten Gezouten 200 g|cashewnoten
V|Jumbo Ongebrande Cashewnoten 140 g|cashewnoten
V|Jumbo Cashewnoten Gezouten Voordeelverpakking 500 g|cashewnoten
V|Jumbo Fijne Champignons 250 g|champignons
V|Jumbo Gesneden Champignons 250 g|champignons
V|Jumbo Biologisch Champignons Middel 250 g|champignons
A|Jumbo Champignons Knoflook 100 g|champignons
I|Dr. Oetker Bistro classique baguette champignons 2 x 125 g|champignons
I|Jumbo's Vriesverse Maaltijd Risotto Champignons 450 g|champignons
V|Jumbo Biologische Cherrytomaten 250 g|cherrytomaat
V|Jumbo Chilipoeder 39 g|chilipoeder
V|Verstegen Chilipoeder 35 g|chilipoeder
V|Jumbo Biologisch Citroen 2 Stuks|citroen
V|Jumbo Citroenen 750 g|citroen
I|Almhof Volle Kwark Citroen 500 g|citroen
I|Cif CleanBoost Schuurmiddel Cream Citroen 750 ml|citroen
I|Amstel Radler Citroen 0.0 Bier Blik 4 x 6 x 330ml|citroen
V|Jumbo Biologisch Courgette|courgette
V|Jumbo Courgette|courgette
I|Jumbo BBQ Pastasalade Fusilli met Tomaat, Paprika en Courgette 300 g|courgette
I|Jumbo Ovengroente Courgette, Paprika & Wortel 600 g|courgette
V|Jumbo Biologisch Couscous 400 g|couscous
V|Dari Couscous Medium 1 kg|couscous
A|Al'Fez Moroccan Spiced Couscous 200 g|couscous
I|Jumbo Marokkaanse Couscous Verspakket 4 Personen|couscous
V|Crème Fraîche 200 g|creme-fraiche
V|Jumbo Kipfilet 300 g|kipfilet
V|Jumbo Biologische Kipfilet 250 g|kipfilet
I|Jumbo Kipfilet Salade 175 g|kipfilet
I|Jumbo Gegrilde Kipfilet Reepjes 120 g|kipfilet
I|Unox Soep in Zak Kipfilet|kipfilet
V|Jumbo Knoflook|knoflook
V|Jumbo Biologische Knoflook 3 Stuks|knoflook
I|Jumbo Knoflooksaus 750 ml|knoflook
I|Jumbo Knoflookbrood 175 g|knoflook
V|Jumbo Rundergehakt 500 g|gehakt-rund
V|Jumbo Biologisch Rundergehakt 300 g|gehakt-rund
I|Jumbo Rundergehaktballen 4 Stuks|gehakt-rund
V|Jumbo Half-om-half Gehakt 500 g|gehakt-half
V|Jumbo Halfvolle Melk 1 L|melk
V|Campina Halfvolle Melk 1 L|melk
I|Jumbo Chocolademelk 1 L|melk
V|Jumbo Mosterd 235 g|mosterd
I|Jumbo Mosterdsoep 570 ml|mosterd
V|Jumbo Olijfolie Extra Vierge 500 ml|olijfolie
V|Bertolli Olijfolie Classico 500 ml|olijfolie
I|Jumbo Olijfolie Mayonaise 650 ml|olijfolie
V|Jumbo Oregano 10 g|oregano
V|Verstegen Oregano 8 g|oregano
V|Jumbo Rode Paprika|paprika-rood
V|Jumbo Biologische Rode Paprika 2 Stuks|paprika-rood
A|Jumbo Gegrilde Paprika 290 g|paprika-rood
I|Jumbo Paprika Chips 185 g|paprika-rood
V|Jumbo Geraspte Parmezaanse Kaas 100 g|parmezaan
V|Grana Padano Parmigiano Reggiano 150 g|parmezaan
V|Jumbo Passata 700 g|passata
V|Jumbo Paneermeel 175 g|paneermeel
V|Jumbo Prei|prei
V|Jumbo Gesneden Prei 300 g|prei
I|Jumbo Preisoep 570 ml|prei
V|Jumbo Quinoa 400 g|quinoa
I|Jumbo Quinoa Crackers 100 g|quinoa
V|Jumbo Witte Rijst 1 kg|witte-rijst
I|Jumbo Rijstwafels Naturel 100 g|witte-rijst
V|Jumbo Roomboter Ongezouten 250 g|roomboter
V|Jumbo Roomboter Gezouten 250 g|roomboter
I|Jumbo Roomboter Cake 400 g|roomboter
I|Jumbo Roomboter Croissants 4 Stuks|roomboter
V|Jumbo Kookroom 20% 250 ml|kookroom
V|Jumbo Rode Ui|rode-ui
V|Jumbo Gesneden Rode Ui 150 g|rode-ui
V|Jumbo Uien 1 kg|ui
V|Jumbo Gele Uien 1 kg|ui
V|Jumbo Gesneden Uien 250 g|ui
I|Jumbo Uienringen Diepvries 750 g|ui
I|Jumbo Uiensoep 570 ml|ui
V|Jumbo Runderstoofvlees 500 g|runderstoof
V|Jumbo Riblappen 500 g|runderstoof
I|Jumbo Runderstoofpotje 400 g|runderstoof
V|Jumbo Spaghetti 500 g|spaghetti
V|Grand'Italia Spaghetti 500 g|spaghetti
I|Jumbo Spaghetti Bolognese Maaltijd 450 g|spaghetti
V|Jumbo Sperziebonen 400 g|sperziebonen
V|HAK Sperziebonen 720 g|sperziebonen
V|Jumbo Verse Spinazie 300 g|spinazie
V|Jumbo Bladspinazie 450 g|spinazie
I|Jumbo Spinazie a la Creme 450 g|spinazie
V|Jumbo Spitskool|spitskool
V|Jumbo Gesneden Spitskool 300 g|spitskool
V|Conimex Sojasaus 250 ml|sojasaus
V|Kikkoman Sojasaus Minder Zout 250 ml|sojasaus
V|Jumbo Tomatenpuree 70 g|tomatenpuree
V|Jumbo Tomatenblokjes 400 g|tomatenblokjes
V|Jumbo Tomaten 500 g|tomaat
I|Jumbo Tomatensoep 570 ml|tomaat
I|Heinz Tomatenketchup 570 ml|tomaat
V|Jumbo Tempeh 200 g|tempeh
V|Jumbo Tofu Naturel 250 g|tofu
A|Jumbo Tofu Gemarineerd 180 g|tofu
V|Jumbo Winterpeen 1 kg|wortel
V|Jumbo Wortelen 500 g|wortel
I|Jumbo Wortelsap 1 L|wortel
V|Jumbo Zonnebloemolie 1 L|zonnebloemolie
V|Jumbo Verse Gember|gember
V|Jumbo Gember 150 g|gember
I|Jumbo Gemberthee 20 Stuks|gember
V|Jumbo Ketjap Manis 500 ml|ketjap
V|Conimex Ketjap Manis 500 ml|ketjap
V|Jumbo Limoen 3 Stuks|limoen
V|Jumbo Komkommer|komkommer
I|Jumbo Komkommer Salade 200 g|komkommer
V|Jumbo Zoete Aardappel 1 kg|zoete-aardappel
V|Jumbo Lasagnebladen 250 g|lasagnebladen
V|Jumbo Geraspte Kaas Belegen 200 g|geraspte-kaas
V|Jumbo Geraspte Jong Belegen Kaas 200 g|geraspte-kaas
I|Jumbo Geraspte Kaas voor Pizza 200 g|geraspte-kaas
V|Jumbo Groentebouillon Blokjes 10 Stuks|groentebouillon
V|Maggi Groentebouillon 8 Blokjes|groentebouillon
V|Jumbo Andijvie Gesneden 300 g|andijvie
I|Jumbo Andijviestamppot 1 kg|andijvie
V|Jumbo Kruimige Aardappelen 2,5 kg|aardappel
V|Jumbo Vastkokende Aardappelen 2 kg|aardappel
I|Jumbo Aardappelsalade 400 g|aardappel
V|Jumbo Feta 200 g|feta
V|Jumbo Griekse Feta 200 g|feta
V|Jumbo Scharreleieren 10 Stuks|ei
V|Jumbo Biologische Eieren 6 Stuks|ei
V|Jumbo Wraps Tarwe 8 Stuks|wraps
V|Jumbo Mie 250 g|mie
V|Conimex Mie Nestjes 250 g|mie
V|Jumbo Pitabroodjes 6 Stuks|pitabrood
V|Jumbo Verse Peterselie|verse-peterselie
V|Jumbo Rode Peper 3 Stuks|rode-peper
V|Jumbo Komijnpoeder 40 g|komijn
V|Jumbo Kerriepoeder 40 g|kerriepoeder
V|Jumbo Honing 450 g|honing
I|Jumbo Honingkoek 300 g|honing
V|Jumbo Kwark Mager 500 g|kwark
I|Jumbo Kwark Aardbei 500 g|kwark
V|Jumbo Spekblokjes 250 g|spekblokjes
V|Jumbo Gerookte Spekblokjes 250 g|spekblokjes
V|Jumbo Zilvervliesrijst 500 g|zilvervliesrijst
V|Jumbo Ijsbergsla|ijsbergsla
V|Jumbo Taugé 300 g|tauge
V|Jumbo Kabeljauwfilet 250 g|kabeljauw
V|Jumbo Gerookte Zalm 100 g|gerookte-zalm
I|Jumbo Zalmsalade 125 g|gerookte-zalm
V|Jumbo Kikkererwten 400 g|kikkererwten
V|Jumbo Kidneybonen 400 g|kidneybonen
V|Jumbo Kokosmelk 400 ml|kokosmelk
V|Jumbo Falafel 200 g|falafel
V|Jumbo Walnoten 200 g|walnoten
V|Jumbo Pompoen|pompoen
I|Jumbo Pompoensoep 570 ml|pompoen
`;

export const JUMBO_GOLDEN_EXAMPLES: readonly GoldenExample[] = CORPUS.trim()
  .split('\n')
  .map((line) => {
    const [code, productName, ingredientId] = line.split('|');
    return {
      productName: productName!.trim(),
      ingredientId: ingredientId!.trim(),
      label: code === 'V' ? 'VALID' : code === 'I' ? 'INVALID' : 'AMBIGUOUS',
    } as GoldenExample;
  });
