// ─── Types ─────────────────────────────────────────────────────────────────────

export interface FloorConfig {
  id: string;
  label: string;
  imagePath: string;
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
// Floor order: B1 → 1F → 2F → Roof (bottom-up, standard R6 convention).
// Replace imagePath values with your actual filenames if they differ.

export const MAPS: MapConfig[] = [
  {
    id: "bank",
    name: "Bank",
    floors: [
      { id: "b1",   label: "B1",   imagePath: "/maps/r6-maps-bank-blueprint-b1.jpg"   },
      { id: "1f",   label: "1F",   imagePath: "/maps/r6-maps-bank-blueprint-1f.jpg"   },
      { id: "2f",   label: "2F",   imagePath: "/maps/r6-maps-bank-blueprint-2f.jpg"   },
      { id: "roof", label: "Roof", imagePath: "/maps/r6-maps-bank-blueprint-roof.jpg" },
    ],
  },
  // ── Placeholders — add floor images when assets are available ──────────────
  {
    id: "border",
    name: "Border",
    floors: [
      { id: "1f", label: "1F", imagePath: "/maps/border-1f.jpg" },
      { id: "2f", label: "2F", imagePath: "/maps/border-2f.jpg" },
    ],
  },
  {
    id: "chalet",
    name: "Chalet",
    floors: [
      { id: "b1", label: "B1",   imagePath: "/maps/chalet-b1.jpg" },
      { id: "1f", label: "1F",   imagePath: "/maps/chalet-1f.jpg" },
      { id: "2f", label: "2F",   imagePath: "/maps/chalet-2f.jpg" },
      { id: "roof", label: "Roof", imagePath: "/maps/chalet-roof.jpg" },
    ],
  },
  {
    id: "clubhouse",
    name: "Club House",
    floors: [
      { id: "b1", label: "B1", imagePath: "/maps/clubhouse-b1.jpg" },
      { id: "1f", label: "1F", imagePath: "/maps/clubhouse-1f.jpg" },
      { id: "2f", label: "2F", imagePath: "/maps/clubhouse-2f.jpg" },
      { id: "roof", label: "Roof", imagePath: "/maps/clubhouse-roof.jpg" },
    ],
  },
  {
    id: "coastline",
    name: "Coastline",
    floors: [
      { id: "1f", label: "1F", imagePath: "/maps/coastline-1f.jpg" },
      { id: "2f", label: "2F", imagePath: "/maps/coastline-2f.jpg" },
    ],
  },
  {
    id: "consulate",
    name: "Consulate",
    floors: [
      { id: "b1",   label: "B1",   imagePath: "/maps/consulate-b1.jpg" },
      { id: "1f",   label: "1F",   imagePath: "/maps/consulate-1f.jpg" },
      { id: "2f",   label: "2F",   imagePath: "/maps/consulate-2f.jpg" },
      { id: "roof", label: "Roof", imagePath: "/maps/consulate-roof.jpg" },
    ],
  },
  {
    id: "kafe",
    name: "Kafe Dostoyevsky",
    floors: [
      { id: "1f",   label: "1F",   imagePath: "/maps/kafe-1f.jpg" },
      { id: "2f",   label: "2F",   imagePath: "/maps/kafe-2f.jpg" },
      { id: "3f",   label: "3F",   imagePath: "/maps/kafe-3f.jpg" },
      { id: "roof", label: "Roof", imagePath: "/maps/kafe-roof.jpg" },
    ],
  },
  {
    id: "oregon",
    name: "Oregon",
    floors: [
      { id: "b1",   label: "B1",   imagePath: "/maps/oregon-b1.jpg" },
      { id: "1f",   label: "1F",   imagePath: "/maps/oregon-1f.jpg" },
      { id: "2f",   label: "2F",   imagePath: "/maps/oregon-2f.jpg" },
      { id: "roof", label: "Roof", imagePath: "/maps/oregon-roof.jpg" },
    ],
  },
  {
    id: "villa",
    name: "Villa",
    floors: [
      { id: "b1", label: "B1", imagePath: "/maps/villa-b1.jpg" },
      { id: "1f", label: "1F", imagePath: "/maps/villa-1f.jpg" },
      { id: "2f", label: "2F", imagePath: "/maps/villa-2f.jpg" },
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