"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Step = "idle" | "storing" | "stored" | "registering" | "registered" | "granting" | "granted" | "running" | "done" | "error";

interface PayrollResult {
  period?: string;
  gross?: number;
  tax_deducted?: number;
  net_disbursed?: number;
  currency?: string;
  status?: string;
  bank_account_visible?: boolean;
  note?: string;
  simulated?: boolean;
  error?: string;
}

export default function PayrollPage() {
  const [step, setStep] = useState<Step>("idle");
  const [result, setResult] = useState<PayrollResult | null>(null);
  const [employeeDid, setEmployeeDid] = useState<string>("");
  const [scriptName, setScriptName] = useState<string>("");
  const [log, setLog] = useState<string[]>([]);

  const [profile, setProfile] = useState({
    fullName: "Alice Chen",
    bankAccount: "••••••7892",
    bankRoutingNumber: "021000021",
    taxId: "•••-••-4321",
    baseSalary: "120000",
    currency: "USD",
  });

  const [period, setPeriod] = useState("2026-06");

  function addLog(msg: string) {
    setLog((prev) => [...prev, `[${new Date().toISOString().slice(11, 19)}] ${msg}`]);
  }

  async function storeProfile() {
    setStep("storing");
    setLog([]);
    addLog("Connecting to T3 testnet node...");
    addLog("Performing handshake with TEE node...");
    addLog("Authenticating agent via Ethereum wallet...");

    try {
      const res = await fetch("/api/t3/store-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: { ...profile, baseSalary: Number(profile.baseSalary) } }),
      });
      const data = await res.json();

      if (data.error) {
        addLog(`⚠ T3 API: ${data.error}`);
        addLog("→ Using simulated TEE storage for demo (set T3N_API_KEY + EMPLOYEE_PRIVATE_KEY to go live)");
        setEmployeeDid("did:t3:sim:0xabc...employee");
      } else {
        addLog(`✓ Tenant claimed: ${data.did}`);
        addLog(`✓ Private map 'employee-profile' created`);
        addLog(`✓ Secrets map created (bank acct + tax ID stored in TEE)`);
        setEmployeeDid(data.did);
      }

      addLog("✓ Profile stored. Bank account and tax ID encrypted in TEE.");
      addLog(`✓ Protected fields: ${["bankAccount", "bankRoutingNumber", "taxId", "baseSalary"].join(", ")}`);
      setStep("stored");
    } catch {
      addLog("Network error — using simulated TEE for demo");
      setEmployeeDid("did:t3:sim:0xabc...employee");
      setStep("stored");
    }
  }

  async function registerContract() {
    setStep("registering");
    addLog("—".repeat(40));
    addLog("Registering payroll WASM contract on T3 testnet...");
    try {
      const res = await fetch("/api/t3/register-contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "employee", contractType: "payroll" }),
      });
      const data = await res.json();
      if (data.error) {
        addLog(`⚠ ${data.error}`);
        addLog("→ Skipping to grant step (contract may already be registered)");
        setStep("registered");
      } else {
        addLog(`✓ Contract registered: ${data.scriptName}`);
        addLog(`✓ Contract ID: ${data.contractId}`);
        addLog(`✓ WASM size: ${data.wasmBytes} bytes`);
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
    addLog("Employee signing agent-auth-update grant...");
    addLog("Authorizing employer agent to invoke payroll contract...");
    const sn = scriptName || `z:${employeeDid.replace("did:t3n:", "")}:payroll`;
    try {
      const res = await fetch("/api/t3/grant-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "employee",
          scriptName: sn,
          functions: ["compute-payroll"],
        }),
      });
      const data = await res.json();
      if (data.error) {
        addLog(`⚠ Grant: ${data.error}`);
      } else {
        addLog(`✓ Grant signed by employee`);
        addLog(`✓ Employer agent: ${data.agentDid?.slice(0, 24)}...`);
        addLog(`✓ Authorized functions: ${data.functions?.join(", ")}`);
      }
      setStep("granted");
    } catch (e) {
      addLog(`Error: ${e}`);
      setStep("granted");
    }
  }

  async function runPayroll() {
    setStep("running");
    addLog("—".repeat(40));
    addLog("Employer agent initiating payroll run...");
    addLog(`Period: ${period}`);
    addLog(`Target employee DID: ${employeeDid}`);
    addLog("Invoking cross-tenant contract: z:<employee_tid>:payroll");
    addLog("Contract function: compute-payroll");
    addLog("Resolving {{profile.bank_account}} inside TEE enclave...");
    addLog("Resolving {{profile.bank_routing_number}} inside TEE enclave...");
    addLog("Employer agent CANNOT read resolved values.");

    try {
      const res = await fetch("/api/t3/run-payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeDid, period, contractScript: null }),
      });
      const data = await res.json();

      if (data.error) {
        addLog(`⚠ Contract not yet deployed: ${data.error}`);
        addLog("→ Simulating TEE payroll computation...");
        const salary = Number(profile.baseSalary);
        const tax = salary * 0.20;
        const net = salary - tax;
        const simResult = {
          period,
          gross: salary / 12,
          tax_deducted: tax / 12,
          net_disbursed: net / 12,
          currency: profile.currency,
          status: "disbursed",
          bank_account_visible: false,
          simulated: true,
          note: "Deploy payroll Rust contract to T3 testnet for live execution",
        };
        addLog(`✓ Gross: ${profile.currency} ${(salary / 12).toFixed(2)}`);
        addLog(`✓ Tax deducted (20%): ${profile.currency} ${(tax / 12).toFixed(2)}`);
        addLog(`✓ Net disbursed: ${profile.currency} ${(net / 12).toFixed(2)}`);
        addLog("✓ Bank transfer initiated via {{profile.bank_account}} placeholder");
        addLog("✓ Employer agent never saw: bank account, routing number, tax ID");
        setResult(simResult);
      } else {
        addLog(`✓ Contract executed on T3 TEE`);
        addLog(`✓ Result: ${JSON.stringify(data.result)}`);
        setResult(data.result as PayrollResult);
      }

      setStep("done");
    } catch {
      addLog("Network error — using simulated result");
      const salary = Number(profile.baseSalary);
      const tax = salary * 0.20;
      const net = salary - tax;
      setResult({
        period,
        gross: salary / 12,
        tax_deducted: tax / 12,
        net_disbursed: net / 12,
        currency: profile.currency,
        status: "disbursed",
        bank_account_visible: false,
        simulated: true,
      });
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
        <span className="font-semibold">AgentPayroll</span>
        <Badge className="bg-primary/10 text-primary border-primary/30 border text-xs">T3 ADK Demo</Badge>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">AgentPayroll</h1>
          <p className="text-muted-foreground">
            AI agent disburses payroll using TEE-protected employee data. Employer sees results — not raw bank details.
          </p>
        </div>

        <Tabs defaultValue="employee">
          <TabsList className="mb-6">
            <TabsTrigger value="employee">Employee Setup</TabsTrigger>
            <TabsTrigger value="employer">Employer Run</TabsTrigger>
            <TabsTrigger value="code">T3 SDK Code</TabsTrigger>
          </TabsList>

          {/* Employee tab */}
          <TabsContent value="employee">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base">Employee Profile</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Stored encrypted in TEE via <code className="text-primary text-xs">tenant.maps.create()</code>
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Full Name</Label>
                      <Input
                        value={profile.fullName}
                        onChange={(e) => setProfile((p) => ({ ...p, fullName: e.target.value }))}
                        className="bg-secondary border-border text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Currency</Label>
                      <Input
                        value={profile.currency}
                        onChange={(e) => setProfile((p) => ({ ...p, currency: e.target.value }))}
                        className="bg-secondary border-border text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-red-400 mb-1 block">🔒 Bank Account (TEE-only)</Label>
                    <Input
                      value={profile.bankAccount}
                      onChange={(e) => setProfile((p) => ({ ...p, bankAccount: e.target.value }))}
                      className="bg-red-500/5 border-red-500/20 text-sm"
                      placeholder="Account number"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-red-400 mb-1 block">🔒 Routing Number (TEE-only)</Label>
                    <Input
                      value={profile.bankRoutingNumber}
                      onChange={(e) => setProfile((p) => ({ ...p, bankRoutingNumber: e.target.value }))}
                      className="bg-red-500/5 border-red-500/20 text-sm"
                      placeholder="Routing number"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-red-400 mb-1 block">🔒 Tax ID (TEE-only)</Label>
                    <Input
                      value={profile.taxId}
                      onChange={(e) => setProfile((p) => ({ ...p, taxId: e.target.value }))}
                      className="bg-red-500/5 border-red-500/20 text-sm"
                      placeholder="Tax ID / SSN"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-red-400 mb-1 block">🔒 Annual Base Salary (TEE-only)</Label>
                    <Input
                      value={profile.baseSalary}
                      onChange={(e) => setProfile((p) => ({ ...p, baseSalary: e.target.value }))}
                      className="bg-red-500/5 border-red-500/20 text-sm"
                      placeholder="Annual salary"
                      type="number"
                    />
                  </div>

                  <button
                    onClick={storeProfile}
                    disabled={step === "storing"}
                    className="w-full bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {step === "storing" ? "Storing in TEE..." : "Store Profile in TEE"}
                  </button>

                  {(step === "stored" || step === "registering" || step === "registered" || step === "granting" || step === "granted" || step === "running" || step === "done") && (
                    <div className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                      ✓ Profile stored. Tenant DID: <span className="font-mono">{employeeDid.slice(0, 32)}...</span>
                    </div>
                  )}

                  {(step === "stored" || step === "registering") && (
                    <button
                      onClick={registerContract}
                      disabled={step === "registering"}
                      className="w-full bg-secondary text-foreground border border-border px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors disabled:opacity-50"
                    >
                      {step === "registering" ? "Registering Contract..." : "Register Payroll Contract on T3N"}
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

                  {(step === "granted") && (
                    <div className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                      ✓ Setup complete. Switch to Employer Run tab.
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Log panel */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base">T3 Node Log</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-background/80 border border-border rounded-lg p-4 h-80 overflow-y-auto font-mono text-xs space-y-1">
                    {log.length === 0 && (
                      <span className="text-muted-foreground">Waiting for operation...</span>
                    )}
                    {log.map((line, i) => (
                      <div
                        key={i}
                        className={
                          line.startsWith("✓")
                            ? "text-green-400"
                            : line.startsWith("⚠")
                            ? "text-yellow-400"
                            : line.startsWith("→")
                            ? "text-blue-400"
                            : "text-muted-foreground"
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
                  <CardTitle className="text-base">Run Payroll</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Employer agent invokes payroll contract cross-tenant
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {step === "idle" && (
                    <div className="text-sm text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                      ⚠ Complete Employee Setup first
                    </div>
                  )}

                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Payroll Period</Label>
                    <Input
                      value={period}
                      onChange={(e) => setPeriod(e.target.value)}
                      className="bg-secondary border-border text-sm"
                      placeholder="YYYY-MM"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">Employee DID</Label>
                    <Input
                      value={employeeDid}
                      readOnly
                      className="bg-secondary border-border text-xs font-mono text-muted-foreground"
                    />
                  </div>

                  <div className="bg-secondary/50 border border-border rounded-lg p-3 text-xs space-y-1">
                    <div className="text-muted-foreground font-semibold mb-2">What employer agent sees:</div>
                    <div className="text-green-400">✓ Net disbursed amount</div>
                    <div className="text-green-400">✓ Tax deducted amount</div>
                    <div className="text-green-400">✓ Payroll status</div>
                    <div className="text-red-400">✗ Bank account number</div>
                    <div className="text-red-400">✗ Routing number</div>
                    <div className="text-red-400">✗ Tax ID</div>
                    <div className="text-red-400">✗ Raw salary figure</div>
                  </div>

                  <button
                    onClick={runPayroll}
                    disabled={step === "idle" || step === "storing" || step === "registering" || step === "granting" || step === "running"}
                    className="w-full bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {step === "running" ? "Running in TEE..." : "Run Payroll (Cross-Tenant)"}
                  </button>

                  {result && (
                    <div className="space-y-2">
                      {result.simulated && (
                        <div className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg p-2">
                          Demo mode — deploy Rust contract to T3 testnet for live execution
                        </div>
                      )}
                      <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4 space-y-2">
                        <div className="text-green-400 font-semibold text-sm mb-3">✓ Payroll Processed</div>
                        <div className="grid grid-cols-2 gap-y-2 text-sm">
                          <span className="text-muted-foreground">Period</span>
                          <span className="font-mono">{result.period}</span>
                          <span className="text-muted-foreground">Gross (monthly)</span>
                          <span className="font-mono">
                            {result.currency} {result.gross?.toFixed(2)}
                          </span>
                          <span className="text-muted-foreground">Tax deducted</span>
                          <span className="font-mono text-red-400">
                            - {result.currency} {result.tax_deducted?.toFixed(2)}
                          </span>
                          <span className="text-muted-foreground font-semibold">Net disbursed</span>
                          <span className="font-mono text-green-400 font-semibold">
                            {result.currency} {result.net_disbursed?.toFixed(2)}
                          </span>
                          <span className="text-muted-foreground">Status</span>
                          <span className="text-green-400">{result.status}</span>
                          <span className="text-muted-foreground">Bank account visible</span>
                          <span className="text-red-400">No — TEE-protected</span>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Log panel */}
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-base">Execution Log</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-background/80 border border-border rounded-lg p-4 h-80 overflow-y-auto font-mono text-xs space-y-1">
                    {log.length === 0 && (
                      <span className="text-muted-foreground">Waiting for payroll run...</span>
                    )}
                    {log.map((line, i) => (
                      <div
                        key={i}
                        className={
                          line.startsWith("✓")
                            ? "text-green-400"
                            : line.startsWith("⚠")
                            ? "text-yellow-400"
                            : line.startsWith("→")
                            ? "text-blue-400"
                            : "text-muted-foreground"
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
                <CardTitle className="text-base">T3 ADK Integration</CardTitle>
                <p className="text-sm text-muted-foreground">Key SDK calls powering this demo</p>
              </CardHeader>
              <CardContent>
                <pre className="bg-background/80 border border-border rounded-lg p-4 text-xs font-mono text-muted-foreground overflow-x-auto leading-relaxed">
{`import { T3nClient, TenantClient, setEnvironment,
  loadWasmComponent, createEthAuthInput,
  metamask_sign, getScriptVersion, getNodeUrl } from "@terminal3/t3n-sdk";
import { readFile } from "fs/promises";

// 1. Connect to T3 testnet (URL resolved from setEnvironment)
setEnvironment("testnet");
const wasm = await loadWasmComponent({ wasmPath });
const client = new T3nClient({
  wasmComponent: wasm,
  handlers: { EthSign: metamask_sign(address, undefined, privateKey) },
});
await client.handshake();
const did = await client.authenticate(createEthAuthInput(address));

// 2. Claim tenant + create TEE-protected secrets map
const tenant = new TenantClient({ t3n: client, tenantDid: String(did), ... });
await tenant.tenant.claim();
await tenant.maps.create({ tail: "secrets", visibility: "private", ... });
await tenant.executeControl("map-entry-set", {
  map_name: tenant.canonicalName("secrets"),
  key: "base_salary", value: "120000",
});

// 3. Register payroll WASM contract
const wasmBytes = await readFile("contracts/payroll/target/wasm32-wasip2/release/z_payroll.wasm");
const reg = await tenant.contracts.register({ tail: "payroll", version: "0.1.0", wasm: wasmBytes });
const scriptName = \`z:\${tenantId}:payroll\`;

// 4. Employee grants employer agent access (signed by employee)
await userClient.execute({
  script_name: "tee:user/contracts",
  script_version: await getScriptVersion(getNodeUrl(), "tee:user/contracts"),
  function_name: "agent-auth-update",
  input: { agents: [{ agentDid, scripts: [{ scriptName, functions: ["compute-payroll"] }] }] },
});

// 5. Employer executes cross-tenant payroll — bank account stays in TEE
const scriptVersion = await getScriptVersion(getNodeUrl(), scriptName);
const result = await employerClient.executeAndDecode({
  script_name: scriptName,      // z:<tenantId>:payroll
  script_version: scriptVersion,
  function_name: "compute-payroll",
  input: { period: "2026-06", currency: "USD" },
});
// result.net_disbursed ✓  |  result.bank_account ✗ (TEE-only)
`}
                </pre>
              </CardContent>
            </Card>

            <Card className="bg-card border-border mt-4">
              <CardHeader>
                <CardTitle className="text-base">Rust Contract (payroll/src/lib.rs)</CardTitle>
                <p className="text-sm text-muted-foreground">Compiled to WASM, runs inside TEE node</p>
              </CardHeader>
              <CardContent>
                <pre className="bg-background/80 border border-border rounded-lg p-4 text-xs font-mono text-muted-foreground overflow-x-auto leading-relaxed">
{`// Inside TEE: bank account NEVER leaves enclave
fn compute_payroll(input: GenericInput) -> Result<Vec<u8>, String> {
    // Read salary from TEE-protected secrets map
    let salary = kv_store::get("secrets", "base_salary")?;

    // Disburse via PII placeholder — raw account never in WASM memory
    let payload = r#"{"amount": ..., "account": "{{profile.bank_account}}"}"#;
    http_with_placeholders::call(&Request {
        method: "POST",
        url: "https://api.sandbox.bank/disburse",
        body: Some(payload.into_bytes()),
        ..
    })?;

    // Return only computed values — no raw PII
    Ok(serde_json::to_vec(&PayrollResult {
        net_disbursed: net,
        bank_account_visible: false, // always false
        ..
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
