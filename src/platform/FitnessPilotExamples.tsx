import { createElement, useState } from 'react';
import { normalizeText } from '../utils/text';
import './fitness.css';

const programs = [
  { level: 'Iniciante', price: 'R$ 49,00', focus: 'Primeiros movimentos', muscles: 'Pernas, costas e glúteos', equipment: 'Banco, elástico e solo', exercises: ['Sentar e levantar de banco', 'Remada com elástico', 'Ponte de quadril'], tone: 'basic' },
  { level: 'Intermediário', price: 'R$ 79,00', focus: 'Força e controle', muscles: 'Pernas, costas e glúteos', equipment: 'Halteres e banco', exercises: ['Agachamento com halter', 'Remada unilateral', 'Terra romeno com halteres'], tone: 'medium' },
  { level: 'Avançado', price: 'R$ 119,00', focus: 'Progressão supervisionada', muscles: 'Pernas, costas e glúteos', equipment: 'Barra e halteres', exercises: ['Agachamento com barra', 'Remada curvada', 'Avanço com halteres'], tone: 'advanced' },
] as const;

const demoOffers = [
  { name: 'Avaliação física', price: 'R$ 120,00', detail: 'Agendamento com o profissional, após confirmação da compra.' },
  { name: 'Avaliação + ficha personalizada', price: 'R$ 229,00', detail: 'Avaliação e elaboração individual após atendimento.' },
  { name: 'Consulta nutricional', price: 'R$ 150,00', detail: 'Atendimento por nutricionista habilitada.' },
  { name: 'Plano alimentar personalizado', price: 'R$ 190,00', detail: 'Preparado pela nutricionista após avaliação.' },
] as const;

/** Original schematic illustration: no third-party exercise footage or imagery. */
function SquatDiagram() {
  return <svg className="fitness-demo-diagram" viewBox="0 0 420 190" role="img" aria-labelledby="fitness-diagram-title fitness-diagram-desc">
    <title id="fitness-diagram-title">Prévia 2D de agachamento</title>
    <desc id="fitness-diagram-desc">Duas posições esquemáticas, em pé e com quadril flexionado. A execução precisa de revisão profissional.</desc>
    <path d="M24 160H396" stroke="currentColor" strokeOpacity=".22" strokeWidth="2"/>
    <g fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="106" cy="37" r="13" strokeWidth="6"/>
      <path d="M106 54V102M106 68l-25 33M106 68l27 30M106 102l-20 52M106 102l20 52"/>
      <circle cx="301" cy="68" r="13" strokeWidth="6"/>
      <path d="M298 85l-20 36M287 101l-36 3M287 101l22 9M278 121l-38 10 2 23M278 121l39 13 22 20"/>
    </g>
    <path d="M166 92h59m-12-11 12 11-12 11" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    <g fill="currentColor" fontSize="12" fontWeight="600"><text x="72" y="179">EM PÉ</text><text x="260" y="179">FLEXÃO</text></g>
  </svg>;
}

export function FitnessPilotExamples({ query = '' }: { query?: string }) {
  const [muscle, setMuscle] = useState('all');
  const [equipment, setEquipment] = useState('all');
  const [view3d, setView3d] = useState(false);
  const [loading3d, setLoading3d] = useState(false);
  const [error3d, setError3d] = useState('');
  const open3d = async () => {
    if (loading3d || view3d) return;
    setLoading3d(true); setError3d('');
    try {
      const moduleUrl = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@4.4.0/dist/model-viewer.min.js';
      await import(/* @vite-ignore */ moduleUrl);
      await customElements.whenDefined('model-viewer');
      setView3d(true);
    } catch {
      setError3d('A demonstração 3D não carregou neste aparelho. A prévia 2D permanece disponível.');
    } finally { setLoading3d(false); }
  };
  const filtered = programs.filter(program => (muscle === 'all' || normalizeText(program.muscles).includes(normalizeText(muscle)))
    && (equipment === 'all' || normalizeText(program.equipment).includes(normalizeText(equipment)))
    && normalizeText([program.level, program.focus, program.muscles, program.equipment, ...program.exercises].join(' ')).includes(normalizeText(query)));
  return <section className="fitness-pilot-examples" aria-labelledby="fitness-examples-title">
    <div className="fitness-examples-heading">
      <div><span className="eyebrow">CONHEÇA O PILOTO</span><h2 id="fitness-examples-title">Exemplos de treinos e atendimentos</h2>
        <p>Explore o formato das fichas. São amostras fictícias para avaliação do piloto, sem compra nem prescrição individual.</p></div>
      <span className="fitness-demo-status">Demonstração</span>
    </div>
    <div className="fitness-example-filters"><label>Músculo<select value={muscle} onChange={event => setMuscle(event.target.value)}><option value="all">Todos</option><option value="Pernas">Pernas</option><option value="Costas">Costas</option><option value="Glúteos">Glúteos</option></select></label><label>Equipamento<select value={equipment} onChange={event => setEquipment(event.target.value)}><option value="all">Todos</option><option value="Elástico">Elástico</option><option value="Halteres">Halteres</option><option value="Barra">Barra</option><option value="Solo">Solo</option></select></label></div>
    <div className="fitness-example-layout">
      <div className="fitness-example-programs">
        {filtered.length === 0 && <p role="status" className="business-muted">Nenhuma ficha de exemplo corresponde à busca ou aos filtros.</p>}
        {filtered.map(program => <article className="fitness-example-program" key={program.level}>
          <div className="fitness-example-program-top"><span className={'fitness-level fitness-level--' + program.tone}>{program.level}</span><strong>{program.price}</strong></div>
          <h3>Ficha {program.level.toLowerCase()}</h3><p>{program.focus}</p><small>{program.muscles} · {program.equipment}</small>
          <details><summary>Ver exercícios de exemplo</summary><ol>{program.exercises.map(item => <li key={item}>{item}</li>)}</ol></details>
        </article>)}
      </div>
      <div className="fitness-demo-motion">
        <div className="fitness-demo-motion-heading"><div><span>Movimento demonstrativo</span><h3>Agachamento</h3></div><span>2D / 3D</span></div>
        <SquatDiagram/>
        <p>Prévia leve. A ficha final, as cargas e as alternativas são revisadas pelo profissional.</p>
        {view3d ? <div className="fitness-demo-viewer">
          {createElement('model-viewer', {
            src: '/assets/fitness-demo-squat.glb',
            'camera-controls': true, autoplay: true,
            'animation-name': 'Agachamento ilustrativo',
            'shadow-intensity': '0.4',
            alt: 'Modelo 3D esquemático e animado de agachamento, giratório com toque ou mouse.',
            'aria-label': 'Modelo 3D demonstrativo de agachamento',
          })}
          <button type="button" className="secondary-button" onClick={() => setView3d(false)}>Fechar 3D</button>
        </div> : <button type="button" className="secondary-button" onClick={() => void open3d()} disabled={loading3d}>
          {loading3d ? 'Carregando visualizador…' : 'Abrir demonstração 3D interativa'}
        </button>}
        {error3d && <p role="status">{error3d}</p>}
        <small>Modelo GLB esquemático original do piloto. O visualizador só é carregado ao abrir; a prévia 2D continua disponível.</small>
      </div>
    </div>
    <div className="fitness-example-services"><h3>Também previstos para a loja</h3><div>{demoOffers.map(item => <article key={item.name}>
      <div><strong>{item.name}</strong><span>{item.price}</span></div><p>{item.detail}</p>
    </article>)}</div><p>Preços fictícios. Avaliação, combo e nutrição estão em preparação e não podem ser comprados nesta etapa.</p></div>
  </section>;
}
