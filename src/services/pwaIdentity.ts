import { useEffect } from 'react';

type Identity = { kind:'customer'|'admin'|'master'; slug?:string; storeId?:string; name?:string; iconUrl?:string; root?:boolean };

export function usePwaIdentity(identity:Identity|null) {
  useEffect(()=>{
    if(!identity)return;
    const manifest=document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if(!manifest)return;
    const params=new URLSearchParams({kind:identity.kind});
    if(identity.slug)params.set('slug',identity.slug);
    if(identity.storeId)params.set('store',identity.storeId);
    if(identity.name)params.set('name',identity.name);
    if(identity.iconUrl)params.set('icon',identity.iconUrl);
    if(identity.root)params.set('root','1');
    manifest.href=`/_pwa/manifest.webmanifest?${params}`;
    const appleIcon=document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if(appleIcon&&identity.iconUrl)appleIcon.href=`/_pwa/icon?src=${encodeURIComponent(identity.iconUrl)}&size=180`;
    const appleTitle=document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    if(appleTitle)appleTitle.content=identity.kind==='master'?'Admin Master':(identity.name||'VendeWeb').slice(0,24);
    return ()=>{
      manifest.href='/manifest.webmanifest';
      if(appleIcon)appleIcon.href='/assets/vendeweb-apple-touch-180.png';
      if(appleTitle)appleTitle.content='VendeWeb';
    };
  },[identity?.kind,identity?.slug,identity?.storeId,identity?.name,identity?.iconUrl,identity?.root]);
}
