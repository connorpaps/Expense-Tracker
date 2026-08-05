import Foundation
import PDFKit

public struct NativeParseResult: Sendable {
    public let fileType: String
    public let rows: [ImportRowReview]
    public let warnings: [String]
    public let cancelled: Bool

    public init(fileType: String, rows: [ImportRowReview], warnings: [String] = [], cancelled: Bool = false) {
        self.fileType = fileType
        self.rows = rows
        self.warnings = warnings
        self.cancelled = cancelled
    }
}

public enum NativeImportError: Error, Equatable {
    case unsupportedFile
    case tooLarge
    case encryptedPDF
    case imageOnlyPDF
    case invalidEncoding
    case cancelled
}

public final class NativeImportParser {
    public let limits: ParseLimits

    public init(limits: ParseLimits = .default) {
        self.limits = limits
    }

    public func parse(data: Data, fileName: String, isCancelled: @escaping @Sendable () -> Bool = { false }) async throws -> NativeParseResult {
        guard data.count <= limits.maxFileSizeBytes else { throw NativeImportError.tooLarge }
        guard !isCancelled() else { throw NativeImportError.cancelled }
        if fileName.lowercased().hasSuffix(".pdf") {
            return try parsePDF(data: data, isCancelled: isCancelled)
        }
        guard fileName.lowercased().hasSuffix(".csv") else { throw NativeImportError.unsupportedFile }
        guard let csv = String(data: data, encoding: .utf8) else { throw NativeImportError.invalidEncoding }
        return try parseCSV(csv, isCancelled: isCancelled)
    }

    private func parseCSV(_ csv: String, isCancelled: @escaping @Sendable () -> Bool) throws -> NativeParseResult {
        let lines = csv.split(whereSeparator: \.isNewline).map(String.init)
        guard let headerLine = lines.first else { return NativeParseResult(fileType: "csv", rows: []) }
        let headers = parseCSVLine(headerLine).map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
        let dateIndex = firstIndex(headers, containing: ["transaction date", "date", "posted date"])
        let merchantIndex = firstIndex(headers, containing: ["description", "merchant"])
        let amountIndex = firstIndex(headers, containing: ["amount"])
        let debitIndex = firstIndex(headers, containing: ["debit"])
        let creditIndex = firstIndex(headers, containing: ["credit"])
        var rows: [ImportRowReview] = []
        for (offset, line) in lines.dropFirst().prefix(limits.maxRows).enumerated() {
            if isCancelled() { throw NativeImportError.cancelled }
            let fields = parseCSVLine(line)
            let date = dateIndex.flatMap { fields[safe: $0] }.flatMap(Self.normalizeDate)
            let merchant = merchantIndex.flatMap { fields[safe: $0] }.map(Self.normalizeMerchant).flatMap { $0.isEmpty ? nil : $0 }
            let amountText: String? = if let debitIndex, let value = fields[safe: debitIndex], !value.trimmed.isEmpty {
                "-\(value)"
            } else if let creditIndex, let value = fields[safe: creditIndex], !value.trimmed.isEmpty {
                value
            } else {
                amountIndex.flatMap { fields[safe: $0] }
            }
            let amount = amountText.flatMap(Self.parseMinorUnits)
            var diagnostics: [ImportRowReview.Diagnostic] = []
            if date == nil { diagnostics.append(.init(code: "ROW_INVALID_DATE", message: "Date could not be read.", severity: "error")) }
            if merchant == nil { diagnostics.append(.init(code: "ROW_MISSING_MERCHANT", message: "This row has no merchant description.", severity: "error")) }
            if amount == nil { diagnostics.append(.init(code: "ROW_INVALID_AMOUNT", message: "Amount could not be read.", severity: "error")) }
            rows.append(ImportRowReview(
                sourceRowNumber: offset + 1,
                occurredOn: date,
                merchant: merchant,
                amountMinor: amount,
                currency: "USD",
                category: nil,
                status: diagnostics.isEmpty ? .valid : .error,
                diagnostics: diagnostics,
                decision: diagnostics.isEmpty ? .accept : .pending
            ))
        }
        return NativeParseResult(fileType: "csv", rows: rows)
    }

    private func parsePDF(data: Data, isCancelled: @escaping @Sendable () -> Bool) throws -> NativeParseResult {
        guard let document = PDFDocument(data: data) else { throw NativeImportError.encryptedPDF }
        var text = ""
        let pageCount = min(document.pageCount, limits.maxPDFPages)
        for index in 0..<pageCount {
            if isCancelled() { throw NativeImportError.cancelled }
            text += document.page(at: index)?.string ?? ""
            text += "\n"
            if text.utf8.count > limits.maxExtractedTextBytes { break }
        }
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw NativeImportError.imageOnlyPDF }
        var sourceRowNumber = 0
        let rows = text.split(whereSeparator: \.isNewline).compactMap { line -> ImportRowReview? in
            let parts = line.split(whereSeparator: { $0 == " " || $0 == "\t" }, maxSplits: 2, omittingEmptySubsequences: true)
            guard parts.count == 3, let date = Self.normalizeDate(String(parts[0])), let amount = Self.parseMinorUnits(String(parts[2])) else { return nil }
            sourceRowNumber += 1
            let merchant = Self.normalizeMerchant(String(parts[1]))
            return ImportRowReview(sourceRowNumber: sourceRowNumber, occurredOn: date, merchant: merchant, amountMinor: amount, currency: "USD", category: nil, status: .valid, decision: .accept)
        }
        return NativeParseResult(fileType: "pdf", rows: Array(rows.prefix(limits.maxRows)))
    }

    private func firstIndex(_ headers: [String], containing candidates: [String]) -> Int? {
        headers.firstIndex { header in candidates.contains { header.contains($0) } }
    }

    private func parseCSVLine(_ line: String) -> [String] {
        var fields: [String] = []
        var field = ""
        var quoted = false
        var index = line.startIndex
        while index < line.endIndex {
            let character = line[index]
            if character == "\"" {
                if quoted, line.index(after: index) < line.endIndex, line[line.index(after: index)] == "\"" {
                    field.append("\"")
                    index = line.index(after: index)
                } else { quoted.toggle() }
            } else if character == "," && !quoted {
                fields.append(field)
                field = ""
            } else { field.append(character) }
            index = line.index(after: index)
        }
        fields.append(field)
        return fields
    }

    private static func normalizeDate(_ raw: String) -> String? {
        let value = raw.trimmed
        let formats = ["MM/dd/yyyy", "yyyy-MM-dd"]
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        for format in formats {
            formatter.dateFormat = format
            if let date = formatter.date(from: value) {
                formatter.dateFormat = "yyyy-MM-dd"
                return formatter.string(from: date)
            }
        }
        return nil
    }

    private static func normalizeMerchant(_ raw: String) -> String {
        raw.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .capitalized
    }

    private static func parseMinorUnits(_ raw: String) -> Int64? {
        let cleaned = raw.replacingOccurrences(of: ",", with: "").replacingOccurrences(of: "$", with: "").trimmed
        guard let value = Double(cleaned), value.isFinite else { return nil }
        return Int64((value * 100).rounded())
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}

private extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}
