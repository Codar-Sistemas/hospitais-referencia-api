import { ImageResponse } from 'next/og';
import { getVertical, LIVE_VERTICALS, type VerticalTheme } from '@/lib/verticals';

export const alt = 'MapaSUS — Estabelecimentos de referência do SUS';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Pre-render the OG image for each live vertical.
export function generateStaticParams() {
  return LIVE_VERTICALS.map((v) => ({ vertical: v.slug }));
}

// Per-theme gradient — mirrors the card accents in the hub.
const GRADIENT: Record<VerticalTheme, [string, string]> = {
  venom: ['#047857', '#10b981'],
  rare: ['#6d28d9', '#8b5cf6'],
  oncology: ['#0369a1', '#0ea5e9'],
};

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ vertical: string }>;
}) {
  const { vertical } = await params;
  const v = getVertical(vertical);
  const [from, to] = GRADIENT[v?.theme ?? 'venom'];
  const title = v ? `${v.hero.titleLead} ${v.hero.titleAccent}` : 'MapaSUS';
  const subtitle = v?.hero.subtitle ?? '';
  const label = v?.label ?? 'MapaSUS';

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
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
              color: from,
              fontSize: 40,
              fontWeight: 800,
            }}
          >
            +
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.01em' }}>MapaSUS</div>
            <div style={{ fontSize: 20, fontWeight: 500, opacity: 0.9 }}>{label}</div>
          </div>
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
            fontSize: 68,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: '-0.025em',
            maxWidth: 980,
          }}
        >
          {title}
        </div>
        <div style={{ marginTop: 28, fontSize: 28, fontWeight: 500, opacity: 0.92, maxWidth: 920 }}>
          {subtitle}
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
        <div style={{ fontSize: 20, fontWeight: 600, opacity: 0.95 }}>mapasus</div>
      </div>
    </div>,
    { ...size },
  );
}
