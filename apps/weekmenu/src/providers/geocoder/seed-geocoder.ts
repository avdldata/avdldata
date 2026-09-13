import type { GeocodeQuery, GeocodeResult, GeocoderProvider } from './types';

/**
 * Approximate centroid per Dutch two-digit postcode area.
 *
 * This is deliberately coarse: it places a household within a few kilometres,
 * which is precise enough to rank nearby supermarkets and imprecise enough that
 * we are not storing someone's front door. A real geocoder can be dropped in
 * behind `GeocoderProvider` when exact routing is needed.
 */
const POSTCODE_AREAS: Readonly<Record<string, { lat: number; lng: number; city: string }>> = {
  '10': { lat: 52.37, lng: 4.9, city: 'Amsterdam' },
  '11': { lat: 52.31, lng: 4.94, city: 'Amsterdam-Zuidoost' },
  '12': { lat: 52.22, lng: 5.17, city: 'Hilversum' },
  '13': { lat: 52.37, lng: 5.22, city: 'Almere' },
  '14': { lat: 52.29, lng: 5.16, city: 'Naarden' },
  '15': { lat: 52.44, lng: 4.83, city: 'Zaandam' },
  '16': { lat: 52.64, lng: 5.06, city: 'Hoorn' },
  '17': { lat: 52.96, lng: 4.76, city: 'Den Helder' },
  '18': { lat: 52.63, lng: 4.75, city: 'Alkmaar' },
  '19': { lat: 52.48, lng: 4.66, city: 'Beverwijk' },
  '20': { lat: 52.38, lng: 4.64, city: 'Haarlem' },
  '21': { lat: 52.29, lng: 4.58, city: 'Hillegom' },
  '22': { lat: 52.2, lng: 4.42, city: 'Katwijk' },
  '23': { lat: 52.16, lng: 4.49, city: 'Leiden' },
  '24': { lat: 52.13, lng: 4.66, city: 'Alphen aan den Rijn' },
  '25': { lat: 52.08, lng: 4.31, city: 'Den Haag' },
  '26': { lat: 52.01, lng: 4.36, city: 'Delft' },
  '27': { lat: 52.06, lng: 4.49, city: 'Zoetermeer' },
  '28': { lat: 52.04, lng: 4.32, city: 'Rijswijk' },
  '29': { lat: 51.93, lng: 4.58, city: 'Capelle aan den IJssel' },
  '30': { lat: 51.92, lng: 4.48, city: 'Rotterdam' },
  '31': { lat: 51.92, lng: 4.4, city: 'Schiedam' },
  '32': { lat: 51.99, lng: 5.09, city: 'Vianen' },
  '33': { lat: 51.81, lng: 4.67, city: 'Dordrecht' },
  '34': { lat: 52.03, lng: 5.09, city: 'Nieuwegein' },
  '35': { lat: 52.09, lng: 5.11, city: 'Utrecht' },
  '36': { lat: 52.14, lng: 5.04, city: 'Maarssen' },
  '37': { lat: 52.09, lng: 5.23, city: 'Zeist' },
  '38': { lat: 52.16, lng: 5.39, city: 'Amersfoort' },
  '39': { lat: 52.03, lng: 5.56, city: 'Veenendaal' },
  '40': { lat: 51.89, lng: 5.43, city: 'Tiel' },
  '41': { lat: 51.95, lng: 5.23, city: 'Culemborg' },
  '42': { lat: 51.83, lng: 4.97, city: 'Gorinchem' },
  '43': { lat: 51.5, lng: 3.89, city: 'Goes' },
  '44': { lat: 51.44, lng: 3.57, city: 'Vlissingen' },
  '45': { lat: 51.33, lng: 3.83, city: 'Terneuzen' },
  '46': { lat: 51.49, lng: 4.29, city: 'Bergen op Zoom' },
  '47': { lat: 51.53, lng: 4.46, city: 'Roosendaal' },
  '48': { lat: 51.59, lng: 4.78, city: 'Breda' },
  '49': { lat: 51.64, lng: 4.86, city: 'Oosterhout' },
  '50': { lat: 51.56, lng: 5.09, city: 'Tilburg' },
  '51': { lat: 51.69, lng: 5.07, city: 'Waalwijk' },
  '52': { lat: 51.7, lng: 5.3, city: "'s-Hertogenbosch" },
  '53': { lat: 51.81, lng: 5.25, city: 'Zaltbommel' },
  '54': { lat: 51.66, lng: 5.62, city: 'Uden' },
  '55': { lat: 51.62, lng: 5.55, city: 'Veghel' },
  '56': { lat: 51.44, lng: 5.48, city: 'Eindhoven' },
  '57': { lat: 51.48, lng: 5.66, city: 'Helmond' },
  '58': { lat: 51.35, lng: 5.46, city: 'Valkenswaard' },
  '59': { lat: 51.53, lng: 5.97, city: 'Venray' },
  '60': { lat: 51.37, lng: 6.17, city: 'Venlo' },
  '61': { lat: 51.19, lng: 5.99, city: 'Roermond' },
  '62': { lat: 50.85, lng: 5.69, city: 'Maastricht' },
  '63': { lat: 50.87, lng: 6.06, city: 'Kerkrade' },
  '64': { lat: 50.89, lng: 5.98, city: 'Heerlen' },
  '65': { lat: 51.84, lng: 5.86, city: 'Nijmegen' },
  '66': { lat: 51.81, lng: 5.73, city: 'Wijchen' },
  '67': { lat: 51.98, lng: 5.91, city: 'Arnhem' },
  '68': { lat: 52.0, lng: 5.9, city: 'Arnhem' },
  '69': { lat: 51.97, lng: 6.29, city: 'Doetinchem' },
  '70': { lat: 52.14, lng: 6.2, city: 'Zutphen' },
  '71': { lat: 51.97, lng: 6.72, city: 'Winterswijk' },
  '72': { lat: 52.25, lng: 6.16, city: 'Deventer' },
  '73': { lat: 52.21, lng: 5.97, city: 'Apeldoorn' },
  '74': { lat: 52.22, lng: 6.89, city: 'Enschede' },
  '75': { lat: 52.27, lng: 6.79, city: 'Hengelo' },
  '76': { lat: 52.36, lng: 6.66, city: 'Almelo' },
  '77': { lat: 52.58, lng: 6.62, city: 'Hardenberg' },
  '78': { lat: 52.51, lng: 6.09, city: 'Zwolle' },
  '79': { lat: 52.55, lng: 5.91, city: 'Kampen' },
  '80': { lat: 52.48, lng: 6.1, city: 'Zwolle' },
  '81': { lat: 52.45, lng: 5.84, city: 'Elburg' },
  '82': { lat: 52.52, lng: 5.47, city: 'Lelystad' },
  '83': { lat: 52.71, lng: 5.75, city: 'Emmeloord' },
  '84': { lat: 52.79, lng: 6.12, city: 'Steenwijk' },
  '85': { lat: 52.96, lng: 5.92, city: 'Heerenveen' },
  '86': { lat: 53.03, lng: 5.66, city: 'Sneek' },
  '87': { lat: 53.06, lng: 5.53, city: 'Bolsward' },
  '88': { lat: 53.2, lng: 5.79, city: 'Leeuwarden' },
  '89': { lat: 53.17, lng: 5.42, city: 'Harlingen' },
  '90': { lat: 53.19, lng: 5.8, city: 'Leeuwarden' },
  '91': { lat: 53.32, lng: 5.99, city: 'Dokkum' },
  '92': { lat: 53.11, lng: 6.1, city: 'Drachten' },
  '93': { lat: 52.99, lng: 6.56, city: 'Assen' },
  '94': { lat: 52.79, lng: 6.9, city: 'Emmen' },
  '95': { lat: 52.72, lng: 6.48, city: 'Hoogeveen' },
  '96': { lat: 53.1, lng: 6.87, city: 'Veendam' },
  '97': { lat: 53.22, lng: 6.57, city: 'Groningen' },
  '98': { lat: 53.33, lng: 6.52, city: 'Winsum' },
  '99': { lat: 53.25, lng: 6.55, city: 'Groningen' },
};

export class SeedPostcodeGeocoder implements GeocoderProvider {
  readonly id = 'seed-postcode';

  async geocode(query: GeocodeQuery): Promise<GeocodeResult | null> {
    const digits = query.postalCode.replace(/\D/g, '');
    if (digits.length < 4) return null;
    const area = POSTCODE_AREAS[digits.slice(0, 2)];
    if (!area) return null;
    return { latitude: area.lat, longitude: area.lng, city: area.city, precision: 'postcode' };
  }
}

export const KNOWN_POSTCODE_AREAS = Object.keys(POSTCODE_AREAS);
