import { useSearchParams, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError } from './api';
import s from './CustomersPage.module.css';
import { Toast } from './Toast';
import { TicketDialog, type Redemption } from './RedemptionsPage';

type Segment = 'new' | 'active' | 'frequent' | 'inactive';
type Customer = { id: string; revision: number; name: string; email: string; phone: string; createdAt: string; lastActivityAt: string; redemptionCount: number; segment: Segment; source: string; subscribed: boolean; consentAt: string };
type List = { customers: Customer[]; counts: Record<Segment | 'all', number>; page: number; pages: number; total: number };
const labels = { all: 'Todos', new: 'Nuevos', active: 'Activos', frequent: 'Frecuentes', inactive: 'Inactivos' };
const singular = { new: 'Nuevo', active: 'Activo', frequent: 'Frecuente', inactive: 'Inactivo' };
const date = (value: string) => new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeZone: 'America/Lima' }).format(new Date(value));
function Badge({ segment }: { segment: Segment }) { return <span className={`${s.badge} ${s[segment]}`}>{singular[segment]}</span>; }

function Modal({ title, onClose, children, busy = false }: { title: string; onClose: () => void; children: ReactNode; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className={s.dialog} aria-labelledby="customer-dialog-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <header className={s.modalHeader}><h2 id="customer-dialog-title">{title}</h2><button type="button" aria-label="Cerrar ventana" disabled={busy} onClick={onClose}>×</button></header>{children}
  </dialog>;
}

function Register({ customer, onClose, onCreated, onUnauthorized }: { customer?: Customer; onClose: () => void; onCreated: () => void; onUnauthorized: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string[]>>({});
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setError(''); setFields({});
    try {
      await api(customer ? `/admin/customers/${customer.id}/edit` : '/admin/customers', { name: data.get('name'), email: data.get('email'), phone: data.get('phone'), consent: data.get('consent') === 'on', ...(customer ? { revision: customer.revision } : {}) });
      onCreated();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { onUnauthorized(); return; }
      setError((err as Error).message); if (err instanceof ApiError) setFields(err.fields ?? {});
    } finally { setBusy(false); }
  }
  return <Modal title={customer ? "Editar cliente" : "Registrar cliente"} onClose={onClose} busy={busy}>
    <p className={s.intro}>Añade sus datos para mantener el contacto y compartir promociones.</p>
    <form onSubmit={submit} className={s.form}>
      {([{ key: 'name', label: 'Nombre completo', type: 'text', max: 100, auto: 'name' }, { key: 'email', label: 'Correo electrónico', type: 'email', max: 254, auto: 'email' }, { key: 'phone', label: 'Celular', type: 'tel', max: 30, auto: 'tel' }] as const).map(field => <label key={field.key} className={s.field}>
        {field.label}<input name={field.key} defaultValue={customer?.[field.key]} type={field.type} maxLength={field.max} minLength={field.key === 'name' ? 2 : undefined} autoComplete={field.auto} required disabled={busy} aria-invalid={!!fields[field.key]} aria-describedby={fields[field.key] ? `error-${field.key}` : undefined} placeholder={field.key === 'phone' ? '9 dígitos o +51' : undefined} />
        {fields[field.key] && <span className={s.fieldError} id={`error-${field.key}`}>{fields[field.key][0]}</span>}
      </label>)}
      <label className={s.consent}><input type="checkbox" name="consent" required={!customer} disabled={busy} />Confirmo que el cliente autorizó recibir promociones por correo de El Tumi.</label>
      <p className={s.hint}>Marca esta casilla únicamente después de obtener su autorización.{customer && " Cambiar el correo detiene los envíos pendientes a la dirección anterior. Sin una nueva autorización, el nuevo correo queda sin suscripción. Editar otros datos mantiene la suscripción actual."}</p>
      {error && <p role="alert" className={s.error}>{error}</p>}
      <div className={s.actions}><button type="button" className={s.secondary} onClick={onClose} disabled={busy}>Cancelar</button><button className={s.primary} disabled={busy}>{busy ? 'Guardando…' : 'Guardar cliente'}</button></div>
    </form>
  </Modal>;
}

function ActionIcon({ kind }: { kind: 'edit' | 'delete' }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind === 'edit' ? <><path d="m16 3 5 5-12 12-6 1 1-6Z" /><path d="m14 5 5 5" /></> : <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>}</svg>;
}
function DeleteCustomer({ customer, onClose, onDeleted, onUnauthorized }: { customer: Customer; onClose: () => void; onDeleted: () => void; onUnauthorized: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function remove() {
    if (busy) return; setBusy(true); setError('');
    try { await api(`/admin/customers/${customer.id}/delete`, { revision: customer.revision }); onDeleted(); }
    catch (err) { if (err instanceof ApiError && err.status === 401) onUnauthorized(); else setError((err as Error).message); }
    finally { setBusy(false); }
  }
  return <Modal title="Eliminar cliente" onClose={onClose} busy={busy}><p>¿Eliminar a <strong>{customer.name}</strong> del listado?</p><p className={s.intro}>Se cancelan sus correos pendientes y no podrá realizar nuevos canjes. Los tickets y campañas anteriores se conservan. Un correo que ya esté en envío puede terminar.</p><p className={s.hint}>El correo y celular quedan reservados para conservar su historial. No hay restauración desde este panel.</p>{error && <p role="alert" className={s.error}>{error}</p>}<div className={s.actions}><button className={s.secondary} disabled={busy} onClick={onClose}>Cancelar</button><button className={`${s.primary} ${s.deleteConfirm}`} disabled={busy} onClick={() => void remove()}>{busy ? 'Eliminando…' : 'Confirmar eliminación'}</button></div></Modal>;
}

function History({ id, onClose, onUnauthorized }: { id: string; onClose: () => void; onUnauthorized: () => void }) {
  const [customer, setCustomer] = useState<Customer | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [redemptions,setRedemptions]=useState<Redemption[]>([]),[page,setPage]=useState(1),[pages,setPages]=useState(1),[ticket,setTicket]=useState<Redemption|null>(null);
  useEffect(() => {
    let active = true; setError('');setCustomer(null);
    void api<{ customer: Customer;redemptions:Redemption[];page:number;pages:number }>(`/admin/customers/${id}/history?page=${page}`).then(data => { if (active) {setCustomer(data.customer);setRedemptions(data.redemptions);setPage(data.page);setPages(data.pages);} }).catch(err => {
      if (!active) return; if (err instanceof ApiError && err.status === 401) onUnauthorized(); else setError(err.message);
    });
    return () => { active = false; };
  }, [id, retry, page]);
  return <Modal title={customer?.name ?? 'Historial del cliente'} onClose={onClose}>
    {error ? <div role="alert" className={s.error}>{error} <button onClick={() => setRetry(v => v + 1)}>Reintentar</button></div> : !customer ? <p role="status">Cargando historial…</p> : <>
      <p className={s.intro}>Sede Ingenio · <Badge segment={customer.segment} /></p>
      <div className={s.contact}><span>{customer.phone}</span><span>{customer.email}</span><small>{customer.subscribed ? 'Suscrito a promociones' : 'No suscrito a promociones'}</small></div>
      <div className={s.stats}><div><strong>{customer.redemptionCount}</strong><span>Canjes registrados</span></div><div><strong>{date(customer.createdAt)}</strong><span>Fecha de registro</span></div></div>
      <h3>Historial de canjes</h3>{!redemptions.length?<p className={s.emptyHistory}>Sin canjes registrados.</p>:<>{redemptions.map(r=><div className={s.timeline} key={r.id}><strong>{r.promotionName}</strong><p>{r.benefit} · {r.code}</p><small>{date(r.createdAt)}</small><p><button className={s.secondary} onClick={()=>setTicket(r)}>Ver / reimprimir ticket</button></p></div>)}<div className={s.actions}><button className={s.secondary} disabled={page<=1} onClick={()=>setPage(v=>v-1)}>Anterior</button><span>{page} / {pages}</span><button className={s.secondary} disabled={page>=pages} onClick={()=>setPage(v=>v+1)}>Siguiente</button></div></>}
      <h3>Registro del cliente</h3><div className={s.timeline}><strong>{date(customer.createdAt)}</strong><p>{customer.source === 'admin' ? 'Registrado por el administrador' : 'Registro en la página pública'}</p><small>Consentimiento registrado el {date(customer.consentAt)}.</small></div>
    </>}{ticket&&<TicketDialog ticket={ticket} onClose={()=>setTicket(null)} onUnauthorized={onUnauthorized}/>}
  </Modal>;
}

export function CustomersPage({ onUnauthorized }: { onUnauthorized: () => void }) {
  const navigationKey=useLocation().key; const [urlParams]=useSearchParams(); const incomingSearch=urlParams.get("search")??"";
  const [search, setSearch] = useState(incomingSearch), [query, setQuery] = useState(incomingSearch), [segment, setSegment] = useState<Segment | 'all'>('all');
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(10), [sort, setSort] = useState('newest');
  const [data, setData] = useState<List | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0), [register, setRegister] = useState(false), [editing, setEditing] = useState<Customer | null>(null), [deleting, setDeleting] = useState<Customer | null>(null), [history, setHistory] = useState<string | null>(null), [success, setSuccess] = useState('');
  useEffect(()=>{setSearch(incomingSearch);setPage(1);setSegment('all');},[incomingSearch,navigationKey]);
  useEffect(() => { const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    const params = new URLSearchParams({ search: query, segment, page: String(page), pageSize: String(pageSize), sort });
    void api<List>(`/admin/customers?${params}`).then(result => { if (active) { setData(result); setPage(result.page); } }).catch(err => {
      if (!active) return; if (err instanceof ApiError && err.status === 401) onUnauthorized(); else setError(err.message);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, segment, page, pageSize, sort, refresh]);
  const updating = loading || search.trim() !== query;
  return <section className={s.page}>
    <header className={s.heading}><div><h1>Clientes (CRM)</h1><p>Gestión de base de datos de visitantes y segmentación por actividad.</p></div><button className={s.primary} onClick={() => { setSuccess(''); setRegister(true); }}><img src="/assets/figma/ea25f.svg" alt="" />Registrar cliente</button></header>
    <Toast message={success} onDismiss={()=>setSuccess('')}/>
    <div className={s.filters}><div className={s.searchRow}><div className={s.search}><img src="/assets/figma/346b5.svg" alt="" /><input aria-label="Buscar clientes" placeholder="Buscar por nombre, teléfono o correo…" value={search} maxLength={100} onChange={e => setSearch(e.target.value)} type="search" /></div><select aria-label="Ordenar clientes" value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}><option value="newest">Más recientes</option><option value="oldest">Más antiguos</option><option value="name">Nombre A–Z</option></select></div>
      <div className={s.segments} role="group" aria-label="Filtrar por segmento">{(Object.keys(labels) as (keyof typeof labels)[]).map(key => <button key={key} aria-pressed={segment === key} className={segment === key ? s.selected : key === 'frequent' ? s.gold : ''} onClick={() => { setSegment(key); setPage(1); }}>{labels[key]} <span>({data?.counts[key] ?? '—'})</span></button>)}</div>
    </div>
    <div className={s.list} aria-busy={updating}><header className={s.listHeading}><div><h2>Listado general</h2><span>Página {data?.page ?? 1} de {data?.pages ?? 1}</span></div><p>{updating ? 'Actualizando…' : `Mostrando ${data?.customers.length ?? 0} de ${data?.total ?? 0}`}</p></header>
      {error ? <div role="alert" className={s.state}><p>{error}</p><button className={s.secondary} onClick={() => setRefresh(v => v + 1)}>Reintentar</button></div> : updating ? <p role="status" className={s.state}>Cargando clientes…</p> : !data?.customers.length ? <div className={s.state}><h3>No hay clientes para mostrar</h3><p>{query || segment !== 'all' ? 'Prueba otra búsqueda o cambia el segmento.' : 'Los registros de la página pública y los que añadas aquí aparecerán en este listado.'}</p></div> : <div className={s.tableScroll} tabIndex={0} role="region" aria-label="Listado de clientes"><table><thead><tr>{['Cliente', 'Contacto', 'Registro', 'Canjes', 'Estado', 'Última actividad', 'Acciones'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{data.customers.map(customer => <tr key={customer.id}><th scope="row">{customer.name}</th><td><span>{customer.phone}</span><small>{customer.email}</small></td><td>{date(customer.createdAt)}</td><td><b className={s.count}>{customer.redemptionCount}</b></td><td><Badge segment={customer.segment} /></td><td>{date(customer.lastActivityAt)}</td><td><div className={s.rowActions}><button className={s.historyButton} aria-label={`Ver historial de ${customer.name}`} onClick={() => setHistory(customer.id)}>Ver historial</button><button className={s.iconButton} title="Editar cliente" aria-label={`Editar cliente ${customer.name}`} onClick={() => setEditing(customer)}><ActionIcon kind="edit" /></button><button className={`${s.iconButton} ${s.danger}`} title="Eliminar cliente" aria-label={`Eliminar cliente ${customer.name}`} onClick={() => setDeleting(customer)}><ActionIcon kind="delete" /></button></div></td></tr>)}</tbody></table></div>}
      <footer className={s.pagination}><nav aria-label="Paginación de clientes"><button className={s.secondary} disabled={updating || !!error || !data || data.page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button><span>{data?.page ?? 1} / {data?.pages ?? 1}</span><button className={s.secondary} disabled={updating || !!error || !data || data.page >= data.pages} onClick={() => setPage(p => p + 1)}>Siguiente</button></nav><label>Por página <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>{[5, 10, 25, 50].map(n => <option key={n}>{n}</option>)}</select></label></footer>
    </div>
    <p className={s.hint}>Nuevo: sin canjes · Activo: 1–3 · Frecuente: 4 o más · Inactivo: más de 45 días sin actividad. La última actividad corresponde al último canje o al registro si nunca canjeó.</p>
    {register && <Register onClose={() => setRegister(false)} onUnauthorized={onUnauthorized} onCreated={() => { setRegister(false); setSearch(''); setQuery(''); setSegment('all'); setSort('newest'); setPage(1); setRefresh(v => v + 1); setSuccess('Cliente registrado correctamente.'); }} />}
    {editing && <Register customer={editing} onClose={() => setEditing(null)} onUnauthorized={onUnauthorized} onCreated={() => { setEditing(null); setRefresh(v => v + 1); setSuccess("Datos del cliente actualizados."); }} />}
    {deleting && <DeleteCustomer customer={deleting} onClose={() => setDeleting(null)} onUnauthorized={onUnauthorized} onDeleted={() => { setDeleting(null); setRefresh(v => v + 1); setSuccess("Cliente eliminado. Su historial se conserva."); }} />}
    {history && <History id={history} onClose={() => setHistory(null)} onUnauthorized={onUnauthorized} />}
  </section>;
}


