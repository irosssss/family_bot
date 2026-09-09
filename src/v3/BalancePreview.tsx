import { useState } from 'react';
import { BALANCE_POLICY_V01, ROUTINES_V01, planFamilyGoal, projectGoalProgress, projectHeroLevel, routineReward, totalXpToLevel, type RoutineIdV01 } from './model/balance';
import { catalogV01 } from './model/catalog';
import { Meter } from './ui';

const number = (value: number) => value.toLocaleString('ru-RU');

/** Independent arithmetic controls. Never reads or writes the selected profile's wallet. */
export function BalancePreview() {
  const [heroes, setHeroes] = useState(4);
  const [activeDays, setActiveDays] = useState(20);
  const [routineId, setRoutineId] = useState<RoutineIdV01>('baseline');
  const daily = routineReward(routineId);
  const routine = ROUTINES_V01.find(value => value.id === routineId)!;
  const goal = planFamilyGoal(Array.from({ length: heroes }, (_, index) => ({ playerId: `calculation-${index}`, dailyContributionNorm: daily.familyContribution })));
  const goalDays = Math.min(activeDays, goal.plannedActiveDays);
  const contribution = projectGoalProgress(goal, [{ goalId: goal.goalId, amount: daily.familyContribution * goalDays * heroes }]);
  const contributionWithoutGoal = daily.familyContribution * (activeDays - goalDays) * heroes;
  const level = projectHeroLevel(daily.heroXp * activeDays);
  const fullPath = totalXpToLevel(BALANCE_POLICY_V01.hero.maximumLevel);

  return <div className="v3-balance-preview">
    <p>Числа предлагаемой версии v0.1. Меняйте условия, чтобы сравнить темп. Расчёт начинается с нулевого XP и Gold, без покупок и дополнительных бонусов.</p>
    <div className="v3-balance-controls">
      <label>Активных героев<select aria-label="В расчёте: героев" value={heroes} onChange={event => setHeroes(Number(event.target.value))}>{[1, 2, 4, 6, 8].map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Активных дней из 28<select aria-label="В расчёте: активных дней" value={activeDays} onChange={event => setActiveDays(Number(event.target.value))}>{[20, 28].map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="full">Состав дел<select aria-label="В расчёте: состав дел" value={routineId} onChange={event => setRoutineId(event.target.value as RoutineIdV01)}>{ROUTINES_V01.map(value => <option key={value.id} value={value.id}>{value.label}</option>)}</select></label>
    </div>
    <div className="v3-calculation-routine"><strong>Один герой за активный день</strong><p>Дел: {routine.tasks.length} · {daily.heroXp} XP · {daily.gold} золота · {daily.familyContribution} шагов цели</p><small>До {daily.petXp} XP питомца, если он выбран в условиях до работы. Иначе 0.</small></div>
    <h3>За {activeDays} активных дней</h3>
    <div className="v3-calculation-metrics" aria-live="polite">
      <div><span>XP одного героя</span><strong>{number(daily.heroXp * activeDays)}</strong><small>Уровень {level.level} с нуля</small></div>
      <div><span>Gold одного героя</span><strong>{number(daily.gold * activeDays)}</strong><small>До любых расходов</small></div>
    </div>
    <section className="v3-calculation-goal">
      <h3>Одна общая цель</h3>
      <p>План под выбранный темп: {goal.plannedActiveDays} активных дней. Состав и нормы фиксируются до начала; срока сгорания нет.</p>
      <Meter value={contribution.progressContribution} max={goal.targetContribution} label="Расчёт общей цели"/>
      <p><strong>{number(contribution.earnedContribution)}</strong> шагов при цели <strong>{number(goal.targetContribution)}</strong>. Она завершена за {goalDays} активных дней.</p>
      <p>Следующая цель в этом примере не выбрана: ещё <strong>{number(contributionWithoutGoal)}</strong> шагов от новых дел остаются в истории без цели. Личные награды сохраняются.</p>
      <small>Здесь результаты принимаются сразу. Запоздалые результаты дел, начатых для этой цели, остались бы в её истории, включая превышение.</small>
      <small>Личные монеты героев не складываются в общую копилку. Пропуски не уменьшают принятый вклад.</small>
    </section>
    <h3>Если копить на одну вещь</h3>
    <div className="v3-price-timing">
      {catalogV01.filter(item => item.acquisition === 'gold').map(item => <div key={item.id}><span>{item.title}<small>{item.priceGold} Gold{item.eligibility === 'adults' ? ' · покупает взрослый' : ''}</small></span><strong>{Math.ceil(item.priceGold / daily.gold)}<small>акт. дней</small></strong></div>)}
    </div>
    <p>Каждая строка начинается с нуля и предполагает отсутствие других покупок. Последовательные расходы и ограничения каталога разобраны в отчёте симуляции.</p>
    <div className="v3-boundary-note">До уровня {BALANCE_POLICY_V01.hero.maximumLevel}: {number(fullPath)} XP, около {number(Math.ceil(fullPath / daily.heroXp))} активных дней при этом составе дел. Календарная длина зависит от графика. Маленький каталог не обеспечивает бесконечного расходования Gold.</div>
  </div>;
}
