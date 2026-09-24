{
  description = "WCAG Checker Chrome extension development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

  outputs = { self, nixpkgs }:
    let
      systems = [ "aarch64-darwin" "x86_64-darwin" "aarch64-linux" "x86_64-linux" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [ git nodejs_22 pnpm direnv ];
          shellHook = ''
            echo "WCAG Checker: Node $(node --version), pnpm $(pnpm --version)"
          '';
        };
      });
    };
}
