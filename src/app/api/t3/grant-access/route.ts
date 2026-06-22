import { NextRequest, NextResponse } from "next/server";
import { makeT3nClient, authenticateWallet, getScriptVersion, getNodeUrl } from "@/lib/t3-client";

export async function POST(req: NextRequest) {
  try {
    const { role, scriptName, functions } = await req.json() as {
      role: "employee" | "candidate";
      scriptName: string;
      functions: string[];
    };

    // User (data owner) private key — they sign the grant
    const userPk =
      role === "employee"
        ? process.env.EMPLOYEE_PRIVATE_KEY!
        : process.env.CANDIDATE_PRIVATE_KEY!;

    // Employer private key — need their DID to grant access to
    const employerPk = process.env.EMPLOYER_PRIVATE_KEY!;

    // Get employer DID
    const { client: employerClient } = await makeT3nClient(employerPk);
    const { did: agentDid } = await authenticateWallet(employerClient, employerPk);

    // Get user client (employee/candidate signs the grant)
    const { client: userClient } = await makeT3nClient(userPk);
    await authenticateWallet(userClient, userPk);

    // Get current version of the tee:user/contracts system script
    const userContractVersion = await getScriptVersion(getNodeUrl(), "tee:user/contracts");

    // Get current version of the tenant contract being granted
    const scriptVersion = await getScriptVersion(getNodeUrl(), scriptName);

    // User signs agent-auth-update — authorizes employer agent to invoke their contract
    await (userClient as any).execute({
      script_name: "tee:user/contracts",
      script_version: userContractVersion,
      function_name: "agent-auth-update",
      input: {
        agents: [
          {
            agentDid: String(agentDid),
            scripts: [
              {
                scriptName,
                versionReq: scriptVersion,
                functions,
                allowedHosts: [],
              },
            ],
          },
        ],
      },
    });

    return NextResponse.json({
      success: true,
      agentDid: String(agentDid),
      scriptName,
      functions,
      message: `Employer agent (${String(agentDid).slice(0, 20)}...) now authorized to call ${scriptName}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
