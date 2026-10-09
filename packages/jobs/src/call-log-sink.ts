import type { CallLogEntry, CallLogSink } from '@tailor/ai';
import { Prisma, type PrismaClient } from '@tailor/db';

interface Price {
  input: number;
  output: number;
}

/** USD estimate from AiModelPrice (per 1M tokens). Unknown models are logged at 0. */
export function estimateCostUsd(
  entry: Pick<CallLogEntry, 'inputTokens' | 'outputTokens'>,
  price: Price | undefined,
): number {
  if (!price) return 0;
  return (entry.inputTokens * price.input + entry.outputTokens * price.output) / 1_000_000;
}

/** Writes every AI call to AiCallLog (TRD §5.3). Debug bodies never reach the database. */
export class PrismaCallLogSink implements CallLogSink {
  private prices = new Map<string, Price>();
  private loadedAt = 0;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly onDebug?: (entry: CallLogEntry) => void,
    private readonly priceTtlMs = 5 * 60_000,
  ) {}

  async record(entry: CallLogEntry): Promise<void> {
    if (entry.debug) this.onDebug?.(entry);
    const price = (await this.priceTable()).get(`${entry.provider}|${entry.model}`);
    await this.prisma.aiCallLog.create({
      data: {
        task: entry.task,
        promptVersion: entry.promptVersion,
        provider: entry.provider,
        model: entry.model,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        latencyMs: entry.latencyMs,
        status: entry.status,
        errorCode: entry.errorCode,
        costEstUsd: new Prisma.Decimal(estimateCostUsd(entry, price).toFixed(6)),
        userId: entry.userId,
        refId: entry.refId,
      },
    });
  }

  private async priceTable() {
    if (Date.now() - this.loadedAt > this.priceTtlMs) {
      const rows = await this.prisma.aiModelPrice.findMany();
      this.prices = new Map(
        rows.map((r) => [
          `${r.provider}|${r.model}`,
          { input: Number(r.inputPerMUsd), output: Number(r.outputPerMUsd) },
        ]),
      );
      this.loadedAt = Date.now();
    }
    return this.prices;
  }
}
