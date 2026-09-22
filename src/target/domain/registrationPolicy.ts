/** Accepted V3 product rule. Not a proof of age, guardianship or legal compliance.
 * Evidence must be resolved from trusted storage; never bind this input to an HTTP body.
 * The existing bootstrap gate remains closed regardless of this assessment.
 */
export type AccessPath = 'adult' | 'managed_child' | 'own_child';
export interface RegistrationEvidence {
  country: string;
  age: number | null;
  ageVerified: boolean;
  path: AccessPath;
  representativeVerified: boolean;
  representativeApproval: boolean;
  platformEligible: boolean;
  requiredConsentCurrent: boolean;
}
export type RegistrationBlocker = 'country' | 'age' | 'path' | 'adult_required' | 'managed_required' | 'child_required' | 'representative' | 'platform' | 'consent';
export function assessRegistration(input: RegistrationEvidence):Readonly<{eligible:boolean;blocker:RegistrationBlocker|null}> {
 const deny=(blocker:RegistrationBlocker)=>Object.freeze({eligible:false,blocker});
 if(input.country!=='RU')return deny('country');
 if(input.ageVerified!==true||typeof input.age!=='number'||!Number.isSafeInteger(input.age)||input.age<0)return deny('age');
 if(!['adult','managed_child','own_child'].includes(input.path))return deny('path');
 if(input.path==='adult'&&input.age<18)return deny('adult_required');
 if(input.path!=='adult'&&input.age>=18)return deny('child_required');
 if(input.path==='own_child'&&input.age<14)return deny('managed_required');
 if(input.path!=='adult'&&(input.representativeVerified!==true||input.representativeApproval!==true))return deny('representative');
 if(input.platformEligible!==true)return deny('platform');
 if(input.requiredConsentCurrent!==true)return deny('consent');
 return Object.freeze({eligible:true,blocker:null});
}

export interface ConsentReceipt {
 subjectId:string;
 purpose:string;
 documentVersion:string;
 acceptedAt:number;
 revokedAt:number|null;
 /** Trusted server record of authority, not a checkbox supplied by the client. */
 authorityVerified:boolean;
}
/** Separate purposes: optional analytics must never substitute for service consent. */
export function hasCurrentConsent(receipt:ConsentReceipt|null,expected:{subjectId:string;purpose:string;documentVersion:string},now:number):boolean {
 return !!receipt&&Number.isFinite(now)&&
  receipt.subjectId===expected.subjectId&&receipt.purpose===expected.purpose&&receipt.documentVersion===expected.documentVersion&&
  expected.subjectId.length>0&&expected.purpose.length>0&&expected.documentVersion.length>0&&
  receipt.authorityVerified===true&&Number.isFinite(receipt.acceptedAt)&&receipt.acceptedAt>=0&&receipt.acceptedAt<=now&&receipt.revokedAt===null;
}
