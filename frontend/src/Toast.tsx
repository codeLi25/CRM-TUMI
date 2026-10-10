import { useEffect, useRef, useState } from 'react';
import s from './Toast.module.css';

export function Toast({ message, onDismiss }: { message:string; onDismiss:()=>void }) {
  const dismiss=useRef(onDismiss),[paused,setPaused]=useState(false);
  dismiss.current=onDismiss;
  useEffect(()=>{if(!message||paused)return;const timer=setTimeout(()=>dismiss.current(),7000);return()=>clearTimeout(timer);},[message,paused]);
  if(!message)return null;
  return <div className={s.toast} onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} onFocus={()=>setPaused(true)} onBlur={()=>setPaused(false)}>
    <span className={s.check} aria-hidden="true">✓</span><p role="status" aria-live="polite" aria-atomic="true">{message}</p><button type="button" aria-label="Cerrar aviso" onClick={onDismiss}>×</button>
  </div>;
}
