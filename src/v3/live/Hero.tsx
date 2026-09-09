import { useState } from 'react';
import { Coins, Shirt, Sparkles } from 'lucide-react';
import type { Pet, PurchaseQuote, Settlement, CorrectionPreview } from '../../v3-shared/game';
import { GameAsset, GameHero } from '../assets/GameAsset';
import { BALANCE_POLICY_V01, projectHeroLevel, totalXpToLevel } from '../model/balance';
import { catalogV01, getCatalogItem, starterChoicesV01, type CatalogItemV01 } from '../model/catalog';
import { Button, Meter, PageHeading, Sheet } from '../ui';
import { ActionError, amountRatio, available, Empty, Field, Form, nameOf, prettyDate, useGame } from './context';
const petName=(species:string)=>({'v3.pet.cat':'Котёнок','v3.pet.dog':'Щенок','v3.pet.fox':'Лисёнок'}[species]??'Питомец');
export function Wallet() {
  const {data}=useGame();
  return <div className="v3-wallet-example"><div><span>Всего монет</span><strong>{data.progress?.postedGold??'0'}</strong></div>
    <div><span>В резерве</span><strong>{data.progress?.reservedGold??'0'}</strong></div><div><span>Доступно</span><strong>{available(data)}</strong></div></div>;
}
export function Hero() {
  const {data}=useGame(),[section,setSection]=useState('look');
  const [item,setItem]=useState<string|null>(null),[pet,setPet]=useState<string|null>(null),[starter,setStarter]=useState(false);
  const own=data.members.find(m=>m.id===data.memberId)!,progress=data.progress;
  const active=own.playerStatus==='active';
  const level=projectHeroLevel(Math.min(Number(progress?.heroXp??'0'),totalXpToLevel(100)));
  const outfit=getCatalogItem(data.owned.find(o=>o.id===progress?.appearance.outfit)?.itemId??'');
  const hand=getCatalogItem(data.owned.find(o=>o.id===progress?.appearance.hand)?.itemId??'');
  return <><PageHeading title={'Герой: '+own.name} text="Личный путь в нашем общем приключении."/>
    <div className="v3-tabs" aria-label="Раздел героя">{[['look','Облик'],['pets','Питомцы'],['shop','Вещи'],['history','История']].map(([id,title])=>
      <button key={id} aria-pressed={section===id} onClick={()=>setSection(id)}>{title}</button>)}</div>
    {!progress?<Empty title="Игра сейчас недоступна">История семьи остаётся доступной. Взрослый может проверить участие профиля в игре.</Empty>:<>
      {section==='look'&&<><section className="v3-hero-sheet"><div className="v3-hero-summary"><span><Sparkles size={16}/>Уровень {level.level}</span><span>{available(data)} монет</span></div>
        <GameHero role={data.role} outfit={outfit?.id} hand={hand?.id} label={'Герой '+own.name}/>
        <h2>{outfit?.title??'Готов к новому дню'}</h2>{hand&&<p className="v3-equipped-note">В руке: {hand.title}</p>}
        <div className="v3-hero-xp"><span>Опыт героя</span><strong>{level.xpToNextLevel===null?'Максимальный уровень':level.xpIntoLevel+' / '+level.xpToNextLevel}</strong></div>
        <Meter value={level.xpToNextLevel===null?100:level.xpIntoLevel} max={level.xpToNextLevel??100} label="Опыт героя"/></section>
        <Wallet/><div className="v3-section-heading"><h2>Мой облик</h2><Shirt size={19}/></div>
        <p className="v3-caption">Вещи меняют внешний вид. Покупка и применение — отдельные действия.</p>
        <div className="v3-live-list">{catalogV01.filter(i=>['outfit','item'].includes(i.kind)).map(i=><Button key={i.id} secondary onClick={()=>setItem(i.id)}>{i.title}{data.owned.some(o=>o.itemId===i.id)?' · получено':''}</Button>)}</div></>}
      {section==='pets'&&<>
        {!progress.starterPetId&&<section className="v3-pet-card"><span className="v3-section-label">Первый спутник</span><GameAsset slotId="pet.egg" label="Стартовое яйцо"/>
          <h2>{progress.starterEligible?'Пора выбрать друга':'Начнём с доброго дела'}</h2><p>{progress.starterEligible?'Котёнок или щенок — один бесплатный выбор. Результат известен заранее.':'Бесплатный выбор появится после первого принятого дела.'}</p>
          {progress.starterEligible&&<Button disabled={!active} onClick={()=>setStarter(true)}>Выбрать стартовое яйцо</Button>}</section>}
        <div className="v3-live-list">{data.pets.map(p=><button key={p.id} className="v3-live-row" onClick={()=>setPet(p.id)}><span><strong>{petName(p.species)}</strong>
          <small>{p.hatched?p.grown?'Подросший питомец':'Питомец':'Яйцо'} · {p.xp} XP{progress.petTargetId===p.id?' · получает опыт новых дел':''}{progress.companionId===p.id?' · рядом с героем':''}</small></span><Sparkles size={18}/></button>)}</div>
        <p className="v3-caption v3-live-help">Опыт получает один выбранный питомец, закреплённый при открытии дела. Смена выбора действует на новые работы. Спутник рядом с героем выбирается отдельно.</p>
      </>}
      {section==='shop'&&<><Wallet/><div className="v3-shop-list">{catalogV01.filter(i=>i.acquisition==='gold'&&(i.eligibility!=='adults'||data.role==='adult')).map(i=>
        <article key={i.id}><div className="v3-shop-item-top"><GameAsset slotId={i.assetSlotId!} variant={i.id} label={i.title}/><div><h3>{i.title}</h3><span className="v3-price"><Coins size={15}/>{i.priceGold} монет</span></div></div>
          <p className="v3-shop-ownership">{i.ownership==='family'?'Приобретается за личные монеты взрослого для семьи.':'Останется у владельца после получения.'}</p>
          <Button secondary onClick={()=>setItem(i.id)}>{data.owned.some(o=>o.itemId===i.id)?'Уже в коллекции':'Посмотреть предмет'}</Button></article>)}</div></>}
      {section==='history'&&<History/>}
    </>}
    {item&&<ItemDetails itemId={item} close={()=>setItem(null)}/>}
    {pet&&<PetDetails petId={pet} close={()=>setPet(null)}/>}
    {starter&&<StarterChoice close={()=>setStarter(false)}/>}
  </>;
}
function ItemDetails({itemId,close}:{itemId:string;close:()=>void}) {
  const {data,command,busy,pending}=useGame(),item=getCatalogItem(itemId)!;
  const [quote,setQuote]=useState<PurchaseQuote|null>(null),[preview,setPreview]=useState(false);
  const owned=data.owned.find(o=>o.itemId===itemId),slot=item.kind==='outfit'?'outfit':'hand';
  const applied=owned&&data.progress?.appearance[slot]===owned.id;
  const active=data.members.find(m=>m.id===data.memberId)?.playerStatus==='active';
  const canWear=item.kind==='outfit'||item.kind==='item';
  const equipped=(part:'outfit'|'hand')=>data.owned.find(o=>o.id===data.progress?.appearance[part])?.itemId??null;
  return <Sheet title={item.title} close={close}>
    {preview&&canWear?<GameHero role={data.role} outfit={slot==='outfit'?itemId:equipped('outfit')} hand={slot==='hand'?itemId:equipped('hand')} label={'Примерка: '+item.title}/>:
      <GameAsset slotId={item.assetSlotId!} variant={item.id} label={item.title}/>}
    <p>{item.description}</p><p className="v3-price">{quote?.price??item.priceGold} монет</p>
    <p className="v3-caption">{item.ownership==='family'?'Владелец — семья. Монеты спишутся с личного баланса взрослого.':'Владелец — твой игрок.'}</p>
    {canWear&&<Button secondary onClick={()=>setPreview(!preview)}>{preview?'Закончить примерку':'Примерить'}</Button>}
    <ActionError/>
    {owned?<><p className="v3-shop-status">{applied?'Предмет применяется к герою':'Предмет уже получен'}</p>
      {canWear&&data.progress&&<Button disabled={busy||pending||!active} onClick={async()=>{
        if(await command('SelectAppearance',{slot,ownedItemId:applied?null:owned.id,expectedRevision:data.progress!.revision},applied?'Снятие предмета':'Применение предмета'))close();
      }}>{applied?'Снять предмет':'Применить к герою'}</Button>}</>:
      quote?<><div className="v3-live-panel"><h3>Условия покупки</h3><p>Будет списано {quote.price} монет. Доступно сейчас: {available(data)}. Предмет останется в коллекции.</p></div>
        <Button disabled={busy||pending||!active||BigInt(available(data))<BigInt(quote.price)} onClick={async()=>{
          if(await command('PurchaseItem',{quoteId:quote.id,expectedOfferRevision:quote.offerRevision},'Покупка предмета')){setQuote(null);setPreview(false);}
        }}>Купить за {quote.price} монет</Button>
        <Button secondary disabled={busy||pending} onClick={async()=>{const r=await command('QuotePurchase',{itemId},'Условия покупки');if(r)setQuote(r.result.details as unknown as PurchaseQuote);}}>Обновить условия</Button></>:
        <Button disabled={busy||pending||!active} onClick={async()=>{const r=await command('QuotePurchase',{itemId},'Условия покупки');if(r)setQuote(r.result.details as unknown as PurchaseQuote);}}>Узнать условия покупки</Button>}
  </Sheet>;
}
function StarterChoice({close}:{close:()=>void}) {
  const {data,command,busy,pending}=useGame();
  const active=data.members.find(m=>m.id===data.memberId)?.playerStatus==='active';
  const [selected,setSelected]=useState<CatalogItemV01|null>(null);
  return <Sheet title="Твой первый питомец" close={close}><p>Можно выбрать одного: котёнка или щенка. Выбор бесплатный и останется с тобой.</p>
    <div className="v3-starter-options">{starterChoicesV01.map(item=><article key={item.id}><GameAsset slotId="pet.egg" variant={item.knownPetId} label={petName(item.knownPetId!)}/>
      <Button secondary aria-pressed={selected?.id===item.id} onClick={()=>setSelected(item)}>{petName(item.knownPetId!)}</Button></article>)}</div><ActionError/>
    {selected&&<Button disabled={busy||pending||!active} onClick={async()=>{if(await command('SelectStarterEgg',{itemId:selected.id},'Выбор стартового яйца'))close();}}>Выбрать: {petName(selected.knownPetId!)}</Button>}
  </Sheet>;
}
function PetDetails({petId,close}:{petId:string;close:()=>void}) {
  const {data,command,busy,pending}=useGame(),pet=data.pets.find(p=>p.id===petId)!,progress=data.progress!;
  const active=data.members.find(m=>m.id===data.memberId)?.playerStatus==='active';
  const [name,setName]=useState(pet.corner?.name??'Уютный уголок'),[theme,setTheme]=useState<NonNullable<Pet['corner']>['theme']>(pet.corner?.theme??'meadow');
  const hatch=BALANCE_POLICY_V01.pet.hatchXp,grow=hatch+BALANCE_POLICY_V01.pet.firstGrowthAdditionalXp;
  const target=pet.hatched?grow:hatch;
  return <Sheet title={petName(pet.species)} close={close}><GameAsset slotId={pet.hatched?'pet.companion':'pet.egg'} variant={pet.species}
    state={pet.hatched?pet.grown?'companion':'pet':BigInt(pet.xp)>=BigInt(hatch)?'ready_to_hatch':'unhatched'} label={pet.hatched?petName(pet.species):'Яйцо: '+petName(pet.species)}/>
    <p>{pet.grown?'Питомец подрос. Его развитие сохраняется.':pet.hatched?'Теперь можно обустроить бесплатный уголок и взять питомца с собой.':'Опыт выбранного яйца приходит за принятые дела.'}</p>
    <div className="v3-boss-progress"><span>{pet.grown?'Опыт питомца':pet.hatched?'До следующего роста':'До вылупления'}</span><strong>{pet.xp}{pet.grown?'':' / '+target}</strong></div>
    <Meter value={amountRatio(pet.xp,String(target))} max={100} label="Развитие питомца"/><ActionError/>
    <Button disabled={busy||pending||!active} secondary onClick={()=>{void command('SelectPetXpTarget',{petId:progress.petTargetId===petId?null:petId,expectedRevision:progress.revision},'Выбор питомца для опыта');}}>
      {progress.petTargetId===petId?'Отключить получение опыта новых дел':'Развивать этого питомца'}</Button>
    {!pet.hatched&&BigInt(pet.xp)>=BigInt(hatch)&&<Button disabled={busy||pending||!active} onClick={()=>{void command('HatchPetEgg',{petId,expectedRevision:pet.revision},'Вылупление питомца');}}>Помочь вылупиться бесплатно</Button>}
    {pet.hatched&&<><Button secondary disabled={busy||pending||!active} onClick={()=>{void command('SelectCompanion',{petId:progress.companionId===petId?null:petId,expectedRevision:progress.revision},'Выбор спутника');}}>
      {progress.companionId===petId?'Оставить отдыхать в уголке':'Взять с собой'}</Button>
      <div className="v3-section-heading"><h3>Бесплатный уголок</h3></div><GameAsset slotId="pet.corner" variant={pet.species+':'+theme} label={name||'Уголок питомца'}/>
      <Form disabled={!active} submit="Сохранить уголок" onSubmit={async()=>{await command('SavePetCorner',{petId,expectedRevision:pet.revision,name:name.trim(),theme},'Оформление уголка');}}>
        <Field title="Название уголка"><input required maxLength={60} value={name} onChange={e=>setName(e.target.value)}/></Field>
        <Field title="Оформление"><select value={theme} onChange={e=>setTheme(e.target.value as typeof theme)}><option value="meadow">Луговое</option><option value="sky">Небесное</option><option value="sand">Песочное</option></select></Field>
      </Form></>}
  </Sheet>;
}
const ledgerNames={gold:'Монеты',hero_xp:'XP героя',pet_xp:'XP питомца',family_contribution:'Вклад',adventure_damage:'Урон'} as const;
export function History({childrenOnly=false}:{childrenOnly?:boolean}) {
  const {data}=useGame(),[selected,setSelected]=useState<string|null>(null);
  const settlements=data.settlements.filter(s=>childrenOnly?s.playerId!==data.playerId:s.playerId===data.playerId);
  return <><div className="v3-live-list">{settlements.slice().reverse().map(s=>{
    const allocation=data.allocations.find(a=>a.id===s.allocationId),occurrence=data.occurrences.find(o=>o.id===allocation?.occurrenceId);
    return <button key={s.id} className="v3-live-row" onClick={()=>setSelected(s.id)}><span><strong>{occurrence?.title??'Принятое дело'}</strong>
      <small>{nameOf(data,s.playerId)} · {prettyDate(s.performedOn)} · {s.reward.gold} монет{s.correctionId?' · есть исправление':''}</small></span></button>;
  })}</div>
    {!settlements.length&&<Empty title="Пока нет принятых дел">Результаты сохранятся здесь после подтверждения.</Empty>}
    {!childrenOnly&&data.ledger.length>0&&<details className="v3-live-details"><summary>Все изменения накоплений</summary><div className="v3-live-list">{data.ledger.slice().reverse().map(e=>
      <div className="v3-live-ledger" key={e.id}><span>{ledgerNames[e.kind]}<small>{new Intl.DateTimeFormat('ru',{dateStyle:'short',timeStyle:'short',timeZone:data.settings.zone}).format(new Date(e.postedAt))}</small></span>
        <strong>{BigInt(e.delta)>0n?'+':''}{e.delta}</strong></div>)}</div></details>}
    {selected&&<SettlementDetails settlementId={selected} close={()=>setSelected(null)}/>}
  </>;
}
function SettlementDetails({settlementId,close}:{settlementId:string;close:()=>void}) {
  const {data,command,busy,pending}=useGame(),settlement=data.settlements.find(s=>s.id===settlementId)!;
  const [reason,setReason]=useState(''),[preview,setPreview]=useState<(CorrectionPreview&{settlementRevision:number})|null>(null);
  const correction=data.corrections.find(c=>c.id===settlement.correctionId);
  return <Sheet title="Принятый результат" close={close}><p>{nameOf(data,settlement.playerId)} · выполнено {prettyDate(settlement.performedOn)}.</p>
    <dl className="v3-details"><div><dt>Награда</dt><dd>{settlement.reward.gold} монет · {settlement.reward.heroXp} XP · {settlement.reward.familyContribution} вклада · {settlement.reward.petXp} XP питомца</dd></div>
      <div><dt>Подтверждено</dt><dd>{new Intl.DateTimeFormat('ru',{dateStyle:'long',timeStyle:'short',timeZone:data.settings.zone}).format(new Date(settlement.acceptedAt))}</dd></div></dl>
    {correction&&<div className="v3-live-panel"><h3>{correction.status==='restored'?'Исправление восстановлено':'Результат исправлен'}</h3><p>{correction.reason}</p>
      {correction.plan.map(p=><p key={p.entryId}>{ledgerNames[p.kind]}: скорректировано {p.applied}{p.waived!=='0'?', не взыскивается '+p.waived:''}</p>)}</div>}
    {data.capabilities.includes('family.manage')&&!correction&&<><p className="v3-caption">При ошибке можно скорректировать начисление. Монеты списываются только из доступного остатка; долга и отмены купленных вещей не будет.</p>
      <Form submit="Посмотреть расчёт исправления" onSubmit={async()=>{const r=await command('PreviewCorrection',{settlementId,reason:reason.trim()},'Расчёт исправления');
        if(r)setPreview({...r.result.details as unknown as CorrectionPreview,settlementRevision:r.result.revision!});}}>
        <Field title="Причина исправления"><input required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></Field>
      </Form>
      {preview&&<section className="v3-live-panel"><h3>Проверь изменения</h3><p>{preview.reason}</p>{preview.plan.map(p=><p key={p.entryId}>{ledgerNames[p.kind]}: −{p.applied}{p.waived!=='0'?' · без долга: '+p.waived:''}</p>)}
        <Button disabled={busy||pending} onClick={async()=>{if(await command('CorrectSettlement',{previewId:preview.id,expectedRevision:preview.settlementRevision},'Исправление результата'))setPreview(null);}}>Применить это исправление</Button></section>}</>}
    {data.capabilities.includes('family.manage')&&correction?.status==='applied'&&<Form submit="Восстановить исправление" onSubmit={async()=>{
      await command('RestoreCorrection',{correctionId:correction.id,expectedRevision:correction.revision,reason:reason.trim()},'Восстановление результата');
    }}><Field title="Причина восстановления" hint="Вернётся только то, что фактически было скорректировано."><input required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></Field></Form>}
    <ActionError/>
  </Sheet>;
}
