import { InfoHint } from '../components/ui/InfoHint';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { fitnessApi, type FitnessStudent, type FitnessWorkout } from '../services/fitnessApi';

const levels: Record<FitnessWorkout['level'],string> = { basic:'Básico',medium:'Médio',advanced:'Avançado' };

export function FitnessWorkouts({store,professional}:{store:string;professional:boolean}) {
  const [workouts,setWorkouts]=useState<FitnessWorkout[]>([]);
  const [students,setStudents]=useState<FitnessStudent[]>([]);
  const [selectedStudent,setSelectedStudent]=useState<Record<string,string>>({});
  const [editing,setEditing]=useState<FitnessWorkout|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  const reload=useCallback(async()=>{
    const [nextWorkouts,nextStudents]=await Promise.all([fitnessApi.listWorkouts(store),fitnessApi.listStudents(store)]);
    if(!Array.isArray(nextWorkouts)||!Array.isArray(nextStudents.students))throw new Error('O servidor não retornou as fichas e os alunos esperados.');
    setWorkouts(nextWorkouts);
    setStudents(nextStudents.students);
  },[store]);
  useEffect(()=>{
    let active=true;
    setLoading(true);setError('');setNotice('');setWorkouts([]);setStudents([]);
    void Promise.all([fitnessApi.listWorkouts(store),fitnessApi.listStudents(store)])
      .then(([nextWorkouts,nextStudents])=>{
        if(!Array.isArray(nextWorkouts)||!Array.isArray(nextStudents.students))throw new Error('O servidor não retornou as fichas e os alunos esperados.');
        if(active){setWorkouts(nextWorkouts);setStudents(nextStudents.students);}
      })
      .catch(cause=>{if(active)setError((cause as Error).message);})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[store]);

  const run=async(action:()=>Promise<unknown>,success:string):Promise<boolean>=>{
    if(busy)return false;
    setBusy(true);setError('');setNotice('');
    try{
      await action();
      try{await reload();setNotice(success);}
      catch{setError('A operação foi confirmada pelo servidor, mas a lista não atualizou. Recarregue antes de repetir.');}
      return true;
    }catch(cause){setError((cause as Error).message);return false;}
    finally{setBusy(false);}
  };
  const saveEdit=(event:FormEvent)=>{
    event.preventDefault();
    if(!editing)return;
    void run(()=>fitnessApi.saveWorkout(store,editing),'Ficha em rascunho salva no servidor.').then(saved=>{if(saved)setEditing(null);});
  };

  return <section className="business-card fitness-workouts" aria-label="Fichas de treino">
    <h2>Fichas de treino</h2>
    <InfoHint label="Sobre Fichas de treino">Modelos genéricos para revisão. O Personal Trainer deve conferir, ajustar ao aluno e aprovar antes de atribuir. Estas fichas não são prescrição individualizada.</InfoHint>
    {error&&<div className="business-message business-message--error" role="alert">{error} <button type="button" onClick={()=>void reload().catch(cause=>setError((cause as Error).message))}>Tentar novamente</button></div>}
    {notice&&<div className="business-message" role="status">{notice}</div>}
    {loading?<p role="status">Consultando fichas no servidor…</p>:<>
      <button type="button" className="secondary-button" disabled={busy} onClick={()=>void run(()=>fitnessApi.seedWorkouts(store),'Modelos Básico, Médio e Avançado preparados como rascunho no servidor.')}>Preparar três fichas em rascunho</button>
      {workouts.length===0?<p className="business-muted">Nenhuma ficha cadastrada nesta loja.</p>:<div className="fitness-workout-list">{workouts.map(workout=><article className="fitness-workout-card" key={workout.id}>
        <div className="business-card-heading"><h3>{levels[workout.level]} · {workout.title}</h3><span className="business-badge">{workout.status==='approved'?'Aprovada':'Aguardando revisão'}</span></div>
        <p>{workout.description}</p>{workout.professional&&<p className="business-provider">Responsável: <strong>{workout.professional.name}</strong> · {workout.professional.council} {workout.professional.registration}</p>}
        <ol>{workout.exercises.map(exercise=><li key={exercise.id}><strong>{exercise.name}</strong><span>{exercise.sets} séries · {exercise.repetitions} repetições · {exercise.rest_seconds}s de descanso</span><span>Carga/esforço: {exercise.load_or_effort}</span><span>Instruções: {exercise.instructions}</span><span>Alternativa: {exercise.alternative}</span></li>)}</ol>
        {workout.status==='draft'&&<div className="fitness-appointment-actions"><button type="button" className="secondary-button" disabled={busy||!professional} onClick={()=>setEditing({...workout,exercises:workout.exercises.map(exercise=>({...exercise}))})}>Revisar e editar</button><button type="button" className="primary-button" disabled={busy||!professional||editing?.id===workout.id} onClick={()=>void run(()=>fitnessApi.approveWorkout(store,workout.id),'Ficha aprovada pelo Personal Trainer no servidor.')}>Aprovar após revisão profissional</button></div>}
        {editing?.id===workout.id&&<form className="fitness-workout-edit" onSubmit={saveEdit}>
          <label>Título<input required maxLength={120} value={editing.title} onChange={event=>setEditing({...editing,title:event.target.value})}/></label>
          <label>Descrição<textarea maxLength={1000} value={editing.description} onChange={event=>setEditing({...editing,description:event.target.value})}/></label>
          {editing.exercises.map((exercise,index)=><fieldset key={exercise.id}><legend>Exercício {index+1}</legend>
            <label>Nome<input required value={exercise.name} onChange={event=>setEditing(current=>current&&({...current,exercises:current.exercises.map((row,i)=>i===index?{...row,name:event.target.value}:row)}))}/></label>
            <label>Séries<input required type="number" min="1" max="20" value={exercise.sets} onChange={event=>setEditing(current=>current&&({...current,exercises:current.exercises.map((row,i)=>i===index?{...row,sets:Number(event.target.value)}:row)}))}/></label>
            <label>Repetições<input required value={exercise.repetitions} onChange={event=>setEditing(current=>current&&({...current,exercises:current.exercises.map((row,i)=>i===index?{...row,repetitions:event.target.value}:row)}))}/></label>
            <label>Descanso em segundos<input required type="number" min="0" max="3600" value={exercise.rest_seconds} onChange={event=>setEditing(current=>current&&({...current,exercises:current.exercises.map((row,i)=>i===index?{...row,rest_seconds:Number(event.target.value)}:row)}))}/></label>
            <label>Carga ou esforço<input required value={exercise.load_or_effort} onChange={event=>setEditing(current=>current&&({...current,exercises:current.exercises.map((row,i)=>i===index?{...row,load_or_effort:event.target.value}:row)}))}/></label>
            <label>Instruções<textarea required value={exercise.instructions} onChange={event=>setEditing(current=>current&&({...current,exercises:current.exercises.map((row,i)=>i===index?{...row,instructions:event.target.value}:row)}))}/></label>
            <label>Alternativa<input required value={exercise.alternative} onChange={event=>setEditing(current=>current&&({...current,exercises:current.exercises.map((row,i)=>i===index?{...row,alternative:event.target.value}:row)}))}/></label>
          </fieldset>)}
          <div className="fitness-appointment-actions"><button type="submit" className="primary-button" disabled={busy}>Salvar revisão</button><button type="button" className="secondary-button" disabled={busy} onClick={()=>setEditing(null)}>Cancelar</button></div>
        </form>}
        {workout.status==='approved'&&<div className="fitness-appointment-actions"><label>Aluno<select value={selectedStudent[workout.id]||''} onChange={event=>setSelectedStudent(current=>({...current,[workout.id]:event.target.value}))}><option value="">Selecione um aluno com conta vinculada</option>{students.map(student=><option value={student.client_id} key={student.client_id}>{student.name}</option>)}</select></label><button type="button" className="secondary-button" disabled={busy||!professional||!selectedStudent[workout.id]} onClick={()=>{
          const student=students.find(item=>item.client_id===selectedStudent[workout.id]);
          if(!student||!window.confirm(`Atribuir a ficha ${workout.title} a ${student.name} após revisão individual?`))return;
          void run(()=>fitnessApi.assignWorkout(store,workout.id,student.client_id),'Ficha atribuída ao aluno no servidor.');
        }}>Atribuir ficha</button></div>}
      </article>)}</div>}
    </>}
  </section>;
}

export function FitnessStudentWorkouts({store}:{store:string}) {
  const [workouts,setWorkouts]=useState<FitnessWorkout[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    setLoading(true);setError('');setWorkouts([]);
    void fitnessApi.listWorkouts(store)
      .then(rows=>{if(!Array.isArray(rows))throw new Error('Resposta inválida do servidor.');if(active)setWorkouts(rows);})
      .catch(cause=>{if(active)setError((cause as Error).message);})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[store]);
  return <section className="business-card fitness-workouts" aria-label="Minhas fichas de treino">
    <h2>Minhas fichas de treino</h2>
    {loading?<p role="status">Consultando fichas atribuídas…</p>:error?<p role="alert">Não foi possível consultar suas fichas: {error}</p>:workouts.length===0?<p>Nenhuma ficha foi atribuída pelo Personal Trainer.</p>:<div className="fitness-workout-list">{workouts.map(workout=><article className="fitness-workout-card" key={workout.id}>
      <h3>{levels[workout.level]} · {workout.title}</h3><p>{workout.description}</p>{workout.professional&&<p className="business-provider">Responsável: <strong>{workout.professional.name}</strong> · {workout.professional.council} {workout.professional.registration}</p>}
      <ol>{workout.exercises.map(exercise=><li key={exercise.id}><strong>{exercise.name}</strong><span>{exercise.sets} séries · {exercise.repetitions} repetições · {exercise.rest_seconds}s de descanso</span><span>Carga/esforço: {exercise.load_or_effort}</span><span>Instruções: {exercise.instructions}</span><span>Alternativa: {exercise.alternative}</span></li>)}</ol>
    </article>)}</div>}
  </section>;
}
