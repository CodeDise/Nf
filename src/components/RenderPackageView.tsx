import React, { useState, useEffect } from "react";
import { Copy, Check, Download, FileCode, Terminal } from "lucide-react";
import JSZip from "jszip";

interface RenderPackageViewProps {
  brandWatermark: string;
  supportId: string;
  accessMode: "TIME_PASS" | "PER_POST";
  shardsCount: number;
}

export const RenderPackageView: React.FC<RenderPackageViewProps> = ({
  brandWatermark,
  supportId,
  accessMode,
  shardsCount,
}) => {
  const [filesMap, setFilesMap] = useState<Record<string, string>>({
    "main.py": "# Loading root main.py...",
    "requirements.txt": "# Loading root requirements.txt...",
    "render.yaml": "# Loading root render.yaml...",
    ".env.example": "# Loading .env.example...",
  });
  const [activeFile, setActiveFile] = useState<string>("main.py");
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    fetch("/api/source-files")
      .then((r) => r.json())
      .then((data) => {
        if (data && data["main.py"]) {
          setFilesMap(data);
        }
      })
      .catch(() => {
        // Keep fallback
      });
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(filesMap[activeFile] || "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadZip = async () => {
    setIsExporting(true);
    try {
      const zip = new JSZip();
      Object.entries(filesMap).forEach(([filename, content]) => {
        zip.file(filename, content);
      });
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cinepulse-autofilter-render-bot.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Architecture & Render Root File Structure Summary */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-wrap items-center justify-between gap-6">
        <div className="space-y-1 max-w-2xl">
          <h3 className="text-lg font-semibold text-white">
            Render-Ready Root-Level Pyrogram Package
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Clean root-level deployment layout (<code className="text-sky-300">main.py</code>,{" "}
            <code className="text-sky-300">requirements.txt</code>,{" "}
            <code className="text-sky-300">render.yaml</code>,{" "}
            <code className="text-sky-300">.env.example</code>) with embedded aiohttp{" "}
            <code className="text-emerald-400">/healthz</code> web listener for zero-downtime Render Web Service hosting.
          </p>
          <div className="text-xs text-slate-400 pt-1 font-mono tabular-nums">
            <span>Watermark: {brandWatermark}</span>
            <span aria-hidden="true"> · </span>
            <span>Support: @{supportId}</span>
            <span aria-hidden="true"> · </span>
            <span>Active Mode: {accessMode}</span>
            <span aria-hidden="true"> · </span>
            <span>MongoDB Shards: {shardsCount}</span>
          </div>
        </div>

        <button
          onClick={handleDownloadZip}
          disabled={isExporting}
          className="px-4 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <Download className="w-4 h-4" />
          <span>{isExporting ? "Bundling Archive..." : "Download Complete Render ZIP"}</span>
        </button>
      </div>

      {/* Code Viewer with Root File Tabs */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 bg-slate-950/60">
          <div className="flex items-center gap-1.5">
            {Object.keys(filesMap).map((fname) => (
              <button
                key={fname}
                onClick={() => setActiveFile(fname)}
                className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  activeFile === fname
                    ? "bg-sky-500 text-slate-950 font-semibold"
                    : "text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800"
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>/{fname}</span>
              </button>
            ))}
          </div>

          <button
            onClick={handleCopy}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied {activeFile}</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy {activeFile}</span>
              </>
            )}
          </button>
        </div>

        <pre className="p-5 text-xs font-mono text-slate-200 overflow-x-auto max-h-[600px] leading-relaxed bg-slate-950/90">
          <code>{filesMap[activeFile]}</code>
        </pre>
      </div>
    </div>
  );
};
