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
        guard !transaction.merchant.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw VaultStoreError.invalidMerchant
        }
        guard transaction.amount.minorUnits != 0 else {
            throw VaultStoreError.invalidAmount
        }
        guard !transactions.contains(where: { $0.id == transaction.id }) else {
            throw VaultStoreError.duplicateID
        }
        transactions.append(transaction)
        transactions.sort { $0.occurredOn > $1.occurredOn }
    }

    public func update(_ transaction: ExpenseTransaction) throws {
        guard let index = transactions.firstIndex(where: { $0.id == transaction.id }) else {
            throw VaultStoreError.missingTransaction
        }
        transactions[index] = transaction
        transactions.sort { $0.occurredOn > $1.occurredOn }
    }

    public func delete(id: UUID) throws {
        guard transactions.contains(where: { $0.id == id }) else {
            throw VaultStoreError.missingTransaction
        }
        transactions.removeAll { $0.id == id }
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

public final class PendingMutationQueue: ObservableObject {
    @Published public private(set) var pendingIDs: [UUID] {
        didSet { persist() }
    }
    private let storageKey: String

    public init(storageKey: String = "expense-tracker.pending-mutations") {
        self.storageKey = storageKey
        let stored = UserDefaults.standard.array(forKey: storageKey) as? [String] ?? []
        self.pendingIDs = stored.compactMap(UUID.init(uuidString:))
    }

    public var count: Int { pendingIDs.count }

    public func enqueue(_ id: UUID) {
        guard !pendingIDs.contains(id) else { return }
        pendingIDs.append(id)
    }

    public func acknowledge(_ ids: [UUID]) {
        pendingIDs.removeAll { ids.contains($0) }
    }

    public func restore(ids: [UUID]) {
        pendingIDs = ids
    }

    private func persist() {
        UserDefaults.standard.set(pendingIDs.map(\.uuidString), forKey: storageKey)
    }
}
