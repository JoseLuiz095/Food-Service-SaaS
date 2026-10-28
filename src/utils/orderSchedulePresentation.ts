import { storeDateKey } from './storeHours';
import type { Order } from '../types';
export function orderSchedulePresentation(order:Pick<Order,'status'|'scheduledFor'>,now: number,zone='America/Sao_Paulo'){
 const date=order.scheduledFor?new Date(order.scheduledFor):null;
 if(!date||!Number.isFinite(date.getTime())||['delivered','picked_up','cancelled'].includes(order.status))return null;
 let timezone=zone;try{new Intl.DateTimeFormat('pt-BR',{timeZone:timezone}).format(date)}catch{timezone='America/Sao_Paulo'}
 const future=storeDateKey(date,timezone)>storeDateKey(new Date(now),timezone);
 const today=storeDateKey(date,timezone)===storeDateKey(new Date(now),timezone);
 const overdue=date.getTime()<now;
 const dateTime=new Intl.DateTimeFormat('pt-BR',{timeZone:timezone,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(date);
 return {future,overdue,label:`${future?'Agendado · próximos dias':overdue?'Agendado · prazo vencido':today?'Agendado · hoje':'Agendado'}: ${dateTime}`,timezone};
}
