import type { Metadata } from 'next';
import { getVertical } from '@/lib/verticals';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ vertical: string }>;
}): Promise<Metadata> {
  const { vertical } = await params;
  const v = getVertical(vertical);
  const label = v?.label ?? 'MapaSUS';
  return {
    title: `Profissionais — ${label}`,
    description:
      'Consulta técnica com CNES, grade completa de soros e busca avançada por raio e CEP para profissionais de saúde.',
    alternates: v ? { canonical: `/${v.slug}/profissionais` } : undefined,
  };
}

export default function ProfissionaisLayout({ children }: { children: React.ReactNode }) {
  return children;
}
