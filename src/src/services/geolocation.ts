/**
 * Represents a geographical coordinate with latitude and longitude.
 */
export interface Coordinate {
  /**
   * The latitude of the coordinate.
   */
  latitude: number;
  /**
   * The longitude of the coordinate.
   */
  longitude: number;
}

/**
 * Asynchronously retrieves the current geographical location of the device
 * using the browser's Geolocation API.
 *
 * @returns A promise that resolves to a Coordinate object representing the current location.
 * @throws An error if geolocation is not supported or permission is denied.
 */
export function getCurrentLocation(): Promise<Coordinate> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new Error("User denied the request for Geolocation."));
            break;
          case error.POSITION_UNAVAILABLE:
            reject(new Error("Location information is unavailable."));
            break;
          case error.TIMEOUT:
            reject(new Error("The request to get user location timed out."));
            break;
          default:
            reject(new Error(`An unknown error occurred: ${error.message}`));
            break;
        }
      },
      {
        enableHighAccuracy: true, // Request high accuracy
        timeout: 10000, // 10 seconds timeout
        maximumAge: 0 // Force fresh location data
      }
    );
  });
}

/**
 * Asynchronously retrieves the current city name based on the device's geographical location.
 * Uses Nominatim (OpenStreetMap) for reverse geocoding.
 *
 * @returns A promise that resolves to the city name string.
 * @throws An error if geolocation fails or city cannot be determined.
 */
export async function getCurrentCity(): Promise<string> {
  console.warn(
    "Using Nominatim API for reverse geocoding. Please be mindful of their usage policy (max 1 req/sec). For production, consider a dedicated geocoding service."
  );
  try {
    const coords = await getCurrentLocation();
    const { latitude, longitude } = coords;

    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
    );

    if (!response.ok) {
      throw new Error(`Nominatim API request failed: ${response.statusText}`);
    }

    const data = await response.json();

    if (data && data.address) {
      const city = data.address.city || data.address.town || data.address.village || data.address.hamlet || data.address.county;
      if (city) {
        return city;
      } else {
        throw new Error("City name not found in geocoding response.");
      }
    } else {
      throw new Error("Invalid geocoding response format.");
    }
  } catch (error) {
    console.error("Error getting current city:", error);
    if (error instanceof Error) {
      throw new Error(`Failed to determine city: ${error.message}`);
    }
    throw new Error("Failed to determine city due to an unknown error.");
  }
}
