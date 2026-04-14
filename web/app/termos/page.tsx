import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Termos de Uso | Hospitais de Referência',
  description: 'Termos de uso da API e do site Hospitais de Referência para Animais Peçonhentos.',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-bold text-slate-800 mb-3 pb-2 border-b border-slate-100">{title}</h2>
      <div className="text-sm text-slate-600 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

export default function Termos() {
  const updated = '14 de abril de 2026';

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 bg-slate-700 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Termos de Uso</h1>
        </div>
        <p className="text-xs text-slate-400">Última atualização: {updated}</p>
      </div>

      {/* Aviso de emergência */}
      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-8 flex gap-3">
        <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
        </svg>
        <p className="text-sm text-red-700">
          <strong>Em caso de emergência, ligue imediatamente para o SAMU: 192.</strong> Este serviço é uma ferramenta de referência e não substitui atendimento médico de urgência.
        </p>
      </div>

      <Section title="1. Sobre o serviço">
        <p>
          O <strong>Hospitais de Referência</strong> é um serviço público, gratuito e de código aberto que agrega e disponibiliza,
          em formato estruturado, os dados oficiais dos hospitais habilitados para tratamento de acidentes com animais
          peçonhentos no Brasil, conforme publicados pelo <strong>Ministério da Saúde</strong> em{' '}
          <a href="https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/a/animais-peconhentos/hospitais-de-referencia"
            target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">
            gov.br/saude
          </a>.
        </p>
        <p>
          O serviço é mantido de forma voluntária e opera inteiramente dentro dos limites gratuitos de
          Supabase, Vercel e GitHub Actions. Nenhum dado pessoal é coletado ou comercializado.
        </p>
      </Section>

      <Section title="2. Natureza e precisão dos dados">
        <p>
          Todos os dados exibidos são provenientes exclusivamente de documentos oficiais do Ministério da Saúde.
          Este serviço <strong>não cria, altera nem valida</strong> as informações — apenas as normaliza e disponibiliza
          em formato de fácil acesso.
        </p>
        <p>
          As informações podem estar desatualizadas em relação à situação real de cada unidade de saúde no momento
          da consulta. Hospitais podem ter alterado horários, suspendido atendimentos ou mudado de endereço sem que
          o Ministério da Saúde tenha atualizado a publicação oficial.
        </p>
        <p>
          <strong>Sempre confirme as informações diretamente com a unidade de saúde antes de se deslocar.</strong>
        </p>
      </Section>

      <Section title="3. Uso da API">
        <p>A API é pública e não requer autenticação. Ao utilizá-la, você concorda em:</p>
        <ul className="list-disc list-inside space-y-1 ml-1">
          <li>Respeitar o limite de <strong>15 requisições por minuto por IP</strong>;</li>
          <li>Não realizar varreduras automatizadas em massa ou scraping abusivo;</li>
          <li>Cachear as respostas em sua aplicação — os dados são atualizados uma vez por dia;</li>
          <li>Não se fazer passar por outros usuários ou contornar os mecanismos de rate limit;</li>
          <li>Identificar sua aplicação de forma honesta caso entre em contato solicitando limites maiores.</li>
        </ul>
        <p>
          O serviço depende de infraestrutura gratuita com limites de uso. Requisições abusivas podem afetar
          todos os usuários e levar à suspensão temporária do IP infrator.
        </p>
      </Section>

      <Section title="4. Isenção de responsabilidade">
        <p>
          Este serviço é fornecido <strong>"no estado em que se encontra"</strong>, sem garantias de disponibilidade,
          completude ou atualidade dos dados. Os mantenedores não se responsabilizam por:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-1">
          <li>Decisões tomadas com base nas informações aqui disponibilizadas;</li>
          <li>Interrupções temporárias do serviço;</li>
          <li>Divergências entre os dados exibidos e a situação real das unidades de saúde;</li>
          <li>Eventuais erros introduzidos no processo de extração e normalização dos PDFs oficiais.</li>
        </ul>
      </Section>

      <Section title="5. Propriedade dos dados">
        <p>
          Os dados são de propriedade do <strong>Ministério da Saúde do Brasil</strong> e estão sujeitos às
          condições de uso do portal gov.br. Este projeto apenas os redistribui em formato aberto, sem fins
          lucrativos e sem modificação do conteúdo informacional.
        </p>
        <p>
          O código-fonte deste projeto é aberto e está disponível em{' '}
          <a href="https://github.com/Codar-Sistemas/hospitais-referencia-api"
            target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">
            github.com/Codar-Sistemas/hospitais-referencia-api
          </a>.
        </p>
      </Section>

      <Section title="6. Privacidade">
        <p>
          Este serviço <strong>não coleta dados pessoais</strong>. Não há cadastro, login ou rastreamento de usuários.
          Os únicos dados processados são o endereço IP para fins de rate limiting — não são armazenados de forma
          persistente nem associados a nenhuma identidade.
        </p>
      </Section>

      <Section title="7. Alterações nestes termos">
        <p>
          Estes termos podem ser atualizados a qualquer momento. A data de última atualização é indicada no topo
          desta página. O uso continuado do serviço após alterações implica a aceitação dos novos termos.
        </p>
      </Section>

      <Section title="8. Contato">
        <p>
          Dúvidas, solicitações ou relatos de abuso podem ser enviados via{' '}
          <a href="https://github.com/Codar-Sistemas/hospitais-referencia-api/issues"
            target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">
            GitHub Issues
          </a>.
        </p>
      </Section>

      <div className="mt-10 pt-6 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
        <span>Hospitais de Referência — Codar Sistemas</span>
        <Link href="/" className="text-emerald-600 hover:underline">← Voltar à busca</Link>
      </div>
    </div>
  );
}
