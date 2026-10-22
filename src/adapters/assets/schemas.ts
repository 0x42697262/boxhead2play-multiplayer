import { z } from 'zod';

export const ASSET_FORMAT_VERSION = 1;

const formatVersion = z.literal(ASSET_FORMAT_VERSION);
const characterId = z.number().int().nonnegative();
const numericKey = z.string().regex(/^\d+$/);
const relativePath = z.string().min(1);
const SHA256_HEX = /^[0-9a-f]{64}$/;
const sha256 = z.string().regex(SHA256_HEX);

export const PixelRectSchema = z.object({
  xMin: z.number(),
  yMin: z.number(),
  xMax: z.number(),
  yMax: z.number(),
});
export type PixelRect = z.infer<typeof PixelRectSchema>;

export const PointSchema = z.object({ x: z.number(), y: z.number() });
export type Point = z.infer<typeof PointSchema>;

export const PixelMatrixSchema = z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]);
export type PixelMatrix = z.infer<typeof PixelMatrixSchema>;

export const RgbaSchema = z.object({
  r: z.number().int(),
  g: z.number().int(),
  b: z.number().int(),
  a: z.number().int(),
});
export type Rgba = z.infer<typeof RgbaSchema>;

export const ColorTransformSchema = z.object({
  rMult: z.number(),
  gMult: z.number(),
  bMult: z.number(),
  aMult: z.number(),
  rAdd: z.number(),
  gAdd: z.number(),
  bAdd: z.number(),
  aAdd: z.number(),
});
export type ColorTransform = z.infer<typeof ColorTransformSchema>;

export const FilterTypeSchema = z.enum([
  'dropShadow',
  'blur',
  'glow',
  'bevel',
  'gradientGlow',
  'gradientBevel',
  'convolution',
  'colorMatrix',
]);
export const FilterSchema = z.looseObject({ type: FilterTypeSchema });
export type Filter = z.infer<typeof FilterSchema>;

export const DisplayItemSchema = z.object({
  depth: z.number().int(),
  characterId,
  instance: z.number().int().nonnegative(),
  matrix: PixelMatrixSchema,
  name: z.string().optional(),
  colorTransform: ColorTransformSchema.optional(),
  filters: z.array(FilterSchema).optional(),
  clipDepth: z.number().int().optional(),
  blendMode: z.number().int().optional(),
  ratio: z.number().int().optional(),
  visible: z.boolean().optional(),
  hasClipActions: z.boolean().optional(),
});
export type DisplayItem = z.infer<typeof DisplayItemSchema>;

export const GraphicSchema = z.object({ bounds: PixelRectSchema, svg: relativePath });
export type Graphic = z.infer<typeof GraphicSchema>;

export const TimelineSoundSchema = z.object({
  characterId,
  syncStop: z.boolean(),
  syncNoMultiple: z.boolean(),
  loopCount: z.number().int().optional(),
});
export type TimelineSound = z.infer<typeof TimelineSoundSchema>;

export const SpriteSchema = z.object({
  frameCount: z.number().int().nonnegative(),
  labels: z.record(z.string(), z.number().int().nonnegative()).optional(),
  frames: z.array(z.array(DisplayItemSchema)),
  frameBounds: z.array(PixelRectSchema.nullable()),
  frameSounds: z.record(numericKey, z.array(TimelineSoundSchema)).optional(),
  scripts: z.record(numericKey, z.string()).optional(),
  selfHidden: z.boolean().optional(),
});
export type Sprite = z.infer<typeof SpriteSchema>;

export const MorphShapeSchema = z.object({
  startBounds: PixelRectSchema,
  endBounds: PixelRectSchema,
  ratios: z.record(numericKey, GraphicSchema),
});
export type MorphShape = z.infer<typeof MorphShapeSchema>;

export const StaticTextSchema = z.object({
  bounds: PixelRectSchema,
  svg: relativePath,
  text: z.string(),
  fontIds: z.array(characterId),
});
export type StaticText = z.infer<typeof StaticTextSchema>;

export const TextAlignSchema = z.enum(['left', 'right', 'center', 'justify']);
export type TextAlign = z.infer<typeof TextAlignSchema>;

export const EditTextSchema = z.object({
  bounds: PixelRectSchema,
  variableName: z.string(),
  fontId: characterId.optional(),
  fontSize: z.number().optional(),
  color: RgbaSchema.optional(),
  align: TextAlignSchema.optional(),
  leftMargin: z.number().optional(),
  rightMargin: z.number().optional(),
  indent: z.number().optional(),
  leading: z.number().optional(),
  maxLength: z.number().int().optional(),
  initialText: z.string().optional(),
  wordWrap: z.boolean(),
  multiline: z.boolean(),
  password: z.boolean(),
  readOnly: z.boolean(),
  autoSize: z.boolean(),
  noSelect: z.boolean(),
  border: z.boolean(),
  wasStatic: z.boolean(),
  html: z.boolean(),
  useOutlines: z.boolean(),
});
export type EditText = z.infer<typeof EditTextSchema>;

export const ButtonStateSchema = z.enum(['up', 'over', 'down', 'hitTest']);
export type ButtonState = z.infer<typeof ButtonStateSchema>;

export const ButtonSchema = z.object({
  trackAsMenu: z.boolean(),
  bounds: PixelRectSchema.nullable(),
  records: z.array(
    z.object({
      states: z.array(ButtonStateSchema),
      characterId,
      depth: z.number().int(),
      matrix: PixelMatrixSchema,
      colorTransform: ColorTransformSchema.optional(),
      filters: z.array(FilterSchema).optional(),
      blendMode: z.number().int().optional(),
    }),
  ),
  conditions: z.array(z.array(z.string())),
});
export type Button = z.infer<typeof ButtonSchema>;

export const SymbolsCatalogSchema = z.object({
  formatVersion,
  stage: z.object({ width: z.number(), height: z.number(), frameRate: z.number() }),
  exports: z.record(z.string(), characterId),
  classes: z.record(z.string(), z.string()),
  shapes: z.record(numericKey, GraphicSchema),
  morphShapes: z.record(numericKey, MorphShapeSchema),
  texts: z.record(numericKey, StaticTextSchema),
  editTexts: z.record(numericKey, EditTextSchema),
  buttons: z.record(numericKey, ButtonSchema),
  sprites: z.record(numericKey, SpriteSchema),
  root: SpriteSchema,
});
export type SymbolsCatalog = z.infer<typeof SymbolsCatalogSchema>;

export const InitKindSchema = z.enum([
  'CollisionSolid',
  'Wall',
  'Barrel',
  'Zombie',
  'Devil',
  'Player1',
  'Player2',
  'Pickup',
  'Piece',
]);
export type InitKind = z.infer<typeof InitKindSchema>;

export const RoomInitObjectSchema = z.object({
  order: z.number().int().nonnegative(),
  kind: InitKindSchema,
  linkage: z.string(),
  characterId,
  instancePath: z.array(z.number().int()),
  name: z.string().optional(),
  position: PointSchema,
  position2: PointSchema,
  rotationDegrees: z.number(),
});
export type RoomInitObject = z.infer<typeof RoomInitObjectSchema>;

export const RoomPieceSchema = z.object({
  order: z.number().int().nonnegative(),
  linkage: z.string(),
  characterId,
  position: PointSchema,
  coverCharacterId: characterId.nullable(),
  coverPosition: PointSchema.nullable(),
});
export type RoomPiece = z.infer<typeof RoomPieceSchema>;

export const RoomSchema = z.object({
  formatVersion,
  id: z.string(),
  characterId,
  size: z.object({ width: z.number().positive(), height: z.number().positive() }),
  background: z.array(DisplayItemSchema),
  pieces: z.array(RoomPieceSchema),
  initObjects: z.array(RoomInitObjectSchema),
  hiddenCharacterIds: z.array(characterId),
});
export type Room = z.infer<typeof RoomSchema>;

export const RoomIndexSchema = z.object({
  formatVersion,
  rooms: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      id: z.string(),
      file: relativePath,
      name: z.string(),
      iconFrame: z.number().int().nonnegative(),
      exclusive: z.object({ single: z.boolean(), coop: z.boolean(), deathMatch: z.boolean() }),
    }),
  ),
});
export type RoomIndex = z.infer<typeof RoomIndexSchema>;

export const XsiVectorSchema = z.strictObject({ mX: z.number(), mY: z.number(), mZ: z.number() });
export type XsiVector = z.infer<typeof XsiVectorSchema>;

export const XsiTextureMatrixSchema = z.strictObject({
  a: z.number(),
  b: z.number(),
  c: z.number(),
  d: z.number(),
  tx: z.number(),
  ty: z.number(),
});

export const XsiModelSchema = z.strictObject({
  Empty: z.boolean().optional(),
  Shape_vList: z.array(z.array(z.number())).optional(),
  Shape_Material: z.array(z.string()).optional(),
  Shape_Matrix: z.array(z.union([z.literal(0), XsiTextureMatrixSchema])).optional(),
  Shape_Brightness: z.array(z.number()).optional(),
  Shadow: z.array(z.array(z.number())).optional(),
  PEdge: z.array(z.array(z.number())).optional(),
  Edge: z.array(z.array(z.number())).optional(),
  XSIInfo: z.strictObject({ vPosition: XsiVectorSchema }).optional(),
});
export type XsiModel = z.infer<typeof XsiModelSchema>;

export const XsiFrameSchema = z.strictObject({ Models: z.record(z.string(), XsiModelSchema) });
export type XsiFrame = z.infer<typeof XsiFrameSchema>;

export const XsiMaterialSchema = z.strictObject({
  mColor: z.number().int().optional(),
  mAlpha: z.number().optional(),
  mThickness: z.number().optional(),
  mcLinkID: z.string().optional(),
  mSize: z.strictObject({ x: z.number(), y: z.number() }).optional(),
});
export type XsiMaterial = z.infer<typeof XsiMaterialSchema>;

export const XsiSetSchema = z.object({
  groupId: z.string(),
  animId: z.string(),
  frameSequence: z.array(z.number().int().nonnegative()).optional(),
  renderPartner: z.string().optional(),
  tilt: z.number(),
  light: XsiVectorSchema,
  materials: z.record(z.string(), XsiMaterialSchema),
  directions: z.array(z.array(XsiFrameSchema)),
});
export type XsiSet = z.infer<typeof XsiSetSchema>;

export const XsiCatalogSchema = z.object({
  formatVersion,
  globalScale: z.number().positive(),
  setOrder: z.array(z.string()),
  materials: z.record(z.string(), XsiMaterialSchema),
  textureLinkages: z.record(z.string(), z.object({ characterId: characterId.nullable(), usedBy: z.array(z.string()) })),
  sets: z.record(z.string(), XsiSetSchema),
});
export type XsiCatalog = z.infer<typeof XsiCatalogSchema>;

export const Vector3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });
export type Vector3 = z.infer<typeof Vector3Schema>;

export const AnimAnchorsSchema = z.object({
  Hand_Right: Vector3Schema.optional(),
  Hand_Left: Vector3Schema.optional(),
  GunPosition_Right: Vector3Schema.optional(),
});
export type AnimAnchors = z.infer<typeof AnimAnchorsSchema>;

export const AnimMetaSchema = z.object({
  formatVersion,
  globalScale: z.number().positive(),
  sets: z.record(
    z.string(),
    z.object({
      groupId: z.string(),
      animId: z.string(),
      directionCount: z.number().int().positive(),
      frameCount: z.number().int().positive(),
      sourceFrameCount: z.number().int().positive(),
      frameSequence: z.array(z.number().int().nonnegative()).optional(),
      renderPartner: z.string().optional(),
      tilt: z.number(),
      anchors: z.array(z.array(AnimAnchorsSchema)),
    }),
  ),
});
export type AnimMeta = z.infer<typeof AnimMetaSchema>;

export const SoundEntrySchema = z.object({
  file: relativePath,
  characterId,
  source: z.enum(['export', 'timeline']),
  linkage: z.string().optional(),
  sampleCount: z.number().int().nonnegative(),
  sampleRate: z.number().int().positive(),
  stereo: z.boolean(),
  timelineStarts: z
    .array(z.object({ spriteId: characterId, frame: z.number().int().nonnegative(), owner: z.string() }))
    .optional(),
});
export type SoundEntry = z.infer<typeof SoundEntrySchema>;

export const SoundRegistrationSchema = z.object({
  table: z.string(),
  key: z.string(),
  type: z.enum(['sfx', 'music']),
  linkage: z.string(),
  volume: z.number(),
  playback: z.enum(['positional', 'normal']),
});
export type SoundRegistration = z.infer<typeof SoundRegistrationSchema>;

export const SoundIndexSchema = z.object({
  formatVersion,
  sounds: z.record(z.string(), SoundEntrySchema),
  registrations: z.array(SoundRegistrationSchema),
});
export type SoundIndex = z.infer<typeof SoundIndexSchema>;

export const FontIndexSchema = z.object({
  formatVersion,
  fonts: z.record(
    numericKey,
    z.object({
      name: z.string(),
      bold: z.boolean(),
      italic: z.boolean(),
      file: relativePath,
      codePoints: z.array(z.number().int().nonnegative()),
    }),
  ),
});
export type FontIndex = z.infer<typeof FontIndexSchema>;

export const ManifestSchema = z.object({
  formatVersion,
  source: z.object({ file: z.string(), bytes: z.number().int().positive(), sha256 }),
  generator: z.string(),
  catalogs: z.object({
    symbols: relativePath,
    roomIndex: relativePath,
    rooms: z.array(relativePath),
    xsi: relativePath,
    animMeta: relativePath,
    sounds: relativePath,
    fonts: relativePath,
  }),
  files: z.array(
    z.object({ path: relativePath, bytes: z.number().int().nonnegative(), sha256 }),
  ),
});
export type Manifest = z.infer<typeof ManifestSchema>;
