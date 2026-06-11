import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import HospitalLocationMap from '@/components/hospital/HospitalLocationMap';
import WarningIcon from '@/components/WarningIcon';
import { fetchHospital } from '@/lib/api-client';
import { TREATMENT_LABEL_BY_VALUE } from '@/lib/constants';
import { specialtyBadges } from '@/lib/specialties';
import { getVertical, type Vertical } from '@/lib/verticals';
import type { Hospital } from '@/lib/types';

// Detail page for one hospital inside a vertical. The data comes from the
// vertical-scoped API lookup, so an id outside the vertical 404s and the
// `specialties` carry only this vertical's qualifications. ISR keeps it a
// fast static-ish page without a build-time id list.
export const revalidate = 600;

async function loadHospital(
  verticalSlug: string,
  id: string,
): Promise<{ v: Vertical; hospital: Hospital } | null> {
  const v = getVertical(verticalSlug);
  if (!v || !/^\d+$/.test(id)) return null;
  try {
    return { v, hospital: await fetchHospital(v.apiSlug, id) };
  } catch {
    // 404 from the API (wrong vertical / unknown id) or transient failure.
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ vertical: string; id: string }>;
}): Promise<Metadata> {
  const { vertical, id } = await params;
  const data = await loadHospital(vertical, id);
  if (!data) return {};
  const { v, hospital } = data;
  const title = `${hospital.name} — ${hospital.city}/${hospital.state_code}`;
  const description = `${v.label}: endereço, telefone e habilitações de ${hospital.name} em ${hospital.city} (${hospital.state_code}), conforme dados oficiais do Ministério da Saúde.`;
  return {
    title: { absolute: `${title} | MapaSUS` },
    description,
    alternates: { canonical: `/${v.slug}/hospital/${id}` },
    openGraph: { title, description, locale: 'pt_BR', type: 'website' },
  };
}

export default async function HospitalPage({
  params,
}: {
  params: Promise<{ vertical: string; id: string }>;
}) {
  const { vertical, id } = await params;
  const data = await loadHospital(vertical, id);
  if (!data) notFound();
  const { v, hospital } = data;

  // Venomous answers "what does it treat" with the treatments vocabulary;
  // qualification verticals (rare diseases, oncology) with specialty badges.
  const isVenomous = v.treatments.length > 0;
  const badges = isVenomous
    ? hospital.treatments.map((t) => TREATMENT_LABEL_BY_VALUE[t] ?? t)
    : specialtyBadges(hospital);

  const mapsUrl = hospital.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${hospital.name} ${hospital.address} ${hospital.city}`,
      )}`
    : null;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link
        href={`/${v.slug}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-accent-600 transition-colors"
      >
        ← Voltar à busca de {v.label}
      </Link>

      <div className="mt-4 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h1 className="text-2xl font-bold text-slate-900 leading-tight">{hospital.name}</h1>
        <p className="text-sm text-slate-400 mt-1">
          {hospital.city} · {hospital.state_code}
        </p>

        {hospital.requires_verification && (
          <div className="mt-4 flex items-start gap-2.5 text-xs bg-red-50 text-red-900 ring-2 ring-red-300 rounded-lg px-3 py-2.5">
            <WarningIcon className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
            <div className="space-y-1">
              <p className="font-bold uppercase tracking-wide text-red-700 text-[11px]">
                ⚠ Dados não verificados
              </p>
              <p className="leading-snug">
                Estas informações foram extraídas <strong>automaticamente de uma imagem</strong> do
                PDF oficial e <strong>podem conter erros de leitura</strong>. Sempre confirme por
                telefone antes de se deslocar.
              </p>
            </div>
          </div>
        )}

        {badges.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {badges.map((b) => (
              <span
                key={b}
                className="text-xs font-medium px-2.5 py-1 rounded-full bg-accent-50 text-accent-700 ring-1 ring-accent-200"
              >
                {b}
              </span>
            ))}
          </div>
        )}

        <dl className="mt-6 space-y-4 text-sm">
          {hospital.address && (
            <div>
              <dt className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Endereço
              </dt>
              <dd className="mt-0.5 text-slate-700">
                {hospital.address}
                {mapsUrl && (
                  <>
                    {' '}
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent-600 hover:underline whitespace-nowrap"
                    >
                      Ver no Google Maps ↗
                    </a>
                  </>
                )}
              </dd>
            </div>
          )}
          {hospital.phones && (
            <div>
              <dt className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Telefone
              </dt>
              <dd className="mt-0.5">
                <a
                  href={`tel:${hospital.phones.replace(/\D/g, '')}`}
                  className="text-slate-700 hover:text-accent-600 transition-colors"
                >
                  {hospital.phones}
                </a>
              </dd>
            </div>
          )}
          {hospital.cnes && (
            <div>
              <dt className="text-xs font-semibold text-slate-400 uppercase tracking-wide">CNES</dt>
              <dd className="mt-0.5 font-mono text-slate-700">{hospital.cnes}</dd>
            </div>
          )}
        </dl>

        <p className="mt-6 text-xs text-slate-400 leading-relaxed">
          Dados oficiais do Ministério da Saúde, normalizados pelo MapaSUS. As informações podem
          estar desatualizadas — confirme com a unidade antes de se deslocar. Em emergência, ligue{' '}
          <a href="tel:192" className="text-red-600 font-semibold underline">
            192 (SAMU)
          </a>
          .
        </p>
      </div>

      {hospital.lat && hospital.lng && (
        <div className="mt-6">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Localização aproximada
          </h2>
          <HospitalLocationMap hospital={hospital} />
          <p className="mt-2 text-[11px] text-slate-400">
            Posição obtida por geocodificação automática do endereço — pode conter imprecisões.
          </p>
        </div>
      )}
    </div>
  );
}
