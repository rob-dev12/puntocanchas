import type { Complex } from "../types";

export type ChileRegion = {
  id: string;
  name: string;
  roman: string;
};

export type ChileComuna = {
  id: string;
  name: string;
  regionId: string;
};

export const chileRegions: ChileRegion[] = [
  { id: "15", name: "Arica y Parinacota", roman: "XV" },
  { id: "01", name: "Tarapacá", roman: "I" },
  { id: "02", name: "Antofagasta", roman: "II" },
  { id: "03", name: "Atacama", roman: "III" },
  { id: "04", name: "Coquimbo", roman: "IV" },
  { id: "05", name: "Valparaíso", roman: "V" },
  { id: "13", name: "Metropolitana de Santiago", roman: "RM" },
  { id: "06", name: "Libertador General Bernardo O'Higgins", roman: "VI" },
  { id: "07", name: "Maule", roman: "VII" },
  { id: "16", name: "Ñuble", roman: "XVI" },
  { id: "08", name: "Biobío", roman: "VIII" },
  { id: "09", name: "La Araucanía", roman: "IX" },
  { id: "14", name: "Los Ríos", roman: "XIV" },
  { id: "10", name: "Los Lagos", roman: "X" },
  { id: "11", name: "Aysén del General Carlos Ibáñez del Campo", roman: "XI" },
  { id: "12", name: "Magallanes y de la Antártica Chilena", roman: "XII" },
];

const knownComunas: Array<ChileComuna & { aliases: string[] }> = [
  { id: "13114", name: "Las Condes", regionId: "13", aliases: ["las condes"] },
  { id: "13132", name: "Vitacura", regionId: "13", aliases: ["vitacura"] },
  { id: "13123", name: "Providencia", regionId: "13", aliases: ["providencia"] },
  { id: "13301", name: "Colina", regionId: "13", aliases: ["colina"] },
];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

export function comunaForComplex(complex: Complex): ChileComuna | null {
  const location = normalize(complex.location);
  const match = knownComunas.find((comuna) =>
    comuna.aliases.some((alias) => location.endsWith(alias)),
  );
  if (!match) return null;
  const { aliases: _aliases, ...comuna } = match;
  return comuna;
}
