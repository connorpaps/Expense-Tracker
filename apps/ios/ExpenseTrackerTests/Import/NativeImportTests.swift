import XCTest
@testable import ExpenseTracker

final class NativeImportTests: XCTestCase {
    func testUnsupportedFileIsRejected() async {
        do {
            _ = try await NativeImportParser().parse(data: Data(), fileName: "statement.xlsx")
            XCTFail("Expected unsupported file error")
        } catch let error as NativeImportError {
            XCTAssertEqual(error, .unsupportedFile)
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func testSizeLimitIsEnforced() async {
        let limits = ParseLimits(maxFileSizeBytes: 4, maxPDFPages: 60, maxExtractedTextBytes: 1024, maxRows: 10, maxDurationSeconds: 30)
        do {
            _ = try await NativeImportParser(limits: limits).parse(data: Data(repeating: 0, count: 5), fileName: "statement.csv")
            XCTFail("Expected size error")
        } catch let error as NativeImportError {
            XCTAssertEqual(error, .tooLarge)
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }
}
