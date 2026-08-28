/**
 * Smart-upload HTMX fragment for /mcp-ui.
 * Canonical copy — keep examples/mcp-api-adapter/pixeldrop/file-upload-smart.htmx.html in sync.
 *
 * Deliberate client-side JS exception: convert/resize/drag before hx-post.
 */

import { escapeMcpUiHtml } from "./mcp-ui-form.js";

/** Placeholders: {{toolName}}, {{basePath}} */
export const SMART_UPLOAD_HTML_FRAGMENT = `<div class="mcp-ui-smart-upload" id="smart-upload-{{toolName}}">
  <style>
    .mcp-ui-smart-upload .drop-zone {
      border: 2px dashed #6b7280;
      border-radius: 8px;
      padding: 32px;
      text-align: center;
      color: #6b7280;
      transition: border-color 0.15s, background-color 0.15s;
    }
    .mcp-ui-smart-upload .drop-zone.drag-active {
      border-color: #2563eb;
      background-color: #eff6ff;
      color: #2563eb;
    }
    .mcp-ui-smart-upload .preview {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-top: 12px;
    }
    .mcp-ui-smart-upload .preview img {
      width: 64px;
      height: 64px;
      object-fit: cover;
      border-radius: 6px;
    }
    .mcp-ui-smart-upload .conversion-note {
      font-size: 12px;
      color: #059669;
      margin-top: 4px;
    }
    .mcp-ui-smart-upload .field-help {
      overflow-wrap: break-word;
      word-break: break-word;
      font-size: 13px;
      color: #6b7280;
    }
    .mcp-ui-smart-upload .result--error {
      background: #fef2f2;
      color: #991b1b;
      padding: 10px 14px;
      border-radius: 6px;
      margin-top: 12px;
    }
  </style>

  <div class="drop-zone" id="drop-zone-{{toolName}}">
    <p>Drop an image anywhere in this box — HEIC, AVIF, oversized photos,
       all handled automatically.</p>
    <input type="file" id="file-input-{{toolName}}"
           accept="image/*,.heic,.heif,.avif"
           style="display:none">
    <button type="button" class="submit" style="margin-top:0.5rem"
            onclick="document.getElementById('file-input-{{toolName}}').click()">
      Or click to choose a file
    </button>
  </div>

  <div class="preview" id="preview-{{toolName}}" style="display:none">
    <img id="preview-img-{{toolName}}" alt="Preview">
    <div>
      <div id="preview-filename-{{toolName}}"></div>
      <div class="conversion-note" id="conversion-note-{{toolName}}"></div>
    </div>
  </div>

  <form hx-post="{{basePath}}/execute/{{toolName}}"
        hx-target="#result-{{toolName}}"
        hx-swap="innerHTML"
        hx-encoding="multipart/form-data"
        id="upload-form-{{toolName}}">
    <input type="hidden" name="file" id="processed-file-{{toolName}}">
    <input type="hidden" name="filename" id="processed-filename-{{toolName}}">
    <label class="field-help">Caption (optional)</label>
    <input type="text" name="caption" placeholder="A caption for this photo">
    <button type="submit" class="submit" id="submit-btn-{{toolName}}" disabled>
      Upload
    </button>
  </form>

  <div id="result-{{toolName}}"></div>

  <script>
    (function () {
      const toolName = {{toolNameJson}};
      const MAX_DIMENSION = 2048;
      const MAX_OUTPUT_BYTES = 1.8 * 1024 * 1024;

      const root = document.getElementById("smart-upload-" + toolName);
      const dropZone = document.getElementById("drop-zone-" + toolName);
      const fileInput = document.getElementById("file-input-" + toolName);
      const submitBtn = document.getElementById("submit-btn-" + toolName);

      ["dragenter", "dragover"].forEach(function (evt) {
        root.addEventListener(evt, function (e) {
          e.preventDefault();
          e.stopPropagation();
          dropZone.classList.add("drag-active");
        });
      });
      ["dragleave", "drop"].forEach(function (evt) {
        root.addEventListener(evt, function (e) {
          e.preventDefault();
          e.stopPropagation();
          dropZone.classList.remove("drag-active");
        });
      });
      root.addEventListener("drop", function (e) {
        var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) processFile(file);
      });
      fileInput.addEventListener("change", function (e) {
        var file = e.target.files && e.target.files[0];
        if (file) processFile(file);
      });

      async function processFile(file) {
        var notes = [];
        var bitmap = await createImageBitmap(file).catch(function () { return null; });
        if (!bitmap) {
          showError(
            'Could not read "' + file.name + '" as an image. If this is a ' +
            "HEIC/AVIF file, this browser may need codec support enabled."
          );
          return;
        }

        if (file.type !== "image/jpeg" && file.type !== "image/png") {
          notes.push("Converted from " + (file.type || "unknown format") + " to JPEG");
        }

        var width = bitmap.width;
        var height = bitmap.height;
        var scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
        if (scale < 1) {
          notes.push(
            "Resized from " + width + "×" + height + " to " +
            Math.round(width * scale) + "×" + Math.round(height * scale)
          );
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        var canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
        if (bitmap.close) bitmap.close();

        var quality = 0.9;
        var blob = await canvasToBlob(canvas, quality);
        while (blob.size > MAX_OUTPUT_BYTES && quality > 0.4) {
          quality -= 0.1;
          blob = await canvasToBlob(canvas, quality);
        }
        if (quality < 0.9) {
          notes.push("Compressed to fit under " + (MAX_OUTPUT_BYTES / 1024 / 1024).toFixed(1) + "MB");
        }

        var base64 = await blobToBase64(blob);
        var cleanFilename = file.name.replace(/\\.(heic|heif|avif)$/i, ".jpg");

        document.getElementById("processed-file-" + toolName).value = base64;
        document.getElementById("processed-filename-" + toolName).value = cleanFilename;

        var previewEl = document.getElementById("preview-" + toolName);
        previewEl.style.display = "flex";
        document.getElementById("preview-img-" + toolName).src = URL.createObjectURL(blob);
        document.getElementById("preview-filename-" + toolName).textContent = cleanFilename;
        document.getElementById("conversion-note-" + toolName).textContent =
          notes.length ? notes.join(" · ") : "No conversion needed";

        submitBtn.disabled = false;
      }

      function canvasToBlob(canvas, quality) {
        return new Promise(function (resolve) {
          canvas.toBlob(resolve, "image/jpeg", quality);
        });
      }
      function blobToBase64(blob) {
        return new Promise(function (resolve) {
          var reader = new FileReader();
          reader.onloadend = function () {
            resolve(reader.result.split(",")[1]);
          };
          reader.readAsDataURL(blob);
        });
      }
      function showError(msg) {
        document.getElementById("result-" + toolName).innerHTML =
          '<div class="result result--error">' + msg + "</div>";
      }
    })();
  </script>
</div>`;

export function renderSmartUploadFragment(toolName: string, basePath: string): string {
  const safeBase = basePath.replace(/\/$/, "") || "/mcp-ui";
  const safeName = toolName.replace(/[^A-Za-z0-9_-]/g, "");
  return SMART_UPLOAD_HTML_FRAGMENT.replaceAll("{{toolName}}", escapeMcpUiHtml(safeName))
    .replaceAll("{{basePath}}", escapeMcpUiHtml(safeBase))
    .replace("{{toolNameJson}}", JSON.stringify(safeName));
}
