# Nix flake

The repository is a Nix flake (`flake.nix`, `nix/`).

| Output | What it is |
|---|---|
| `packages.<system>.boxhead2play` (`default`) | The built game: `dist/` (client and extracted assets), `dist-server/` and the production `node_modules` (`ws`, `zod`), with a `boxhead2play` launcher. |
| `packages.<system>.ffdec` | The pinned JPEXS FFDec release, unpacked. Build-time only. |
| `apps.<system>.default` | `nix run` starts the server (`PORT` 8080, `HOST` 0.0.0.0 unless set). |
| `devShells.<system>.default` | Node.js 24, a Java 21 runtime, `prefetch-npm-deps`, and `FFDEC_JAR` pointing at the Nix FFDec, so `npm run dev` never downloads FFDec. |
| `nixosModules.default` | `services.boxhead2play`. |
| `overlays.default` | Adds `pkgs.boxhead2play`. |
| `checks.<linux>.package` | `nix flake check` builds the package. |
| `checks.<linux>.nixos` | A NixOS VM test (`nix/vmTest.nix`, needs KVM): the service on port 81 bound to `::`, Caddy in front on `http://localhost:8000`; it curls `/`, `/assets/manifest.json` directly and through Caddy, and `/__monitor` with the token from `environmentFile`. |
| `formatter` | `nix fmt` runs nixfmt. |

## How the package builds

`buildNpmPackage` with `nodejs_24`. Nix builds run without network, so the setup step
cannot download FFDec itself:

* `nix/ffdec.nix` fetches the FFDec release zip with `fetchurl`. It reads
  `FFDEC_VERSION` and `FFDEC_ARCHIVE_SHA256` from `tools/setup/tuning.ts` with
  `builtins.match`, so the npm setup and Nix always pin the same archive. Renaming those
  constants or changing their quoting breaks the evaluation with a clear message.
* The package sets `FFDEC_JAR` to that jar, puts a JRE in `nativeBuildInputs` and sets
  `HOME=$TMPDIR` (FFDec writes its configuration under the home directory). `preBuild` runs
  `npm run setup:assets`, which extracts the assets inside the sandbox, then `npm run build`
  builds the client and the server.
* `installPhase` prunes dev dependencies, removes the empty scope directories `npm prune`
  leaves behind, and wraps `node dist-server/main.js` with `BOXHEAD_STATIC_DIR` and
  `BOXHEAD_ASSET_DIR` defaulting to the store paths (`--set-default`, so they can still be
  overridden).
* Java and FFDec are not in the runtime closure (about 222 MiB, almost all Node.js).

`src = ../.` contains only git-tracked files, so `public/assets`, `re/`, `.cache/` and
`node_modules` from the working tree never leak into the build. New files must be
`git add`ed before Nix sees them.

### Dependency hash

`npmDepsHash` in `nix/package.nix` must change whenever `package-lock.json` changes:

```sh
nix develop -c prefetch-npm-deps package-lock.json
```

Paste the printed hash into `nix/package.nix`.

## NixOS module

```nix
{
  inputs.boxhead2play.url = "github:0x42697262/boxhead2play-multiplayer";

  outputs = { nixpkgs, boxhead2play, ... }: {
    nixosConfigurations.myhost = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        boxhead2play.nixosModules.default
        {
          services.boxhead2play = {
            enable = true;
            caddy.enable = true;
            caddy.domain = "boxhead.example.com";
            openFirewall = true;
          };
        }
      ];
    };
  };
}
```

| Option | Default | Meaning |
|---|---|---|
| `enable` | `false` | Run the server as a systemd service. |
| `package` | this flake's package | The package to run. |
| `host` | `127.0.0.1` | Bind address (`HOST`). Loopback is meant for a reverse proxy; use `0.0.0.0` to expose it directly. Caddy proxies a wildcard bind (`0.0.0.0`, `::`) through loopback (`127.0.0.1`, `[::1]`) and puts IPv6 addresses in brackets. |
| `port` | `8080` | Port for the page, the assets and the WebSocket server at `/ws` (`PORT`). Below 1024 the service gets `CAP_NET_BIND_SERVICE` (ambient and bounding set) and no other capability. |
| `logLevel` | `info` | `LOG_LEVEL`: `debug`, `info`, `warn` or `error`. |
| `openFirewall` | `false` | Opens 80 and 443 with Caddy, otherwise `port`. |
| `extraEnvironment` | `{}` | Extra environment variables. They end up in the world-readable Nix store, so no secrets. |
| `environmentFile` | `null` | Absolute path on the host, given as a string, with `KEY=value` lines, for example `BOXHEAD_MONITOR_TOKEN`. systemd reads it as root before starting the service. A missing file is skipped, so the game still starts, only without the monitor. The type is `pathWith { inStore = false; absolute = true; }`: a path literal (`/etc/x` without quotes, `./secrets.env`) or a store path fails the evaluation, because interpolating a path literal copies the file into the world-readable Nix store. |
| `caddy.enable` | `false` | Caddy reverse proxy with automatic HTTPS. Caddy proxies WebSocket upgrades on its own. |
| `caddy.domain` | `""` | Required with Caddy. |
| `caddy.extraConfig` | `""` | Appended inside the Caddy site block. |

The server keeps lobbies in memory and writes nothing, so the service runs as a
`DynamicUser` in a systemd sandbox (`ProtectSystem=strict`,
`ProtectHome`, `PrivateTmp`, a `@system-service` syscall filter, IPv4/IPv6 sockets only,
an empty capability bounding set, `ProtectClock`, `ProtectHostname`, `ProtectKernelLogs`,
`ProtectProc=invisible`, `RestrictRealtime`, `RestrictSUIDSGID`, `UMask=0077`).
`MemoryDenyWriteExecute` stays off because V8 compiles JIT code. `ProcSubset=pid` stays off
because it hides `/proc/meminfo`: Node's `os.freemem()` then falls back to `sysinfo()` free
RAM without the page cache, and the monitor's MEM row would show far less free memory than
the host has.

There are no abuse-limit options: this server has no environment variables for them yet. Add options here once `src/config/serverEnv.ts` reads them.

### Monitor on a deployed server

```sh
sudo install -d -m 700 /etc/boxhead2play
echo "BOXHEAD_MONITOR_TOKEN=$(openssl rand -hex 24)" | sudo tee /etc/boxhead2play/secrets.env
sudo chmod 600 /etc/boxhead2play/secrets.env
```

Set `services.boxhead2play.environmentFile = "/etc/boxhead2play/secrets.env";`, rebuild, then
from any machine: `npm run monitor -- --url https://boxhead.example.com --token <token>`.
Caddy forwards `/__monitor` like every other path.

## Verified (2026-10-23, Nix 2.34.7, nixpkgs nixos-unstable 02c087f)

* `nix build` succeeds in the sandbox in about 3.5 minutes on first build. The log shows the
  asset extraction running offline.
* `PORT=8391 HOST=127.0.0.1 ./result/bin/boxhead2play` logs `server.started` with 18 rooms.
  The page loads to the main menu in Firefox, `/assets/manifest.json` is served, and `/ws`
  answers a WebSocket upgrade with `101 Switching Protocols`.
* `nix develop` provides Node v24.21.0, OpenJDK 21.0.12 and an existing `FFDEC_JAR`.
* `nix flake check` passes. A test `nixosSystem` with Caddy enabled evaluates to the
  expected `ExecStart`, environment, firewall ports 80/443 and Caddy site.

## Verified (2026-10-24, Nix 2.34.7, nixpkgs nixos-unstable 02c087f)

* `nix build -L .#checks.x86_64-linux.nixos` passes in about 2 minutes: the service binds port
  81 on `::` with only `CAP_NET_BIND_SERVICE`, Caddy reaches it at `[::1]:81`, and the
  monitor reports nonzero `systemTotal`, `systemFree` and three load averages under
  `ProtectProc=invisible`.
