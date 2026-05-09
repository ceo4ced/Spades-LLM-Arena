# Spacetime workspace — setup

Two crates live here:
- `encoding/` — pure Rust, zero dependencies. Builds with any Rust 1.80+.
- `module/` — SpacetimeDB module. Requires the SpacetimeDB toolchain.

## Default deployment: SpacetimeDB Maincloud

The `spades-arena` module is published to SpacetimeDB Maincloud. The React
client points there out of the box — `npm install && npm run dev` is enough
for normal development. **Most contributors never need to run any of the
commands below.**

The convenience scripts in `package.json` wrap the common module-side flows:

```bash
npm run spacetime:list          # list databases on maincloud
npm run spacetime:logs          # tail spades-arena logs from maincloud
npm run spacetime:publish       # publish the prebuilt wasm to maincloud
npm run spacetime:generate      # regenerate src/spacetime-bindings/ from the module
```

`spacetime:publish` requires you to be logged in to maincloud first:

```bash
spacetime login                 # opens spacetimedb.com in a browser
```

## Building the module from source

The `spacetimedb` crate (and its sub-crates `spacetimedb-bindings-macro`,
`spacetimedb-lib`, etc.) require **Rust 1.90 or newer**. Homebrew Rust 1.85
is too old, so the module won't compile without an upgrade.

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

### Build and publish

After making module changes, rebuild and re-publish to maincloud:

```bash
cd spacetime/module
spacetime build
spacetime publish --server maincloud spades-arena
```

Then regenerate TypeScript bindings so the React client sees any schema
changes:

```bash
npm run spacetime:generate
```

## Optional: self-hosted local instance

For offline development you can run a local SpacetimeDB and point the React
client at it.

1. **Run the standalone server:**
   ```bash
   spacetime start
   ```
   Listens on `http://localhost:3000` by default.

2. **Publish your module to it:**
   ```bash
   spacetime publish --server local spades-arena
   ```

3. **Override the React client's connection URI** in `.env.local`:
   ```
   VITE_SPACETIME_URI="http://localhost:3000"
   VITE_SPACETIME_MODULE="spades-arena"
   ```

4. **Restart `npm run dev`.** The client will connect to your local instance
   instead of maincloud. Your maincloud-stored game history will not appear;
   the local instance starts empty.
