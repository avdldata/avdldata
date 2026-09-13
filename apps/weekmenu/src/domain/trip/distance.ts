export interface GeoPoint {
  readonly latitude: number;
  readonly longitude: number;
}

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in kilometres. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Straight-line distance under-states a real drive. A detour factor is the
 * standard cheap correction; a real routing provider replaces this whole
 * function without touching anything else.
 */
export const DEFAULT_ROAD_DETOUR_FACTOR = 1.3;

export function roadDistanceKm(
  a: GeoPoint,
  b: GeoPoint,
  detourFactor = DEFAULT_ROAD_DETOUR_FACTOR,
): number {
  return haversineKm(a, b) * detourFactor;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
