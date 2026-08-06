import Foundation

public struct Money: Equatable, Codable, Sendable {
    public let minorUnits: Int64
    public let currency: String

    public init(minorUnits: Int64, currency: String = "USD") {
        self.minorUnits = minorUnits
        self.currency = currency
    }
}

public struct PersonalCategoryRule: Identifiable, Equatable, Codable, Sendable {
    public let id: UUID
    public var matcher: String
    public var category: String
    public var evidenceCount: Int
    public var isActive: Bool

    public init(id: UUID = UUID(), matcher: String, category: String, evidenceCount: Int = 1, isActive: Bool = true) {
        self.id = id
        self.matcher = matcher
        self.category = category
        self.evidenceCount = evidenceCount
        self.isActive = isActive
    }
}

public struct ExpenseTransaction: Identifiable, Equatable, Codable, Sendable {
    public let id: UUID
    public var occurredOn: Date
    public var merchant: String
    public var amount: Money
    public var category: String
    public var note: String?
    public var source: String
    public var reviewState: String

    public init(
        id: UUID = UUID(),
        occurredOn: Date,
        merchant: String,
        amount: Money,
        category: String,
        note: String? = nil,
        source: String = "manual",
        reviewState: String = "confirmed"
    ) {
        self.id = id
        self.occurredOn = occurredOn
        self.merchant = merchant
        self.amount = amount
        self.category = category
        self.note = note
        self.source = source
        self.reviewState = reviewState
    }
}

public struct Summary: Equatable, Sendable {
    public let totalSpent: Money
    public let credits: Money
    public let netActivity: Money
    public let transactionCount: Int

    public init(totalSpent: Money, credits: Money, netActivity: Money, transactionCount: Int) {
        self.totalSpent = totalSpent
        self.credits = credits
        self.netActivity = netActivity
        self.transactionCount = transactionCount
    }
}

public struct ImportRowReview: Identifiable, Equatable, Codable, Sendable {
    public let id: UUID
    public let sourceRowNumber: Int
    public var occurredOn: String?
    public var merchant: String?
    public var amountMinor: Int64?
    public var currency: String?
    public var category: String?
    public var status: Status
    public var diagnostics: [Diagnostic]
    public var decision: Decision

    public enum Status: String, Codable, Sendable {
        case valid
        case warning
        case error
        case duplicateCandidate = "duplicate_candidate"
    }

    public enum Decision: String, Codable, Sendable {
        case accept
        case exclude
        case pending
    }

    public struct Diagnostic: Equatable, Codable, Sendable {
        public let code: String
        public let message: String
        public let severity: String
    }

    public init(
        id: UUID = UUID(),
        sourceRowNumber: Int,
        occurredOn: String?,
        merchant: String?,
        amountMinor: Int64?,
        currency: String?,
        category: String?,
        status: Status,
        diagnostics: [Diagnostic] = [],
        decision: Decision = .accept
    ) {
        self.id = id
        self.sourceRowNumber = sourceRowNumber
        self.occurredOn = occurredOn
        self.merchant = merchant
        self.amountMinor = amountMinor
        self.currency = currency
        self.category = category
        self.status = status
        self.diagnostics = diagnostics
        self.decision = decision
    }
}

public struct ParseLimits: Equatable, Sendable {
    public let maxFileSizeBytes: Int
    public let maxPDFPages: Int
    public let maxExtractedTextBytes: Int
    public let maxRows: Int
    public let maxDurationSeconds: TimeInterval

    public static let `default` = ParseLimits(
        maxFileSizeBytes: 10 * 1024 * 1024,
        maxPDFPages: 60,
        maxExtractedTextBytes: 5 * 1024 * 1024,
        maxRows: 50_000,
        maxDurationSeconds: 30
    )
}

public enum SyncState: Equatable, Sendable {
    case savedLocal
    case waitingToSync(pendingCount: Int)
    case syncing
    case synced
    case disconnected
    case conflict
}

public protocol LocalVaultStore: AnyObject {
    var transactions: [ExpenseTransaction] { get }
    func insert(_ transaction: ExpenseTransaction) throws
    func insert(_ transactions: [ExpenseTransaction]) throws
    func update(_ transaction: ExpenseTransaction) throws
    func delete(id: UUID) throws
}

public enum VaultStoreError: Error, Equatable {
    case invalidMerchant
    case invalidAmount
    case duplicateID
    case missingTransaction
}
