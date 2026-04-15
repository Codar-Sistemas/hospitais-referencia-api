export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://hospitais-referencia-api.vercel.app';

export const ESTADOS = [
  { uf: 'AC', nome: 'Acre' }, { uf: 'AL', nome: 'Alagoas' },
  { uf: 'AM', nome: 'Amazonas' }, { uf: 'AP', nome: 'Amapá' },
  { uf: 'BA', nome: 'Bahia' }, { uf: 'CE', nome: 'Ceará' },
  { uf: 'DF', nome: 'Distrito Federal' }, { uf: 'ES', nome: 'Espírito Santo' },
  { uf: 'GO', nome: 'Goiás' }, { uf: 'MA', nome: 'Maranhão' },
  { uf: 'MG', nome: 'Minas Gerais' }, { uf: 'MS', nome: 'Mato Grosso do Sul' },
  { uf: 'MT', nome: 'Mato Grosso' }, { uf: 'PA', nome: 'Pará' },
  { uf: 'PB', nome: 'Paraíba' }, { uf: 'PE', nome: 'Pernambuco' },
  { uf: 'PI', nome: 'Piauí' }, { uf: 'PR', nome: 'Paraná' },
  { uf: 'RJ', nome: 'Rio de Janeiro' }, { uf: 'RN', nome: 'Rio Grande do Norte' },
  { uf: 'RO', nome: 'Rondônia' }, { uf: 'RR', nome: 'Roraima' },
  { uf: 'RS', nome: 'Rio Grande do Sul' }, { uf: 'SC', nome: 'Santa Catarina' },
  { uf: 'SE', nome: 'Sergipe' }, { uf: 'SP', nome: 'São Paulo' },
  { uf: 'TO', nome: 'Tocantins' },
];

export const ANIMAIS = [
  { valor: 'botropico',    label: 'Cobra / Jararaca',       emoji: '🐍' },
  { valor: 'crotalico',    label: 'Cascavel',                emoji: '🐍' },
  { valor: 'elapidico',    label: 'Cobra Coral',             emoji: '🐍' },
  { valor: 'laquetico',    label: 'Surucucu',                emoji: '🐍' },
  { valor: 'escorpionico', label: 'Escorpião',               emoji: '🦂' },
  { valor: 'loxoscelico',  label: 'Aranha Marrom',           emoji: '🕷️' },
  { valor: 'foneutrico',   label: 'Aranha Armadeira',        emoji: '🕷️' },
  { valor: 'lonomico',     label: 'Lagarta (Lonomia)',       emoji: '🐛' },
];

export interface Hospital {
  id: number;
  uf: string;
  municipio: string;
  unidade: string;
  endereco: string | null;
  telefones: string | null;
  cnes: string | null;
  atendimentos: string[];
  lat?: number | null;
  lng?: number | null;
  distancia_m?: number;
  distancia_km?: number;
  /**
   * Origem dos dados:
   * - 'pdf_texto' (default): extraído de PDF com camada de texto, confiável.
   * - 'pdf_ocr': extraído de PDF escaneado via Tesseract OCR — pode conter
   *   erros de reconhecimento, deve ser exibido com aviso de verificação.
   */
  fonte_extracao?: 'pdf_texto' | 'pdf_ocr';
  /** Score médio de confidence do OCR (0-100). Null quando fonte_extracao = pdf_texto. */
  confianca_ocr?: number | null;
  /** Flag computada no banco — true quando fonte_extracao = 'pdf_ocr'. */
  requer_verificacao?: boolean;
}

export async function buscarHospitais(params: {
  uf?: string;
  municipio?: string;
  atendimento?: string;
  q?: string;
  limit?: number;
}): Promise<Hospital[]> {
  const url = new URL(`${API_BASE}/v1/hospitais`);
  Object.entries(params).forEach(([k, v]) => {
    if (v) url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString(), { next: { revalidate: 600 } });
  if (!res.ok) throw new Error('Erro ao buscar hospitais');
  const data = await res.json();
  return data.hospitais ?? [];
}

export async function buscarProximos(params: {
  cep?: string;
  lat?: number;
  lng?: number;
  cidade?: string;
  uf?: string;
  atendimento?: string;
  raio?: number;
  limit?: number;
}): Promise<{ hospitais: Hospital[]; origem: Record<string, unknown> }> {
  const url = new URL(`${API_BASE}/v1/hospitais/proximos`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString(), { cache: 'no-store' });
  if (!res.ok) throw new Error('Erro ao buscar hospitais próximos');
  return res.json();
}
