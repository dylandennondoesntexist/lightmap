const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
const GEOHASH_PATTERN = /^[0123456789bcdefghjkmnpqrstuvwxyz]{4}$/;

export function encodeGeohash(latitude, longitude, precision = 4) {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new RangeError("Latitude must be between -90 and 90 degrees.");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new RangeError("Longitude must be between -180 and 180 degrees.");
  }
  if (!Number.isInteger(precision) || precision < 1 || precision > 12) {
    throw new RangeError("Geohash precision must be an integer from 1 to 12.");
  }

  const latRange = [-90, 90];
  const lngRange = [-180, 180];
  let hash = "";
  let bit = 0;
  let character = 0;
  let isLongitude = true;

  while (hash.length < precision) {
    const range = isLongitude ? lngRange : latRange;
    const coordinate = isLongitude ? longitude : latitude;
    const midpoint = (range[0] + range[1]) / 2;

    if (coordinate >= midpoint) {
      character |= 1 << (4 - bit);
      range[0] = midpoint;
    } else {
      range[1] = midpoint;
    }

    isLongitude = !isLongitude;
    bit += 1;
    if (bit === 5) {
      hash += BASE32[character];
      bit = 0;
      character = 0;
    }
  }

  return hash;
}

export function decodeGeohash(hash) {
  if (typeof hash !== "string" || !GEOHASH_PATTERN.test(hash)) {
    return null;
  }

  const latRange = [-90, 90];
  const lngRange = [-180, 180];
  let isLongitude = true;

  for (const character of hash) {
    const value = BASE32.indexOf(character);
    for (let bit = 4; bit >= 0; bit -= 1) {
      const range = isLongitude ? lngRange : latRange;
      const midpoint = (range[0] + range[1]) / 2;
      if (value & (1 << bit)) {
        range[0] = midpoint;
      } else {
        range[1] = midpoint;
      }
      isLongitude = !isLongitude;
    }
  }

  return {
    lat: (latRange[0] + latRange[1]) / 2,
    lng: (lngRange[0] + lngRange[1]) / 2,
  };
}
