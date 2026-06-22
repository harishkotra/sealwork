import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { makeT3nClient, authenticateWallet, makeTenantClient } from "@/lib/t3-client";

const WASM_PATHS: Record<string, string> = {
  payroll: "contracts/payroll/target/wasm32-wasip2/release/z_payroll.wasm",
  hiring: "contracts/hiring/target/wasm32-wasip2/release/z_hiring.wasm",
};

const CONTRACT_TAILS: Record<string, string> = {
  payroll: "payroll",
  hiring: "hiring-verify",
};

export async function POST(req: NextRequest) {
  try {
    const { role, contractType } = await req.json() as {
      role: "employee" | "candidate";
      contractType: "payroll" | "hiring";
    };

    const pk =
      role === "employee"
        ? process.env.EMPLOYEE_PRIVATE_KEY!
        : process.env.CANDIDATE_PRIVATE_KEY!;

    const wasmRelPath = WASM_PATHS[contractType];
    if (!wasmRelPath) {
      return NextResponse.json({ error: `Unknown contractType: ${contractType}` }, { status: 400 });
    }

    const wasmAbsPath = path.join(process.cwd(), wasmRelPath);
    let wasmBytes: Buffer;
    try {
      wasmBytes = await readFile(wasmAbsPath);
    } catch {
      return NextResponse.json(
        {
          error: `WASM not found at ${wasmRelPath}. Run: npm run build:contracts`,
          wasmPath: wasmAbsPath,
        },
        { status: 400 }
      );
    }

    const { client } = await makeT3nClient(pk);
    const { did } = await authenticateWallet(client, pk);
    const tenant = await makeTenantClient(client, did);

    const tail = CONTRACT_TAILS[contractType];
    const result = await (tenant as any).contracts.register({
      tail,
      version: "0.1.0",
      wasm: wasmBytes,
    });

    const tenantId = String(did).replace("did:t3n:", "");
    const scriptName = `z:${tenantId}:${tail}`;

    return NextResponse.json({
      success: true,
      contractId: result.contract_id,
      scriptName,
      tenantId,
      tail,
      wasmBytes: wasmBytes.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
