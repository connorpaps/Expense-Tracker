import XCTest
@testable import ExpenseTracker

final class KeychainPersistenceTests: XCTestCase {
    func testInvalidVaultKeyLengthIsRejectedBeforeOpeningStorage() {
        XCTAssertThrowsError(
            try LocalVaultPersistence(database: MockSQLiteDatabase()).open(vaultId: "vault-1", vaultKey: Data(repeating: 0, count: 8))
        ) { error in
            XCTAssertEqual(error as? PersistenceError, .invalidKeyLength)
        }
    }

    func testSQLiteAdapterContractCanOpenAndRotateKeys() throws {
        let database = MockSQLiteDatabase()
        let persistence = LocalVaultPersistence(database: database, keyStore: KeychainVaultKeyStore(service: "com.expensetracker.tests.\(UUID().uuidString)"))
        try persistence.open(vaultId: "vault-1", vaultKey: Data(repeating: 1, count: 32))
        try persistence.rotateKey(vaultId: "vault-1", version: 2, key: Data(repeating: 2, count: 32))
        XCTAssertTrue(database.didOpen)
        XCTAssertTrue(database.executedSQL.contains("PRAGMA foreign_keys = ON"))
    }
}

private final class MockSQLiteDatabase: SQLiteLocalVaultAdapter {
    var didOpen = false
    var executedSQL: [String] = []
    func open() throws { didOpen = true }
    func close() throws {}
    func execute(sql: String, arguments: [Any?]) throws { executedSQL.append(sql) }
    func beginTransaction() throws {}
    func commitTransaction() throws {}
    func rollbackTransaction() throws {}
    func query(sql: String, arguments: [Any?]) throws -> [[String: Any?]] { [] }
}
