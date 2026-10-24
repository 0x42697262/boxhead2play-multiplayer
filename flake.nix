{
  description = "Boxhead: 2Play Rooms in the browser, with the online game server";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      packages = forAllSystems (pkgs: rec {
        boxhead2play = pkgs.callPackage ./nix/package.nix { };
        ffdec = boxhead2play.ffdec;
        default = boxhead2play;
      });

      apps = forAllSystems (pkgs: rec {
        boxhead2play = {
          type = "app";
          program = "${self.packages.${pkgs.stdenv.hostPlatform.system}.boxhead2play}/bin/boxhead2play";
          meta.description = "Serve the game and run the online game server";
        };
        default = boxhead2play;
      });

      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = [
            pkgs.nodejs_24
            pkgs.jre
            pkgs.prefetch-npm-deps
          ];
          FFDEC_JAR = "${self.packages.${pkgs.stdenv.hostPlatform.system}.ffdec}/ffdec.jar";
        };
      });

      nixosModules = rec {
        boxhead2play = import ./nix/module.nix self;
        default = boxhead2play;
      };

      overlays.default = _final: prev: {
        boxhead2play = prev.callPackage ./nix/package.nix { };
      };

      checks = nixpkgs.lib.genAttrs [ "x86_64-linux" "aarch64-linux" ] (system: {
        package = self.packages.${system}.boxhead2play;
        nixos = import ./nix/vmTest.nix self { pkgs = nixpkgs.legacyPackages.${system}; };
      });

      formatter = forAllSystems (pkgs: pkgs.nixfmt);
    };
}
