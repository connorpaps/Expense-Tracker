import XCTest
@testable import ExpenseTracker

final class PrivacyLifecycleTests: XCTestCase {
    func testPendingMutationMetadataSurvivesQueueReopenWithoutFinancialPayload() {
        let storageKey = "expense-tracker.tests.privacy-\(UUID().uuidString)"
        defer {
            UserDefaults.standard.removeObject(forKey: storageKey)
            UserDefaults.standard.removeObject(forKey: "\(storageKey).ids")
        }

        let entityId = UUID()
        let firstQueue = PendingMutationQueue(storageKey: storageKey)
        firstQueue.enqueue(PendingMutation(entityId: entityId, operation: "create"))
        XCTAssertEqual(firstQueue.pendingMutations.map(\.entityId), [entityId])

        let reopenedQueue = PendingMutationQueue(storageKey: storageKey)
        XCTAssertEqual(reopenedQueue.pendingMutations.map(\.entityId), [entityId])
        XCTAssertEqual(reopenedQueue.pendingMutations.first?.operation, "create")

        let persisted = UserDefaults.standard.data(forKey: storageKey)
        XCTAssertNotNil(persisted)
        XCTAssertFalse(String(data: persisted ?? Data(), encoding: .utf8)?.contains("merchant") ?? false)
    }

    func testInvalidKeyCannotOpenLocalPersistenceAndRotationRequiresValidVersionedKey() {
        let service = "com.expensetracker.tests.privacy-\(UUID().uuidString)"
        let persistence = LocalVaultPersistence(database: PrivacyMockSQLiteDatabase(), keyStore: KeychainVaultKeyStore(service: service))

        XCTAssertThrowsError(try persistence.open(vaultId: "vault-privacy", vaultKey: Data(repeating: 0, count: 16))) { error in
            XCTAssertEqual(error as? PersistenceError, .invalidKeyLength)
        }
        XCTAssertThrowsError(try persistence.rotateKey(vaultId: "vault-privacy", version: 0, key: Data(repeating: 0, count: 32))) { error in
            XCTAssertEqual(error as? PersistenceError, .invalidKeyLength)
        }
    }

    func testEncryptedBackupRoundTripsAndRejectsWrongPassword() throws {
        let merchant = "Private Cafe"
        let transaction = ExpenseTransaction(
            occurredOn: Date(timeIntervalSince1970: 1_700_000_000),
            merchant: merchant,
            amount: Money(minorUnits: -1250),
            category: "Food and Dining"
        )
        let data = try NativeVaultBackup.create(vaultId: "vault-privacy", transactions: [transaction], password: "correct horse battery")
        XCTAssertFalse(String(data: data, encoding: .utf8)?.contains(merchant) ?? true)
        XCTAssertEqual(try NativeVaultBackup.restore(data, password: "correct horse battery"), [transaction])
        XCTAssertThrowsError(try NativeVaultBackup.restore(data, password: "wrong password")) { error in
            XCTAssertEqual(error as? NativeVaultBackupError, .wrongPasswordOrDamagedBackup)
        }
    }

    func testOfflineMutationHasVisibleWaitingStateAndIsIdempotent() {
        let queue = PendingMutationQueue(storageKey: "expense-tracker.tests.offline-\(UUID().uuidString)")
        let entityId = UUID()
        queue.enqueue(PendingMutation(entityId: entityId, operation: "update"))
        queue.enqueue(PendingMutation(entityId: entityId, operation: "update"))

        XCTAssertEqual(queue.count, 1)
        XCTAssertEqual(SyncState.waitingToSync(pendingCount: queue.count), .waitingToSync(pendingCount: 1))
    }

    func testLocalStoreClearRemovesFinancialRecords() throws {
        let store = InMemoryVaultStore()
        try store.insert(ExpenseTransaction(merchant: "Private Cafe", amount: Money(minorUnits: -1250), category: "Food and Dining", occurredOn: Date()))
        store.clearAll()
        XCTAssertTrue(store.transactions.isEmpty)
    }

    func testPrivacyCopyExplainsLocalStorageRetentionDeletionAndNoRequiredAccount() {
        XCTAssertTrue(PrivacyCopy.localVault.localizedCaseInsensitiveContains("device"))
        XCTAssertTrue(PrivacyCopy.retention.localizedCaseInsensitiveContains("statement"))
        XCTAssertTrue(PrivacyCopy.deletion.localizedCaseInsensitiveContains("delete"))
        XCTAssertTrue(PrivacyCopy.noAccount.localizedCaseInsensitiveContains("account"))
    }
}

private final class PrivacyMockSQLiteDatabase: SQLiteLocalVaultAdapter {
    func open() throws {}
    func close() throws {}
    func execute(sql: String, arguments: [Any?]) throws {}
    func beginTransaction() throws {}
    func commitTransaction() throws {}
    func rollbackTransaction() throws {}
    func query(sql: String, arguments: [Any?]) throws -> [[String: Any?]] { [] }
}
