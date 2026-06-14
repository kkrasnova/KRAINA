export function haversineKm(a, b) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
function speedKmh(transport) {
    switch (transport) {
        case 'car':
            return 28;
        case 'bus':
            return 18;
        case 'train':
            return 35;
        case 'walk':
        default:
            return 5;
    }
}
export function travelMinutes(a, b, transport) {
    return (haversineKm(a, b) / speedKmh(transport)) * 60;
}
//# sourceMappingURL=geoHaversine.js.map