import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, CalendarDays, Check, Circle, CircleDot, Clock3, Info,
  MapPin, ShieldCheck, Trophy,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { chileRegions, comunaForComplex } from "../data/chileLocations";
import type { AvailabilitySlot, Complex, Court, ParticipantPaymentRequest, ReservationPlayerInput, Sport } from "../types";

type Props = {
  complexes: Complex[];
  onLoadCourts: (complexIds: string[]) => Promise<Court[]>;
  onLoadAvailability: (complexId: string, courtId: string, date: string) => Promise<AvailabilitySlot[]>;
  onCreateCheckout: (input: {
    complexId: string;
    courtId: string;
    reservationDate: string;
    startTime: string;
    players: ReservationPlayerInput[];
  }) => Promise<ParticipantPaymentRequest & { reservation_id: string }>;
};

const steps = ["Deporte", "Ubicación", "Recintos", "Detalles", "Cancha y hora"];

function sportIcon(sport: Sport) {
  if (sport === "Fútbol") return <Trophy size={22} />;
  if (sport === "Pádel") return <CircleDot size={22} />;
  return <Circle size={22} />;
}

function money(amount: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function mercadoPagoUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)mercadopago\.(cl|com)$/.test(url.hostname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function ReservationPathway({ complexes, onLoadCourts, onLoadAvailability, onCreateCheckout }: Props) {
  const [step, setStep] = useState(1);
  const [regionId, setRegionId] = useState("");
  const [comunaId, setComunaId] = useState("");
  const [sport, setSport] = useState<Sport | null>(null);
  const [complexId, setComplexId] = useState("");
  const [courts, setCourts] = useState<Court[]>([]);
  const [courtLoadError, setCourtLoadError] = useState("");
  const [courtsLoading, setCourtsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setCourtsLoading(true);
    onLoadCourts(complexes.map((complex) => complex.id))
      .then((loadedCourts) => {
        if (active) {
          setCourts(loadedCourts);
          setCourtLoadError("");
        }
      })
      .catch((error: unknown) => {
        if (active) setCourtLoadError(error instanceof Error ? error.message : "No se pudieron cargar las canchas.");
      })
      .finally(() => {
        if (active) setCourtsLoading(false);
      });
    return () => { active = false; };
  }, [complexes, onLoadCourts]);

  const geocodedComplexes = useMemo(
    () => complexes.flatMap((complex) => {
      const comuna = comunaForComplex(complex);
      return comuna ? [{ complex, comuna }] : [];
    }),
    [complexes],
  );
  const availableSports = useMemo(
    () => [...new Set(complexes.map((complex) => complex.sport))]
      .sort((a, b) => a.localeCompare(b, "es")),
    [complexes],
  );
  const complexesForSport = useMemo(
    () => complexes.filter((complex) => complex.sport === sport),
    [complexes, sport],
  );
  const comunas = useMemo(() => {
    const items = geocodedComplexes
      .filter(({ complex, comuna }) => complex.sport === sport && comuna.regionId === regionId)
      .map(({ comuna }) => comuna);
    return [...new Map(items.map((item) => [item.id, item] as const)).values()]
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [geocodedComplexes, regionId, sport]);
  const comuna = comunas.find((item) => item.id === comunaId);
  const selectedComplex = complexesForSport.find((item) => item.id === complexId);
  const unlocatedCount = complexesForSport.length
    - geocodedComplexes.filter(({ complex }) => complex.sport === sport).length;

  const chooseRegion = (id: string) => {
    setRegionId(id);
    setComunaId("");
    setComplexId("");
  };

  const selectStep = (nextStep: number) => {
    if (nextStep < step) setStep(nextStep);
  };

  return (
    <section className="reservation-flow" aria-label="Recorrido de reserva">
      <header className="flow-heading">
        <div>
          <div className="section-kicker"><span aria-hidden="true">🇨🇱</span> PUNTORESERVAS · DESCUBRE Y RESERVA</div>
          <h1>Tu próximo juego,<br /><span>a tu manera.</span></h1>
          <p>Un paso a la vez: encuentra un recinto y revisa sus datos disponibles.</p>
        </div>
        <div className="flow-location-summary">
          <MapPin size={16} />
          <span>{comuna ? `${comuna.name}, Chile` : "Chile"}</span>
        </div>
      </header>

      <nav className="flow-steps" aria-label="Pasos de la reserva">
        {steps.map((label, index) => {
          const number = index + 1;
          const complete = number < step;
          return (
            <button
              className={`flow-step ${number === step ? "flow-step-active" : ""} ${complete ? "flow-step-complete" : ""}`}
              disabled={!complete}
              key={label}
              onClick={() => selectStep(number)}
              aria-current={number === step ? "step" : undefined}
            >
              <span>{complete ? <Check size={14} /> : `0${number}`}</span>
              <small>{label}</small>
            </button>
          );
        })}
      </nav>

      <div className="flow-content" key={step}>
        {step === 1 && (
          <SportStep sports={availableSports} onChoose={(value) => {
            setSport(value);
            setComunaId("");
            setComplexId("");
            setStep(2);
          }} />
        )}
        {step === 2 && (
          <LocationStep
            complexes={complexesForSport}
            comunas={comunas}
            regionId={regionId}
            selectedComunaId={comunaId}
            unlocatedCount={unlocatedCount}
            onChooseRegion={chooseRegion}
            onChooseComuna={(id) => {
              setComunaId(id);
              setComplexId("");
            }}
            onContinue={() => setStep(3)}
            sport={sport}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <VenueStep
            complexes={complexesForSport}
            courts={courts}
            courtsLoading={courtsLoading}
            courtLoadError={courtLoadError}
            sport={sport}
            comunaName={comuna?.name ?? ""}
            onChoose={(id) => {
              setComplexId(id);
              setStep(4);
            }}
            onBack={() => setStep(2)}
          />
        )}
        {step === 4 && selectedComplex && (
          <VenueDetailStep
            complex={selectedComplex}
            courts={courts.filter((court) => court.complexId === selectedComplex.id)}
            courtsLoading={courtsLoading}
            courtLoadError={courtLoadError}
            onContinue={() => setStep(5)}
            onBack={() => setStep(3)}
          />
        )}
        {step === 5 && selectedComplex && (
          <CourtStep
            complex={selectedComplex}
            courts={courts.filter((court) => court.complexId === selectedComplex.id)}
            courtsLoading={courtsLoading}
            courtLoadError={courtLoadError}
            onLoadAvailability={onLoadAvailability}
            onCreateCheckout={onCreateCheckout}
            onBack={() => setStep(4)}
          />
        )}
        {step === 4 && !selectedComplex && (
          <EmptyFlowState title="Selecciona un recinto" description="Vuelve a la lista para elegir un recinto deportivo." action={<button className="flow-button flow-button-primary" onClick={() => setStep(3)}>Ver recintos <ArrowRight size={16} /></button>} />
        )}
        {step === 5 && !selectedComplex && (
          <EmptyFlowState title="Selecciona un recinto" description="Vuelve a la lista para elegir un recinto deportivo." action={<button className="flow-button flow-button-primary" onClick={() => setStep(3)}>Ver recintos <ArrowRight size={16} /></button>} />
        )}
      </div>
    </section>
  );
}

function LocationStep({
  complexes,
  comunas,
  regionId,
  selectedComunaId,
  unlocatedCount,
  onChooseRegion,
  onChooseComuna,
  onContinue,
  sport,
  onBack,
}: {
  complexes: Complex[];
  comunas: Array<{ id: string; name: string; regionId: string }>;
  regionId: string;
  selectedComunaId: string;
  unlocatedCount: number;
  onChooseRegion: (id: string) => void;
  onChooseComuna: (id: string) => void;
  onContinue: () => void;
  sport: Sport | null;
  onBack: () => void;
}) {
  const selectedRegion = chileRegions.find((item) => item.id === regionId);
  const availableComplexCount = complexes.filter((complex) => {
    const comuna = comunaForComplex(complex);
    return comuna?.regionId === regionId;
  }).length;

  return (
    <>
      <button className="flow-back" onClick={onBack}><ArrowLeft size={15} /> Cambiar deporte</button>
      <div className="flow-step-heading">
        <div className="section-kicker">PASO 02 · UBICACIÓN</div>
        <h2>¿Dónde quieres jugar?</h2>
        <p>Busca recintos de {sport ?? "tu deporte"} por región y comuna.</p>
      </div>
      <div className="location-picker">
        <div className="location-field">
          <label className="flow-label" htmlFor="region-select">REGIÓN</label>
          <select id="region-select" value={regionId} onChange={(event) => onChooseRegion(event.target.value)}>
            <option value="">Selecciona una región</option>
            {chileRegions.map((item) => <option value={item.id} key={item.id}>{item.name} ({item.roman})</option>)}
          </select>
        </div>
        {selectedRegion && (
          <>
            <p className="selected-region-summary" aria-live="polite">
              <strong>{selectedRegion.roman}</strong>
              <span>{selectedRegion.name}</span>
              <small>Identificador geográfico: {selectedRegion.id}</small>
            </p>
            <div className="location-field">
              <label className="flow-label" htmlFor="comuna-select">COMUNA</label>
              {comunas.length ? (
                <select id="comuna-select" value={selectedComunaId} onChange={(event) => onChooseComuna(event.target.value)}>
                  <option value="">Selecciona una comuna</option>
                  {comunas.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}
                </select>
              ) : (
                <div className="flow-inline-empty">
                  <Info size={16} />
                  <span>No hay recintos con comuna geográfica reconocida en esta región.</span>
                </div>
              )}
            </div>
            <div className="location-result-count" aria-live="polite">
              <span>{availableComplexCount}</span>
              <small>{availableComplexCount === 1 ? "recinto disponible" : "recintos disponibles"} en esta región</small>
            </div>
            <button className="flow-button flow-button-primary flow-next" disabled={!selectedComunaId} onClick={onContinue}>
              Explorar recintos <ArrowRight size={16} />
            </button>
          </>
        )}
        {unlocatedCount > 0 && (
          <p className="geocode-note">{unlocatedCount} {unlocatedCount === 1 ? "recinto no tiene" : "recintos no tienen"} comuna identificable en los datos actuales.</p>
        )}
      </div>
    </>
  );
}

function SportStep({
  sports,
  onChoose,
}: {
  sports: Sport[];
  onChoose: (sport: Sport) => void;
}) {
  return (
    <>
      <div className="flow-step-heading">
        <div className="section-kicker">PASO 01 · ELIGE TU DEPORTE</div>
        <h2>¿Qué te gustaría jugar?</h2>
        <p>Elige tu cancha y te mostraremos dónde encontrarla.</p>
      </div>
      {sports.length ? (
        <div className="sport-choice-grid">
          {sports.map((item, index) => (
            <button className={`sport-choice-card sport-choice-card-${sportSlug(item)}`} key={item} onClick={() => onChoose(item)} style={{ animationDelay: `${index * 55}ms` }}>
              <span className={`sport-card-art sport-card-art-${sportSlug(item)}`} aria-hidden="true">
                <span className="sport-art-court" />
                <span className="sport-art-racket" />
                <span className="sport-art-ball">{item === "Fútbol" ? "⚽" : "🎾"}</span>
                <span className="sport-art-spark">✦</span>
              </span>
              <span className={`sport-choice-icon sport-choice-${sportSlug(item)}`}>{sportIcon(item)}</span>
              <span className="sport-choice-name">{item}</span>
              <span className="sport-choice-hint">{item === "Fútbol" ? "Pisa la cancha" : "Entra a la pista"}</span>
              <ArrowRight className="sport-choice-arrow" size={18} />
            </button>
          ))}
        </div>
      ) : (
        <EmptyFlowState title="Aún no hay deportes registrados" description="Cuando el catálogo tenga recintos y deportes publicados, aparecerán aquí." />
      )}
    </>
  );
}

function VenueStep({
  complexes,
  courts,
  courtsLoading,
  courtLoadError,
  sport,
  comunaName,
  onChoose,
  onBack,
}: {
  complexes: Complex[];
  courts: Court[];
  courtsLoading: boolean;
  courtLoadError: string;
  sport: Sport | null;
  comunaName: string;
  onChoose: (id: string) => void;
  onBack: () => void;
}) {
  return (
    <>
      <button className="flow-back" onClick={onBack}><ArrowLeft size={15} /> Cambiar ubicación</button>
      <div className="flow-step-heading">
        <div className="section-kicker">PASO 03 · RECINTOS</div>
        <h2>Recintos de {sport ?? "tu deporte"}.</h2>
        <p>Resultados registrados en {comunaName}; sin completar datos faltantes con estimaciones.</p>
      </div>
      {complexes.length ? (
        <div className="venue-grid">
          {complexes.map((complex, index) => {
            const venueCourts = courts.filter((court) => court.complexId === complex.id);
            const courtTypes = [...new Set(venueCourts.map((court) => court.sport))];
            const startingPrice = venueCourts.length
              ? Math.min(...venueCourts.map((court) => court.pricePerPlayer ?? court.pricePerSlot))
              : null;
            return (
            <button className="venue-card" key={complex.id} onClick={() => onChoose(complex.id)} style={{ animationDelay: `${index * 60}ms` }}>
              <div className="venue-photo" style={complex.image ? { backgroundImage: `url("${complex.image}")` } : undefined}>
                <span className="venue-sport-tag">{sportIcon(complex.sport)}{complex.sport}</span>
                <span className="venue-rating"><span>★</span> {complex.rating.toFixed(1)}</span>
              </div>
              <span className="venue-card-body">
                <span className="venue-address"><MapPin size={13} />{complex.location}</span>
                <strong className="venue-name">{complex.name}</strong>
                <span className="venue-card-footer"><strong>{startingPrice === null ? "Precio no configurado" : `Desde ${money(startingPrice)}`}</strong><span>Ver recinto <ArrowRight size={14} /></span></span>
                {courtLoadError ? <span className="venue-data-note venue-data-error"><Info size={13} /> No se pudo cargar el detalle de canchas</span>
                  : courtsLoading ? <span className="venue-data-note">Cargando canchas…</span>
                  : venueCourts.length ? <span className="venue-court-counts">
                    {courtTypes.map((type) => <span key={type}><strong>{venueCourts.filter((court) => court.sport === type).length}</strong> {type}</span>)}
                  </span>
                  : <span className="venue-data-note"><Info size={13} /> Canchas aún no configuradas</span>}
              </span>
            </button>
            );
          })}
        </div>
      ) : (
        <EmptyFlowState title="No hay recintos para este deporte" description="No encontramos establecimientos publicados que coincidan con esta comuna y deporte." action={<button className="flow-button flow-button-outline" onClick={onBack}><ArrowLeft size={15} /> Elegir otro deporte</button>} />
      )}
    </>
  );
}

function VenueDetailStep({
  complex,
  courts,
  courtsLoading,
  courtLoadError,
  onContinue,
  onBack,
}: {
  complex: Complex;
  courts: Court[];
  courtsLoading: boolean;
  courtLoadError: string;
  onContinue: () => void;
  onBack: () => void;
}) {
  const comuna = comunaForComplex(complex);
  return (
    <>
      <button className="flow-back" onClick={onBack}><ArrowLeft size={15} /> Volver a recintos</button>
      <div className="venue-detail-cover" style={complex.image ? { backgroundImage: `url("${complex.image}")` } : undefined}>
        <div className="venue-detail-cover-shade" />
        <span className="venue-detail-type">{sportIcon(complex.sport)} {complex.sport}</span>
        <div className="venue-detail-cover-title"><div className="section-kicker">RECINTO DEPORTIVO</div><h2>{complex.name}</h2></div>
      </div>
      <div className="venue-detail-layout">
        <div className="venue-detail-main">
          <div className="flow-step-heading venue-detail-heading">
            <div className="section-kicker">PASO 04 · DETALLES</div>
            <h2>Conoce el recinto.</h2>
          </div>
          <div className="venue-facts">
            <div><span className="flow-fact-icon"><MapPin size={17} /></span><small>UBICACIÓN</small><strong>{complex.location}</strong><span>{comuna?.name ?? "Comuna sin identificar"}</span></div>
            <div><span className="flow-fact-icon"><Trophy size={17} /></span><small>DEPORTE</small><strong>{complex.sport}</strong><span>Según el catálogo actual</span></div>
            <div><span className="flow-fact-icon"><CircleDot size={17} /></span><small>CANCHAS ACTIVAS</small><strong>{courtsLoading ? "Cargando…" : courtLoadError ? "No disponible" : courts.length}</strong><span>Según configuración del recinto</span></div>
          </div>
          {courtLoadError ? <div className="venue-missing-data venue-data-error"><Info size={18} /><div><strong>No se pudieron cargar las canchas</strong><p>{courtLoadError}</p></div></div>
            : courtsLoading ? <div className="venue-missing-data"><Info size={18} /><div><strong>Cargando configuración</strong><p>Consultando canchas y precios configurados para este recinto.</p></div></div>
            : courts.length ? <div className="venue-court-detail-list">
              <h3>Canchas disponibles</h3>
              {courts.map((court) => <article key={court.id}>
                <div><strong>{court.name}</strong><span>{court.sport}</span></div>
                <small>{court.minPlayers}–{court.maxPlayers} jugadores · {court.slotDurationMinutes} min</small>
                <strong>{money(court.pricePerPlayer ?? court.pricePerSlot)}{court.pricePerPlayer === null ? " / cancha" : " / jugador"}</strong>
              </article>)}
            </div> : <div className="venue-missing-data"><Info size={18} /><div><strong>Sin canchas configuradas</strong><p>El recinto todavía no tiene canchas activas con horarios y precios de reserva.</p></div></div>}
        </div>
        <section className="venue-continue-card" aria-label="Continuar al paso de cancha y horario">
          <div className="venue-price-label">RESERVA</div>
          <strong>{courts.length ? `${courts.length} canchas` : "Configuración real"}</strong>
          <p>Selecciona una cancha para consultar horarios y precios vigentes.</p>
          <button className="flow-button flow-button-primary" onClick={onContinue} disabled={!courts.length || courtsLoading || Boolean(courtLoadError)}>Consultar horarios <ArrowRight size={16} /></button>
          <div className="venue-secure-note"><ShieldCheck size={14} /> La disponibilidad se valida en el servidor.</div>
        </section>
      </div>
    </>
  );
}

function chileToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function CourtStep({
  complex,
  courts,
  courtsLoading,
  courtLoadError,
  onLoadAvailability,
  onCreateCheckout,
  onBack,
}: {
  complex: Complex;
  courts: Court[];
  courtsLoading: boolean;
  courtLoadError: string;
  onLoadAvailability: Props["onLoadAvailability"];
  onCreateCheckout: Props["onCreateCheckout"];
  onBack: () => void;
}) {
  const [courtId, setCourtId] = useState(courts[0]?.id ?? "");
  const [date, setDate] = useState(chileToday);
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [selectedStart, setSelectedStart] = useState("");
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [players, setPlayers] = useState<ReservationPlayerInput[]>([]);
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [paymentRequest, setPaymentRequest] = useState<ParticipantPaymentRequest | null>(null);
  const selectedCourt = courts.find((court) => court.id === courtId);

  useEffect(() => {
    if (!courtId && courts.length) setCourtId(courts[0].id);
  }, [courtId, courts]);

  useEffect(() => {
    if (!selectedCourt) return;
    setPlayers((current) => Array.from(
      { length: selectedCourt.minPlayers },
      (_, index) => current[index] ?? { full_name: "", email: "", rut: "" },
    ));
  }, [selectedCourt?.id]);

  useEffect(() => {
    if (!selectedCourt || !date) return;
    let active = true;
    setAvailabilityLoading(true);
    setAvailabilityError("");
    setSlots([]);
    setSelectedStart("");
    onLoadAvailability(complex.id, selectedCourt.id, date)
      .then((result) => { if (active) setSlots(result); })
      .catch((error: unknown) => {
        if (active) setAvailabilityError(error instanceof Error ? error.message : "No se pudo consultar la disponibilidad.");
      })
      .finally(() => { if (active) setAvailabilityLoading(false); });
    return () => { active = false; };
  }, [complex.id, date, onLoadAvailability, selectedCourt?.id]);

  const updatePlayer = (index: number, field: keyof ReservationPlayerInput, value: string) => {
    setPlayers((current) => current.map((player, itemIndex) =>
      itemIndex === index ? { ...player, [field]: value } : player
    ));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCourt || !selectedStart) return;
    setCheckoutLoading(true);
    setCheckoutError("");
    try {
      const result = await onCreateCheckout({
        complexId: complex.id,
        courtId: selectedCourt.id,
        reservationDate: date,
        startTime: selectedStart,
        players,
      });
      if (!Array.isArray(result.payment_links) || result.payment_links.length !== players.length) {
        throw new Error("No se recibieron los enlaces individuales de pago.");
      }
      if (!mercadoPagoUrl(result.checkout_url) || result.payment_links.some((link) => !mercadoPagoUrl(link.checkout_url))) {
        throw new Error("Mercado Pago devolvió una dirección de pago no válida.");
      }
      setPaymentRequest(result);
      setCheckoutLoading(false);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "No se pudo iniciar el pago.");
      setCheckoutLoading(false);
    }
  };

  const estimatedTotal = selectedCourt
    ? selectedCourt.pricePerPlayer === null
      ? selectedCourt.pricePerSlot
      : selectedCourt.pricePerPlayer * players.length
    : 0;

  return (
    <>
      <button className="flow-back" onClick={onBack}><ArrowLeft size={15} /> Volver a los detalles</button>
      <div className="flow-step-heading">
        <div className="section-kicker">PASO 05 · CANCHA Y HORARIO</div>
        <h2>Reserva en {complex.name}.</h2>
        <p>Elige una cancha y consulta en tiempo real los bloques que siguen disponibles.</p>
      </div>
      {paymentRequest ? <section className="availability-card participant-checkout-result" aria-live="polite">
        <div className="availability-card-heading">
          <span className="flow-icon"><ShieldCheck size={18} /></span>
          <div><strong>Enlaces de pago individuales</strong><small>La reserva queda retenida hasta {new Date(paymentRequest.expires_at).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" })}.</small></div>
        </div>
        <p>Comparte cada enlace únicamente con la persona indicada. La reserva se confirma cuando todos los aportes estén aprobados.</p>
        {paymentRequest.email_pending && <p className="availability-error" role="status">No se pudo confirmar el envío de uno o más correos. Usa estos enlaces para compartirlos directamente.</p>}
        <ul className="participant-payment-links">{paymentRequest.payment_links.map((link, index) => (
          <li key={link.player_id}>
            <span><strong>{link.full_name}</strong><small>{link.email} · {money(link.amount)}</small></span>
            <a href={mercadoPagoUrl(link.checkout_url) ?? "#"} target="_blank" rel="noreferrer">Pagar participante {index + 1} <ArrowRight size={14} /></a>
          </li>
        ))}</ul>
        <p className="payment-note">Total de la reserva: <strong>{money(paymentRequest.amount)}</strong></p>
      </section> : courtLoadError ? <EmptyFlowState title="No se pudo cargar la configuración" description={courtLoadError} />
        : courtsLoading ? <EmptyFlowState title="Cargando canchas" description="Consultando canchas y precios configurados para este recinto." />
        : !courts.length ? <EmptyFlowState title="No hay canchas configuradas" description="Este recinto aún no tiene canchas activas. No se muestran horarios genéricos ni inventados." />
        : <div className="booking-workspace">
          <section className="availability-card">
            <div className="availability-card-heading">
              <span className="flow-icon"><CalendarDays size={18} /></span>
              <div><strong>Cancha y fecha</strong><small>Datos configurados por el recinto</small></div>
            </div>
            <label className="flow-label" htmlFor="court-select">CANCHA</label>
            <select id="court-select" value={courtId} onChange={(event) => setCourtId(event.target.value)}>
              {courts.map((court) => <option value={court.id} key={court.id}>{court.name} · {court.sport}</option>)}
            </select>
            <div className="court-selected-facts">
              <span>{selectedCourt?.minPlayers}–{selectedCourt?.maxPlayers} jugadores</span>
              <span>{selectedCourt?.slotDurationMinutes} minutos</span>
              <span>{selectedCourt ? money(selectedCourt.pricePerPlayer ?? selectedCourt.pricePerSlot) : ""}{selectedCourt?.pricePerPlayer === null ? " / cancha" : " / jugador"}</span>
            </div>
            <label className="flow-label" htmlFor="reservation-date">FECHA</label>
            <input id="reservation-date" type="date" min={chileToday()} value={date} onChange={(event) => setDate(event.target.value)} />
            <div className="availability-card-heading availability-slots-heading">
              <span className="flow-icon"><Clock3 size={18} /></span>
              <div><strong>Horarios</strong><small>Disponibilidad por cancha y fecha</small></div>
            </div>
            {availabilityLoading ? <p className="no-recorded-times">Consultando disponibilidad segura…</p>
              : availabilityError ? <p className="availability-error" role="alert">{availabilityError}</p>
              : slots.length ? <div className="availability-slot-grid">
                {slots.map((slot) => <button
                  type="button"
                  key={slot.start_time}
                  className={`availability-slot ${selectedStart === slot.start_time ? "availability-slot-selected" : ""}`}
                  disabled={slot.status !== "available"}
                  onClick={() => setSelectedStart(slot.start_time)}
                >{slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}</button>)}
              </div> : <p className="no-recorded-times">No hay horarios disponibles para esta fecha.</p>}
            <div className="availability-warning"><Info size={16} /><span>El horario se vuelve a validar al crear la reserva para impedir duplicados.</span></div>
          </section>

          <form className="availability-card reservation-player-form" onSubmit={(event) => void submit(event)}>
            <div className="availability-card-heading">
              <span className="flow-icon"><ShieldCheck size={18} /></span>
              <div><strong>Participantes y pago</strong><small>Inscripción asociada a esta reserva</small></div>
            </div>
            <p className="player-count-note">Agrega de {selectedCourt?.minPlayers} a {selectedCourt?.maxPlayers} participantes.</p>
            {players.map((player, index) => <fieldset className="participant-fields" key={index}>
              <legend>Participante {index + 1}</legend>
              <label>Nombre y apellido<input required maxLength={120} autoComplete="name" value={player.full_name} onChange={(event) => updatePlayer(index, "full_name", event.target.value)} /></label>
              <label>Correo electrónico<input required type="email" maxLength={254} autoComplete="email" value={player.email} onChange={(event) => updatePlayer(index, "email", event.target.value)} /></label>
              <label>RUT<input required maxLength={12} autoComplete="off" placeholder="12.345.678-9" value={player.rut} onChange={(event) => updatePlayer(index, "rut", event.target.value)} /></label>
              {players.length > (selectedCourt?.minPlayers ?? 1) && <button className="remove-player-button" type="button" onClick={() => setPlayers((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Quitar participante</button>}
            </fieldset>)}
            {players.length < (selectedCourt?.maxPlayers ?? 0) && <button className="flow-button flow-button-outline add-player-button" type="button" onClick={() => setPlayers((current) => [...current, { full_name: "", email: "", rut: "" }])}>+ Agregar participante</button>}
            <div className="reservation-total"><span>Total estimado</span><strong>{money(estimatedTotal)}</strong></div>
            <p className="payment-note">El monto final se calcula en el servidor con el precio configurado para la cancha.</p>
            {checkoutError && <p className="availability-error" role="alert">{checkoutError}</p>}
            <button className="flow-button flow-button-primary checkout-button" type="submit" disabled={!selectedStart || checkoutLoading}>
              {checkoutLoading ? "Preparando pago…" : "Continuar a Mercado Pago"} <ArrowRight size={16} />
            </button>
          </form>
        </div>}
    </>
  );
}

function EmptyFlowState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flow-empty-state">
      <span><Info size={21} /></span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

function sportSlug(sport: Sport) {
  if (sport === "Fútbol") return "futbol";
  if (sport === "Pádel") return "padel";
  return "tenis";
}
