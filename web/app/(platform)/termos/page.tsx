import type { Metadata } from 'next';
import Link from 'next/link';
import WarningIcon from '@/components/WarningIcon';

export const metadata: Metadata = {
  title: 'Termos de Uso',
  description: 'Termos de uso da API e do site MapaSUS — estabelecimentos de referência do SUS.',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-bold text-slate-800 mb-3 pb-2 border-b border-slate-100">
        {title}
      </h2>
      <div className="text-sm text-slate-600 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

export default function Termos() {
  const updated = '11 de junho de 2026';

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 bg-slate-700 rounded-lg flex items-center justify-center">
            <svg
              className="w-4 h-4 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Termos de Uso</h1>
        </div>
        <p className="text-xs text-slate-400">Última atualização: {updated}</p>
      </div>

      {/* Aviso de emergência */}
      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-8 flex gap-3">
        <WarningIcon className="w-5 h-5 text-red-500 shrink-0 mt-0.5" strokeWidth={2} />
        <p className="text-sm text-red-700">
          <strong>Em caso de emergência, ligue imediatamente para o SAMU: 192.</strong> Este serviço
          é uma ferramenta de referência e não substitui atendimento médico de urgência.
        </p>
      </div>

      <Section title="1. Sobre o serviço">
        <p>
          O <strong>MapaSUS</strong> é um serviço público, gratuito e de código aberto que agrega e
          disponibiliza, em formato estruturado, os dados oficiais dos estabelecimentos habilitados
          pelo SUS — animais peçonhentos, doenças raras, oncologia e demais áreas que venham a ser
          incorporadas — conforme publicados pelo <strong>Ministério da Saúde</strong> em{' '}
          <a
            href="https://www.gov.br/saude"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-600 hover:underline"
          >
            gov.br/saude
          </a>
          . A fonte oficial específica de cada área está indicada no rodapé da respectiva página.
        </p>
        <p>
          O serviço é mantido de forma voluntária e opera inteiramente dentro dos limites gratuitos
          de Supabase, Vercel e GitHub Actions. Nenhum dado é comercializado.
        </p>
      </Section>

      <Section title="2. Natureza e precisão dos dados">
        <p>
          Todos os dados exibidos são provenientes exclusivamente de documentos oficiais do
          Ministério da Saúde (PDFs e planilhas). Este serviço{' '}
          <strong>não cria, altera nem valida</strong> as informações — apenas as normaliza e
          disponibiliza em formato de fácil acesso.
        </p>
        <p>
          As <strong>coordenadas geográficas</strong> exibidas nos mapas são derivadas por
          geocodificação automática dos endereços oficiais (Nominatim/OpenStreetMap e dados abertos
          do CNES) e podem conter imprecisões — não constam dos documentos originais.
        </p>
        <p>
          As informações podem estar desatualizadas em relação à situação real de cada unidade de
          saúde no momento da consulta. Hospitais podem ter alterado horários, suspendido
          atendimentos ou mudado de endereço sem que o Ministério da Saúde tenha atualizado a
          publicação oficial.
        </p>
        <p>
          <strong>
            Sempre confirme as informações diretamente com a unidade de saúde antes de se deslocar.
          </strong>
        </p>
      </Section>

      <Section title="3. Uso da API">
        <p>A API é pública e não requer autenticação. Ao utilizá-la, você concorda em:</p>
        <ul className="list-disc list-inside space-y-1 ml-1">
          <li>
            Respeitar o limite de <strong>15 requisições por minuto por IP</strong>;
          </li>
          <li>Não realizar varreduras automatizadas em massa ou scraping abusivo;</li>
          <li>Cachear as respostas em sua aplicação — os dados são atualizados uma vez por dia;</li>
          <li>Não se fazer passar por outros usuários ou contornar os mecanismos de rate limit;</li>
          <li>
            Identificar sua aplicação de forma honesta caso entre em contato solicitando limites
            maiores.
          </li>
        </ul>
        <p>
          O serviço depende de infraestrutura gratuita com limites de uso. Requisições abusivas
          podem afetar todos os usuários e levar à suspensão temporária do IP infrator.
        </p>
      </Section>

      <Section title="4. Isenção de responsabilidade">
        <p>
          Este serviço é fornecido <strong>&quot;no estado em que se encontra&quot;</strong>, sem
          garantias de disponibilidade, completude ou atualidade dos dados. Os mantenedores não se
          responsabilizam por:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-1">
          <li>Decisões tomadas com base nas informações aqui disponibilizadas;</li>
          <li>Interrupções temporárias do serviço;</li>
          <li>Divergências entre os dados exibidos e a situação real das unidades de saúde;</li>
          <li>
            Eventuais erros introduzidos no processo de extração e normalização dos documentos
            oficiais (PDFs e planilhas) ou na geocodificação automática dos endereços.
          </li>
        </ul>
      </Section>

      <Section title="5. Propriedade dos dados">
        <p>
          Os dados são de propriedade do <strong>Ministério da Saúde do Brasil</strong> e estão
          sujeitos às condições de uso do portal gov.br. Este projeto apenas os redistribui em
          formato aberto, sem fins lucrativos e sem modificação do conteúdo informacional.
        </p>
        <p>
          O código-fonte deste projeto é aberto e está disponível em{' '}
          <a
            href="https://github.com/Codar-Sistemas/hospitais-referencia-api"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-600 hover:underline"
          >
            github.com/Codar-Sistemas/hospitais-referencia-api
          </a>
          .
        </p>
      </Section>

      <Section title="6. Privacidade">
        <p>
          Este serviço <strong>não exige cadastro nem login</strong> e não usa cookies de
          rastreamento. Não é possível identificar usuários individualmente.
        </p>
        <p>
          Para operar e melhorar o serviço, registramos <strong>métricas de uso</strong>: tipo de
          busca, filtros aplicados e a UF derivada do CEP consultado. O endereço IP{' '}
          <strong>nunca é armazenado em texto claro</strong> — ele é transformado em um hash
          irreversível (SHA-256 com salt), usado apenas para rate limiting e para a contagem
          agregada de usuários únicos.
        </p>
        <p>
          Essas métricas são <strong>apagadas automaticamente após 30 dias</strong> e publicadas
          somente de forma agregada na página de{' '}
          <Link href="/estatisticas" className="text-emerald-600 hover:underline">
            Estatísticas
          </Link>
          . Nenhum dado é comercializado ou compartilhado com terceiros.
        </p>
      </Section>

      <Section title="7. Alterações nestes termos">
        <p>
          Estes termos podem ser atualizados a qualquer momento. A data de última atualização é
          indicada no topo desta página. O uso continuado do serviço após alterações implica a
          aceitação dos novos termos.
        </p>
      </Section>

      <Section title="8. Contato">
        <p>
          Dúvidas, solicitações ou relatos de abuso podem ser enviados via{' '}
          <a
            href="https://github.com/Codar-Sistemas/hospitais-referencia-api/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-600 hover:underline"
          >
            GitHub Issues
          </a>
          .
        </p>
      </Section>

      <div className="mt-10 pt-6 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
        <span>MapaSUS — Codar Sistemas</span>
        <Link href="/" className="text-emerald-600 hover:underline">
          ← Voltar ao início
        </Link>
      </div>
    </div>
  );
}
