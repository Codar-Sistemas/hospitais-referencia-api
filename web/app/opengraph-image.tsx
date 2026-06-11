import { ImageResponse } from 'next/og';
import { SITE_URL } from '@/lib/site';

const DISPLAY_HOST = SITE_URL.replace(/^https?:\/\//, '');

export const alt =
  'MapaSUS — Estabelecimentos de referência do SUS. Dados oficiais do Ministério da Saúde.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #047857 0%, #10b981 100%)',
        color: 'white',
        padding: '64px 80px',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      {/* Top: brand + badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              background: 'white',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#047857',
              fontSize: 40,
              fontWeight: 800,
            }}
          >
            +
          </div>
          <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.01em' }}>MapaSUS</div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'rgba(239,68,68,0.95)',
            color: 'white',
            padding: '10px 18px',
            borderRadius: 999,
            fontSize: 18,
            fontWeight: 700,
          }}
        >
          <div style={{ width: 8, height: 8, background: 'white', borderRadius: 999 }} />
          SAMU 192
        </div>
      </div>

      {/* Middle: headline */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          flex: 1,
          marginTop: 24,
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: '-0.025em',
            maxWidth: 980,
          }}
        >
          Os estabelecimentos de referência do SUS, fáceis de encontrar
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 28,
            fontWeight: 500,
            opacity: 0.92,
            maxWidth: 920,
          }}
        >
          Animais peçonhentos, doenças raras e oncologia — dados oficiais do Ministério da Saúde.
        </div>
      </div>

      {/* Bottom: source + url */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid rgba(255,255,255,0.25)',
          paddingTop: 24,
        }}
      >
        <div style={{ fontSize: 20, opacity: 0.9 }}>
          Dados oficiais do Ministério da Saúde · Atualização automática diária
        </div>
        <div style={{ fontSize: 20, fontWeight: 600, opacity: 0.95 }}>{DISPLAY_HOST}</div>
      </div>
    </div>,
    { ...size },
  );
}
