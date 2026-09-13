export interface GeocodeQuery {
  readonly postalCode: string;
  readonly houseNumber?: string;
  readonly country?: string;
}

export interface GeocodeResult {
  readonly latitude: number;
  readonly longitude: number;
  readonly city: string;
  /** How precise the answer is; drives what we tell the user. */
  readonly precision: 'exact' | 'postcode';
}

/**
 * Turning an address into coordinates.
 *
 * Business logic depends on this interface, never on a specific geocoding
 * service, so swapping the seeded table for PDOK, Google or anything else is a
 * one-file change.
 */
export interface GeocoderProvider {
  readonly id: string;
  geocode(query: GeocodeQuery): Promise<GeocodeResult | null>;
}
