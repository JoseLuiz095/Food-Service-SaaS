export type BillingVisualLevel = 'current' | 'warning' | 'overdue' | 'hidden';

export type BillingVisualStatus = {
  visible: boolean;
  level: BillingVisualLevel;
  label: string;
  caption: string;
  daysToDue?: number;
  overdue: boolean;
  dueSoon: boolean;
};

const dateBr = (value?: string) => {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
};

export const daysUntilBillingDate = (value?: string) => {
  if (!value) return undefined;
  const target = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (!Number.isFinite(target.getTime())) return undefined;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
};

export const getBillingVisualStatus = (input: {
  billingState?: string | null;
  nextDueDate?: string;
  dueDay?: number;
  warningDays?: number;
}): BillingVisualStatus => {
  const warningDays = Math.max(1, input.warningDays ?? 7);
  const daysToDue = daysUntilBillingDate(input.nextDueDate);
  const visible = Boolean(input.billingState && !['trial', 'none'].includes(input.billingState));

  if (!visible) {
    return {
      visible: false,
      level: 'hidden',
      label: '',
      caption: '',
      daysToDue,
      overdue: false,
      dueSoon: false,
    };
  }

  const overdue = input.billingState === 'overdue' || (daysToDue !== undefined && daysToDue < 0);
  const dueSoon = !overdue && daysToDue !== undefined && daysToDue <= warningDays;

  if (overdue) {
    return {
      visible: true,
      level: 'overdue',
      label: 'Mensalidade atrasada',
      caption: input.nextDueDate ? `Venceu em ${dateBr(input.nextDueDate)}` : 'Pagamento pendente',
      daysToDue,
      overdue,
      dueSoon,
    };
  }

  if (dueSoon) {
    const caption = daysToDue === 0
      ? `Vence hoje - ${dateBr(input.nextDueDate)}`
      : `Vence em ${daysToDue} dia(s) - ${dateBr(input.nextDueDate)}`;
    return {
      visible: true,
      level: 'warning',
      label: 'Vencimento próximo',
      caption,
      daysToDue,
      overdue,
      dueSoon,
    };
  }

  return {
    visible: true,
    level: 'current',
    label: 'Mensalidade em dia',
    caption: input.nextDueDate ? `Próximo ${dateBr(input.nextDueDate)}` : `Dia ${input.dueDay || '—'}`,
    daysToDue,
    overdue,
    dueSoon,
  };
};
