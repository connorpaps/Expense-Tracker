import Foundation
import Combine

public final class InMemoryVaultStore: LocalVaultStore, ObservableObject {
    @Published public private(set) var transactions: [ExpenseTransaction]

    public init(transactions: [ExpenseTransaction] = []) {
        self.transactions = transactions
    }

    public func insert(_ newTransactions: [ExpenseTransaction]) throws {
        var ids = Set(transactions.map(\.id))
        for transaction in newTransactions {
            guard !transaction.merchant.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw VaultStoreError.invalidMerchant }
            guard transaction.amount.minorUnits != 0 else { throw VaultStoreError.invalidAmount }
            guard ids.insert(transaction.id).inserted else { throw VaultStoreError.duplicateID }
        }
        transactions.append(contentsOf: newTransactions)
        transactions.sort { $0.occurredOn > $1.occurredOn }
    }

    public func insert(_ transaction: ExpenseTransaction) throws {
        guard !transaction.merchant.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw VaultStoreError.invalidMerchant }
        guard transaction.amount.minorUnits != 0 else { throw VaultStoreError.invalidAmount }
        guard !transactions.contains(where: { $0.id == transaction.id }) else { throw VaultStoreError.duplicateID }
        transactions.append(transaction)
        transactions.sort { $0.occurredOn > $1.occurredOn }
    }

    public func update(_ transaction: ExpenseTransaction) throws {
        guard let index = transactions.firstIndex(where: { $0.id == transaction.id }) else { throw VaultStoreError.missingTransaction }
        guard !transaction.merchant.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw VaultStoreError.invalidMerchant }
        guard transaction.amount.minorUnits != 0 else { throw VaultStoreError.invalidAmount }
        transactions[index] = transaction
        transactions.sort { $0.occurredOn > $1.occurredOn }
    }

    public func delete(id: UUID) throws {
        guard transactions.contains(where: { $0.id == id }) else { throw VaultStoreError.missingTransaction }
        transactions.removeAll { $0.id == id }
    }

    public func clearAll() {
        transactions.removeAll()
    }
}

/// The production boundary for a SQLite/GRDB implementation. It deliberately
/// mirrors the shared SQL schema without making a third-party wrapper an iOS
/// 16 prerequisite for the initial scaffold.
public protocol SQLiteVaultDatabase {
    func open() throws
    func close() throws
    func execute(sql: String, arguments: [Any?]) throws
}

/// Restart-safe queue metadata. Payload encryption and append-only envelope
/// storage are intentionally deferred to the US6 encrypted sync store; this
/// type must not persist financial payloads in UserDefaults.
public struct PendingMutation: Codable, Equatable, Identifiable, Sendable {
    public let id: UUID
    public let entityId: UUID
    public let operation: String
    public let createdAt: Date

    public init(id: UUID = UUID(), entityId: UUID, operation: String, createdAt: Date = Date()) {
        self.id = id
        self.entityId = entityId
        self.operation = operation
        self.createdAt = createdAt
    }
}

public final class PendingMutationQueue: ObservableObject {
    @Published public private(set) var pendingMutations: [PendingMutation] {
        didSet { persist() }
    }
    private let storageKey: String
    private let legacyStorageKey: String

    public init(storageKey: String = "expense-tracker.pending-mutations") {
        self.storageKey = storageKey
        self.legacyStorageKey = "\(storageKey).ids"
        if let data = UserDefaults.standard.data(forKey: storageKey),
           let records = try? JSONDecoder().decode([PendingMutation].self, from: data) {
            self.pendingMutations = records
        } else {
            let stored = UserDefaults.standard.array(forKey: legacyStorageKey) as? [String] ?? []
            self.pendingMutations = stored.compactMap(UUID.init(uuidString:)).map { PendingMutation(entityId: $0, operation: "unknown") }
        }
    }

    public var pendingIDs: [UUID] { pendingMutations.map(\.entityId) }
    public var count: Int { pendingMutations.count }

    public func enqueue(_ id: UUID) { enqueue(PendingMutation(entityId: id, operation: "unknown")) }

    public func enqueue(_ mutation: PendingMutation) {
        guard !pendingMutations.contains(where: { $0.entityId == mutation.entityId && $0.operation == mutation.operation }) else { return }
        pendingMutations.append(mutation)
    }

    public func acknowledge(_ ids: [UUID]) { pendingMutations.removeAll { ids.contains($0.entityId) } }

    public func restore(ids: [UUID]) { pendingMutations = ids.map { PendingMutation(entityId: $0, operation: "unknown") } }

    private func persist() {
        if let data = try? JSONEncoder().encode(pendingMutations) { UserDefaults.standard.set(data, forKey: storageKey) }
        UserDefaults.standard.set(pendingIDs.map(\.uuidString), forKey: legacyStorageKey)
    }
}
