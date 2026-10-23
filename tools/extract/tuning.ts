export const TWIPS_PER_PIXEL = 20;
export const FIXED_16_16_ONE = 65536;
export const COLOR_TRANSFORM_FIXED_ONE = 256;
export const OPAQUE_ALPHA = 255;
export const MORPH_RATIO_MAX = 65535;
export const RADIANS_TO_DEGREES = 180 / Math.PI;

export const FFDEC_XML_MAJOR_VERSION = '4';
export const FFDEC_JAVA_OPTIONS = ['-Djava.awt.headless=true'] as const;
export const FFDEC_DEOBFUSCATION_CONFIG = 'autoDeobfuscate=1,as12DeobfuscatorExecutionLimit=1000000';
export const FFDEC_EXPORT_TYPES = 'shape,morphshape,text,sound,font,script';
export const FFDEC_EXPORT_FORMATS = 'shape:svg,morphshape:svg,text:svg,font:woff,sound:mp3_wav,script:as';

export const DEFAULT_SWF_PATH = 'boxhead2play.swf';
export const DEFAULT_ASSET_OUT_DIR = 'public/assets';
export const WORK_DIR_PREFIX = 'boxhead2play-extract-';

export const WorkPath = {
  SwfXml: 'swf.xml',
  Export: 'export',
  Shapes: 'export/shapes',
  MorphShapes: 'export/morphshapes',
  Texts: 'export/texts',
  Sounds: 'export/sounds',
  Fonts: 'export/fonts',
  Scripts: 'export/scripts',
} as const;

export const OutputPath = {
  Manifest: 'manifest.json',
  Symbols: 'library/symbols.json',
  LibraryDir: 'library',
  ShapesDir: 'shapes',
  TextsDir: 'texts',
  MorphsDir: 'morphs',
  RoomsDir: 'rooms',
  RoomIndex: 'rooms/index.json',
  Xsi: 'characters/xsi.json',
  AnimMeta: 'characters/anim-meta.json',
  SoundsDir: 'sounds',
  SoundIndex: 'sounds/index.json',
  FontsDir: 'fonts',
  FontIndex: 'fonts/index.json',
} as const;

export const ScriptPath = {
  Packages: '__Packages',
  SelectWorld: '__Packages/Screen/CScreen_SelectWorld.as',
  Sound: '__Packages/CSound.as',
  XsiBase: '__Packages/DrawPrimitive/XSI/CDrawPrimitive_XSI.as',
  XsiStyleSheet: '__Packages/DrawPrimitive/XSI/CDrawPrimitive_XSI_StyleSheet.as',
} as const;

export const XSI_DATA_MARKER = '_global.mXSI_Data';
export const XSI_MODELS_WITH_ANCHORS = ['Hand_Right', 'Hand_Left', 'GunPosition_Right'] as const;

export const INIT_CLASS_PREFIX = 'World.Init.CWorld_Init_';
export const PIECE_INIT_KIND = 'Piece';
export const COVER_INSTANCE_NAME = '_Cover';
export const ROOM_SIZE_INSTANCE_NAME = '_Size';
export const ROOM_LINKAGE_PATTERN = /^ROOM_Single_(\d{4})$/;
export const ROOM_LINKAGE_PREFIX = 'ROOM_Single_';
export const ROOM_NUMBER_DIGITS = 4;
export const LEVEL_ICONS_LINKAGE = 'LevelIcons_Single';
export const EXPECTED_ROOM_COUNT = 18;
export const EXCLUSIVE_MODES = { single: 'Single', coop: 'Coop', deathMatch: 'DeathMatch' } as const;

export const SOUND_LINKAGE_SUFFIX = '.wav';
export const SOUND_FILE_EXTENSION = '.mp3';
export const TIMELINE_SOUND_ID_SEPARATOR = '.';
export const TIMELINE_SOUND_PREFIX = 'Sound';
export const FONT_FILE_EXTENSION = '.woff';
export const SVG_FILE_EXTENSION = '.svg';
export const SCRIPT_FILE_EXTENSION = '.as';
export const MANIFEST_JSON_INDENT = 1;

export const REQUIRED_EXPORTS = [
  'Screen_Intro',
  'Screen_Main',
  'Screen_SelectWorld',
  'Screen_LoadingWorld',
  'Screen_Debrief',
  'Screen_Debrief_Winner',
  'SubScreen_Single',
  'SubScreen_Coop',
  'SubScreen_DeathMatch',
  'LevelIcons_Single',
  'HUD.Paused',
  'Hud.Message',
  'HUD.Player',
  'Hud.Score',
  'Hud.ScoreTotal',
  'Hud_PlayerFrags',
  'World',
] as const;

export const SCRIPT_NOISE_LINE = /^var §[^§]*§ = -?\d+;$/;
export const SELF_HIDE_STATEMENT = '_visible = false;';

export const DEBUG_DEFAULT_ROOMS = ['ROOM_Single_0001', 'ROOM_Single_0002'] as const;
export const DEBUG_DIR_PREFIX = 'boxhead2play-debug-';
export const FFDEC_SPRITE_DIRECTORY_PREFIX = 'DefineSprite_';

export const PipelineStep = {
  SwfToXml: 'ffdec.swf2xml',
  Export: 'ffdec.export',
  Parse: 'parse',
  Build: 'build',
  Write: 'write',
} as const;
