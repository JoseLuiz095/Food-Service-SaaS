export function receiptContactLoadError(error:unknown):string {
 const value=error as {status?:number;details?:string;message?:string}|null;
 if(value?.status===404||['42P01','PGRST202','PGRST205'].includes(value?.details||''))return 'O cadastro de comprovantes está indisponível neste ambiente. A plataforma precisa ativar os contatos por ponto antes de permitir a gravação.';
 if(value?.status===401||value?.status===403)return 'Não foi possível validar seu acesso aos contatos. Entre novamente na sua conta.';
 return 'Não foi possível carregar os contatos. Confira sua conexão e tente novamente.';
}
