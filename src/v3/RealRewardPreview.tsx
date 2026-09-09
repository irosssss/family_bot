import { Heart, ShieldCheck } from 'lucide-react';
import { Button } from './ui';
import { exampleLabels, type RealRewardExample } from './prototypeStates';

const descriptions: Record<RealRewardExample, string> = {
  idea: 'Выбрать фильм и устроить совместный вечер. До заявки взрослый и ребёнок договариваются об условиях.',
  awaiting: 'Запрос отправлен взрослому. Сумма временно отложена: потратить её на другую покупку пока нельзя.',
  reserved: 'Взрослый согласовал вечер. Награда ещё не получена, сумма остаётся в резерве до выдачи.',
  delivered: 'Семейный вечер состоялся. Согласованная сумма списана один раз, результат сохранён в истории.',
  released: 'Заявку отменили до выдачи. Резерв снят, монеты снова доступны; обратного списания не потребовалось.',
};

export function RealRewardPreview({ state, price, title, recipient, isAdult, showDetails }: {
  state: RealRewardExample;
  price: number;
  title: string;
  recipient: string;
  isAdult: boolean;
  showDetails: () => void;
}) {
  const reserved = state === 'awaiting' || state === 'reserved' ? price : 0;
  const total = state === 'delivered' ? 40 : price + 40;
  return (
    <section className="v3-real-reward-card">
      <div className="v3-section-heading">
        <span className="v3-section-label">{isAdult ? 'Награды для детей' : 'Твоя семейная награда'}</span>
        <Heart size={21}/>
      </div>
      <span className={`v3-status ${state === 'awaiting' || state === 'reserved' ? 'review' : ''}`}>{exampleLabels.realReward[state]}</span>
      <h2>{title}</h2>
      <p>{descriptions[state]}</p>
      <div className="v3-recipient"><ShieldCheck size={16}/><span>Для кого: {recipient} · стоимость {price} золота</span></div>
      <div className="v3-wallet-example" aria-label={`Пример кошелька: ${recipient}`}>
        <div><span>Всего</span><strong>{total}</strong></div>
        <div><span>Доступно</span><strong>{total - reserved}</strong></div>
        <div><span>Отложено</span><strong>{reserved}</strong></div>
      </div>
      <p className="v3-caption">Пример кошелька для этой заявки. Заявка, согласование и выдача ещё не подключены.</p>
      <Button secondary onClick={showDetails}>{state === 'idea' ? 'Посмотреть условия' : 'Посмотреть историю заявки'}</Button>
    </section>
  );
}
