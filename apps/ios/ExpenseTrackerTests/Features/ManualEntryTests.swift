import XCTest
@testable import ExpenseTracker

final class ManualEntryTests: XCTestCase {
    func testManualEntryRoundTripQueuesCreateUpdateAndDelete() throws {
        let store = InMemoryVaultStore()
        let queue = PendingMutationQueue(storageKey: "expense-tracker.tests.manual-entry-\(UUID().uuidString)")
        let id = UUID()
        var transaction = ExpenseTransaction(
            id: id,
            occurredOn: Date(timeIntervalSince1970: 1_700_000_000),
            merchant: "Corner Cafe",
            amount: Money(minorUnits: -1250),
            category: "Food and Dining",
            note: "Lunch"
        )

        try store.insert(transaction)
        queue.enqueue(PendingMutation(entityId: transaction.id, operation: "create"))
        XCTAssertEqual(store.transactions.first?.merchant, "Corner Cafe")
        XCTAssertEqual(queue.pendingIDs, [id])

        transaction.merchant = "Corner Cafe Updated"
        transaction.note = "Team lunch"
        try store.update(transaction)
        queue.enqueue(PendingMutation(entityId: transaction.id, operation: "update"))
        XCTAssertEqual(store.transactions.first?.merchant, "Corner Cafe Updated")
        XCTAssertEqual(queue.count, 1)

        try store.delete(id: id)
        queue.enqueue(PendingMutation(entityId: id, operation: "delete"))
        XCTAssertTrue(store.transactions.isEmpty)
        XCTAssertEqual(queue.pendingIDs, [id])
    }

    func testInvalidManualValuesAreRejectedBeforePersistence() throws {
        let store = InMemoryVaultStore()
        let invalidMerchant = ExpenseTransaction(
            occurredOn: Date(),
            merchant: " ",
            amount: Money(minorUnits: -100),
            category: "Food and Dining"
        )
        XCTAssertThrowsError(try store.insert(invalidMerchant)) { error in
            XCTAssertEqual(error as? VaultStoreError, .invalidMerchant)
        }

        let invalidAmount = ExpenseTransaction(
            occurredOn: Date(),
            merchant: "Cafe",
            amount: Money(minorUnits: 0),
            category: "Food and Dining"
        )
        XCTAssertThrowsError(try store.insert(invalidAmount)) { error in
            XCTAssertEqual(error as? VaultStoreError, .invalidAmount)
        }
    }
}
