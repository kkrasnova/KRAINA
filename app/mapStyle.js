/** Темна палітра Google Maps — глибокий navy, приглушені підписи. */
export const MAP_STYLE_DARK = [
  { elementType: 'geometry', stylers: [{ color: '#0d1117' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b7280' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0d1117' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#1f2937' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#1a2332' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1a3328' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#243044' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1a2332' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2d3a52' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0a1628' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#374151' }] },
];

export function mapStyleForTheme(isLight) {
  return isLight ? [] : MAP_STYLE_DARK;
}
