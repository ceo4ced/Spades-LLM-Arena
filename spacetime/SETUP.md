# Spacetime workspace — toolchain setup

Two crates live here:
- `encoding/` — pure Rust, zero dependencies. Builds with any Rust 1.80+.
- `module/` — SpacetimeDB module. Requires the SpacetimeDB toolchain.

## Required for `module/`

The `spacetimedb` crate (and its sub-crates `spacetimedb-bindings-macro`,
`spacetimedb-lib`, etc.) require **Rust 1.90 or newer**. This project's
Homebrew Rust is 1.85, so the module won't compile without an upgrade.

### One-time setup

1. **Install rustup** (Rust toolchain manager):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
   This will replace Homebrew's Rust on your `PATH` (or sit alongside — `rustup`
   prepends `~/.cargo/bin` to `PATH`, so cargo and rustc point to rustup's
   version going forward).

2. **Install a Rust 1.90+ toolchain**:
   ```bash
   rustup toolchain install stable
   rustup default stable
   ```

3. **Add the WebAssembly target** (modules compile to WASM):
   ```bash
   rustup target add wasm32-unknown-unknown
   ```

4. **Install the SpacetimeDB CLI**:
   ```bash
   curl -sSf https://install.spacetimedb.com | sh
   ```
   Or follow https://spacetimedb.com/install for other installation methods.

### Verify

After setup:
```bash
cd spacetime
cargo check -p spades-module
spacetime --version
```

Both should succeed without errors.

### Build and deploy the module

```bash
cd spacetime/module
spacetime build
# To deploy to a local instance:
spacetime publish --project-path . spades-arena
# To deploy to maincloud (requires login):
spacetime publish --project-path . --identity-token <token> spades-arena
```

### Generate TypeScript bindings

After the module builds:
```bash
spacetime generate --lang typescript --out-dir ../../src/spacetime-bindings --project-path .
```

This emits TypeScript types and reducer-call helpers under `src/spacetime-bindings/`
that the React app uses.

## Why this isn't bundled

The Homebrew Rust 1.85 currently in use can't compile the spacetimedb crates
(>=1.12 require Rust 1.90). The `encoding/` crate is unaffected and continues
to build cleanly with `cargo check -p encoding`.

The `module/` source is in place and syntactically correct — it just needs a
newer toolchain to compile. After installing rustup per above, no source
changes should be needed.
