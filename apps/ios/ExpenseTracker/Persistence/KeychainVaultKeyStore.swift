import Foundation
import Security

/// Keychain storage for vault encryption keys. Secrets never enter UserDefaults.
public final class KeychainVaultKeyStore {
    private let service: String

    public init(service: String = "com.expensetracker.vault") {
        self.service = service
    }

    public func save(name: String, material: Data) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: name,
            kSecValueData as String: material,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        ]
        let status = SecItemAdd(query as CFDictionary, nil)
        if status == errSecDuplicateItem {
            let lookup: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: name,
            ]
            let updateStatus = SecItemUpdate(lookup as CFDictionary, [kSecValueData as String: material] as CFDictionary)
            guard updateStatus == errSecSuccess else { throw KeychainError(status: updateStatus) }
        } else if status != errSecSuccess {
            throw KeychainError(status: status)
        }
    }

    public func load(name: String) throws -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: name,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw KeychainError(status: status) }
        return data
    }

    public func delete(name: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: name,
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw KeychainError(status: status) }
    }
}

public struct KeychainError: Error, Equatable {
    public let status: OSStatus
}

/// The shared schema executor used by the production SQLite/GRDB adapter.
/// The adapter owns transactions and must run the SQL schema from the domain.
public protocol SQLiteLocalVaultAdapter: SQLiteVaultDatabase {
    func beginTransaction() throws
    func commitTransaction() throws
    func rollbackTransaction() throws
    func query(sql: String, arguments: [Any?]) throws -> [[String: Any?]]
}

public final class LocalVaultPersistence {
    private let database: SQLiteLocalVaultAdapter
    private let keyStore: KeychainVaultKeyStore

    public init(database: SQLiteLocalVaultAdapter, keyStore: KeychainVaultKeyStore = KeychainVaultKeyStore()) {
        self.database = database
        self.keyStore = keyStore
    }

    public func open(vaultId: String, vaultKey: Data) throws {
        guard vaultKey.count == 32 else { throw PersistenceError.invalidKeyLength }
        try keyStore.save(name: "vault-key-\(vaultId)-v1", material: vaultKey)
        try database.open()
        try database.execute(sql: "PRAGMA foreign_keys = ON", arguments: [])
    }

    public func close() throws {
        try database.close()
    }

    public func rotateKey(vaultId: String, version: Int, key: Data) throws {
        guard key.count == 32, version > 0 else { throw PersistenceError.invalidKeyLength }
        try keyStore.save(name: "vault-key-\(vaultId)-v\(version)", material: key)
    }

    public func loadKey(vaultId: String, version: Int) throws -> Data? {
        try keyStore.load(name: "vault-key-\(vaultId)-v\(version)")
    }
}

public enum PersistenceError: Error, Equatable {
    case invalidKeyLength
    case databaseOpenFailed
    case databaseQueryFailed
    case keyUnavailable
}
