import Foundation
import XCTest
@testable import ExpenseTracker

struct ExpectedImportFixture: Decodable {
    struct ValidRow: Decodable {
        let source_row_number: Int
        let occurred_on: String
        let merchant_display: String
        let amount_minor: Int64
        let currency: String
    }
    struct ErrorRow: Decodable {
        let source_row_number: Int
        let diagnostic_codes: [String]
    }
    let fixture: String
    let file_type: String
    let profile: String
    let total_rows: Int
    let recognized_rows: Int
    let valid_rows: [ValidRow]
    let error_rows: [ErrorRow]
}

enum SharedFixtureLoader {
    static func loadExpected(named name: String, bundle: Bundle = .testBundle) throws -> ExpectedImportFixture {
        guard let url = bundle.url(forResource: name, withExtension: "json") else {
            throw NSError(domain: "ExpenseTrackerFixtures", code: 1, userInfo: [NSLocalizedDescriptionKey: "Missing fixture \(name).json"])
        }
        return try JSONDecoder().decode(ExpectedImportFixture.self, from: Data(contentsOf: url))
    }

    static func loadCSV(named name: String, bundle: Bundle = .testBundle) throws -> String {
        guard let url = bundle.url(forResource: name, withExtension: "csv") else {
            throw NSError(domain: "ExpenseTrackerFixtures", code: 2, userInfo: [NSLocalizedDescriptionKey: "Missing fixture \(name).csv"])
        }
        return try String(contentsOf: url, encoding: .utf8)
    }

    static func assertParity(_ result: NativeParseResult, expected: ExpectedImportFixture, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(result.rows.count, expected.total_rows, file: file, line: line)
        for valid in expected.valid_rows {
            let row = result.rows.first { $0.sourceRowNumber == valid.source_row_number }
            XCTAssertEqual(row?.occurredOn, valid.occurred_on, file: file, line: line)
            XCTAssertEqual(row?.merchant, valid.merchant_display, file: file, line: line)
            XCTAssertEqual(row?.amountMinor, valid.amount_minor, file: file, line: line)
            XCTAssertEqual(row?.currency, valid.currency, file: file, line: line)
        }
    }
}

private extension Bundle {
    static var testBundle: Bundle { Bundle(for: FixtureBundleMarker.self) }
}
private final class FixtureBundleMarker {}
