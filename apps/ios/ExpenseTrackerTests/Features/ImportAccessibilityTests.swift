import XCTest
@testable import ExpenseTracker

final class ImportAccessibilityTests: XCTestCase {
    func testImportReviewRowsExposeStableSemanticState() {
        let row = ImportRowReview(
            sourceRowNumber: 1,
            occurredOn: "2026-07-01",
            merchant: "Starbucks",
            amountMinor: -650,
            currency: "USD",
            category: "Food and Dining",
            status: .valid
        )
        XCTAssertEqual(row.status, .valid)
        XCTAssertEqual(row.decision, .accept)
        XCTAssertFalse(row.merchant?.isEmpty ?? true)
    }

    func testMinimumTouchTargetContract() {
        XCTAssertGreaterThanOrEqual(ExpenseTrackerTokens.minimumTouchTarget, 44)
    }
}
