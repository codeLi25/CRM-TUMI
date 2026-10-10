import { useSearchParams, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError } from './api';
import s from './RedemptionsPage.module.css';
import { Toast } from './Toast';

export type Redemption = { id:string; createdAt:string; customerName:string; customerPhone:string; promotionName:string; code:string; benefit:string; conditions:string };
type Promotion = { name:string; code:string; benefit:string; conditions:string; startsAt:string; endsAt:string; revision:number; redemptionLimit:number|null;redemptionCount:number;remaining:number|null };
type Preview = { promotion:Promotion; customer:{ name:string;phone:string }; existing:Redemption|null };
type Listing = { redemptions:Redemption[];page:number;pages:number;total:number;today:number };
const date = (value:string) => new Intl.DateTimeFormat('es-PE',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Lima'}).format(new Date(value));
function TicketContent({ticket}:{ticket:Redemption}) {
  return <article className={s.receipt}><header><h2>EL TUMI</h2><strong>TICKET DE CANJE</strong><p>Presentar al momento de pagar</p></header>
    <p className={s.ticketId}>N.º {ticket.id}</p><p>Fecha: {date(ticket.createdAt)} (Lima)</p><hr/>
    <p><b>Cliente:</b> {ticket.customerName}</p><p><b>Celular:</b> {ticket.customerPhone}</p><hr/>
    <section><h3>{ticket.promotionName}</h3><strong>Código: {ticket.code}</strong><h3>{ticket.benefit}</h3></section><hr/>
    <b>Condiciones</b><p className={s.preserve}>{ticket.conditions}</p><hr/>
    <footer><p>Canje registrado. Una utilización por cliente y promoción. Reimprimir no genera otro canje.</p><p>El beneficio se aplica al pagar en el local. Este ticket no es un comprobante de pago.</p></footer>
  </article>;
}
export function TicketDialog({ticket,onClose,onUnauthorized,notice='',onDismissNotice=()=>{}}:{ticket:Redemption;onClose:()=>void;onUnauthorized:()=>void;notice?:string;onDismissNotice?:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null), receipt=useRef<HTMLDivElement>(null);
  const [busy,setBusy]=useState(false), [error,setError]=useState(''), [height,setHeight]=useState(200);
  useEffect(()=>{const el=ref.current!;el.showModal();return()=>el.close();},[]);
  async function download(){
    setBusy(true);setError('');
    try{
      const response=await fetch(`/api/v1/admin/redemptions/${ticket.id}/pdf`,{credentials:'same-origin',signal:AbortSignal.timeout(15000)});
      if(response.status===401){onUnauthorized();return;}
      if(!response.ok)throw new Error('No se pudo descargar el PDF. Inténtalo nuevamente.');
      const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download=`ticket-${ticket.id}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function print(){
    await document.fonts.ready;
    setHeight(Math.ceil(receipt.current!.getBoundingClientRect().height*25.4/96)+2);
    requestAnimationFrame(()=>requestAnimationFrame(()=>window.print()));
  }
  return <><dialog ref={ref} className={s.dialog} aria-label="Ticket de canje" onCancel={e=>{e.preventDefault();onClose();}}>
    <Toast message={notice} onDismiss={onDismissNotice}/>
    <header className={s.dialogHeader}><div><h2>Ticket de canje</h2><p>Registrado · Papel térmico de 80 mm</p></div><button className={s.secondary} onClick={onClose} aria-label="Cerrar ticket">×</button></header>
    <p className={s.help}>El canje ya está guardado. Cancelar la impresión no lo elimina.</p>
    <div className={s.receiptScroll}><div ref={receipt} className={s.receiptMeasure}><TicketContent ticket={ticket}/></div></div>
    {error&&<p role="alert" className={s.error}>{error}</p>}
    <div className={s.actions}><button className={s.secondary} onClick={()=>void print()}>Imprimir ticket</button><button className={s.primary} disabled={busy} onClick={()=>void download()}>{busy?'Descargando…':'Descargar PDF (80 mm)'}</button></div>
    <p className={s.help}>Al imprimir, selecciona papel de 80 mm, escala 100 % y desactiva encabezados y pies del navegador.</p>
  </dialog>{createPortal(<div className={s.printRoot}><style>{`@media print { @page { size: 80mm ${height}mm; margin: 0; } body > :not(.${s.printRoot}) { display: none !important; } }`}</style><TicketContent ticket={ticket}/></div>,document.body)}</>;
}
export function RedemptionsPage({onUnauthorized}:{onUnauthorized:()=>void}) {
  const navigationKey=useLocation().key; const [urlParams]=useSearchParams(); const incomingSearch=urlParams.get("search")??"";
  const [code,setCode]=useState(''),[phone,setPhone]=useState(''),[promotion,setPromotion]=useState<Promotion|null>(null),[preview,setPreview]=useState<Preview|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[ticket,setTicket]=useState<Redemption|null>(null),[success,setSuccess]=useState('');
  const requestKey=useRef(crypto.randomUUID());
  const [search,setSearch]=useState(incomingSearch),[query,setQuery]=useState(incomingSearch),[from,setFrom]=useState(''),[to,setTo]=useState(''),[page,setPage]=useState(1),[refresh,setRefresh]=useState(0);
  const [listing,setListing]=useState<Listing|null>(null),[loading,setLoading]=useState(true),[listError,setListError]=useState('');
  function fail(e:unknown){if(e instanceof ApiError&&e.status===401)onUnauthorized();return (e as Error).message;}
  useEffect(()=>{setSearch(incomingSearch);setPage(1);setFrom('');setTo('');},[incomingSearch,navigationKey]);
  useEffect(()=>{const timer=setTimeout(()=>{setQuery(search.trim());setPage(1);},300);return()=>clearTimeout(timer);},[search]);
  useEffect(()=>{
    let active=true;setLoading(true);setListError('');
    const params=new URLSearchParams({search:query,page:String(page),...(from?{from}:{}),...(to?{to}:{})});
    void api<Listing>(`/admin/redemptions?${params}`).then(data=>{if(active){setListing(data);setPage(data.page);}}).catch(e=>{if(active)setListError(fail(e));}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[query,page,from,to,refresh]);
  function reset(){setPromotion(null);setPreview(null);setCode('');setPhone('');setError('');requestKey.current=crypto.randomUUID();}
  async function validate(e:FormEvent){
    e.preventDefault();if(busy)return;setBusy(true);setError('');setSuccess('');setPreview(null);
    try{const result=await api<{promotion:Promotion}>('/admin/redemptions/promotion',{code});setPromotion(result.promotion);requestKey.current=crypto.randomUUID();}catch(e){setPromotion(null);setError(fail(e));}finally{setBusy(false);}
  }
  async function lookup(e:FormEvent){
    e.preventDefault();if(busy)return;setBusy(true);setError('');setPreview(null);
    try{const result=await api<Preview>('/admin/redemptions/preview',{code:promotion!.code,phone});setPreview(result);setPromotion(result.promotion);requestKey.current=crypto.randomUUID();}catch(e){setError(fail(e));}finally{setBusy(false);}
  }
  async function confirm(){
    if(busy||!preview||preview.existing)return;setBusy(true);setError('');
    try{const result=await api<{redemption:Redemption}>('/admin/redemptions',{code:preview.promotion.code,phone:preview.customer.phone,revision:preview.promotion.revision,requestKey:requestKey.current});
      setTicket(result.redemption);setSuccess('Canje registrado correctamente. El ticket está disponible para imprimir o descargar.');setRefresh(v=>v+1);reset();
    }catch(e){setError(fail(e));}finally{setBusy(false);}
  }
  return <section className={s.page}>
    <header className={s.heading}><div><h1>Canjes y tickets</h1><p>Valida promociones y entrega el beneficio a tus clientes.</p></div><span className={s.badge}>{listing?.today??'—'} canjes hoy</span></header>
    {!ticket&&<Toast message={success} onDismiss={()=>setSuccess('')}/>}
    <div className={s.workspace}><section className={s.card}>
      <h2>Validar promoción</h2><p className={s.help}>1. Ingresa el código que presenta el cliente.</p>
      <form onSubmit={validate}><label>Código de promoción<input required maxLength={40} value={code} disabled={busy} onChange={e=>{setCode(e.target.value);setPromotion(null);setPreview(null);setError('');}} placeholder="Ej. TUMI20"/></label><button className={s.primary} disabled={busy||!code.trim()}>Validar código</button></form>
      {promotion&&<><div className={s.offer}><span className={s.badge}>{promotion.remaining===0?'Cupo agotado':'Promoción vigente'}</span><h3>{promotion.name}</h3><strong>{promotion.benefit}</strong><p>{promotion.remaining===null?'Sin límite total de canjes':`${promotion.remaining} de ${promotion.redemptionLimit} canjes disponibles`}</p><p>{date(promotion.startsAt)} – {date(promotion.endsAt)}</p><p className={s.preserve}>{promotion.conditions}</p></div>
        <p className={s.help}>2. Busca al cliente con su celular registrado.</p><form onSubmit={lookup}><label>Celular del cliente<input type="tel" inputMode="tel" required maxLength={30} disabled={busy} value={phone} onChange={e=>{setPhone(e.target.value);setPreview(null);setError('');}} placeholder="9 dígitos o +51"/></label><button className={s.secondary} disabled={busy||!phone.trim()}>Buscar cliente</button></form></>}
      {busy&&<p role="status">Procesando…</p>}{error&&<p role="alert" className={s.error}>{error}</p>}
    </section><section className={s.card} aria-label="Confirmación de canje"><h2>Confirmar y emitir ticket</h2><p className={s.help}>3. Revisa los datos antes de registrar el canje.</p>
      {!preview?<div className={s.empty}><img src="/assets/figma/d4912.svg" alt=""/><h3>Listo para un nuevo canje</h3><p>Valida una promoción y busca al cliente para ver el beneficio y emitir su ticket.</p><span>Ticket térmico · PDF de 80 mm</span></div>:<><div className={s.confirmation}><small>CLIENTE IDENTIFICADO</small><h3>{preview.customer.name}</h3><p>{preview.customer.phone}</p><hr/><small>BENEFICIO</small><h3>{preview.promotion.benefit}</h3><p>{preview.promotion.name} · {preview.promotion.code}</p><p className={s.preserve}>{preview.promotion.conditions}</p></div>
      {preview.existing?<><p className={s.error} role="alert">Este cliente ya canjeó esta promoción. Puedes reimprimir su ticket.</p><button className={s.secondary} onClick={()=>setTicket(preview.existing)}>Ver ticket existente</button></>:<><p className={s.help}>Al confirmar se consume el único canje del cliente para esta promoción.</p><div className={s.actions}><button className={s.secondary} disabled={busy} onClick={reset}>Cancelar</button><button className={s.primary} disabled={busy} onClick={()=>void confirm()}>Confirmar canje y emitir ticket</button></div></>}</>}
    </section></div>
    <section className={s.history}><header><h2>Historial de canjes</h2><p>{listing?.total??0} resultados · Hora de Lima</p></header>
      <div className={s.filters}><label className={s.search}>Buscar canjes<input type="search" maxLength={100} placeholder="Cliente, celular, código o ticket…" value={search} onChange={e=>setSearch(e.target.value)}/></label><label>Desde<input type="date" value={from} onChange={e=>{setFrom(e.target.value);setPage(1);}}/></label><label>Hasta<input type="date" value={to} onChange={e=>{setTo(e.target.value);setPage(1);}}/></label><button className={s.secondary} onClick={()=>{setSearch('');setFrom('');setTo('');setPage(1);setRefresh(v=>v+1);}}>Limpiar filtros</button></div>
      {listError?<p role="alert" className={s.error}>{listError} <button className={s.secondary} onClick={()=>setRefresh(v=>v+1)}>Reintentar</button></p>:loading?<p className={s.empty} role="status">Cargando canjes…</p>:!listing?.redemptions.length?<p className={s.empty}>No hay canjes para mostrar.</p>:<div className={s.tableScroll}><table><thead><tr>{['Fecha','Cliente','Promoción','Ticket'].map(v=><th key={v}>{v}</th>)}</tr></thead><tbody>{listing.redemptions.map(r=><tr key={r.id}><td>{date(r.createdAt)}</td><td><b>{r.customerName}</b><small>{r.customerPhone}</small></td><td>{r.promotionName}<small>{r.code} · {r.benefit}</small></td><td><button className={s.secondary} onClick={()=>setTicket(r)}>Ver / reimprimir</button><small className={s.ticketId}>{r.id}</small></td></tr>)}</tbody></table></div>}
      <nav className={s.pagination} aria-label="Paginación de canjes"><button className={s.secondary} disabled={loading||!!listError||!listing||listing.page<=1} onClick={()=>setPage(v=>v-1)}>Anterior</button><span>{listing?.page??1} / {listing?.pages??1}</span><button className={s.secondary} disabled={loading||!!listError||!listing||listing.page>=listing.pages} onClick={()=>setPage(v=>v+1)}>Siguiente</button></nav>
    </section><p className={s.help}>Cualquier cliente registrado puede canjear un código vigente una sola vez, aunque no haya recibido el correo. El descuento se aplica al cobrar en el local.</p>
    {ticket&&<TicketDialog ticket={ticket} onClose={()=>setTicket(null)} onUnauthorized={onUnauthorized} notice={success} onDismissNotice={()=>setSuccess('')}/>}

  </section>;
}


