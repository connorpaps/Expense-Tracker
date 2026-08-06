import SwiftUI

struct TransactionsView: View {
    @ObservedObject var store: InMemoryVaultStore
    @ObservedObject var pendingQueue: PendingMutationQueue
    @State private var search = ""
    @State private var categoryFilter = ""
    @State private var showingManualEntry = false
    @State private var transactionToDelete: ExpenseTransaction?
    @State private var errorMessage: String?

    private var filteredTransactions: [ExpenseTransaction] {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        return store.transactions.filter {
            (query.isEmpty || $0.merchant.localizedCaseInsensitiveContains(query) || $0.category.localizedCaseInsensitiveContains(query)) &&
            (categoryFilter.isEmpty || $0.category == categoryFilter)
        }
    }

    var body: some View {
        List {
            if filteredTransactions.isEmpty {
                ContentUnavailableRow(search: search)
            } else {
                ForEach(filteredTransactions) { transaction in
                    NavigationLink {
                        TransactionDetailView(store: store, pendingQueue: pendingQueue, transaction: transaction)
                    } label: {
                        TransactionListRow(transaction: transaction)
                    }
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button(role: .destructive) {
                            transactionToDelete = transaction
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                    .accessibilityHint("Opens transaction details. Swipe left for delete.")
                }
            }
        }
        .searchable(text: $search, prompt: "Merchant or category")
        .safeAreaInset(edge: .top) {
            Picker("Category filter", selection: $categoryFilter) {
                Text("All categories").tag("")
                ForEach(Array(Set(store.transactions.map(\.category))).sorted(), id: \.self) { category in
                    Text(category).tag(category)
                }
            }
            .pickerStyle(.menu)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal)
            .accessibilityHint("Filter transactions by category")
        }
        .navigationTitle("Transactions")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    showingManualEntry = true
                } label: {
                    Label("Add expense", systemImage: "plus")
                }
                .accessibilityHint("Opens the manual expense form")
            }
        }
        .sheet(isPresented: $showingManualEntry) {
            NavigationStack { ManualEntryView(store: store, pendingQueue: pendingQueue) }
        }
        .confirmationDialog(
            "Delete transaction?",
            isPresented: Binding(get: { transactionToDelete != nil }, set: { if !$0 { transactionToDelete = nil } }),
            presenting: transactionToDelete
        ) { transaction in
            Button("Delete \(transaction.merchant)", role: .destructive) {
                do {
                    try store.delete(id: transaction.id)
                    pendingQueue.enqueue(PendingMutation(entityId: transaction.id, operation: "delete"))
                } catch { errorMessage = "The transaction could not be deleted." }
                transactionToDelete = nil
            }
            Button("Cancel", role: .cancel) { transactionToDelete = nil }
        } message: { _ in
            Text("This removes the local record. A deletion mutation will be queued if sync is enabled.")
        }
        .alert("Could not update transaction", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button("OK", role: .cancel) { errorMessage = nil }
        } message: { Text(errorMessage ?? "Try again.") }
    }
}

private struct TransactionListRow: View {
    let transaction: ExpenseTransaction

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "creditcard")
                .foregroundStyle(ExpenseTrackerTokens.accent)
                .frame(minWidth: 44, minHeight: 44)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(transaction.merchant).font(.body.weight(.medium))
                Text(transaction.category).font(.footnote).foregroundStyle(ExpenseTrackerTokens.secondaryText)
            }
            Spacer()
            Text(Double(transaction.amount.minorUnits) / 100, format: .currency(code: transaction.amount.currency))
                .font(.body.monospacedDigit())
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(transaction.merchant), \(transaction.category)")
        .accessibilityValue(Double(transaction.amount.minorUnits) / 100, format: .currency(code: transaction.amount.currency))
    }
}

private struct ContentUnavailableRow: View {
    let search: String
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: search.isEmpty ? "tray" : "magnifyingglass").font(.title2).accessibilityHidden(true)
            Text(search.isEmpty ? "No transactions yet" : "No matching transactions").font(.headline)
            Text(search.isEmpty ? "Add an expense or import a statement to get started." : "Try a different merchant or category.")
                .font(.subheadline).foregroundStyle(ExpenseTrackerTokens.secondaryText).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 48).listRowBackground(Color.clear)
        .accessibilityElement(children: .combine)
    }
}

private struct TransactionDetailView: View {
    @ObservedObject var store: InMemoryVaultStore
    @ObservedObject var pendingQueue: PendingMutationQueue
    let transaction: ExpenseTransaction
    @State private var showingEditor = false

    var body: some View {
        Form {
            Section("Transaction") {
                LabeledContent("Merchant", value: transaction.merchant)
                LabeledContent("Category", value: transaction.category)
                LabeledContent("Amount", value: Double(transaction.amount.minorUnits) / 100, format: .currency(code: transaction.amount.currency))
                LabeledContent("Source", value: transaction.source)
            }
            Section("Categorization") {
                Button("Correct category") { showingEditor = true }
                    .accessibilityHint("Opens the category correction form")
                Text("Current category: \(transaction.category)")
                    .font(.footnote).foregroundStyle(ExpenseTrackerTokens.secondaryText)
            }
            if let note = transaction.note, !note.isEmpty { Section("Note") { Text(note) } }
        }
        .navigationTitle("Details")
        .toolbar { ToolbarItem(placement: .navigationBarTrailing) { Button("Edit") { showingEditor = true } } }
        .sheet(isPresented: $showingEditor) { NavigationStack { ManualEntryView(store: store, pendingQueue: pendingQueue, editing: transaction) } }
    }
}
