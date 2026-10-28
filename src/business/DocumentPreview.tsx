import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, RefreshCw } from "lucide-react";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { documentOptions, type DocumentOptions } from "./model";
import { DocumentVisibility } from "./DocumentOptions";
import { blobDataUrl } from "./pdf";
import { downloadFile } from "../utils/download";

export interface PreviewRequest {
  filename: string;
  generate: (options: DocumentOptions) => Promise<Blob>;
  options?: Partial<DocumentOptions>;
  editable: boolean;
  allowInternal?: boolean;
  issued?: boolean;
  external?: boolean;
}
export function DocumentPreview({ request }: { request: PreviewRequest }) {
  const [options, setOptions] = useState(() =>
    documentOptions(request.options)
  );
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [rendered, setRendered] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true,
      document: PDFDocumentProxy | undefined,
      task: { destroy: () => Promise<void> } | undefined;
    setLoading(true);
    setRendered(false);
    setBlob(null);
    setPdf(null);
    setPage(1);
    setError("");
    void (async () => {
      try {
        const generated = await request.generate(options);
        if (!live) return;
        const api = await import("pdfjs-dist/legacy/build/pdf.mjs");
        if (!live) return;
        api.GlobalWorkerOptions.workerSrc = workerUrl;
        const loadingTask = api.getDocument({
          data: new Uint8Array(await generated.arrayBuffer()),
          useSystemFonts: true,
          useWasm: false,
        });
        task = loadingTask;
        document = await loadingTask.promise;
        if (!live) {
          await loadingTask.destroy();
          return;
        }
        setBlob(generated);
        setPdf(document);
      } catch (error) {
        if (live)
          setError(
            error instanceof Error &&
              /^(PDF export|Business header|Document footer|[A-Za-z]+: use at most|Quote validity|Document total|Line total|Discount|Use no more|Enter a document reference|Enter a non-negative|Value is too large)/.test(
                error.message
              )
              ? error.message
              : "Could not prepare this PDF preview. Check your logo, document values and connection, then retry."
          );
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
      if (task) void task.destroy().catch(() => {});
    };
  }, [request, options, attempt]);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let live = true;
    let task: RenderTask | undefined;
    setRendered(false);
    void (async () => {
      try {
        const content = await pdf.getPage(page);
        if (!live) return;
        const width = Math.max(
          320,
          Math.min(
            1400,
            (host.current?.clientWidth || 650) *
              Math.min(devicePixelRatio || 1, 2)
          )
        );
        const viewport = content.getViewport({
          scale: width / content.getViewport({ scale: 1 }).width,
        });
        const target = canvas.current;
        if (!target) return;
        target.width = Math.ceil(viewport.width);
        target.height = Math.ceil(viewport.height);
        task = content.render({
          canvas: target,
          viewport,
          background: "#ffffff",
        });
        await task.promise;
        if (live) setRendered(true);
      } catch {
        if (live)
          setError(
            "Could not render this PDF page. Retry the preview before exporting."
          );
      }
    })();
    return () => {
      live = false;
      task?.cancel();
    };
  }, [pdf, page]);
  const change = (next: DocumentOptions) => {
    setRendered(false);
    setBlob(null);
    setOptions(next);
  };
  return (
    <div className="document-preview">
      {request.external ? <p className="business-muted">Externally prepared attachment. Its contents are not verified or changed by the app; document visibility options do not apply.</p> : request.issued ? (
        <p className="business-muted">
          Issued document - original PDF and saved visibility settings.
        </p>
      ) : request.editable ? (
        <DocumentVisibility
          value={options}
          onChange={change}
          allowInternal={request.allowInternal}
        />
      ) : (
        <p className="business-muted">
          Visibility: contact details{" "}
          {options.showContactDetails ? "included" : "excluded"}; payment
          instructions{" "}
          {options.showPaymentInstructions ? "included" : "excluded"}; bank
          details {options.showBankDetails ? "included" : "excluded"}.
        </p>
      )}
      {options.internal && (
        <p className="business-warning">
          INTERNAL EXPORT - contains private business information.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Preparing PDF preview...</p>}
      <div
        className="document-preview-paper"
        ref={host}
        aria-busy={loading || !rendered}
      >
        <canvas
          ref={canvas}
          aria-label={`PDF preview, page ${page}${
            pdf ? ` of ${pdf.numPages}` : ""
          }`}
          role="img"
          style={{ visibility: rendered ? "visible" : "hidden" }}
        />
      </div>
      <footer>
        <button
          title="Previous PDF page"
          aria-label="Previous PDF page"
          disabled={!pdf || page === 1}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={20} />
        </button>
        <span>{pdf ? `${page} / ${pdf.numPages}` : "PDF preview"}</span>
        <button
          title="Next PDF page"
          aria-label="Next PDF page"
          disabled={!pdf || page === pdf.numPages}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={20} />
        </button>
        <button
          title="Retry preview"
          aria-label="Retry preview"
          disabled={loading}
          onClick={() => setAttempt(attempt + 1)}
        >
          <RefreshCw size={18} />
        </button>
        <button
          disabled={!blob || !rendered || loading || exporting}
          onClick={async () => {
            if (!blob) return;
            setExporting(true);
            setError("");
            try {
              const prefix =
                options.internal && !request.issued ? "INTERNAL-" : "";
              const name = (prefix + request.filename)
                .replace(/[^A-Za-z0-9_.-]/g, "_")
                .slice(-150);
              await downloadFile(
                await blobDataUrl(blob),
                name,
                "application/pdf"
              );
            } catch {
              setError(
                "Could not export/share this PDF. Your saved records have not changed."
              );
            } finally {
              setExporting(false);
            }
          }}
        >
          <Download size={18} />
          {exporting ? "Exporting..." : "Export / share PDF"}
        </button>
      </footer>
    </div>
  );
}
