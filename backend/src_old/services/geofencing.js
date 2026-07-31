const pool = require('../config/db');

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

async function isWithinGeofence(latitude, longitude) {
  const [fences] = await pool.query('SELECT * FROM geofences');
  for (const fence of fences) {
    const distance = haversine(latitude, longitude, fence.latitude, fence.longitude);
    if (distance <= fence.radius_meters) return true;
  }
  return false;
}

module.exports = { isWithinGeofence };