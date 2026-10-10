import { Loader } from './Loader';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import '@fontsource/montserrat/latin-400.css';
import '@fontsource/montserrat/latin-600.css';
import '@fontsource/montserrat/latin-400-italic.css';
import '@fontsource/playfair-display/latin-700.css';
import '@fontsource/playfair-display/latin-600.css';
import '@fontsource/caprasimo/latin-400.css';
import { api, ApiError } from './api';
import { cmsImage, categories, type SiteContent } from './siteContent';
import s from './PublicPage.module.css';

const asset = (file: string) => `/assets/figma/${file}`;
const navigation = [['inicio', 'Inicio'], ['nosotros', 'Nosotros'], ['menu', 'Menú'], ['galeria', 'Galería'], ['opiniones', 'Opiniones'], ['contacto', 'Contacto'], ['promociones', 'Promociones']];
const money = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
function Icon({ file }: { file: string }) { return <img src={asset(file)} alt="" aria-hidden="true" />; }
function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className={s.sectionTitle}><h2>{title}</h2><p>{subtitle}</p></div>;
}
function Registration({heading,preview=false}: {heading:SiteContent["headings"]["registration"];preview?:boolean}) {
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [error, setError] = useState(''), [fields, setFields] = useState<Record<string, string[]>>({});
  const honeypot = useRef<HTMLInputElement>(null);
  const result = useRef<HTMLParagraphElement>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || preview) return;
    setBusy(true); setError(''); setFields({});
    try {
      const response = await api<{ message: string }>('/public/customers', { name, email, phone, consent, website: honeypot.current?.value ?? '' });
      setMessage(response.message); setName(''); setEmail(''); setPhone(''); setConsent(false);
    } catch (err) {
      setError((err as Error).message);
      if (err instanceof ApiError && err.fields) setFields(err.fields);
    } finally { setBusy(false); }
  }
  useEffect(() => { if (message || error) result.current?.focus(); }, [message, error]);
  return <section id="registro" className={s.registration}><div className={`${s.container} ${s.registrationGrid}`}>
    <div><span className={s.pill}>{heading.eyebrow}</span><h2>{heading.title}</h2><p>{heading.description}</p></div>
    <form className={s.registrationForm} onSubmit={submit} aria-label="Registro de clientes">
      {message ? <div className={s.thanks}><span aria-hidden="true">✓</span><h3>¡Bienvenido a El Tumi!</h3><p role="status" tabIndex={-1} ref={result}>{message}</p><p>No necesitas crear una cuenta ni una contraseña.</p><button type="button" className={s.outlineButton} onClick={() => setMessage('')}>Registrar a otra persona</button></div> : <>
        <div className={s.formField}><label htmlFor="customer-name">Nombre</label><input id="customer-name" name="name" autoComplete="name" minLength={2} maxLength={100} required placeholder="Tu nombre completo" value={name} onChange={e => setName(e.target.value)} aria-invalid={!!fields.name} aria-describedby={fields.name ? 'name-error' : undefined} />{fields.name && <small id="name-error">{fields.name[0]}</small>}</div>
        <div className={s.formRow}>
          <div className={s.formField}><label htmlFor="customer-phone">Número de teléfono</label><input id="customer-phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" maxLength={30} required placeholder="+51 900 000 000" value={phone} onChange={e => setPhone(e.target.value)} aria-invalid={!!fields.phone} aria-describedby={fields.phone ? 'phone-error' : undefined} />{fields.phone && <small id="phone-error">{fields.phone[0]}</small>}</div>
          <div className={s.formField}><label htmlFor="customer-email">Correo electrónico</label><input id="customer-email" name="email" type="email" autoComplete="email" maxLength={254} required placeholder="tu@correo.com" value={email} onChange={e => setEmail(e.target.value)} aria-invalid={!!fields.email} aria-describedby={fields.email ? 'email-error' : undefined} />{fields.email && <small id="email-error">{fields.email[0]}</small>}</div>
        </div>
        <div className={s.trap} aria-hidden="true"><label htmlFor="website">Sitio web</label><input id="website" name="website" ref={honeypot} tabIndex={-1} autoComplete="off" /></div>
        <label className={s.consent}><input type="checkbox" name="consent" checked={consent} required onChange={e => setConsent(e.target.checked)} />Acepto recibir comunicaciones sobre promociones y novedades de Restaurante Tumi.</label>
        {error && <p className={s.error} role="alert" tabIndex={-1} ref={result}>{error}</p>}
        <button type="submit" className={s.greenButton} disabled={busy || preview}>{busy ? 'Registrando…' : 'Quiero recibir promociones'}</button>
      </>}
    </form>
  </div></section>;
}

function Menu({content,preview}: {content:SiteContent;preview:boolean}) {
  const dishes=content.dishes.filter(d=>d.visible);
  const [category, setCategory] = useState('Platos Principales'), [all, setAll] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const filtered = category === 'Todos' ? dishes : dishes.filter(dish => dish.category === category);
  function changeCategory(value: string) { setCategory(value); setAll(false); track.current?.scrollTo({ left: 0 }); }
  function scroll(direction: number) { track.current?.scrollBy({ left: direction * track.current.clientWidth, behavior: 'smooth' }); }
  return <section id="menu" className={`${s.section} ${s.sage}`}><div className={s.container}>
    <SectionTitle {...content.headings.menu} />
    <div className={s.categories} aria-label="Categorías de platos">{categories.map(value => <button key={value} type="button" aria-pressed={category === value} className={category === value ? s.selectedCategory : ''} onClick={() => changeCategory(value)}>{value}</button>)}</div>
    <div className={s.dishCarousel}>
      <div className={all ? s.dishGrid : s.dishTrack} ref={track} tabIndex={filtered.length ? 0 : -1} aria-label="Platos de la carta">
        {filtered.map(dish => <article className={s.dish} key={dish.id}>
          {dish.image ? <img className={s.dishPhoto} src={cmsImage(dish.image,preview)} alt={dish.name} loading="lazy" /> : <div className={s.noPhoto}>{dish.id === 'caldo' && <Icon file="6eccd.svg" />}<span>Fotografía pendiente</span></div>}
          <div className={s.dishInfo}><h3>{dish.name}</h3><p>{dish.description}</p><strong>{money.format(dish.price)}</strong></div>
        </article>)}
      </div>
      {!filtered.length && <p className={s.empty}>Pronto publicaremos los platos de esta categoría.</p>}
      {!!filtered.length && !all && <><button className={`${s.arrow} ${s.previous}`} type="button" aria-label="Platos anteriores" onClick={() => scroll(-1)}><Icon file="77f2a.svg" /></button><button className={`${s.arrow} ${s.next}`} type="button" aria-label="Más platos" onClick={() => scroll(1)}><Icon file="2fc81.svg" /></button></>}
    </div>
    <button className={s.outlineButton} onClick={() => { setCategory('Todos'); setAll(!all); }} type="button">{all ? 'Ver carta en carrusel' : 'Ver menú completo'}</button>
  </div></section>;
}

function Promotions({content,preview}:{content:SiteContent;preview:boolean}) {
  const banners=content.banners.filter(b=>b.visible);
  const [slide,setSlide]=useState(0),[paused,setPaused]=useState(false);
  const index=banners.length?slide%banners.length:0;
  useEffect(()=>{if(paused||banners.length<2||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;const timer=setInterval(()=>setSlide(i=>(i+1)%banners.length),6000);return()=>clearInterval(timer);},[paused,banners.length]);
  if(!banners.length)return null;
  return <section id="promociones" className={s.section}><div className={s.container}><SectionTitle {...content.headings.promotions}/>
    <div className={s.bannerCarousel} aria-roledescription="carrusel" aria-label="Promociones" onFocusCapture={()=>setPaused(true)}>
      {banners.map((b,i)=><div className={s.banner} key={b.id} hidden={index!==i}><img src={cmsImage(b.image,preview)} alt={b.alt} loading="lazy"/>{(b.title||b.description||b.label)&&<div className={s.bannerText}><span>{b.label}</span><h3>{b.title}</h3><p>{b.description}</p></div>}</div>)}
      {banners.length>1&&<><button className={`${s.arrow} ${s.previous}`} aria-label="Promoción anterior" onClick={()=>{setPaused(true);setSlide((index-1+banners.length)%banners.length);}}><Icon file="77f2a.svg"/></button><button className={`${s.arrow} ${s.next}`} aria-label="Siguiente promoción" onClick={()=>{setPaused(true);setSlide((index+1)%banners.length);}}><Icon file="2fc81.svg"/></button></>}
    </div>{banners.length>1&&<div className={s.indicators}>{banners.map((b,i)=><button key={b.id} aria-label={`Ver promoción ${i+1}`} aria-pressed={index===i} onClick={()=>{setPaused(true);setSlide(i);}}/>)}<button className={s.pause} onClick={()=>setPaused(!paused)} aria-label={paused?'Reanudar promociones':'Pausar promociones'}>{paused?'Reanudar':'Pausar'}</button></div>}
  </div></section>;
}

export function PublicPage({preview=false}:{preview?:boolean}) {
  const [content,setContent]=useState<SiteContent|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{let active=true;setError('');void api<{content:SiteContent}>(preview?'/admin/cms/preview':'/public/content').then(r=>{if(active)setContent(r.content);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[preview,retry]);
  if(error)return <main className={s.loadState}><h1>No pudimos cargar el contenido</h1><p role="alert">{error}</p><button className={s.greenButton} onClick={()=>setRetry(v=>v+1)}>Reintentar</button></main>;
  if(!content)return <div className={s.loadState}><Loader label="Cargando El Tumi…"/></div>;
  return <>{preview&&<div className={s.previewBanner}>Vista previa privada del borrador. <Link to="/admin/contenido">Volver al editor</Link></div>}<PublicSite content={content} preview={preview}/></>;
}

export function PublicSite({content,preview=false}:{content:SiteContent;preview?:boolean}) {
  const publicRoot=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||!('IntersectionObserver' in window))return;
    const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add(s.revealed);observer.unobserve(entry.target);}},{threshold:.08});
    publicRoot.current?.querySelectorAll('main > section:not(#inicio)').forEach(section=>observer.observe(section));
    return()=>observer.disconnect();
  },[]);

  const [menuOpen, setMenuOpen] = useState(false), [info, setInfo] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    document.title = `${content.site.name} | Restaurante Campestre`;
    return () => { document.title = 'El Tumi | Administración'; };
  }, []);
  function showInfo(title: string) { dialogTrigger.current = document.activeElement as HTMLElement; setInfo(title); dialog.current?.showModal(); }
  const contact={...content.site,whatsapp:`https://wa.me/${content.site.whatsapp}`,map:content.site.mapUrl};
  const features=content.story.features,featureIcons=['1d0a5.svg','bf7b5.svg','01faa.svg','7737b.svg'];
  const gallery=content.gallery.filter(i=>i.visible),reviews=content.reviews.filter(i=>i.visible);
  const image=(path:string)=>cmsImage(path,preview);
  return <div className={s.publicPage} ref={publicRoot}>
    <a href="#contenido-publico" className={s.skip}>Saltar al contenido</a>
    <header className={s.header}><a className={s.logo} href="#inicio" aria-label="El Tumi, inicio"><img src={image(content.site.logo)} alt="" /><span>{content.site.name}</span></a><button className={s.mobileToggle} aria-expanded={menuOpen} aria-controls="public-nav" aria-label={menuOpen ? 'Cerrar navegación' : 'Abrir navegación'} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? '✕' : '☰'}</button><nav id="public-nav" aria-label="Navegación del restaurante" className={menuOpen ? s.navOpen : ''}>{navigation.map(([id, text]) => <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)}>{text}</a>)}<a className={s.greenButton} href="#registro" onClick={() => setMenuOpen(false)}>Regístrate</a></nav></header>
    <main id="contenido-publico">
      <section className={s.hero} id="inicio"><img src={image(content.hero.image)} alt={content.hero.alt} fetchPriority="high" /><div className={s.heroShade} /><div className={s.heroText}><h1>{content.hero.title}</h1><h2>{content.hero.subtitle}</h2><p>{content.hero.description}</p><div className={s.heroActions}><a className={s.greenButton} href="#nosotros">{content.hero.primaryLabel}</a><a className={s.heroOutline} href={contact.whatsapp} target="_blank" rel="noreferrer">{content.hero.secondaryLabel}</a></div></div></section>
      <section className={`${s.section} ${s.story}`} id="nosotros"><div className={`${s.container} ${s.storyGrid}`}><div><span className={s.pill}>{content.story.eyebrow}</span><h2>{content.story.title}</h2><p>{content.story.paragraph1}</p><p>{content.story.paragraph2}</p><div className={s.features}>{features.map((feature,i) => <div key={i}><Icon file={featureIcons[i]} /><div><h3>{feature.title}</h3><p>{feature.description}</p></div></div>)}</div></div><div className={s.storyPhoto}><img src={image(content.story.image)} alt={content.story.alt} loading="lazy" /></div></div></section>
      <Menu content={content} preview={preview}/>
      <section id="galeria" className={s.section}><div className={s.container}><SectionTitle {...content.headings.gallery}/><div className={s.gallery}>{gallery.map(g => <div className={g.layout==='large'?s.galleryLarge:g.layout==='tall'?s.galleryTall:g.layout==='wide'?s.galleryWide:''} key={g.id}><img src={image(g.image)} alt={g.alt} loading="lazy" /></div>)}</div></div></section>
      <section id="opiniones" className={`${s.section} ${s.sage}`}><div className={s.container}><SectionTitle {...content.headings.reviews}/><div className={s.reviews}>{reviews.map(review => <article className={s.review} key={review.id}><div className={s.reviewAuthor}><span>{review.image?<img className={s.reviewPhoto} src={image(review.image)} alt={review.name}/>:review.name[0]}</span><div><h3>{review.name}</h3><div className={s.stars} aria-label={`${review.rating} de 5 estrellas`}>{Array.from({length:review.rating},(_,i)=>i).map(i => <Icon key={i} file="a4861.svg" />)}</div></div></div><p>“{review.text}”</p></article>)}</div><p className={s.reviewClosing}>{content.headings.reviewClosing}</p></div></section>
      <section id="contacto" className={s.section}><div className={s.container}><SectionTitle {...content.headings.contact}/><div className={s.contactGrid}><div className={s.contactDetails}><div><Icon file="068fb.svg" /><div><h3>Dirección</h3><p>{contact.address}</p></div></div><div><Icon file="f0432.svg" /><div><h3>Horario de Atención</h3><p>{contact.hours}</p></div></div><div><Icon file="501f3.svg" /><div><h3>Contacto</h3><p>WhatsApp: {contact.phone}</p></div></div><div className={s.contactActions}><a href={contact.whatsapp} className={s.greenButton} target="_blank" rel="noreferrer"><Icon file="e7b4b.svg" />Escríbenos por WhatsApp</a>{contact.map&&<a href={contact.map} className={s.outlineButton} target="_blank" rel="noreferrer"><Icon file="c3198.svg" />Cómo llegar</a>}</div></div><a className={s.map} href={contact.map||undefined} target={contact.map?"_blank":undefined} rel="noreferrer" aria-label="Mapa del restaurante"><img src={image(content.site.mapImage)} alt="Mapa de la zona de Ingenio, Junín" loading="lazy" /></a></div></div></section>
      <Registration heading={content.headings.registration} preview={preview}/>
      <Promotions content={content} preview={preview}/>
    </main>
    <footer className={s.footer}><div className={`${s.container} ${s.footerGrid}`}><div><a href="#inicio" className={s.footerLogo}><img src={image(content.site.logo)} alt="" /><strong>{content.site.name}</strong></a><p>{content.site.footerText}</p><div className={s.socials}>{content.site.facebook&&<a href={content.site.facebook} target="_blank" rel="noreferrer" aria-label="Facebook"><Icon file="3f1d7.svg"/></a>}{content.site.instagram&&<a href={content.site.instagram} target="_blank" rel="noreferrer" aria-label="Instagram"><Icon file="87405.svg"/></a>}<a href={contact.whatsapp} target="_blank" rel="noreferrer" aria-label="WhatsApp de El Tumi"><Icon file="d1666.svg" /></a></div></div><div><h3>Enlaces</h3>{navigation.slice(0, 6).map(([id, text]) => <a key={id} href={`#${id}`}>{text}</a>)}</div><div className={s.footerContact}><h3>Contacto</h3><p><Icon file="c231c.svg" />{contact.address}</p><a href={contact.whatsapp} target="_blank" rel="noreferrer"><Icon file="3c1bf.svg" />{contact.phone}</a><p><Icon file="69fcb.svg" />{content.site.hours}</p></div><div><h3>Legal</h3>{['Política de Privacidad', 'Términos y Condiciones', 'Consentimiento de Comunicaciones'].map(title => <button className={s.textButton} key={title} onClick={() => showInfo(title)}>{title}</button>)}<Link to="/admin">Acceso administrativo</Link></div></div><div className={`${s.container} ${s.copyright}`}><p>© {new Date().getFullYear()} {content.site.name}</p>{content.site.footerNotice&&<small>{content.site.footerNotice}</small>}</div></footer>
    <dialog className={s.dialog} ref={dialog} aria-labelledby="information-title" onClose={() => dialogTrigger.current?.focus()}><h2 id="information-title">{info}</h2><p style={{whiteSpace:'pre-wrap'}}>{info==='Términos y Condiciones'?content.legal.terms:info==='Consentimiento de Comunicaciones'?content.legal.consent:content.legal.privacy}</p><button className={s.greenButton} onClick={() => dialog.current?.close()}>Cerrar</button></dialog>
  </div>;
}


