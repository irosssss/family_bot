import { Check, Sprout, ArrowRight } from 'lucide-react';
import { Button, Meter } from './ui';
import type { GoalExample } from './prototypeStates';

export function GoalPreview({ state, target, compact = false, showDetails }: {
  state: GoalExample;
  target: number;
  compact?: boolean;
  showDetails: () => void;
}) {
  const progress = state === 'achieved' ? target : state === 'active' ? Math.floor(target * 0.4) : 0;
  if (compact) return (
    <section className="v3-week-goal">
      <div>
        <span className="v3-section-label">Наша общая цель</span>
        {state === 'empty' ? <span className="v3-caption">Пока не выбрана</span> : <strong>{progress} <small>из {target} шагов</small></strong>}
      </div>
      {state !== 'empty' && <Meter value={progress} max={target} label="Пример общей цели"/>}
      <p>{state === 'achieved' ? 'У нас получилось. Достижение остаётся в истории семьи.' : state === 'empty' ? 'Можно выбрать один посильный результат для всей семьи.' : 'Пропуск дня не стирает сделанное. Идём в своём темпе.'}</p>
      <button type="button" className="v3-text-button" onClick={showDetails}>{state === 'empty' ? 'Пример цели' : 'Как устроена цель'}<ArrowRight size={14}/></button>
    </section>
  );

  return (
    <section className={`v3-family-goal goal-${state}`}>
      <div className="v3-section-heading"><h2>{state === 'achieved' ? 'Общий результат достигнут' : 'Один общий результат'}</h2>{state === 'achieved' ? <Check size={23}/> : <Sprout size={23}/>}</div>
      <h3>{state === 'empty' ? 'Выберем цель вместе' : 'Подготовить семейный вечер'}</h3>
      <p>{state === 'empty' ? 'Небольшой результат, в котором у каждого найдётся посильная часть.' : state === 'achieved' ? 'Спасибо всем за вклад. Проверяемые результаты, присланные раньше, ещё могут пополнить историю этой цели.' : 'Принятые дела складываются в общие шаги. Золото каждого остаётся в личном кошельке.'}</p>
      {state !== 'empty' && <><Meter value={progress} max={target} label="Пример общей цели"/><span className="v3-caption">{progress} из {target} шагов в примере</span></>}
      <Button secondary onClick={showDetails}>{state === 'empty' ? 'Посмотреть пример цели' : state === 'achieved' ? 'Посмотреть результат' : 'Посмотреть условия'}<ArrowRight size={16}/></Button>
    </section>
  );
}
