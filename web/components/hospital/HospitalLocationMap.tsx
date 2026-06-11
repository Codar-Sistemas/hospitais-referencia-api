'use client';
import dynamic from 'next/dynamic';
import type { Hospital } from '@/lib/types';

// Server components can't use `ssr: false` dynamic imports, and Leaflet
// touches `window` on import — this thin client wrapper bridges the two so
// the (server-rendered) hospital detail page can embed the map.
const HospitalMap = dynamic(() => import('./HospitalMap'), { ssr: false });

export default function HospitalLocationMap({ hospital }: { hospital: Hospital }) {
  return <HospitalMap hospitals={[hospital]} />;
}
