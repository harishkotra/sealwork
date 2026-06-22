import { NextRequest, NextResponse } from "next/server";
import { makeT3nClient, authenticateWallet, getScriptVersion, getNodeUrl } from "@/lib/t3-client";

export async function POST(req: NextRequest) {
  try {
    const { employeeDid, period } = await req.json();
    const pk = process.env.EMPLOYER_PRIVATE_KEY!;

    const { client } = await makeT3nClient(pk);
    await authenticateWallet(client, pk);

    const tenantId = String(employeeDid).replace("did:t3n:", "");
    const scriptName = `z:${tenantId}:payroll`;
    const scriptVersion = await getScriptVersion(getNodeUrl(), scriptName);

    // Cross-tenant: employer agent → employee's payroll contract
    // {{profile.bank_account}} resolved inside TEE — employer never sees raw value
    const result = await (client as any).executeAndDecode({
      script_name: scriptName,
      script_version: scriptVersion,
      function_name: "compute-payroll",
      input: { period, currency: "USD" },
    });

    return NextResponse.json({
      success: true,
      result,
      scriptName,
      note: "Bank account resolved inside TEE via {{profile.bank_account}}. Employer never saw raw value.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg, note: "Register payroll contract first via /api/t3/register-contracts" },
      { status: 500 }
    );
  }
}
