import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {api,ApiError} from './api';
import {Loader} from './Loader';
import s from './GlobalSearch.module.css';
type Customer={id:string;name:string;phone:string};
type Promotion={id:string;name:string;code:string};
type Redemption={id:string;customerName:string;promotionName:string;code:string};
type Results={customers:Customer[];promotions:Promotion[];redemptions:Redemption[]};
export function GlobalSearch({onUnauthorized}:{onUnauthorized:()=>void}){
 const [term,setTerm]=useState(''),[query,setQuery]=useState(''),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[results,setResults]=useState<Results>(),[retry,setRetry]=useState(0);
 const dialog=useRef<HTMLDialogElement>(null),input=useRef<HTMLInputElement>(null),location=useLocation();
 useEffect(()=>{setOpen(false);},[location.key]);
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close();},[open]);
 useEffect(()=>{if(!open||!query)return;let active=true;setBusy(true);setError('');setResults(undefined);const encoded=encodeURIComponent(query);void Promise.all([
  api<{customers:Customer[]}>(`/admin/customers?search=${encoded}&pageSize=5`),api<{promotions:Promotion[]}>(`/admin/promotions?search=${encoded}`),api<{redemptions:Redemption[]}>(`/admin/redemptions?search=${encoded}`),
 ]).then(([c,p,r])=>{if(active)setResults({customers:c.customers,promotions:p.promotions.slice(0,5),redemptions:r.redemptions.slice(0,5)});}).catch(err=>{if(active){if(err instanceof ApiError&&err.status===401){setOpen(false);onUnauthorized();}else setError(err.message);}}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[query,open,retry]);
 function submit(e:FormEvent){e.preventDefault();if(!term.trim())return;setQuery(term.trim());setOpen(true);}
 const link=(path:string,search=query)=>`/admin/${path}?search=${encodeURIComponent(search)}`;
 return <><form className={s.search} role="search" aria-label="Búsqueda global del panel" onSubmit={submit}><input ref={input} type="search" maxLength={100} required aria-label="Buscar por cliente o código" placeholder="Buscar por cliente o código…" value={term} onChange={e=>setTerm(e.target.value)}/><button type="submit" aria-label="Buscar en todos los módulos" disabled={!term.trim()}><img src="/assets/figma/346b5.svg" alt=""/></button></form><dialog ref={dialog} className={s.dialog} aria-labelledby="global-search-title" onCancel={()=>setOpen(false)} onClose={()=>{setOpen(false);input.current?.focus();}}><header><h2 id="global-search-title">Resultados de búsqueda</h2><button aria-label="Cerrar búsqueda" onClick={()=>setOpen(false)}>×</button></header><p>Coincidencias para «{query}» en clientes, promociones e historial de canjes.</p>{busy&&<Loader label="Buscando…"/>}{error&&<div role="alert" className={s.error}>{error}<button onClick={()=>setRetry(n=>n+1)}>Reintentar</button></div>}{results&&!busy&&<><section><h3>Clientes</h3>{results.customers.map(c=><Link key={c.id} to={link('clientes',c.phone)}><strong>{c.name}</strong><span>{c.phone}</span></Link>)}{!results.customers.length&&<p>Sin clientes encontrados.</p>}<Link className={s.all} to={link('clientes')}>Ver resultados en Clientes →</Link></section><section><h3>Promociones</h3>{results.promotions.map(p=><Link key={p.id} to={link('promociones',p.code)}><strong>{p.name}</strong><span>{p.code}</span></Link>)}{!results.promotions.length&&<p>Sin promociones encontradas.</p>}<Link className={s.all} to={link('promociones')}>Ver resultados en Promociones →</Link></section><section><h3>Canjes</h3>{results.redemptions.map(r=><Link key={r.id} to={link('canjes',r.id)}><strong>{r.customerName}</strong><span>{r.promotionName} · {r.code}</span></Link>)}{!results.redemptions.length&&<p>Sin canjes encontrados.</p>}<Link className={s.all} to={link('canjes')}>Ver resultados en Canjes →</Link></section><small>Se muestran hasta cinco coincidencias por sección. Abre el módulo para consultar todos los resultados.</small></>}</dialog></>;
}

