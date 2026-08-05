# PDF Import Investigation Report

**Project:** Expense Tracker  
**Date:** 2026-08-05  
**Scope:** Evaluate whether the importer should visually scan PDFs or use other local/open-source document extraction tools.  
**Implementation status:** Research only. No extraction system was implemented as part of this report.

---

## Executive summary

A visual/OCR pipeline is worth supporting eventually, but it should not replace text extraction as the first step.

The recommended architecture is:

```text
PDF.js text extraction with coordinates
        |
        v
Layout and column reconstruction
        |
        v
Deterministic transaction parser
        |
        v
Review screen with diagnostics
        |
        +--> OCR fallback for image-only/scanned PDFs
        |
        +--> Optional heavier local sidecar for difficult documents
```

The current TD Bank mock PDF demonstrates why basic text parsing is insufficient. PDF.js can open the file and extract its text, but the existing parser discards the text-item coordinates and expects a narrow one-line format. The document has a multi-column layout, so it should first be reconstructed spatially rather than sent directly through OCR or an AI vision model.

For financial data, deterministic extraction plus review is preferable to an opaque AI-only result. OCR and document-AI tools should be fallbacks or optional advanced processing paths, not the only parser.

---

## What happened with `TD_Bank_Realistic_Mock.pdf`

The file was tested locally after it was moved into the workspace.

Observed properties:

- File size: approximately 4.7 KB.
- PDF version: 1.4.
- Two pages.
- PDF.js successfully opens the file.
- PDF.js extracts text from the document.
- The existing parser reaches the page-processing stage.
- The existing parser finds zero rows matching its supported transaction pattern.
- The parser reports `IMPORT_PDF_UNSUPPORTED_LAYOUT`.

This is **not primarily a missing-bank-profile problem**. Bank profiles currently apply to CSV header detection. PDF parsing uses a generic text-PDF path.

The existing PDF parser expects a shape similar to:

```text
07/01/2026  MERCHANT NAME  -12.34
```

The TD document has a different multi-column arrangement with multiple numeric columns. When text is read in PDF stream order, the columns cannot safely be interpreted as date, merchant, debit/credit, and balance without using their positions on the page.

### Conclusion for this file

The next technical step should be **coordinate-aware layout reconstruction**:

1. Keep each PDF.js text item and its transform/bounding-box information.
2. Group items into visual rows using their Y coordinates.
3. Sort items left-to-right within each row.
4. Infer column boundaries from repeated X coordinates and headers.
5. Parse date, description, debit, credit, and balance columns deterministically.
6. Show the normalized rows in the existing review screen before committing.

OCR would not be the best first solution for this particular PDF because it already contains selectable text.

---

## Text extraction vs. visual/OCR extraction

### Text-layer extraction

A digital PDF normally contains text objects with position information. PDF.js exposes these objects through `getTextContent()`.

**Advantages:**

- Fast compared with OCR.
- Accurate for selectable text.
- Preserves the original characters better than OCR.
- Runs locally in the browser.
- Works with the existing React/Vite architecture.
- Easier to make deterministic and testable.
- Avoids common OCR errors such as confusing `0` with `O` or `8` with `B`.

**Limitations:**

- PDF text objects are not guaranteed to be in visual reading order.
- Multi-column layouts can be interleaved.
- Table cells may be represented as independent positioned text items.
- Some PDFs use unusual fonts, encodings, or fragmented glyphs.

### Coordinate-aware layout extraction

This is the best fit for the TD PDF. It is not full image OCR; it is a visual reconstruction of the existing text layer.

The parser should retain values similar to:

```text
{
  text: "...",
  x: 123.4,
  y: 456.7,
  width: 54.0,
  height: 10.2
}
```

Then it can rebuild rows and columns from geometry. A layout parser can recognize that several amounts sit in separate columns even if the PDF text stream places them in an inconvenient order.

### OCR

OCR is necessary when the PDF is scanned or contains no usable text layer. It should be conditional:

```text
If usable text density is sufficient:
    use text + coordinates
else:
    render pages to images and run OCR
```

OCR is slower, consumes more memory, and can produce recognition errors. It also requires a strategy for reconstructing table columns from OCR bounding boxes.

### AI/document vision models

Document vision models can help with unusual documents, but they add significant complexity and should not be the default for this app:

- Large model downloads.
- High CPU, memory, and battery use.
- More difficult browser/iOS support.
- More difficult deterministic testing.
- Model and license management.
- Possible requirement for a hosted inference service.
- Risk of silently inventing or misreading financial values.

If used, model output should always become a reviewable draft with confidence and diagnostics. It must never directly commit transactions.

---

## Candidate tools

### PDF.js

- Repository: <https://github.com/mozilla/pdf.js>
- Documentation: <https://mozilla.github.io/pdf.js/>
- License: Apache-2.0.
- Runtime: Browser and JavaScript environments.
- Current project status: Already used by this project.
- Best use: Text extraction, page rendering, text-item coordinates, and OCR input rendering.

**Recommendation:** Continue using PDF.js and add coordinate-aware reconstruction before adding a heavier dependency.

### pdfplumber

- Repository: <https://github.com/jsvine/pdfplumber>
- Documentation: <https://pypi.org/project/pdfplumber/>
- Runtime: Python.
- Best use: Local prototyping and inspecting text positions, lines, rectangles, and tables.

**Recommendation:** Useful as a development/prototyping tool or optional local relay sidecar, but not a direct browser or iOS dependency.

### Camelot

- Repository: <https://github.com/camelot-dev/camelot>
- Documentation: <https://camelot-py.readthedocs.io/>
- Runtime: Python.
- Best use: Machine-generated tables using stream or lattice extraction.
- Limitation: Primarily a Python-side tool and not a natural fit for the current browser-only path.

**Recommendation:** Potential optional local sidecar for difficult table PDFs; not the first browser implementation.

### Tabula

- Repository: <https://github.com/tabulapdf/tabula>
- Python wrapper: <https://github.com/chezou/tabula-py>
- Runtime: Java/Python-oriented.
- Best use: Table extraction from structured PDFs.

**Recommendation:** Useful for comparison during parser prototyping, but adds runtime overhead and does not solve browser/iOS parity by itself.

### Tesseract.js

- Repository: <https://github.com/naptha/tesseract.js>
- Website: <https://tesseract.projectnaptha.com/>
- License: Apache-2.0.
- Runtime: Browser/WebAssembly and Node-compatible JavaScript environments.
- Best use: Local OCR fallback after PDF pages are rendered to images.
- Limitations: Slow for multi-page documents, memory intensive, and weaker at reconstructing financial tables without additional layout logic.

**Recommendation:** Reasonable web fallback for scanned PDFs, executed in a worker and limited to small documents. Do not run it for selectable text by default.

### Apple Vision framework

- Documentation: <https://developer.apple.com/documentation/vision/recognizing_text_in_images>
- Runtime: Native Apple platforms.
- Best use: On-device iOS OCR with platform acceleration.
- Limitation: iOS-only, so it does not provide web/iOS parser parity on its own.

**Recommendation:** Strong native iOS fallback for scanned pages. The normalized review contract should remain shared with the web path.

### OCRmyPDF

- Repository: <https://github.com/ocrmypdf/OCRmyPDF>
- Documentation: <https://ocrmypdf.readthedocs.io/>
- Runtime: Python/CLI and external OCR tooling.
- Best use: Add a searchable OCR layer to scanned PDFs.

**Recommendation:** Useful as a local preprocessing tool or relay-side utility, not as a browser-native dependency.

### PaddleOCR and PP-Structure

- Repository: <https://github.com/PaddlePaddle/PaddleOCR>
- Research/technical material: <https://arxiv.org/abs/2507.05595>
- Runtime: Primarily Python/native deep-learning environments, with some other deployment options.
- Best use: OCR, document layout, tables, and structured document understanding.
- Limitations: Larger models and runtime dependencies; browser and iOS integration are substantially more difficult than PDF.js or Tesseract.js.

**Recommendation:** Consider only for an optional local Python sidecar after simpler coordinate parsing and OCR fallback have been evaluated.

### Docling

- Repository: <https://github.com/docling-project/docling>
- Documentation: <https://docling-project.github.io/docling/>
- Runtime: Python/local document-processing environment.
- Best use: Advanced layout, table, and document-structure extraction.
- Limitations: Heavy compared with the current app, with more model/runtime dependencies.

**Recommendation:** Promising for a future local relay/desktop processing mode, not an initial browser bundle.

### Table Transformer and LayoutLM-style models

These are useful categories of document models available through Hugging Face and related repositories.

**Strengths:**

- Can identify table regions and document structure.
- May handle documents that defeat simple geometric heuristics.
- Useful in a controlled local inference service.

**Weaknesses:**

- Large model files.
- More complicated inference/runtime support.
- Need model-specific license review.
- Harder to run efficiently in browsers and on iOS.
- Still require validation against financial values.

**Recommendation:** Research candidates for a later optional sidecar, not the first implementation.

---

## Hugging Face assessment

Hugging Face is useful for finding and distributing models, but it is not automatically a privacy-preserving runtime. There are three very different deployment choices:

1. **Hosted inference:** easiest to call, but bank statements leave the device and introduce service/dependency concerns. Not appropriate for the required privacy model.
2. **Local Python inference:** private and potentially powerful, but requires a local model runtime and significant installation/storage/CPU resources.
3. **Browser or mobile converted model:** private, but requires model conversion, WASM/WebGPU/Core ML/ONNX compatibility work, and careful performance testing.

For this project, any Hugging Face model would need:

- A verified license compatible with the project.
- A pinned model version.
- A documented local-only execution path.
- A bounded file/page/runtime budget.
- A confidence and review model.
- Tests proving that dates and amounts are not silently corrupted.

No Hugging Face model was installed or added during this research.

---

## Skills.sh findings

Relevant skills discovered on skills.sh included:

- [PDF OCR extraction](https://skills.sh/claude-office-skills/skills/pdf-ocr-extraction)
- [OCR and documents](https://skills.sh/nousresearch/hermes-agent/ocr-and-documents)
- [MinerU PDF processing](https://skills.sh/skills.volces.com/pdf-process-mineru)
- [Mistral OCR extraction](https://skills.sh/tristanmanchester/agent-skills/extracting-mistral-ocr)
- [Mixedbread parsing](https://skills.sh/mixedbread-ai/skills/mixedbread-parsing)
- [PDF text extractor](https://skills.sh/skills.volces.com/pdf-text-extractor)
- [Table OCR](https://skills.sh/skills.volces.com/table-ocr)

These are primarily agent instructions and workflows rather than drop-in runtime packages. Some may recommend hosted APIs, large Python dependencies, or tools with different privacy and licensing assumptions. They should be reviewed individually before installation.

No skills were installed for this report.

---

## Fit with this project’s constraints

The current project has several important constraints:

- Local-first processing.
- No required paid services.
- No bank credentials or hosted bank connections.
- Privacy-sensitive financial statements.
- React/Vite web app.
- Native SwiftUI iOS app.
- iOS 16 compatibility.
- Shared normalized import contract.
- Review before commit.
- No silent data loss or silent financial misclassification.

These constraints favor a staged deterministic pipeline over a single general-purpose vision model.

### Best web path

1. PDF.js text extraction.
2. Coordinate-aware row/column reconstruction.
3. Deterministic parser for common layouts.
4. Tesseract.js worker fallback for image-only PDFs.
5. Clear unsupported-layout diagnostics when confidence is insufficient.

### Best iOS path

1. Native PDFKit/text extraction where available.
2. Coordinate-aware layout reconstruction.
3. Native Vision OCR fallback for scanned documents.
4. Shared normalized output and diagnostics.

### Optional local relay/sidecar path

For users who opt into a local companion process, tools such as pdfplumber, Camelot, PaddleOCR, or Docling could process especially difficult documents. This should be optional and explicitly local; it should not be required for the primary app.

---

## Recommended implementation phases

### Phase 1: Improve the existing PDF.js path

- Preserve text-item coordinates rather than immediately concatenating strings.
- Add row grouping and X-coordinate sorting.
- Detect repeated column positions.
- Add configurable date and amount recognition.
- Add TD Bank/Canadian-style layout fixtures using sanitized data.
- Keep all rows in the review flow with diagnostics.

### Phase 2: Add confidence and diagnostics

- Report whether the PDF has a usable text layer.
- Report detected columns and recognized row count.
- Mark ambiguous debit/credit/balance interpretations for review.
- Never commit a row whose amount or date is ambiguous.

### Phase 3: Add conditional OCR

- Detect empty or unusable text layers.
- Render pages through PDF.js.
- Run Tesseract.js in a worker on the web.
- Use Apple Vision on iOS.
- Keep OCR output provisional until reviewed.

### Phase 4: Evaluate a local sidecar

Only if representative statements continue to fail:

- Prototype pdfplumber/Camelot first.
- Benchmark PaddleOCR or Docling on sanitized fixtures.
- Measure CPU, memory, model size, startup time, and accuracy.
- Decide whether the free local relay should expose an optional document-processing endpoint.

### Phase 5: Consider document models

Only after deterministic and OCR approaches have been benchmarked should the project consider Table Transformer, LayoutLM-family models, or other Hugging Face document models.

---

## Final recommendation

**Yes, add visual/layout awareness—but do not replace text extraction with OCR or AI vision.**

For the current TD PDF, the best solution is to use the existing PDF.js text layer plus coordinates. This should be faster, more private, more deterministic, and more accurate than OCR.

Then add OCR as a fallback for genuinely scanned PDFs. Keep heavier tools such as PaddleOCR, Docling, Camelot, and Hugging Face models as optional local-sidecar candidates if real-world documents show that browser-native parsing is not sufficient.

The guiding rule should remain:

> Extract locally, preserve source/layout evidence, show a reviewable result, and never commit uncertain financial values automatically.
