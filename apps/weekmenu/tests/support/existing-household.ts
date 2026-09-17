import { DEMO_HOUSEHOLD } from '../../src/data/seed/demo-household';
import { DEFAULT_WEEK_SETTINGS } from '../../src/data/repositories/types';

// Minimal persisted input for ALPHA-003. No personal account data is needed:
// a current snapshot captured after the week's Monday is the relevant state.
export const EXISTING_USER_ID = 'alpha-003-existing-user';
export const EXISTING_EMAIL = 'alpha-003@example.test';
export const EXISTING_PASSWORD = 'existing-weekmenu-test';
export const EXISTING_HOUSEHOLD = {
  ...structuredClone(DEMO_HOUSEHOLD),
  id: 'alpha-003-existing-household',
  name: 'Testhuishouden',
  preferences: { ingredients: [], cuisines: [], tags: [] },
};
export const EXISTING_SETTINGS = {
  ...DEFAULT_WEEK_SETTINGS,
  selectedLocationIds: ['lidl-beijum', 'jumbo-helpman', 'ah-haren'],
};
