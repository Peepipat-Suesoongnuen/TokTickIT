export function formatYYMM(date: Date = new Date()): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${yy}${mm}`;
}

export function formatTicketNumber(yyMm: string, seq: number): string {
  return `${yyMm}-${String(seq).padStart(4, "0")}`;
}

export async function getNextSequence(
  tx: { ticket: { findFirst: (args: unknown) => Promise<{ ticketNumber: string } | null> } },
  yyMm: string
): Promise<number> {
  const max = await tx.ticket.findFirst({
    where: { ticketNumber: { startsWith: yyMm } } as never,
    orderBy: { ticketNumber: "desc" } as never,
    select: { ticketNumber: true } as never,
  } as never);
  if (!max) return 1;
  const seqStr = (max.ticketNumber as string).split("-")[1];
  const seq = parseInt(seqStr, 10);
  if (Number.isNaN(seq)) return 1;
  return seq + 1;
}
