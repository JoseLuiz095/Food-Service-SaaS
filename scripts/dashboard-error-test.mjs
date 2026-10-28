import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync('src/utils/dashboardErrors.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {dashboardErrorMessage}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const missing='Os indicadores ainda não foram ativados. A atualização do painel está pendente.';
assert.equal(dashboardErrorMessage({details:'PGRST202',message:'SQL interno'}),missing);
assert.equal(dashboardErrorMessage(new Error('Could not find public.food_dashboard_metrics_v1(p_store_id) in the schema cache')),missing);
for(const status of [401,403])assert.match(dashboardErrorMessage({status,message:'private sql details'}),/Entre novamente/);
for(const input of [new Error('internal secret'),{status:500,message:'private sql'},null,undefined,'raw server error']){
 const output=dashboardErrorMessage(input);assert.match(output,/Confira sua conexão/);assert.doesNotMatch(output,/secret|private|SQL|schema|function/i);
}
console.log('OK: 9 verificações de mensagens de erro, acesso e ausência de detalhes internos.');
