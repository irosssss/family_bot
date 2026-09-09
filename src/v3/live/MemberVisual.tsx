import type {PublicMember} from '../../v3-shared/game';
import {GameAsset,GameHero} from '../assets/GameAsset';
export function MemberVisual({member}:{member:PublicMember}) {
  return <><GameHero role={member.role} outfit={member.visual?.outfitItemId} hand={member.visual?.handItemId} portrait label={member.name}/>
    {member.visual?.companionSpecies&&<GameAsset className="v3-member-companion" slotId="pet.companion" variant={member.visual.companionSpecies}
      state={member.visual.companionState} label={'Спутник: '+member.name}/>}</>;
}
