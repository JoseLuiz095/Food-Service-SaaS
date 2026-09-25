import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const mode=process.argv[2];
if(!['food','flori'].includes(mode)){
  console.error('ERRO: informe food ou flori.');
  process.exit(2);
}

const cfg=mode==='food'?{
  name:'foodservice-saas',from:'0.5.7',to:'0.5.8',
  placeholder:'placeholder-food.svg',
  landing:'src/pages/store/Landing.tsx',
  marker:'DEMO_FLOW_VALUE_20260921_V2',
  smokeLabel:'FoodWeb v0.5.8',
}:{
  name:'floriweb',from:'3.0.0-rc.6.13',to:'3.0.0-rc.6.14',
  placeholder:'placeholder-flower.svg',
  landing:'src/pages/store/Landing.tsx',
  marker:'DEMO_FLOW_VALUE_20260921_V2',
  smokeLabel:'FloriWeb RC6.14',
};

const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const write=(p,s)=>{const full=path.join(root,p);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,s,'utf8')};
const exists=(p)=>fs.existsSync(path.join(root,p));
const payload=(p)=>fs.readFileSync(path.join(root,'payload',p),'utf8');
const timestamp=()=>new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);

if(!exists('package.json')){console.error('ERRO: package.json nao encontrado. Execute na raiz do projeto.');process.exit(3)}
const pkg=JSON.parse(read('package.json'));
if(pkg.name!==cfg.name){console.error(`ERRO: projeto ${pkg.name}; esperado ${cfg.name}.`);process.exit(4)}
if(![cfg.from,cfg.to].includes(pkg.version)){
  console.error(`ERRO: versao ${pkg.version}; esperado ${cfg.from} ou ${cfg.to}.`);
  process.exit(5);
}

const backupDir=path.join(root,`_BACKUP_${mode.toUpperCase()}_${cfg.to.replaceAll('.','_').replaceAll('-','_')}_${timestamp()}`);
fs.mkdirSync(backupDir,{recursive:true});
const touched=[
  'package.json','package-lock.json','scripts/smoke.mjs',cfg.landing,'src/styles.css',
  'src/components/marketing/InteractiveShowcase.tsx','src/components/marketing/ExistingValueSection.tsx',
  `public/assets/${cfg.placeholder}`,
].filter(exists);
for(const rel of touched){
  const dest=path.join(backupDir,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,rel),dest);
}

// Componentes novos/substituidos.
write('src/components/marketing/InteractiveShowcase.tsx',payload('src/components/marketing/InteractiveShowcase.tsx'));
write('src/components/marketing/ExistingValueSection.tsx',payload('src/components/marketing/ExistingValueSection.tsx'));
write(`public/assets/${cfg.placeholder}`,payload(`public/assets/${cfg.placeholder}`));

// CSS complementar idempotente.
let css=read('src/styles.css');
if(!css.includes(cfg.marker)){
  css += `\n\n${payload('src/styles.demo-flow-v2.css').trim()}\n`;
  write('src/styles.css',css);
}

let landing=read(cfg.landing);
if(!landing.includes("ExistingValueSection")){
  const needle="import { InteractiveShowcase } from '../../components/marketing/InteractiveShowcase';";
  if(!landing.includes(needle)){console.error('ERRO: import de InteractiveShowcase nao encontrado na Landing.');process.exit(10)}
  landing=landing.replace(needle,`${needle}\nimport { ExistingValueSection } from '../../components/marketing/ExistingValueSection';`);
}

// Remove a demonstracao estatica antiga. A nova demo e suficiente e evita dois CTAs concorrentes.
const legacyStart=landing.indexOf('      <section id="demonstracao-legado"');
if(legacyStart>=0){
  const interactiveStart=landing.indexOf('      <InteractiveShowcase',legacyStart);
  if(interactiveStart<0){console.error('ERRO: nao encontrei InteractiveShowcase apos demonstracao-legado.');process.exit(11)}
  landing=landing.slice(0,legacyStart)+landing.slice(interactiveStart);
}

const interactiveNeedle=mode==='food'
  ? '      <InteractiveShowcase variant="food" demoHref={demoHref}/>'
  : '      <InteractiveShowcase variant="flori" demoHref={demoHref}/>';
if(!landing.includes('      <ExistingValueSection')){
  if(!landing.includes(interactiveNeedle)){console.error('ERRO: ponto de insercao da demonstracao nao encontrado.');process.exit(12)}
  landing=landing.replace(interactiveNeedle,`      <ExistingValueSection variant="${mode}"/>\n\n${interactiveNeedle}`);
}

if(mode==='food'){
  landing=landing.replace(
    '<div className="sales-nav-actions"><a href="/admin/login">Entrar</a><a className="sales-nav-self-service" href="/cadastro">Criar conta</a><ProtectedContactButton className="sales-nav-primary" intent="trial" label={`Testar por ${trialDays} dias`}/></div>',
    '<div className="sales-nav-actions"><a href="/admin/login">Entrar</a><a className="sales-nav-self-service" href="/cadastro?plan=DEMO">Criar conta</a><a className="sales-nav-primary" href="/cadastro?plan=DEMO">Criar conta e testar {trialDays} dias</a></div>'
  );
  landing=landing.replace(
    '<ProtectedContactButton className="sales-cta-primary sales-cta-trial" intent="trial"><MessageCircle size={18}/>Testar o Profissional por {trialDays} dias</ProtectedContactButton>',
    '<a className="sales-cta-primary sales-cta-trial" href="/cadastro?plan=DEMO"><UserPlus size={18}/>Criar conta e testar por {trialDays} dias</a>'
  );
  landing=landing.replace('<a className="sales-cta-secondary" href={demoHref}>Ver demonstração <ArrowRight size={18}/></a>','<a className="sales-cta-secondary" href="#demonstracao">Ver demonstração <ArrowRight size={18}/></a>');
  landing=landing.replaceAll('className="sales-plan-self-service"','className="sales-plan-self-service sales-plan-self-service--primary"');
  landing=landing.replace(
    '<ProtectedContactButton className="sales-cta-light" intent="trial"><MessageCircle size={18}/>Quero começar agora</ProtectedContactButton>',
    '<a className="sales-cta-light" href="/cadastro?plan=DEMO"><UserPlus size={18}/>Criar minha conta</a>'
  );
}else{
  landing=landing.replace(
    '<div><a href="/admin/login">Entrar</a><a className="flori-self-service-nav" href="/cadastro">Criar conta</a><ProtectedContactButton className="flori-sales-primary" intent="trial">Teste por {trialDays} dias</ProtectedContactButton></div>',
    '<div><a href="/admin/login">Entrar</a><a className="flori-self-service-nav" href="/cadastro?plan=DEMO">Criar conta</a><a className="flori-sales-primary" href="/cadastro?plan=DEMO">Criar conta e testar {trialDays} dias</a></div>'
  );
  landing=landing.replace(
    '<ProtectedContactButton className="flori-sales-primary flori-trial-cta" intent="trial"><MessageCircle size={18}/>Testar o Profissional por {trialDays} dias</ProtectedContactButton>',
    '<a className="flori-sales-primary flori-trial-cta" href="/cadastro?plan=DEMO"><UserPlus size={18}/>Criar conta e testar por {trialDays} dias</a>'
  );
  landing=landing.replace('<a href={demoHref}>Ver uma loja funcionando <ArrowRight size={18}/></a>','<a href="#demonstracao">Ver demonstração interativa <ArrowRight size={18}/></a>');
  landing=landing.replaceAll('className="flori-plan-self-service"','className="flori-plan-self-service flori-plan-self-service--primary"');
  landing=landing.replace(
    '<ProtectedContactButton className="flori-sales-final-button-rc64" intent="trial"><MessageCircle size={17}/>Quero usar o FloriWeb<ArrowRight size={17}/></ProtectedContactButton>',
    '<a className="flori-sales-final-button-rc64" href="/cadastro?plan=DEMO"><UserPlus size={17}/>Criar minha conta<ArrowRight size={17}/></a>'
  );
}

if(landing.includes('Não é um slide:')){
  console.error('ERRO: a mensagem antiga da demonstracao ainda existe na Landing.');
  process.exit(13);
}
write(cfg.landing,landing);

// Versao do pacote.
pkg.version=cfg.to;
write('package.json',JSON.stringify(pkg,null,2)+'\n');
if(exists('package-lock.json')){
  const lock=JSON.parse(read('package-lock.json'));
  lock.version=cfg.to;
  if(lock.packages?.[''])lock.packages[''].version=cfg.to;
  write('package-lock.json',JSON.stringify(lock,null,2)+'\n');
}

// Smoke: atualiza somente a assercao principal e acrescenta checks da nova experiencia.
let smoke=read('scripts/smoke.mjs');
if(mode==='food'){
  smoke=smoke.replace("ok('Pacote FoodWeb v0.5.7',pkg.name==='foodservice-saas'&&pkg.version==='0.5.7');","ok('Pacote FoodWeb v0.5.8',pkg.name==='foodservice-saas'&&pkg.version==='0.5.8');");
  smoke=smoke.replace('Smoke FoodWeb v0.5.7 concluído:','Smoke FoodWeb v0.5.8 concluído:');
}else{
  smoke=smoke.replace("ok('Versao V3 RC6.13', packageJson.version === '3.0.0-rc.6.13');","ok('Versao V3 RC6.14', packageJson.version === '3.0.0-rc.6.14');");
  smoke=smoke.replace('Smoke test RC6.13 concluido:','Smoke test RC6.14 concluido:');
}

const checkMarker=mode==='food'?'v0.5.8 pedido demo localStorage':'RC6.14 pedido demo localStorage';
if(!smoke.includes(checkMarker)){
  const insertion=mode==='food'?`
const interactiveV058=read('src/components/marketing/InteractiveShowcase.tsx');
const valueV058=read('src/components/marketing/ExistingValueSection.tsx');
const landingV058=read('src/pages/store/Landing.tsx');
ok('v0.5.8 pedido demo localStorage',interactiveV058.includes('foodweb_interactive_demo_v058')&&interactiveV058.includes('Finalizar pedido demonstrativo')&&interactiveV058.includes('Ver no painel de gestão'));
ok('v0.5.8 pedido aparece na gestao',interactiveV058.includes('setOrders((current)=>[order,...current])')&&interactiveV058.includes('Confirmar recebimento')&&interactiveV058.includes('foodStatuses'));
ok('v0.5.8 CTAs priorizam auto cadastro',landingV058.includes('Criar conta e testar')&&landingV058.includes('href="#demonstracao"')&&landingV058.includes('sales-plan-self-service--primary'));
ok('v0.5.8 remove demo estatica e texto explicativo',!landingV058.includes('demonstracao-legado')&&!interactiveV058.includes('Não é um slide:'));
ok('v0.5.8 valor real do produto',valueV058.includes('Sem comissão por pedido')&&valueV058.includes('Financeiro ligado ao recebimento')&&valueV058.includes('Leitura assistida de documentos'));
ok('v0.5.8 fallback global de produto',read('public/assets/placeholder-food.svg').includes('PRODUCT_IMAGE_FALLBACK_V058'));
`:`
const interactiveRc614=read('src/components/marketing/InteractiveShowcase.tsx');
const valueRc614=read('src/components/marketing/ExistingValueSection.tsx');
const landingRc614=read('src/pages/store/Landing.tsx');
ok('RC6.14 pedido demo localStorage',interactiveRc614.includes('floriweb_interactive_demo_rc614')&&interactiveRc614.includes('Finalizar pedido demonstrativo')&&interactiveRc614.includes('Ver no painel de gestão'));
ok('RC6.14 pedido aparece na gestao',interactiveRc614.includes('setOrders((current)=>[order,...current])')&&interactiveRc614.includes('Confirmar recebimento')&&interactiveRc614.includes('sent_to_whatsapp'));
ok('RC6.14 CTAs priorizam auto cadastro',landingRc614.includes('Criar conta e testar')&&landingRc614.includes('href="#demonstracao"')&&landingRc614.includes('flori-plan-self-service--primary'));
ok('RC6.14 remove demo estatica e texto explicativo',!landingRc614.includes('demonstracao-legado')&&!interactiveRc614.includes('Não é um slide:'));
ok('RC6.14 valor real do produto',valueRc614.includes('Pedido pensado para presente')&&valueRc614.includes('Entrega programada')&&valueRc614.includes('Financeiro com recebimento confirmado'));
ok('RC6.14 fallback global de produto',read('public/assets/placeholder-flower.svg').includes('PRODUCT_IMAGE_FALLBACK_RC614'));
`;
  const failureIndex=smoke.indexOf('if(failures.length)');
  if(failureIndex<0){console.error('ERRO: ponto de inclusao no smoke nao encontrado.');process.exit(14)}
  smoke=smoke.slice(0,failureIndex)+insertion+'\n'+smoke.slice(failureIndex);
}
write('scripts/smoke.mjs',smoke);

console.log(`OK: ${cfg.smokeLabel} aplicado.`);
console.log(`Backup: ${backupDir}`);
console.log('Nao ha migration SQL nesta atualizacao.');
