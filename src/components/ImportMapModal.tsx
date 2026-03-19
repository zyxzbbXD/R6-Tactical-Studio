import { useCallback, useEffect, useRef, useState } from "react";
import { X, Upload, ChevronDown, Image as ImageIcon } from "lucide-react";
import { useSettingsStore } from "../store/useSettingsStore";
import { useCanvasStore } from "../store/canvasStore";
import { t } from "../locales/i18n";
import { cn } from "../utils/cn";
import type { FloorImages } from "../config/assets";

// ─── Constants ─────────────────────────────────────────────────────────────────

type ImageType = keyof FloorImages;

const FLOOR_PRESETS = [
  { id: "b1",   label: "B1"   },
  { id: "1f",   label: "1F"   },
  { id: "2f",   label: "2F"   },
  { id: "3f",   label: "3F"   },
  { id: "roof", label: "Roof" },
];

const IMAGE_TYPES: { value: ImageType; labelKey: string }[] = [
  { value: "default",     labelKey: "img_default"     },
  { value: "blueprint",   labelKey: "img_blueprint"   },
  { value: "isometric",   labelKey: "img_isometric"   },
  { value: "verticality", labelKey: "img_verticality" },
  { value: "roomNames",   labelKey: "img_roomnames"   },
];

// ─── Select atom ──────────────────────────────────────────────────────────────

function StyledSelect({
  value, onChange, children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-xl px-3.5 py-2.5 text-[14px] outline-none pr-8 bg-r6-surface-2 border border-r6-border text-r6-text focus:border-r6-accent"
      >
        {children}
      </select>
      <ChevronDown
        size={13}
        className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-r6-muted"
      />
    </div>
  );
}

// ─── ImportMapModal ────────────────────────────────────────────────────────────

export default function ImportMapModal() {
  const { isImportModalOpen, closeImportModal, language } = useSettingsStore();
  const addCustomMapImage = useCanvasStore((s) => s.addCustomMapImage);

  const [file,         setFile]         = useState<File | null>(null);
  const [previewUrl,   setPreviewUrl]   = useState<string>("");
  const [mapName,      setMapName]      = useState("");
  const [floorId,      setFloorId]      = useState("1f");
  const [customFloor,  setCustomFloor]  = useState("");
  const [imageType,    setImageType]    = useState<ImageType>("default");
  const [isDragging,   setIsDragging]   = useState(false);
  const [error,        setError]        = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!isImportModalOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isImportModalOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const acceptFile = useCallback((f: File) => {
    if (!f.type.startsWith("image/")) {
      setError(t("err_no_file", language));
      return;
    }
    setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return ""; });
    const url = URL.createObjectURL(f);
    setFile(f);
    setPreviewUrl(url);
    setError("");
  }, [language]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) acceptFile(f);
  }, [acceptFile]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) acceptFile(f);
  };

  const handleClose = () => {
    setFile(null);
    setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return ""; });
    setMapName("");
    setFloorId("1f");
    setCustomFloor("");
    setImageType("default");
    setError("");
    closeImportModal();
  };

  const handleSubmit = () => {
    if (!file || !previewUrl) { setError(t("err_no_file", language)); return; }
    const name = mapName.trim();
    if (!name) { setError(t("err_no_mapname", language)); return; }

    const isCustom  = floorId === "_custom_";
    const fId       = isCustom
      ? (customFloor.trim().toLowerCase().replace(/\s+/g, "-") || "custom")
      : floorId;
    const fLabel    = isCustom
      ? (customFloor.trim() || "Custom")
      : (FLOOR_PRESETS.find((f) => f.id === floorId)?.label ?? floorId.toUpperCase());

    addCustomMapImage({ fileUrl: previewUrl, mapName: name, floorId: fId, floorLabel: fLabel, imageType });
    // Transfer URL ownership to the store — don't revoke it
    setFile(null);
    setPreviewUrl("");
    setMapName("");
    setFloorId("1f");
    setCustomFloor("");
    setImageType("default");
    setError("");
    closeImportModal();
  };

  if (!isImportModalOpen) return null;

  const isCustomFloor = floorId === "_custom_";

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 flex items-center justify-center backdrop-blur-sm"
      style={{ zIndex: 10000, background: "rgba(0,0,0,0.6)" }}
      onClick={handleClose}
    >
      {/* Modal panel */}
      <div
        className="flex w-[520px] flex-col rounded-2xl overflow-hidden bg-r6-surface border border-r6-border"
        style={{ boxShadow: "0 32px 80px rgba(0,0,0,0.8)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-r6-border">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-r6-accent-dim border border-r6-accent">
            <Upload size={18} className="text-r6-accent" />
          </div>
          <div className="flex-1">
            <p className="text-[16px] font-semibold text-r6-text">
              {t("import_map_title", language)}
            </p>
            <p className="text-[13px] text-r6-muted">
              {t("import_map_sub", language)}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl transition-colors text-r6-muted hover:bg-r6-surface-3 hover:text-r6-text"
          >
            <X size={17} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-5 px-6 py-6">

          {/* Drop zone */}
          <div
            className={cn(
              "flex flex-col items-center justify-center rounded-xl border-2 border-dashed cursor-pointer overflow-hidden transition-[border-color,background] duration-150",
              isDragging ? "border-r6-accent bg-r6-accent-dim" : "border-r6-border bg-r6-surface-2"
            )}
            style={{ minHeight: 140 }}
            onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragOver={(e)  => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileInput}
            />
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="preview"
                className="max-h-[132px] max-w-full object-contain p-2"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 py-6">
                <ImageIcon size={28} className="text-r6-muted-2" />
                <p className="text-[13px] font-medium text-r6-muted">
                  {t("drag_drop_image", language)}
                </p>
                <p className="text-[12px] text-r6-muted-2">
                  {t("or_click_upload", language)}
                </p>
              </div>
            )}
          </div>

          {/* Map Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[14px] font-medium text-r6-text">
              {t("map_name", language)}
            </label>
            <input
              type="text"
              value={mapName}
              onChange={(e) => setMapName(e.target.value)}
              placeholder={t("map_name_ph", language)}
              spellCheck={false}
              className="w-full rounded-xl px-3.5 py-2.5 text-[14px] outline-none bg-r6-surface-2 border border-r6-border text-r6-text caret-r6-accent focus:border-r6-accent"
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            />
          </div>

          {/* Floor + Image Type — side by side */}
          <div className="flex gap-4">
            {/* Floor */}
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-[14px] font-medium text-r6-text">
                {t("floor_level", language)}
              </label>
              <StyledSelect value={floorId} onChange={setFloorId}>
                {FLOOR_PRESETS.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
                <option value="_custom_">{t("floor_custom", language)}</option>
              </StyledSelect>
              {isCustomFloor && (
                <input
                  type="text"
                  value={customFloor}
                  onChange={(e) => setCustomFloor(e.target.value)}
                  placeholder={t("floor_custom_ph", language)}
                  spellCheck={false}
                  className="w-full rounded-xl px-3.5 py-2 text-[13px] outline-none bg-r6-surface-2 border border-r6-border text-r6-text caret-r6-accent focus:border-r6-accent"
                />
              )}
            </div>

            {/* Image Type */}
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-[14px] font-medium text-r6-text">
                {t("image_type", language)}
              </label>
              <StyledSelect value={imageType} onChange={(v) => setImageType(v as ImageType)}>
                {IMAGE_TYPES.map(({ value, labelKey }) => (
                  <option key={value} value={value}>{t(labelKey, language)}</option>
                ))}
              </StyledSelect>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <p className="text-[13px] text-red-500">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-r6-border bg-r6-surface-2">
          <button
            onClick={handleClose}
            className="rounded-xl px-5 py-2.5 text-[14px] font-medium bg-r6-surface-3 text-r6-muted border border-r6-border hover:text-r6-text"
          >
            {t("Done", language)}
          </button>
          <button
            onClick={handleSubmit}
            className="rounded-xl px-6 py-2.5 text-[14px] font-medium transition-opacity bg-r6-accent text-white hover:opacity-85"
          >
            {t("btn_import", language)}
          </button>
        </div>
      </div>
    </div>
  );
}
