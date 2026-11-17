import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import {
  ArrowRight, BadgeCheck, Building2, CalendarDays, Info, KeyRound, MapPin, Search,
} from "lucide-react";
import type { ReactNode } from "react";
import { ReservationPathway } from "./components/ReservationPathway";
import { appService } from "./services/appService";
import type { AppData, ParticipantPaymentRequest, ReservationLookup, ReservationPlayerInput } from "./types";

const VenueAdmin = lazy(() => import("./components/VenueAdmin").then((module) => ({ default: module.VenueAdmin })));

type Page = "courts" | "bookings" | "manage" | "admin";
const money = (amount: number) => new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
}).format(amount);

function isParticipantPaymentRequest(value: unknown): value is ParticipantPaymentRequest {
  if (typeof value !== "object" || value === null || !("payment_links" in value) || !Array.isArray(value.payment_links)) return false;
  return "checkout_url" in value
    && typeof value.checkout_url === "string"
    && "expires_at" in value
    && typeof value.expires_at === "string"
    && "amount" in value
    && typeof value.amount === "number"
    && "email_pending" in value
    && typeof value.email_pending === "boolean"
    && value.payment_links.every((link) =>
      typeof link === "object"
      && link !== null
      && "player_id" in link
      && typeof link.player_id === "string"
      && "full_name" in link
      && typeof link.full_name === "string"
      && "email" in link
      && typeof link.email === "string"
      && "amount" in link
      && typeof link.amount === "number"
      && "checkout_url" in link
      && typeof link.checkout_url === "string"
    );
}

function mercadoPagoUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)mercadopago\.(cl|com)$/.test(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [page, setPage] = useState<Page>(() =>
    new URLSearchParams(window.location.search).get("page") === "manage" ? "manage" : "courts"
  );
  const [paymentReturn] = useState(() => new URLSearchParams(window.location.search).get("payment") === "return");
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

  const navigate = (nextPage: Page) => setPage(nextPage);

  if (!data) {
    return <main className="loading-screen">
      <img className="loading-logo" src="/logo-puntoreservas.png" alt="PuntoReservas" width="866" height="288" />
      {initError ? <div className="load-error">
        <p>{initError}</p>
        <button className="button button-lime" onClick={() => void refresh()}>Reintentar</button>
        {!appService.usesSupabase && <small>Configura la conexión a Supabase para cargar recintos reales.</small>}
      </div> : <p>Preparando tu próximo juego…</p>}
    </main>;
  }

  return (
    <div className="app-shell">
      <main className="main-area">
        <header className="topbar">
          <a className="brand brand-image" href="#" onClick={(event) => { event.preventDefault(); navigate("courts"); }}>
            <img src="/logo-puntoreservas.png" alt="PuntoReservas" width="866" height="288" />
          </a>
          <nav className="top-nav" aria-label="Navegación principal">
            <NavButton active={page === "courts"} icon={<Search size={17} />} label="Explorar" onClick={() => navigate("courts")} />
            <NavButton active={page === "bookings"} icon={<CalendarDays size={17} />} label="Mis reservas" onClick={() => navigate("bookings")} />
            <NavButton active={page === "manage"} icon={<KeyRound size={17} />} label="Gestionar" ariaLabel="Gestionar / Modificar Reserva" onClick={() => navigate("manage")} />
            <NavButton active={page === "admin"} icon={<Building2 size={17} />} label="Recintos" onClick={() => navigate("admin")} />
          </nav>
          <div className="topbar-right">
            <div className="location-pill"><MapPin size={15} /><span>Chile</span></div>
          </div>
        </header>

        <div className="content-wrap">
          {paymentReturn && <div className="payment-return-notice" role="status"><Info size={17} /><span>Volviste desde Mercado Pago. La aprobación se confirma de forma segura cuando recibimos su notificación; este regreso por sí solo no confirma una reserva.</span></div>}
          {page === "courts" && <ReservationPathway
            complexes={data.complexes}
            onLoadCourts={appService.listCourts}
            onLoadAvailability={appService.getAvailability}
            onCreateCheckout={appService.createReservationCheckout}
          />}
          {page === "bookings" && <section>
            <PageIntro eyebrow="TU ACTIVIDAD" title={<>Mis <span>reservas.</span></>} description="Consulta tu historial y administra las reservas nuevas desde el código recibido por correo." />
            <div className="payment-return-notice"><Info size={17} /><span>Las reservas del nuevo flujo se gestionan por código y aún no están asociadas al historial de la cuenta.</span><button className="flow-button flow-button-outline" onClick={() => navigate("manage")}>Ingresar código</button></div>
            <div className="booking-summary"><div className="summary-icon"><CalendarDays size={20} /></div><div><strong>{data.bookings.length} reservas</strong><small>Tu historial deportivo</small></div><span className="summary-total">{money(data.bookings.reduce((sum, item) => sum + item.pricePaid, 0))}<small> total</small></span></div>
            {data.bookings.length ? <div className="booking-list">{data.bookings.map((booking) => <article className="booking-row" key={booking.id}>
              <div className={`booking-sport-icon sport-${sportSlug(booking.sport)}`}>{sportEmoji(booking.sport)}</div>
              <div className="booking-info"><div><strong>{booking.complexName}</strong><span className="booking-type">{booking.bookingType}</span></div><p><CalendarDays size={14} /> {booking.schedule}<span className="booking-dot">·</span>{booking.sport}</p></div>
              <div className="booking-price"><strong>{money(booking.pricePaid)}</strong><small>{new Date(booking.createdAt).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })}</small></div>
              <BadgeCheck className="confirmed-icon" size={19} />
            </article>)}</div> : <EmptyState title="Aún no tienes reservas" description="Cuando completes una reserva, su información aparecerá aquí." action={<button className="button button-lime" onClick={() => navigate("courts")}>Explorar recintos <ArrowRight size={15} /></button>} />}
          </section>}
          {page === "manage" && <ManageReservationAccess onBack={() => navigate("courts")} />}
          {page === "admin" && <Suspense fallback={<p className="manage-reservation-status">Cargando panel de recintos…</p>}><VenueAdmin /></Suspense>}
        </div>
        <footer className="footer"><span>© 2026 PUNTORESERVAS</span><span>DESCUBRE TU PRÓXIMO JUEGO</span><span className={appService.usesSupabase ? "connection-live" : "connection-demo"}><i /> {appService.usesSupabase ? "SUPABASE CONECTADO" : "SIN DATOS REMOTOS"}</span></footer>
      </main>
    </div>
  );
}

function NavButton({ active, icon, label, ariaLabel, onClick }: { active: boolean; icon: ReactNode; label: string; ariaLabel?: string; onClick: () => void }) {
  return <button type="button" className={`nav-item ${active ? "nav-active" : ""}`} onClick={onClick} aria-label={ariaLabel ?? label} aria-current={active ? "page" : undefined}><span className="nav-icon">{icon}</span>{label}</button>;
}

function ManageReservationAccess({ onBack }: { onBack: () => void }) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [details, setDetails] = useState<ReservationLookup | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<"replace" | "add" | "cancel" | null>(null);
  const [replacePlayers, setReplacePlayers] = useState<ReservationPlayerInput[]>([]);
  const [newPlayers, setNewPlayers] = useState<ReservationPlayerInput[]>([{ full_name: "", email: "", rut: "" }]);
  const [cancellationReason, setCancellationReason] = useState("");
  const [paymentRequest, setPaymentRequest] = useState<ParticipantPaymentRequest | null>(null);

  const lookup = async (value: string, announce = false) => {
    setLoading(true);
    setStatus("");
    setPaymentRequest(null);
    try {
      const result = await appService.manageReservation({ code: value, action: "lookup" });
      if (!("reservation" in result)) throw new Error("La reserva recibida no tiene un formato válido.");
      const reservationDetails = result as ReservationLookup;
      setDetails(reservationDetails);
      setReplacePlayers(reservationDetails.players.filter((player) => player.status === "active").map((player) => ({
        full_name: player.full_name,
        email: player.email,
        rut: "",
      })));
      if (announce) setStatus("Reserva encontrada. Ya puedes revisar sus datos y opciones.");
    } catch (error) {
      setDetails(null);
      setStatus(error instanceof Error ? error.message : "No se pudo consultar la reserva.");
    } finally {
      setLoading(false);
    }
  };

  const manage = async (
    action: "replace_players" | "add_players" | "request_cancellation",
    payload: { players?: ReservationPlayerInput[]; reason?: string },
  ) => {
    setLoading(true);
    setStatus("");
    setPaymentRequest(null);
    try {
      const result = await appService.manageReservation({ code, action, ...payload });
      if ("checkout_url" in result) {
        if (!isParticipantPaymentRequest(result) || !result.payment_links.length) {
          throw new Error("No se recibieron los enlaces individuales de pago.");
        }
        if (!mercadoPagoUrl(result.checkout_url) || result.payment_links.some((link) => !mercadoPagoUrl(link.checkout_url))) {
          throw new Error("Mercado Pago devolvió una dirección de pago no válida.");
        }
        setPaymentRequest(result);
        setActiveAction(null);
        return;
      }
      const emailPending = "email_pending" in result && result.email_pending === true;
      setActiveAction(null);
      await lookup(code);
      setStatus(emailPending ? "La solicitud se registró, pero el aviso por correo está pendiente de reintento." : "La solicitud se completó correctamente.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo completar la solicitud.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="manage-reservation">
      <PageIntro
        eyebrow="ACCESO POR CÓDIGO"
        title={<>Gestionar / Modificar <span>Reserva.</span></>}
        description="Ingresa el código único enviado al correo de la reserva. No necesitas iniciar sesión."
      />
      <form className="manage-reservation-form" onSubmit={(event) => {
        event.preventDefault();
        void lookup(code, true);
      }}>
        <label className="flow-label" htmlFor="reservation-code">CÓDIGO DE RESERVA</label>
        <input
          id="reservation-code"
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={13}
          pattern="RES-[A-Z0-9]{4}-[A-Z0-9]{4}"
          placeholder="RES-AB12-CD34"
          required
          value={code}
          onChange={(event) => {
            setCode(event.target.value.toUpperCase());
            setStatus("");
          }}
        />
        <small>Formato: RES-XXXX-XXXX</small>
        <button className="button button-lime" type="submit">Consultar reserva <ArrowRight size={15} /></button>
        {status && <p className="manage-reservation-status" role="status">{status}</p>}
      </form>
      {loading && <p className="manage-reservation-status" role="status">Procesando de forma segura…</p>}
      {paymentRequest && <div className="managed-action-form participant-checkout-result" aria-live="polite">
        <h3>Enlaces de pago individuales</h3>
        <p>La solicitud vence el {new Date(paymentRequest.expires_at).toLocaleString("es-CL", { timeZone: "America/Santiago" })}. Cada participante debe completar su propio aporte.</p>
        {paymentRequest.email_pending && <p className="availability-error" role="status">No se pudo confirmar el envío de uno o más correos. Comparte directamente los enlaces a continuación.</p>}
        <ul className="participant-payment-links">{paymentRequest.payment_links.map((link, index) => (
          <li key={link.player_id}>
            <span><strong>{link.full_name}</strong><small>{link.email} · {money(link.amount)}</small></span>
            <a href={mercadoPagoUrl(link.checkout_url) ?? "#"} target="_blank" rel="noreferrer">Pagar participante {index + 1} <ArrowRight size={14} /></a>
          </li>
        ))}</ul>
        <p>Total: <strong>{money(paymentRequest.amount)}</strong></p>
      </div>}
      {details && <>
        <article className="managed-reservation-card">
          <div className="managed-reservation-heading">
            <div><div className="section-kicker">RESERVA {details.reservation.status.toUpperCase()}</div><h2>{details.complex.name}</h2><p>{details.court.name} · {details.court.sport}</p></div>
            <strong>{money(details.reservation.total_amount)}</strong>
          </div>
          <div className="managed-reservation-meta">
            <span><CalendarDays size={15} />{new Date(`${details.reservation.reservation_date}T12:00:00`).toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" })}</span>
            <span><KeyRound size={15} />{details.reservation.start_time.slice(0, 5)}–{details.reservation.end_time.slice(0, 5)}</span>
            <span><MapPin size={15} />{details.complex.location}</span>
            <span><BadgeCheck size={15} />{details.reservation.player_count} participantes</span>
          </div>
          <h3>Participantes</h3>
          <ul className="managed-player-list">{details.players.filter((player) => player.status === "active").map((player) => <li key={player.id}><span>{player.full_name}</span><small>{player.email}</small></li>)}</ul>
          {details.policy && <div className="managed-policy"><strong>Política del recinto</strong><p>{details.policy.policy_summary}</p><small>{details.policy.refund_percentage}% de reembolso potencial · solicitud con {details.policy.min_hours_before_cancellation} h de anticipación. {details.policy.evaluation_procedure}</small></div>}
          {details.cancellation_requests.map((request) => <div className="managed-cancellation" key={request.id}><strong>Cancelación: {request.status === "pending_review" ? "pendiente de revisión" : request.status}</strong><p>{request.reason}</p>{request.resolution_notes && <small>{request.resolution_notes}</small>}</div>)}
          {details.reservation.status === "confirmed" && <div className="managed-actions">
            <button type="button" className="flow-button flow-button-outline" onClick={() => setActiveAction(activeAction === "replace" ? null : "replace")}>Modificar participantes</button>
            <button type="button" className="flow-button flow-button-outline" disabled={details.players.length >= details.court.max_players} onClick={() => setActiveAction(activeAction === "add" ? null : "add")}>Agregar cupos</button>
            <button type="button" className="flow-button flow-button-outline" onClick={() => setActiveAction(activeAction === "cancel" ? null : "cancel")}>Solicitar cancelación</button>
          </div>}
          {activeAction === "replace" && <form className="managed-action-form" onSubmit={(event) => { event.preventDefault(); void manage("replace_players", { players: replacePlayers }); }}>
            <h3>Actualizar participantes</h3>
            <p>Por privacidad, vuelve a ingresar el RUT de cada participante. La cantidad de cupos pagados no cambia.</p>
            {replacePlayers.map((player, index) => <ParticipantEditor key={index} index={index} player={player} onChange={(field, value) => setReplacePlayers((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item))} />)}
            <button className="button button-lime" disabled={loading} type="submit">Guardar participantes</button>
          </form>}
          {activeAction === "add" && <form className="managed-action-form" onSubmit={(event) => { event.preventDefault(); void manage("add_players", { players: newPlayers }); }}>
            <h3>Agregar participantes</h3>
            {newPlayers.map((player, index) => <ParticipantEditor key={index} index={index} player={player} onChange={(field, value) => setNewPlayers((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item))} onRemove={newPlayers.length > 1 ? () => setNewPlayers((current) => current.filter((_, itemIndex) => itemIndex !== index)) : undefined} />)}
            {newPlayers.length + details.players.length < details.court.max_players && <button className="flow-button flow-button-outline" type="button" onClick={() => setNewPlayers((current) => [...current, { full_name: "", email: "", rut: "" }])}>+ Agregar otro</button>}
            <button className="button button-lime" disabled={loading} type="submit">Continuar</button>
          </form>}
          {activeAction === "cancel" && <form className="managed-action-form" onSubmit={(event) => { event.preventDefault(); void manage("request_cancellation", { reason: cancellationReason }); }}>
            <h3>Solicitar cancelación</h3>
            <p>La solicitud será revisada por el recinto. El reembolso no es automático y se rige por la política publicada.</p>
            <label>Motivo<textarea required minLength={3} maxLength={1000} value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} /></label>
            <button className="button button-lime" disabled={loading} type="submit">Enviar solicitud</button>
          </form>}
        </article>
        {details.modifications.length > 0 && <div className="managed-history"><strong>Actividad reciente</strong>{details.modifications.map((item) => <p key={item.id}>{item.action_type.replaceAll("_", " ")} · {new Date(item.created_at).toLocaleString("es-CL")}</p>)}</div>}
      </>}
      <button className="button button-ghost manage-reservation-back" type="button" onClick={onBack}>Volver a explorar</button>
    </section>
  );
}

function ParticipantEditor({
  index,
  player,
  onChange,
  onRemove,
}: {
  index: number;
  player: ReservationPlayerInput;
  onChange: (field: keyof ReservationPlayerInput, value: string) => void;
  onRemove?: () => void;
}) {
  return <fieldset className="participant-fields">
    <legend>Participante {index + 1}</legend>
    <label>Nombre y apellido<input required maxLength={120} value={player.full_name} onChange={(event) => onChange("full_name", event.target.value)} /></label>
    <label>Correo electrónico<input required type="email" maxLength={254} value={player.email} onChange={(event) => onChange("email", event.target.value)} /></label>
    <label>RUT<input required maxLength={12} placeholder="12.345.678-9" value={player.rut} onChange={(event) => onChange("rut", event.target.value)} /></label>
    {onRemove && <button className="remove-player-button" type="button" onClick={onRemove}>Quitar participante</button>}
  </fieldset>;
}

function PageIntro({ eyebrow, title, description }: { eyebrow: string; title: ReactNode; description: string }) {
  return <div className="page-intro"><div><div className="section-kicker">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div></div>;
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><span><BadgeCheck size={24} /></span><h3>{title}</h3><p>{description}</p>{action}</div>;
}

function sportEmoji(sport: string) {
  return ({ "Fútbol": "⚽", "Pádel": "🎾", "Tenis": "🎾" } as Record<string, string>)[sport] ?? "●";
}

function sportSlug(sport: string) {
  if (sport === "Fútbol") return "futbol";
  if (sport === "Pádel") return "padel";
  return "tenis";
}

export default App;
