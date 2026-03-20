// ─── Types ─────────────────────────────────────────────────────────────────────

export interface FloorImages {
  default: string;
  blueprint?: string;
  isometric?: string;
  verticality?: string;
  roomNames?: string;
  props?: string;
  stairs?: string;
}

export interface FloorConfig {
  id: string;
  label: string;
  images: FloorImages;
}

export interface MapConfig {
  id: string;
  name: string;
  floors: FloorConfig[];
}

export interface OperatorConfig {
  id: string;
  name: string;
  side: "atk" | "def";
  iconPath: string;
}

// ─── Maps ──────────────────────────────────────────────────────────────────────
// Floor order: B1 → 1F → 2F → 3F → Roof (bottom-up, standard R6 convention).
// Asset naming: {floorId}_default.jpg | _blueprint.png | _isometric.webp
// Overlay masks: _overlay_vert.png | _overlay_props.png | _overlay_stairs.png | _overlay_names.png

export const MAPS: MapConfig[] = [
  {
    id: "bank",
    name: "Bank",
    floors: [
      { id: "b1",   label: "B1",   images: { default: "/maps/bank/b1_default.jpg",   blueprint: "/maps/bank/b1_blueprint.png", isometric: "/maps/bank/b1_isometric.webp", props: "/maps/bank/b1_overlay_props.png", stairs: "/maps/bank/b1_overlay_stairs.png" } },
      { id: "1f",   label: "1F",   images: { default: "/maps/bank/1f_default.jpg",   blueprint: "/maps/bank/1f_blueprint.png", isometric: "/maps/bank/1f_isometric.webp", props: "/maps/bank/1f_overlay_props.png", stairs: "/maps/bank/1f_overlay_stairs.png" } },
      { id: "2f",   label: "2F",   images: { default: "/maps/bank/2f_default.jpg",   blueprint: "/maps/bank/2f_blueprint.png", isometric: "/maps/bank/2f_isometric.webp", props: "/maps/bank/2f_overlay_props.png", stairs: "/maps/bank/2f_overlay_stairs.png" } },
      { id: "roof", label: "Roof", images: { default: "/maps/bank/roof_default.jpg" } },
    ],
  },
  {
    id: "border",
    name: "Border",
    floors: [
      { id: "1f",   label: "1F",   images: { default: "/maps/border/1f_default.jpg",   blueprint: "/maps/border/1f_blueprint.png", isometric: "/maps/border/1f_isometric.webp" } },
      { id: "2f",   label: "2F",   images: { default: "/maps/border/2f_default.jpg",   blueprint: "/maps/border/2f_blueprint.png", isometric: "/maps/border/2f_isometric.webp" } },
      { id: "roof", label: "Roof", images: { default: "/maps/border/roof_default.jpg" } },
    ],
  },
  {
    id: "chalet",
    name: "Chalet",
    floors: [
      { id: "b1",   label: "B1",   images: { default: "/maps/chalet/b1_default.jpg",   blueprint: "/maps/chalet/b1_blueprint.png", isometric: "/maps/chalet/b1_isometric.webp", props: "/maps/chalet/b1_overlay_props.png", stairs: "/maps/chalet/b1_overlay_stairs.png" } },
      { id: "1f",   label: "1F",   images: { default: "/maps/chalet/1f_default.jpg",   blueprint: "/maps/chalet/1f_blueprint.png", isometric: "/maps/chalet/1f_isometric.webp", props: "/maps/chalet/1f_overlay_props.png", stairs: "/maps/chalet/1f_overlay_stairs.png" } },
      { id: "2f",   label: "2F",   images: { default: "/maps/chalet/2f_default.jpg",   blueprint: "/maps/chalet/2f_blueprint.png", isometric: "/maps/chalet/2f_isometric.webp", props: "/maps/chalet/2f_overlay_props.png", stairs: "/maps/chalet/2f_overlay_stairs.png" } },
      { id: "roof", label: "Roof", images: { default: "/maps/chalet/roof_default.jpg" } },
    ],
  },
  {
    id: "clubhouse",
    name: "Club House",
    floors: [
      { id: "b1",   label: "B1",   images: { default: "/maps/clubhouse/b1_default.jpg",   blueprint: "/maps/clubhouse/b1_blueprint.png", isometric: "/maps/clubhouse/b1_isometric.webp" } },
      { id: "1f",   label: "1F",   images: { default: "/maps/clubhouse/1f_default.jpg",   blueprint: "/maps/clubhouse/1f_blueprint.png", isometric: "/maps/clubhouse/1f_isometric.webp" } },
      { id: "2f",   label: "2F",   images: { default: "/maps/clubhouse/2f_default.jpg",   blueprint: "/maps/clubhouse/2f_blueprint.png", isometric: "/maps/clubhouse/2f_isometric.webp" } },
      { id: "roof", label: "Roof", images: { default: "/maps/clubhouse/roof_default.jpg" } },
    ],
  },
  {
    id: "consulate",
    name: "Consulate",
    floors: [
      { id: "b1",   label: "B1",   images: { default: "/maps/consulate/b1_default.jpg",   blueprint: "/maps/consulate/b1_blueprint.png", isometric: "/maps/consulate/b1_isometric.webp" } },
      { id: "1f",   label: "1F",   images: { default: "/maps/consulate/1f_default.jpg",   blueprint: "/maps/consulate/1f_blueprint.png", isometric: "/maps/consulate/1f_isometric.webp" } },
      { id: "2f",   label: "2F",   images: { default: "/maps/consulate/2f_default.jpg",   blueprint: "/maps/consulate/2f_blueprint.png", isometric: "/maps/consulate/2f_isometric.webp" } },
      { id: "roof", label: "Roof", images: { default: "/maps/consulate/roof_default.jpg" } },
    ],
  },
  {
    id: "fortress",
    name: "Fortress",
    floors: [
      { id: "1f",   label: "1F",   images: { default: "/maps/fortress/1f_default.jpg",   blueprint: "/maps/fortress/1f_blueprint.png", isometric: "/maps/fortress/1f_isometric.webp" } },
      { id: "2f",   label: "2F",   images: { default: "/maps/fortress/2f_default.jpg",   blueprint: "/maps/fortress/2f_blueprint.png", isometric: "/maps/fortress/2f_isometric.webp" } },
      { id: "roof", label: "Roof", images: { default: "/maps/fortress/roof_default.jpg" } },
    ],
  },
  {
    id: "kafe",
    name: "Kafe Dostoyevsky",
    floors: [
      { id: "1f",   label: "1F",   images: { default: "/maps/kafe/1f_default.jpg",   blueprint: "/maps/kafe/1f_blueprint.png", isometric: "/maps/kafe/1f_isometric.webp" } },
      { id: "2f",   label: "2F",   images: { default: "/maps/kafe/2f_default.jpg",   blueprint: "/maps/kafe/2f_blueprint.png", isometric: "/maps/kafe/2f_isometric.webp" } },
      { id: "3f",   label: "3F",   images: { default: "/maps/kafe/3f_default.jpg",   blueprint: "/maps/kafe/3f_blueprint.png", isometric: "/maps/kafe/3f_isometric.webp" } },
      { id: "roof", label: "Roof", images: { default: "/maps/kafe/roof_default.jpg" } },
    ],
  },
  {
    id: "lair",
    name: "Lair",
    floors: [
      { id: "b1",   label: "B1",   images: { default: "/maps/lair/b1_default.jpg",   blueprint: "/maps/lair/b1_blueprint.png", isometric: "/maps/lair/b1_isometric.webp" } },
      { id: "1f",   label: "1F",   images: { default: "/maps/lair/1f_default.jpg",   blueprint: "/maps/lair/1f_blueprint.png", isometric: "/maps/lair/1f_isometric.webp" } },
      { id: "2f",   label: "2F",   images: { default: "/maps/lair/2f_default.jpg",   blueprint: "/maps/lair/2f_blueprint.png", isometric: "/maps/lair/2f_isometric.webp" } },
      { id: "roof", label: "Roof", images: { default: "/maps/lair/roof_default.jpg" } },
    ],
  },
  {
    id: "nighthavenlabs",
    name: "Nighthaven Labs",
    floors: [
      { id: "b1",   label: "B1",   images: { default: "/maps/nighthavenlabs/b1_default.jpg",   blueprint: "/maps/nighthavenlabs/b1_blueprint.png", isometric: "/maps/nighthavenlabs/b1_isometric.webp" } },
      { id: "1f",   label: "1F",   images: { default: "/maps/nighthavenlabs/1f_default.jpg",   blueprint: "/maps/nighthavenlabs/1f_blueprint.png", isometric: "/maps/nighthavenlabs/1f_isometric.webp" } },
      { id: "2f",   label: "2F",   images: { default: "/maps/nighthavenlabs/2f_default.jpg",   blueprint: "/maps/nighthavenlabs/2f_blueprint.png", isometric: "/maps/nighthavenlabs/2f_isometric.webp" } },
      { id: "roof", label: "Roof", images: { default: "/maps/nighthavenlabs/roof_default.jpg" } },
    ],
  },
];

// ─── Operators ─────────────────────────────────────────────────────────────────

export const OPERATORS: OperatorConfig[] = [
  // ATK
  { id: "ace",        name: "Ace",        side: "atk", iconPath: "/operators/atk/png/ace.png" },
  { id: "amaru",      name: "Amaru",      side: "atk", iconPath: "/operators/atk/png/amaru.png" },
  { id: "ash",        name: "Ash",        side: "atk", iconPath: "/operators/atk/png/ash.png" },
  { id: "blackbeard", name: "Blackbeard", side: "atk", iconPath: "/operators/atk/png/blackbeard.png" },
  { id: "blitz",      name: "Blitz",      side: "atk", iconPath: "/operators/atk/png/blitz.png" },
  { id: "brava",      name: "Brava",      side: "atk", iconPath: "/operators/atk/png/brava.png" },
  { id: "buck",       name: "Buck",       side: "atk", iconPath: "/operators/atk/png/buck.png" },
  { id: "capitao",    name: "Capitão",    side: "atk", iconPath: "/operators/atk/png/capitao.png" },
  { id: "deimos",     name: "Deimos",     side: "atk", iconPath: "/operators/atk/png/deimos.png" },
  { id: "dokkaebi",   name: "Dokkaebi",   side: "atk", iconPath: "/operators/atk/png/dokkaebi.png" },
  { id: "finka",      name: "Finka",      side: "atk", iconPath: "/operators/atk/png/finka.png" },
  { id: "flores",     name: "Flores",     side: "atk", iconPath: "/operators/atk/png/flores.png" },
  { id: "fuze",       name: "Fuze",       side: "atk", iconPath: "/operators/atk/png/fuze.png" },
  { id: "glaz",       name: "Glaz",       side: "atk", iconPath: "/operators/atk/png/glaz.png" },
  { id: "gridlock",   name: "Gridlock",   side: "atk", iconPath: "/operators/atk/png/gridlock.png" },
  { id: "grim",       name: "Grim",       side: "atk", iconPath: "/operators/atk/png/grim.png" },
  { id: "hibana",     name: "Hibana",     side: "atk", iconPath: "/operators/atk/png/hibana.png" },
  { id: "iana",       name: "Iana",       side: "atk", iconPath: "/operators/atk/png/iana.png" },
  { id: "iq",         name: "IQ",         side: "atk", iconPath: "/operators/atk/png/iq.png" },
  { id: "jackal",     name: "Jackal",     side: "atk", iconPath: "/operators/atk/png/jackal.png" },
  { id: "kali",       name: "Kali",       side: "atk", iconPath: "/operators/atk/png/kali.png" },
  { id: "lion",       name: "Lion",       side: "atk", iconPath: "/operators/atk/png/lion.png" },
  { id: "maverick",   name: "Maverick",   side: "atk", iconPath: "/operators/atk/png/maverick.png" },
  { id: "montagne",   name: "Montagne",   side: "atk", iconPath: "/operators/atk/png/montagne.png" },
  { id: "nokk",       name: "Nøkk",       side: "atk", iconPath: "/operators/atk/png/nokk.png" },
  { id: "nomad",      name: "Nomad",      side: "atk", iconPath: "/operators/atk/png/nomad.png" },
  { id: "osa",        name: "Osa",        side: "atk", iconPath: "/operators/atk/png/osa.png" },
  { id: "ram",        name: "Ram",        side: "atk", iconPath: "/operators/atk/png/ram.png" },
  { id: "sens",       name: "Sens",       side: "atk", iconPath: "/operators/atk/png/sens.png" },
  { id: "sledge",     name: "Sledge",     side: "atk", iconPath: "/operators/atk/png/sledge.png" },
  { id: "striker",    name: "Striker",    side: "atk", iconPath: "/operators/atk/png/striker.png" },
  { id: "thatcher",   name: "Thatcher",   side: "atk", iconPath: "/operators/atk/png/thatcher.png" },
  { id: "thermite",   name: "Thermite",   side: "atk", iconPath: "/operators/atk/png/thermite.png" },
  { id: "twitch",     name: "Twitch",     side: "atk", iconPath: "/operators/atk/png/twitch.png" },
  { id: "ying",       name: "Ying",       side: "atk", iconPath: "/operators/atk/png/ying.png" },
  { id: "zero",       name: "Zero",       side: "atk", iconPath: "/operators/atk/png/zero.png" },
  { id: "zofia",      name: "Zofia",      side: "atk", iconPath: "/operators/atk/png/zofia.png" },

  // DEF
  { id: "alibi",       name: "Alibi",       side: "def", iconPath: "/operators/def/png/alibi.png" },
  { id: "aruni",       name: "Aruni",       side: "def", iconPath: "/operators/def/png/aruni.png" },
  { id: "azami",       name: "Azami",       side: "def", iconPath: "/operators/def/png/azami.png" },
  { id: "bandit",      name: "Bandit",      side: "def", iconPath: "/operators/def/png/bandit.png" },
  { id: "castle",      name: "Castle",      side: "def", iconPath: "/operators/def/png/castle.png" },
  { id: "caveira",     name: "Caveira",     side: "def", iconPath: "/operators/def/png/caveira.png" },
  { id: "clash",       name: "Clash",       side: "def", iconPath: "/operators/def/png/clash.png" },
  { id: "denari",      name: "Denal",       side: "def", iconPath: "/operators/def/png/denari.png" },
  { id: "doc",         name: "Doc",         side: "def", iconPath: "/operators/def/png/doc.png" },
  { id: "echo",        name: "Echo",        side: "def", iconPath: "/operators/def/png/echo.png" },
  { id: "ela",         name: "Ela",         side: "def", iconPath: "/operators/def/png/ela.png" },
  { id: "fenrir",      name: "Fenrir",      side: "def", iconPath: "/operators/def/png/fenrir.png" },
  { id: "frost",       name: "Frost",       side: "def", iconPath: "/operators/def/png/frost.png" },
  { id: "goyo",        name: "Goyo",        side: "def", iconPath: "/operators/def/png/goyo.png" },
  { id: "jager",       name: "Jäger",       side: "def", iconPath: "/operators/def/png/jager.png" },
  { id: "kaid",        name: "Kaid",        side: "def", iconPath: "/operators/def/png/kaid.png" },
  { id: "kapkan",      name: "Kapkan",      side: "def", iconPath: "/operators/def/png/kapkan.png" },
  { id: "lesion",      name: "Lesion",      side: "def", iconPath: "/operators/def/png/lesion.png" },
  { id: "maestro",     name: "Maestro",     side: "def", iconPath: "/operators/def/png/maestro.png" },
  { id: "melusi",      name: "Melusi",      side: "def", iconPath: "/operators/def/png/melusi.png" },
  { id: "mira",        name: "Mira",        side: "def", iconPath: "/operators/def/png/mira.png" },
  { id: "mozzie",      name: "Mozzie",      side: "def", iconPath: "/operators/def/png/mozzie.png" },
  { id: "mute",        name: "Mute",        side: "def", iconPath: "/operators/def/png/mute.png" },
  { id: "oryx",        name: "Oryx",        side: "def", iconPath: "/operators/def/png/oryx.png" },
  { id: "pulse",       name: "Pulse",       side: "def", iconPath: "/operators/def/png/pulse.png" },
  { id: "rauora",      name: "Rauora",      side: "def", iconPath: "/operators/def/png/rauora.png" },
  { id: "rook",        name: "Rook",        side: "def", iconPath: "/operators/def/png/rook.png" },
  { id: "sentry",      name: "Sentry",      side: "def", iconPath: "/operators/def/png/sentry.png" },
  { id: "skopos",      name: "Skopos",      side: "def", iconPath: "/operators/def/png/skopos.png" },
  { id: "smoke",       name: "Smoke",       side: "def", iconPath: "/operators/def/png/smoke.png" },
  { id: "solis",       name: "Solis",       side: "def", iconPath: "/operators/def/png/solis.png" },
  { id: "tachanka",    name: "Tachanka",    side: "def", iconPath: "/operators/def/png/tachanka.png" },
  { id: "thorn",       name: "Thorn",       side: "def", iconPath: "/operators/def/png/thorn.png" },
  { id: "thunderbird", name: "Thunderbird", side: "def", iconPath: "/operators/def/png/thunderbird.png" },
  { id: "tubarao",     name: "Tubarão",     side: "def", iconPath: "/operators/def/png/tubarao.png" },
  { id: "valkyrie",    name: "Valkyrie",    side: "def", iconPath: "/operators/def/png/valkyrie.png" },
  { id: "vigil",       name: "Vigil",       side: "def", iconPath: "/operators/def/png/vigil.png" },
  { id: "wamai",       name: "Wamai",       side: "def", iconPath: "/operators/def/png/wamai.png" },
  { id: "warden",      name: "Warden",      side: "def", iconPath: "/operators/def/png/warden.png" },
];

export const ATK_OPERATORS = OPERATORS.filter((op) => op.side === "atk");
export const DEF_OPERATORS = OPERATORS.filter((op) => op.side === "def");

// ─── Gadgets ───────────────────────────────────────────────────────────────────

export interface GadgetConfig {
  id: string;
  name: string;
  iconPath: string;
}

export const GADGETS: GadgetConfig[] = [
  { id: "gadget-barb",           name: "Barb Wire",          iconPath: "/gadgets/Barb.webp"             },
  { id: "gadget-barricade",      name: "Barricade",          iconPath: "/gadgets/Barricade.webp"        },
  { id: "gadget-breach-charge",  name: "Breach Charge",      iconPath: "/gadgets/BreachCharge.webp"     },
  { id: "gadget-defuser",        name: "Defuser",            iconPath: "/gadgets/Defuser.webp"          },
  { id: "gadget-drone",          name: "Drone",              iconPath: "/gadgets/Drone.webp"            },
  { id: "gadget-emp",            name: "EMP Grenade",        iconPath: "/gadgets/EMP.webp"              },
  { id: "gadget-frag-grenade",   name: "Frag Grenade",       iconPath: "/gadgets/FragGrenade.webp"      },
  { id: "gadget-hard-breach",    name: "Hard Breach Charge", iconPath: "/gadgets/HardBreachCharge.webp" },
  { id: "gadget-impact-grenade", name: "Impact Grenade",     iconPath: "/gadgets/ImpactGrenade.webp"    },
  { id: "gadget-nitro-cell",     name: "Nitro Cell",         iconPath: "/gadgets/NitroCell.webp"        },
  { id: "gadget-proximity-mine", name: "Proximity Mine",     iconPath: "/gadgets/ProximityMine.webp"    },
  { id: "gadget-reinforcement",  name: "Reinforcement",      iconPath: "/gadgets/Reinforcement.webp"    },
  { id: "gadget-rotation",       name: "Rotation Shield",    iconPath: "/gadgets/Rotation.webp"         },
  { id: "gadget-shield",         name: "Shield",             iconPath: "/gadgets/Shield.webp"           },
  { id: "gadget-smoke-grenade",  name: "Smoke Grenade",      iconPath: "/gadgets/Smoke.webp"            },
  { id: "gadget-stun-grenade",   name: "Stun Grenade",       iconPath: "/gadgets/StunGrenade.webp"      },
];

// ─── Operator Gadgets ──────────────────────────────────────────────────────────
// Operator-specific gadgets / deployable devices that only certain operators carry.

export const OPERATOR_GADGETS: GadgetConfig[] = [
  { id: "opgadget-azami",         name: "Kiba Barrier",        iconPath: "/gadgets/Azami.webp"         },
  { id: "opgadget-bandit",        name: "Shock Wire",          iconPath: "/gadgets/Bandit.webp"        },
  { id: "opgadget-echo",          name: "Yokai",               iconPath: "/gadgets/Echo.webp"          },
  { id: "opgadget-ela",           name: "Grzmot Mine",         iconPath: "/gadgets/Ela.webp"           },
  { id: "opgadget-fenrir",        name: "F-NATT Mine",         iconPath: "/gadgets/Fenrir.webp"        },
  { id: "opgadget-frost",         name: "Welcome Mat",         iconPath: "/gadgets/Frost.webp"         },
  { id: "opgadget-goyo",          name: "Volcan Shield",       iconPath: "/gadgets/Goyo.webp"          },
  { id: "opgadget-grim",          name: "Hive Launcher",       iconPath: "/gadgets/Grim.webp"          },
  { id: "opgadget-hard-breach",   name: "Hard Breach",         iconPath: "/gadgets/HardBreach.webp"    },
  { id: "opgadget-jager",         name: "ADS",                 iconPath: "/gadgets/Jager.webp"         },
  { id: "opgadget-kaid",          name: "Rtila Claw",          iconPath: "/gadgets/Kaid.webp"          },
  { id: "opgadget-lesion",        name: "Gu Mine",             iconPath: "/gadgets/Lesion.webp"        },
  { id: "opgadget-maestro",       name: "Evil Eye",            iconPath: "/gadgets/Maestro.webp"       },
  { id: "opgadget-melusi",        name: "Banshee",             iconPath: "/gadgets/MelusiBanshee.webp" },
  { id: "opgadget-mozzie",        name: "Pest",                iconPath: "/gadgets/Mozzie.webp"        },
  { id: "opgadget-mute",          name: "Signal Disruptor",    iconPath: "/gadgets/Mute.webp"          },
  { id: "opgadget-nomad",         name: "Airjab Mine",         iconPath: "/gadgets/Nomad.webp"         },
  { id: "opgadget-thorn",         name: "Razorbloom",          iconPath: "/gadgets/Thorn.webp"         },
  { id: "opgadget-thunderbird",   name: "Kóna Station",        iconPath: "/gadgets/Thunderbird.webp"   },
  { id: "opgadget-toxic-canister",name: "Toxic Canister",      iconPath: "/gadgets/ToxicBabe.webp"     },
  { id: "opgadget-tubarao",       name: "Zoto Canister",       iconPath: "/gadgets/Tubarao.webp"       },
  { id: "opgadget-valkyrie",      name: "Black Eye",           iconPath: "/gadgets/Valkyrie.webp"      },
  { id: "opgadget-wamai",         name: "Mag-NET",             iconPath: "/gadgets/Wamai.webp"         },
  { id: "opgadget-zero",          name: "Argus Camera",        iconPath: "/gadgets/Zero.webp"          },
];