# config/index.ts - Configuration Management

## What This File Is

This file manages all configuration for the server. It loads settings from environment variables, applies defaults, validates everything, and exports a single, immutable configuration object.

## My Thought Process

### The Configuration Problem

Without proper config management:

```typescript
// Scattered throughout the codebase
const port = process.env.PORT || 3000;  // In server.ts
const vaultPath = process.env.VAULT_PATH || './vault';  // In vault.ts
const logLevel = process.env.LOG_LEVEL ?? 'info';  // In logger.ts

// Problems:
// 1. Duplicated logic (what if defaults differ?)
// 2. No validation (what if PORT='abc'?)
// 3. Hard to test (mock process.env everywhere)
// 4. No type safety
```

**The solution:** Centralized configuration module.

```typescript
// One import, all settings
import { config } from './config/index.js';

console.log(config.port);      // number, validated
console.log(config.vaultPath); // string, with default
console.log(config.logLevel);  // union type, validated enum
```

---

## Key Patterns Explained

### Pattern 1: Schema-Based Configuration

```typescript
const configSchema = z.object({
  port: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(65535))
    .default('3000'),
});
```

**Breaking this down:**

```typescript
z.string()                    // 1. Start as string (env vars are always strings)
  .transform(val => parseInt(val, 10))  // 2. Convert to number
  .pipe(z.number()            // 3. Validate as number
    .int()                    // 4. Must be integer
    .min(1).max(65535))       // 5. Valid port range
  .default('3000')            // 6. Default if not set
```

**Why this complexity?**

Environment variables are always strings:
```bash
PORT=3000 node server.js
# process.env.PORT is "3000", not 3000
```

We need to:
1. Accept string input
2. Transform to correct type
3. Validate the result
4. Provide sensible default

### Pattern 2: Environment Variable Prefixing

```typescript
function loadFromEnv(): Record<string, string | undefined> {
  const prefix = 'OBSIDIAN_CLAUDE_';

  return {
    port: process.env[`${prefix}PORT`] ?? process.env.PORT,
    // ...
  };
}
```

**Why prefix?**

```bash
# Without prefix - could conflict with other apps
PORT=3000

# With prefix - clearly ours
OBSIDIAN_CLAUDE_PORT=3000
```

**The fallback pattern:**
```typescript
process.env[`${prefix}PORT`] ?? process.env.PORT
//         ↑ Our specific var     ↑ Standard var
```

We check our prefixed var first, fall back to standard conventions.

### Pattern 3: Filtering Undefined Values

```typescript
const filteredConfig = Object.fromEntries(
  Object.entries(envConfig).filter(([, value]) => value !== undefined)
);
```

**Why filter?**

```typescript
// If we pass undefined explicitly:
configSchema.parse({ port: undefined });
// Zod sees "port was provided" and won't apply default

// If we omit the key entirely:
configSchema.parse({});
// Zod sees "port not provided" and applies default

// So we filter out undefined to let defaults work
```

**This is a subtle but important detail.** Zod distinguishes between "key missing" and "key present with undefined value."

### Pattern 4: Derived Configuration

```typescript
const config = {
  ...result.data,
  // Derive additional values
  dbPath: result.data.dbPath ?? join(result.data.vaultPath, '.cache.db'),
  isDev: result.data.mode === 'development',
  isMcp: result.data.mode === 'mcp',
};
```

**Why derive values?**

Some config values depend on others:
- `dbPath` defaults to inside `vaultPath`
- `isDev` is computed from `mode`

**Benefits:**
```typescript
// Without derived values
if (config.mode === 'development') {
  // Do dev stuff
}

// With derived values
if (config.isDev) {
  // Cleaner, more intentional
}
```

### Pattern 5: Immutable Configuration

```typescript
return Object.freeze(config);
```

**Why freeze?**

```typescript
// Without freeze - accidental mutation
config.port = 5000;  // Silently works, causes bugs

// With freeze - error on mutation
config.port = 5000;  // TypeError: Cannot assign to read only property
```

**Configuration should never change after startup.** Freezing enforces this.

### Pattern 6: Fail Fast on Invalid Config

```typescript
if (!result.success) {
  console.error('Configuration error:');
  for (const issue of result.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}
```

**Why exit immediately?**

```typescript
// BAD - continue with invalid config
if (!result.success) {
  console.warn('Config error, using defaults');
  // App continues... eventually crashes mysteriously
}

// GOOD - fail fast
if (!result.success) {
  console.error('Configuration error');
  process.exit(1);
  // App never starts with bad config
}
```

**Fail fast principle:** It's better to crash loudly at startup than fail mysteriously later.

### Pattern 7: Singleton Pattern

```typescript
export const config = createConfig();
```

**Why a singleton?**

Configuration is loaded once and used everywhere. We don't want:
- Multiple config objects with different values
- Repeated environment parsing
- Inconsistent settings across modules

The module system makes this a natural singleton - the module is only evaluated once.

---

## The Config Type

```typescript
export type Config = typeof config;
```

**Why export the type?**

```typescript
// Function that needs config
function startServer(config: Config) {
  // TypeScript knows all the config properties
}

// Or partial config for testing
function createTestConfig(overrides: Partial<Config>): Config {
  return { ...config, ...overrides };
}
```

---

## Environment Variables Summary

| Variable | Default | Description |
|----------|---------|-------------|
| `OBSIDIAN_CLAUDE_PORT` | 3000 | HTTP server port |
| `OBSIDIAN_CLAUDE_HOST` | localhost | HTTP server host |
| `OBSIDIAN_CLAUDE_VAULT_PATH` | ~/obsidian-vault | Path to Obsidian vault |
| `OBSIDIAN_CLAUDE_DB_PATH` | {vault}/.cache.db | SQLite database path |
| `OBSIDIAN_CLAUDE_LOG_LEVEL` | info | Log level |
| `OBSIDIAN_CLAUDE_MODE` | development | Run mode |
| `OBSIDIAN_CLAUDE_PROACTIVITY_MODE` | quiet | Claude integration mode |

---

## Common Mistakes

### Mistake 1: Not Validating Config

```typescript
// BAD - no validation
const port = parseInt(process.env.PORT || '3000');
// What if PORT='abc'? parseInt returns NaN!

// GOOD - validated
const port = z.string().transform(parseInt).pipe(z.number()).parse(process.env.PORT);
// Throws clear error if invalid
```

### Mistake 2: Mutable Config

```typescript
// BAD - config can change
export const config = { port: 3000 };
config.port = 5000;  // No error, chaos ensues

// GOOD - frozen config
export const config = Object.freeze({ port: 3000 });
config.port = 5000;  // TypeError!
```

### Mistake 3: Scattered Defaults

```typescript
// BAD - defaults in multiple places
// server.ts
const port = process.env.PORT || 3000;
// routes.ts
const port = process.env.PORT || 8080;  // Different default!

// GOOD - one place for defaults
// config/index.ts
port: z.string().default('3000')
```

### Mistake 4: No Type Safety

```typescript
// BAD - string that should be number
const config = {
  port: process.env.PORT || '3000',  // string!
};
server.listen(config.port);  // Works but wrong type

// GOOD - correct types
const config = {
  port: parseInt(process.env.PORT || '3000'),  // number
};
```

---

## Testing Configuration

```typescript
// In tests, you might want different config
describe('Server', () => {
  // Option 1: Environment variables
  beforeAll(() => {
    process.env.OBSIDIAN_CLAUDE_PORT = '4000';
  });

  // Option 2: Dependency injection
  function createServer(config: Config) {
    // Use injected config instead of importing
  }

  it('starts on configured port', () => {
    const testConfig = { ...config, port: 4000 };
    const server = createServer(testConfig);
  });
});
```

---

## How This Connects to Senior-Level Thinking

### 1. **Twelve-Factor App**

This follows [12-factor app](https://12factor.net/) principles:
- Config in environment variables
- Strict separation of config from code
- No config in source control

### 2. **Defense in Depth**

Multiple layers of protection:
- Type checking (TypeScript)
- Runtime validation (Zod)
- Immutability (Object.freeze)
- Fail fast (process.exit)

### 3. **Developer Experience**

Good config provides:
- Clear error messages
- Sensible defaults
- Type autocompletion
- Single source of truth

### 4. **Operational Excellence**

Production-ready config means:
- Environment variable support (for containers/deployment)
- No hardcoded values
- Debug output for troubleshooting

---

## Questions to Test Understanding

1. Why do we transform string to number for `port` instead of just accepting number?
2. What's the difference between `??` and `||` for defaults?
3. Why filter out undefined values before parsing?
4. What does `Object.freeze()` prevent?
5. Why exit the process on config error instead of using defaults?
6. How does the singleton pattern work with ES modules?
