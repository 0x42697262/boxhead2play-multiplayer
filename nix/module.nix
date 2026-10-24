self:
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.boxhead2play;
  inherit (lib)
    mkEnableOption
    mkOption
    mkIf
    mkMerge
    types
    ;
  privilegedPortLimit = 1024;
  bindsPrivilegedPort = cfg.port < privilegedPortLimit;
  wildcardLoopback = {
    "0.0.0.0" = "127.0.0.1";
    "::" = "::1";
  };
  upstreamHost = wildcardLoopback.${cfg.host} or cfg.host;
  upstreamAddress = if lib.hasInfix ":" upstreamHost then "[${upstreamHost}]" else upstreamHost;
  portCapability = "CAP_NET_BIND_SERVICE";
  privilegedExecPrefix = "+";
  optionalFilePrefix = "-";
  journalWarningPrefix = "<4>";
  environmentFileCheck = pkgs.writeShellScript "boxhead2play-environment-file-check" ''
    if [ ! -e ${lib.escapeShellArg cfg.environmentFile} ]; then
      echo ${lib.escapeShellArg "${journalWarningPrefix}boxhead2play: environmentFile ${cfg.environmentFile} not found; starting without it (BOXHEAD_MONITOR_TOKEN unset, /__monitor disabled)"} >&2
    fi
    exit 0
  '';
  limitVariables = {
    socketsPerAddress = "BOXHEAD_MAX_SOCKETS_PER_ADDRESS";
    sessionsPerAddress = "BOXHEAD_MAX_SESSIONS_PER_ADDRESS";
    lobbiesPerAddress = "BOXHEAD_MAX_LOBBIES_PER_ADDRESS";
  };
  limitEnvironment = lib.mapAttrs' (
    name: variable: lib.nameValuePair variable (toString cfg.limits.${name})
  ) (lib.filterAttrs (name: _variable: cfg.limits.${name} != null) limitVariables);
  limitOption =
    what:
    mkOption {
      type = types.nullOr types.ints.unsigned;
      default = null;
      description = ''
        Most ${what} one client address may hold at once; 0 means unlimited. Null keeps the
        server's default (see docs/runtime/online.md).
      '';
    };
in
{
  options.services.boxhead2play = {
    enable = mkEnableOption "the Boxhead: 2Play Rooms web game and online game server";

    package = mkOption {
      type = types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.boxhead2play;
      defaultText = lib.literalExpression "boxhead2play.packages.\${system}.boxhead2play";
      description = "The boxhead2play package to run.";
    };

    host = mkOption {
      type = types.str;
      default = "127.0.0.1";
      description = ''
        Address the server binds to. The default is loopback, reachable only through a
        reverse proxy. Set it to "0.0.0.0" to expose the server directly.
      '';
    };

    port = mkOption {
      type = types.port;
      default = 8080;
      description = "TCP port for the game page, its assets and the WebSocket game server.";
    };

    logLevel = mkOption {
      type = types.enum [
        "debug"
        "info"
        "warn"
        "error"
      ];
      default = "info";
      description = "Minimum level of the JSON log lines written to the journal.";
    };

    trustProxy = mkOption {
      type = types.bool;
      default = cfg.caddy.enable;
      defaultText = lib.literalExpression "config.services.boxhead2play.caddy.enable";
      description = ''
        Take the client address from the last X-Forwarded-For entry (BOXHEAD_TRUST_PROXY)
        instead of the socket. Turn it on only when every request comes through a reverse
        proxy that appends that header; otherwise clients can choose their own address.
      '';
    };

    limits = {
      socketsPerAddress = limitOption "open WebSocket connections";
      sessionsPerAddress = limitOption "sessions, including ones waiting for a reconnect,";
      lobbiesPerAddress = limitOption "open lobbies";
    };

    openFirewall = mkOption {
      type = types.bool;
      default = false;
      description = ''
        Open the firewall: ports 80 and 443 when Caddy is enabled, otherwise
        {option}`port`.
      '';
    };

    extraEnvironment = mkOption {
      type = types.attrsOf types.str;
      default = { };
      description = "Extra environment variables for the service.";
    };

    environmentFile = mkOption {
      type = types.nullOr (
        types.pathWith {
          inStore = false;
          absolute = true;
        }
      );
      default = null;
      example = "/etc/boxhead2play/secrets.env";
      description = ''
        File with KEY=value lines loaded into the service environment, kept out of the
        Nix store. Give it as a string; a path literal or a store path is rejected,
        because it would copy the secret into the world-readable store. Put BOXHEAD_MONITOR_TOKEN (at least 16 characters) here to serve
        /__monitor for `npm run monitor -- --token`.
      '';
    };

    caddy = {
      enable = mkEnableOption "a Caddy reverse proxy with automatic HTTPS for boxhead2play";

      domain = mkOption {
        type = types.str;
        default = "";
        example = "boxhead.example.com";
        description = "Domain Caddy serves the game on. It must resolve to this host.";
      };

      extraConfig = mkOption {
        type = types.lines;
        default = "";
        description = "Extra Caddyfile directives appended inside the site block.";
      };
    };
  };

  config = mkIf cfg.enable (mkMerge [
    {
      assertions = [
        {
          assertion = cfg.caddy.enable -> cfg.caddy.domain != "";
          message = "services.boxhead2play.caddy.domain must be set when caddy is enabled.";
        }
      ];

      systemd.services.boxhead2play = {
        description = "Boxhead: 2Play Rooms web game and online game server";
        wantedBy = [ "multi-user.target" ];
        after = [ "network.target" ];

        environment = {
          PORT = toString cfg.port;
          HOST = cfg.host;
          LOG_LEVEL = cfg.logLevel;
          BOXHEAD_TRUST_PROXY = lib.boolToString cfg.trustProxy;
        }
        // limitEnvironment
        // cfg.extraEnvironment;

        serviceConfig = {
          ExecStart = lib.getExe cfg.package;
          EnvironmentFile = mkIf (cfg.environmentFile != null) "${optionalFilePrefix}${cfg.environmentFile}";
          ExecStartPre = mkIf (cfg.environmentFile != null) "${privilegedExecPrefix}${environmentFileCheck}";
          Restart = "on-failure";
          RestartSec = 2;

          DynamicUser = true;
          AmbientCapabilities = mkIf bindsPrivilegedPort portCapability;
          CapabilityBoundingSet = if bindsPrivilegedPort then portCapability else "";
          NoNewPrivileges = true;
          ProtectSystem = "strict";
          ProtectHome = true;
          PrivateTmp = true;
          PrivateDevices = true;
          ProtectKernelTunables = true;
          ProtectKernelModules = true;
          ProtectControlGroups = true;
          ProtectClock = true;
          ProtectHostname = true;
          ProtectKernelLogs = true;
          ProtectProc = "invisible";
          RestrictRealtime = true;
          RestrictSUIDSGID = true;
          UMask = "0077";
          RestrictAddressFamilies = [
            "AF_INET"
            "AF_INET6"
          ];
          RestrictNamespaces = true;
          LockPersonality = true;
          MemoryDenyWriteExecute = false;
          SystemCallArchitectures = "native";
          SystemCallFilter = [
            "@system-service"
            "~@privileged"
          ];
        };
      };

      networking.firewall = mkIf (cfg.openFirewall && !cfg.caddy.enable) {
        allowedTCPPorts = [ cfg.port ];
      };
    }

    (mkIf cfg.caddy.enable {
      services.caddy.enable = true;
      services.caddy.virtualHosts.${cfg.caddy.domain}.extraConfig = ''
        encode zstd gzip
        reverse_proxy ${upstreamAddress}:${toString cfg.port}
        ${cfg.caddy.extraConfig}
      '';

      networking.firewall = mkIf cfg.openFirewall {
        allowedTCPPorts = [
          80
          443
        ];
      };
    })
  ]);
}
