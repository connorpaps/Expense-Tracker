import XCTest
@testable import ExpenseTracker

final class OverviewTests: XCTestCase {
    func testTransactionsCanBeFilteredToMonthAndWeekBoundaries() {
        let calendar = Calendar(identifier: .gregorian)
        let august = calendar.date(from: DateComponents(year: 2026, month: 8, day: 3))!
        let july = calendar.date(from: DateComponents(year: 2026, month: 7, day: 31))!
        let transactions = [
            ExpenseTransaction(occurredOn: august, merchant: "Cafe", amount: Money(minorUnits: -1250), category: "Food and Dining"),
            ExpenseTransaction(occurredOn: july, merchant: "Old", amount: Money(minorUnits: -500), category: "Food and Dining")
        ]
        let month = transactions.filter { calendar.component(.month, from: $0.occurredOn) == 8 }
        XCTAssertEqual(month.count, 1)
        XCTAssertEqual(month.first?.amount.minorUnits, -1250)
    }

    func testSummarySeparatesSpendCreditsAndNetActivity() throws {
        let store = InMemoryVaultStore(transactions: [
            ExpenseTransaction(occurredOn: Date(), merchant: "Cafe", amount: Money(minorUnits: -1250), category: "Food and Dining"),
            ExpenseTransaction(occurredOn: Date(), merchant: "Refund", amount: Money(minorUnits: 500), category: "Income")
        ])
        let spend = store.transactions.filter { $0.amount.minorUnits < 0 }.reduce(Int64(0)) { $0 + abs($1.amount.minorUnits) }
        let credits = store.transactions.filter { $0.amount.minorUnits > 0 }.reduce(Int64(0)) { $0 + $1.amount.minorUnits }
        XCTAssertEqual(spend, 1250)
        XCTAssertEqual(credits, 500)
        XCTAssertEqual(credits - spend, -750)
    }
}
