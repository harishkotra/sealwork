# SealWork

**Privacy-preserving AI agents for payroll and hiring, built on Terminal 3 ADK.**

> AI agents that act without seeing your data. Bank accounts, salaries, and candidate PII stay encrypted inside hardware-secured TEE nodes. Agents compute, disburse, and match — they never touch the raw values.

---

## What It Does

SealWork has two products built on the same Terminal 3 ADK infrastructure:

### AgentPayroll
An AI agent runs payroll end-to-end without the employer ever seeing the employee's bank account, tax ID, or salary.

- Employee stores sensitive data in a TEE-protected KV map
- Employer agent invokes the payroll contract cross-tenant
- Rust/WASM contract disburses payment using `{{profile.bank_account}}` placeholder — raw account number never leaves the TEE enclave
- Employer receives: net disbursed amount, period, status — not: bank account, tax ID, or salary

### PrivacyHire
An AI agent matches candidates to jobs without the employer seeing name, email, or salary expectation.

- Candidate stores profile in a TEE-protected KV map
- Public Verifiable Credential exposes only: role, years experience, skills
- Employer agent invokes hiring-verify contract cross-tenant
- Contract checks `salary_expectation <= budget` entirely inside TEE
- Employer receives: `matched`, `meets_experience`, `meets_skills`, `meets_budget` — not: salary, name, or email

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    T3 TEE Node (testnet)                 │
│                                                          │
│  Employee Tenant          Employer Tenant                │
│  ┌─────────────┐          ┌──────────────┐              │
│  │ KV Map      │          │ Payroll       │              │
│  │ secrets:    │◄─────────│ Contract      │              │
│  │  bank_acct  │ cross-   │ (Rust→WASM)  │              │
│  │  tax_id     │ tenant   │               │              │
│  │  salary     │ invoke   │ {{profile.*}} │              │
│  └─────────────┘          │ resolved here │              │
│                           └──────────────┘              │
│         Hardware-enforced isolation (TDX)                │
└─────────────────────────────────────────────────────────┘
         ▲                        ▲
  Employee Agent            Employer Agent
  (DID: Ethereum wallet)   (DID: Ethereum wallet)
  SIWE authenticated        SIWE authenticated
```

### T3 ADK Features Used

| Feature | How Used |
|---------|----------|
| `loadWasmComponent()` | Load WASM crypto module for session encryption |
| `T3nClient` + `metamask_sign` | Ethereum wallet auth via SIWE, server-side |
| `createEthAuthInput()` | Create Ethereum auth input for DID-linked sessions |
| `TenantClient` | Tenant registration, map creation, contract publishing |
| `tenant.maps.create()` | Private TEE-backed KV maps with access control |
| `tenant.executeControl("map-entry-set")` | Seed secrets into KV maps |
| `Z_PAYROLL_RUN_FUNCTIONS` | Payroll contract function names |
| Cross-tenant execution | Employer agent calls employee's payroll/hiring contract |
| `http-with-placeholders` | `{{profile.bank_account}}` resolved inside TEE enclave |
| Rust→WASM contracts | Payroll computation + candidate matching in TEE |
| `GuestToHostHandlers.EthSign` | Server-side Ethereum signing for Node.js agents |

---

## Tech Stack

- **Frontend/Backend**: Next.js 16 App Router (TypeScript)
- **UI**: shadcn/ui + Tailwind CSS
- **T3 ADK**: `@terminal3/t3n-sdk` v3.11 (testnet)
- **Wallet signing**: ethers.js v6 (Ethereum SIWE)
- **Contracts**: Rust → `wasm32-wasip2`

---

## Project Structure

```
t3-hackathon/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Landing page
│   │   ├── payroll/page.tsx      # AgentPayroll demo UI
│   │   ├── hire/page.tsx         # PrivacyHire demo UI
│   │   └── api/t3/
│   │       ├── claim/            # Claim tenant DID
│   │       ├── store-profile/    # Store employee profile in TEE
│   │       ├── store-candidate/  # Store candidate profile in TEE
│   │       ├── run-payroll/      # Cross-tenant payroll execution
│   │       └── match-candidate/  # Cross-tenant hiring verification
│   └── lib/
│       ├── t3-client.ts          # T3 ADK client factory
│       └── t3.ts                 # Types and constants
├── contracts/
│   ├── payroll/                  # Rust payroll contract
│   └── hiring/                   # Rust hiring contract
└── .env.local.example
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- T3 API key from [terminal3.io](https://terminal3.io)
- Rust + `wasm32-wasip2` (for contract compilation only)

### Install

```bash
npm install
```

### Configure

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```bash
T3N_API_KEY=your_t3n_api_key_here

# Ethereum wallets for agent identity (any ETH private key works — no mainnet ETH needed)
EMPLOYEE_PRIVATE_KEY=0x...
EMPLOYER_PRIVATE_KEY=0x...
CANDIDATE_PRIVATE_KEY=0x...
```

Generate fresh keys:
```bash
node -e "
const {Wallet} = require('ethers');
['EMPLOYEE','EMPLOYER','CANDIDATE'].forEach(r => {
  const w = Wallet.createRandom();
  console.log(r + '_PRIVATE_KEY=' + w.privateKey);
})"
```

Fund generated addresses with T3 test tokens at [terminal3.io](https://terminal3.io).

### Run

```bash
npm run dev
# open http://localhost:3000
```

### Compile Contracts (optional)

```bash
rustup target add wasm32-wasip2
cd contracts/payroll && cargo build --target wasm32-wasip2 --release
cd contracts/hiring && cargo build --target wasm32-wasip2 --release
```

---

## Key Integration Points

### Client Init (`src/lib/t3-client.ts`)

```typescript
// Load WASM crypto module (required by T3nClient)
const wasm = await loadWasmComponent({ wasmPath: WASM_PATH });

// Create client with EthSign handler for server-side SIWE signing
const client = new T3nClient({
  wasmComponent: wasm,
  baseUrl: getNodeUrl(),
  handlers: {
    EthSign: metamask_sign(wallet.address, undefined, privateKey),
  },
});

await client.handshake();
const did = await client.authenticate(createEthAuthInput(wallet.address));
```

### Store Sensitive Data in TEE

```typescript
await tenant.maps.create({
  tail: "secrets",
  visibility: "private",
  writers: { only: [] },
  readers: { only: [contractId] },
});

// Control-plane write — bypasses writers ACL, TEE-only access
await tenant.executeControl("map-entry-set", {
  map_name: tenant.canonicalName("secrets"),
  key: "base_salary",
  value: "120000",
});
```

### Cross-Tenant Execution

```typescript
// Employer invokes employee's payroll contract
// bank_account resolved inside TEE — employer never sees it
const result = await client.executeAndDecode({
  script: `z:${employeeDid}:payroll`,
  version: 1,
  fn: "compute-payroll",
  input: { period: "2026-06" },
});
```

### Rust Contract (runs inside TEE)

```rust
fn compute_payroll(input: GenericInput) -> Result<Vec<u8>, String> {
    let salary = kv_store::get("secrets", "base_salary")?;

    // Bank account resolved by host inside enclave — never in WASM memory
    http_with_placeholders::call(&Request {
        url: "https://api.bank/disburse".to_string(),
        body: Some(r#"{"account":"{{profile.bank_account}}"}"#.into()),
        ..
    })?;

    Ok(serde_json::to_vec(&PayrollResult {
        net_disbursed: net,
        bank_account_visible: false,
    })?)
}
```

---

## Bounty Submission Answers

**Problem:** Payroll and hiring require sharing the most sensitive personal and financial data with employers and recruiters — with no cryptographic guarantee it won't be misused. SealWork eliminates the exposure surface: employees and candidates store data once in a hardware TEE, and AI agents handle all downstream operations without it ever leaving.

**Why verifiable identity matters:** Agents act in high-stakes situations — disbursing salary, making hiring decisions. Without DID-backed identity, any process could impersonate an employer agent. T3 ADK's Ethereum-linked DIDs mean every cross-tenant invocation is cryptographically signed by a verified agent identity. The `agent-auth-update` grant scopes exactly which contract functions that DID can invoke — no other agent, even with identical code, can execute that payroll run.

**Documentation gap found:** The TypeScript SDK types diverge significantly from the documented API shapes — `T3nClientConfig` requires `wasmComponent` (undocumented), `GuestToHostHandlers.EthSign` is needed for server-side Ethereum signing (undocumented), and `executeControl("map-entry-set")` is the only way to write KV entries (undocumented). A TypeScript-first quickstart that compiles would cut onboarding from hours to minutes.

---

Built for the Terminal 3 Bounty Challenge · June 2026
