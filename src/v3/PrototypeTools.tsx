import { ArrowRight } from 'lucide-react';
import { Button } from './ui';
import { exampleLabels, type PrototypeExamples } from './prototypeStates';

export function PrototypeTools({ examples, update, open }: {
  examples: PrototypeExamples;
  update: (next: PrototypeExamples) => void;
  open: (section: keyof PrototypeExamples) => void;
}) {
  const fields = [
    { id: 'goal', label: 'Общая цель', action: 'Посмотреть цель' },
    { id: 'pet', label: 'Питомец', action: 'Посмотреть питомца' },
    { id: 'item', label: 'Виртуальная покупка', action: 'Посмотреть каталог' },
    { id: 'realReward', label: 'Реальная семейная награда', action: 'Посмотреть награду' },
  ] as const;

  return <>
    <p>Выберите готовое состояние и откройте соответствующий экран. Это независимые примеры без игровых действий и сохранения данных. Получение и применение вещи показаны на одежде путешественника.</p>
    <div className="v3-example-controls">
      {fields.map(field => (
        <section key={field.id}>
          <label>
            <strong>{field.label}</strong>
            <select
              aria-label={`Пример: ${field.label}`}
              value={examples[field.id]}
              onChange={event => update({ ...examples, [field.id]: event.target.value })}
            >
              {Object.entries(exampleLabels[field.id]).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          </label>
          <Button secondary onClick={() => open(field.id)}>{field.action}<ArrowRight size={16}/></Button>
        </section>
      ))}
    </div>
  </>;
}
