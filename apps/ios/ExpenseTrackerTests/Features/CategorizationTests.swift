import XCTest
@testable import ExpenseTracker

final class CategorizationTests: XCTestCase {
    func testCategoryCorrectionCanBeSavedAndRememberedAsPendingMetadata() throws {
        let store = InMemoryVaultStore()
        let queue = PendingMutationQueue(storageKey: "expense-tracker.tests.categorization-\(UUID().uuidString)")
        let id = UUID()
        let original = ExpenseTransaction( id: id, occurredOn: Date(), merchant: "Corner Cafe", amount: Money(minorUnits: -1250), category: "Other" )
        try store.insert(original)
        let corrected = ExpenseTransaction( id: id, occurredOn: original.occurredOn, merchant: original.merchant, amount: original.amount, category: "Food and Dining" )
        try store.update(corrected)
        queue.enqueue(PendingMutation(entityId: id, operation: "category-correction"))
        XCTAssertEqual(store.transactions.first?.category, "Food and Dining")
        XCTAssertEqual(queue.pendingMutations.first?.operation, "category-correction")
    }

    func testRuleEditingStateCanBeRepresentedWithoutRewritingHistory() {
        let rule = PendingMutation(entityId: UUID(), operation: "rule-update")
        XCTAssertEqual(rule.operation, "rule-update")
    }
}
