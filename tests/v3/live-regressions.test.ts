import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {LiveContext,type LiveState} from '../../src/v3/live/context';
import {OrderDetails} from '../../src/v3/live/Rewards';
import {PetDetails,SettlementDetails} from '../../src/v3/live/Hero';
import {TaskDetails} from '../../src/v3/live/Tasks';
import {Meter} from '../../src/v3/ui';
import {dateInWorkZone,isExpiredWork,workTiming} from '../../src/v3/live/taskTiming';
import {gameHarness} from '../v3-server/support/game-harness';
import {projectGame} from '../../src/v3-server/game/engine';

describe('V3 live view regressions',()=>{
  it('keeps dialogs usable when refreshed permissions remove their selected records',()=>{
    const h=gameHarness(),data=projectGame(h.world,h.context('adult'));
    const state:LiveState={data,busy:false,pending:false,error:null,command:async()=>null,admin:async()=>null,refresh:async()=>{},retryPending:null};
    for(const detail of [createElement(OrderDetails,{orderId:'gone',close:()=>{}}),createElement(SettlementDetails,{settlementId:'gone',close:()=>{}}),
      createElement(PetDetails,{petId:'gone',close:()=>{}})]){
      const markup=renderToStaticMarkup(createElement(LiveContext.Provider,{value:state},detail));
      expect(markup).toContain('недоступ');expect(markup).toContain('aria-label="Закрыть"');
    }
  });
  it('does not expose out-of-range progress values to assistive technology',()=>{
    for(const [value,max,expected,expectedMax] of [[323,100,100,100],[-2,100,0,100],[NaN,100,0,100],[1,0,1,1]]){
      const markup=renderToStaticMarkup(createElement(Meter,{value,max,label:'Развитие'}));
      expect(markup).toContain(`aria-valuenow="${expected}"`);expect(markup).toContain(`aria-valuemax="${expectedMax}"`);
    }
  });
  it('uses the frozen work timezone at midnight and keeps submitted work reviewable after the deadline',()=>{
    const h=gameHarness(),allocation=h.create('child'),work=h.world.occurrences[0];
    work.period.zone='America/Los_Angeles';work.submissionThrough='2026-09-10';
    const data={serverTime:'2026-09-11T06:59:59.000Z',occurrences:[work]};
    expect(workTiming(data,work).today).toBe('2026-09-10');expect(isExpiredWork(data,allocation)).toBe(false);
    data.serverTime='2026-09-11T07:00:00.000Z';expect(isExpiredWork(data,allocation)).toBe(true);
    expect(isExpiredWork(data,{...allocation,status:'submitted'})).toBe(false);
    expect(dateInWorkZone('2026-03-29T00:30:00.000Z','Europe/Berlin')).toBe('2026-03-29');
    expect(dateInWorkZone('2026-03-29T01:30:00.000Z','Europe/Berlin')).toBe('2026-03-29');
  });
  it('shows the frozen contribution destination before work, including no-goal work',()=>{
    const h=gameHarness(),allocation=h.create('adult'),data=projectGame(h.world,h.context('adult'));
    const state:LiveState={data,busy:false,pending:false,error:null,command:async()=>null,admin:async()=>null,refresh:async()=>{},retryPending:null};
    const markup=renderToStaticMarkup(createElement(LiveContext.Provider,{value:state},createElement(TaskDetails,{allocationId:allocation.id,close:()=>{}})));
    expect(markup).toContain('Семейная цель');expect(markup).toContain('Без цели: вклад сохранится в истории');
  });
});
