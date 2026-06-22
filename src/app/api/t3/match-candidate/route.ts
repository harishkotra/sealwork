import { NextRequest, NextResponse } from "next/server";
import { makeT3nClient, authenticateWallet, getScriptVersion, getNodeUrl } from "@/lib/t3-client";
import type { HiringRequirements } from "@/lib/t3";

export async function POST(req: NextRequest) {
  try {
    const { candidateDid, requirements }: { candidateDid: string; requirements: HiringRequirements } =
      await req.json();
    const pk = process.env.EMPLOYER_PRIVATE_KEY!;

    const { client } = await makeT3nClient(pk);
    await authenticateWallet(client, pk);

    const tenantId = String(candidateDid).replace("did:t3n:", "");
    const scriptName = `z:${tenantId}:hiring-verify`;
    const scriptVersion = await getScriptVersion(getNodeUrl(), scriptName);

    // Cross-tenant: employer calls candidate's hiring contract
    // Salary expectation checked inside TEE — employer gets boolean only
    const result = await (client as any).executeAndDecode({
      script_name: scriptName,
      script_version: scriptVersion,
      function_name: "verify-candidate",
      input: {
        min_years_experience: requirements.minYearsExperience,
        required_skills: requirements.requiredSkills,
        max_salary_budget: requirements.maxSalaryBudget,
        currency: requirements.currency,
        role: requirements.role,
      },
    });

    return NextResponse.json({
      success: true,
      result,
      note: "Salary never crossed boundary. TEE compared salary_expectation <= budget internally.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
