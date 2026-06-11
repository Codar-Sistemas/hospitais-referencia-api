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
import { ONCOLOGY_FILTER_OPTIONS, RARE_DISEASE_FILTER_OPTIONS } from './specialties';

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
  /** Disease-area filter for qualification-based verticals — sent to the
   * API as `?disease=`. Empty for verticals that filter by treatment. */
  diseaseFilterOptions: ReadonlyArray<{ value: string; label: string }>;
  /** PT label for that filter ("Doença" for rare diseases, "Tipo de
   * serviço" for oncology). */
  diseaseFilterLabel: string;
  /** Hero copy for the vertical home. `emergencyNote` renders the red pill
   * under the subtitle — omit it for non-emergency verticals. */
  hero: {
    eyebrow: string;
    titleLead: string;
    titleAccent: string;
    subtitle: string;
    emergencyNote?: string;
  };
  /** "Como funciona" cards on the vertical home (3 expected). */
  howItWorks: ReadonlyArray<{ title: string; body: string }>;
  /** FAQ entries — rendered as <details> blocks AND as FAQPage JSON-LD,
   * so answers must be plain text (no markup). */
  faq: ReadonlyArray<{ question: string; answer: string }>;
  /** Per-vertical SEO. `canonical` is derived as `/${slug}`. */
  metadata: { title: string; description: string; keywords: string[] };
  /** One-line description for the hub card. */
  cardDescription: string;
  /** Official Ministério da Saúde source URL for this vertical's data. */
  sourceUrl: string;
}

export type VerticalTheme = 'venom' | 'rare' | 'oncology';

// Tailwind badge classes per theme. Full CSS-variable theming is a follow-up;
// for now both the hub cards and the cross-vertical result badges read these.
export const THEME_BADGE_CLASS: Readonly<Record<VerticalTheme, string>> = {
  venom: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  rare: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  oncology: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
};

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
    diseaseFilterOptions: [],
    diseaseFilterLabel: 'Doença',
    hero: {
      eyebrow: 'Dados oficiais do Ministério da Saúde',
      titleLead: 'Hospitais com soro antiofídico',
      titleAccent: 'e antiveneno no Brasil',
      subtitle:
        'Encontre a unidade de referência mais próxima em caso de acidente com animais peçonhentos.',
      emergencyNote: 'Em emergência, ligue para o SAMU: 192',
    },
    howItWorks: [
      {
        title: '1. Dados oficiais',
        body: 'Os PDFs publicados pelo Ministério da Saúde para cada estado são monitorados todos os dias. Quando um arquivo muda, a base é atualizada automaticamente.',
      },
      {
        title: '2. Busca inteligente',
        body: 'Localize a unidade de referência mais próxima por cidade, CEP ou tipo de animal. Resultados ordenados por distância quando coordenadas estão disponíveis.',
      },
      {
        title: '3. Pronto para emergência',
        body: 'Cada hospital traz telefone, endereço, CNES e a lista exata de soros disponíveis (botrópico, crotálico, elapídico, escorpiônico e outros).',
      },
    ],
    faq: [
      {
        question: 'O que são animais peçonhentos?',
        answer:
          'Animais peçonhentos são aqueles que produzem veneno e possuem um mecanismo para inoculá-lo, como cobras (jararaca, cascavel, coral, surucucu), escorpiões, aranhas (armadeira, marrom) e lagartas (Lonomia). No Brasil, acidentes com esses animais são tratados como urgência médica no SUS.',
      },
      {
        question: 'O que devo fazer em caso de acidente?',
        answer:
          'Ligue imediatamente para o SAMU (192). Mantenha a pessoa acidentada calma e em repouso, com o membro afetado elevado se possível. Não faça torniquete, não corte a região, não chupe o veneno. Lave o local com água e sabão e procure o hospital de referência mais próximo — esta ferramenta ajuda você a identificá-lo.',
      },
      {
        question: 'De onde vêm os dados?',
        answer:
          'Os dados vêm dos PDFs oficiais publicados pelo Ministério da Saúde em gov.br/saude. Eles são lidos automaticamente todos os dias e estruturados para facilitar a busca. Nenhum dado é inventado — apenas normalizado.',
      },
      {
        question: 'Quais tipos de soro existem?',
        answer:
          'Os principais são: soro antibotrópico (jararaca, urutu), soro anticrotálico (cascavel), soro antielapídico (coral-verdadeira), soro antilaquético (surucucu), soro antiescorpiônico, soro antiloxoscélico (aranha marrom), soro antifoneutrico (aranha armadeira) e soro antilonômico (lagarta-de-fogo). Nem todo hospital tem todos os tipos — esta ferramenta mostra exatamente quais cada unidade disponibiliza.',
      },
      {
        question: 'A API é gratuita?',
        answer:
          'Sim. A API REST é pública, gratuita, sem autenticação e documentada na rota /docs. Há rate limit de 15 requisições por minuto por IP para proteger contra abusos. Para casos de uso institucional com volume maior, abra uma issue no GitHub do projeto.',
      },
    ],
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
    status: 'live',
    theme: 'rare',
    treatments: [],
    diseaseFilterOptions: RARE_DISEASE_FILTER_OPTIONS,
    diseaseFilterLabel: 'Doença',
    hero: {
      eyebrow: 'Dados oficiais do Ministério da Saúde',
      titleLead: 'Centros de referência em',
      titleAccent: 'doenças raras no SUS',
      subtitle:
        'Encontre os Serviços de Referência, de Atenção Especializada e de Terapia Gênica habilitados pelo SUS para diagnóstico e tratamento de doenças raras.',
    },
    howItWorks: [
      {
        title: '1. Dados oficiais',
        body: 'As planilhas de estabelecimentos habilitados publicadas pelo Ministério da Saúde são monitoradas todos os dias. Quando um arquivo muda, a base é atualizada automaticamente.',
      },
      {
        title: '2. Busca inteligente',
        body: 'Localize o serviço habilitado mais próximo por cidade ou CEP. Resultados ordenados por distância quando coordenadas estão disponíveis.',
      },
      {
        title: '3. Informações completas',
        body: 'Cada serviço traz endereço, telefone e CNES, enriquecidos diretamente do Cadastro Nacional de Estabelecimentos de Saúde (CNES).',
      },
    ],
    faq: [
      {
        question: 'O que são doenças raras?',
        answer:
          'Doenças raras são aquelas que afetam até 65 pessoas a cada 100 mil habitantes. Existem entre 6 e 8 mil tipos conhecidos — cerca de 80% têm origem genética. No Brasil, estima-se que 13 milhões de pessoas convivam com alguma doença rara, e o SUS oferece diagnóstico e tratamento em serviços especializados habilitados pelo Ministério da Saúde.',
      },
      {
        question: 'O que é um Serviço de Referência em Doenças Raras?',
        answer:
          'É um estabelecimento de saúde habilitado pelo Ministério da Saúde para diagnóstico, tratamento e acompanhamento de pessoas com doenças raras, com equipe multidisciplinar e exames especializados. Há também Serviços de Atenção Especializada, com escopo complementar. A habilitação é formalizada por portaria e publicada pelo Ministério.',
      },
      {
        question: 'O que é o serviço de terapia gênica?',
        answer:
          'É a categoria de habilitação mais recente: centros autorizados a aplicar terapias gênicas pelo SUS, como o tratamento da atrofia muscular espinhal (AME). Por exigirem infraestrutura e treinamento específicos, poucos hospitais no país possuem essa habilitação.',
      },
      {
        question: 'De onde vêm os dados?',
        answer:
          'Das planilhas oficiais de estabelecimentos habilitados publicadas pelo Ministério da Saúde em gov.br/saude, lidas automaticamente todos os dias. Endereços, telefones e coordenadas são complementados com o Cadastro Nacional de Estabelecimentos de Saúde (CNES). Nenhum dado é inventado — apenas normalizado.',
      },
      {
        question: 'A API é gratuita?',
        answer:
          'Sim. A API REST é pública, gratuita, sem autenticação e documentada na rota /docs. Há rate limit de 15 requisições por minuto por IP para proteger contra abusos.',
      },
    ],
    metadata: {
      title: 'Centros de Referência em Doenças Raras no SUS | Brasil',
      description:
        'Encontre os serviços habilitados pelo SUS para doenças raras e terapia gênica. Busca por cidade ou CEP. Dados oficiais do Ministério da Saúde.',
      keywords: [
        'doenças raras',
        'SUS',
        'centro de referência',
        'serviço de referência em doenças raras',
        'terapia gênica',
        'AME',
        'ministério da saúde',
        'CNES',
      ],
    },
    cardDescription:
      'Os serviços habilitados pelo SUS para diagnóstico e tratamento de doenças raras, incluindo terapia gênica.',
    sourceUrl:
      'https://www.gov.br/saude/pt-br/composicao/saes/doencas-raras/politica-de-saude/estabelecimentos-habilitados',
  },
  {
    slug: 'oncology',
    dbKey: 'oncology',
    subdomain: 'oncologia.mapasus.com.br',
    label: 'Oncologia',
    shortLabel: 'Oncologia',
    status: 'live',
    theme: 'oncology',
    treatments: [],
    diseaseFilterOptions: ONCOLOGY_FILTER_OPTIONS,
    diseaseFilterLabel: 'Tipo de serviço',
    hero: {
      eyebrow: 'Dados oficiais do Ministério da Saúde',
      titleLead: 'Hospitais habilitados em',
      titleAccent: 'oncologia pelo SUS',
      subtitle:
        'Encontre os CACON, UNACON e serviços de radioterapia, reconstrução mamária e tratamento sincrônico habilitados pelo SUS em todo o Brasil.',
    },
    howItWorks: [
      {
        title: '1. Dados oficiais',
        body: 'As planilhas de hospitais habilitados publicadas pela Coordenação-Geral de Câncer do Ministério da Saúde são monitoradas todos os dias. Quando um arquivo muda, a base é atualizada automaticamente.',
      },
      {
        title: '2. Busca inteligente',
        body: 'Localize o hospital habilitado mais próximo por cidade ou CEP, filtrando por tipo de serviço (CACON, UNACON, radioterapia, oncologia pediátrica e outros).',
      },
      {
        title: '3. Informações completas',
        body: 'Cada hospital traz endereço, telefone e CNES, enriquecidos diretamente do Cadastro Nacional de Estabelecimentos de Saúde (CNES).',
      },
    ],
    faq: [
      {
        question: 'O que são CACON e UNACON?',
        answer:
          'São as duas categorias de habilitação em alta complexidade em oncologia no SUS. UNACON (Unidade de Assistência de Alta Complexidade em Oncologia) trata os cânceres mais prevalentes; CACON (Centro de Assistência de Alta Complexidade em Oncologia) é habilitado para todos os tipos de câncer e obrigatoriamente oferece radioterapia. Ambos podem ter serviços adicionais, como hematologia e oncologia pediátrica.',
      },
      {
        question: 'Como conseguir tratamento oncológico pelo SUS?',
        answer:
          'O acesso começa pela rede básica de saúde: com a suspeita ou diagnóstico, o paciente é encaminhado a um hospital habilitado pela regulação do SUS. A Lei nº 12.732/2012 garante o início do tratamento em até 60 dias a partir do diagnóstico registrado. Esta ferramenta ajuda a conhecer os hospitais habilitados da sua região.',
      },
      {
        question: 'O que é a habilitação em reconstrução mamária?',
        answer:
          'A reconstrução mamária pós-mastectomia é um direito garantido por lei às pacientes do SUS. Os hospitais com a habilitação específica (código 17.23) realizam a cirurgia plástica reparadora da mama, na mesma operação do tratamento ou posteriormente.',
      },
      {
        question: 'De onde vêm os dados?',
        answer:
          'Das planilhas oficiais de hospitais habilitados publicadas pela Coordenação-Geral de Câncer (CGCAN) do Ministério da Saúde em gov.br/saude, lidas automaticamente todos os dias. Endereços, telefones e coordenadas são complementados com o Cadastro Nacional de Estabelecimentos de Saúde (CNES). Nenhum dado é inventado — apenas normalizado.',
      },
      {
        question: 'A API é gratuita?',
        answer:
          'Sim. A API REST é pública, gratuita, sem autenticação e documentada na rota /docs. Há rate limit de 15 requisições por minuto por IP para proteger contra abusos.',
      },
    ],
    metadata: {
      title: 'Hospitais Habilitados em Oncologia no SUS | CACON e UNACON',
      description:
        'Encontre os hospitais habilitados pelo SUS em oncologia: CACON, UNACON, radioterapia e reconstrução mamária. Dados oficiais do Ministério da Saúde.',
      keywords: [
        'oncologia',
        'câncer',
        'CACON',
        'UNACON',
        'radioterapia',
        'quimioterapia',
        'oncologia pediátrica',
        'reconstrução mamária',
        'SUS',
        'ministério da saúde',
        'CNES',
      ],
    },
    cardDescription:
      'Os hospitais habilitados pelo SUS em alta complexidade oncológica: CACON, UNACON, radioterapia, reconstrução mamária e tratamento sincrônico.',
    sourceUrl: 'https://www.gov.br/saude/pt-br/composicao/saes/cgcan/hospitais-habilitados',
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

// DB key (snake_case) → vertical. The cross-vertical /v1/search returns
// `active_verticals` as DB keys; the hub maps them back to slug/label/theme.
export const VERTICAL_BY_DB_KEY: Readonly<Record<string, Vertical>> = Object.fromEntries(
  VERTICALS.map((v) => [v.dbKey, v]),
);

/** Slugs that are statically generated and publicly reachable today. */
export const LIVE_VERTICALS: ReadonlyArray<Vertical> = VERTICALS.filter((v) => v.status === 'live');

export function getVertical(slug: string): Vertical | undefined {
  return VERTICAL_BY_SLUG[slug];
}
