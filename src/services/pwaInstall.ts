export type InstallEvent = Event & { prompt:()=>Promise<void>; userChoice:Promise<{outcome:'accepted'|'dismissed'}> };
let pending:InstallEvent|null=null;
const listeners=new Set<()=>void>();
const notify=()=>listeners.forEach(listener=>listener());

export const startInstallCapture=()=>{
  if(typeof window==='undefined')return;
  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();pending=event as InstallEvent;notify();
  });
  window.addEventListener('appinstalled',()=>{pending=null;notify()});
};
export const getInstallPrompt=()=>pending;
export const subscribeInstallPrompt=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)};};
export const installPwa=async()=>{
  const event=pending;
  if(!event)return false;
  pending=null;notify();
  await event.prompt();
  return (await event.userChoice).outcome==='accepted';
};
