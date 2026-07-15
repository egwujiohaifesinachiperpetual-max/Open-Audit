# WASM Sandbox - Secure Third-Party Parser Execution

**Production-ready WebAssembly sandbox for executing community-developed contract parsers with zero host capabilities and strict resource limits.**

## Overview

The WASM Sandbox enables Open-Audit to safely execute **untrusted third-party code** for parsing custom Soroban smart contract events. It eliminates Remote Code Execution (RCE) risks through:

✅ **Zero Host Capabilities** - No filesystem, network, or environment access  
✅ **Memory Limits** - 16MB hard limit per execution  
✅ **Timeout Protection** - 5-second maximum execution time  
✅ **Worker Isolation** - Crashes don't affect main process  
✅ **Input/Output Validation** - Strict schema enforcement  

## Quick Start

### Prerequisites

- Node.js 18+
- Rust (for building parsers, optional)

### Installation

```bash
# Prerequisites
npm install

# Build example WASM modules (requires Rust)
npm run wasm:build-examples
```

### Usage

#### Basic Example

```typescript
import { WasmSandboxRunner } from './lib/wasm-sandbox';

const runner = new WasmSandboxRunner();

const result = await runner.execute(
  './parsers/my-contract-parser.wasm',
  {
    data: JSON.stringify({ from: 'G...', to: 'G...', amount: '1000000' }),
    contractId: 'CDLZ...YSC',
    eventType: 'transfer'
  }
);

if (result.success) {
  console.log(result.output.description); // "Transferred 1000000..."
  console.log(result.stats.executionTimeMs); // 80
} else {
  console.error(result.error.message);
}
```

### Common Commands

```bash
# Build WASM examples
cd lib/wasm-sandbox/examples/rust && ./build-all.sh

# Run tests
npm run test:wasm                # All tests
npm run test:wasm:watch          # Watch mode
npm run test:wasm:manual         # Manual test (valid)
npm run test:wasm:manual malicious  # Security tests
npm run test:wasm:benchmark      # Performance

# Custom parser
npm run test:wasm:manual custom ./my-parser.wasm
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Main Thread                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │          WasmSandboxRunner                            │  │
│  │  • Input validation                                   │  │
│  │  • Module loading & caching                           │  │
│  │  • Worker orchestration                               │  │
│  │  • Timeout enforcement                                │  │
│  │  • Result aggregation                                 │  │
│  └───────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           │ spawn Worker                     │
│                           ▼                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │         Worker Thread (wasm-sandbox-worker.js)        │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │         WebAssembly Instance                    │  │  │
│  │  │  ┌───────────────────────────────────────────┐  │  │  │
│  │  │  │    Linear Memory (16MB max)               │  │  │  │
│  │  │  │  ┌─────────────────────────────────────┐  │  │  │  │
│  │  │  │  │  Input JSON String                  │  │  │  │  │
│  │  │  │  └─────────────────────────────────────┘  │  │  │  │
│  │  │  │                  ↓                          │  │  │  │
│  │  │  │  ┌─────────────────────────────────────┐  │  │  │  │
│  │  │  │  │  WASM Parser Logic                  │  │  │  │  │
│  │  │  │  │  • alloc() / dealloc()              │  │  │  │  │
│  │  │  │  │  • parse()                          │  │  │  │  │
│  │  │  │  │  • getOutputLength()                │  │  │  │  │
│  │  │  │  └─────────────────────────────────────┘  │  │  │  │
│  │  │  │                  ↓                          │  │  │  │
│  │  │  │  ┌─────────────────────────────────────┐  │  │  │  │
│  │  │  │  │  Output JSON String                 │  │  │  │  │
│  │  │  │  └─────────────────────────────────────┘  │  │  │  │
│  │  │  └───────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           │ postMessage                      │
│                           ▼                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Result: { success, output, stats, error }            │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## API Reference

### WasmSandboxRunner

#### execute(wasmPath: string, input: WasmParserInput): Promise<WasmExecutionResult>

Executes a WASM parser in an isolated sandbox.

**Parameters:**
- `wasmPath` - Absolute path to `.wasm` file
- `input` - Parser input data

**Returns:** `WasmExecutionResult`
```typescript
{
  success: true,
  output: {
    description: string,
    fields?: Record<string, string>,
    error?: string
  },
  error: null,
  stats: {
    executionTimeMs: number,
    peakMemoryBytes: number,
    timedOut: boolean
  }
}
```

#### clearCache(): void

Clears the compiled module cache.

## Writing Custom Parsers

### Prerequisites

- Rust (1.70+)
- `wasm32-unknown-unknown` target

### Quick Start

```bash
# Create parser project
cargo new --lib my-parser
cd my-parser

# Edit Cargo.toml (see examples/rust/valid-parser/Cargo.toml)
```

**Edit `Cargo.toml`:**

```toml
[package]
name = "my-contract-parser"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]  # Creates .wasm binary

[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

[profile.release]
opt-level = "z"      # Optimize for size
lto = true           # Link-time optimization
codegen-units = 1
panic = "abort"
strip = true
```

### Step 2: Implement the Parser

**Edit `src/lib.rs`:**

```rust
use serde::{Deserialize, Serialize};
use std::alloc::{alloc, dealloc, Layout};
use std::slice;

// ============================================================================
// Input/Output Types (MUST match Open-Audit schema)
// ============================================================================

#[derive(Deserialize)]
struct ParserInput {
    data: String,
    #[serde(rename = "contractId")]
    contract_id: String,
    #[serde(rename = "eventType")]
    event_type: Option<String>,
}

#[derive(Serialize)]
struct ParserOutput {
    description: String,                    // REQUIRED
    fields: Option<serde_json::Value>,      // Optional
    error: Option<String>,                  // Optional
}

// ============================================================================
// Memory Management (REQUIRED EXPORTS)
// ============================================================================

#[no_mangle]
pub extern "C" fn alloc(size: usize) -> *mut u8 {
    let layout = Layout::from_size_align(size, 1).unwrap();
    unsafe { alloc(layout) }
}

#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, size: usize) {
    let layout = Layout::from_size_align(size, 1).unwrap();
    unsafe { dealloc(ptr, layout) };
}

// ============================================================================
// Output Buffer (REQUIRED)
// ============================================================================

static mut OUTPUT_PTR: *mut u8 = std::ptr::null_mut();
static mut OUTPUT_LEN: usize = 0;

#[no_mangle]
pub extern "C" fn getOutputLength() -> usize {
    unsafe { OUTPUT_LEN }
}

// ============================================================================
// Parser Logic (REQUIRED EXPORT)
// ============================================================================

#[no_mangle]
pub extern "C" fn parse(input_ptr: *const u8, input_len: usize) -> *mut u8 {
    // 1. Read input from linear memory
    let input_slice = unsafe { slice::from_raw_parts(input_ptr, input_len) };
    let input_str = match std::str::from_utf8(input_slice) {
        Ok(s) => s,
        Err(_) => return error_output("Invalid UTF-8"),
    };

    // 2. Parse input JSON
    let input: ParserInput = match serde_json::from_str(input_str) {
        Ok(i) => i,
        Err(e) => return error_output(&format!("Failed to parse input: {}", e)),
    };

    // 3. YOUR CUSTOM LOGIC HERE
    let output = parse_my_contract(&input);

    // 4. Serialize output to JSON
    let output_str = serde_json::to_string(&output).unwrap();

    // 5. Allocate output in linear memory
    let output_bytes = output_str.as_bytes();
    let output_ptr = alloc(output_bytes.len());
    
    unsafe {
        std::ptr::copy_nonoverlapping(
            output_bytes.as_ptr(),
            output_ptr,
            output_bytes.len(),
        );
        OUTPUT_PTR = output_ptr;
        OUTPUT_LEN = output_bytes.len();
    }

    output_ptr
}

// ============================================================================
// Your Custom Parsing Logic
// ============================================================================

fn parse_my_contract(input: &ParserInput) -> ParserOutput {
    match serde_json::from_str::<serde_json::Value>(&input.data) {
        Ok(json) => {
            let from = json.get("from")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            let to = json.get("to")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            let amount = json.get("amount")
                .and_then(|v| v.as_str())
                .unwrap_or("0");

            let description = format!(
                "{} transferred {} tokens from {} to {}",
                shorten_address(&input.contract_id),
                amount,
                shorten_address(from),
                shorten_address(to)
            );

            let mut fields = serde_json::Map::new();
            fields.insert("from".to_string(), serde_json::json!(from));
            fields.insert("to".to_string(), serde_json::json!(to));
            fields.insert("amount".to_string(), serde_json::json!(amount));

            ParserOutput {
                description,
                fields: Some(serde_json::Value::Object(fields)),
                error: None,
            }
        }
        Err(e) => ParserOutput {
            description: format!("Failed to parse: {}", e),
            fields: None,
            error: Some(e.to_string()),
        }
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

fn error_output(message: &str) -> *mut u8 {
    let output = ParserOutput {
        description: format!("Parse error: {}", message),
        fields: None,
        error: Some(message.to_string()),
    };

    let output_str = serde_json::to_string(&output).unwrap();
    let output_bytes = output_str.as_bytes();
    let output_ptr = alloc(output_bytes.len());

    unsafe {
        std::ptr::copy_nonoverlapping(
            output_bytes.as_ptr(),
            output_ptr,
            output_bytes.len(),
        );
        OUTPUT_PTR = output_ptr;
        OUTPUT_LEN = output_bytes.len();
    }

    output_ptr
}

fn shorten_address(address: &str) -> String {
    if address.len() <= 12 {
        return address.to_string();
    }
    format!("{}...{}", &address[..6], &address[address.len() - 4..])
}
```

### Step 3: Build WASM Binary

```bash
cargo build --target wasm32-unknown-unknown --release

# Your WASM is at:
# target/wasm32-unknown-unknown/release/my_contract_parser.wasm
```

### Step 4: Test Your Parser

**Create `test-parser.js`:**

```javascript
const { WasmSandboxRunner } = require('./lib/wasm-sandbox/wasm-sandbox-runner');
const { join } = require('path');

async function testParser() {
  const runner = new WasmSandboxRunner();
  
  const result = await runner.execute(
    join(__dirname, 'my-parser/target/wasm32-unknown-unknown/release/my_contract_parser.wasm'),
    {
      data: JSON.stringify({ from: 'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234', to: 'GXYZ9876543210ZYXWVUTSRQPONMLKJIHGFEDCBA9876', amount: '1000000' }),
      contractId: 'CDLZ...YSC',
      eventType: 'transfer'
    }
  );

  if (result.success) {
    console.log('✅ Success!');
    console.log('Description:', result.output.description);
    console.log('Fields:', result.output.fields);
    console.log('Execution time:', result.stats.executionTimeMs, 'ms');
  } else {
    console.error('❌ Error:', result.error.message);
  }
}

testParser();
```

```bash
node test-parser.js
```

### Required Exports

Your WASM module **MUST** export these functions:

```rust
/// Allocates `size` bytes in linear memory
#[no_mangle]
pub extern "C" fn alloc(size: usize) -> *mut u8;

/// Deallocates memory at pointer
#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, size: usize);

/// Parses input and returns output pointer
#[no_mangle]
pub extern "C" fn parse(input_ptr: *const u8, input_len: usize) -> *mut u8;

/// Returns output string length
#[no_mangle]
pub extern "C" fn getOutputLength() -> usize;
```

### Input Schema

```json
{
  "data": "string",           // Required: Contract data (JSON or hex)
  "contractId": "string",     // Required: Stellar contract ID
  "eventType": "string?"      // Optional: Event type hint
}
```

### Output Schema

```json
{
  "description": "string",    // Required: Human-readable description
  "fields": {},               // Optional: Structured data
  "error": "string?"          // Optional: Error message
}
```

## Security Mechanisms

### 1. Zero Host Capabilities

```typescript
// WASM import object provides ONLY memory
const imports = {
  env: {
    memory,  // Linear memory for data passing
    abort: () => { throw new Error("abort"); }  // Minimal handler
  }
  // NO fs, NO net, NO env, NO process
};
```

### 2. Memory Limits

```typescript
const memory = new WebAssembly.Memory({
  initial: 1,           // 64KB initial
  maximum: 256,         // 16MB maximum (NO growth beyond)
});
```

### 3. Timeout Protection

```typescript
const timeout = setTimeout(() => {
  worker.terminate();  // Forcibly kill worker thread
}, 5000);
```

### 4. Input/Output Validation

```typescript
// Input: Max 1MB
if (inputSize > MAX_INPUT_SIZE_BYTES) {
  throw new WasmExecutionError("Input too large", "INVALID_INPUT");
}

// Output: Max 1MB, required structure
if (!output.description) {
  throw new WasmExecutionError("Invalid output structure", "INVALID_OUTPUT");
}
```

### 5. Worker Thread Isolation

```typescript
// Each execution runs in isolated Worker
const worker = new Worker("wasm-sandbox-worker.js", {
  workerData: { moduleBytes, input, maxMemoryPages }
});
```

## Resource Limits

| Resource | Limit | Enforcement |
|----------|-------|-------------|
| Memory | 16 MB | `WebAssembly.Memory` max parameter |
| Execution Time | 5 seconds | Worker termination timer |
| Input Size | 1 MB | Pre-validation |
| Output Size | 1 MB | Post-validation |
| Stack Depth | WASM default | Browser/runtime limits |

## Error Types

| Type | Cause |
|------|-------|
| `LOAD_FAILED` | File not found |
| `INSTANTIATION_FAILED` | WASM compilation error |
| `INVALID_EXPORTS` | Missing required exports |
| `TIMEOUT_EXCEEDED` | Execution > 5s |
| `RUNTIME_PANIC` | WASM trap/crash |
| `INVALID_INPUT` | Bad input |
| `INVALID_OUTPUT` | Bad output |

## Performance

### Execution Overhead

```
First execution:  ~80-150ms  (compile + execute)
Cached execution: ~60-100ms  (execute only)
Overhead:         ~20-50ms   (worker spawn + serialization)
```

### Benchmarks

```
Simple parse (100 bytes):   ~80ms
Complex parse (10KB):       ~120ms
Large parse (100KB):        ~250ms
Concurrent (5 parsers):     ~400ms total
```

### Optimization

- ✅ Module caching (compiled WASM reused)
- ⏳ Worker pooling (future enhancement)
- ⏳ Streaming execution (future enhancement)

## Common Patterns

### Parsing JSON Contract Data

```rust
fn parse_json_data(input: &ParserInput) -> ParserOutput {
    match serde_json::from_str::<serde_json::Value>(&input.data) {
        Ok(json) => {
            // Extract fields
            let field1 = json.get("field1").and_then(|v| v.as_str());
            let field2 = json.get("field2").and_then(|v| v.as_i64());
            
            // Build description
            let description = format!("Custom event: {} {}", field1.unwrap_or(""), field2.unwrap_or(0));
            
            ParserOutput { description, fields: None, error: None }
        }
        Err(e) => error_output(&format!("JSON parse error: {}", e))
    }
}
```

### Parsing Hex Contract Data

```rust
fn parse_hex_data(hex: &str) -> Vec<u8> {
    let clean = if hex.starts_with("0x") { &hex[2..] } else { hex };
    hex::decode(clean).unwrap_or_default()
}
```

### Formatting Addresses

```rust
fn format_address(addr: &str) -> String {
    if addr.len() <= 12 {
        addr.to_string()
    } else {
        format!("{}...{}", &addr[..6], &addr[addr.len() - 4..])
    }
}
```

## Debugging Tips

1. **Test Locally First**
   ```rust
   #[cfg(test)]
   mod tests {
       use super::*;

       #[test]
       fn test_parser() {
           let input = ParserInput {
               data: r#"{"from":"G...","to":"G...","amount":"1000000"}"#.to_string(),
               contract_id: "CDLZ...YSC".to_string(),
               event_type: Some("transfer".to_string()),
           };

           let output = parse_my_contract(&input);
           assert!(output.description.contains("transferred"));
       }
   }
   ```

2. **Use `panic!` for Debugging**
   ```rust
   // Panics will be caught by the sandbox and reported as errors
   if some_invalid_condition {
       panic!("Debug info: value was {}", value);
   }
   ```

3. **Return Errors Instead of Panicking**
   ```rust
   // Better: Return error in output
   if some_invalid_condition {
       return ParserOutput {
           description: "Invalid data".to_string(),
           fields: None,
           error: Some(format!("Expected X, got Y")),
       };
   }
   ```

4. **Check WASM Binary Size**
   ```bash
   ls -lh target/wasm32-unknown-unknown/release/*.wasm

   # Should be < 100KB for most parsers
   # If > 500KB, consider optimizations
   ```

5. **Validate Exports**
   ```bash
   wasm-objdump -x target/wasm32-unknown-unknown/release/my_parser.wasm | grep "export"

   # Should see:
   #  - export alloc
   #  - export dealloc
   #  - export parse
   #  - export getOutputLength
   ```

## Examples

### Valid Parser

See [examples/rust/valid-parser/](./examples/rust/valid-parser/) for a complete reference implementation that:
- Implements required API contract
- Parses JSON contract data
- Handles errors gracefully
- Formats output correctly

### Malicious Parser (Security Testing)

See [examples/rust/malicious-parser/](./examples/rust/malicious-parser/) for intentionally malicious parsers that test security mechanisms:
- Infinite loop (tests timeout)
- Memory bomb (tests memory limits)
- Stack overflow (tests recursion limits)

## Troubleshooting

### Error: WASM file not found

```bash
# Build example WASM modules
cd lib/wasm-sandbox/examples/rust
./build-all.sh  # Linux/Mac
build-all.bat   # Windows
```

### Error: TIMEOUT_EXCEEDED

Your parser is taking > 5 seconds. Optimize your algorithm or reduce input size.

### Error: INVALID_EXPORTS

Your WASM must export: `alloc`, `dealloc`, `parse`, `getOutputLength`

### Error: INVALID_OUTPUT

Output must be JSON with required `description` field, size < 1MB.

## Security Considerations

### What You CAN'T Do

- ❌ Access filesystem
- ❌ Make network requests
- ❌ Read environment variables
- ❌ Fork processes
- ❌ Access system clock (for security)
- ❌ Allocate > 16MB memory
- ❌ Run for > 5 seconds

### What You CAN Do

- ✅ Parse JSON/hex data
- ✅ Perform calculations
- ✅ Format strings
- ✅ Return structured data
- ✅ Use standard Rust libraries (no_std compatible)

### Best Practices

1. **Validate all inputs** before processing
2. **Handle errors gracefully** - return error in output, don't panic
3. **Optimize for performance** - stay under 1 second execution
4. **Keep binary small** - minimize dependencies
5. **Test edge cases** - empty data, malformed JSON, large inputs

## FAQ

### Q: Can I use external crates?

**A:** Yes, but only `no_std` compatible crates. Avoid crates that require filesystem, network, or threads.

### Q: How do I handle async operations?

**A:** You can't. WASM parsers are **synchronous only**. All parsing must complete in a single function call.

### Q: Can I call other WASM modules?

**A:** No. Each parser is isolated.

### Q: What if my contract schema changes?

**A:** Version your parsers and detect the version from the input.

## Integration with Translation System

### 1. Register WASM Parser

```typescript
import { registerWasmParser } from "./translator/wasm-registry";

registerWasmParser({
  contractId: "CDLZ...YSC",
  wasmPath: "./parsers/my-contract-parser.wasm",
  contractName: "My Custom Contract",
});
```

### 2. Automatic Fallback

The translation engine tries in order:
1. JavaScript blueprint (fast, trusted)
2. WASM parser (secure, community)
3. Raw hex fallback (no translation)

## Testing

### Run Test Suite

```bash
# All WASM sandbox tests
npm run test:wasm

# Watch mode
npm run test:wasm:watch

# Manual testing
npm run test:wasm:manual         # Test valid parser
npm run test:wasm:manual malicious  # Test security mechanisms
npm run test:wasm:manual custom ./my-parser.wasm  # Test custom parser

# Performance benchmark
npm run test:wasm:benchmark
```

### Test Coverage

- ✅ Valid parser execution (various input formats)
- ✅ Input validation (size limits, required fields)
- ✅ Output validation (structure, size limits)
- ✅ Timeout protection (infinite loops)
- ✅ Memory limits (allocation guards)
- ✅ Resource isolation (no filesystem/network/env)
- ✅ Error handling (corrupted WASM, missing exports)
- ✅ Module caching (performance optimization)
- ✅ Concurrent execution

## Security Threat Model

### Threats Mitigated ✅

| Threat | Mitigation |
|--------|------------|
| Remote Code Execution | WASM sandbox with zero host access |
| Infinite loops / DoS | 5-second timeout + worker termination |
| Memory exhaustion | 16MB hard limit via WASM memory |
| Filesystem access | No fs imports provided |
| Network exfiltration | No net imports provided |
| Environment leaks | No env imports provided |
| Process escape | Worker thread isolation |
| Stack overflow | WASM stack limits + timeout |

### Threats NOT Mitigated ⚠️

| Threat | Reason | Mitigation |
|--------|--------|------------|
| Malicious output data | Parser controls output | Validate output structure |
| Side-channel attacks | Timing, speculation | Not in scope (no secrets) |
| Supply chain (Rust deps) | Community parsers | Code review before merge |

## Future Enhancements

### Short-term
- [ ] Worker pool for reduced overhead
- [ ] Streaming parser support for large inputs
- [ ] Parser versioning and updates
- [ ] Community parser registry

### Long-term
- [ ] Gas metering for deterministic limits
- [ ] Formal verification of security properties
- [ ] Multi-language support (AssemblyScript, TinyGo)
- [ ] Browser-based parser playground

## References

- [WebAssembly Specification](https://webassembly.github.io/spec/)
- [Node.js Worker Threads](https://nodejs.org/api/worker_threads.html)
- [Linear Memory in WASM](https://developer.mozilla.org/en-US/docs/WebAssembly/Understanding_the_text_format#linear_memory)
- [Rust WASM Book](https://rustwasm.github.io/docs/book/)
- [WebAssembly Security](https://webassembly.org/docs/security/)

## Support

For questions or issues:
- GitHub Issues: [Open-Audit/issues](https://github.com/your-org/Open-Audit/issues)
- Discord: `#wasm-sandbox` channel
- Email: support@open-audit.io

## License

MIT License - See LICENSE file for details

## Credits

Built with:
- [WebAssembly](https://webassembly.org/)
- [Node.js Worker Threads](https://nodejs.org/api/worker_threads.html)
- [Rust](https://www.rust-lang.org/)
- [stellar-sdk](https://github.com/stellar/js-stellar-sdk)
