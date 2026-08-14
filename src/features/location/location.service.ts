export interface NormalizedLocation {
  city: string;
  region: string;
  country: string;
  latitude?: number;
  longitude?: number;
}

export const POPULAR_CITIES = [
  { city: 'Vadodara', region: 'Gujarat', country: 'India', latitude: 22.3072, longitude: 73.1812 },
  { city: 'Ahmedabad', region: 'Gujarat', country: 'India', latitude: 23.0225, longitude: 72.5714 },
  { city: 'Surat', region: 'Gujarat', country: 'India', latitude: 21.1702, longitude: 72.8311 },
  { city: 'Rajkot', region: 'Gujarat', country: 'India', latitude: 22.3039, longitude: 70.8022 },
  { city: 'Mumbai', region: 'Maharashtra', country: 'India', latitude: 19.076, longitude: 72.8777 },
  { city: 'Delhi', region: 'NCR', country: 'India', latitude: 28.6139, longitude: 77.209 },
  { city: 'Bengaluru', region: 'Karnataka', country: 'India', latitude: 12.9716, longitude: 77.5946 },
  { city: 'Pune', region: 'Maharashtra', country: 'India', latitude: 18.5204, longitude: 73.8567 },
  { city: 'Hyderabad', region: 'Telangana', country: 'India', latitude: 17.385, longitude: 78.4867 },
  { city: 'Kolkata', region: 'West Bengal', country: 'India', latitude: 22.5726, longitude: 88.3639 }
];

export class LocationService {
  /**
   * Reverse geocodes coordinates to a normalized city object using OpenStreetMap Nominatim or Open-Meteo Geocoding.
   */
  public async reverseGeocode(latitude: number, longitude: number): Promise<NormalizedLocation> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'DocumentAI-Platform/1.0 (contact@example.com)' }
      });
      if (res.ok) {
        const data = await res.json();
        const address = data.address || {};
        const city =
          address.city ||
          address.town ||
          address.village ||
          address.suburb ||
          address.county ||
          'Vadodara';
        const region = address.state || address.region || 'Gujarat';
        const country = address.country || 'India';

        return { city, region, country, latitude, longitude };
      }
    } catch {
      // Fallback if network fails
    }

    // Default fallback city
    return {
      city: 'Vadodara',
      region: 'Gujarat',
      country: 'India',
      latitude: 22.3072,
      longitude: 73.1812
    };
  }

  /**
   * Search matching cities from popular list or geocoding API.
   */
  public searchCities(query: string): NormalizedLocation[] {
    const q = query.trim().toLowerCase();
    if (!q) return POPULAR_CITIES;
    return POPULAR_CITIES.filter(
      (c) => c.city.toLowerCase().includes(q) || c.region.toLowerCase().includes(q)
    );
  }
}

export const locationService = new LocationService();
