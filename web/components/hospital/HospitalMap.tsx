'use client';
import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Hospital } from '@/lib/types';

// Fixes Leaflet's default marker icon path resolution under Next.js bundling.
const markerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function FitBounds({ hospitals }: { hospitals: Hospital[] }) {
  const map = useMap();
  useEffect(() => {
    const withCoords = hospitals.filter((h) => h.lat && h.lng);
    if (withCoords.length === 0) return;
    const bounds = L.latLngBounds(withCoords.map((h) => [h.lat!, h.lng!]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  }, [hospitals, map]);
  return null;
}

interface HospitalMapProps {
  hospitals: Hospital[];
}

export default function HospitalMap({ hospitals }: HospitalMapProps) {
  const withCoords = hospitals.filter((h) => h.lat && h.lng);

  if (withCoords.length === 0) {
    return (
      <div className="h-64 bg-gray-100 rounded-xl flex items-center justify-center text-sm text-gray-400">
        Nenhum hospital com coordenadas disponíveis ainda.
        <br />O geocoding é feito automaticamente pelo sistema.
      </div>
    );
  }

  return (
    <MapContainer
      center={[-15.78, -47.93]}
      zoom={5}
      className="h-80 rounded-xl z-0"
      style={{ height: '320px' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds hospitals={withCoords} />
      {withCoords.map((h) => (
        <Marker key={h.id} position={[h.lat!, h.lng!]} icon={markerIcon}>
          <Popup>
            <strong>{h.name}</strong>
            <br />
            {h.city} · {h.state_code}
            {h.phones && (
              <>
                <br />
                📞 {h.phones}
              </>
            )}
            {h.distance_km !== undefined && (
              <>
                <br />
                📍 {h.distance_km.toFixed(1)} km
              </>
            )}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
