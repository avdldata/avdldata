import { describe, expect, it } from 'vitest';
import {
  parsePromotionText,
  parseTypedPromotion,
} from '@/services/promotions/parse-promotion-text';
import { extractJumboProductId, sameRetailerProduct } from '@/services/promotions/retailer-id';

/**
 * The defects the first real PrijsProfeet snapshot found.
 *
 * Every case below is a line that was in the file — 5.190 records over Albert
 * Heijn and Jumbo — and every one of them was priced wrongly by code that had
 * passed its own tests. They are pinned here together, apart from the tests
 * that describe intended behaviour, because that is what they are: five things
 * we got wrong, kept wrong until real data arrived, and must not get wrong
 * again.
 *
 * The common shape is worth naming. None of them crashed, none of them showed
 * up as an error, and four of the five made the plan look *cheaper* than the
 * till would charge. A promotion bug is silent by construction: the number goes
 * down, which is what you were hoping for.
 */

const params = (
  code: string | undefined,
  text: string | readonly string[],
  price?: number,
  regular?: number,
) => {
  const result = parseTypedPromotion(code, text, price, regular);
  return result.status === 'OK' ? result.params : `FAILED:${result.reason}`;
};

describe('de typecode van de bron overrulet de tekst niet', () => {
  it('leest "2e halve prijs" als 2e halve prijs, ook als de bron one_plus_one zegt', () => {
    // 300 records in de echte momentopname. De bron zet promotion_type op
    // "one_plus_one" en drukt "2e halve prijs" op het schap. Dat zijn twee
    // verschillende aanbiedingen: 1+1 is de helft van twee pakken, 2e halve
    // prijs is een kwart. De code gehoorzamen verdubbelt de korting.
    expect(params('one_plus_one', ['2E HALVE PRIJS', '2e Halve Prijs'])).toEqual({
      type: 'BUY_NTH_DISCOUNT',
      nth: 2,
      percent: 50,
    });
  });

  it('leest "2+1 gratis" als elke derde gratis, ook als de bron one_plus_one zegt', () => {
    // 175 records. 1+1 zou één van elke twee gratis geven in plaats van één
    // van elke drie.
    expect(params('one_plus_one', ['2 + 1 GRATIS', '2 + 1 gratis'])).toEqual({
      type: 'BUY_NTH_DISCOUNT',
      nth: 3,
      percent: 100,
    });
  });

  it('gebruikt de code nog wel wanneer de tekst niets bruikbaars zegt', () => {
    expect(params('one_plus_one', ['BONUS'])).toEqual({ type: 'ONE_PLUS_ONE' });
  });
});

describe('mechanismen met een onbekende drempel worden geweigerd', () => {
  it('weigert "volume voordeel" in plaats van het als vlak percentage te lezen', () => {
    // 458 records. Een staffel: de korting geldt pas vanaf een aantal dat de
    // feed nergens noemt. Als 25% gelezen kortte hij één los pak met een
    // kwart — de grootste bron van te-lage prijzen in de hele momentopname.
    expect(params('volume', ['25% volume voordeel', 'Gratis bezorging bij 15 euro'])).toBe(
      'FAILED:UNSUPPORTED_PROMOTION',
    );
    expect(parsePromotionText('5% pakketkorting').status).toBe('FAILED');
  });

  it('weigert een prijs per gewicht in plaats van hem als pakprijs te lezen', () => {
    // "100 GRAM VOOR 1.69" bij een grillworst van 300 gram: als pakprijs
    // gelezen kost het pak plots een derde.
    expect(parsePromotionText('100 GRAM VOOR 1.69').status).toBe('FAILED');
    expect(parsePromotionText('5,99 per kilo').status).toBe('FAILED');
  });

  it('weigert bezorgvoordeel, want dat is geen productprijs', () => {
    expect(parsePromotionText('Gratis bezorging bij 15 euro').status).toBe('FAILED');
    expect(parsePromotionText('2 euro bezorgkorting').status).toBe('FAILED');
  });
});

describe('de prijs van de bron is geen kassaprijs', () => {
  it('maakt van een onleesbare bundeltekst geen vaste prijs', () => {
    // In deze feed is `price` de *effectieve* prijs per stuk: een record met
    // "2 VOOR 0.99" draagt price 0.49. Dat als vaste prijs toepassen halveert
    // een bundelaanbieding voor wie er één koopt.
    expect(params('multi_buy', ['voordeelbundel'], 49, 89)).toBe('FAILED:UNSUPPORTED_PROMOTION');
    expect(params(undefined, ['BONUS'], 49, 89)).toBe('FAILED:UNSUPPORTED_PROMOTION');
  });

  it('gebruikt hem wel waar de code zegt dat hij per stuk is', () => {
    expect(params('percentage', [], 300, 400)).toEqual({ type: 'PERCENT_OFF', percent: 25 });
    expect(params('fixed_price', [], 249)).toEqual({ type: 'FIXED_PRICE', unitPriceCents: 249 });
  });
});

describe('een lijst met trefwoorden in plaats van één tekst', () => {
  it('pikt het mechanisme uit de ruis', () => {
    expect(params('multi_buy', ['Gratis bezorging bij 15 euro', '2 voor 2,99'])).toEqual({
      type: 'N_FOR_X',
      bundleSize: 2,
      bundlePriceCents: 299,
    });
  });

  it('telt dezelfde tekst in twee schrijfwijzen als één antwoord', () => {
    expect(params('percentage', ['25% KORTING', '25% korting'])).toEqual({
      type: 'PERCENT_OFF',
      percent: 25,
    });
  });

  it('weigert wanneer twee trefwoorden iets anders zeggen', () => {
    // Twee tegenstrijdige mechanismen op één record is niets om tussen te
    // kiezen.
    expect(params(undefined, ['1 + 1 gratis', '25% korting'])).toBe('FAILED:UNSUPPORTED_PROMOTION');
  });
});

describe('een kale "voor € X"', () => {
  it('is een vaste prijs — de vaakst voorkomende vorm die we misten', () => {
    expect(parsePromotionText('VOOR 0.99')).toMatchObject({
      status: 'OK',
      params: { type: 'FIXED_PRICE', unitPriceCents: 99 },
    });
    expect(parsePromotionText('voor 2,49')).toMatchObject({
      status: 'OK',
      params: { type: 'FIXED_PRICE', unitPriceCents: 249 },
    });
    expect(parsePromotionText('1 voor 3,79')).toMatchObject({
      status: 'OK',
      params: { type: 'FIXED_PRICE', unitPriceCents: 379 },
    });
  });

  it('laat een bundel een bundel blijven', () => {
    expect(parsePromotionText('2 voor 0.99')).toMatchObject({
      status: 'OK',
      params: { type: 'N_FOR_X', bundleSize: 2, bundlePriceCents: 99 },
    });
  });
});

describe('het winkelartikelnummer zonder verpakkingscode', () => {
  it('is geen identiteit', () => {
    // Jumbo 74004PAK is een pak van 2,4 liter voor € 2,69; 74004DSL is de doos
    // van vier voor € 10,76. 730 producten in de Jumbo-catalogus delen een
    // nummer op deze manier.
    expect(
      sameRetailerProduct(extractJumboProductId('74004PAK'), extractJumboProductId('74004DSL')),
    ).toBe(false);
    expect(
      sameRetailerProduct(
        extractJumboProductId('campina-verse-halfvolle-melk-voordeelpak-2,4-l-74004PAK'),
        extractJumboProductId('campina-halfvolle-melk-voordeelpack-4-x-24-l-74004DSL'),
      ),
    ).toBe(false);
  });

  it('maar het volledige nummer wel, hoe het ook geschreven staat', () => {
    expect(
      sameRetailerProduct(
        extractJumboProductId('jumbo-rundergehakt-300-g-128692ZK'),
        extractJumboProductId('128692ZK'),
      ),
    ).toBe(true);
  });
});
