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
