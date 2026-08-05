import XCTest
@testable import ExpenseTracker

final class ImportContractTests: XCTestCase {
    func testDefaultParserLimitsMatchSharedContract() {
        let limits = ParseLimits.default
        XCTAssertEqual(limits.maxFileSizeBytes, 10 * 1024 * 1024)
        XCTAssertEqual(limits.maxPDFPages, 60)
        XCTAssertEqual(limits.maxExtractedTextBytes, 5 * 1024 * 1024)
        XCTAssertEqual(limits.maxRows, 50_000)
        XCTAssertEqual(limits.maxDurationSeconds, 30)
    }

    func testErrorRowsRemainPendingUntilExplicitDecision() {
        let diagnostic = ImportRowReview.Diagnostic(code: "ROW_INVALID_AMOUNT", message: "Amount is invalid", severity: "error")
        let row = ImportRowReview(
            sourceRowNumber: 4,
            occurredOn: "2026-07-04",
            merchant: "Bad Amount",
            amountMinor: nil,
            currency: "USD",
            category: nil,
            status: .error,
            diagnostics: [diagnostic],
            decision: .pending
        )
        XCTAssertEqual(row.decision, .pending)
        XCTAssertEqual(row.diagnostics.first?.code, "ROW_INVALID_AMOUNT")
    }
}
