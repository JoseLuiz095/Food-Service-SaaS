import CopyableText from './CopyableText';

/** Always leaves the payload selectable, including in browsers that deny clipboard access. */
export default function PixCopyButton({ value, label = 'Código Pix' }: { value: string; label?: string }) {
  const key = label === 'Chave Pix';
  return <CopyableText value={value} label={label} copyLabel={key ? 'Copiar chave Pix' : 'Copiar código Pix'}
    instructions={key ? 'Copie a chave e informe o valor no aplicativo do seu banco.' : 'Copie e cole este código na opção Pix Copia e Cola do seu banco.'}
    copiedMessage={key ? 'Chave Pix copiada. Informe o valor no aplicativo do seu banco.' : 'Código Pix copiado. Cole no aplicativo do seu banco.'}/>;
}
