import { useState } from 'react';
import { Gift, Plus } from 'lucide-react';
import type { RealOffer, RewardQuote, RewardOrder } from '../../v3-shared/game';
import { Button, Sheet } from '../ui';
import { ActionError, available, Empty, Field, Form, nameOf, useGame } from './context';
import { Wallet } from './Hero';
const states:Record<RewardOrder['status'],string>={pending_approval:'Ждёт одобрения',approved_awaiting_delivery:'Одобрено, ждёт выполнения',rejected:'Отклонено',cancelled:'Отменено',delivered:'Выполнено'};
export function Rewards() {
  const {data,command,busy,pending}=useGame(),manage=data.capabilities.includes('family.manage');
  const [editor,setEditor]=useState<RealOffer|'new'|null>(null),[quote,setQuote]=useState<RewardQuote|null>(null),[selected,setSelected]=useState<string|null>(null);
  const [history,setHistory]=useState(false);
  const active=data.members.find(m=>m.id===data.memberId)?.playerStatus==='active';
  const offers=data.offers.filter(o=>o.active),orders=data.orders.filter(o=>history||o.reserve==='active');
  return <>
    <div className="v3-section-heading"><h2>Семейные обещания</h2><Gift size={20}/></div>
    <p className="v3-caption">Взрослый заранее договаривается о награде для ребёнка. Обычное внимание, забота и базовые потребности остаются бесплатными.</p>
    {data.role==='child'&&<Wallet/>}
    {manage&&<Button secondary className="v3-live-wide" onClick={()=>setEditor('new')}><Plus size={17}/>Добавить обещание</Button>}
    <div className="v3-live-list">{offers.map(o=><article className="v3-live-panel" key={o.id}><h3>{o.title}</h3><p>{o.promise}</p><p>{o.fulfillmentTerms}</p>
      <p className="v3-price">{o.price} монет</p>
      {manage?<Button secondary onClick={()=>setEditor(o)}>Изменить условия</Button>:<Button disabled={busy||pending||!active||data.orders.some(r=>r.offerId===o.id&&r.reserve==='active')}
        onClick={async()=>{const r=await command('QuoteRealReward',{offerId:o.id},'Условия семейной награды');if(r)setQuote(r.result.details as unknown as RewardQuote);}}>
        {data.orders.some(r=>r.offerId===o.id&&r.reserve==='active')?'Заявка уже открыта':'Посмотреть условия заявки'}</Button>}</article>)}</div>
    {!offers.length&&<Empty title="Пока нет обещаний">{manage?'Добавь то, что семья действительно готова выполнить.':'Взрослый может добавить доступное семейное обещание.'}</Empty>}
    <div className="v3-section-heading"><h2>Заявки</h2></div><label className="v3-switch"><input type="checkbox" checked={history} onChange={e=>setHistory(e.target.checked)}/>Показать завершённые</label>
    <div className="v3-live-list">{orders.map(o=><button className="v3-live-row" key={o.id} onClick={()=>setSelected(o.id)}><span><strong>{o.terms.title}</strong><small>
      {nameOf(data,o.playerId)} · {states[o.status]} · {o.terms.price} монет</small></span></button>)}</div>
    {!orders.length&&<p className="v3-caption">Заявок в этом разделе нет.</p>}
    {editor&&<OfferEditor offer={editor==='new'?undefined:editor} close={()=>setEditor(null)}/>}
    {quote&&<Sheet title={quote.terms.title} close={()=>setQuote(null)}><p>{quote.terms.promise}</p><p>{quote.terms.fulfillmentTerms}</p>
      <dl className="v3-details"><div><dt>Стоимость</dt><dd>{quote.terms.price} монет</dd></div><div><dt>Доступно</dt><dd>{available(data)} монет</dd></div></dl>
      <p>После заявки монеты попадут в резерв. Одобрение сохранит резерв; списание произойдёт, когда взрослый подтвердит выполнение награды. До одобрения заявку можно отменить самостоятельно.</p><ActionError/>
      <Button disabled={busy||pending||!active||BigInt(available(data))<BigInt(quote.terms.price)} onClick={async()=>{
        const r=await command('RequestRealReward',{quoteId:quote.id,expectedOfferRevision:quote.offerRevision},'Заявка на семейную награду');
        if(r){setQuote(null);setSelected(r.result.id);}
      }}>Отправить заявку и зарезервировать {quote.terms.price}</Button>
      <Button secondary disabled={busy||pending||!active} onClick={async()=>{const r=await command('QuoteRealReward',{offerId:quote.offerId},'Условия семейной награды');if(r)setQuote(r.result.details as unknown as RewardQuote);}}>Обновить условия</Button></Sheet>}
    {selected&&<OrderDetails orderId={selected} close={()=>setSelected(null)}/>}
  </>;
}
function OfferEditor({offer,close}:{offer?:RealOffer;close:()=>void}) {
  const {data,command,busy,pending}=useGame(),[title,setTitle]=useState(offer?.title??''),[promise,setPromise]=useState(offer?.promise??'');
  const [terms,setTerms]=useState(offer?.fulfillmentTerms??''),[price,setPrice]=useState(offer?.price??'120');
  const [children,setChildren]=useState(offer?.eligiblePlayerIds??data.members.filter(m=>m.active&&m.role==='child'&&m.playerStatus==='active'&&m.playerId).map(m=>m.playerId!));
  const [error,setError]=useState('');
  return <Sheet title={offer?'Условия обещания':'Новое обещание'} close={close}><p>Укажи понятное действие и условия выполнения. Изменения коснутся будущих заявок; уже принятые условия сохранятся.</p>
    <Form submit={offer?'Сохранить условия':'Добавить обещание'} onSubmit={async()=>{
      if(!children.length){setError('Выбери хотя бы одного ребёнка.');return;}
      const payload={title:title.trim(),promise:promise.trim(),fulfillmentTerms:terms.trim(),price,eligiblePlayerIds:children};
      if(await command(offer?'UpdateRealOffer':'CreateRealOffer',offer?{...payload,offerId:offer.id,expectedRevision:offer.revision}:payload,'Семейное обещание'))close();
    }}><Field title="Название награды"><input required maxLength={100} value={title} onChange={e=>setTitle(e.target.value)}/></Field>
      <Field title="Что обещаем"><input required maxLength={500} value={promise} onChange={e=>setPromise(e.target.value)}/></Field>
      <Field title="Когда и как выполним"><input required maxLength={500} value={terms} onChange={e=>setTerms(e.target.value)}/></Field>
      <Field title="Стоимость в монетах"><input required inputMode="numeric" pattern="0|[1-9][0-9]*" maxLength={15} value={price} onChange={e=>setPrice(e.target.value)}/></Field>
      <div className="v3-live-assignees">{data.members.filter(m=>m.active&&m.role==='child'&&m.playerStatus==='active'&&m.playerId).map(m=><label key={m.id} className="v3-switch">
        <input type="checkbox" checked={children.includes(m.playerId!)} onChange={e=>setChildren(e.target.checked?[...children,m.playerId!]:children.filter(id=>id!==m.playerId))}/>{m.name}</label>)}</div>
      {error&&<p className="v3-live-error" role="alert">{error}</p>}
    </Form>
    {offer&&<details className="v3-live-details"><summary>Убрать обещание</summary><p>Новые заявки закроются. Текущие останутся с согласованными условиями.</p>
      <Button secondary disabled={busy||pending} onClick={async()=>{if(await command('RetireRealOffer',{offerId:offer.id,expectedRevision:offer.revision},'Архивирование обещания'))close();}}>Убрать из доступных</Button></details>}
  </Sheet>;
}
export function OrderDetails({orderId,close}:{orderId:string;close:()=>void}) {
  const {data,command,busy,pending}=useGame(),order=data.orders.find(o=>o.id===orderId)!;
  const [reason,setReason]=useState(''),[done,setDone]=useState(false);
  if(!order)return <Sheet title="Заявка недоступна" close={close}><p>Обнови список. Доступ к заявке мог измениться.</p></Sheet>;
  const canReview=data.capabilities.includes('real_reward.review_child'),canCancel=data.capabilities.includes('real_reward.cancel_child');
  const canDeliver=data.capabilities.includes('real_reward.deliver_child'),own=order.playerId===data.playerId;
  const requests=data.cancellations.filter(c=>c.orderId===order.id),active=requests.find(c=>c.status==='pending'),last=requests[requests.length-1];
  const orderPayload={orderId,expectedRevision:order.revision};
  return <Sheet title={order.terms.title} close={close}><p>{nameOf(data,order.playerId)} · {states[order.status]}</p><p>{order.terms.promise}</p><p>{order.terms.fulfillmentTerms}</p>
    <p className="v3-price">{order.terms.price} монет · {order.reserve==='active'?'в резерве':order.reserve==='captured'?'списаны при выполнении':'резерв освобождён'}</p>
    {order.decisionReason&&<p>Комментарий к решению: {order.decisionReason}</p>}
    {order.deliveryNote&&<p>При выполнении: {order.deliveryNote}</p>}
    <ActionError/>
    {order.status==='pending_approval'&&canReview&&<section className="v3-live-form">
      <Field title="Комментарий"><input maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></Field>
      <div className="v3-live-actions"><Button disabled={busy||pending} onClick={()=>{void command('ReviewRealReward',{...orderPayload,decision:'approve',reason:reason.trim()||null},'Одобрение заявки');}}>Одобрить, сохранить резерв</Button>
        <Button secondary disabled={busy||pending||!reason.trim()} onClick={()=>{void command('ReviewRealReward',{...orderPayload,decision:'reject',reason:reason.trim()},'Отклонение заявки');}}>Отклонить с комментарием</Button></div></section>}
    {order.status==='pending_approval'&&own&&<Button secondary disabled={busy||pending} onClick={()=>{void command('CancelRealRewardRequest',orderPayload,'Отмена заявки');}}>Отменить заявку и освободить резерв</Button>}
    {order.status==='approved_awaiting_delivery'&&<>
      {active?<div className="v3-live-panel"><h3>Ребёнок просит отменить</h3><p>{active.reason}</p>
        {canCancel&&<><Field title="Комментарий к отмене"><input maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></Field>
          <div className="v3-live-actions"><Button disabled={busy||pending} onClick={()=>{void command('ResolveRewardCancellation',{cancellationId:active.id,expectedRevision:active.revision,decision:'approve',reason:reason.trim()||null},'Решение об отмене');}}>Согласовать отмену</Button>
            <Button secondary disabled={busy||pending||!reason.trim()} onClick={()=>{void command('ResolveRewardCancellation',{cancellationId:active.id,expectedRevision:active.revision,decision:'decline',reason:reason.trim()},'Решение об отмене');}}>Отказать с комментарием</Button></div></>}</div>:
        own&&<details className="v3-live-details"><summary>Попросить об отмене</summary>{last?.status==='declined'&&<p>Предыдущая просьба отклонена: {last.decisionReason}</p>}
          <Form submit="Отправить просьбу об отмене" onSubmit={async()=>{await command('RequestRewardCancellation',{...orderPayload,reason:reason.trim(),
            continuation:last?.status==='declined'?{kind:'after_decline',declinedCancellationId:last.id}:{kind:'first'}},'Просьба об отмене');}}>
            <Field title="Почему хочешь отменить"><input required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></Field></Form></details>}
      {canDeliver&&!active&&<Form submit="Подтвердить выполнение награды" onSubmit={async()=>{if(!done)return;await command('ConfirmRealRewardFulfillment',{...orderPayload,note:reason.trim()||null},'Выполнение семейной награды');}}>
        <Field title="Комментарий к выполнению"><input maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></Field>
        <label className="v3-switch"><input required type="checkbox" checked={done} onChange={e=>setDone(e.target.checked)}/>Награда уже выполнена, можно списать резерв</label></Form>}
      {canCancel&&<details className="v3-live-details"><summary>Отменить со стороны взрослого</summary><p>Резерв освободится, причина останется в истории.</p>
        <Form submit="Отменить согласованную награду" onSubmit={async()=>{await command('CancelApprovedRealRewardByAdult',{...orderPayload,reason:reason.trim()},'Отмена согласованной награды');}}>
          <Field title="Причина"><input required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></Field></Form></details>}
    </>}
    {order.history.length>0&&<details className="v3-live-details"><summary>История решения</summary>{order.history.map((h,i)=><p key={i}>
      {{approve:'Одобрено',reject:'Отклонено',cancel_pending:'Отменено ребёнком',cancel_adult:'Отменено взрослым',cancel_resolved:'Отмена согласована',deliver:'Выполнение подтверждено'}[h.kind]}
      {' · '}{new Intl.DateTimeFormat('ru',{dateStyle:'short',timeStyle:'short',timeZone:data.settings.zone}).format(new Date(h.at))}{h.reason?' · '+h.reason:''}</p>)}</details>}
  </Sheet>;
}
