import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { buildAccountingExport, serializeAccountingExport } from "../accounting/export.js";
import {
  buildTaxEvidencePack,
  formatTaxEvidenceMarkdown,
  writeTaxEvidencePack,
} from "../accounting/tax-evidence.js";
import {
  getTaxProfile,
  isTaxFormKind,
  listTaxProfiles,
  setTaxProfile,
} from "../accounting/tax-profile.js";
import type { AccountingExportFormat } from "../accounting/types.js";
import { Effect } from "effect";

export type PaymentsAccountingExportOptions = {
  from?: string;
  to?: string;
  format?: AccountingExportFormat;
  output?: string;
  skipVerify?: boolean;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

async function runPaymentsAccountingExportImpl(
  options: PaymentsAccountingExportOptions = {}
): Promise<number> {
  const from = options.from?.trim();
  const to = options.to?.trim();
  if (!from || !to) {
    console.error(
      "Usage: clawql payments accounting export --date-from YYYY-MM-DD --date-to YYYY-MM-DD [--format csv|json|qb-csv|xero-csv] [--output PATH] [--skip-verify]"
    );
    return 1;
  }

  const format = options.format ?? (options.json ? "json" : "csv");
  try {
    const result = await buildAccountingExport({
      from,
      to,
      format,
      skipVerify: options.skipVerify,
      env: options.env,
    });

    const body = serializeAccountingExport(result, format);
    if (options.output?.trim()) {
      await mkdir(dirname(options.output), { recursive: true });
      await writeFile(options.output, body, "utf8");
      if (options.json || format === "json") {
        console.log(
          JSON.stringify(
            {
              written: options.output,
              rowCount: result.rowCount,
              totalUsd: result.totalUsd,
              totalUsdc: result.totalUsdc,
              verifyOk: result.verifyOk,
            },
            null,
            2
          )
        );
      } else {
        console.log(
          `Wrote ${result.rowCount} accounting row(s) to ${options.output} ($${result.totalUsd.toFixed(2)} USD, ${result.totalUsdc} USDC)`
        );
      }
      return 0;
    }

    process.stdout.write(body);
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

export function runPaymentsAccountingExportEffect(
  options: PaymentsAccountingExportOptions = {}
): Effect.Effect<number, Error> {
  return Effect.tryPromise({
    try: () => runPaymentsAccountingExportImpl(options),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link runPaymentsAccountingExportEffect} for Effect callers. */
export async function runPaymentsAccountingExport(
  options: PaymentsAccountingExportOptions = {}
): Promise<number> {
  return Effect.runPromise(runPaymentsAccountingExportEffect(options));
}

export type PaymentsTaxEvidenceOptions = {
  taxYear?: number;
  output?: string;
  format?: "json" | "markdown" | "pack";
  skipVerify?: boolean;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

async function runPaymentsTaxEvidenceImpl(
  options: PaymentsTaxEvidenceOptions = {}
): Promise<number> {
  const taxYear = options.taxYear;
  if (!taxYear || !Number.isInteger(taxYear)) {
    console.error(
      "Usage: clawql payments accounting tax-evidence --tax-year YYYY [--format json|markdown|pack] [--output DIR] [--skip-verify]"
    );
    return 1;
  }

  try {
    const pack = await buildTaxEvidencePack({
      taxYear,
      skipVerify: options.skipVerify,
      env: options.env,
    });
    const format = options.format ?? (options.json ? "json" : "pack");

    if (format === "pack" || options.output?.trim()) {
      const paths = await writeTaxEvidencePack(pack, options.env, options.output);
      if (options.json || format === "json") {
        console.log(JSON.stringify({ ...pack, written: paths }, null, 2));
      } else {
        console.log(
          `Tax evidence ${taxYear}: ${pack.rowCount} row(s) → ${paths.jsonPath} + ${paths.mdPath}`
        );
        console.log(pack.disclaimer);
      }
      return 0;
    }

    if (format === "markdown") {
      process.stdout.write(formatTaxEvidenceMarkdown(pack));
      return 0;
    }

    console.log(JSON.stringify(pack, null, 2));
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

export function runPaymentsTaxEvidenceEffect(
  options: PaymentsTaxEvidenceOptions = {}
): Effect.Effect<number, Error> {
  return Effect.tryPromise({
    try: () => runPaymentsTaxEvidenceImpl(options),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link runPaymentsTaxEvidenceEffect} for Effect callers. */
export async function runPaymentsTaxEvidence(
  options: PaymentsTaxEvidenceOptions = {}
): Promise<number> {
  return Effect.runPromise(runPaymentsTaxEvidenceEffect(options));
}

export type PaymentsTaxProfileSetOptions = {
  partyId?: string;
  taxForm?: string;
  collected?: boolean;
  taxProfileRef?: string;
  note?: string;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

async function runPaymentsTaxProfileSetImpl(
  options: PaymentsTaxProfileSetOptions = {}
): Promise<number> {
  const partyId = options.partyId?.trim();
  const taxForm = options.taxForm?.trim();
  if (!partyId || !taxForm || !isTaxFormKind(taxForm)) {
    console.error(
      "Usage: clawql payments tax-profile set --party-id ID --tax-form 1099nec|none|unknown [--collected] [--tax-profile-ref REF]"
    );
    return 1;
  }
  try {
    const profile = await setTaxProfile(
      {
        partyId,
        taxForm,
        collected: options.collected,
        taxProfileRef: options.taxProfileRef,
        note: options.note,
      },
      options.env
    );
    if (options.json) {
      console.log(JSON.stringify(profile, null, 2));
    } else {
      console.log(
        `Tax profile ${profile.partyId}: form=${profile.taxForm} collected=${profile.collected}${profile.taxProfileRef ? ` ref=${profile.taxProfileRef}` : ""}`
      );
    }
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

export function runPaymentsTaxProfileSetEffect(
  options: PaymentsTaxProfileSetOptions = {}
): Effect.Effect<number, Error> {
  return Effect.tryPromise({
    try: () => runPaymentsTaxProfileSetImpl(options),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link runPaymentsTaxProfileSetEffect} for Effect callers. */
export async function runPaymentsTaxProfileSet(
  options: PaymentsTaxProfileSetOptions = {}
): Promise<number> {
  return Effect.runPromise(runPaymentsTaxProfileSetEffect(options));
}

export type PaymentsTaxProfileShowOptions = {
  partyId?: string;
  json?: boolean;
  env?: NodeJS.ProcessEnv;
};

async function runPaymentsTaxProfileShowImpl(
  options: PaymentsTaxProfileShowOptions = {}
): Promise<number> {
  const env = options.env ?? process.env;
  try {
    if (options.partyId?.trim()) {
      const profile = await getTaxProfile(options.partyId, env);
      if (!profile) {
        console.error(`No tax profile for ${options.partyId.trim()}`);
        return 1;
      }
      if (options.json) {
        console.log(JSON.stringify(profile, null, 2));
      } else {
        console.log(
          `${profile.partyId}: form=${profile.taxForm} collected=${profile.collected} updated=${profile.updatedAt}`
        );
      }
      return 0;
    }
    const all = await listTaxProfiles(env);
    if (options.json) {
      console.log(JSON.stringify({ profiles: all }, null, 2));
      return 0;
    }
    if (all.length === 0) {
      console.log("No tax profiles stored.");
      return 0;
    }
    for (const p of all) {
      console.log(
        `${p.partyId}: form=${p.taxForm} collected=${p.collected}${p.taxProfileRef ? ` ref=${p.taxProfileRef}` : ""}`
      );
    }
    return 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

export function runPaymentsTaxProfileShowEffect(
  options: PaymentsTaxProfileShowOptions = {}
): Effect.Effect<number, Error> {
  return Effect.tryPromise({
    try: () => runPaymentsTaxProfileShowImpl(options),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });
}

/** Promise façade — prefer {@link runPaymentsTaxProfileShowEffect} for Effect callers. */
export async function runPaymentsTaxProfileShow(
  options: PaymentsTaxProfileShowOptions = {}
): Promise<number> {
  return Effect.runPromise(runPaymentsTaxProfileShowEffect(options));
}
