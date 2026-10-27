import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, CalendarDays, Check,
  ChevronDown, Clock3, Dumbbell, Filter, MapPin, Menu, Plus, Search, ShieldCheck,
  Sparkles, Star, Trophy, Wallet, X, Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { appService } from "./services/appService";
import type { Action, AppData, Complex, Match, Sport } from "./types";

type Page = "courts" | "matches" | "bookings" | "wallet";
type Notice = { kind: "success" | "error"; text: string };
const sports: Array<"Todos" | Sport> = ["Todos", "Fútbol", "Pádel", "Tenis"];
const money = (amount: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(amount);

function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [page, setPage] = useState<Page>("courts");
  const [selectedSport, setSelectedSport] = useState<"Todos" | Sport>("Todos");
  const [query, setQuery] = useState("");
  const [selectedComplex, setSelectedComplex] = useState<Complex | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [initError, setInitError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setInitError("");
      setData(await appService.load());
    } catch (error) {
      setInitError(error instanceof Error ? error.message : "No se pudo conectar con Supabase.");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const runAction = async (action: Action, success: string, destination?: Page) => {
    setBusy(true);
    setNotice(null);
    try {
      setData(await appService.perform(action));
      setNotice({ kind: "success", text: success });
      if (destination) {
        setPage(destination);
        setSelectedComplex(null);
        setSelectedMatch(null);
      }
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "No se pudo completar la operación." });
    } finally {
      setBusy(false);
    }
  };

  const navigate = (nextPage: Page) => {
    setPage(nextPage);
    setSelectedComplex(null);
    setSelectedMatch(null);
    setMobileMenu(false);
    setDrawer(false);
  };

  const filteredComplexes = useMemo(() => (data?.complexes ?? []).filter((complex) => {
    const matchesSport = selectedSport === "Todos" || complex.sport === selectedSport;
    const matchesQuery = `${complex.name} ${complex.location}`.toLowerCase().includes(query.toLowerCase());
    return matchesSport && matchesQuery;
  }), [data, selectedSport, query]);
  const filteredMatches = (data?.matches ?? []).filter((match) => selectedSport === "Todos" || match.sport === selectedSport);

  if (!data) {
    return <main className="loading-screen">
      <div className="loading-mark"><Dumbbell size={28} /></div>
      <strong>CANCHA<span>RESERVA</span></strong>
      {initError ? <div className="load-error">
        <p>{initError}</p>
        <button className="button button-lime" onClick={() => void refresh()}>Reintentar</button>
        {!appService.usesSupabase && <small>Revisa la configuración de Supabase en tu archivo .env.</small>}
      </div> : <p>Preparando tu próximo partido…</p>}
    </main>;
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); navigate("courts"); }}>
          <div className="brand-mark"><Dumbbell size={23} strokeWidth={2.5} /></div>
          <span>cancha<span className="brand-accent">reserva</span><small>JUEGA A TU MANERA</small></span>
        </a>
        <div className="side-label">MENÚ PRINCIPAL</div>
        <nav className="side-nav">
          <NavButton active={page === "courts"} icon={<Search size={18} />} label="Explorar canchas" onClick={() => navigate("courts")} />
          <NavButton active={page === "matches"} icon={<Zap size={18} />} label="Partidos exprés" count={data.matches.filter((match) => match.slotsTaken < match.slotsTotal).length} onClick={() => navigate("matches")} />
          <NavButton active={page === "bookings"} icon={<CalendarDays size={18} />} label="Mis reservas" onClick={() => navigate("bookings")} />
          <NavButton active={page === "wallet"} icon={<Wallet size={18} />} label="Mi monedero" onClick={() => navigate("wallet")} />
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-promo">
            <span className="promo-icon"><Trophy size={18} /></span>
            <strong>El juego mejora<br />cuando se comparte.</strong>
            <p>Invita a tu equipo y completa el partido.</p>
            <button onClick={() => navigate("matches")}>Ver partidos <ArrowRight size={14} /></button>
          </div>
          <button className="profile-link" onClick={() => navigate("wallet")}>
            <Avatar name={data.profile.name} />
            <span><strong>{data.profile.name}</strong><small>Jugador amateur</small></span>
            <ChevronDown size={16} />
          </button>
        </div>
      </aside>

      {mobileMenu && <button className="mobile-backdrop" aria-label="Cerrar menú" onClick={() => setMobileMenu(false)} />}
      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu-button icon-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Abrir menú"><Menu size={20} /></button>
          <div className="breadcrumb"><span>Inicio</span><span className="crumb-slash">/</span><strong>{selectedComplex ? selectedComplex.name : pageTitle(page)}</strong></div>
          <div className="topbar-right">
            <div className="location-pill"><MapPin size={15} /><span>Santiago, Chile</span><ChevronDown size={13} /></div>
            <button className="wallet-pill" onClick={() => navigate("wallet")}><Wallet size={16} /><span>{money(data.profile.walletBalance)}</span><ArrowUpRight size={13} /></button>
            <button className="top-avatar" onClick={() => navigate("wallet")} aria-label="Abrir perfil"><Avatar name={data.profile.name} /></button>
          </div>
        </header>

        <div className="content-wrap">
          {page === "courts" && (selectedComplex
            ? <ComplexDetail complex={data.complexes.find((item) => item.id === selectedComplex.id) ?? selectedComplex} busy={busy} onBack={() => setSelectedComplex(null)} onCreate={() => setDrawer(true)} onBook={(schedule) => void runAction({ type: "book", complexId: selectedComplex.id, schedule }, "¡Cancha reservada! La encontrarás en tus reservas.", "bookings")} />
            : <section>
              <div className="hero">
                <div className="hero-content">
                  <div className="eyebrow"><span className="live-dot" /> TU PRÓXIMO PARTIDO EMPIEZA AQUÍ</div>
                  <h1>Encuentra tu<br />lugar en la cancha<span>.</span></h1>
                  <p>Reserva una cancha o súmate a un partido.<br className="desktop-break" /> El juego se vive mejor en equipo.</p>
                  <div className="hero-actions">
                    <button className="button button-lime" onClick={() => document.getElementById("court-list")?.scrollIntoView({ behavior: "smooth" })}>Explorar canchas <ArrowRight size={16} /></button>
                    <button className="button button-ghost" onClick={() => navigate("matches")}><Zap size={15} /> Buscar partido</button>
                  </div>
                  <div className="hero-metrics">
                    <div><strong>+2.4k</strong><span>jugadores activos</span></div>
                    <i />
                    <div><strong>4.9<span className="star">★</span></strong><span>valoración media</span></div>
                    <i />
                    <div><strong>12</strong><span>canchas cerca</span></div>
                  </div>
                </div>
                <div className="hero-image">
                  <div className="hero-image-overlay" />
                  <div className="hero-image-tag"><span className="pulse-dot" /> DISPONIBLE HOY</div>
                  <div className="hero-image-caption"><span>01 — 04</span><strong>La cancha<br />te está esperando.</strong></div>
                  <span className="hero-image-sport">PADEL / SANTIAGO</span>
                </div>
                <div className="hero-vertical">SPORTS CLUB — SANTIAGO DE CHILE</div>
              </div>

              <div className="stats-strip">
                <div><span className="stats-icon"><MapPin size={17} /></span><span><strong>Explora cerca</strong><small>Los mejores clubes de Santiago</small></span></div>
                <div><span className="stats-icon"><Zap size={17} /></span><span><strong>Únete al partido</strong><small>Comparte cancha, divide el costo</small></span></div>
                <div><span className="stats-icon"><ShieldCheck size={17} /></span><span><strong>Reserva segura</strong><small>Tu pago, siempre protegido</small></span></div>
              </div>

              <div className="section-heading" id="court-list">
                <div><div className="section-kicker">ENCUENTRA TU JUEGO</div><h2>Canchas para <span>disfrutar.</span></h2><p>Elige tu deporte y descubre tu próximo destino.</p></div>
                <button className="text-button" onClick={() => setSelectedSport("Todos")}>Ver todas <ArrowRight size={15} /></button>
              </div>
              <div className="search-filter-row">
                <label className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Busca por cancha o comuna..." /><kbd>⌘ K</kbd></label>
                <div className="filter-label"><Filter size={15} /> DEPORTE</div>
                <div className="sport-filters">
                  {sports.map((sport) => <button key={sport} className={`filter-chip ${selectedSport === sport ? "filter-active" : ""}`} onClick={() => setSelectedSport(sport)}>{sport === "Todos" ? "Todos" : <>{sportEmoji(sport)} {sport}</>}</button>)}
                </div>
              </div>
              <div className="complex-grid">
                {filteredComplexes.map((complex, index) => <ComplexCard key={complex.id} complex={complex} index={index} onClick={() => setSelectedComplex(complex)} />)}
              </div>
              {!filteredComplexes.length && <EmptyState title="No encontramos canchas" description="Prueba con otro nombre o deporte." />}
            </section>
          )}

          {page === "matches" && (selectedMatch
            ? <MatchDetail match={data.matches.find((item) => item.id === selectedMatch.id) ?? selectedMatch} profileName={data.profile.name} busy={busy} onBack={() => setSelectedMatch(null)} onJoin={() => void runAction({ type: "join", matchId: selectedMatch.id }, "¡Ya tienes tu cupo! Nos vemos en la cancha.", "bookings")} />
            : <section>
              <PageIntro eyebrow="JUEGA EN EQUIPO" title={<>Partidos <span>exprés.</span></>} description="Hay un lugar para ti. Súmate a un partido y paga solo tu parte." action={<span className="live-status"><span className="pulse-dot" /> {filteredMatches.length} partidos abiertos</span>} />
              <div className="filter-row match-filters">
                <span className="filter-label"><Filter size={15} /> DEPORTE</span>
                {sports.map((sport) => <button key={sport} className={`filter-chip ${selectedSport === sport ? "filter-active" : ""}`} onClick={() => setSelectedSport(sport)}>{sport === "Todos" ? "Todos" : <>{sportEmoji(sport)} {sport}</>}</button>)}
              </div>
              <div className="match-grid">{filteredMatches.map((match, index) => <MatchCard key={match.id} match={match} index={index} onClick={() => setSelectedMatch(match)} />)}</div>
              {!filteredMatches.length && <EmptyState title="No hay partidos con ese filtro" description="Prueba con otro deporte o crea un partido desde la sección de canchas." />}
            </section>
          )}

          {page === "bookings" && <section>
            <PageIntro eyebrow="TU ACTIVIDAD" title={<>Mis <span>reservas.</span></>} description="Todos tus partidos y canchas en un mismo lugar." />
            <div className="booking-summary"><div className="summary-icon"><CalendarDays size={20} /></div><div><strong>{data.bookings.length} reservas</strong><small>Tu historial deportivo</small></div><span className="summary-total">{money(data.bookings.reduce((sum, item) => sum + item.pricePaid, 0))}<small> invertidos</small></span></div>
            {data.bookings.length ? <div className="booking-list">{data.bookings.map((booking) => <article className="booking-row" key={booking.id}>
              <div className={`booking-sport-icon sport-${sportSlug(booking.sport)}`}>{sportEmoji(booking.sport)}</div>
              <div className="booking-info"><div><strong>{booking.complexName}</strong><span className="booking-type">{booking.bookingType}</span></div><p><CalendarDays size={14} /> {booking.schedule}<span className="booking-dot">·</span>{booking.sport}</p></div>
              <div className="booking-price"><strong>{money(booking.pricePaid)}</strong><small>{new Date(booking.createdAt).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })}</small></div>
              <BadgeCheck className="confirmed-icon" size={19} />
            </article>)}</div> : <EmptyState title="Tu próxima aventura empieza aquí" description="Cuando reserves una cancha o te unas a un partido, verás los detalles en esta sección." action={<button className="button button-lime" onClick={() => navigate("courts")}>Explorar canchas <ArrowRight size={15} /></button>} />}
          </section>}

          {page === "wallet" && <section>
            <PageIntro eyebrow="TU CUENTA" title={<>Perfil & <span>monedero.</span></>} description="Administra tu saldo y prepárate para jugar." />
            <div className="wallet-layout">
              <div className="wallet-left">
                <article className="digital-card">
                  <div className="card-card-top"><span>CANCHA<span>RESERVA</span></span><span className="card-chip">•••</span></div>
                  <div className="card-balance-label">SALDO DISPONIBLE</div>
                  <strong className="card-balance">{money(data.profile.walletBalance)}</strong>
                  <div className="card-bottom"><span>{data.profile.name.toUpperCase()}</span><span>CR CARD&nbsp; •••• 4392</span></div>
                  <div className="card-orbit orbit-one" /><div className="card-orbit orbit-two" />
                </article>
                <div className="profile-card"><Avatar name={data.profile.name} /><div><strong>{data.profile.name}</strong><small>{data.profile.email}</small></div><span className="verified-tag"><BadgeCheck size={14} /> Verificado</span></div>
              </div>
              <div className="recharge-card"><div className="recharge-heading"><span className="recharge-icon"><Wallet size={18} /></span><div><h3>Recarga tu monedero</h3><p>Saldo disponible al instante para jugar.</p></div></div>
                <div className="recharge-options">{[5000, 10000, 20000].map((amount) => <button key={amount} className="recharge-option" disabled={busy} onClick={() => void runAction({ type: "funds", amount }, `${money(amount)} agregados a tu monedero.`)}><Plus size={15} /> {money(amount)}</button>)}</div>
                <div className="wallet-note"><ShieldCheck size={17} /><span>Recarga simulada para esta experiencia. No se realizará ningún cobro real.</span></div>
                <div className="wallet-activity"><strong>Tu actividad</strong><span>{data.bookings.length} reservas <ArrowRight size={14} onClick={() => navigate("bookings")} /></span></div>
              </div>
            </div>
          </section>}
        </div>
        <footer className="footer"><span>© 2025 CANCHARESERVA</span><span>HECHO PARA LOS QUE VIVEN EL JUEGO <span className="footer-ball">●</span></span><span className={appService.usesSupabase ? "connection-live" : "connection-demo"}><i /> {appService.usesSupabase ? "SUPABASE CONECTADO" : "MODO DEMO"}</span></footer>
        <nav className="mobile-nav">
          <MobileNav active={page === "courts"} icon={<Search size={19} />} label="Explorar" onClick={() => navigate("courts")} />
          <MobileNav active={page === "matches"} icon={<Zap size={19} />} label="Partidos" onClick={() => navigate("matches")} />
          <MobileNav active={page === "bookings"} icon={<CalendarDays size={19} />} label="Reservas" onClick={() => navigate("bookings")} />
          <MobileNav active={page === "wallet"} icon={<Wallet size={19} />} label="Monedero" onClick={() => navigate("wallet")} />
        </nav>
      </main>

      {drawer && selectedComplex && <CreateMatchDrawer complex={data.complexes.find((item) => item.id === selectedComplex.id) ?? selectedComplex} busy={busy} onClose={() => setDrawer(false)} onSubmit={(schedule, description, slotsTotal) => {
        void runAction({ type: "create", complexId: selectedComplex.id, schedule, description, slotsTotal }, "¡Partido exprés publicado! Ya puedes encontrar jugadores.", "matches");
        setDrawer(false);
      }} />}
      {notice && <div className={`toast toast-${notice.kind}`} role="status"><span>{notice.kind === "success" ? <Check size={17} /> : <X size={17} />}</span>{notice.text}<button onClick={() => setNotice(null)} aria-label="Cerrar aviso"><X size={16} /></button></div>}
    </div>
  );
}

function NavButton({ active, icon, label, count, onClick }: { active: boolean; icon: ReactNode; label: string; count?: number; onClick: () => void }) {
  return <button className={`nav-item ${active ? "nav-active" : ""}`} onClick={onClick}><span className="nav-icon">{icon}</span>{label}{count ? <span className="nav-count">{count}</span> : null}</button>;
}

function MobileNav({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <button className={`mobile-nav-item ${active ? "mobile-nav-active" : ""}`} onClick={onClick}>{icon}<span>{label}</span></button>;
}

function Avatar({ name }: { name: string }) {
  return <span className="avatar">{name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>;
}

function ComplexCard({ complex, index, onClick }: { complex: Complex; index: number; onClick: () => void }) {
  return <article className="complex-card" onClick={onClick} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") onClick(); }}>
    <div className="complex-photo" style={{ backgroundImage: `url("${complex.image}")`, backgroundPosition: complex.imagePosition ?? "center" }}>
      <div className="photo-shade" />
      <span className={`sport-pill sport-${sportSlug(complex.sport)}`}>{sportEmoji(complex.sport)} {complex.sport}</span>
      <span className="rating-pill"><Star size={13} fill="currentColor" /> {complex.rating.toFixed(1)}</span>
      <span className="photo-index">0{index + 1} <i /> 04</span>
      <button className="card-open" aria-label={`Ver ${complex.name}`}><ArrowUpRight size={18} /></button>
    </div>
    <div className="complex-card-body">
      <div className="complex-location"><MapPin size={13} /> {complex.location}</div>
      <h3>{complex.name}</h3>
      <div className="complex-card-bottom"><div><strong>{money(complex.pricePerHour)}</strong><span> / hora</span></div><span className="available-times"><i /> {complex.availableTimes.length} horarios</span></div>
    </div>
  </article>;
}

function MatchCard({ match, index, onClick }: { match: Match; index: number; onClick: () => void }) {
  const spots = match.slotsTotal - match.slotsTaken;
  return <article className="match-card" onClick={onClick} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") onClick(); }}>
    <div className={`match-card-top sport-bg-${sportSlug(match.sport)}`}><span className="match-sport-label">{sportEmoji(match.sport)} {match.sport.toUpperCase()}</span><span className="match-time"><Clock3 size={13} /> {match.schedule}</span><span className="match-card-number">0{index + 1}</span><div className="match-top-word">{match.sport === "Fútbol" ? "FOOTBALL" : match.sport.toUpperCase()}</div></div>
    <div className="match-card-content"><div className="match-venue"><MapPin size={13} /> {match.complexName} <span>·</span> {match.location}</div><h3>{match.description}</h3>
      <div className="match-host"><Avatar name={match.hostName} /><span>Organiza <strong>{match.hostName}</strong></span><span className="host-online"><i /> Organizador</span></div>
      <div className="slot-bar">{Array.from({ length: match.slotsTotal }, (_, index) => <span className={index < match.slotsTaken ? "slot-filled" : ""} key={index} />)}</div>
      <div className="match-card-footer"><span className={spots <= 2 ? "spots-warning" : "spots-open"}>{spots > 0 ? `${spots} ${spots === 1 ? "lugar" : "lugares"} disponibles` : "Completo"}</span><span className="share-cost"><strong>{money(match.pricePerPlayer)}</strong><small> / jugador</small><ArrowRight size={15} /></span></div>
    </div>
  </article>;
}

function ComplexDetail({ complex, busy, onBack, onCreate, onBook }: { complex: Complex; busy: boolean; onBack: () => void; onCreate: () => void; onBook: (schedule: string) => void }) {
  const [schedule, setSchedule] = useState(complex.availableTimes[0] ?? "");
  const canBook = Boolean(schedule && complex.availableTimes.includes(schedule));
  return <section className="detail-page"><button className="back-button" onClick={onBack}><ArrowLeft size={16} /> Volver a canchas</button>
    <div className="detail-hero" style={{ backgroundImage: `url("${complex.image}")` }}><div className="detail-hero-shade" /><span className={`sport-pill sport-${sportSlug(complex.sport)}`}>{sportEmoji(complex.sport)} {complex.sport}</span><span className="detail-rating"><Star size={15} fill="currentColor" /> {complex.rating} <small>· 120 reseñas</small></span></div>
    <div className="detail-columns"><div className="detail-main"><div className="section-kicker">TU PRÓXIMO DESTINO</div><h1>{complex.name}<span>.</span></h1><p className="detail-address"><MapPin size={16} /> {complex.location}</p>
      <div className="detail-blurb"><h3>Un espacio para disfrutar el juego.</h3><p>Encuentra tu cancha ideal, reúne a tu equipo y vive el deporte como más te gusta. Reserva tu horario o invita a otros jugadores a compartir el partido.</p></div>
      <div className="detail-inline-stats"><span><Star size={16} /> <strong>{complex.rating}</strong> valoración</span><span><ShieldCheck size={16} /> Reserva segura</span><span><Clock3 size={16} /> 60 min</span></div>
    </div><aside className="booking-panel"><div className="panel-price"><strong>{money(complex.pricePerHour)}</strong><span> / hora</span></div><p>Selecciona tu horario</p>
      <div className="time-slots">{complex.availableTimes.map((time) => <button key={time} className={schedule === time ? "time-slot time-slot-active" : "time-slot"} onClick={() => setSchedule(time)}>{time}</button>)}</div>
      {!complex.availableTimes.length && <p className="no-times">No hay horarios disponibles por ahora.</p>}
      <button className="button button-lime full-button" disabled={busy || !canBook} onClick={() => onBook(schedule)}>Reservar cancha <ArrowRight size={16} /></button>
      <div className="panel-or">O ARMA TU EQUIPO</div><button className="button button-outline full-button" onClick={onCreate}><Zap size={15} /> Crear partido exprés</button>
      <small className="secure-note"><ShieldCheck size={13} /> Pago seguro · Cancelación flexible</small>
    </aside></div>
  </section>;
}

function MatchDetail({ match, profileName, busy, onBack, onJoin }: { match: Match; profileName: string; busy: boolean; onBack: () => void; onJoin: () => void }) {
  const spots = match.slotsTotal - match.slotsTaken;
  const alreadyJoined = match.players.includes(profileName);
  return <section className="detail-page match-detail-page"><button className="back-button" onClick={onBack}><ArrowLeft size={16} /> Volver a partidos</button>
    <div className={`match-detail-banner sport-bg-${sportSlug(match.sport)}`}><span className="match-sport-label">{sportEmoji(match.sport)} {match.sport.toUpperCase()}</span><div><span className="section-kicker">BUSCA JUGADORES</span><h1>El próximo punto<br />lo juegas tú<span>.</span></h1></div><span className="match-time"><Clock3 size={14} /> {match.schedule}</span></div>
    <div className="detail-columns match-detail-columns"><div className="detail-main"><div className="section-kicker">EL PARTIDO</div><h2>{match.complexName}</h2><p className="detail-address"><MapPin size={16} /> {match.location}</p><div className="detail-blurb"><h3>{match.description}</h3><p>Organizado por {match.hostName}. ¡Súmate, conoce gente nueva y comparte la cancha!</p></div>
      <h3 className="players-heading">Jugadores <span>{match.slotsTaken}/{match.slotsTotal}</span></h3><div className="players-list">{match.players.map((player, index) => <div className="player-chip" key={`${player}-${index}`}><Avatar name={player} /><span>{player}</span>{index === 0 && <small>ANFITRIÓN</small>}</div>)}</div>
    </div><aside className="booking-panel"><span className="live-status"><span className="pulse-dot" /> {spots > 0 ? `${spots} ${spots === 1 ? "cupo disponible" : "cupos disponibles"}` : "Partido completo"}</span><div className="panel-price match-panel-price"><strong>{money(match.pricePerPlayer)}</strong><span> / jugador</span></div><p>Tu parte, sin vueltas.</p><div className="cost-breakdown"><span>Cuota del partido</span><strong>{money(match.pricePerPlayer)}</strong><span>Protección de reserva</span><strong className="free-text">Incluida</strong></div><button className="button button-lime full-button" disabled={busy || spots <= 0 || alreadyJoined} onClick={onJoin}>{alreadyJoined ? "Ya tienes un cupo" : "Unirme al partido"} <ArrowRight size={16} /></button><small className="secure-note"><ShieldCheck size={13} /> Solo pagas tu parte del partido</small></aside></div>
  </section>;
}

function CreateMatchDrawer({ complex, busy, onClose, onSubmit }: { complex: Complex; busy: boolean; onClose: () => void; onSubmit: (schedule: string, description: string, slotsTotal: number) => void }) {
  const [schedule, setSchedule] = useState(complex.availableTimes[0] ?? "");
  const [description, setDescription] = useState("");
  const [slots, setSlots] = useState(complex.sport === "Fútbol" ? 10 : 4);
  const maxSlots = complex.sport === "Fútbol" ? 14 : 4;
  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="create-drawer">
    <div className="drawer-top"><div><div className="section-kicker">INVITA A TU EQUIPO</div><h2>Arma tu partido<span>.</span></h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={19} /></button></div>
    <p className="drawer-intro">Publica los cupos y comparte el costo de la cancha con otros jugadores.</p>
    <div className="drawer-complex"><div className={`booking-sport-icon sport-${sportSlug(complex.sport)}`}>{sportEmoji(complex.sport)}</div><span><strong>{complex.name}</strong><small>{complex.sport} · {money(complex.pricePerHour)} / hora</small></span></div>
    <label className="form-label">HORARIO DISPONIBLE</label><div className="time-slots">{complex.availableTimes.map((time) => <button key={time} className={schedule === time ? "time-slot time-slot-active" : "time-slot"} onClick={() => setSchedule(time)}>{time}</button>)}</div>
    <label className="form-label slots-label">JUGADORES TOTALES <strong>{slots}</strong></label><input className="slots-slider" type="range" min={4} max={maxSlots} value={slots} onChange={(event) => setSlots(Number(event.target.value))} /><div className="slider-labels"><span>4 jugadores</span><span>{maxSlots} jugadores</span></div>
    <label className="form-label description-label" htmlFor="match-description">DESCRIPCIÓN <span>OPCIONAL</span></label><textarea id="match-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Cuéntales qué tipo de partido buscas, nivel, posiciones…"></textarea>
    <div className="cost-estimate"><span>Tu cuota como anfitrión</span><strong>{money(Math.round((complex.pricePerHour / slots) * 100) / 100)}</strong></div>
    <button className="button button-lime full-button drawer-submit" disabled={busy || !schedule} onClick={() => onSubmit(schedule, description, slots)}><Zap size={16} /> Publicar partido</button>
    <small className="secure-note"><ShieldCheck size={13} /> Solo pagas tu parte; no se cobra la cancha completa.</small>
  </aside></div>;
}

function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: ReactNode; description: string; action?: ReactNode }) {
  return <div className="page-intro"><div><div className="section-kicker">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><span><Sparkles size={24} /></span><h3>{title}</h3><p>{description}</p>{action}</div>;
}

function pageTitle(page: Page) {
  return ({ courts: "Explorar canchas", matches: "Partidos exprés", bookings: "Mis reservas", wallet: "Mi monedero" })[page];
}

function sportEmoji(sport: Sport) {
  return ({ "Fútbol": "⚽", "Pádel": "🎾", "Tenis": "🎾" })[sport];
}

function sportSlug(sport: Sport) {
  return sport === "Fútbol" ? "futbol" : sport.toLowerCase();
}

export default App;
