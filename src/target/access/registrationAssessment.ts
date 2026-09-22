import type {openTargetDatabase} from '../db/database';
import type {createConsentService} from '../consent/service';
import {assessRegistration,type RegistrationEvidence} from '../domain/registrationPolicy';
import {entityId} from '../contracts/ids';
type Db=Awaited<ReturnType<typeof openTargetDatabase>>['db'];
type Tx=Parameters<Parameters<Db['transaction']>[0]>[0];
interface VerifiedSubject {
 familyId:string;
 profileId:string;
 evidence:Omit<RegistrationEvidence,'requiredConsentCurrent'>;
}
/** Internal assessment for an existing profile, NOT first-family bootstrap.
 * resolveSubject authenticates the credential, locks/rechecks live authority and
 * resolves evidence in the SAME transaction. No browser-provided age/consent flags.
 * A successful result still does not issue a session or open the release gate.
 */
export function createRegistrationAssessment(db:Db,consents:Pick<ReturnType<typeof createConsentService>,'isCurrent'>,resolveSubject:(tx:Tx,credential:string)=>Promise<VerifiedSubject>){
 return async function assess(credential:string){
  return db.transaction(async tx=>{
   const subject=await resolveSubject(tx,credential);
   const familyId=entityId(subject.familyId),profileId=entityId(subject.profileId);
   const requiredConsentCurrent=await consents.isCurrent(tx,{familyId,subjectId:profileId,purpose:'service'});
   return assessRegistration({...subject.evidence,requiredConsentCurrent});
  });
 };
}
