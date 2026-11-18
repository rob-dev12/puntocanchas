export function splitAmount(totalAmount: number, participantCount: number): number[] {
  if (!Number.isSafeInteger(totalAmount) || totalAmount < 0 || !Number.isInteger(participantCount) || participantCount < 1) {
    throw new RangeError("El total y la cantidad de participantes no permiten dividir el aporte.");
  }

  const baseAmount = Math.floor(totalAmount / participantCount);
  const remainder = totalAmount % participantCount;
  return Array.from({ length: participantCount }, (_, index) => baseAmount + Number(index < remainder));
}
