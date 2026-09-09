import type { ReactNode } from 'react';
import { Sprout } from 'lucide-react';
import { BALANCE_POLICY_V01, projectPetProgress } from './model/balance';
import { Button, Meter } from './ui';
import type { PetExample } from './prototypeStates';

export function PetPreview({ state, asset, showChoice }: {
  state: PetExample;
  asset: (id: string, label?: string, className?: string) => ReactNode;
  showChoice: () => void;
}) {
  const policy = BALANCE_POLICY_V01.pet;
  const progress = projectPetProgress(state === 'egg' ? Math.floor(policy.hatchXp * 0.6) : policy.hatchXp + Math.floor(policy.firstGrowthAdditionalXp * 0.4));
  return <>
    <section className="v3-pet-card">
      <span className="v3-section-label">Маленький спутник</span>
      {asset(state === 'companion' ? 'pet.companion' : 'pet.egg', state === 'none' ? 'Место для будущего известного яйца' : state === 'egg' ? 'Яйцо котёнка · результат известен' : 'Котёнок рядом с героем')}
      <h2>{state === 'none' ? 'Начнём с одного доброго дела' : state === 'egg' ? 'Забота помогает расти' : 'У тебя есть маленький спутник'}</h2>
      <p>{state === 'none' ? 'После первого принятого дела будет доступен один бесплатный выбор: котёнок или щенок. Вид известен заранее.' : state === 'egg' ? 'Новые дела после выбора яйца помогают ему вырасти. Пропуски не отнимают опыт.' : 'У котёнка уже есть бесплатный уголок. Следующие принятые дела помогают ему подрасти, без голода и потери прогресса.'}</p>
      {state !== 'none' && <div className="v3-pet-growth">
        <div><span>{state === 'egg' ? 'Пример опыта яйца' : 'Пример первого роста'}</span><strong>{progress.xpIntoStage} / {progress.stageTargetXp}</strong></div>
        <Meter value={progress.xpIntoStage} max={progress.stageTargetXp!} label={state === 'egg' ? 'Пример опыта яйца' : 'Пример первого роста'}/>
      </div>}
      <Button secondary onClick={showChoice}>О стартовом выборе</Button>
    </section>
    {state === 'companion' ? <section className="v3-pet-corner">
      <div className="v3-section-heading"><h2>Свой уголок</h2><span className="v3-caption">Бесплатно с питомцем</span></div>
      {asset('pet.corner', 'Базовый уголок котёнка')}
      <p>Питомец и декорации будут отдельными слоями. Его место остаётся доступным без покупок.</p>
    </section> : <div className="v3-quiet-note"><Sprout size={20}/><p>При вылуплении питомец получит свой уголок. Изображения яйца, питомца и уголка добавятся отдельно.</p></div>}
  </>;
}
