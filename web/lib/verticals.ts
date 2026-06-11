// MapaSUS vertical registry — the single source of truth for the platform's
// health verticals. Navbar, layouts, metadata, api-client, sitemap and the
// host router (`proxy.ts`) all derive from `VERTICALS`.
//
// INVARIANT (mirrors the backend's `Vertical` ↔ `KNOWN_VERTICALS` ↔
// `URL_TO_DB_VERTICAL` discipline): `slug` is the kebab-case URL segment used
// by both this app's `app/[vertical]` routes AND the backend's namespaced
// routes `/v1/{slug}/...`; `dbKey` is the snake_case database key. Keep them in
// sync with the backend whenever a vertical is added or renamed.
//
// This module must stay free of React / next-og / DOM imports so it is safe to
// import from `proxy.ts`, which is deployed separately from the render runtime.

import type { TreatmentOption } from './constants';
import { TREATMENTS } from './constants';

export interface Vertical {
  /** URL slug, kebab-case. Drives `app/[vertical]` and `/v1/{slug}` API routes. */
  slug: string;
  /** Database key, snake_case. Parity with the backend; not sent by the web app. */
  dbKey: string;
  /** Production subdomain host (no scheme). Used by `proxy.ts` host routing. */
  subdomain: string;
  /** PT-BR wordmark / full label shown in chrome and cards. */
  label: string;
  /** Shorter PT-BR label for tight spots (nav, chips). */
  shortLabel: string;
  /** Whether the vertical has data and is publicly reachable. */
  status: 'live' | 'coming-soon';
  /** Theme token consumed via `data-theme` on the vertical layout wrapper. */
  theme: VerticalTheme;
  /** The vertical's treatment/specialty options (PT labels, EN canonical values). */
  treatments: ReadonlyArray<TreatmentOption>;
  /** Hero copy for the vertical home. */
  hero: { eyebrow: string; titleLead: string; titleAccent: string; subtitle: string };
  /** Per-vertical SEO. `canonical` is derived as `/${slug}`. */
  metadata: { title: string; description: string; keywords: string[] };
  /** One-line description for the hub card. */
  cardDescription: string;
  /** Official Ministério da Saúde source URL for this vertical's data. */
  sourceUrl: string;
}

export type VerticalTheme = 'venom' | 'rare' | 'oncology';

export const VERTICALS: ReadonlyArray<Vertical> = [
  {
    slug: 'venomous-animals',
    dbKey: 'venomous_animals',
    subdomain: 'peconhentos.mapasus.com.br',
    label: 'Animais Peçonhentos',
    shortLabel: 'Peçonhentos',
    status: 'live',
    theme: 'venom',
    treatments: TREATMENTS,
    hero: {
      eyebrow: 'Dados oficiais do Ministério da Saúde',
      titleLead: 'Hospitais com soro antiofídico',
      titleAccent: 'e antiveneno no Brasil',
      subtitle:
        'Encontre a unidade de referência mais próxima em caso de acidente com animais peçonhentos.',
    },
    metadata: {
      title: 'Hospitais de Referência para Animais Peçonhentos | Brasil',
      description:
        'Encontre hospitais com soro antiofídico e antiveneno no Brasil. Busca por cidade, CEP ou animal. Dados oficiais do Ministério da Saúde.',
      keywords: [
        'soro antiofídico',
        'antiveneno',
        'animais peçonhentos',
        'cobra',
        'escorpião',
        'aranha',
        'lagarta',
        'jararaca',
        'cascavel',
        'hospital de referência',
        'ministério da saúde',
        'SAMU',
        'emergência',
        'acidente peçonhento',
      ],
    },
    cardDescription:
      'Hospitais habilitados a tratar acidentes com cobras, escorpiões, aranhas e lagartas — com a grade de soros de cada unidade.',
    sourceUrl:
      'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia',
  },
  {
    slug: 'rare-diseases',
    dbKey: 'rare_diseases',
    subdomain: 'raras.mapasus.com.br',
    label: 'Doenças Raras',
    shortLabel: 'Raras',
    status: 'coming-soon',
    theme: 'rare',
    treatments: [],
    hero: {
      eyebrow: 'Em breve',
      titleLead: 'Centros de referência',
      titleAccent: 'em doenças raras',
      subtitle:
        'Os serviços habilitados pelo SUS para diagnóstico e tratamento de doenças raras, em construção.',
    },
    metadata: {
      title: 'Centros de Referência em Doenças Raras no SUS | MapaSUS',
      description:
        'Diretório dos serviços de referência habilitados pelo SUS para doenças raras no Brasil. Em construção.',
      keywords: ['doenças raras', 'SUS', 'centro de referência', 'ministério da saúde'],
    },
    cardDescription:
      'Os serviços habilitados pelo SUS para diagnóstico e tratamento de doenças raras. Em construção.',
    sourceUrl: 'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/d/doencas-raras',
  },
  {
    slug: 'oncology',
    dbKey: 'oncology',
    subdomain: 'oncologia.mapasus.com.br',
    label: 'Oncologia',
    shortLabel: 'Oncologia',
    status: 'coming-soon',
    theme: 'oncology',
    treatments: [],
    hero: {
      eyebrow: 'Em breve',
      titleLead: 'Centros de alta complexidade',
      titleAccent: 'em oncologia (CACON e UNACON)',
      subtitle:
        'Os hospitais habilitados pelo SUS para tratamento oncológico de alta complexidade, em construção.',
    },
    metadata: {
      title: 'Centros de Alta Complexidade em Oncologia no SUS | MapaSUS',
      description:
        'Diretório dos hospitais habilitados pelo SUS para tratamento oncológico (CACON/UNACON) no Brasil. Em construção.',
      keywords: ['oncologia', 'câncer', 'CACON', 'UNACON', 'SUS', 'ministério da saúde'],
    },
    cardDescription:
      'Os hospitais habilitados pelo SUS para tratamento oncológico de alta complexidade (CACON/UNACON). Em construção.',
    sourceUrl: 'https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/c/cancer',
  },
];

// Derived lookups — the invariant discipline lives here, not in callers.
export const VERTICAL_BY_SLUG: Readonly<Record<string, Vertical>> = Object.fromEntries(
  VERTICALS.map((v) => [v.slug, v]),
);

// Production subdomain → slug. Consumed by `proxy.ts` to route by host.
export const SUBDOMAIN_TO_SLUG: Readonly<Record<string, string>> = Object.fromEntries(
  VERTICALS.map((v) => [v.subdomain, v.slug]),
);

/** Slugs that are statically generated and publicly reachable today. */
export const LIVE_VERTICALS: ReadonlyArray<Vertical> = VERTICALS.filter((v) => v.status === 'live');

export function getVertical(slug: string): Vertical | undefined {
  return VERTICAL_BY_SLUG[slug];
}
