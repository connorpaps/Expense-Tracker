import Foundation
import Combine
import CryptoKit
import SQLite3

/// Concrete iOS 16 local vault adapter. SQLite stores encrypted Codable payloads;
/// the AES key is retained only in the Keychain-backed instance.
public final class SQLiteVaultStore: LocalVaultStore, ObservableObject {
    @Published public private(set) var transactions: [ExpenseTransaction] = []

    private var database: OpaquePointer?
    private let vaultKey: SymmetricKey
    private let vaultId: String
    private let keyStore: KeychainVaultKeyStore

    public init(path: String, vaultId: String, vaultKeyData: Data? = nil, keyStore: KeychainVaultKeyStore = KeychainVaultKeyStore()) throws {
        self.vaultId = vaultId
        self.keyStore = keyStore
        let keyData: Data
        if let vaultKeyData {
            guard vaultKeyData.count == 32 else { throw PersistenceError.invalidKeyLength }
            keyData = vaultKeyData
            try keyStore.save(name: "vault-key-\(vaultId)-v1", material: vaultKeyData)
        } else if let stored = try keyStore.load(name: "vault-key-\(vaultId)-v1"), stored.count == 32 {
            keyData = stored
        } else {
            throw PersistenceError.keyUnavailable
        }
        self.vaultKey = SymmetricKey(data: keyData)
        guard sqlite3_open(path, &database) == SQLITE_OK else { throw PersistenceError.databaseOpenFailed }
        do {
            try execute("PRAGMA foreign_keys = ON")
            try execute("CREATE TABLE IF NOT EXISTS encrypted_transactions (id TEXT PRIMARY KEY, vault_id TEXT NOT NULL, payload TEXT NOT NULL)")
            try reload()
        } catch {
            sqlite3_close(database)
            database = nil
            throw error
        }
    }

    deinit { sqlite3_close(database) }

    public func insert(_ transaction: ExpenseTransaction) throws {
        guard !transaction.merchant.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw VaultStoreError.invalidMerchant }
        guard transaction.amount.minorUnits != 0 else { throw VaultStoreError.invalidAmount }
        guard !transactions.contains(where: { $0.id == transaction.id }) else { throw VaultStoreError.duplicateID }
        try write(transaction, sql: "INSERT INTO encrypted_transactions (id, vault_id, payload) VALUES ('\(escape(transaction.id.uuidString))', '\(escape(vaultId))', '\(escape(try encrypt(transaction)))')")
        transactions.append(transaction)
        transactions.sort { $0.occurredOn > $1.occurredOn }
    }

    public func update(_ transaction: ExpenseTransaction) throws {
        guard transactions.contains(where: { $0.id == transaction.id }) else { throw VaultStoreError.missingTransaction }
        try write(transaction, sql: "UPDATE encrypted_transactions SET payload = '\(escape(try encrypt(transaction)))' WHERE vault_id = '\(escape(vaultId))' AND id = '\(escape(transaction.id.uuidString))'")
        transactions = transactions.map { $0.id == transaction.id ? transaction : $0 }.sorted { $0.occurredOn > $1.occurredOn }
    }

    public func insert(_ newTransactions: [ExpenseTransaction]) throws {
        var ids = Set(transactions.map(\.id))
        for transaction in newTransactions {
            guard !transaction.merchant.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw VaultStoreError.invalidMerchant }
            guard transaction.amount.minorUnits != 0 else { throw VaultStoreError.invalidAmount }
            guard ids.insert(transaction.id).inserted else { throw VaultStoreError.duplicateID }
        }
        try execute("BEGIN TRANSACTION")
        do {
            for transaction in newTransactions {
                try write(transaction, sql: "INSERT INTO encrypted_transactions (id, vault_id, payload) VALUES ('\(escape(transaction.id.uuidString))', '\(escape(vaultId))', '\(escape(try encrypt(transaction)))')")
            }
            try execute("COMMIT")
            transactions.append(contentsOf: newTransactions)
            transactions.sort { $0.occurredOn > $1.occurredOn }
        } catch {
            try? execute("ROLLBACK")
            throw error
        }
    }

    public func delete(id: UUID) throws {
        guard transactions.contains(where: { $0.id == id }) else { throw VaultStoreError.missingTransaction }
        try execute("DELETE FROM encrypted_transactions WHERE vault_id = '\(escape(vaultId))' AND id = '\(escape(id.uuidString))'")
        transactions.removeAll { $0.id == id }
    }

    public func close() {
        sqlite3_close(database)
        database = nil
    }

    private func reload() throws {
        guard let database else { throw PersistenceError.databaseOpenFailed }
        let sql = "SELECT payload FROM encrypted_transactions WHERE vault_id = '\(escape(vaultId))'"
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK else { throw PersistenceError.databaseQueryFailed }
        defer { sqlite3_finalize(statement) }
        var loaded: [ExpenseTransaction] = []
        while sqlite3_step(statement) == SQLITE_ROW {
            guard let pointer = sqlite3_column_text(statement, 0), let encrypted = String(validatingUTF8: pointer), let transaction = try? decrypt(encrypted) else { continue }
            loaded.append(transaction)
        }
        transactions = loaded.sorted { $0.occurredOn > $1.occurredOn }
    }

    private func write(_ transaction: ExpenseTransaction, sql: String) throws {
        try execute(sql)
    }

    private func execute(_ sql: String) throws {
        guard let database else { throw PersistenceError.databaseOpenFailed }
        var errorMessage: UnsafeMutablePointer<CChar>?
        guard sqlite3_exec(database, sql, nil, nil, &errorMessage) == SQLITE_OK else {
            if let errorMessage { sqlite3_free(errorMessage) }
            throw PersistenceError.databaseQueryFailed
        }
    }

    private func encrypt(_ transaction: ExpenseTransaction) throws -> String {
        let data = try JSONEncoder().encode(transaction)
        let sealed = try AES.GCM.seal(data, using: vaultKey)
        return sealed.combined?.base64EncodedString() ?? ""
    }

    private func decrypt(_ value: String) throws -> ExpenseTransaction {
        guard let data = Data(base64Encoded: value) else { throw PersistenceError.databaseQueryFailed }
        return try JSONDecoder().decode(ExpenseTransaction.self, from: AES.GCM.open(AES.GCM.SealedBox(combined: data), using: vaultKey))
    }

    private func escape(_ value: String) -> String { value.replacingOccurrences(of: "'", with: "''") }
}

