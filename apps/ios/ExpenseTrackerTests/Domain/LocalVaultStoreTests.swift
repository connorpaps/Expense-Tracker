import XCTest
@testable import ExpenseTracker

final class LocalVaultStoreTests: XCTestCase {
    func testInsertUpdateAndDeleteTransaction() throws {
        let store = InMemoryVaultStore()
        let id = UUID()
        var transaction = ExpenseTransaction(
            id: id,
            occurredOn: Date(timeIntervalSince1970: 1_700_000_000),
            merchant: "Coffee",
            amount: Money(minorUnits: -650),
            category: "Food and Dining"
        )

        try store.insert(transaction)
        XCTAssertEqual(store.transactions.count, 1)
        transaction.merchant = "Coffee Shop"
        try store.update(transaction)
        XCTAssertEqual(store.transactions.first?.merchant, "Coffee Shop")
        try store.delete(id: id)
        XCTAssertTrue(store.transactions.isEmpty)
    }

    func testInvalidMerchantAndDuplicateAreRejected() throws {
        let store = InMemoryVaultStore()
        let invalid = ExpenseTransaction(occurredOn: Date(), merchant: " ", amount: Money(minorUnits: -100), category: "Other")
        XCTAssertThrowsError(try store.insert(invalid)) { error in
            XCTAssertEqual(error as? VaultStoreError, .invalidMerchant)
        }

        let valid = ExpenseTransaction(occurredOn: Date(), merchant: "Market", amount: Money(minorUnits: -100), category: "Shopping")
        try store.insert(valid)
        XCTAssertThrowsError(try store.insert(valid)) { error in
            XCTAssertEqual(error as? VaultStoreError, .duplicateID)
        }
    }

    func testPendingQueueIsIdempotentAndAcknowledgesOnlyKnownIDs() {
        let queue = PendingMutationQueue()
        let first = UUID()
        let second = UUID()
        queue.enqueue(first)
        queue.enqueue(first)
        queue.enqueue(second)
        XCTAssertEqual(queue.count, 2)
        queue.acknowledge([first, UUID()])
        XCTAssertEqual(queue.pendingIDs, [second])
        queue.restore(ids: [first, second])
        XCTAssertEqual(queue.count, 2)
    }
}
