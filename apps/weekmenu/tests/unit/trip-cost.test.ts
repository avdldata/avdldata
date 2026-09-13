import { describe, expect, it } from 'vitest';
import { haversineKm, roadDistanceKm } from '@/domain/trip/distance';
import { DEFAULT_TRIP_COST_CONFIG, estimateTripCost } from '@/domain/trip/trip-cost';
import type { SupermarketLocation } from '@/domain/stores/types';

const home = { latitude: 53.2194, longitude: 6.5665 };

function store(id: string, latitude: number, longitude: number): SupermarketLocation {
  return {
    id,
    chainId: id,
    name: id,
    address: '',
    postalCode: '',
    city: 'Groningen',
    latitude,
    longitude,
    regionId: 'noord',
  };
}

describe('distance', () => {
  it('measures a known short distance', () => {
    // ~1.6 km south-west of the household.
    const distance = haversineKm(home, { latitude: 53.2094, longitude: 6.549 });
    expect(distance).toBeGreaterThan(1.5);
    expect(distance).toBeLessThan(1.75);
  });

  it('is zero for the same point and symmetric', () => {
    expect(haversineKm(home, home)).toBe(0);
    const a = { latitude: 53.1, longitude: 6.4 };
    expect(haversineKm(home, a)).toBeCloseTo(haversineKm(a, home), 9);
  });

  it('inflates straight-line distance to something road-like', () => {
    const target = { latitude: 53.1894, longitude: 6.522 };
    expect(roadDistanceKm(home, target)).toBeCloseTo(haversineKm(home, target) * 1.3, 6);
  });
});

describe('trip cost', () => {
  it('costs nothing when there is nowhere to go', () => {
    const estimate = estimateTripCost({ home, stores: [] });
    expect(estimate.estimatedDistanceKm).toBe(0);
    expect(estimate.estimatedTravelCostCents).toBe(0);
  });

  it('drives out and back for a single store', () => {
    const single = store('lidl', 53.2094, 6.549);
    const estimate = estimateTripCost({ home, stores: [single] });
    expect(estimate.estimatedDistanceKm).toBeCloseTo(roadDistanceKm(home, single) * 2, 1);
    expect(estimate.estimatedTravelCostCents).toBeGreaterThan(0);
    expect(estimate.storeCount).toBe(1);
  });

  it('a second store costs extra distance, cost and time', () => {
    const a = store('lidl', 53.2094, 6.549);
    const b = store('ah', 53.1894, 6.522);
    const one = estimateTripCost({ home, stores: [a] });
    const two = estimateTripCost({ home, stores: [a, b] });
    expect(two.estimatedDistanceKm).toBeGreaterThan(one.estimatedDistanceKm);
    expect(two.estimatedTravelCostCents).toBeGreaterThan(one.estimatedTravelCostCents);
    expect(two.estimatedMinutes).toBeGreaterThan(one.estimatedMinutes);
  });

  it('visits the nearest store first, whatever order they arrive in', () => {
    const near = store('near', 53.2094, 6.549);
    const far = store('far', 53.1894, 6.522);
    expect(estimateTripCost({ home, stores: [far, near] }).route).toEqual(['near', 'far']);
    expect(estimateTripCost({ home, stores: [near, far] }).route).toEqual(['near', 'far']);
  });

  it('charges nothing per kilometre when you walk or cycle', () => {
    const single = store('lidl', 53.2094, 6.549);
    const cycling = estimateTripCost({
      home,
      stores: [single],
      config: { ...DEFAULT_TRIP_COST_CONFIG, mode: 'fiets' },
    });
    expect(cycling.estimatedTravelCostCents).toBe(0);
    expect(cycling.estimatedMinutes).toBeGreaterThan(
      estimateTripCost({ home, stores: [single] }).estimatedMinutes,
    );
  });

  it('scales with a configurable cost per kilometre', () => {
    const single = store('lidl', 53.2094, 6.549);
    const base = DEFAULT_TRIP_COST_CONFIG;
    const cheap = estimateTripCost({
      home,
      stores: [single],
      config: {
        ...base,
        profiles: {
          ...base.profiles,
          auto: { ...base.profiles.auto, costPerKmCents: 10 as never },
        },
      },
    });
    const expensive = estimateTripCost({
      home,
      stores: [single],
      config: {
        ...base,
        profiles: {
          ...base.profiles,
          auto: { ...base.profiles.auto, costPerKmCents: 50 as never },
        },
      },
    });
    expect(expensive.estimatedTravelCostCents).toBeGreaterThan(cheap.estimatedTravelCostCents * 4);
  });
});
