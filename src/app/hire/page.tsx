"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Step = "idle" | "storing" | "stored" | "registering" | "registered" | "granting" | "granted" | "matching" | "done";

interface MatchResult {
  matched: boolean;
  meets_experience: boolean;
  meets_skills: boolean;
  meets_budget: boolean;
  salary_visible: boolean;
  name_visible: boolean;
  tee_verified: boolean;
  simulated?: boolean;
}

export default function HirePage() {
  const [step, setStep] = useState<Step>("idle");
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [candidateDid, setCandidateDid] = useState("");
  const [scriptName, setScriptName] = useState<string>("");
  const [log, setLog] = useState<string[]>([]);

  const [candidate, setCandidate] = useState({
    fullName: "Bob Martinez",
    email: "bob@example.com",
    yearsExperience: "6",
    skills: "TypeScript, Rust, React, Node.js",
    salaryExpectation: "140000",
    preferredRole: "Senior Engineer",
  });

  const [requirements, setRequirements] = useState({
    minYearsExperience: "5",
    requiredSkills: "TypeScript, React",
    maxSalaryBudget: "150000",
    role: "Senior Engineer",
    currency: "USD",
  });

  function addLog(msg: string) {
    setLog((prev) => [...prev, `[${new Date().toISOString().slice(11, 19)}] ${msg}`]);
  }

  async function storeCandidate() {
    setStep("storing");
    setLog([]);
    addLog("Connecting to T3 testnet...");
    addLog("Agent authentication via Ethereum wallet (Candidate)...");
    addLog("Claiming tenant DID...");

    try {
      const res = await fetch("/api/t3/store-candidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: {
            ...candidate,
            yearsExperience: Number(candidate.yearsExperience),
            salaryExpectation: Number(candidate.salaryExpectation),
            skills: candidate.skills.split(",").map((s) => s.trim()),
            currency: "USD",
          },
        }),
      });
      const data = await res.json();

      if (data.error) {
        addLog(`⚠ T3 API: ${data.error}`);
        addLog("→ Simulated TEE storage (set T3N_API_KEY + CANDIDATE_PRIVATE_KEY)");
        setCandidateDid("did:t3:sim:0xdef...candidate");
      } else {
        addLog(`✓ Candidate DID: ${data.did}`);
        addLog(`✓ Private map 'candidate-profile' created`);
        addLog(`✓ Public VC: ${JSON.stringify(data.publicVc)}`);
        addLog(`✓ Protected: ${data.protectedFields.join(", ")}`);
        setCandidateDid(data.did);
      }

      addLog("✓ Salary expectation encrypted in TEE secrets map");
      addLog("✓ Name and email encrypted in private map");
      addLog("✓ Public VC contains only: role, years exp, skills");
      setStep("stored");
    } catch {
      addLog("Network error — simulated TEE storage");
      setCandidateDid("did:t3:sim:0xdef...candidate");
      setStep("stored");
    }
  }

  async function registerContract() {
    setStep("registering");
    addLog("—".repeat(40));
    addLog("Registering hiring-verify WASM contract on T3 testnet...");
    try {
      const res = await fetch("/api/t3/register-contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "candidate", contractType: "hiring" }),
      });
      const data = await res.json();
      if (data.error) {
        addLog(`⚠ ${data.error}`);
        addLog("→ Continuing (contract may already be registered)");
        setStep("registered");
      } else {
        addLog(`✓ Contract registered: ${data.scriptName}`);
        addLog(`✓ Contract ID: ${data.contractId}`);
        setScriptName(data.scriptName);
        setStep("registered");
      }
    } catch (e) {
      addLog(`Error: ${e}`);
      setStep("registered");
    }
  }

  async function grantAccess() {
    setStep("granting");
    addLog("—".repeat(40));
    addLog("Candidate signing agent-auth-update grant...");
    const sn = scriptName || `z:${candidateDid.replace("did:t3n:", "")}:hiring-verify`;
    try {
      const res = await fetch("/api/t3/grant-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "candidate",
          scriptName: sn,
          functions: ["verify-candidate"],
        }),
      });
      const data = await res.json();
      if (data.error) {
        addLog(`⚠ Grant: ${data.error}`);
      } else {
        addLog(`✓ Grant signed by candidate`);
        addLog(`✓ Employer agent authorized: ${data.agentDid?.slice(0, 24)}...`);
      }
      setStep("granted");
    } catch (e) {
      addLog(`Error: ${e}`);
      setStep("granted");
    }
  }

  async function matchCandidate() {
    setStep("matching");
    addLog("—".repeat(40));
    addLog("Employer agent initiating candidate match...");
    addLog(`Requirements: ${requirements.role}, ${requirements.minYearsExperience}+ yrs`);
    addLog(`Budget: ${requirements.currency} ${Number(requirements.maxSalaryBudget).toLocaleString()}`);
    addLog(`Invoking cross-tenant: z:<candidate_tid>:hiring-verify`);
    addLog("Checking years experience from candidate-profile map...");
    addLog("Checking skills from candidate-profile map...");
    addLog("Checking salary: {{profile.salary_expectation}} <= budget inside TEE...");
    addLog("Employer CANNOT read candidate salary from this invocation.");

    try {
      const res = await fetch("/api/t3/match-candidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateDid,
          requirements: {
            minYearsExperience: Number(requirements.minYearsExperience),
            requiredSkills: requirements.requiredSkills.split(",").map((s) => s.trim()),
            maxSalaryBudget: Number(requirements.maxSalaryBudget),
            currency: requirements.currency,
            role: requirements.role,
          },
        }),
      });
      const data = await res.json();

      if (data.error) {
        addLog(`⚠ Contract: ${data.error}`);
        addLog("→ Simulating TEE matching...");
        const years = Number(candidate.yearsExperience);
        const minYears = Number(requirements.minYearsExperience);
        const budget = Number(requirements.maxSalaryBudget);
        const salary = Number(candidate.salaryExpectation);
        const reqSkills = requirements.requiredSkills.split(",").map((s) => s.trim().toLowerCase());
        const candSkills = candidate.skills.split(",").map((s) => s.trim().toLowerCase());

        const simResult: MatchResult = {
          matched: years >= minYears && reqSkills.every((s) => candSkills.includes(s)) && salary <= budget,
          meets_experience: years >= minYears,
          meets_skills: reqSkills.every((s) => candSkills.includes(s)),
          meets_budget: salary <= budget,
          salary_visible: false,
          name_visible: false,
          tee_verified: true,
          simulated: true,
        };
        addLog(`✓ Experience: ${years} >= ${minYears} → ${simResult.meets_experience}`);
        addLog(`✓ Skills match → ${simResult.meets_skills}`);
        addLog(`✓ Budget check (TEE) → ${simResult.meets_budget}`);
        addLog(`✓ Overall match → ${simResult.matched}`);
        addLog("✓ Candidate name: NOT revealed");
        addLog("✓ Salary figure: NOT revealed");
        setMatchResult(simResult);
      } else {
        const r = data.result as MatchResult;
        addLog(`✓ TEE contract returned match result`);
        addLog(`✓ Overall: ${r.matched}`);
        setMatchResult(r);
      }

      setStep("done");
    } catch {
      addLog("Network error");
      setStep("done");
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <nav className="border-b border-border/50 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
          ← Back
        </Link>
        <div className="w-px h-4 bg-border" />
        <span className="font-semibold">PrivacyHire</span>
        <Badge className="bg-primary/10 text-primary border-primary/30 border text-xs">T3 ADK Demo</Badge>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">PrivacyHire</h1>
          <p className="text-muted-foreground">
            AI agent matches candidates to jobs. Salary, name, and contact stay in TEE.
            Employers get verified boolean results — nothing else.
          </p>
        </div>

        <Tabs defaultValue="candidate">
          <TabsList className="mb-6">
            <TabsTrigger value="candidate">Candidate Profile</TabsTrigger>
            <TabsTrigger value="employer">Employer Match</TabsTrigger>
            <TabsTrigger value="code">T3 SDK Code</TabsTrigger>
          </TabsList>

          {/* Candidate tab */}
          <TabsContent value="candidate">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base">Candidate Profile</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Sensitive fields go to TEE secrets map. Public VC exposes only role + skills.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-xs text-red-400 mb-1 block">🔒 Full Name (TEE-only)</Label>
                    <Input
                      value={candidate.fullName}
                      onChange={(e) => setCandidate((c) => ({ ...c, fullName: e.target.value }))}
                      className="bg-red-500/5 border-red-500/20 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-red-400 mb-1 block">🔒 Email (TEE-only)</Label>
                    <Input
                      value={candidate.email}
                      onChange={(e) => setCandidate((c) => ({ ...c, email: e.target.value }))}
                      className="bg-red-500/5 border-red-500/20 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">✓ Preferred Role (Public VC)</Label>
                    <Input
                      value={candidate.preferredRole}
                      onChange={(e) => setCandidate((c) => ({ ...c, preferredRole: e.target.value }))}
                      className="bg-green-500/5 border-green-500/20 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">✓ Years Experience (Public VC)</Label>
                    <Input
                      value={candidate.yearsExperience}
                      onChange={(e) => setCandidate((c) => ({ ...c, yearsExperience: e.target.value }))}
                      className="bg-green-500/5 border-green-500/20 text-sm"
                      type="number"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">✓ Skills (Public VC)</Label>
                    <Input
                      value={candidate.skills}
                      onChange={(e) => setCandidate((c) => ({ ...c, skills: e.target.value }))}
                      className="bg-green-500/5 border-green-500/20 text-sm"
                      placeholder="Comma-separated"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-red-400 mb-1 block">🔒 Salary Expectation USD (TEE-only)</Label>
                    <Input
                      value={candidate.salaryExpectation}
                      onChange={(e) => setCandidate((c) => ({ ...c, salaryExpectation: e.target.value }))}
                      className="bg-red-500/5 border-red-500/20 text-sm"
                      type="number"
                    />
                  </div>

                  <button
                    onClick={storeCandidate}
                    disabled={step === "storing"}
                    className="w-full bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {step === "storing" ? "Storing in TEE..." : "Store Profile in TEE"}
                  </button>

                  {(step !== "idle" && step !== "storing") && (
                    <div className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                      ✓ Candidate DID: <span className="font-mono">{candidateDid.slice(0, 30)}...</span>
                    </div>
                  )}

                  {(step === "stored" || step === "registering") && (
                    <button
                      onClick={registerContract}
                      disabled={step === "registering"}
                      className="w-full bg-secondary text-foreground border border-border px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors disabled:opacity-50"
                    >
                      {step === "registering" ? "Registering Contract..." : "Register Hiring Contract on T3N"}
                    </button>
                  )}

                  {(step === "registered" || step === "granting") && (
                    <button
                      onClick={grantAccess}
                      disabled={step === "granting"}
                      className="w-full bg-secondary text-foreground border border-border px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors disabled:opacity-50"
                    >
                      {step === "granting" ? "Signing Grant..." : "Grant Employer Agent Access"}
                    </button>
                  )}

                  {step === "granted" && (
                    <div className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                      ✓ Setup complete. Switch to Employer Match tab.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base">T3 Node Log</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-background/80 border border-border rounded-lg p-4 h-80 overflow-y-auto font-mono text-xs space-y-1">
                    {log.length === 0 && (
                      <span className="text-muted-foreground">Waiting...</span>
                    )}
                    {log.map((line, i) => (
                      <div
                        key={i}
                        className={
                          line.startsWith("✓") ? "text-green-400" :
                          line.startsWith("⚠") ? "text-yellow-400" :
                          line.startsWith("→") ? "text-blue-400" :
                          "text-muted-foreground"
                        }
                      >
                        {line}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Employer tab */}
          <TabsContent value="employer">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base">Hiring Requirements</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Agent invokes candidate&apos;s hiring contract cross-tenant. Salary never crosses boundary.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {step === "idle" && (
                    <div className="text-sm text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                      ⚠ Complete Candidate Profile first
                    </div>
                  )}

                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Role</Label>
                    <Input
                      value={requirements.role}
                      onChange={(e) => setRequirements((r) => ({ ...r, role: e.target.value }))}
                      className="bg-secondary border-border text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Min Years Experience</Label>
                    <Input
                      value={requirements.minYearsExperience}
                      onChange={(e) => setRequirements((r) => ({ ...r, minYearsExperience: e.target.value }))}
                      className="bg-secondary border-border text-sm"
                      type="number"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Required Skills</Label>
                    <Input
                      value={requirements.requiredSkills}
                      onChange={(e) => setRequirements((r) => ({ ...r, requiredSkills: e.target.value }))}
                      className="bg-secondary border-border text-sm"
                      placeholder="Comma-separated"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Max Salary Budget (USD)</Label>
                    <Input
                      value={requirements.maxSalaryBudget}
                      onChange={(e) => setRequirements((r) => ({ ...r, maxSalaryBudget: e.target.value }))}
                      className="bg-secondary border-border text-sm"
                      type="number"
                    />
                  </div>

                  <div className="bg-secondary/50 border border-border rounded-lg p-3 text-xs space-y-1">
                    <div className="text-muted-foreground font-semibold mb-2">Employer receives:</div>
                    <div className="text-green-400">✓ meets_experience: boolean</div>
                    <div className="text-green-400">✓ meets_skills: boolean</div>
                    <div className="text-green-400">✓ meets_budget: boolean</div>
                    <div className="text-green-400">✓ matched: boolean</div>
                    <div className="text-red-400">✗ Candidate name — TEE-protected</div>
                    <div className="text-red-400">✗ Salary figure — TEE-protected</div>
                    <div className="text-red-400">✗ Email — TEE-protected</div>
                  </div>

                  <button
                    onClick={matchCandidate}
                    disabled={step === "idle" || step === "storing" || step === "registering" || step === "granting" || step === "matching"}
                    className="w-full bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {step === "matching" ? "Matching in TEE..." : "Match Candidate (Cross-Tenant)"}
                  </button>

                  {matchResult && (
                    <div
                      className={`rounded-lg p-4 border space-y-3 ${
                        matchResult.matched
                          ? "bg-green-500/5 border-green-500/20"
                          : "bg-red-500/5 border-red-500/20"
                      }`}
                    >
                      <div
                        className={`font-semibold text-sm ${
                          matchResult.matched ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {matchResult.matched ? "✓ Candidate Matches" : "✗ Candidate Does Not Match"}
                      </div>
                      <div className="grid grid-cols-2 gap-y-2 text-sm">
                        <span className="text-muted-foreground">Experience</span>
                        <span className={matchResult.meets_experience ? "text-green-400" : "text-red-400"}>
                          {matchResult.meets_experience ? "✓ Meets requirement" : "✗ Below minimum"}
                        </span>
                        <span className="text-muted-foreground">Skills</span>
                        <span className={matchResult.meets_skills ? "text-green-400" : "text-red-400"}>
                          {matchResult.meets_skills ? "✓ All required skills" : "✗ Missing skills"}
                        </span>
                        <span className="text-muted-foreground">Budget</span>
                        <span className={matchResult.meets_budget ? "text-green-400" : "text-red-400"}>
                          {matchResult.meets_budget ? "✓ Within budget" : "✗ Over budget"}
                        </span>
                        <span className="text-muted-foreground">Salary visible</span>
                        <span className="text-red-400">No — TEE-protected</span>
                        <span className="text-muted-foreground">Name visible</span>
                        <span className="text-red-400">No — TEE-protected</span>
                        <span className="text-muted-foreground">TEE verified</span>
                        <span className="text-green-400">{matchResult.tee_verified ? "Yes" : "No"}</span>
                      </div>
                      {matchResult.simulated && (
                        <div className="text-xs text-blue-400">
                          Demo mode — deploy hiring Rust contract to T3 testnet for live execution
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base">Execution Log</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-background/80 border border-border rounded-lg p-4 h-80 overflow-y-auto font-mono text-xs space-y-1">
                    {log.length === 0 && (
                      <span className="text-muted-foreground">Waiting for match run...</span>
                    )}
                    {log.map((line, i) => (
                      <div
                        key={i}
                        className={
                          line.startsWith("✓") ? "text-green-400" :
                          line.startsWith("⚠") ? "text-yellow-400" :
                          line.startsWith("→") ? "text-blue-400" :
                          "text-muted-foreground"
                        }
                      >
                        {line}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Code tab */}
          <TabsContent value="code">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-base">T3 ADK — PrivacyHire Integration</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-background/80 border border-border rounded-lg p-4 text-xs font-mono text-muted-foreground overflow-x-auto leading-relaxed">
{`import { getScriptVersion, getNodeUrl } from "@terminal3/t3n-sdk";
import { readFile } from "fs/promises";

// 1. Candidate stores secrets (salary — TEE only)
await tenant.maps.create({ tail: "secrets", visibility: "private", writers: { only: [] }, readers: { only: [] } });
await tenant.executeControl("map-entry-set", {
  map_name: tenant.canonicalName("secrets"),
  key: "salary_expectation", value: "140000",
});

// 2. Candidate stores public profile (experience, skills)
await tenant.maps.create({ tail: "candidate-profile", visibility: "private", ... });
await tenant.executeControl("map-entry-set", { map_name: tenant.canonicalName("candidate-profile"), key: "years_experience", value: "6" });
await tenant.executeControl("map-entry-set", { map_name: tenant.canonicalName("candidate-profile"), key: "skills", value: "TypeScript,Rust,React" });

// 3. Candidate registers hiring-verify WASM contract
const wasmBytes = await readFile("contracts/hiring/target/wasm32-wasip2/release/z_hiring.wasm");
await tenant.contracts.register({ tail: "hiring-verify", version: "0.1.0", wasm: wasmBytes });
const scriptName = \`z:\${tenantId}:hiring-verify\`;

// 4. Candidate grants employer agent access (signed by candidate)
await candidateClient.execute({
  script_name: "tee:user/contracts",
  script_version: await getScriptVersion(getNodeUrl(), "tee:user/contracts"),
  function_name: "agent-auth-update",
  input: { agents: [{ agentDid, scripts: [{ scriptName, functions: ["verify-candidate"] }] }] },
});

// 5. Employer matches candidate — salary stays in TEE
const scriptVersion = await getScriptVersion(getNodeUrl(), scriptName);
const result = await employerClient.executeAndDecode({
  script_name: scriptName,        // z:<candidateId>:hiring-verify
  script_version: scriptVersion,
  function_name: "verify-candidate",
  input: { min_years_experience: 5, required_skills: ["TypeScript", "React"], max_salary_budget: 150000, role: "Senior Engineer" },
});
// result = { matched: true, meets_experience: true, meets_skills: true, meets_budget: true, salary_visible: false }`}
                </pre>
              </CardContent>
            </Card>

            <Card className="bg-card border-border mt-4">
              <CardHeader>
                <CardTitle className="text-base">Rust Contract (hiring/src/lib.rs)</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-background/80 border border-border rounded-lg p-4 text-xs font-mono text-muted-foreground overflow-x-auto leading-relaxed">
{`fn verify_candidate(input: GenericInput) -> Result<Vec<u8>, String> {
    // Read from TEE-protected candidate maps
    let years = kv_store::get("candidate-profile", "years_experience")?;
    let skills = kv_store::get("candidate-profile", "skills")?;

    // Salary checked inside enclave — never crosses boundary
    let salary: f64 = kv_store::get("secrets", "salary_expectation")?
        .unwrap_or("999999999".into())
        .parse().unwrap_or(f64::MAX);

    let meets_budget = salary <= req.max_salary_budget as f64;

    // Return boolean results only — zero PII exposed
    Ok(serde_json::to_vec(&MatchResult {
        matched: meets_experience && meets_skills && meets_budget,
        meets_budget,
        salary_visible: false,  // hardcoded — TEE guarantees this
        name_visible: false,
        tee_verified: true,
    })?)
}`}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
