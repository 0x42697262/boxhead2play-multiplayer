self:
{ pkgs }:
let
  port = 81;
  proxyPort = 8000;
  monitorToken = "vm-test-monitor-token";
  secretsPath = "/etc/boxhead2play/secrets.env";
  missingSecretsPath = "/etc/boxhead2play/missing.env";
  missingFileWarning = "environmentFile ${missingSecretsPath} not found";
in
pkgs.testers.runNixOSTest {
  name = "boxhead2play";

  nodes.machine = {
    imports = [ self.nixosModules.default ];
    virtualisation.memorySize = 1024;
    environment.systemPackages = [ pkgs.jq ];
    environment.etc."boxhead2play/secrets.env".text = "BOXHEAD_MONITOR_TOKEN=${monitorToken}";
    services.boxhead2play = {
      enable = true;
      host = "::";
      inherit port;
      environmentFile = secretsPath;
      caddy = {
        enable = true;
        domain = "http://localhost:${toString proxyPort}";
      };
    };
  };

  nodes.withoutSecrets = {
    imports = [ self.nixosModules.default ];
    virtualisation.memorySize = 1024;
    services.boxhead2play = {
      enable = true;
      inherit port;
      environmentFile = missingSecretsPath;
    };
  };

  testScript = ''
    start_all()
    machine.wait_for_unit("boxhead2play.service")
    machine.wait_for_open_port(${toString port})
    machine.succeed("systemctl show boxhead2play -p Environment | grep -w BOXHEAD_TRUST_PROXY=true")
    machine.succeed("curl -sf http://127.0.0.1:${toString port}/ | grep -i '<html'")
    machine.succeed("curl -sf 'http://[::1]:${toString port}/assets/manifest.json' | jq -e '.formatVersion > 0'")

    machine.wait_for_unit("caddy.service")
    machine.wait_for_open_port(${toString proxyPort})
    machine.succeed("curl -sf http://localhost:${toString proxyPort}/ | grep -i '<html'")
    machine.succeed("curl -sf http://localhost:${toString proxyPort}/assets/manifest.json | jq -e '.formatVersion > 0'")

    machine.succeed(
        "curl -sf -H 'authorization: Bearer ${monitorToken}' http://127.0.0.1:${toString port}/__monitor"
        + " | jq -e '.memory.systemTotal > 0 and .memory.systemFree > 0 and (.loadAverage | length == 3)'"
    )
    machine.fail("curl -sf http://localhost:${toString proxyPort}/__monitor")
    machine.wait_until_succeeds("journalctl -u boxhead2play | grep -F '\"monitor\":true'")
    machine.fail("journalctl -u boxhead2play -p warning | grep -F 'not found'")

    withoutSecrets.wait_for_unit("boxhead2play.service")
    withoutSecrets.wait_for_open_port(${toString port})
    withoutSecrets.succeed("curl -sf http://127.0.0.1:${toString port}/ | grep -i '<html'")
    withoutSecrets.wait_until_succeeds("journalctl -u boxhead2play -p warning | grep -F '${missingFileWarning}'")
    withoutSecrets.wait_until_succeeds("journalctl -u boxhead2play | grep -F '\"monitor\":false'")
    withoutSecrets.fail("curl -sf http://127.0.0.1:${toString port}/__monitor")
  '';
}
