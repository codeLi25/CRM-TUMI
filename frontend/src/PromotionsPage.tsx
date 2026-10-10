import { useSearchParams, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError } from './api';
import s from './PromotionsPage.module.css';
import { Toast } from './Toast';

type Promotion = { id: string; name: string; benefit: string; conditions: string; code: string; imageUrl: string; startsAt: string; endsAt: string; paused: boolean; redemptionLimit: number | null; revision: number; state: string; _count: { campaigns: number; redemptions: number } };
type Listing = { promotions: Promotion[]; counts: Record<string, number>; page: number; pages: number; mode: string; warning?: string | null; stats: { campaigns: number; accepted: number; simulated: number; subscribers: number } };
type Campaign = { id: string; subject: string; mode: string; status: string; segment: string; scheduledAt: string; note: string | null; promotion?: { name: string; paused: boolean; deletedAt: string | null }; counts?: Record<string, number>; snapshot: { name: string } };
type Recipient = { id: string; name: string; email: string; status: string; attempts: number; detail: string | null };
const states: Record<string, string> = { all: 'Todas', active: 'Vigentes', upcoming: 'Futuras', paused: 'Pausadas', ended: 'Finalizadas' };
const segments: Record<string, string> = { all: 'Todos los suscritos', new: 'Nuevos', active: 'Activos', frequent: 'Frecuentes', inactive: 'Inactivos (>45 días)' };
const statuses: Record<string, string> = { queued: 'En cola', running: 'En proceso', completed: 'Finalizada', cancelled: 'Cancelada', pending: 'Pendiente', sending: 'Enviando', simulated: 'Prueba local', accepted: 'Aceptado por el proveedor', failed: 'Fallido', skipped: 'Omitido', uncertain: 'Por verificar' };
const date = (value: string) => new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' }).format(new Date(value));
const localInput = (value: string) => new Date(new Date(value).getTime() - 5 * 3600000).toISOString().slice(0, 16);
const toUtc = (value: string) => new Date(`${value}:00-05:00`).toISOString();
function Icon({ file }: { file: string }) { return <img src={`/assets/figma/${file}`} alt="" />; }
function Dialog({ title, onClose, busy = false, children }: { title: string; onClose: () => void; busy?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = ref.current!; el.showModal(); return () => el.close(); }, []);
  return <dialog ref={ref} className={s.dialog} aria-labelledby="promotion-dialog-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <header className={s.dialogHeader}><div><h2 id="promotion-dialog-title">{title}</h2><p>Promociones y difusión por correo · El Tumi</p></div><button onClick={onClose} disabled={busy} aria-label="Cerrar ventana">×</button></header>{children}
  </dialog>;
}
function ErrorNotice({ message }: { message: string }) { return message ? <p role="alert" className={s.error}>{message}</p> : null; }
function MailFrame({ html }: { html: string }) { return <iframe title="Vista previa del correo" sandbox="" referrerPolicy="no-referrer" srcDoc={html} className={s.mailFrame} />; }

function PromotionForm({ promotion, onClose, onSaved, fail }: { promotion: Promotion | null; onClose: () => void; onSaved: (message: string) => void; fail: (error: unknown) => string }) {
  const [imageUrl, setImageUrl] = useState(promotion?.imageUrl ?? ''), [uploading, setUploading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [limited, setLimited] = useState(promotion?.redemptionLimit != null);
  async function upload(file?: File) {
    if (!file) return; setError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { setError('Usa PNG, JPG o WebP de hasta 2 MB.'); return; }
    setUploading(true);
    try {
      const res = await fetch('/api/v1/admin/promotion-image', { method: 'POST', body: file, headers: { 'Content-Type': file.type }, credentials: 'same-origin', signal: AbortSignal.timeout(30000) });
      const data = await res.json(); if (!res.ok) throw new ApiError(data.message ?? 'No se pudo cargar la imagen.', res.status);
      setImageUrl(data.imageUrl);
    } catch (err) { setError(fail(err)); } finally { setUploading(false); }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (busy || uploading) return;
    if (!imageUrl) { setError('Carga una imagen para la promoción.'); return; }
    const form = new FormData(e.currentTarget); setBusy(true); setError('');
    try {
      await api(promotion ? `/admin/promotions/${promotion.id}/edit` : '/admin/promotions', {
        name: form.get('name'), benefit: form.get('benefit'), conditions: form.get('conditions'), code: form.get('code'), imageUrl,
        redemptionLimit: limited ? Number(form.get('redemptionLimit')) : null,
        startsAt: toUtc(String(form.get('startsAt'))), endsAt: toUtc(String(form.get('endsAt'))), paused: form.get('paused') === 'on', ...(promotion ? { revision: promotion.revision } : {}),
      });
      onSaved(promotion ? 'Promoción actualizada. Las campañas anteriores conservan su contenido.' : 'Promoción creada. Ya puedes preparar su campaña de correo.');
    } catch (err) { setError(fail(err)); } finally { setBusy(false); }
  }
  return <Dialog title={promotion ? 'Editar promoción' : 'Nueva promoción'} onClose={onClose} busy={busy || uploading}>
    <form onSubmit={submit} className={s.form}><fieldset disabled={busy || uploading} className={s.formGrid}><div className={s.column}>
      <label>Nombre de la promoción<input name="name" defaultValue={promotion?.name} maxLength={120} required /></label>
      <label>Beneficio o descuento<textarea name="benefit" defaultValue={promotion?.benefit} maxLength={500} rows={3} required /></label>
      <label>Código compartido<input name="code" defaultValue={promotion?.code} maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9-]{2,39}" readOnly={!!promotion && (promotion._count.campaigns > 0 || promotion._count.redemptions > 0)} required placeholder="Ej. TUMI-FAMILIA" /></label>
      <small>Un solo código para todos los clientes. Después de crear una campaña o registrar un canje, el código se conserva.</small>
      <label>Condiciones<textarea name="conditions" defaultValue={promotion?.conditions} rows={5} maxLength={4000} required placeholder="Platos incluidos, días válidos y restricciones…" /></label>
    </div><div className={s.column}>
        <label>Imagen de la promoción<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void upload(e.target.files?.[0])} /></label>
        <small>PNG, JPG o WebP · máximo 2 MB</small>
        {imageUrl ? <img className={s.imagePreview} src={imageUrl} alt="Imagen de la promoción" /> : <div className={s.imageEmpty}>Añade una imagen para la tarjeta y el correo.</div>}
        <h3>Vigencia de la promoción</h3><p className={s.help}>Todas las fechas y horas corresponden a Lima (UTC−5).</p>
        <label>Inicio de vigencia<input type="datetime-local" name="startsAt" defaultValue={promotion ? localInput(promotion.startsAt) : ''} required /></label>
        <label>Fin de vigencia<input type="datetime-local" name="endsAt" defaultValue={promotion ? localInput(promotion.endsAt) : ''} required /></label>
        <label className={s.checkbox}><input type="checkbox" checked={limited} onChange={e => setLimited(e.target.checked)} />Limitar el total de canjes</label>
        {limited && <label>Límite total de canjes<input type="number" name="redemptionLimit" min={Math.max(1, promotion?._count.redemptions ?? 0)} max={2147483647} step={1} required defaultValue={promotion?.redemptionLimit ?? 200} /></label>}
        <small>{limited ? 'La promoción estará disponible hasta agotar este total o finalizar su vigencia, lo que ocurra primero.' : 'Sin límite total: se aplica la vigencia y un solo canje por cliente.'} {promotion ? `${promotion._count.redemptions} canjes registrados. Cambiar el límite no reinicia los canjes.` : ''}</small>
        <label className={s.checkbox}><input type="checkbox" name="paused" defaultChecked={promotion?.paused} />Guardar pausada</label>
      </div></fieldset><ErrorNotice message={error} /><footer className={s.actions}><button type="button" className={s.secondary} onClick={onClose} disabled={busy || uploading}>Cancelar</button><button className={s.primary} disabled={busy || uploading}>{uploading ? 'Cargando imagen…' : busy ? 'Guardando…' : 'Guardar promoción'}</button></footer></form>
  </Dialog>;
}

function DeletePromotion({ promotion, onClose, onDeleted, fail }: { promotion: Promotion; onClose: () => void; onDeleted: (message: string) => void; fail: (error: unknown) => string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function remove() {
    if (busy) return; setBusy(true); setError('');
    try {
      const result = await api<{ message: string }>(`/admin/promotions/${promotion.id}/delete`, { revision: promotion.revision });
      onDeleted(result.message);
    } catch (err) { setError(fail(err)); } finally { setBusy(false); }
  }
  return <Dialog title="Eliminar promoción" onClose={onClose} busy={busy}>
    <h3>{promotion.name}</h3><p className={s.help}>Código: {promotion.code}</p>
    <p className={s.help}>La promoción desaparecerá del listado y no podrá volver a activarse desde el panel. Su código quedará reservado.</p>
    <p className={s.help}>Se cancelarán los envíos pendientes. El historial y los correos ya procesados se conservarán; un mensaje que ya se esté enviando puede terminar.</p>
    <ErrorNotice message={error} />
    <footer className={s.actions}><button className={s.secondary} onClick={onClose} disabled={busy}>Cancelar</button><button className={s.danger} onClick={() => void remove()} disabled={busy}>{busy ? 'Eliminando…' : 'Confirmar eliminación'}</button></footer>
  </Dialog>;
}

function CampaignForm({ promotion, onClose, onSaved, fail }: { promotion: Promotion; onClose: () => void; onSaved: (message: string) => void; fail: (error: unknown) => string }) {
  const [subject, setSubject] = useState(promotion.name), [preheader, setPreheader] = useState(promotion.benefit.slice(0, 200)), [segment, setSegment] = useState('all');
  const [schedule, setSchedule] = useState(false), [scheduledAt, setScheduledAt] = useState('');
  const [preview, setPreview] = useState<{ html: string; count: number; mode: string; warning?: string | null } | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [requestKey] = useState(() => crypto.randomUUID());
  const payload = () => ({ subject, preheader, segment, scheduledAt: schedule ? toUtc(scheduledAt) : null, revision: promotion.revision });
  async function review(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { setPreview(await api(`/admin/promotions/${promotion.id}/preview`, payload())); }
    catch (err) { setError(fail(err)); } finally { setBusy(false); }
  }
  async function confirm() {
    if (busy || !preview) return; setBusy(true); setError('');
    try { await api(`/admin/promotions/${promotion.id}/campaigns`, { ...payload(), requestKey, mode: preview.mode }); onSaved(preview.mode === 'preview' ? 'Campaña de prueba guardada. Sus mensajes aparecerán en el historial cuando se procesen.' : 'Campaña confirmada. Consulta su progreso en el historial.'); }
    catch (err) { setError(fail(err)); } finally { setBusy(false); }
  }
  return <Dialog title={promotion._count.campaigns ? 'Preparar nuevo envío' : 'Preparar campaña'} onClose={onClose} busy={busy}>
    <div className={s.formGrid}><form className={s.column} onSubmit={review} onChange={() => setPreview(null)}><h3>{promotion.name}</h3><p className={s.help}>Código: {promotion.code}. Cada confirmación crea una campaña nueva. Los reenvíos no conceden otro canje.</p>
      <label>Asunto del correo<input maxLength={150} required value={subject} onChange={e => setSubject(e.target.value)} disabled={busy} /></label>
      <label>Texto de vista previa<textarea maxLength={200} rows={3} required value={preheader} onChange={e => setPreheader(e.target.value)} disabled={busy} /></label>
      <label>Destinatarios<select value={segment} onChange={e => setSegment(e.target.value)} disabled={busy}>{Object.entries(segments).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
      <p className={s.help}>Solo clientes suscritos. Activos y frecuentes estarán disponibles cuando se registren canjes.</p>
      <label className={s.checkbox}><input type="checkbox" checked={schedule} onChange={e => setSchedule(e.target.checked)} disabled={busy} />Programar para más tarde</label>
      {schedule && <label>Fecha y hora de envío (Lima)<input type="datetime-local" required value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} disabled={busy} /></label>}
      <p className={s.help}>La fecha de envío es independiente de la vigencia. Los destinatarios se calculan al comenzar el envío y se respetan las bajas posteriores.</p>
      <button className={s.secondary} disabled={busy}>{busy ? 'Procesando…' : 'Revisar correo y destinatarios'}</button>
    </form><div className={s.column}>{preview ? <><p className={preview.mode === 'preview' ? s.mode : s.info}>{preview.mode === 'preview' ? 'Modo de pruebas: no se enviarán correos reales.' : preview.mode === 'resend' ? 'Envío real mediante Resend.' : 'Envío real mediante SMTP.'}</p><strong>{preview.count} destinatarios estimados</strong><MailFrame html={preview.html} /></> : <div className={s.imageEmpty}>Revisa el correo para ver la plantilla y el número de destinatarios antes de confirmar.</div>}</div></div>
    <ErrorNotice message={error} /><footer className={s.actions}><button className={s.secondary} onClick={onClose} disabled={busy}>Cancelar</button><button className={s.primary} onClick={() => void confirm()} disabled={busy || !preview}>{schedule ? 'Confirmar programación' : preview && preview.mode !== 'preview' ? 'Confirmar envío real' : 'Confirmar prueba local'}</button></footer>
  </Dialog>;
}

function CampaignHistory({ onClose, fail }: { onClose: () => void; fail: (error: unknown) => string }) {
  const [page, setPage] = useState(1), [data, setData] = useState<{ campaigns: Campaign[]; pages: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null), [recipientPage, setRecipientPage] = useState(1), [detail, setDetail] = useState<{ campaign: Campaign; recipients: Recipient[]; pages: number } | null>(null);
  const [html, setHtml] = useState(''), [error, setError] = useState(''), [refresh, setRefresh] = useState(0), [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (selected) { const result = await api<NonNullable<typeof detail>>(`/admin/campaigns/${selected}?page=${recipientPage}`); if (active) setDetail(result); }
        else { const result = await api<NonNullable<typeof data>>(`/admin/campaigns?page=${page}`); if (active) setData(result); }
        if (active) setError('');
      } catch (err) { if (active) setError(fail(err)); }
    }
    void load(); const timer = setInterval(() => void load(), 5000);
    return () => { active = false; clearInterval(timer); };
  }, [page, selected, recipientPage, refresh]);
  async function cancel(c: Campaign) {
    if (!window.confirm('¿Cancelar los envíos pendientes de esta campaña? Un mensaje en curso puede terminar.')) return;
    setBusy(true);
    try { await api(`/admin/campaigns/${c.id}/cancel`, {}); setRefresh(v => v + 1); } catch (err) { setError(fail(err)); } finally { setBusy(false); }
  }
  async function message(recipient: Recipient) {
    setBusy(true);
    try { const r = await api<{ html: string }>(`/admin/campaigns/${selected}/messages/${recipient.id}`); setHtml(r.html); } catch (err) { setError(fail(err)); } finally { setBusy(false); }
  }
  return <Dialog title="Historial de campañas" onClose={onClose} busy={busy}><p className={s.help}>Aceptado por el proveedor significa que el servidor recibió el mensaje; no confirma entrega ni apertura. Las pruebas locales se contabilizan por separado.</p><ErrorNotice message={error} />
    {selected ? <><button className={s.secondary} onClick={() => { setSelected(null); setDetail(null); setHtml(''); }}>Volver a campañas</button>{detail ? <><h3 className={s.sectionTitle}>{detail.campaign.subject}</h3><p className={s.help}>{statuses[detail.campaign.status]} · {detail.campaign.mode === 'preview' ? 'Prueba local' : detail.campaign.mode === 'resend' ? 'Resend' : 'SMTP'} · {date(detail.campaign.scheduledAt)}</p>
      {!detail.recipients.length ? <p className={s.empty}>Todavía no hay destinatarios procesados. Si está programada, se seleccionarán al llegar la fecha de envío.</p> : <div className={s.tableScroll}><table><thead><tr><th>Cliente</th><th>Resultado</th><th>Intentos</th><th>Mensaje</th></tr></thead><tbody>{detail.recipients.map(r => <tr key={r.id}><td>{r.name}<small>{r.email}</small></td><td>{statuses[r.status]}<small>{r.detail}</small></td><td>{r.attempts}</td><td><button className={s.secondary} disabled={busy} onClick={() => void message(r)}>Ver correo</button></td></tr>)}</tbody></table></div>}
      <div className={s.pagination}><button disabled={recipientPage <= 1} onClick={() => setRecipientPage(v => v - 1)}>Anterior</button><span>{recipientPage} / {detail.pages}</span><button disabled={recipientPage >= detail.pages} onClick={() => setRecipientPage(v => v + 1)}>Siguiente</button></div>{html && <MailFrame html={html} />}</> : <p role="status">Cargando destinatarios…</p>}</>
      : !data ? <p role="status">Cargando campañas…</p> : <>{!data.campaigns.length ? <p className={s.empty}>Aún no hay campañas. Prepara un envío desde una promoción.</p> : <div className={s.campaignList}>{data.campaigns.map(c => <article className={s.campaign} key={c.id}><header><h3>{c.subject}</h3><span className={s.badge}>{c.mode === 'preview' ? 'Prueba local' : c.mode === 'resend' ? 'Resend' : 'SMTP'}</span></header><p>{c.snapshot.name} · {segments[c.segment]}</p><p>{date(c.scheduledAt)} · {statuses[c.status]}{c.promotion?.deletedAt ? ' · Promoción eliminada' : c.promotion?.paused && ['queued', 'running'].includes(c.status) ? ' · Promoción pausada' : ''}</p><p className={s.help}>{Object.entries(c.counts ?? {}).map(([key, count]) => `${statuses[key]}: ${count}`).join(' · ') || 'Destinatarios por seleccionar al iniciar'}</p>{c.note && <p>{c.note}</p>}<div className={s.actions}><button className={s.secondary} onClick={() => { setSelected(c.id); setRecipientPage(1); setDetail(null); }}>Ver destinatarios y correos</button>{['queued', 'running'].includes(c.status) && <button className={s.secondary} disabled={busy} onClick={() => void cancel(c)}>Cancelar campaña</button>}</div></article>)}</div>}
        <div className={s.pagination}><button disabled={page <= 1} onClick={() => setPage(v => v - 1)}>Anterior</button><span>{page} / {data.pages}</span><button disabled={page >= data.pages} onClick={() => setPage(v => v + 1)}>Siguiente</button></div></>}
  </Dialog>;
}

export function PromotionsPage({ onUnauthorized }: { onUnauthorized: () => void }) {
  const navigationKey = useLocation().key; const [urlParams] = useSearchParams(); const incomingSearch = urlParams.get("search") ?? "";
  const [data, setData] = useState<Listing | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [notice, setNotice] = useState('');
  const [search, setSearch] = useState(incomingSearch), [query, setQuery] = useState(incomingSearch), [state, setState] = useState('all'), [page, setPage] = useState(1), [refresh, setRefresh] = useState(0);
  const [form, setForm] = useState<Promotion | 'new' | null>(null), [send, setSend] = useState<Promotion | null>(null), [history, setHistory] = useState(false), [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Promotion | null>(null);
  function fail(err: unknown) { if (err instanceof ApiError && err.status === 401) onUnauthorized(); return err instanceof Error ? err.message : 'No se pudo completar la operación.'; }
  useEffect(() => { setSearch(incomingSearch); setPage(1); setState('all'); }, [incomingSearch, navigationKey]);
  useEffect(() => { const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    void api<Listing>(`/admin/promotions?${new URLSearchParams({ search: query, state, page: String(page) })}`).then(r => { if (active) { setData(r); setPage(r.page); } }).catch(err => { if (active) setError(fail(err)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, state, page, refresh]);
  async function pause(p: Promotion) {
    setBusy(true); setError('');
    try { const r = await api<{ message: string }>(`/admin/promotions/${p.id}/pause`, { paused: !p.paused, revision: p.revision }); setNotice(r.message); setRefresh(v => v + 1); }
    catch (err) { setError(fail(err)); } finally { setBusy(false); }
  }
  function saved(message: string) { setForm(null); setSend(null); setNotice(message); setRefresh(v => v + 1); }
  return <section className={s.page}><header className={s.heading}><div><h1>Promociones <span className={s.season}>TEMPORADA {new Date().getFullYear()}</span></h1><p>Campañas promocionales, beneficios y segmentación de clientes.</p></div><div className={s.actions}><button className={s.secondary} onClick={() => setHistory(true)}><Icon file="4ccd2.svg" />Historial de campañas</button><button className={s.primary} onClick={() => setForm('new')}><Icon file="eee2d.svg" />Nueva promoción</button></div></header>
    <Toast message={notice} onDismiss={() => setNotice('')} /><ErrorNotice message={error} />
    <div className={s.kpis}><article><span>Promociones creadas<Icon file="7235c.svg" /></span><strong>{data?.counts.all ?? '—'}</strong></article><article><span>Campañas de correo</span><strong>{data?.stats.campaigns ?? '—'}</strong><small>{data?.stats.subscribers ?? 0} clientes suscritos</small></article><article><span>Correos aceptados por el proveedor<Icon file="6b8fc.svg" /></span><strong>{data?.stats.accepted ?? '—'}</strong><small>{data?.stats.simulated ?? 0} mensajes de prueba local</small></article></div>
    <div className={s.filters}><div role="group" aria-label="Estado de promociones">{Object.entries(states).map(([key, label]) => <button aria-pressed={state === key} className={state === key ? s.selected : ''} key={key} onClick={() => { setState(key); setPage(1); }}>{label} ({data?.counts[key] ?? '—'})</button>)}</div><label className={s.search}><Icon file="77a51.svg" /><input type="search" aria-label="Buscar promociones" placeholder="Filtrar promociones…" maxLength={100} value={search} onChange={e => setSearch(e.target.value)} /></label></div>
    {loading ? <p className={s.empty} role="status">Cargando promociones…</p> : error ? <button className={s.secondary} onClick={() => setRefresh(v => v + 1)}>Reintentar</button> : !data?.promotions.length ? <div className={s.empty}><h2>No hay promociones para mostrar</h2><p>Crea una promoción o cambia los filtros.</p></div> : <div className={s.cards}>{data.promotions.map(p => <article key={p.id} className={`${s.card} ${p.state === 'upcoming' ? s.upcoming : ''}`}><div className={s.cardBody}><header><span className={`${s.badge} ${p.state === 'active' ? s.activeBadge : ''}`}>{states[p.state]}</span><button className={`${s.switch} ${!p.paused ? s.switchOn : ''}`} role="switch" aria-checked={!p.paused} aria-label={`${p.paused ? 'Reactivar' : 'Pausar'} ${p.name}`} disabled={busy || p.state === 'ended'} onClick={() => void pause(p)}><span /></button></header><div className={s.offer}><img src={p.imageUrl} alt={p.name} /><div><h2>{p.name}</h2><p>{p.benefit}</p></div></div><p className={s.validity}><Icon file="30f80.svg" />{date(p.startsAt)} – {date(p.endsAt)}</p><p className={s.help}>{p.redemptionLimit === null ? `${p._count.redemptions} canjes · Sin límite total` : `${p._count.redemptions} de ${p.redemptionLimit} canjes · ${Math.max(0, p.redemptionLimit - p._count.redemptions)} disponibles`}{p.redemptionLimit !== null && p._count.redemptions >= p.redemptionLimit && <strong> · Cupo agotado</strong>}</p><div className={s.conditions}><strong>Condiciones</strong><p>{p.conditions}</p></div></div><footer><small>CÓDIGO: <b>{p.code}</b> · {p._count.campaigns} campañas</small><div className={s.actions}><button className={s.secondary} disabled={p.paused || p.state === 'ended'} onClick={() => setSend(p)}><Icon file="48b5d.svg" />{p._count.campaigns ? 'Preparar nuevo envío' : 'Enviar por correo'}</button><div className={s.editActions}><button className={s.secondary} onClick={() => setForm(p)}><Icon file="37c58.svg" />Editar</button><button className={s.deleteButton} disabled={busy} onClick={() => setDeleting(p)}>Eliminar</button></div></div></footer></article>)}</div>}
    <div className={s.pagination}><button disabled={loading || page <= 1} onClick={() => setPage(v => v - 1)}>Anterior</button><span>{page} / {data?.pages ?? 1}</span><button disabled={loading || !data || page >= data.pages} onClick={() => setPage(v => v + 1)}>Siguiente</button><button onClick={() => setRefresh(v => v + 1)}>Actualizar</button></div>
    {form && <PromotionForm promotion={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={saved} fail={fail} />}
    {deleting && <DeletePromotion promotion={deleting} onClose={() => setDeleting(null)} onDeleted={message => { setDeleting(null); saved(message); }} fail={fail} />}
    {send && <CampaignForm promotion={send} onClose={() => setSend(null)} onSaved={saved} fail={fail} />}
    {history && <CampaignHistory onClose={() => { setHistory(false); setRefresh(v => v + 1); }} fail={fail} />}
  </section>;
}

export function UnsubscribePage() {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '');
  const [message, setMessage] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { window.history.replaceState(null, '', window.location.pathname); }, []);
  async function unsubscribe() {
    setBusy(true); setError('');
    try { const r = await api<{ message: string }>('/public/unsubscribe', { token }); setMessage(r.message); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <main className={s.unsubscribe}><section><h1>El Tumi</h1><h2>Preferencias de correo</h2>{message ? <p role="status">{message}</p> : token ? <><p>Confirma si deseas dejar de recibir nuestras promociones por correo.</p><button className={s.primary} disabled={busy} onClick={() => void unsubscribe()}>{busy ? 'Procesando…' : 'Dejar de recibir promociones'}</button></> : <p>Abre el enlace de baja incluido en un correo de El Tumi.</p>}<ErrorNotice message={error} /><a href="/">Volver al restaurante</a></section></main>;
}


