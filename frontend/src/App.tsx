import { GlobalSearch } from './GlobalSearch';
import { Loader } from './Loader';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError, type Admin } from './api';
import s from './App.module.css';
import { StatisticsPage } from './StatisticsPage';
import { CmsPage } from './CmsPage';
import { PublicPage } from './PublicPage';
import { CustomersPage } from './CustomersPage';
import { RedemptionsPage } from './RedemptionsPage';
import { PromotionsPage, UnsubscribePage } from './PromotionsPage';
const asset = (file: string) => `/assets/figma/${file}`;
function Icon({ file }: { file: string }) { return <img src={asset(file)} alt="" />; }
function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={compact ? s.brandSmall : s.brand}><img src={asset('c4c0d.png')} alt="Emblema de El Tumi" /><div><strong>{compact ? 'EL TUMI' : 'Tumi Campestre'}</strong><span>{compact ? 'RESTAURANTE CAMPESTRE' : 'VALLE DE INGENIO · JUNÍN'}</span></div></div>;
}
function AuthLayout({ children }: { children: ReactNode }) {
  return <main className={s.auth}><section className={s.hero} aria-label="El Tumi Campestre"><img className={s.heroBack} src={asset('f759b.png')} alt="" /><div className={s.heroPhoto}><img src={asset('a5129.png')} alt="Jardines del restaurante campestre" /></div><div className={s.heroOverlay} /><div className={s.heroContent}><Brand /><h2>Sabor tradicional y hospitalidad campestre en el Valle de Ingenio</h2><p>Plataforma CRM unificada para la gestión de relaciones con clientes, difusión de promociones y actualización del sitio web</p><blockquote><p>“El destino gastronómico por excelencia del Mantaro. Excelencia operativa en cada plato campestre.”</p><cite>— El Tumi</cite></blockquote></div></section><section className={s.authRight}><div className={s.authCenter}>{children}</div><footer>© {new Date().getFullYear()} El Tumi Restaurante Campestre</footer></section></main>;
}
function Heading({ title, children }: { title: string; children: ReactNode }) { return <div className={s.heading}><span className={s.badge}>● EL TUMI CAMPESTRE · INGENIO</span><h1>{title}</h1><p>{children}</p></div>; }
function Notice({ text, success = false }: { text: string; success?: boolean }) { return text ? <p className={success ? s.success : s.error} role={success ? 'status' : 'alert'}>{text}</p> : null; }
function PasswordInput({ value, onChange, newPassword = false }: { value: string; onChange: (value: string) => void; newPassword?: boolean }) {
  const [visible, setVisible] = useState(false);
  return <div className={s.inputWrap}><span className={s.inputIcon}><Icon file="0e444.svg" /></span><input id="password" name="password" type={visible ? 'text' : 'password'} autoComplete={newPassword ? 'new-password' : 'current-password'} minLength={newPassword ? 12 : undefined} maxLength={128} required value={value} onChange={e => onChange(e.target.value)} placeholder="••••••••••••" /><button type="button" className={s.showPassword} aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={visible} onClick={() => setVisible(!visible)}><Icon file="26e47.svg" /></button></div>;
}
function Login({ onLogin }: { onLogin: (admin: Admin) => void }) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [remember, setRemember] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const navigate = useNavigate();
  async function submit(e: FormEvent) {
    e.preventDefault(); if (busy) return; setBusy(true); setError('');
    try { const data = await api<{ admin: Admin }>('/auth/login', { email, password, remember }); onLogin(data.admin); navigate('/admin/dashboard', { replace: true }); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <AuthLayout><Heading title="Panel de Administración">Acceso exclusivo para gerencia y personal de operaciones autorizado.</Heading><form onSubmit={submit} className={s.form}><div className={s.field}><div className={s.labelRow}><label htmlFor="email">Correo electrónico</label><span>Sede Valle del Mantaro</span></div><div className={s.inputWrap}><span className={s.inputIcon}><Icon file="4f839.svg" /></span><input id="email" name="email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@restaurantetumi.pe" /></div></div><div className={s.field}><div className={s.labelRow}><label htmlFor="password">Contraseña de Acceso</label><Link to="/admin/recuperar">¿Olvidó su contraseña?</Link></div><PasswordInput value={password} onChange={setPassword} /></div><label className={s.remember}><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />Mantener sesión iniciada</label><Notice text={error} /><button className={s.primary} disabled={busy} type="submit">{busy ? <Loader inline label="Iniciando sesión…"/> : 'Iniciar Sesión'}<Icon file="03d99.svg" /></button></form></AuthLayout>;
}
function Recovery({ reset = false }: { reset?: boolean }) {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  useEffect(() => { if (reset && window.location.hash) window.history.replaceState(null, '', window.location.pathname); }, [reset]);
  async function submit(e: FormEvent) {
    e.preventDefault(); if (busy) return; setError('');
    if (reset && password !== confirm) { setError('Las contraseñas no coinciden.'); return; }
    setBusy(true);
    try { const data = await api<{ message: string }>(reset ? '/auth/reset-password' : '/auth/forgot-password', reset ? { token, password } : { email }); setMessage(data.message); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <AuthLayout><Heading title={reset ? 'Nueva contraseña' : 'Recuperar acceso'}>{reset ? 'Elige una contraseña de entre 12 y 128 caracteres.' : 'Ingresa el correo de tu cuenta para recibir un enlace de recuperación.'}</Heading>{message ? <Notice text={message} success /> : reset && !token ? <Notice text="Abre el enlace que recibiste por correo. Si venció, solicita uno nuevo." /> : <form onSubmit={submit} className={s.form}>{reset ? <><div className={s.field}><label htmlFor="password">Nueva contraseña</label><PasswordInput value={password} onChange={setPassword} newPassword /></div><div className={s.field}><label htmlFor="confirm">Confirmar contraseña</label><input id="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirm} onChange={e => setConfirm(e.target.value)} /></div></> : <div className={s.field}><label htmlFor="email">Correo electrónico</label><input id="email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={e => setEmail(e.target.value)} /></div>}<Notice text={error} /><button className={s.primary} disabled={busy}>{busy ? 'Procesando…' : reset ? 'Guardar contraseña' : 'Enviar enlace'}</button></form>}<Link className={s.back} to="/admin">Volver al inicio de sesión</Link></AuthLayout>;
}
const modules = [
  { path: 'dashboard', name: 'Dashboard', icon: '47513.svg' },
  { path: 'clientes', name: 'Clientes (CRM)', icon: '17b6b.svg' },
  { path: 'promociones', name: 'Promociones', icon: '25537.svg' },
  { path: 'canjes', name: 'Canjes', icon: 'd4912.svg' },
  { path: 'contenido', name: 'Contenido del Sitio (CMS)', icon: '987cd.svg' },
  { path: 'estadisticas', name: 'Estadísticas', icon: 'ca1d6.svg' },
];
function Panel({ admin, onLogout }: { admin: Admin; onLogout: () => void }) {
  const [menu, setMenu] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const location = useLocation();
  const current = modules.find(m => location.pathname === `/admin/${m.path}`);
  useEffect(() => {
    let active = true;
    void api('/admin/overview').catch(err => { if (active) { if (err instanceof ApiError && err.status === 401) onLogout(); else setError(err.message); } });
    return () => { active = false; };
  }, [location.pathname]);
  async function logout() { if (busy) return;
    setBusy(true); setError('');
    try { await api('/auth/logout', {}); onLogout(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <div className={s.panel}><aside className={`${s.sidebar} ${menu ? s.open : ''}`}><Brand compact /><p className={s.navCaption}>GESTIÓN &amp; OPERACIONES</p><nav aria-label="Navegación administrativa">{modules.map(m => <NavLink key={m.path} to={`/admin/${m.path}`} onClick={() => setMenu(false)} className={({ isActive }) => isActive ? s.activeNav : s.nav}><Icon file={m.icon} />{m.name}</NavLink>)}</nav><button className={s.logout} onClick={logout} disabled={busy}><Icon file="6c9d3.svg" />{busy ? <Loader inline label="Cerrando sesión…"/> : 'Cerrar Sesión'}</button></aside><div className={s.panelBody}><header className={s.topbar}><button className={s.menuButton} onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label={menu ? 'Cerrar menú' : 'Abrir menú'}>☰</button><div className={s.headerTitle}><strong>TUMI | Panel Administrativo</strong><span>Sede Valle de Ingenio · Junín</span></div><GlobalSearch onUnauthorized={onLogout}/><Link to="/admin/canjes" className={s.validate}><Icon file="5c848.svg" />Validar Canje</Link><div className={s.user}><div><strong>{admin.name}</strong><span>Administrador</span></div><b aria-hidden="true">{admin.name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase()}</b></div></header><main className={s.content}><Notice text={error} />{!['clientes', 'promociones', 'canjes', 'contenido', 'dashboard', 'estadisticas'].includes(current?.path ?? '') && <div className={s.pageHeading}><div><h1>{current?.path === 'dashboard' ? 'Dashboard General' : current?.name ?? 'Página no encontrada'}</h1><p>Gestión del Restaurante El Tumi</p></div><span className={s.badge}>ETAPA 1 · ACCESO ADMINISTRATIVO</span></div>}{current?.path === 'clientes' ? <CustomersPage onUnauthorized={onLogout} /> : current?.path === 'promociones' ? <PromotionsPage onUnauthorized={onLogout} /> : current?.path === 'canjes' ? <RedemptionsPage onUnauthorized={onLogout} /> : current?.path === 'contenido' ? <CmsPage onUnauthorized={onLogout} /> : current?.path === 'dashboard' ? <StatisticsPage key='dashboard' dashboard onUnauthorized={onLogout} /> : current?.path === 'estadisticas' ? <StatisticsPage key='statistics' onUnauthorized={onLogout} /> : <section className={s.empty}><span className={s.eyebrow}>{current ? 'PRÓXIMA ETAPA' : '404'}</span><h2>{current ? 'Este módulo aún no está disponible' : 'No encontramos esta página'}</h2><p>{current ? 'Estamos construyendo el CRM por etapas. Aquí aparecerán las funciones y los datos reales de este módulo.' : 'Regresa al inicio del panel para continuar.'}</p><Link to="/admin/dashboard">Volver al dashboard</Link></section>}</main></div></div>;
}
function AdminApp() {
  const [admin, setAdmin] = useState<Admin | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  async function checkSession() {
    setLoading(true); setError('');
    try { const data = await api<{ admin: Admin }>('/auth/me'); setAdmin(data.admin); }
    catch (err) { if (!(err instanceof ApiError && err.status === 401)) setError((err as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void checkSession(); }, []);
  if (loading) return <div className={s.loading} ><Loader label="Comprobando tu sesión…"/></div>;
  if (error) return <div className={s.loading}><h1>No pudimos conectar</h1><Notice text={error} /><button className={s.primary} onClick={() => void checkSession()}>Reintentar</button></div>;
  return <Routes><Route path="/" element={<Navigate to="/admin" replace />} /><Route path="/admin" element={admin ? <Navigate to="/admin/dashboard" replace /> : <Login onLogin={setAdmin} />} /><Route path="/admin/recuperar" element={<Recovery />} /><Route path="/admin/restablecer" element={<Recovery reset />} /><Route path="/admin/contenido/vista-previa" element={admin ? <PublicPage preview /> : <Navigate to="/admin" replace />} /><Route path="/admin/*" element={admin ? <Panel admin={admin} onLogout={() => setAdmin(null)} /> : <Navigate to="/admin" replace />} /><Route path="*" element={<Navigate to="/admin" replace />} /></Routes>;
}

export function App() {
  const { pathname } = useLocation();
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return <AdminApp />;
  return <Routes>
    <Route path="/" element={<PublicPage />} />
    <Route path="/baja" element={<UnsubscribePage />} />
    <Route path="*" element={<main className={s.loading}><h1>Página no encontrada</h1><Link to="/">Volver a El Tumi</Link></main>} />
  </Routes>;
}



