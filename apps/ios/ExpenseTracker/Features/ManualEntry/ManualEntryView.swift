import SwiftUI

struct ManualEntryView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: InMemoryVaultStore
    @ObservedObject var pendingQueue: PendingMutationQueue
    let editing: ExpenseTransaction?

    @State private var merchant: String
    @State private var amount: String
    @State private var category: String
    @State private var note: String
    @State private var occurredOn: Date
    @State private var validationMessage: String?
    @State private var saved = false
    @State private var rememberRule = false

    init(store: InMemoryVaultStore, pendingQueue: PendingMutationQueue, editing: ExpenseTransaction? = nil) {
        self.store = store
        self.pendingQueue = pendingQueue
        self.editing = editing
        _merchant = State(initialValue: editing?.merchant ?? "")
        _amount = State(initialValue: editing.map { String(Double($0.amount.minorUnits) / 100) } ?? "")
        _category = State(initialValue: editing?.category ?? "Other")
        _note = State(initialValue: editing?.note ?? "")
        _occurredOn = State(initialValue: editing?.occurredOn ?? Date())
    }

    var body: some View {
        Form {
            Section {
                TextField("Merchant", text: $merchant)
                    .textInputAutocapitalization(.words)
                    .accessibilityHint("Required")
                TextField("Amount", text: $amount)
                    .keyboardType(.decimalPad)
                    .accessibilityHint("Enter dollars and cents. Required")
                DatePicker("Date", selection: $occurredOn, displayedComponents: .date)
                TextField("Category", text: $category)
                    .accessibilityHint("Required")
                if editing != nil {
                    Toggle("Remember this merchant's category", isOn: $rememberRule)
                        .accessibilityHint("Applies this correction to future imports")
                }
                TextField("Note", text: $note, axis: .vertical)
                    .lineLimit(3...6)
            } header: {
                Text(editing == nil ? "New expense" : "Edit expense")
            } footer: {
                if let validationMessage {
                    Text(validationMessage)
                        .foregroundStyle(ExpenseTrackerTokens.destructive)
                        .accessibilityLabel("Error: \(validationMessage)")
                }
            }

            if saved {
                Section {
                    Label("Saved locally", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(ExpenseTrackerTokens.positive)
                }
                .accessibilityElement(children: .combine)
            }
        }
        .navigationTitle(editing == nil ? "Add expense" : "Edit expense")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Save") { save() }
                    .fontWeight(.semibold)
            }
        }
    }

    private func save() {
        validationMessage = nil
        let cleanMerchant = merchant.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanMerchant.isEmpty else {
            validationMessage = "Enter a merchant."
            return
        }
        guard let dollars = Double(amount), dollars.isFinite, dollars != 0 else {
            validationMessage = "Enter a non-zero amount."
            return
        }
        let cleanCategory = category.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCategory.isEmpty else {
            validationMessage = "Enter a category."
            return
        }
        let transaction = ExpenseTransaction(
            id: editing?.id ?? UUID(),
            occurredOn: occurredOn,
            merchant: cleanMerchant,
            amount: Money(minorUnits: Int64((dollars * 100).rounded())),
            category: cleanCategory,
            note: note.isEmpty ? nil : note,
            source: editing?.source ?? "manual"
        )
        do {
            if editing == nil { try store.insert(transaction) } else { try store.update(transaction) }
            // The native queue currently persists non-sensitive metadata only;
            // US6 will connect this correction to encrypted mutation envelopes.
            if editing != nil && rememberRule && editing?.category != cleanCategory {
                pendingQueue.enqueue(PendingMutation(entityId: transaction.id, operation: "category-correction"))
            }
            pendingQueue.enqueue(PendingMutation(
                entityId: transaction.id,
                operation: editing == nil ? "create" : "update"
            ))
            saved = true
            dismiss()
        } catch {
            validationMessage = "The expense could not be saved locally."
        }
    }
}
