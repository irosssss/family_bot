import { useState } from 'react';
import { KeyRound, Sprout } from 'lucide-react';
import { Button } from '../ui';
import { Field } from './context';
import { postApi } from './transport';
export type RuntimeMode='local'|'telegram';
type TelegramWindow=Window & {Telegram?:{WebApp?:{initData?:string;ready?:()=>void;expand?:()=>void}}};
export function telegramData(){return (window as TelegramWindow).Telegram?.WebApp?.initData??'';}
export function readyTelegram(){const app=(window as TelegramWindow).Telegram?.WebApp;app?.ready?.();app?.expand?.();}
export function Login({mode,onLogin}:{mode:RuntimeMode;onLogin:(recovery:string|null)=>void}) {
  const [name,setName]=useState(''),[pin,setPin]=useState(''),[confirm,setConfirm]=useState(''),[invite,setInvite]=useState('');
  const [credential,setCredential]=useState('local-owner'),[recovery,setRecovery]=useState('');
  const [view,setView]=useState<'login'|'create'|'recover'>('login'),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const submit=async()=>{
    if(view!=='login'&&pin!==confirm){setError('PIN и повтор PIN должны совпадать.');return;}
    if(mode==='telegram'&&!telegramData()){setError('Откройте приложение из Telegram.');return;}
    setBusy(true);setError(null);
    try{
      const proof=mode==='local'?credential:telegramData();
      const result=await postApi<{recoveryCode:string|null}>(view==='recover'?'auth/recover':'auth/login',
        view==='recover'?{credential:proof,recoveryCode:recovery.trim(),newPin:pin}:
          {credential:proof,pin,displayName:name.trim()||'Игрок',invite:invite.trim()||null,intent:view==='create'?'enroll':'login'});
      setPin('');setConfirm('');onLogin(result.recoveryCode);
    }catch(e){setError(e instanceof Error?e.message:'Не удалось войти.');}finally{setBusy(false);}
  };
  return <div className="v3-app v3-live"><div className="v3-prototype-banner">{mode==='local'?'Локальная тестовая семья · данные сохраняются':'Family Life'}</div>
    <main className="v3-main v3-login"><div className="v3-login-mark"><Sprout size={38}/></div>
      <h1>Добро пожаловать домой</h1><p className="v3-login-intro">Родители и дети вместе делают обычный день чуть лучше.</p>
      <div className="v3-tabs" aria-label="Вход в семью">{([['login','Войти'],['create','Начать'],['recover','Восстановить']] as const).map(([id,label])=>
        <button type="button" key={id} aria-pressed={view===id} onClick={()=>{setView(id);setError(null);}}>{label}</button>)}</div>
      <form className="v3-live-form" onSubmit={e=>{e.preventDefault();void submit();}}><fieldset disabled={busy}>
        {mode==='local'&&<Field title="Тестовое устройство" hint="Устройства помогают проверить приглашение и отдельный вход."><select value={credential} onChange={e=>setCredential(e.target.value)}>
          <option value="local-owner">Основное устройство</option><option value="local-second">Второе устройство</option><option value="local-third">Третье устройство</option></select></Field>}
        {view==='create'&&<><Field title="Как тебя называть"><input required maxLength={80} autoComplete="nickname" value={name} onChange={e=>setName(e.target.value)}/></Field>
          <Field title="Код приглашения" hint="Оставь пустым, чтобы создать новую семью."><input maxLength={64} autoComplete="off" value={invite} onChange={e=>setInvite(e.target.value)}/></Field></>}
        {view==='recover'&&<Field title="Одноразовый код восстановления"><input required minLength={64} maxLength={64} autoComplete="off" value={recovery} onChange={e=>setRecovery(e.target.value)}/></Field>}
        <Field title={view==='login'?'PIN профиля':'Новый PIN'} hint="От 6 до 12 цифр."><input required type="password" inputMode="numeric" pattern="[0-9]{6,12}" maxLength={12} autoComplete={view==='login'?'current-password':'new-password'} value={pin} onChange={e=>setPin(e.target.value)}/></Field>
        {view!=='login'&&<Field title="Повтори PIN"><input required type="password" inputMode="numeric" pattern="[0-9]{6,12}" maxLength={12} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></Field>}
        {error&&<p className="v3-live-error" role="alert">{error}</p>}
        <Button type="submit">{busy?'Входим…':view==='create'?'Начать вместе':view==='recover'?'Восстановить доступ':'Войти в профиль'}</Button>
      </fieldset></form>
      <div className="v3-quiet-note"><KeyRound size={20}/><p>PIN защищает профиль на общем устройстве. При первом входе сохрани код восстановления отдельно.</p></div>
    </main></div>;
}
