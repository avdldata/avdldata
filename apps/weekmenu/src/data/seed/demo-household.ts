import type { Household } from '@/domain/household/types';

export const DEMO_HOUSEHOLD_ID = 'demo-household';
export const DEMO_USER_ID = 'demo-user';
export const DEMO_EMAIL = 'demo@weekmenu.nl';
export const DEMO_PASSWORD = 'weekmenu';

/**
 * The demo household from the brief: two adults in Groningen, one of them
 * pregnant. It exists purely as test data for the household, portion and
 * pregnancy-safety logic — the app draws no medical conclusions from it.
 */
export const DEMO_HOUSEHOLD: Household = {
  id: DEMO_HOUSEHOLD_ID,
  name: 'Huishouden Van der Laan',
  location: {
    postalCode: '9711 LM',
    houseNumber: '12',
    city: 'Groningen',
    country: 'Nederland',
    latitude: 53.2194,
    longitude: 6.5665,
    precision: 'postcode',
  },
  members: [
    {
      id: 'demo-member-arjan',
      name: 'Arjan',
      ageYears: 38,
      sex: 'man',
      heightCm: 175,
      weightKg: 87,
      activityLevel: 'licht-actief',
      goal: 'behouden',
      diet: 'alles',
      allergies: [],
      excludedIngredientIds: [],
    },
    {
      id: 'demo-member-chimene',
      name: 'Chimene',
      ageYears: 34,
      sex: 'vrouw',
      heightCm: 182,
      weightKg: 74,
      activityLevel: 'licht-actief',
      goal: 'geen-doel',
      diet: 'alles',
      pregnancy: { pregnant: true, trimester: 2 },
      allergies: [],
      excludedIngredientIds: [],
    },
  ],
  preferences: {
    ingredients: [],
    cuisines: [
      { value: 'italiaans', level: 'LIKE' },
      { value: 'mediterraan', level: 'LIKE' },
    ],
    tags: [
      { value: 'eenpansgerecht', level: 'LIKE' },
      { value: 'budget', level: 'LIKE' },
    ],
  },
};

export const DEMO_SELECTED_LOCATION_IDS = ['lidl-paterswoldseweg', 'jumbo-korreweg', 'ah-hoogkerk'];
