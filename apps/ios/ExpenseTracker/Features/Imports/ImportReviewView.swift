import SwiftUI
import UniformTypeIdentifiers

struct ImportReviewView: View {
    @ObservedObject var store: InMemoryVaultStore
    @ObservedObject var pendingQueue: PendingMutationQueue
    @State private var rows: [ImportRowReview] = []
    @State private var showingFilePicker = false
    @State private var isParsing = false
    @State private var parseTask: Task<Void, Never>?
    @State private var message: String?

    var body: some View {
        Group {
            if isParsing {
                ProgressView("Parsing statement…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .accessibilityLabel("Parsing statement")
            } else if rows.isEmpty {
                ImportEmptyState { showingFilePicker = true }
            } else {
                reviewList
            }
        }
        .navigationTitle("Import")
        .fileImporter(
            isPresented: $showingFilePicker,
            allowedContentTypes: [.commaSeparatedText, .pdf],
            allowsMultipleSelection: false
        ) { result in
            switch result {
            case .success(let urls):
                guard let url = urls.first else { return }
                beginParsing(url: url)
            case .failure:
                message = "The statement could not be selected."
            }
        }
        .alert("Import status", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
            Button("OK", role: .cancel) { message = nil }
        } message: {
            Text(message ?? "")
        }
        .onDisappear {
            parseTask?.cancel()
        }
    }

    private var reviewList: some View {
        List {
            Section {
                Text("Only accepted rows are committed. Errors and pending rows stay out of your vault.")
                    .font(.subheadline)
                    .foregroundStyle(ExpenseTrackerTokens.secondaryText)
            }
            ForEach($rows) { $row in
                ImportRowCell(row: $row)
            }
            Section {
                Button("Commit accepted rows") { commitAcceptedRows() }
                    .disabled(rows.contains { $0.decision == .pending })
                    .frame(minHeight: 44)
                    .accessibilityHint("Commits accepted rows and leaves unresolved rows untouched")
                Button("Cancel import", role: .cancel) {
                    rows.removeAll()
                    message = "Import cancelled. No rows were saved."
                }
                .frame(minHeight: 44)
            }
        }
    }

    private func beginParsing(url: URL) {
        parseTask?.cancel()
        isParsing = true
        rows = []
        parseTask = Task {
            do {
                let accessed = url.startAccessingSecurityScopedResource()
                defer { if accessed { url.stopAccessingSecurityScopedResource() } }
                let data = try Data(contentsOf: url)
                let result = try await NativeImportParser().parse(data: data, fileName: url.lastPathComponent) {
                    Task.isCancelled
                }
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    rows = result.rows
                    isParsing = false
                    if rows.isEmpty { message = "No supported transaction rows were found." }
                }
            } catch is CancellationError {
                await MainActor.run { isParsing = false }
            } catch NativeImportError.cancelled {
                await MainActor.run { isParsing = false }
            } catch {
                await MainActor.run {
                    isParsing = false
                    message = "This statement could not be parsed. No rows were saved."
                }
            }
        }
    }

    private func commitAcceptedRows() {
        let accepted = rows.filter { $0.decision == .accept }
        do {
            let transactions = accepted.compactMap { row -> ExpenseTransaction? in
                guard let dateText = row.occurredOn, let date = Self.date(from: dateText), let amount = row.amountMinor, let merchant = row.merchant else { return nil }
                return ExpenseTransaction(
                    occurredOn: date,
                    merchant: merchant,
                    amount: Money(minorUnits: amount, currency: row.currency ?? "USD"),
                    category: row.category ?? "Other",
                    source: "import"
                )
            }
            try store.insert(transactions)
            transactions.forEach { pendingQueue.enqueue($0.id) }
            rows.removeAll()
            message = "\(transactions.count) row(s) saved locally and waiting to sync."
        } catch {
            message = "The import could not be saved. No additional rows were committed."
        }
    }

    private static func date(from value: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: value)
    }
}

private struct ImportRowCell: View {
    @Binding var row: ImportRowReview

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text(row.merchant ?? "Needs review")
                        .font(.body.weight(.medium))
                    Text(row.occurredOn ?? "Date unavailable")
                        .font(.footnote)
                        .foregroundStyle(ExpenseTrackerTokens.secondaryText)
                }
                Spacer()
                if let amount = row.amountMinor {
                    Text(Double(amount) / 100, format: .currency(code: row.currency ?? "USD"))
                        .font(.body.monospacedDigit())
                }
            }
            if !row.diagnostics.isEmpty {
                Label(row.diagnostics.map(\.message).joined(separator: "; "), systemImage: "exclamationmark.triangle")
                    .font(.footnote)
                    .foregroundStyle(ExpenseTrackerTokens.warning)
            }
            Picker("Decision", selection: $row.decision) {
                Text("Accept").tag(ImportRowReview.Decision.accept)
                Text("Exclude").tag(ImportRowReview.Decision.exclude)
                Text("Pending").tag(ImportRowReview.Decision.pending)
            }
            .pickerStyle(.segmented)
            .accessibilityLabel("Decision for \(row.merchant ?? "row \(row.sourceRowNumber)")")
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .contain)
    }
}

private struct ImportEmptyState: View {
    let choose: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "arrow.down.doc")
                .font(.largeTitle)
                .foregroundStyle(ExpenseTrackerTokens.accent)
                .accessibilityHidden(true)
            Text("Review import")
                .font(.title2.weight(.semibold))
            Text("Choose a CSV or text-based PDF. Files are parsed on this device and remain private until you commit rows.")
                .multilineTextAlignment(.center)
                .foregroundStyle(ExpenseTrackerTokens.secondaryText)
            Button("Choose a statement", action: choose)
                .buttonStyle(.borderedProminent)
                .frame(minHeight: 44)
                .accessibilityHint("Opens the local file picker")
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(ExpenseTrackerTokens.background)
        .accessibilityElement(children: .contain)
    }
}
