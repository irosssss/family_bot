import type { ReactNode } from 'react';
import { Coins, Check, UserRound, Users } from 'lucide-react';
import { catalogV01, getCatalogItem, type CatalogItemV01 } from './model/catalog';
import { Button } from './ui';
import type { ItemExample } from './prototypeStates';

export const outfitExampleId = 'v3.outfit.traveler';

export function examplePersonalGold(state: ItemExample): number {
  const price = getCatalogItem(outfitExampleId)!.priceGold;
  return state === 'short' ? Math.floor(price * 0.4) : Math.max(...catalogV01.map(item => item.priceGold)) + price;
}

export function itemExampleStatus(item: CatalogItemV01, state: ItemExample, balance: number, isAdult: boolean) {
  if (item.eligibility === 'adults' && !isAdult) return 'Для семейной покупки взрослым';
  if (item.id === outfitExampleId && state === 'equipped') return 'Применено на герое';
  if (item.id === outfitExampleId && state === 'owned') return 'Уже есть у героя';
  if (balance < item.priceGold) return `Не хватает ${item.priceGold - balance} золота`;
  return 'Доступно в примере';
}

export function ShopPreview({ state, isAdult, asset, openItem }: {
  state: ItemExample;
  isAdult: boolean;
  asset: (id: string, label?: string, className?: string) => ReactNode;
  openItem: (item: CatalogItemV01) => void;
}) {
  const balance = examplePersonalGold(state);
  const entries = catalogV01.filter(item => item.acquisition === 'gold');
  return <>
    <div className="v3-catalog-intro">
      <div><Coins size={21}/><span>В личном кошельке примера</span><strong>{balance}</strong></div>
      <p>Цены версии v0.1. Покупка, владение и применение — разные действия; здесь показаны только их примеры.</p>
    </div>
    <div className="v3-shop-list">
      {entries.map(item => {
        const owned = item.id === outfitExampleId && (state === 'owned' || state === 'equipped');
        return <article key={item.id}>
          <div className="v3-shop-item-top">
            {item.assetSlotId && asset(item.assetSlotId, item.title)}
            <div>
              <span className="v3-caption">{item.ownership === 'family' ? 'Предмет для дома' : item.kind === 'known_egg' ? 'Известный питомец' : 'Личный внешний вид'}</span>
              <h3>{item.title}</h3>
              <strong className="v3-price">{owned ? <><Check size={16}/>Получено</> : `${item.priceGold} золота`}</strong>
            </div>
          </div>
          <p className="v3-shop-status">{itemExampleStatus(item, state, balance, isAdult)}</p>
          <div className="v3-shop-ownership">{item.ownership === 'family' ? <Users size={15}/> : <UserRound size={15}/>}<span>{item.ownership === 'family' ? 'После покупки — для семьи; взрослый платит своими монетами' : owned ? 'Принадлежит выбранному герою' : 'После получения — личная вещь героя'}</span></div>
          <Button secondary onClick={() => openItem(item)}>{owned ? 'Посмотреть применение' : 'Условия получения'}</Button>
        </article>;
      })}
    </div>
    <div className="v3-quiet-note"><Coins size={20}/><p>Первое стартовое яйцо можно будет выбрать бесплатно в разделе «Спутник». Лисёнок здесь — отдельный дополнительный вид.</p></div>
  </>;
}
