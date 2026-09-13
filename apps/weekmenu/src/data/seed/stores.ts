import type { SupermarketChain, SupermarketLocation } from '@/domain/stores/types';

/**
 * Chains supported by the demo dataset. Lidl, Jumbo and Albert Heijn are the
 * V1 priority; PLUS is included to prove the model is not hard-wired to three.
 */
export const SEED_CHAINS: readonly SupermarketChain[] = [
  { id: 'ah', name: 'Albert Heijn', logoUrl: '/chains/ah.svg', colorHex: '#00a0e2' },
  { id: 'jumbo', name: 'Jumbo', logoUrl: '/chains/jumbo.svg', colorHex: '#eeb111' },
  { id: 'lidl', name: 'Lidl', logoUrl: '/chains/lidl.svg', colorHex: '#0050aa' },
  { id: 'plus', name: 'PLUS', logoUrl: '/chains/plus.svg', colorHex: '#d3122a' },
];

/**
 * Store locations around Groningen. Coordinates are approximate and exist to
 * make the distance model demonstrable; a real StoreLocatorProvider replaces
 * this list without any change to the optimizer.
 */
export const SEED_LOCATIONS: readonly SupermarketLocation[] = [
  {
    id: 'lidl-paterswoldseweg',
    chainId: 'lidl',
    name: 'Lidl Paterswoldseweg',
    address: 'Paterswoldseweg 132',
    postalCode: '9727 BJ',
    city: 'Groningen',
    latitude: 53.2094,
    longitude: 6.549,
    regionId: 'noord',
  },
  {
    id: 'lidl-beijum',
    chainId: 'lidl',
    name: 'Lidl Beijum',
    address: 'Bentismaheerd 4',
    postalCode: '9736 EA',
    city: 'Groningen',
    latitude: 53.25,
    longitude: 6.62,
    regionId: 'noord',
  },
  {
    id: 'jumbo-korreweg',
    chainId: 'jumbo',
    name: 'Jumbo Korreweg',
    address: 'Korreweg 78',
    postalCode: '9714 AE',
    city: 'Groningen',
    latitude: 53.2344,
    longitude: 6.5966,
    regionId: 'noord',
  },
  {
    id: 'jumbo-helpman',
    chainId: 'jumbo',
    name: 'Jumbo Helpman',
    address: 'Verlengde Hereweg 101',
    postalCode: '9721 AM',
    city: 'Groningen',
    latitude: 53.195,
    longitude: 6.52,
    regionId: 'noord',
  },
  {
    id: 'ah-hoogkerk',
    chainId: 'ah',
    name: 'Albert Heijn Hoogkerk',
    address: 'Zuiderweg 70',
    postalCode: '9744 AP',
    city: 'Groningen',
    latitude: 53.1894,
    longitude: 6.522,
    regionId: 'noord',
  },
  {
    id: 'ah-haren',
    chainId: 'ah',
    name: 'Albert Heijn Haren',
    address: 'Rijksstraatweg 175',
    postalCode: '9752 BE',
    city: 'Haren',
    latitude: 53.17,
    longitude: 6.48,
    regionId: 'noord',
  },
  {
    id: 'plus-beijum',
    chainId: 'plus',
    name: 'PLUS Beijum',
    address: 'Ypemaheerd 100',
    postalCode: '9736 JA',
    city: 'Groningen',
    latitude: 53.2694,
    longitude: 6.665,
    regionId: 'noord',
  },
  {
    id: 'plus-zuidhorn',
    chainId: 'plus',
    name: 'PLUS Zuidhorn',
    address: 'Overtuinen 2',
    postalCode: '9801 LC',
    city: 'Zuidhorn',
    latitude: 53.15,
    longitude: 6.45,
    regionId: 'noord',
  },
];
