import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Building2, ClipboardList, LogOut, Save, ShieldCheck } from "lucide-react";
import { appService } from "../services/appService";

type Venue = { id: string; name: string; location: string; role: string };
type Policy = {
  min_hours_before_cancellation: number;
  refund_percentage: number;
  requires_id_card: boolean;
  required_documents: string[];
  policy_summary: string;
  evaluation_procedure: string;
};
type Cancellation = {
  id: string;
  reservation_id: string;
  reason: string;
  status: string;
  resolution_notes: string | null;
  requested_at: string;
};
type Court = {
  id: string;
  name: string;
  sport: string;
  min_players: number;
  max_players: number;
  price_per_slot: number;
  price_per_player: number | null;
  slot_duration_minutes: number;
  open_time: string;
  close_time: string;
  is_active: boolean;
};
type CourtForm = Omit<Court, "id" | "price_per_player"> & { id?: string };

const emptyPolicy: Policy = {
  min_hours_before_cancellation: 24,
  refund_percentage: 0,
  requires_id_card: true,
  required_documents: ["Cédula de identidad vigente"],
  policy_summary: "",
  evaluation_procedure: "",
};
const emptyCourt: CourtForm = {
  name: "",
  sport: "",
  min_players: 2,
  max_players: 14,
  price_per_slot: 0,
  slot_duration_minutes: 60,
  open_time: "08:00",
  close_time: "23:00",
  is_active: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function VenueAdmin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userIsManager, setUserIsManager] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [complexId, setComplexId] = useState("");
  const [policy, setPolicy] = useState<Policy>(emptyPolicy);
  const [cancellations, setCancellations] = useState<Cancellation[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [courtForm, setCourtForm] = useState<CourtForm>(emptyCourt);
  const [editingCourt, setEditingCourt] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const loadVenues = async () => {
    const result = await appService.manageVenue({ action: "list" });
    const records = Array.isArray(result.venues) ? result.venues : [];
    const available = records.filter((venue): venue is Venue =>
      isRecord(venue)
      && typeof venue.id === "string"
      && typeof venue.name === "string"
      && typeof venue.location === "string"
      && typeof venue.role === "string"
    );
    setVenues(available);
    if (available.length) await loadVenue(available[0].id);
  };

  const loadVenue = async (id: string) => {
    setComplexId(id);
    const result = await appService.manageVenue({ action: "get_policy", complex_id: id });
    const row = isRecord(result.policy) ? result.policy : null;
    setPolicy(row ? {
      min_hours_before_cancellation: Number(row.min_hours_before_cancellation),
      refund_percentage: Number(row.refund_percentage),
      requires_id_card: row.requires_id_card === true,
      required_documents: Array.isArray(row.required_documents) ? row.required_documents.filter((item): item is string => typeof item === "string") : [],
      policy_summary: typeof row.policy_summary === "string" ? row.policy_summary : "",
      evaluation_procedure: typeof row.evaluation_procedure === "string" ? row.evaluation_procedure : "",
    } : emptyPolicy);
    setCancellations(Array.isArray(result.cancellations) ? result.cancellations as Cancellation[] : []);
    setCourts(Array.isArray(result.courts) ? result.courts as Court[] : []);
  };

  useEffect(() => {
    if (!appService.usesSupabase) {
      setCheckingSession(false);
      return;
    }
    let active = true;
    appService.getCurrentUser()
      .then(async (user) => {
        if (!active) return;
        if (user && !user.isAnonymous) {
          setUserIsManager(true);
          await loadVenues();
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "No se pudo consultar la sesión.");
      })
      .finally(() => { if (active) setCheckingSession(false); });
    return () => { active = false; };
  }, []);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setStatus("");
    try {
      await appService.signInVenueManager(email, password);
      setUserIsManager(true);
      await loadVenues();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo iniciar sesión.");
    } finally {
      setLoading(false);
    }
  };

  const savePolicy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setStatus("");
    try {
      const result = await appService.manageVenue({
        action: "save_policy",
        complex_id: complexId,
        policy: {
          ...policy,
          required_documents: policy.required_documents.map((item) => item.trim()).filter(Boolean),
        },
      });
      if (isRecord(result.policy)) {
        setPolicy((current) => ({ ...current, ...result.policy as Partial<Policy> }));
      }
      setStatus("Política guardada.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar la política.");
    } finally {
      setLoading(false);
    }
  };

  const resolveCancellation = async (cancellationId: string, resolution: "approved" | "rejected") => {
    setLoading(true);
    setError("");
    setStatus("");
    try {
      await appService.manageVenue({
        action: "resolve_cancellation",
        complex_id: complexId,
        cancellation_id: cancellationId,
        resolution,
        resolution_notes: resolutionNotes[cancellationId] ?? "",
      });
      await loadVenue(complexId);
      setStatus("La solicitud quedó registrada como revisada.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo resolver la solicitud.");
    } finally {
      setLoading(false);
    }
  };

  const saveCourt = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setStatus("");
    try {
      await appService.manageVenue({
        action: "save_court",
        complex_id: complexId,
        court: {
          ...courtForm,
          price_per_player: null,
        },
      });
      setCourtForm(emptyCourt);
      setEditingCourt(false);
      await loadVenue(complexId);
      setStatus("Cancha guardada.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar la cancha.");
    } finally {
      setLoading(false);
    }
  };

  const editCourt = (court: Court) => {
    setCourtForm({
      id: court.id,
      name: court.name,
      sport: court.sport,
      min_players: court.min_players,
      max_players: court.max_players,
      price_per_slot: court.price_per_slot,
      open_time: court.open_time.slice(0, 5),
      close_time: court.close_time.slice(0, 5),
      slot_duration_minutes: court.slot_duration_minutes,
      is_active: court.is_active,
    });
    setEditingCourt(true);
  };

  const setCourtActive = async (court: Court) => {
    setLoading(true);
    setError("");
    try {
      await appService.manageVenue({
        action: "set_court_active",
        complex_id: complexId,
        court_id: court.id,
        is_active: !court.is_active,
      });
      await loadVenue(complexId);
      setStatus(court.is_active ? "Cancha desactivada." : "Cancha activada.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo cambiar el estado de la cancha.");
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    setError("");
    try {
      await appService.signOutVenueManager();
      setUserIsManager(false);
      setVenues([]);
      setComplexId("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo cerrar la sesión.");
    } finally {
      setLoading(false);
    }
  };

  if (!appService.usesSupabase) {
    return <AdminMessage title="Administración no disponible" description="Conecta Supabase para habilitar las funciones de propietarios." />;
  }
  if (checkingSession) return <AdminMessage title="Verificando acceso" description="Comprobando la sesión de propietario." />;
  if (!userIsManager) {
    return <section className="venue-admin">
      <header className="venue-admin-header"><span className="flow-icon"><Building2 size={18} /></span><div><div className="section-kicker">PORTAL DE RECINTOS</div><h1>Administración.</h1><p>Inicia sesión con la cuenta de propietario o administrador vinculada al recinto.</p></div></header>
      <form className="venue-admin-login" onSubmit={(event) => void signIn(event)}>
        <label>Correo electrónico<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Contraseña<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <button className="button button-lime" type="submit" disabled={loading}>{loading ? "Ingresando…" : "Iniciar sesión"} <ArrowRight size={15} /></button>
        <small>El usuario debe tener una membresía activa en el recinto para acceder.</small>
      </form>
      {error && <p className="manage-reservation-status" role="alert">{error}</p>}
    </section>;
  }

  return <section className="venue-admin">
    <header className="venue-admin-header"><span className="flow-icon"><Building2 size={18} /></span><div><div className="section-kicker">PORTAL DE RECINTOS</div><h1>Administración.</h1><p>Gestiona las condiciones de tu recinto y revisa solicitudes pendientes.</p></div><button className="flow-button flow-button-outline" type="button" onClick={() => void signOut()} disabled={loading}><LogOut size={15} /> Cerrar sesión</button></header>
    {!venues.length ? <AdminMessage title="Sin recintos asignados" description="Esta cuenta no tiene membresías de recinto. Un administrador de PuntoReservas debe vincular su usuario en venue_memberships." />
      : <>
        <label className="flow-label" htmlFor="venue-admin-select">RECINTO</label>
        <select id="venue-admin-select" className="venue-admin-select" value={complexId} onChange={(event) => void loadVenue(event.target.value)}>{venues.map((venue) => <option value={venue.id} key={venue.id}>{venue.name} · {venue.location}</option>)}</select>
        {complexId && <div className="venue-admin-grid">
          <section className="venue-admin-panel venue-court-panel">
            <div className="availability-card-heading"><span className="flow-icon"><Building2 size={18} /></span><div><strong>Canchas y horarios</strong><small>La disponibilidad se repite todos los días</small></div></div>
            {courts.length ? <div className="admin-court-list">{courts.map((court) => <article key={court.id}>
              <div><strong>{court.name}</strong><span className={court.is_active ? "court-active-label" : "court-inactive-label"}>{court.is_active ? "Activa" : "Inactiva"}</span><small>{court.sport} · {court.min_players}–{court.max_players} participantes</small></div>
              <p>{court.open_time.slice(0, 5)}–{court.close_time.slice(0, 5)} · {court.slot_duration_minutes} min · {court.price_per_slot.toLocaleString("es-CL")} CLP total por cancha</p>
              <div className="managed-actions"><button type="button" className="flow-button flow-button-outline" onClick={() => editCourt(court)}>Editar</button><button type="button" className="flow-button flow-button-outline" disabled={loading} onClick={() => void setCourtActive(court)}>{court.is_active ? "Desactivar" : "Activar"}</button></div>
            </article>)}</div> : <p className="no-recorded-times">No hay canchas configuradas. Agrega una para habilitar reservas.</p>}
            <button type="button" className="flow-button flow-button-outline" onClick={() => { setCourtForm(emptyCourt); setEditingCourt(false); }}>+ Agregar cancha</button>
            <form className="venue-court-form" onSubmit={(event) => void saveCourt(event)}>
              <h3>{editingCourt ? "Editar cancha" : "Nueva cancha"}</h3>
              <label>Nombre<input required minLength={2} maxLength={100} value={courtForm.name} onChange={(event) => setCourtForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label>Tipo de cancha / deporte<input required minLength={2} maxLength={80} placeholder="Fútbol 5, Pádel…" value={courtForm.sport} onChange={(event) => setCourtForm((current) => ({ ...current, sport: event.target.value }))} /></label>
              <div className="court-form-grid">
                <label>Mínimo de jugadores<input type="number" min={1} max={14} required value={courtForm.min_players} onChange={(event) => setCourtForm((current) => ({ ...current, min_players: Number(event.target.value) }))} /></label>
                <label>Máximo de jugadores<input type="number" min={1} max={14} required value={courtForm.max_players} onChange={(event) => setCourtForm((current) => ({ ...current, max_players: Number(event.target.value) }))} /></label>
                <label>Duración (minutos)<input type="number" min={15} max={720} step={15} required value={courtForm.slot_duration_minutes} onChange={(event) => setCourtForm((current) => ({ ...current, slot_duration_minutes: Number(event.target.value) }))} /></label>
                <label>Precio total por cancha (CLP)<input type="number" min={1} step={1} required value={courtForm.price_per_slot} onChange={(event) => setCourtForm((current) => ({ ...current, price_per_slot: Number(event.target.value) }))} /></label>
                <label>Abre<input type="time" required value={courtForm.open_time} onChange={(event) => setCourtForm((current) => ({ ...current, open_time: event.target.value }))} /></label>
                <label>Cierra<input type="time" required value={courtForm.close_time} onChange={(event) => setCourtForm((current) => ({ ...current, close_time: event.target.value }))} /></label>
              </div>
              <p className="payment-note">El total del bloque se reparte entre los participantes al reservar.</p>
              <div className="managed-actions"><button type="submit" className="button button-lime" disabled={loading}><Save size={15} /> Guardar cancha</button>{editingCourt && <button type="button" className="flow-button flow-button-outline" onClick={() => { setCourtForm(emptyCourt); setEditingCourt(false); }}>Cancelar edición</button>}</div>
            </form>
          </section>
          <form className="venue-admin-panel" onSubmit={(event) => void savePolicy(event)}>
            <div className="availability-card-heading"><span className="flow-icon"><ShieldCheck size={18} /></span><div><strong>Política del recinto</strong><small>Información mostrada al reservar y gestionar</small></div></div>
            <label>Anticipación mínima para solicitar cancelación (horas)<input type="number" min={0} max={720} required value={policy.min_hours_before_cancellation} onChange={(event) => setPolicy((current) => ({ ...current, min_hours_before_cancellation: Number(event.target.value) }))} /></label>
            <label>Porcentaje de reembolso aplicable<input type="number" min={0} max={100} required value={policy.refund_percentage} onChange={(event) => setPolicy((current) => ({ ...current, refund_percentage: Number(event.target.value) }))} /></label>
            <label className="venue-admin-checkbox"><input type="checkbox" checked={policy.requires_id_card} onChange={(event) => setPolicy((current) => ({ ...current, requires_id_card: event.target.checked }))} /> Requiere presentar identificación</label>
            <label>Documentos requeridos (uno por línea)<textarea value={policy.required_documents.join("\n")} onChange={(event) => setPolicy((current) => ({ ...current, required_documents: event.target.value.split("\n") }))} /></label>
            <label>Resumen de la política<textarea required minLength={5} maxLength={2000} value={policy.policy_summary} onChange={(event) => setPolicy((current) => ({ ...current, policy_summary: event.target.value }))} /></label>
            <label>Procedimiento de evaluación<textarea required minLength={5} maxLength={2000} value={policy.evaluation_procedure} onChange={(event) => setPolicy((current) => ({ ...current, evaluation_procedure: event.target.value }))} /></label>
            <button className="button button-lime" type="submit" disabled={loading}><Save size={15} /> Guardar política</button>
          </form>
          <section className="venue-admin-panel">
            <div className="availability-card-heading"><span className="flow-icon"><ClipboardList size={18} /></span><div><strong>Solicitudes de cancelación</strong><small>{cancellations.filter((item) => item.status === "pending_review").length} pendientes de revisión</small></div></div>
            <p className="admin-refund-note">Aprobar o rechazar registra la decisión del recinto; no ejecuta automáticamente una devolución en Mercado Pago.</p>
            {cancellations.length ? <div className="venue-cancellation-list">{cancellations.map((item) => <article key={item.id}>
              <strong>{item.status === "pending_review" ? "Pendiente" : item.status}</strong>
              <small>Reserva {item.reservation_id.slice(0, 8)} · {new Date(item.requested_at).toLocaleString("es-CL")}</small>
              <p>{item.reason}</p>
              {item.status === "pending_review" && <>
                <textarea required minLength={3} maxLength={2000} placeholder="Nota de resolución (obligatoria)" value={resolutionNotes[item.id] ?? ""} onChange={(event) => setResolutionNotes((current) => ({ ...current, [item.id]: event.target.value }))} />
                <div className="managed-actions"><button type="button" className="flow-button flow-button-outline" disabled={loading} onClick={() => void resolveCancellation(item.id, "rejected")}>Rechazar</button><button type="button" className="flow-button flow-button-primary" disabled={loading} onClick={() => void resolveCancellation(item.id, "approved")}>Aprobar solicitud</button></div>
              </>}
              {item.resolution_notes && <small>{item.resolution_notes}</small>}
            </article>)}</div> : <p className="no-recorded-times">No hay solicitudes de cancelación.</p>}
          </section>
        </div>}
      </>}
    {(status || error) && <p className="manage-reservation-status" role={error ? "alert" : "status"}>{error || status}</p>}
  </section>;
}

function AdminMessage({ title, description }: { title: string; description: string }) {
  return <div className="flow-empty-state"><span><Building2 size={21} /></span><strong>{title}</strong><p>{description}</p></div>;
}
