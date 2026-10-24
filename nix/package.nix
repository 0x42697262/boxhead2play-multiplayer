{
  lib,
  buildNpmPackage,
  callPackage,
  nodejs_24,
  jre,
  makeWrapper,
}:

let
  ffdec = callPackage ./ffdec.nix { };
  appDir = "lib/boxhead2play";
in
buildNpmPackage {
  pname = "boxhead2play";
  version = (lib.importJSON ../package.json).version;

  src = ../.;

  npmDepsHash = "sha256-S0K7vUXChQDZFtu/VwS7iK3ceUSzpXPemOCBIkraRBE=";

  nodejs = nodejs_24;

  nativeBuildInputs = [
    makeWrapper
    jre
  ];

  env.FFDEC_JAR = "${ffdec}/ffdec.jar";

  preBuild = ''
    export HOME=$TMPDIR
    npm run setup:assets
  '';

  installPhase = ''
    runHook preInstall

    npm prune --omit=dev --no-audit --no-fund
    find node_modules -mindepth 1 -maxdepth 1 -type d -empty -delete

    mkdir -p $out/${appDir}
    cp -r dist dist-server node_modules package.json $out/${appDir}/

    makeWrapper ${lib.getExe nodejs_24} $out/bin/boxhead2play \
      --add-flags $out/${appDir}/dist-server/main.js \
      --set-default BOXHEAD_STATIC_DIR $out/${appDir}/dist \
      --set-default BOXHEAD_ASSET_DIR $out/${appDir}/dist/assets

    runHook postInstall
  '';

  passthru = { inherit ffdec; };

  meta = {
    description = "Boxhead: 2Play Rooms in the browser, with the online game server";
    homepage = "https://github.com/0x42697262/boxhead2play-multiplayer";
    license = lib.licenses.gpl3Only;
    mainProgram = "boxhead2play";
    platforms = lib.platforms.unix;
  };
}
