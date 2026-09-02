export type CepAddress = {
  cep: string;
  street: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
};

type ViaCepResponse = {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

export async function lookupCep(value: string, signal?: AbortSignal): Promise<CepAddress> {
  const cep = value.replace(/\D/g, '');
  if (cep.length !== 8) throw new Error('Informe um CEP com 8 dígitos.');

  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal });
  if (!response.ok) throw new Error('Não foi possível consultar o CEP agora.');
  const data = await response.json() as ViaCepResponse;
  if (data.erro) throw new Error('CEP não encontrado. Confira os números informados.');

  return {
    cep: data.cep || value,
    street: data.logradouro || '',
    complement: data.complemento || '',
    neighborhood: data.bairro || '',
    city: data.localidade || '',
    state: data.uf || '',
  };
}
