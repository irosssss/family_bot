import {describe,it,expect} from 'vitest';
import {assessRegistration,hasCurrentConsent,type RegistrationEvidence} from '../../src/target/domain/registrationPolicy';
const base:RegistrationEvidence={country:'RU',age:18,ageVerified:true,path:'adult',representativeVerified:false,representativeApproval:false,platformEligible:true,requiredConsentCurrent:true};
describe('accepted Russian V3 access policy, not bootstrap authorization',()=>{
 it('permits an adult only at 18 with verified evidence',()=>{expect(assessRegistration(base).eligible).toBe(true);expect(assessRegistration({...base,age:17}).blocker).toBe('adult_required');expect(assessRegistration({...base,ageVerified:false}).blocker).toBe('age');});
 it('requires managed access below 14',()=>{const child={...base,age:13,path:'own_child' as const,representativeVerified:true,representativeApproval:true};expect(assessRegistration(child).blocker).toBe('managed_required');expect(assessRegistration({...child,path:'managed_child'}).eligible).toBe(true);});
 it('allows own child access at 14–17 only with representative and platform checks',()=>{for(const age of [14,17]){const child={...base,age,path:'own_child' as const,representativeVerified:true,representativeApproval:true};expect(assessRegistration(child).eligible).toBe(true);expect(assessRegistration({...child,representativeApproval:false}).blocker).toBe('representative');expect(assessRegistration({...child,representativeVerified:false}).blocker).toBe('representative');expect(assessRegistration({...child,platformEligible:false}).blocker).toBe('platform');}});
 it('rejects unknown country, missing consent and invalid ages',()=>{expect(assessRegistration({...base,country:'US'}).blocker).toBe('country');expect(assessRegistration({...base,requiredConsentCurrent:false}).blocker).toBe('consent');for(const age of [null,NaN,-1,14.5])expect(assessRegistration({...base,age}).blocker).toBe('age');});
 it('does not give an adult a child path',()=>{expect(assessRegistration({...base,path:'managed_child'}).blocker).toBe('child_required');});
});
describe('consent receipt checks',()=>{
 const expected={subjectId:'subject',purpose:'service',documentVersion:'v1'};
 const receipt={...expected,acceptedAt:100,revokedAt:null,authorityVerified:true};
 it('matches the subject, purpose and current document',()=>{expect(hasCurrentConsent(receipt,expected,200)).toBe(true);for(const patch of [{subjectId:'other'},{purpose:'analytics'},{documentVersion:'old'}])expect(hasCurrentConsent({...receipt,...patch},expected,200)).toBe(false);});
 it('rejects revoked, future, absent or unverified receipts',()=>{expect(hasCurrentConsent(null,expected,200)).toBe(false);expect(hasCurrentConsent({...receipt,revokedAt:150},expected,200)).toBe(false);expect(hasCurrentConsent({...receipt,acceptedAt:300},expected,200)).toBe(false);expect(hasCurrentConsent({...receipt,authorityVerified:false},expected,200)).toBe(false);});
});
