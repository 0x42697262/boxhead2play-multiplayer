{
  lib,
  stdenvNoCC,
  fetchurl,
  unzip,
}:

let
  tuning = builtins.readFile ../tools/setup/tuning.ts;
  pinned =
    name:
    let
      found = builtins.match ".*export const ${name} = '([^']+)';.*" tuning;
    in
    if found == null then
      throw "nix/ffdec.nix: ${name} not found in tools/setup/tuning.ts"
    else
      builtins.head found;
  version = pinned "FFDEC_VERSION";
in
stdenvNoCC.mkDerivation {
  pname = "ffdec";
  inherit version;

  src = fetchurl {
    url = "https://github.com/jindrapetrik/jpexs-decompiler/releases/download/version${version}/ffdec_${version}.zip";
    sha256 = pinned "FFDEC_ARCHIVE_SHA256";
  };

  nativeBuildInputs = [ unzip ];
  dontUnpack = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall
    mkdir -p $out
    unzip -q $src -d $out
    test -f $out/ffdec.jar
    runHook postInstall
  '';

  meta = {
    description = "JPEXS Free Flash Decompiler, used at build time to extract the game assets";
    homepage = "https://github.com/jindrapetrik/jpexs-decompiler";
    license = lib.licenses.gpl3Plus;
    sourceProvenance = [ lib.sourceTypes.binaryBytecode ];
    platforms = lib.platforms.all;
  };
}
