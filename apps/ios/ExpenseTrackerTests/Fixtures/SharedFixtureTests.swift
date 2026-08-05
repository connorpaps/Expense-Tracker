import XCTest
@testable import ExpenseTracker

final class SharedFixtureTests: XCTestCase {
    func testBundledFixtureLoaderReadsExpectedAndCSVResources() throws {
        let expected = try SharedFixtureLoader.loadExpected(named: "amex")
        let csv = try SharedFixtureLoader.loadCSV(named: "amex")
        XCTAssertEqual(expected.fixture, "amex.csv")
        XCTAssertTrue(csv.contains("STARBUCKS"))
    }

    func testExpectedFixtureLoaderDecodesGoldenShape() throws {
        let json = """
        {
          "fixture": "inline.csv",
          "file_type": "csv",
          "profile": "unknown",
          "total_rows": 1,
          "recognized_rows": 1,
          "valid_rows": [{"source_row_number": 1, "occurred_on": "2026-07-01", "merchant_display": "Coffee", "amount_minor": -650, "currency": "USD"}],
          "error_rows": []
        }
        """
        let fixture = try JSONDecoder().decode(ExpectedImportFixture.self, from: Data(json.utf8))
        XCTAssertEqual(fixture.valid_rows.first?.amount_minor, -650)
        XCTAssertEqual(fixture.total_rows, fixture.recognized_rows)
    }

    func testNativeCSVParserNormalizesAndKeepsInvalidRowsPending() async throws {
        let csv = "Date,Description,Amount\n07/01/2026,STARBUCKS #0001,-6.50\nnot-a-date,,bad\n"
        let result = try await NativeImportParser().parse(data: Data(csv.utf8), fileName: "statement.csv")
        XCTAssertEqual(result.rows.count, 2)
        XCTAssertEqual(result.rows[0].merchant, "Starbucks")
        XCTAssertEqual(result.rows[0].amountMinor, -650)
        XCTAssertEqual(result.rows[0].decision, .accept)
        XCTAssertEqual(result.rows[1].decision, .pending)
    }

    func testNativeParserCancellationStopsWork() async {
        let token = { true }
        do {
            _ = try await NativeImportParser().parse(data: Data("Date,Description,Amount\n".utf8), fileName: "statement.csv", isCancelled: token)
            XCTFail("Expected cancellation")
        } catch let error as NativeImportError {
            XCTAssertEqual(error, .cancelled)
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }
}
