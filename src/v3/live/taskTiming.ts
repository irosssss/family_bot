import type { Allocation, GameProjection, Occurrence } from '../../v3-shared/game';
/** The saved work calendar and server clock remain authoritative after a family timezone change. */
export function dateInWorkZone(instant:string,zone:string):string {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(instant));
  const part=(name:string)=>parts.find(p=>p.type===name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function workTiming(data:Pick<GameProjection,'serverTime'>,work:Occurrence){
  const today=dateInWorkZone(data.serverTime,work.period.zone);
  return {today,earliest:dateInWorkZone(work.openedAt,work.period.zone),expired:today>work.submissionThrough};
}
export function isExpiredWork(data:Pick<GameProjection,'serverTime'|'occurrences'>,allocation:Allocation){
  const work=data.occurrences.find(o=>o.id===allocation.occurrenceId);
  return ['open','returned'].includes(allocation.status)&&Boolean(work&&workTiming(data,work).expired);
}
