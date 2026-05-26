import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Profissionais | Hospitais de Referência',
  description:
    'Consulta técnica de hospitais com CNES, grade completa de soros antiveneno e busca avançada por raio e CEP para profissionais de saúde.',
};

export default function ProfissionaisLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
